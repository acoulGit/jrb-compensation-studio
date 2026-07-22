/**
 * Lot 2B-RC1-H1-HF1 — conservation de neutralizeNineBoxEffect
 * après validation de l’import (prévisualisation → population active).
 */

import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { MemoryCampaignRepository } from "../infrastructure/database/repositories/memoryCampaignRepository";
import { MemoryCompensationReferenceRepository } from "../infrastructure/database/repositories/memoryCompensationReferenceRepository";
import { MemoryHrImportRepository } from "../infrastructure/database/repositories/memoryHrImportRepository";
import { MemoryOrganizationRepository } from "../infrastructure/database/repositories/memoryOrganizationRepository";
import { CampaignService } from "../services/campaignService";
import { CompensationReferenceService } from "../services/compensationReferenceService";
import { HrImportService } from "../services/hrImportService";
import { OrganizationService } from "../services/organizationService";
import { mapImportedEmployeeToPreparedInput } from "../application/campaignSimulation/mapImportedEmployeeToPreparedInput";
import { resolveEvaluationFactor } from "../domain/compensationCalculation";
import type { EmployeeSnapshot } from "../domain/hrImport/models";
import { readBooleanFlag } from "../infrastructure/imports/cellReaders";

const TODAY = "2026-07-18";

const HEADERS = [
  "Matricule",
  "Nom complet",
  "Famille",
  "Grade",
  "Type de contrat",
  "Statut d’emploi",
  "Date d’embauche",
  "Salaire de base décembre",
  "Code 9-Box",
  "Sous-performant confirmé",
  "Neutraliser effet 9-Box",
  "Montant promotion",
  "Montant correction",
  "Mesure sociale",
];

function buildServices() {
  const campaignRepository = new MemoryCampaignRepository();
  const referenceRepository = new MemoryCompensationReferenceRepository();
  const hrImportRepository = new MemoryHrImportRepository();
  const compensationReference = new CompensationReferenceService(
    referenceRepository,
    campaignRepository,
  );
  return {
    campaign: new CampaignService(campaignRepository, referenceRepository),
    compensationReference,
    hrImport: new HrImportService(
      campaignRepository,
      compensationReference,
      hrImportRepository,
      () => TODAY,
    ),
    hrImportRepository,
    organization: new OrganizationService(new MemoryOrganizationRepository()),
  };
}

function toArrayBuffer(data: Uint8Array | number[] | ArrayBuffer): ArrayBuffer {
  if (data instanceof ArrayBuffer) {
    return data;
  }
  const bytes = data instanceof Uint8Array ? data : Uint8Array.from(data);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function sheetToBuffer(
  rows: unknown[][],
  fileName: string,
): { arrayBuffer: ArrayBuffer; fileName: string; fileSizeBytes: number } {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Population");
  const arrayBuffer = toArrayBuffer(
    XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as
      | number[]
      | Uint8Array,
  );
  return {
    arrayBuffer,
    fileName,
    fileSizeBytes: arrayBuffer.byteLength,
  };
}

function employeeRow(
  index: number,
  neutralize: "Oui" | "Non" | "" | undefined,
  nineBox: number | "" = 5,
): (string | number)[] {
  return [
    `EMP-P${String(index).padStart(3, "0")}`,
    `Salarié ${index}`,
    "F1",
    "G1",
    "CDI",
    "Actif",
    "2020-01-15",
    450_000,
    nineBox,
    "Non",
    neutralize === undefined ? "" : neutralize,
    0,
    0,
    0,
  ];
}

/** Fixture HF1 : 3 Oui + 5 Non. */
function eightEmployeeRows(): (string | number)[][] {
  return [
    HEADERS,
    employeeRow(1, "Oui"),
    employeeRow(2, "Oui"),
    employeeRow(3, "Oui"),
    employeeRow(4, "Non"),
    employeeRow(5, "Non"),
    employeeRow(6, "Non"),
    employeeRow(7, "Non"),
    employeeRow(8, "Non"),
  ];
}

function countNeutralized(items: { neutralizeNineBoxEffect: boolean }[]): {
  yes: number;
  no: number;
} {
  return {
    yes: items.filter((item) => item.neutralizeNineBoxEffect).length,
    no: items.filter((item) => !item.neutralizeNineBoxEffect).length,
  };
}

describe("Lot 2B-RC1-H1-HF1 — conservation après validation import", () => {
  it("conserve le parseur booléen (pas de régression)", () => {
    expect(readBooleanFlag("Oui")).toBe(true);
    expect(readBooleanFlag("Non")).toBe(false);
    expect(readBooleanFlag("")).toBe(false);
    expect(readBooleanFlag("1")).toBe(true);
  });

  it("prévisualise 3 Oui / 5 Non puis conserve après confirmation et relecture", async () => {
    const services = buildServices();
    const campaign = await services.campaign.createCampaign({
      name: "HF1 neutralize",
      referenceYear: 2026,
      notes: "",
    });
    const file = sheetToBuffer(eightEmployeeRows(), "recette-neutralize.xlsx");
    const parsed = await services.hrImport.parseFile(file);
    const mapping = services.hrImport.buildAutoMapping(HEADERS);

    const preview = await services.hrImport.buildPreview({
      campaignId: campaign.id,
      fileName: parsed.fileName,
      format: parsed.format,
      sheetName: parsed.sheets[0].name,
      rows: parsed.sheets[0].rows,
      headerRowIndex: 0,
      mapping,
    });
    expect(preview.validCount).toBe(8);
    expect(countNeutralized(preview.sampleRows)).toEqual({ yes: 3, no: 5 });
    expect(
      preview.sampleRows
        .filter((row) => row.neutralizeNineBoxEffect)
        .map((row) => row.employeeNumber),
    ).toEqual(["EMP-P001", "EMP-P002", "EMP-P003"]);

    await services.hrImport.confirmImport({
      campaignId: campaign.id,
      fileName: parsed.fileName,
      format: parsed.format,
      sheetName: parsed.sheets[0].name,
      fileSizeBytes: file.fileSizeBytes,
      rows: parsed.sheets[0].rows,
      headerRowIndex: 0,
      mapping,
    });

    const page = await services.hrImport.listCurrentPopulation(campaign.id, {
      limit: 50,
      offset: 0,
    });
    expect(page.total).toBe(8);
    expect(countNeutralized(page.items)).toEqual({ yes: 3, no: 5 });
    expect(
      page.items
        .filter((item) => item.neutralizeNineBoxEffect)
        .map((item) => item.employeeNumber)
        .sort(),
    ).toEqual(["EMP-P001", "EMP-P002", "EMP-P003"]);

    // Relecture via un second accès repository (même store mémoire).
    const reloaded = await services.hrImportRepository.listCurrentPopulation(
      campaign.id,
      { limit: 50, offset: 0 },
    );
    expect(countNeutralized(reloaded.items)).toEqual({ yes: 3, no: 5 });
  });

  it("colonne absente ou cellule vide → false après confirmation", async () => {
    const services = buildServices();
    const campaign = await services.campaign.createCampaign({
      name: "HF1 defaults",
      referenceYear: 2026,
      notes: "",
    });
    const headersWithoutColumn = HEADERS.filter(
      (header) => header !== "Neutraliser effet 9-Box",
    );
    const rowWithoutColumn = [
      "EMP-A001",
      "Sans colonne",
      "F1",
      "G1",
      "CDI",
      "Actif",
      "2020-01-15",
      450_000,
      5,
      "Non",
      0,
      0,
      0,
    ];
    const fileAbsent = sheetToBuffer(
      [headersWithoutColumn, rowWithoutColumn],
      "sans-colonne.xlsx",
    );
    const parsedAbsent = await services.hrImport.parseFile(fileAbsent);
    const mappingAbsent = services.hrImport.buildAutoMapping(
      headersWithoutColumn,
    );
    await services.hrImport.confirmImport({
      campaignId: campaign.id,
      fileName: parsedAbsent.fileName,
      format: parsedAbsent.format,
      sheetName: parsedAbsent.sheets[0].name,
      fileSizeBytes: fileAbsent.fileSizeBytes,
      rows: parsedAbsent.sheets[0].rows,
      headerRowIndex: 0,
      mapping: mappingAbsent,
    });
    const afterAbsent = await services.hrImport.listCurrentPopulation(
      campaign.id,
      { limit: 10, offset: 0 },
    );
    expect(afterAbsent.items[0].neutralizeNineBoxEffect).toBe(false);

    const fileEmpty = sheetToBuffer(
      [HEADERS, employeeRow(1, "")],
      "cellule-vide.xlsx",
    );
    const parsedEmpty = await services.hrImport.parseFile(fileEmpty);
    const mapping = services.hrImport.buildAutoMapping(HEADERS);
    await services.hrImport.confirmImport({
      campaignId: campaign.id,
      fileName: parsedEmpty.fileName,
      format: parsedEmpty.format,
      sheetName: parsedEmpty.sheets[0].name,
      fileSizeBytes: fileEmpty.fileSizeBytes,
      rows: parsedEmpty.sheets[0].rows,
      headerRowIndex: 0,
      mapping,
    });
    const afterEmpty = await services.hrImport.listCurrentPopulation(
      campaign.id,
      { limit: 10, offset: 0 },
    );
    expect(afterEmpty.items[0].neutralizeNineBoxEffect).toBe(false);
  });

  it("mapping moteur et facteur conservent la valeur persistée", async () => {
    const services = buildServices();
    const campaign = await services.campaign.createCampaign({
      name: "HF1 moteur",
      referenceYear: 2026,
      notes: "",
    });
    const file = sheetToBuffer(
      [
        HEADERS,
        employeeRow(1, "Oui", 5),
        employeeRow(2, "Non", 5),
        employeeRow(3, "Oui", ""),
      ],
      "moteur.xlsx",
    );
    const parsed = await services.hrImport.parseFile(file);
    const mapping = services.hrImport.buildAutoMapping(HEADERS);
    await services.hrImport.confirmImport({
      campaignId: campaign.id,
      fileName: parsed.fileName,
      format: parsed.format,
      sheetName: parsed.sheets[0].name,
      fileSizeBytes: file.fileSizeBytes,
      rows: parsed.sheets[0].rows,
      headerRowIndex: 0,
      mapping,
    });
    const population = await services.hrImport.listCurrentPopulation(
      campaign.id,
      { limit: 10, offset: 0 },
    );
    const byNumber = new Map(
      population.items.map((item) => [item.employeeNumber, item]),
    );

    const nineBox = {
      id: 1,
      campaignId: campaign.id,
      boxCode: 5,
      performanceLevel: "medium" as const,
      potentialLevel: "medium" as const,
      factorMilli: 1200,
      createdAt: TODAY,
      updatedAt: TODAY,
    };
    const context = {
      evaluationMode: "full_nine_box" as const,
      campaignYear: 2026,
      familiesById: new Map([
        [
          population.items[0].jobFamilyId,
          {
            id: population.items[0].jobFamilyId,
            campaignId: campaign.id,
            code: "F1",
            label: "F1",
            sortOrder: 1,
            createdAt: "",
            updatedAt: "",
          },
        ],
      ]),
      gradesById: new Map([
        [
          population.items[0].gradeId,
          {
            id: population.items[0].gradeId,
            campaignId: campaign.id,
            code: "G1",
            label: "G1",
            sortOrder: 1,
            createdAt: "",
            updatedAt: "",
          },
        ],
      ]),
      nineBoxFactorsByCode: new Map([[5, nineBox]]),
    };

    const neutralized = byNumber.get("EMP-P001") as EmployeeSnapshot;
    const historical = byNumber.get("EMP-P002") as EmployeeSnapshot;
    const missingOk = byNumber.get("EMP-P003") as EmployeeSnapshot;

    const mappedNeutralized = mapImportedEmployeeToPreparedInput(
      neutralized,
      context,
    );
    const mappedHistorical = mapImportedEmployeeToPreparedInput(
      historical,
      context,
    );
    const mappedMissing = mapImportedEmployeeToPreparedInput(
      missingOk,
      context,
    );

    expect(mappedNeutralized.ok).toBe(true);
    expect(mappedHistorical.ok).toBe(true);
    expect(mappedMissing.ok).toBe(true);
    if (mappedNeutralized.ok && mappedHistorical.ok && mappedMissing.ok) {
      expect(mappedNeutralized.prepared.neutralizeNineBoxEffect).toBe(true);
      expect(mappedHistorical.prepared.neutralizeNineBoxEffect).toBe(false);
      expect(mappedMissing.prepared.neutralizeNineBoxEffect).toBe(true);

      const factorNeutralized = resolveEvaluationFactor({
        mode: "full_nine_box",
        performanceLevel: mappedNeutralized.prepared.performanceLevel,
        potentialLevel: mappedNeutralized.prepared.potentialLevel,
        performanceFactors: [],
        potentialFactors: [],
        nineBoxFactors: [
          {
            performanceLevel: "medium",
            potentialLevel: "medium",
            factorMilli: 1200,
            boxCode: 5,
          },
        ],
        neutralizeNineBoxEffect: mappedNeutralized.prepared.neutralizeNineBoxEffect,
        nineBoxConfirmationFactorMilli: 900,
      });
      expect(factorNeutralized.exactFactorNumerator).toBe(900_000);

      const factorHistorical = resolveEvaluationFactor({
        mode: "full_nine_box",
        performanceLevel: mappedHistorical.prepared.performanceLevel,
        potentialLevel: mappedHistorical.prepared.potentialLevel,
        performanceFactors: [],
        potentialFactors: [],
        nineBoxFactors: [
          {
            performanceLevel: "medium",
            potentialLevel: "medium",
            factorMilli: 1200,
            boxCode: 5,
          },
        ],
        neutralizeNineBoxEffect: mappedHistorical.prepared.neutralizeNineBoxEffect,
      });
      expect(factorHistorical.exactFactorNumerator).toBe(1_200_000);
    }
  });
});
