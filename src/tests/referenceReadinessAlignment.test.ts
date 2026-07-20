import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import {
  buildCampaignSimulationReadiness,
  buildPopulationCalculationReferences,
  createCampaignSimulationReadinessPortsFromServices,
} from "../application/campaignSimulation";
import { computeReferenceCompleteness } from "../domain/compensationReference/completeness";
import type { CompensationReferenceSet } from "../domain/compensationReference/models";
import { createMemoryAppServices } from "../services/createAppServices";

const FR_HEADERS = [
  "Matricule",
  "Nom complet",
  "Famille",
  "Grade",
  "Type de contrat",
  "Statut d’emploi",
  "Date d’embauche",
  "Salaire de base décembre",
  "9-Box",
  "Sous-performant confirmé",
  "Montant promotion",
  "Montant correction",
  "Mesure sociale",
];

function toArrayBuffer(data: Uint8Array | number[] | ArrayBuffer): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  const bytes = data instanceof Uint8Array ? data : Uint8Array.from(data);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function sheetToBuffer(rows: unknown[][], fileName: string) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Population");
  const arrayBuffer = toArrayBuffer(
    XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as Uint8Array,
  );
  return {
    arrayBuffer,
    fileName,
    fileSizeBytes: arrayBuffer.byteLength,
  };
}

function validRow(
  overrides: Partial<Record<string, string | number>> = {},
): (string | number)[] {
  return [
    overrides.matricule ?? "EMP-0001",
    overrides.nom ?? "Salarié Démo 1",
    overrides.famille ?? "F1",
    overrides.grade ?? "G1",
    overrides.contrat ?? "CDI",
    overrides.statut ?? "Actif",
    overrides.date ?? "2020-01-15",
    overrides.salaire ?? 450_000,
    overrides.nineBox ?? 5,
    overrides.under ?? "non",
    overrides.promo ?? 0,
    overrides.corr ?? 0,
    overrides.social ?? 0,
  ];
}

async function fillAllS0(
  services: ReturnType<typeof createMemoryAppServices>,
  campaignId: number,
) {
  const set = await services.compensationReference.getReferenceSet(campaignId);
  await services.compensationReference.updateSalaryGrid(
    campaignId,
    set.salaryGrid.map((cell) => ({
      jobFamilyId: cell.jobFamilyId,
      gradeId: cell.gradeId,
      s0Amount: 1_000_000,
    })),
  );
}

async function importTwoEmployees(
  services: ReturnType<typeof createMemoryAppServices>,
  campaignId: number,
) {
  const file = sheetToBuffer(
    [
      FR_HEADERS,
      validRow({ matricule: "A" }),
      validRow({ matricule: "B", famille: "F2" }),
    ],
    "pop.xlsx",
  );
  const parsed = await services.hrImport.parseFile(file);
  const mapping = services.hrImport.buildAutoMapping(FR_HEADERS);
  await services.hrImport.confirmImport({
    campaignId,
    fileName: parsed.fileName,
    format: parsed.format,
    sheetName: parsed.sheets[0].name,
    fileSizeBytes: file.fileSizeBytes,
    rows: parsed.sheets[0].rows,
    headerRowIndex: 0,
    mapping,
  });
}

describe("alignement complétude Référentiels ↔ Simulation", () => {
  it("performance_only complet → referenceReadiness prêt (aligné Référentiels)", async () => {
    const services = createMemoryAppServices();
    const campaign = await services.campaign.createCampaign({
      name: "Simulation 2027",
      referenceYear: 2027,
      notes: "",
    });
    await fillAllS0(services, campaign.id);
    await services.compensationReference.updateNineBoxMode(
      campaign.id,
      "performance_only",
    );
    await importTwoEmployees(services, campaign.id);
    await services.campaign.activateCampaign(campaign.id);

    const set = await services.compensationReference.getReferenceSet(campaign.id);
    const completeness = computeReferenceCompleteness(set);
    const built = buildPopulationCalculationReferences(set);

    expect(set.jobFamilies).toHaveLength(5);
    expect(set.grades).toHaveLength(6);
    expect(set.salaryGrid).toHaveLength(30);
    expect(set.salaryPositions).toHaveLength(17);
    expect(set.performanceFactors).toHaveLength(3);
    expect(completeness.ready).toBe(true);
    expect(completeness.performanceStatus).toBe("complete");
    expect(completeness.potentialStatus).toBe("not_required");
    expect(completeness.nineBoxStatus).toBe("not_required");
    expect(built.references).not.toBeNull();
    expect(built.editorialReady).toBe(true);

    const report = await buildCampaignSimulationReadiness(
      {
        campaignId: campaign.id,
        budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 25_000_003n },
        roundingPolicy: { mode: "nearest_half_up", stepFcfa: 100n },
      },
      createCampaignSimulationReadinessPortsFromServices(services),
    );
    expect(report.referenceReadiness.isReady).toBe(true);
    expect(report.populationReadiness.isReady).toBe(true);
    expect(report.isReady).toBe(true);
  });

  it("Potentiel / 9-Box absents en performance_only → non bloquant", async () => {
    const services = createMemoryAppServices();
    const campaign = await services.campaign.createCampaign({
      name: "Perf only sans pot",
      referenceYear: 2027,
      notes: "",
    });
    await fillAllS0(services, campaign.id);
    await services.compensationReference.updateNineBoxMode(
      campaign.id,
      "performance_only",
    );
    const set = await services.compensationReference.getReferenceSet(campaign.id);
    const mutated: CompensationReferenceSet = {
      ...set,
      potentialFactors: [],
      nineBoxFactors: set.nineBoxFactors, // présents mais non exigés
    };
    // Même sans potentiel, build doit rester OK si perf + structure OK
    // (les facteurs 9-Box seed restent pour le mapping salarié).
    const built = buildPopulationCalculationReferences({
      ...mutated,
      potentialFactors: [],
    });
    expect(computeReferenceCompleteness(mutated).ready).toBe(true);
    expect(built.references).not.toBeNull();
    expect(
      built.issues.some((issue) => issue.field === "potentialFactors"),
    ).toBe(false);
  });

  it("facteur Performance manquant → FACTOR_NOT_FOUND", async () => {
    const services = createMemoryAppServices();
    const campaign = await services.campaign.createCampaign({
      name: "Perf manquante",
      referenceYear: 2027,
      notes: "",
    });
    await fillAllS0(services, campaign.id);
    await services.compensationReference.updateNineBoxMode(
      campaign.id,
      "performance_only",
    );
    const set = await services.compensationReference.getReferenceSet(campaign.id);
    const mutated: CompensationReferenceSet = {
      ...set,
      performanceFactors: set.performanceFactors.filter(
        (factor) => factor.level !== "high",
      ),
    };
    const built = buildPopulationCalculationReferences(mutated);
    expect(built.references).toBeNull();
    expect(built.issues.some((issue) => issue.code === "FACTOR_NOT_FOUND")).toBe(
      true,
    );
    expect(computeReferenceCompleteness(mutated).ready).toBe(false);
  });

  it("cellule S0 manquante → S0_REFERENCE_NOT_FOUND", async () => {
    const services = createMemoryAppServices();
    const campaign = await services.campaign.createCampaign({
      name: "S0 manquant",
      referenceYear: 2027,
      notes: "",
    });
    await services.compensationReference.updateNineBoxMode(
      campaign.id,
      "performance_only",
    );
    const set = await services.compensationReference.getReferenceSet(campaign.id);
    const built = buildPopulationCalculationReferences(set);
    expect(built.references).toBeNull();
    expect(
      built.issues.some((issue) => issue.code === "S0_REFERENCE_NOT_FOUND"),
    ).toBe(true);
  });

  it("full_nine_box exige les neuf couples sémantiques", async () => {
    const services = createMemoryAppServices();
    const campaign = await services.campaign.createCampaign({
      name: "9box",
      referenceYear: 2027,
      notes: "",
    });
    await fillAllS0(services, campaign.id);
    await services.compensationReference.updateNineBoxMode(
      campaign.id,
      "full_nine_box",
    );
    const set = await services.compensationReference.getReferenceSet(campaign.id);
    const mutated: CompensationReferenceSet = {
      ...set,
      nineBoxFactors: set.nineBoxFactors.slice(0, 8),
    };
    const built = buildPopulationCalculationReferences(mutated);
    expect(built.references).toBeNull();
    expect(built.issues.some((issue) => issue.code === "FACTOR_NOT_FOUND")).toBe(
      true,
    );
  });

  it("performance_potential exige Performance et Potentiel", async () => {
    const services = createMemoryAppServices();
    const campaign = await services.campaign.createCampaign({
      name: "Perf pot",
      referenceYear: 2027,
      notes: "",
    });
    await fillAllS0(services, campaign.id);
    await services.compensationReference.updateNineBoxMode(
      campaign.id,
      "performance_potential",
    );
    const set = await services.compensationReference.getReferenceSet(campaign.id);
    expect(buildPopulationCalculationReferences(set).references).not.toBeNull();

    const withoutPot: CompensationReferenceSet = {
      ...set,
      potentialFactors: [],
    };
    const built = buildPopulationCalculationReferences(withoutPot);
    expect(built.references).toBeNull();
    expect(built.issues.some((issue) => issue.code === "FACTOR_NOT_FOUND")).toBe(
      true,
    );
  });

  it("recharge le readiness après changement de référentiels (pas de cache obsolète)", async () => {
    const services = createMemoryAppServices();
    const campaign = await services.campaign.createCampaign({
      name: "Refresh",
      referenceYear: 2027,
      notes: "",
    });
    await services.compensationReference.updateNineBoxMode(
      campaign.id,
      "performance_only",
    );
    const ports = createCampaignSimulationReadinessPortsFromServices(services);

    const before = await buildCampaignSimulationReadiness(
      {
        campaignId: campaign.id,
        budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 1 },
        roundingPolicy: { mode: "nearest_half_up", stepFcfa: 1 },
      },
      ports,
    );
    expect(before.referenceReadiness.isReady).toBe(false);

    await fillAllS0(services, campaign.id);
    const after = await buildCampaignSimulationReadiness(
      {
        campaignId: campaign.id,
        budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 1 },
        roundingPolicy: { mode: "nearest_half_up", stepFcfa: 1 },
      },
      ports,
    );
    expect(after.referenceReadiness.isReady).toBe(true);
  });

  it("conserve les sous-issues détaillées sous INCOMPLETE", async () => {
    const services = createMemoryAppServices();
    const campaign = await services.campaign.createCampaign({
      name: "Détails",
      referenceYear: 2027,
      notes: "",
    });
    await services.compensationReference.updateNineBoxMode(
      campaign.id,
      "performance_only",
    );
    const set = await services.compensationReference.getReferenceSet(campaign.id);
    const built = buildPopulationCalculationReferences(set);
    expect(built.issues.length).toBeGreaterThan(0);
    expect(
      built.issues.every((issue) => typeof issue.message === "string"),
    ).toBe(true);
    expect(
      built.issues.some(
        (issue) =>
          issue.code === "S0_REFERENCE_NOT_FOUND" ||
          issue.code === "FACTOR_NOT_FOUND" ||
          issue.code === "INCOMPLETE_COMPENSATION_REFERENCES",
      ),
    ).toBe(true);
  });

  it("journalise en DEV sans salaires salariés", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const prev = import.meta.env.DEV;
    Object.defineProperty(import.meta, "env", {
      value: { ...import.meta.env, DEV: true },
      configurable: true,
    });
    const services = createMemoryAppServices();
    const campaign = await services.campaign.createCampaign({
      name: "Log",
      referenceYear: 2027,
      notes: "",
    });
    await services.compensationReference.updateNineBoxMode(
      campaign.id,
      "performance_only",
    );
    await buildCampaignSimulationReadiness(
      { campaignId: campaign.id },
      createCampaignSimulationReadinessPortsFromServices(services),
    );
    expect(spy).toHaveBeenCalled();
    const payload = JSON.stringify(spy.mock.calls);
    expect(payload).toContain("SIMULATION_REFERENCE_READINESS_FAILED");
    expect(payload).not.toMatch(/decemberBaseSalary|450000/);
    spy.mockRestore();
    Object.defineProperty(import.meta, "env", {
      value: { ...import.meta.env, DEV: prev },
      configurable: true,
    });
  });
});
