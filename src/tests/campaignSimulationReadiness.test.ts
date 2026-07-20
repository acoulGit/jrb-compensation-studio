import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  buildCampaignSimulationReadiness,
  buildPopulationCalculationReferences,
  createCampaignSimulationReadinessPortsFromServices,
  mapImportedEmployeeToPreparedInput,
  normalizeFactorLevel,
  normalizePerformanceLevel,
  sortPreparedEmployees,
} from "../application/campaignSimulation";
import type {
  CampaignSimulationReadinessPorts,
} from "../application/campaignSimulation";
import type { EmployeeMappingContext } from "../application/campaignSimulation";
import type { PreparedEmployeeCalculationInput } from "../domain/compensationCalculation";
import type {
  CompensationReferenceSet,
  Grade,
  JobFamily,
  NineBoxFactor,
} from "../domain/compensationReference/models";
import type {
  EmployeeSnapshot,
  HrImportBatch,
} from "../domain/hrImport/models";
import { createMemoryAppServices } from "../services/createAppServices";

const TODAY = "2026-07-19";

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
  amount = 1_000_000,
) {
  const set = await services.compensationReference.getReferenceSet(campaignId);
  await services.compensationReference.updateSalaryGrid(
    campaignId,
    set.salaryGrid.map((cell) => ({
      jobFamilyId: cell.jobFamilyId,
      gradeId: cell.gradeId,
      s0Amount: amount,
    })),
  );
}

async function importPopulation(
  services: ReturnType<typeof createMemoryAppServices>,
  campaignId: number,
  dataRows: (string | number)[][],
  fileName = "pop.xlsx",
) {
  const file = sheetToBuffer([FR_HEADERS, ...dataRows], fileName);
  const parsed = await services.hrImport.parseFile(file);
  const mapping = services.hrImport.buildAutoMapping(FR_HEADERS);
  return services.hrImport.confirmImport({
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

function snapshot(
  overrides: Partial<EmployeeSnapshot> = {},
): EmployeeSnapshot {
  return {
    id: 1,
    importBatchId: 1,
    campaignId: 1,
    employeeNumber: "E-001",
    employeeLabel: "Test",
    jobFamilyId: 1,
    gradeId: 1,
    contractType: "cdi",
    employmentStatus: "active",
    hireDate: "2020-01-01",
    decemberBaseSalary: 1_000_000,
    nineBoxCode: 5,
    confirmedUnderperformer: false,
    promotionAmount: 0,
    correctionAmount: 0,
    socialMeasureAmount: 0,
    sourceRowNumber: 2,
    createdAt: TODAY,
    ...overrides,
  };
}

function family(id = 1, code = "F1"): JobFamily {
  return {
    id,
    campaignId: 1,
    code,
    label: `Famille ${code}`,
    sortOrder: id,
    createdAt: TODAY,
    updatedAt: TODAY,
  };
}

function grade(id = 1, code = "G1"): Grade {
  return {
    id,
    campaignId: 1,
    code,
    label: `Grade ${code}`,
    sortOrder: id,
    createdAt: TODAY,
    updatedAt: TODAY,
  };
}

function nineBox(
  boxCode: number,
  performanceLevel: string,
  potentialLevel: string,
): NineBoxFactor {
  return {
    campaignId: 1,
    boxCode,
    performanceLevel: performanceLevel as NineBoxFactor["performanceLevel"],
    potentialLevel: potentialLevel as NineBoxFactor["potentialLevel"],
    factorMilli: 1000,
    createdAt: TODAY,
    updatedAt: TODAY,
  };
}

function mappingContext(
  overrides: Partial<EmployeeMappingContext> = {},
): EmployeeMappingContext {
  return {
    evaluationMode: "full_nine_box",
    familiesById: new Map([[1, family()]]),
    gradesById: new Map([[1, grade()]]),
    nineBoxFactorsByCode: new Map([
      [5, nineBox(5, "medium", "medium")],
    ]),
    ...overrides,
  };
}

function fakeBatch(overrides: Partial<HrImportBatch> = {}): HrImportBatch {
  return {
    id: 10,
    campaignId: 1,
    status: "current",
    sourceFileName: "pop.xlsx",
    sourceFormat: "xlsx",
    sourceSheetName: "Population",
    fileSizeBytes: 100,
    sourceRowCount: 1,
    importedRowCount: 1,
    warningCount: 0,
    importedAt: TODAY,
    createdAt: TODAY,
    ...overrides,
  };
}

describe("Lot 2B-1 — normalisation des niveaux", () => {
  it("normalise les alias canoniques et refuse les inconnus", () => {
    expect(normalizeFactorLevel("low")).toBe("low");
    expect(normalizePerformanceLevel("Élevée")).toBe("high");
    expect(normalizeFactorLevel("moyen")).toBe("medium");
    expect(normalizeFactorLevel("inconnu")).toBeNull();
    expect(normalizeFactorLevel("")).toBeNull();
  });
});

describe("Lot 2B-1 — mapping salarié", () => {
  it("mappe un salarié valide sans mutation", () => {
    const employee = snapshot();
    const clone = structuredClone(employee);
    const result = mapImportedEmployeeToPreparedInput(
      employee,
      mappingContext(),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prepared).toEqual({
        employeeId: "E-001",
        familyCode: "F1",
        gradeCode: "G1",
        salaryFcfa: 1_000_000,
        hireDate: "2020-01-01",
        performanceLevel: "medium",
        potentialLevel: "medium",
        confirmedUnderperformer: false,
      });
    }
    expect(employee).toEqual(clone);
  });

  it("signale employeeId vide, famille/grade absents, salaire invalide", () => {
    const result = mapImportedEmployeeToPreparedInput(
      snapshot({
        employeeNumber: " ",
        jobFamilyId: 99,
        gradeId: 99,
        decemberBaseSalary: 0,
        nineBoxCode: null,
        confirmedUnderperformer: undefined as unknown as boolean,
      }),
      mappingContext({ evaluationMode: "performance_potential" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const codes = result.issues.map((i) => i.code);
      expect(codes).toContain("EMPLOYEE_MAPPING_FAILED");
      expect(codes).toContain("UNKNOWN_FAMILY");
      expect(codes).toContain("UNKNOWN_GRADE");
      expect(codes).toContain("INVALID_EMPLOYEE_SALARY");
      expect(codes).toContain("MISSING_EMPLOYEE_PERFORMANCE");
      expect(codes).toContain("MISSING_EMPLOYEE_POTENTIAL");
      expect(codes).toContain("MISSING_CONFIRMED_UNDERPERFORMER");
    }
  });

  it("signale un niveau de facteur non canonique", () => {
    const result = mapImportedEmployeeToPreparedInput(
      snapshot(),
      mappingContext({
        nineBoxFactorsByCode: new Map([
          [5, nineBox(5, "super", "medium")],
        ]),
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.code === "UNKNOWN_FACTOR_LEVEL")).toBe(
        true,
      );
    }
  });

  it("omet Performance/Potentiel en mode none", () => {
    const result = mapImportedEmployeeToPreparedInput(
      snapshot({ nineBoxCode: null }),
      mappingContext({ evaluationMode: "none" }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.prepared.performanceLevel).toBeUndefined();
      expect(result.prepared.potentialLevel).toBeUndefined();
    }
  });

  it("trie les salariés préparés par employeeId", () => {
    const sorted = sortPreparedEmployees([
      {
        employeeId: "Z",
        familyCode: "F1",
        gradeCode: "G1",
        salaryFcfa: 1,
        hireDate: "2020-07-15",
        confirmedUnderperformer: false,
      },
      {
        employeeId: "A",
        familyCode: "F1",
        gradeCode: "G1",
        salaryFcfa: 1,
        hireDate: "2020-07-15",
        confirmedUnderperformer: false,
      },
    ] satisfies PreparedEmployeeCalculationInput[]);
    expect(sorted.map((e) => e.employeeId)).toEqual(["A", "Z"]);
  });
});

describe("Lot 2B-1 — référentiels moteur", () => {
  it("détecte une cellule S0 dupliquée", async () => {
    const services = createMemoryAppServices();
    const campaign = await services.campaign.createCampaign({
      name: "Dup S0",
      referenceYear: 2026,
      notes: "",
    });
    await fillAllS0(services, campaign.id);
    const set = await services.compensationReference.getReferenceSet(
      campaign.id,
    );
    const first = set.salaryGrid[0];
    const mutated: CompensationReferenceSet = {
      ...set,
      salaryGrid: [...set.salaryGrid, { ...first }],
    };
    const built = buildPopulationCalculationReferences(mutated);
    expect(built.references).toBeNull();
    expect(
      built.issues.some((i) => i.code === "DUPLICATE_S0_REFERENCE"),
    ).toBe(true);
  });

  it("détecte un couple 9-Box dupliqué en mode full_nine_box", async () => {
    const services = createMemoryAppServices();
    const campaign = await services.campaign.createCampaign({
      name: "Dup 9box",
      referenceYear: 2026,
      notes: "",
    });
    await fillAllS0(services, campaign.id);
    await services.compensationReference.updateNineBoxMode(
      campaign.id,
      "full_nine_box",
    );
    const set = await services.compensationReference.getReferenceSet(
      campaign.id,
    );
    const first = set.nineBoxFactors[0];
    const mutated: CompensationReferenceSet = {
      ...set,
      nineBoxFactors: [
        ...set.nineBoxFactors,
        { ...first, boxCode: 99 },
      ],
    };
    const built = buildPopulationCalculationReferences(mutated);
    expect(built.references).toBeNull();
    expect(
      built.issues.some((i) =>
        i.message.includes("Couple 9-Box dupliqué"),
      ),
    ).toBe(true);
  });
});

describe("Lot 2B-1 — readiness campagne", () => {
  it("refuse campagne inexistante", async () => {
    const ports: CampaignSimulationReadinessPorts = {
      getCampaign: async () => null,
      getReferenceSet: async () => {
        throw new Error("ne doit pas être appelé");
      },
      getCompleteness: async () => {
        throw new Error("ne doit pas être appelé");
      },
      getCurrentBatch: async () => null,
      listCurrentPopulation: async () => ({
        items: [],
        total: 0,
        limit: 200,
        offset: 0,
      }),
    };
    const report = await buildCampaignSimulationReadiness(
      { campaignId: 999 },
      ports,
    );
    expect(report.isReady).toBe(false);
    expect(report.issues.some((i) => i.code === "CAMPAIGN_NOT_FOUND")).toBe(
      true,
    );
  });

  it("refuse campagne archivée sans mutation", async () => {
    const services = createMemoryAppServices();
    const ports = createCampaignSimulationReadinessPortsFromServices(services);
    const campaign = await services.campaign.createCampaign({
      name: "Archivée",
      referenceYear: 2026,
      notes: "",
    });
    await fillAllS0(services, campaign.id);
    await services.compensationReference.updateNineBoxMode(campaign.id, "none");
    await importPopulation(services, campaign.id, [validRow()]);
    await services.campaign.archiveCampaign(campaign.id);
    const before = structuredClone(
      await services.campaign.getCampaign(campaign.id),
    );
    const report = await buildCampaignSimulationReadiness(
      {
        campaignId: campaign.id,
        budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 1000 },
        roundingPolicy: { mode: "nearest_half_up", stepFcfa: 5 },
      },
      ports,
    );
    expect(report.issues.some((i) => i.code === "CAMPAIGN_ARCHIVED")).toBe(
      true,
    );
    expect(report.isReady).toBe(false);
    expect(await services.campaign.getCampaign(campaign.id)).toEqual(before);
  });

  it("détecte absence de lot courant", async () => {
    const services = createMemoryAppServices();
    const ports = createCampaignSimulationReadinessPortsFromServices(services);
    const campaign = await services.campaign.createCampaign({
      name: "Sans import",
      referenceYear: 2026,
      notes: "",
    });
    await fillAllS0(services, campaign.id);
    const report = await buildCampaignSimulationReadiness(
      { campaignId: campaign.id },
      ports,
    );
    expect(
      report.issues.some((i) => i.code === "CURRENT_IMPORT_BATCH_NOT_FOUND"),
    ).toBe(true);
  });

  it("détecte population vide", async () => {
    const services = createMemoryAppServices();
    const campaign = await services.campaign.createCampaign({
      name: "Pop vide",
      referenceYear: 2026,
      notes: "",
    });
    await fillAllS0(services, campaign.id);
    const referenceSet = await services.compensationReference.getReferenceSet(
      campaign.id,
    );
    const ports: CampaignSimulationReadinessPorts = {
      getCampaign: async () => services.campaign.getCampaign(campaign.id),
      getReferenceSet: async () => referenceSet,
      getCompleteness: async () =>
        services.compensationReference.getCompleteness(campaign.id),
      getCurrentBatch: async () =>
        fakeBatch({ campaignId: campaign.id, importedRowCount: 0 }),
      listCurrentPopulation: async () => ({
        items: [],
        total: 0,
        limit: 200,
        offset: 0,
      }),
    };
    const report = await buildCampaignSimulationReadiness(
      { campaignId: campaign.id },
      ports,
    );
    expect(
      report.issues.some((i) => i.code === "EMPTY_CURRENT_POPULATION"),
    ).toBe(true);
  });

  it("utilise uniquement le lot courant après remplacement", async () => {
    const services = createMemoryAppServices();
    const ports = createCampaignSimulationReadinessPortsFromServices(services);
    const campaign = await services.campaign.createCampaign({
      name: "Remplacement",
      referenceYear: 2026,
      notes: "",
    });
    await fillAllS0(services, campaign.id);
    await services.compensationReference.updateNineBoxMode(campaign.id, "none");
    await importPopulation(
      services,
      campaign.id,
      [validRow({ matricule: "OLD-1", salaire: 500_000 })],
      "v1.xlsx",
    );
    await importPopulation(
      services,
      campaign.id,
      [
        validRow({ matricule: "NEW-1", salaire: 800_000 }),
        validRow({ matricule: "NEW-2", salaire: 900_000 }),
      ],
      "v2.xlsx",
    );
    const report = await buildCampaignSimulationReadiness(
      {
        campaignId: campaign.id,
        budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 10_000 },
        roundingPolicy: { mode: "nearest_half_up", stepFcfa: 1 },
      },
      ports,
    );
    expect(report.importedEmployeeCount).toBe(2);
    expect(report.preparedEmployees.map((e) => e.employeeId)).toEqual([
      "NEW-1",
      "NEW-2",
    ]);
    const batches = await services.hrImport.listBatches(campaign.id);
    expect(batches.filter((b) => b.status === "current")).toHaveLength(1);
    expect(batches.filter((b) => b.status === "superseded")).toHaveLength(1);
  });

  it("détecte un employeeId dupliqué dans la population courante", async () => {
    const services = createMemoryAppServices();
    const campaign = await services.campaign.createCampaign({
      name: "Dup",
      referenceYear: 2026,
      notes: "",
    });
    await fillAllS0(services, campaign.id);
    const set = await services.compensationReference.getReferenceSet(
      campaign.id,
    );
    const f1 = set.jobFamilies[0];
    const g1 = set.grades[0];
    const employees = [
      snapshot({
        employeeNumber: "DUP",
        jobFamilyId: f1.id,
        gradeId: g1.id,
        nineBoxCode: null,
      }),
      snapshot({
        id: 2,
        employeeNumber: "DUP",
        jobFamilyId: f1.id,
        gradeId: g1.id,
        nineBoxCode: null,
        sourceRowNumber: 3,
      }),
    ];
    await services.compensationReference.updateNineBoxMode(campaign.id, "none");
    const referenceSet = await services.compensationReference.getReferenceSet(
      campaign.id,
    );
    const ports: CampaignSimulationReadinessPorts = {
      getCampaign: async () => services.campaign.getCampaign(campaign.id),
      getReferenceSet: async () => referenceSet,
      getCompleteness: async () =>
        services.compensationReference.getCompleteness(campaign.id),
      getCurrentBatch: async () => fakeBatch({ campaignId: campaign.id }),
      listCurrentPopulation: async () => ({
        items: employees,
        total: 2,
        limit: 200,
        offset: 0,
      }),
    };
    const report = await buildCampaignSimulationReadiness(
      {
        campaignId: campaign.id,
        budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 1 },
        roundingPolicy: { mode: "nearest_half_up", stepFcfa: 1 },
      },
      ports,
    );
    expect(report.issues.some((i) => i.code === "DUPLICATE_EMPLOYEE_ID")).toBe(
      true,
    );
    expect(report.isReady).toBe(false);
  });

  it("scénario prêt : campagne active, 3 salariés, budget et arrondi", async () => {
    const services = createMemoryAppServices();
    const ports = createCampaignSimulationReadinessPortsFromServices(services);
    const campaign = await services.campaign.createCampaign({
      name: "Prête",
      referenceYear: 2026,
      notes: "",
    });
    await fillAllS0(services, campaign.id, 1_000_000);
    await services.compensationReference.updateNineBoxMode(
      campaign.id,
      "full_nine_box",
    );
    await importPopulation(services, campaign.id, [
      validRow({
        matricule: "C",
        famille: "F1",
        grade: "G1",
        salaire: 650_000,
        nineBox: 9,
        under: "non",
      }),
      validRow({
        matricule: "A",
        famille: "F2",
        grade: "G2",
        salaire: 1_000_000,
        nineBox: 5,
        under: "non",
      }),
      validRow({
        matricule: "B",
        famille: "F1",
        grade: "G3",
        salaire: 1_200_000,
        nineBox: 1,
        under: "oui",
      }),
    ]);

    const incompleteConfig = await buildCampaignSimulationReadiness(
      { campaignId: campaign.id },
      ports,
    );
    expect(incompleteConfig.populationReadiness.isReady).toBe(true);
    expect(incompleteConfig.configurationReadiness.isComplete).toBe(false);
    expect(incompleteConfig.isReady).toBe(false);
    expect(
      incompleteConfig.issues.some(
        (i) => i.code === "MISSING_BUDGET_CONFIGURATION",
      ),
    ).toBe(true);
    expect(
      incompleteConfig.issues.some((i) => i.code === "MISSING_ROUNDING_POLICY"),
    ).toBe(true);

    const draftReady = await buildCampaignSimulationReadiness(
      {
        campaignId: campaign.id,
        budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 50_000 },
        roundingPolicy: { mode: "nearest_half_up", stepFcfa: 100 },
      },
      ports,
    );
    expect(draftReady.campaignStatus).toBe("draft");
    expect(draftReady.isReady).toBe(true);
    expect(draftReady.preparedEmployees.map((e) => e.employeeId)).toEqual([
      "A",
      "B",
      "C",
    ]);
    expect(draftReady.summary.mappedEmployeeCount).toBe(3);
    expect(draftReady.preparedReferences).not.toBeNull();
    expect(
      JSON.stringify(draftReady).includes("finalRoundedIncreaseAmountFcfa"),
    ).toBe(false);
    expect(JSON.stringify(draftReady).includes("theoreticalAmountFcfa")).toBe(
      false,
    );

    await services.campaign.activateCampaign(campaign.id);
    const active = await buildCampaignSimulationReadiness(
      {
        campaignId: campaign.id,
        budgetTarget: {
          mode: "percentage_of_eligible_payroll",
          eligiblePayrollFcfa: 2_850_000,
          budgetRateBasisPoints: 400,
        },
        roundingPolicy: { mode: "nearest_half_up", stepFcfa: 5 },
      },
      ports,
    );
    expect(active.campaignStatus).toBe("active");
    expect(active.isReady).toBe(true);
    expect(active.configurationReadiness.eligiblePayrollProvided).toBe(true);
    expect(active.configurationReadiness.budgetRateProvided).toBe(true);
  });

  it("collecte plusieurs erreurs simultanées", async () => {
    const services = createMemoryAppServices();
    const campaign = await services.campaign.createCampaign({
      name: "Bloquée",
      referenceYear: 2026,
      notes: "",
    });
    await services.compensationReference.updateNineBoxMode(
      campaign.id,
      "performance_potential",
    );
    const set = await services.compensationReference.getReferenceSet(
      campaign.id,
    );
    const f1 = set.jobFamilies[0];
    const g1 = set.grades[0];
    const employees = [
      snapshot({
        employeeNumber: "DUP",
        jobFamilyId: f1.id,
        gradeId: g1.id,
        nineBoxCode: null,
        decemberBaseSalary: 0,
      }),
      snapshot({
        id: 2,
        employeeNumber: "DUP",
        jobFamilyId: f1.id,
        gradeId: g1.id,
        nineBoxCode: null,
        sourceRowNumber: 3,
      }),
      snapshot({
        id: 3,
        employeeNumber: "NOBOX",
        jobFamilyId: f1.id,
        gradeId: g1.id,
        nineBoxCode: null,
        sourceRowNumber: 4,
      }),
    ];
    const ports: CampaignSimulationReadinessPorts = {
      getCampaign: async () => services.campaign.getCampaign(campaign.id),
      getReferenceSet: async () => set,
      getCompleteness: async () =>
        services.compensationReference.getCompleteness(campaign.id),
      getCurrentBatch: async () => fakeBatch({ campaignId: campaign.id }),
      listCurrentPopulation: async () => ({
        items: employees,
        total: employees.length,
        limit: 200,
        offset: 0,
      }),
    };
    const report = await buildCampaignSimulationReadiness(
      { campaignId: campaign.id },
      ports,
    );
    expect(report.isReady).toBe(false);
    const codes = new Set(report.issues.map((i) => i.code));
    expect(
      codes.has("INCOMPLETE_COMPENSATION_REFERENCES") ||
        codes.has("S0_REFERENCE_NOT_FOUND"),
    ).toBe(true);
    expect(codes.has("DUPLICATE_EMPLOYEE_ID")).toBe(true);
    expect(codes.has("MISSING_BUDGET_CONFIGURATION")).toBe(true);
    expect(codes.has("MISSING_ROUNDING_POLICY")).toBe(true);
    expect(codes.has("SIMULATION_NOT_READY")).toBe(true);
    expect(
      codes.has("MISSING_EMPLOYEE_PERFORMANCE") ||
        codes.has("INVALID_EMPLOYEE_SALARY"),
    ).toBe(true);
  });

  it("est déterministe et ne mute pas les entrées", async () => {
    const services = createMemoryAppServices();
    const ports = createCampaignSimulationReadinessPortsFromServices(services);
    const campaign = await services.campaign.createCampaign({
      name: "Déterminisme",
      referenceYear: 2026,
      notes: "",
    });
    await fillAllS0(services, campaign.id);
    await services.compensationReference.updateNineBoxMode(campaign.id, "none");
    await importPopulation(services, campaign.id, [
      validRow({ matricule: "Z-1" }),
      validRow({ matricule: "A-1", famille: "F2" }),
    ]);
    const input = {
      campaignId: campaign.id,
      budgetTarget: {
        mode: "manual_amount" as const,
        manualBudgetFcfa: 12_345,
      },
      roundingPolicy: { mode: "nearest_half_up" as const, stepFcfa: 10 },
    };
    const snap = structuredClone(input);
    const first = await buildCampaignSimulationReadiness(input, ports);
    const second = await buildCampaignSimulationReadiness(input, ports);
    expect(input).toEqual(snap);
    expect(first).toEqual(second);
    expect(first.preparedEmployees.map((e) => e.employeeId)).toEqual([
      "A-1",
      "Z-1",
    ]);
    expect(first.issues.map((i) => i.code)).toEqual(
      second.issues.map((i) => i.code),
    );
  });

  it("orientation 9-Box n’affecte pas le mapping", async () => {
    const services = createMemoryAppServices();
    const ports = createCampaignSimulationReadinessPortsFromServices(services);
    const campaign = await services.campaign.createCampaign({
      name: "Orientation",
      referenceYear: 2026,
      notes: "",
    });
    await fillAllS0(services, campaign.id);
    await services.compensationReference.updateNineBoxMode(
      campaign.id,
      "full_nine_box",
    );
    await importPopulation(services, campaign.id, [
      validRow({ matricule: "O-1", nineBox: 3 }),
    ]);
    const baseInput = {
      campaignId: campaign.id,
      budgetTarget: { mode: "manual_amount" as const, manualBudgetFcfa: 1000 },
      roundingPolicy: { mode: "nearest_half_up" as const, stepFcfa: 1 },
    };
    const orange = await buildCampaignSimulationReadiness(baseInput, ports);
    await services.compensationReference.updateNineBoxOrientation(
      campaign.id,
      "performance_columns_potential_rows",
    );
    const inverted = await buildCampaignSimulationReadiness(baseInput, ports);
    expect(orange.preparedEmployees).toEqual(inverted.preparedEmployees);
    expect(orange.nineBoxOrientation).toBe(
      "performance_rows_potential_columns",
    );
    expect(inverted.nineBoxOrientation).toBe(
      "performance_columns_potential_rows",
    );
  });

  it("couvre les modes d’évaluation performance_only", async () => {
    const services = createMemoryAppServices();
    const ports = createCampaignSimulationReadinessPortsFromServices(services);
    const campaign = await services.campaign.createCampaign({
      name: "Perf only",
      referenceYear: 2026,
      notes: "",
    });
    await fillAllS0(services, campaign.id);
    await services.compensationReference.updateNineBoxMode(
      campaign.id,
      "performance_only",
    );
    await importPopulation(services, campaign.id, [
      validRow({ matricule: "P-1", nineBox: 7 }),
    ]);
    const report = await buildCampaignSimulationReadiness(
      {
        campaignId: campaign.id,
        budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 100 },
        roundingPolicy: { mode: "nearest_half_up", stepFcfa: 1 },
      },
      ports,
    );
    expect(report.evaluationMode).toBe("performance_only");
    expect(report.isReady).toBe(true);
    expect(report.preparedEmployees[0].performanceLevel).toBeDefined();
    expect(report.preparedEmployees[0].potentialLevel).toBeUndefined();
  });
});
