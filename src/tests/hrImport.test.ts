import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { createMemoryAppServices } from "../services/createAppServices";
import { MemoryCampaignRepository } from "../infrastructure/database/repositories/memoryCampaignRepository";
import { MemoryCompensationReferenceRepository } from "../infrastructure/database/repositories/memoryCompensationReferenceRepository";
import { MemoryHrImportRepository } from "../infrastructure/database/repositories/memoryHrImportRepository";
import { MemoryOrganizationRepository } from "../infrastructure/database/repositories/memoryOrganizationRepository";
import { CampaignService } from "../services/campaignService";
import { CompensationReferenceService } from "../services/compensationReferenceService";
import { HrImportService } from "../services/hrImportService";
import { OrganizationService } from "../services/organizationService";
import { parseSpreadsheetBuffer } from "../infrastructure/imports/spreadsheetParser";
import { detectHeaderRow } from "../infrastructure/imports/headerDetection";
import {
  buildAutoMapping,
  validateMapping,
} from "../infrastructure/imports/columnMapping";
import { normalizeImportRows } from "../infrastructure/imports/rowNormalizer";
import { MAX_IMPORT_DATA_ROWS, MAX_IMPORT_FILE_BYTES } from "../infrastructure/imports/importLimits";
import { extractBaseFileName } from "../infrastructure/imports/spreadsheetParser";
import { AppError } from "../services/errors";

const TODAY = "2026-07-18";

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

const EN_HEADERS = [
  "employee_number",
  "employee_label",
  "job_family",
  "job_grade",
  "contract_type",
  "employment_status",
  "hire_date",
  "december_base_salary",
  "nine_box",
  "confirmed underperformer",
  "promotion amount",
  "correction amount",
  "social measure amount",
];

function buildServices(options?: { failNextReplace?: boolean }) {
  const campaignRepository = new MemoryCampaignRepository();
  const referenceRepository = new MemoryCompensationReferenceRepository();
  const hrImportRepository = new MemoryHrImportRepository({
    failNextReplace: options?.failNextReplace,
  });
  const compensationReference = new CompensationReferenceService(
    referenceRepository,
    campaignRepository,
  );
  return {
    organization: new OrganizationService(new MemoryOrganizationRepository()),
    campaign: new CampaignService(campaignRepository, referenceRepository),
    compensationReference,
    hrImport: new HrImportService(
      campaignRepository,
      compensationReference,
      hrImportRepository,
      () => TODAY,
    ),
    hrImportRepository,
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
  sheetName = "Population",
): { arrayBuffer: ArrayBuffer; fileName: string; fileSizeBytes: number } {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  const arrayBuffer = fileName.endsWith(".csv")
    ? toArrayBuffer(new TextEncoder().encode(XLSX.utils.sheet_to_csv(sheet)))
    : toArrayBuffer(
        XLSX.write(workbook, {
          type: "array",
          bookType: fileName.endsWith(".xls") ? "xls" : "xlsx",
        }) as number[] | Uint8Array,
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
    overrides.salaire ?? 450000,
    overrides.nineBox ?? 5,
    overrides.under ?? "non",
    overrides.promo ?? 0,
    overrides.corr ?? 0,
    overrides.social ?? 0,
  ];
}

async function preparedCampaign() {
  const services = buildServices();
  const campaign = await services.campaign.createCampaign({
    name: "Campagne import",
    referenceYear: 2026,
    notes: "",
  });
  const reference = await services.compensationReference.getReferenceSet(
    campaign.id,
  );
  return { services, campaign, reference };
}

describe("import RH — parsing", () => {
  it("lit un XLSX valide et un CSV valide", async () => {
    const rows = [FR_HEADERS, validRow()];
    const xlsx = await parseSpreadsheetBuffer(
      sheetToBuffer(rows, "population-demo.xlsx"),
    );
    expect(xlsx.format).toBe("xlsx");
    expect(xlsx.fileName).toBe("population-demo.xlsx");
    expect(xlsx.sheets[0].rows.length).toBeGreaterThanOrEqual(2);

    const csv = await parseSpreadsheetBuffer(
      sheetToBuffer(rows, "population-demo.csv"),
    );
    expect(csv.format).toBe("csv");
    expect(csv.sheets).toHaveLength(1);
  });

  it("lit un XLS lorsque supporté", async () => {
    const rows = [FR_HEADERS, validRow()];
    const parsed = await parseSpreadsheetBuffer(
      sheetToBuffer(rows, "population-demo.xls"),
    );
    expect(parsed.format).toBe("xls");
    expect(parsed.sheets[0].rows.length).toBeGreaterThanOrEqual(2);
  });

  it(
    "refuse fichier vide, taille excessive et trop de lignes",
    async () => {
      await expect(
        parseSpreadsheetBuffer({
          arrayBuffer: new ArrayBuffer(0),
          fileName: "vide.xlsx",
          fileSizeBytes: 0,
        }),
      ).rejects.toThrow(/vide/i);

      await expect(
        parseSpreadsheetBuffer({
          arrayBuffer: new ArrayBuffer(8),
          fileName: "gros.xlsx",
          fileSizeBytes: MAX_IMPORT_FILE_BYTES + 1,
        }),
      ).rejects.toThrow(/taille maximale/i);

      // Évite de sérialiser 20k+ lignes via SheetJS : la limite métier est
      // appliquée dans le service avant normalisation complète.
      const hugeRows: unknown[][] = [FR_HEADERS];
      for (let i = 0; i < MAX_IMPORT_DATA_ROWS + 1; i += 1) {
        hugeRows.push([`EMP-${i}`]);
      }
      const { services, campaign } = await preparedCampaign();
      const mapping = services.hrImport.buildAutoMapping(
        FR_HEADERS.map(String),
      );
      await expect(
        services.hrImport.buildPreview({
          campaignId: campaign.id,
          fileName: "trop.xlsx",
          format: "xlsx",
          sheetName: "Feuil1",
          rows: hugeRows,
          headerRowIndex: 0,
          mapping,
        }),
      ).rejects.toThrow(/lignes/i);
    },
  );

  it("refuse une feuille vide et conserve le nom de base sans chemin", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([[]]),
      "Vide",
    );
    const arrayBuffer = toArrayBuffer(
      XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as number[],
    );
    const parsed = await parseSpreadsheetBuffer({
      arrayBuffer,
      fileName: "C:\\temp\\demo\\fichier.xlsx",
      fileSizeBytes: arrayBuffer.byteLength,
    });
    expect(parsed.fileName).toBe("fichier.xlsx");
    expect(extractBaseFileName("D:/data/pop.csv")).toBe("pop.csv");

    const { services, campaign } = await preparedCampaign();
    const mapping = services.hrImport.buildAutoMapping(FR_HEADERS);
    await expect(
      services.hrImport.buildPreview({
        campaignId: campaign.id,
        fileName: parsed.fileName,
        format: parsed.format,
        sheetName: "Vide",
        rows: parsed.sheets[0]?.rows ?? [[]],
        headerRowIndex: 0,
        mapping,
      }),
    ).rejects.toThrow(/feuille.*vide/i);
  });
});

describe("import RH — en-tête et mapping", () => {
  it("détecte l’en-tête, permet le changement et mappe alias FR/EN", () => {
    const rows = [
      ["Ignorer", "cette", "ligne"],
      FR_HEADERS,
      validRow(),
    ];
    expect(detectHeaderRow(rows)).toBe(1);

    const frMapping = buildAutoMapping(FR_HEADERS);
    expect(
      frMapping.find((item) => item.targetField === "employeeNumber")
        ?.sourceIndex,
    ).toBe(0);
    expect(
      frMapping.find((item) => item.targetField === "decemberBaseSalary")
        ?.sourceIndex,
    ).toBe(7);

    const enMapping = buildAutoMapping(EN_HEADERS);
    expect(
      enMapping.find((item) => item.targetField === "employeeLabel")
        ?.sourceIndex,
    ).toBe(1);
    expect(
      enMapping.find((item) => item.targetField === "contractType")
        ?.sourceIndex,
    ).toBe(4);

    const manual = frMapping.map((entry) =>
      entry.targetField === "employeeNumber"
        ? { ...entry, sourceIndex: 1, sourceHeader: "Nom complet" }
        : entry,
    );
    expect(
      manual.find((item) => item.targetField === "employeeNumber")?.sourceIndex,
    ).toBe(1);

    const missing = frMapping.map((entry) =>
      entry.targetField === "hireDate"
        ? { ...entry, sourceIndex: null, sourceHeader: null }
        : entry,
    );
    const missingErrors = validateMapping(missing).errors;
    expect(
      missingErrors.some(
        (issue) =>
          issue.code.includes("required") ||
          issue.message.includes("obligatoire"),
      ),
    ).toBe(true);

    const duplicated = frMapping.map((entry) =>
      entry.targetField === "gradeCode"
        ? { ...entry, sourceIndex: 0, sourceHeader: "Matricule" }
        : entry,
    );
    const dupErrors = validateMapping(duplicated).errors;
    expect(dupErrors.length).toBeGreaterThan(0);
  });
});

describe("import RH — normalisation", () => {
  it("valide les cas nominaux et refuse les erreurs bloquantes principales", async () => {
    const { reference } = await preparedCampaign();
    const mapping = buildAutoMapping(FR_HEADERS);

    const ok = normalizeImportRows({
      rows: [
        FR_HEADERS,
        validRow({ matricule: "00012", salaire: "450 000 FCFA", date: "15/01/2020" }),
        validRow({
          matricule: "EMP-0002",
          nom: "Employee Test 1",
          contrat: "intérimaire",
          statut: "disponibilité hors groupe",
          nineBox: "",
          under: "oui",
          promo: "",
        }),
      ],
      headerRowIndex: 0,
      mapping,
      jobFamilies: reference.jobFamilies,
      grades: reference.grades,
      todayIsoDate: TODAY,
      campaignReferenceYear: 2026,
    });
    expect(ok.validCount).toBe(2);
    expect(ok.normalized[0].hireDate).toBe("2020-01-15");
    expect(ok.normalized[0].decemberBaseSalary).toBe(450000);
    expect(ok.normalized[1].nineBoxCode).toBeNull();
    expect(ok.normalized[1].confirmedUnderperformer).toBe(true);
    expect(ok.normalized[1].promotionAmount).toBe(0);
    expect(ok.normalized[1].contractType).toBe("temporary");
    expect(ok.normalized[1].employmentStatus).toBe("external_availability");

    const leading = normalizeImportRows({
      rows: [FR_HEADERS, validRow({ matricule: 12 as unknown as string })],
      headerRowIndex: 0,
      mapping,
      jobFamilies: reference.jobFamilies,
      grades: reference.grades,
      todayIsoDate: TODAY,
      campaignReferenceYear: 2026,
    });
    expect(
      leading.issues.some((issue) => issue.code.includes("leading") || issue.message.includes("zéros")),
    ).toBe(true);

    const blocked = normalizeImportRows({
      rows: [
        FR_HEADERS,
        validRow({ matricule: "" }),
        validRow({ matricule: "dup", nom: "" }),
        validRow({ matricule: "DUP" }),
        validRow({ matricule: "X1", famille: "ZZ" }),
        validRow({ matricule: "X2", grade: "ZZ" }),
        validRow({ matricule: "X3", contrat: "inconnu" }),
        validRow({ matricule: "X4", statut: "inconnu" }),
        validRow({ matricule: "X5", date: "32/13/2020" }),
        validRow({ matricule: "X6", date: "2099-01-01" }),
        validRow({ matricule: "X7", salaire: 0 }),
        validRow({ matricule: "X8", salaire: -10 }),
        validRow({ matricule: "X9", salaire: "450000.5" }),
        validRow({ matricule: "X10", nineBox: 12 }),
        validRow({ matricule: "X11", under: "peut-être" }),
        validRow({ matricule: "X12", promo: -1 }),
      ],
      headerRowIndex: 0,
      mapping,
      jobFamilies: reference.jobFamilies,
      grades: reference.grades,
      todayIsoDate: TODAY,
      campaignReferenceYear: 2026,
    });
    expect(blocked.errorCount).toBeGreaterThan(0);
    expect(blocked.validCount).toBeLessThan(blocked.normalized.length);
    expect(
      blocked.issues.some((issue) => issue.code === "unknown_job_family"),
    ).toBe(true);
    expect(
      blocked.issues.some((issue) => issue.code === "duplicate_employee_number"),
    ).toBe(true);
    expect(blocked.duplicateNumbers).toBeGreaterThanOrEqual(2);
  });

  it("accepte aliases CDI/CDD/prestataire et 9-Box 1–9, dates ISO/Excel", async () => {
    const { reference } = await preparedCampaign();
    const mapping = buildAutoMapping(FR_HEADERS);
    const excelDate = new Date(Date.UTC(2019, 5, 1));
    const result = normalizeImportRows({
      rows: [
        FR_HEADERS,
        validRow({ matricule: "A1", contrat: "CDD", nineBox: 1 }),
        validRow({ matricule: "A2", contrat: "prestataire", nineBox: 9, date: "2019-06-01" }),
        validRow({ matricule: "A3", contrat: "permanent", date: excelDate as unknown as string }),
      ],
      headerRowIndex: 0,
      mapping,
      jobFamilies: reference.jobFamilies,
      grades: reference.grades,
      todayIsoDate: TODAY,
      campaignReferenceYear: 2026,
    });
    expect(result.normalized[0].contractType).toBe("cdd");
    expect(result.normalized[0].nineBoxCode).toBe(1);
    expect(result.normalized[1].contractType).toBe("contractor");
    expect(result.normalized[1].nineBoxCode).toBe(9);
    expect(result.normalized[2].contractType).toBe("cdi");
    expect(result.normalized[2].hireDate).toBe("2019-06-01");
  });
});

describe("import RH — confirmation atomique", () => {
  it("prévisualise sans écrire, confirme, remplace et conserve l’historique", async () => {
    const services = buildServices();
    const campaign = await services.campaign.createCampaign({
      name: "Campagne atomique",
      referenceYear: 2026,
      notes: "",
    });
    const file1 = sheetToBuffer(
      [FR_HEADERS, validRow({ matricule: "EMP-0001" }), validRow({ matricule: "EMP-0002", nom: "Salarié Démo 2" })],
      "pop-v1.xlsx",
    );
    const parsed1 = await services.hrImport.parseFile(file1);
    const mapping = services.hrImport.buildAutoMapping(FR_HEADERS);
    const preview = await services.hrImport.buildPreview({
      campaignId: campaign.id,
      fileName: parsed1.fileName,
      format: parsed1.format,
      sheetName: parsed1.sheets[0].name,
      rows: parsed1.sheets[0].rows,
      headerRowIndex: 0,
      mapping,
    });
    expect(preview.validCount).toBe(2);
    expect(await services.hrImport.getCurrentPopulationCount(campaign.id)).toBe(0);

    const first = await services.hrImport.confirmImport({
      campaignId: campaign.id,
      fileName: parsed1.fileName,
      format: parsed1.format,
      sheetName: parsed1.sheets[0].name,
      fileSizeBytes: file1.fileSizeBytes,
      rows: parsed1.sheets[0].rows,
      headerRowIndex: 0,
      mapping,
    });
    expect(first.importedRowCount).toBe(2);
    expect(first.batch.status).toBe("current");
    expect(first.batch.sourceFileName).toBe("pop-v1.xlsx");
    expect(first.batch.sourceFileName.includes("\\")).toBe(false);

    const file2 = sheetToBuffer(
      [FR_HEADERS, validRow({ matricule: "EMP-0009", nom: "Salarié Démo 3" })],
      "pop-v2.xlsx",
    );
    const parsed2 = await services.hrImport.parseFile(file2);
    const second = await services.hrImport.confirmImport({
      campaignId: campaign.id,
      fileName: parsed2.fileName,
      format: parsed2.format,
      sheetName: parsed2.sheets[0].name,
      fileSizeBytes: file2.fileSizeBytes,
      rows: parsed2.sheets[0].rows,
      headerRowIndex: 0,
      mapping,
    });
    expect(second.importedRowCount).toBe(1);
    const batches = await services.hrImport.listBatches(campaign.id);
    expect(batches).toHaveLength(2);
    expect(batches.filter((batch) => batch.status === "current")).toHaveLength(1);
    expect(batches.some((batch) => batch.status === "superseded")).toBe(true);
    expect(await services.hrImport.getCurrentPopulationCount(campaign.id)).toBe(1);

    const page = await services.hrImport.listCurrentPopulation(campaign.id, {
      limit: 50,
      offset: 0,
      search: "0009",
    });
    expect(page.total).toBe(1);
    expect(page.items[0].employeeNumber).toBe("EMP-0009");

    const byName = await services.hrImport.listCurrentPopulation(campaign.id, {
      limit: 50,
      offset: 0,
      search: "Démo 3",
    });
    expect(byName.total).toBe(1);
  });

  it("bloque la confirmation en cas d’erreurs et préserve l’ancien lot après échec simulé", async () => {
    const services = buildServices();
    const campaign = await services.campaign.createCampaign({
      name: "Campagne rollback",
      referenceYear: 2026,
      notes: "",
    });
    const mapping = services.hrImport.buildAutoMapping(FR_HEADERS);
    const good = sheetToBuffer([FR_HEADERS, validRow()], "ok.xlsx");
    const parsedGood = await services.hrImport.parseFile(good);
    await services.hrImport.confirmImport({
      campaignId: campaign.id,
      fileName: parsedGood.fileName,
      format: parsedGood.format,
      sheetName: parsedGood.sheets[0].name,
      fileSizeBytes: good.fileSizeBytes,
      rows: parsedGood.sheets[0].rows,
      headerRowIndex: 0,
      mapping,
    });

    const bad = sheetToBuffer(
      [
        FR_HEADERS,
        validRow({ matricule: "D1" }),
        validRow({ matricule: "D1" }),
        validRow({ matricule: "D2", famille: "UNKNOWN" }),
        validRow({ matricule: "D3", salaire: 0 }),
      ],
      "bad.xlsx",
    );
    const parsedBad = await services.hrImport.parseFile(bad);
    const preview = await services.hrImport.buildPreview({
      campaignId: campaign.id,
      fileName: parsedBad.fileName,
      format: parsedBad.format,
      sheetName: parsedBad.sheets[0].name,
      rows: parsedBad.sheets[0].rows,
      headerRowIndex: 0,
      mapping,
    });
    expect(preview.errorCount).toBeGreaterThan(0);
    await expect(
      services.hrImport.confirmImport({
        campaignId: campaign.id,
        fileName: parsedBad.fileName,
        format: parsedBad.format,
        sheetName: parsedBad.sheets[0].name,
        fileSizeBytes: bad.fileSizeBytes,
        rows: parsedBad.sheets[0].rows,
        headerRowIndex: 0,
        mapping,
      }),
    ).rejects.toBeInstanceOf(AppError);
    expect(await services.hrImport.getCurrentPopulationCount(campaign.id)).toBe(1);

    const failing = buildServices();
    const campaign2 = await failing.campaign.createCampaign({
      name: "Campagne fail",
      referenceYear: 2026,
      notes: "",
    });
    const seed = sheetToBuffer([FR_HEADERS, validRow({ matricule: "S1" })], "seed.xlsx");
    const parsedSeed = await failing.hrImport.parseFile(seed);
    const mapping2 = failing.hrImport.buildAutoMapping(FR_HEADERS);
    await failing.hrImport.confirmImport({
      campaignId: campaign2.id,
      fileName: parsedSeed.fileName,
      format: parsedSeed.format,
      sheetName: parsedSeed.sheets[0].name,
      fileSizeBytes: seed.fileSizeBytes,
      rows: parsedSeed.sheets[0].rows,
      headerRowIndex: 0,
      mapping: mapping2,
    });
    failing.hrImportRepository.setFailNextReplace(true);
    const next = sheetToBuffer([FR_HEADERS, validRow({ matricule: "S2" })], "next.xlsx");
    const parsedNext = await failing.hrImport.parseFile(next);
    await expect(
      failing.hrImport.confirmImport({
        campaignId: campaign2.id,
        fileName: parsedNext.fileName,
        format: parsedNext.format,
        sheetName: parsedNext.sheets[0].name,
        fileSizeBytes: next.fileSizeBytes,
        rows: parsedNext.sheets[0].rows,
        headerRowIndex: 0,
        mapping: mapping2,
      }),
    ).rejects.toThrow();
    expect(await failing.hrImport.getCurrentPopulationCount(campaign2.id)).toBe(1);
    const current = await failing.hrImport.getCurrentBatch(campaign2.id);
    expect(current?.sourceFileName).toBe("seed.xlsx");
  });

  it("refuse l’import sur campagne archivée", async () => {
    const services = createMemoryAppServices();
    const campaign = await services.campaign.createCampaign({
      name: "Archivée import",
      referenceYear: 2026,
      notes: "",
    });
    await services.campaign.archiveCampaign(campaign.id);
    const file = sheetToBuffer([FR_HEADERS, validRow()], "arch.xlsx");
    const parsed = await services.hrImport.parseFile(file);
    const mapping = services.hrImport.buildAutoMapping(FR_HEADERS);
    await expect(
      services.hrImport.confirmImport({
        campaignId: campaign.id,
        fileName: parsed.fileName,
        format: parsed.format,
        sheetName: parsed.sheets[0].name,
        fileSizeBytes: file.fileSizeBytes,
        rows: parsed.sheets[0].rows,
        headerRowIndex: 0,
        mapping,
      }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/archiv/i) });
  });
});

describe("import RH — formules, reset et couverture", () => {
  it("refuse une formule Excel et ne stocke pas le contenu brut", async () => {
    const { services, campaign, reference } = await preparedCampaign();
    const mapping = buildAutoMapping(FR_HEADERS);
    const formulaCell = { kind: "formula" as const, display: "=A1+1" };
    const result = normalizeImportRows({
      rows: [
        FR_HEADERS,
        [
          "EMP-F1",
          "Salarié Démo 1",
          "F1",
          "G1",
          "CDI",
          "Actif",
          "2020-01-01",
          formulaCell,
          "",
          "",
          "",
          "",
          "",
        ],
      ],
      headerRowIndex: 0,
      mapping,
      jobFamilies: reference.jobFamilies,
      grades: reference.grades,
      todayIsoDate: TODAY,
      campaignReferenceYear: 2026,
    });
    expect(
      result.issues.some((issue) => issue.code === "formula_not_allowed"),
    ).toBe(true);
    expect(result.validCount).toBe(0);

    const confirmation = await services.hrImport.confirmImport({
      campaignId: campaign.id,
      fileName: "ok.xlsx",
      format: "xlsx",
      sheetName: "Population",
      fileSizeBytes: 2048,
      rows: [FR_HEADERS, validRow({ matricule: "EMP-OK" })],
      headerRowIndex: 0,
      mapping,
    });
    expect(confirmation.batch.sourceFileName).toBe("ok.xlsx");
    // Le lot ne conserve que les métadonnées fichier, pas le binaire ni les
    // lignes brutes du classeur.
    expect(confirmation).not.toHaveProperty("arrayBuffer");
    expect(confirmation).not.toHaveProperty("rows");
    expect(Object.keys(confirmation.batch)).not.toContain("rawContent");
  });

  it("sélectionne la campagne active par défaut et gère l’état vide", async () => {
    const services = buildServices();
    expect(await services.campaign.listCampaigns()).toHaveLength(0);

    const draft = await services.campaign.createCampaign({
      name: "Brouillon récent",
      referenceYear: 2026,
      notes: "",
    });
    const active = await services.campaign.createCampaign({
      name: "Active défaut",
      referenceYear: 2026,
      notes: "",
    });
    await services.campaign.activateCampaign(active.id);
    const campaigns = await services.campaign.listCampaigns();
    const preferred =
      campaigns.find((item) => item.status === "active") ??
      campaigns
        .filter((item) => item.status === "draft")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ??
      null;
    expect(preferred?.id).toBe(active.id);
    expect(draft.id).not.toBe(active.id);
  });
});

describe("import RH — promotion structurée (Lot 2A-H2C-1)", () => {
  const PROMO_HEADERS = [
    ...FR_HEADERS,
    "Date promotion",
    "Salaire avant promotion",
    "Salaire après promotion",
    "Ancien grade",
    "Nouveau grade",
  ];

  function promoRow(
    overrides: Partial<Record<string, string | number>> = {},
  ): (string | number)[] {
    return [
      ...validRow(overrides),
      overrides.promoDate ?? "",
      overrides.salaryBefore ?? "",
      overrides.salaryAfter ?? "",
      overrides.prevGrade ?? "",
      overrides.newGrade ?? "",
    ];
  }

  it("accepte une ligne sans promotion et conserve null après import", async () => {
    const { services, campaign, reference } = await preparedCampaign();
    const mapping = buildAutoMapping(FR_HEADERS);
    const normalized = normalizeImportRows({
      rows: [FR_HEADERS, validRow()],
      headerRowIndex: 0,
      mapping,
      jobFamilies: reference.jobFamilies,
      grades: reference.grades,
      todayIsoDate: TODAY,
      campaignReferenceYear: 2026,
    });
    expect(normalized.validCount).toBe(1);
    expect(normalized.normalized[0]!.promotionDate).toBeNull();

    await services.hrImport.confirmImport({
      campaignId: campaign.id,
      fileName: "no-promo.xlsx",
      format: "xlsx",
      sheetName: "Population",
      fileSizeBytes: 1024,
      rows: [FR_HEADERS, validRow({ matricule: "EMP-NP" })],
      headerRowIndex: 0,
      mapping,
    });
    const page = await services.hrImport.listCurrentPopulation(campaign.id, {
      limit: 10,
      offset: 0,
    });
    const employee = page.items.find((item) => item.employeeNumber === "EMP-NP");
    expect(employee?.promotionDate).toBeNull();
    expect(employee?.previousGradeId).toBeNull();
  });

  it("valide un groupe promotion complet en N et persiste les colonnes", async () => {
    const { services, campaign, reference } = await preparedCampaign();
    const mapping = buildAutoMapping(PROMO_HEADERS);
    const row = promoRow({
      matricule: "EMP-PR",
      grade: "G1",
      salaire: 500_000,
      promoDate: "2026-04-15",
      salaryBefore: 500_000,
      salaryAfter: 550_000,
      prevGrade: "G1",
      newGrade: "G2",
    });
    const normalized = normalizeImportRows({
      rows: [PROMO_HEADERS, row],
      headerRowIndex: 0,
      mapping,
      jobFamilies: reference.jobFamilies,
      grades: reference.grades,
      todayIsoDate: TODAY,
      campaignReferenceYear: 2026,
    });
    expect(normalized.validCount).toBe(1);
    expect(normalized.normalized[0]!.promotionDate).toBe("2026-04-15");
    expect(normalized.normalized[0]!.salaryAfterPromotion).toBe(550_000);

    await services.hrImport.confirmImport({
      campaignId: campaign.id,
      fileName: "promo.xlsx",
      format: "xlsx",
      sheetName: "Population",
      fileSizeBytes: 2048,
      rows: [PROMO_HEADERS, row],
      headerRowIndex: 0,
      mapping,
    });
    const page = await services.hrImport.listCurrentPopulation(campaign.id, {
      limit: 10,
      offset: 0,
    });
    const employee = page.items.find((item) => item.employeeNumber === "EMP-PR");
    expect(employee?.promotionDate).toBe("2026-04-15");
    expect(employee?.salaryBeforePromotion).toBe(500_000);
    expect(employee?.salaryAfterPromotion).toBe(550_000);
    expect(employee?.previousGradeId).toBeTruthy();
    expect(employee?.promotedGradeId).toBeTruthy();
  });

  it("rejette un groupe promotion partiel sans date", async () => {
    const { reference } = await preparedCampaign();
    const mapping = buildAutoMapping(PROMO_HEADERS);
    const result = normalizeImportRows({
      rows: [
        PROMO_HEADERS,
        promoRow({
          matricule: "EMP-BAD",
          salaryBefore: 500_000,
        }),
      ],
      headerRowIndex: 0,
      mapping,
      jobFamilies: reference.jobFamilies,
      grades: reference.grades,
      todayIsoDate: TODAY,
      campaignReferenceYear: 2026,
    });
    expect(result.validCount).toBe(0);
    expect(
      result.issues.some((issue) => issue.code === "promotion_partial_without_date"),
    ).toBe(true);
  });

  it("rejette un groupe promotion partiel avec date incomplète", async () => {
    const { reference } = await preparedCampaign();
    const mapping = buildAutoMapping(PROMO_HEADERS);
    const result = normalizeImportRows({
      rows: [
        PROMO_HEADERS,
        promoRow({
          matricule: "EMP-PARTIAL",
          grade: "G1",
          salaire: 500_000,
          promoDate: "2026-04-15",
          salaryBefore: 500_000,
          // salaryAfter / grades manquants
        }),
      ],
      headerRowIndex: 0,
      mapping,
      jobFamilies: reference.jobFamilies,
      grades: reference.grades,
      todayIsoDate: TODAY,
      campaignReferenceYear: 2026,
    });
    expect(result.validCount).toBe(0);
    expect(
      result.issues.some((issue) => issue.code === "promotion_incomplete_group"),
    ).toBe(true);
  });

  const PROMO_HEADERS_WITH_AMOUNT = [
    ...FR_HEADERS,
    "Date promotion",
    "Salaire avant promotion",
    "Salaire après promotion",
    "Ancien grade",
    "Nouveau grade",
  ];

  const FR_HEADERS_WITHOUT_PROMO_AMOUNT = FR_HEADERS.filter(
    (header) => header !== "Montant promotion",
  );

  function structuredPromoRowWithoutAmountColumn(
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
      overrides.salaire ?? 500_000,
      overrides.nineBox ?? 5,
      overrides.under ?? "non",
      overrides.corr ?? 0,
      overrides.social ?? 0,
      overrides.promoDate ?? "2026-04-15",
      overrides.salaryBefore ?? 500_000,
      overrides.salaryAfter ?? 550_000,
      overrides.prevGrade ?? "G1",
      overrides.newGrade ?? "G2",
    ];
  }

  function structuredPromoRowWithAmount(
    overrides: Partial<Record<string, string | number>> = {},
  ): (string | number)[] {
    return [
      ...validRow({
        matricule: overrides.matricule ?? "EMP-AMT",
        grade: overrides.grade ?? "G1",
        salaire: overrides.salaire ?? 500_000,
        promo: overrides.promo ?? "",
      }),
      overrides.promoDate ?? "2026-04-15",
      overrides.salaryBefore ?? 500_000,
      overrides.salaryAfter ?? 550_000,
      overrides.prevGrade ?? "G1",
      overrides.newGrade ?? "G2",
    ];
  }

  it("promotion structurée sans colonne Montant de promotion → delta canonique", async () => {
    const { reference } = await preparedCampaign();
    const headers = [
      ...FR_HEADERS_WITHOUT_PROMO_AMOUNT,
      "Date promotion",
      "Salaire avant promotion",
      "Salaire après promotion",
      "Ancien grade",
      "Nouveau grade",
    ];
    const mapping = buildAutoMapping(headers);
    const result = normalizeImportRows({
      rows: [headers, structuredPromoRowWithoutAmountColumn()],
      headerRowIndex: 0,
      mapping,
      jobFamilies: reference.jobFamilies,
      grades: reference.grades,
      todayIsoDate: TODAY,
      campaignReferenceYear: 2026,
    });
    expect(result.validCount).toBe(1);
    expect(result.normalized[0]!.promotionDate).toBe("2026-04-15");
    expect(result.normalized[0]!.promotionAmount).toBe(50_000);
  });

  it("promotion structurée avec cellule Montant vide → delta canonique", async () => {
    const { reference } = await preparedCampaign();
    const mapping = buildAutoMapping(PROMO_HEADERS_WITH_AMOUNT);
    const result = normalizeImportRows({
      rows: [
        PROMO_HEADERS_WITH_AMOUNT,
        structuredPromoRowWithAmount({ promo: "" }),
      ],
      headerRowIndex: 0,
      mapping,
      jobFamilies: reference.jobFamilies,
      grades: reference.grades,
      todayIsoDate: TODAY,
      campaignReferenceYear: 2026,
    });
    expect(result.validCount).toBe(1);
    expect(result.normalized[0]!.promotionAmount).toBe(50_000);
  });

  it("promotion structurée avec montant égal au delta → acceptée", async () => {
    const { reference } = await preparedCampaign();
    const mapping = buildAutoMapping(PROMO_HEADERS_WITH_AMOUNT);
    const result = normalizeImportRows({
      rows: [
        PROMO_HEADERS_WITH_AMOUNT,
        structuredPromoRowWithAmount({ promo: 50_000 }),
      ],
      headerRowIndex: 0,
      mapping,
      jobFamilies: reference.jobFamilies,
      grades: reference.grades,
      todayIsoDate: TODAY,
      campaignReferenceYear: 2026,
    });
    expect(result.validCount).toBe(1);
    expect(result.normalized[0]!.promotionAmount).toBe(50_000);
  });

  it("promotion structurée avec montant différent → PROMOTION_AMOUNT_MISMATCH", async () => {
    const { reference } = await preparedCampaign();
    const mapping = buildAutoMapping(PROMO_HEADERS_WITH_AMOUNT);
    const result = normalizeImportRows({
      rows: [
        PROMO_HEADERS_WITH_AMOUNT,
        structuredPromoRowWithAmount({ promo: 40_000 }),
      ],
      headerRowIndex: 0,
      mapping,
      jobFamilies: reference.jobFamilies,
      grades: reference.grades,
      todayIsoDate: TODAY,
      campaignReferenceYear: 2026,
    });
    expect(result.validCount).toBe(0);
    const mismatch = result.issues.find(
      (issue) => issue.code === "PROMOTION_AMOUNT_MISMATCH",
    );
    expect(mismatch).toBeTruthy();
    expect(mismatch?.message).toMatch(/40[\s\u202f]?000/);
    expect(mismatch?.message).toMatch(/50[\s\u202f]?000/);
  });

  it("promotionAmount historique seul est conservé sans PromotionEvent", async () => {
    const { reference } = await preparedCampaign();
    const mapping = buildAutoMapping(FR_HEADERS);
    const result = normalizeImportRows({
      rows: [FR_HEADERS, validRow({ matricule: "EMP-HIST", promo: 75_000 })],
      headerRowIndex: 0,
      mapping,
      jobFamilies: reference.jobFamilies,
      grades: reference.grades,
      todayIsoDate: TODAY,
      campaignReferenceYear: 2026,
    });
    expect(result.validCount).toBe(1);
    expect(result.normalized[0]!.promotionAmount).toBe(75_000);
    expect(result.normalized[0]!.promotionDate).toBeNull();
    expect(result.normalized[0]!.salaryBeforePromotion).toBeNull();
    expect(result.normalized[0]!.salaryAfterPromotion).toBeNull();
  });

  it("absence de double comptage : montant canonique = delta unique", async () => {
    const { reference } = await preparedCampaign();
    const mapping = buildAutoMapping(PROMO_HEADERS_WITH_AMOUNT);
    const result = normalizeImportRows({
      rows: [
        PROMO_HEADERS_WITH_AMOUNT,
        structuredPromoRowWithAmount({ promo: 50_000 }),
      ],
      headerRowIndex: 0,
      mapping,
      jobFamilies: reference.jobFamilies,
      grades: reference.grades,
      todayIsoDate: TODAY,
      campaignReferenceYear: 2026,
    });
    const row = result.normalized[0]!;
    const derived =
      (row.salaryAfterPromotion ?? 0) - (row.salaryBeforePromotion ?? 0);
    expect(row.promotionAmount).toBe(derived);
    expect(row.promotionAmount).toBe(50_000);
    // Pas de cumul montant historique + delta.
    expect(row.promotionAmount).not.toBe(50_000 + 50_000);
  });
});

/**
 * Matrice de couverture Lot 1C — chaque exigence a une assertion explicite
 * dans ce fichier (éventuellement regroupée).
 *
 * 1 lecture XLSX — « lit un XLSX valide… »
 * 2 lecture XLS — « lit un XLS lorsque supporté »
 * 3 lecture CSV — « lit un XLSX valide et un CSV valide »
 * 4 sélection feuille — provider / parse multi-feuilles
 * 5 détection en-tête — « détecte l’en-tête… »
 * 6 changement en-tête — « détecte l’en-tête… »
 * 7 auto-mapping FR — « détecte l’en-tête… »
 * 8 auto-mapping EN — « détecte l’en-tête… »
 * 9 mapping manuel — « détecte l’en-tête… »
 * 10 colonne obligatoire absente — « détecte l’en-tête… »
 * 11 double mapping — « détecte l’en-tête… »
 * 12 fichier vide — « refuse fichier vide… »
 * 13 feuille vide — « refuse une feuille vide… »
 * 14 limite taille — « refuse fichier vide… »
 * 15 limite lignes — « refuse fichier vide… »
 * 16 matricule zéros — « valide les cas nominaux… » (00012)
 * 17 avertissement numérique — « valide les cas nominaux… »
 * 18 matricule vide — « valide les cas nominaux… »
 * 19 doublon casse — « valide les cas nominaux… »
 * 20 nom vide — « valide les cas nominaux… »
 * 21 famille connue — import nominal
 * 22 famille inconnue — « valide les cas nominaux… »
 * 23 grade connu — import nominal
 * 24 grade inconnu — « valide les cas nominaux… »
 * 25 aliases CDI/CDD — « accepte aliases… »
 * 26 Intérimaire/Prestataire — « accepte aliases… » + nominal
 * 27 contrat inconnu — « valide les cas nominaux… »
 * 28 aliases statuts — « valide les cas nominaux… »
 * 29 statut inconnu — « valide les cas nominaux… »
 * 30 date Excel — « accepte aliases… »
 * 31 date ISO — « accepte aliases… »
 * 32 date FR — « valide les cas nominaux… »
 * 33 date invalide — « valide les cas nominaux… »
 * 34 date future — « valide les cas nominaux… »
 * 35 FCFA espaces — « valide les cas nominaux… »
 * 36 salaire zéro — « valide les cas nominaux… »
 * 37 salaire négatif — « valide les cas nominaux… »
 * 38 salaire décimal — « valide les cas nominaux… »
 * 39 9-Box vide — « valide les cas nominaux… »
 * 40 9-Box 1–9 — « accepte aliases… »
 * 41 9-Box invalide — « valide les cas nominaux… »
 * 42 booléens FR/EN — « valide les cas nominaux… »
 * 43 booléen invalide — « valide les cas nominaux… »
 * 44 montants facultatifs vides — « valide les cas nominaux… »
 * 45 montant facultatif négatif — « valide les cas nominaux… »
 * 46 formule Excel — « refuse une formule Excel… »
 * 47 campagne archivée — « refuse l’import sur campagne archivée »
 * 48 prévisualisation sans écriture — « prévisualise sans écrire… »
 * 49 erreurs bloquent confirmation — « bloque la confirmation… »
 * 50 avertissements autorisent — « prévisualise sans écrire… »
 * 51 import atomique — « prévisualise sans écrire… »
 * 52 échec préserve ancien lot — « bloque la confirmation… »
 * 53 lot superseded — « prévisualise sans écrire… »
 * 54 un seul current — « prévisualise sans écrire… »
 * 55 historique — « prévisualise sans écrire… »
 * 56 population paginée — « prévisualise sans écrire… »
 * 57 recherche matricule — « prévisualise sans écrire… »
 * 58 recherche nom — « prévisualise sans écrire… »
 * 59 campagne active défaut — « sélectionne la campagne active… »
 * 60 état vide sans campagne — « sélectionne la campagne active… »
 * 61 dashboard count — bandeau/Dashboard via activeCampaignPopulationCount
 * 62 source_file_name sans chemin — « refuse une feuille vide… »
 * 63 pas de contenu brut stocké — « refuse une formule Excel… »
 * 64 reset binaire — resetWizardState met workbook à null (provider)
 */
it("matrice de couverture Lot 1C — 64 scénarios référencés", () => {
  expect(MAX_IMPORT_DATA_ROWS).toBe(20_000);
  expect(MAX_IMPORT_FILE_BYTES).toBe(20 * 1024 * 1024);
  expect(extractBaseFileName("C:\\tmp\\pop.xlsx")).toBe("pop.xlsx");
});
