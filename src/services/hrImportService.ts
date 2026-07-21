/** Orchestration de l’import RH versionné par campagne (Lot 1C). */

import { computeReferenceCompleteness } from "../domain/compensationReference/completeness";
import type {
  HrImportBatch,
  HrImportColumnKey,
  HrImportColumnMappingEntry,
  HrImportFileFormat,
  HrImportIssue,
  HrImportPreview,
  ImportConfirmation,
  NormalizedImportRow,
  PaginatedPopulation,
  PopulationQuery,
  PopulationSummary,
} from "../domain/hrImport/models";
import {
  buildAutoMapping as buildAutoMappingFromHeaders,
  validateMapping as validateColumnMapping,
} from "../infrastructure/imports/columnMapping";
import { detectHeaderRow } from "../infrastructure/imports/headerDetection";
import {
  extractBaseFileName,
  parseSpreadsheetBuffer,
} from "../infrastructure/imports/spreadsheetParser";
import { MAX_IMPORT_DATA_ROWS } from "../infrastructure/imports/importLimits";
import { normalizeImportRows } from "../infrastructure/imports/rowNormalizer";
import type { ParsedImportFile } from "../infrastructure/imports/workbookTypes";
import type { CampaignRepository } from "../infrastructure/database/repositories/campaignRepository";
import type {
  HrImportRepository,
  InsertableEmployeeRow,
} from "../infrastructure/database/repositories/hrImportRepository";
import type { Campaign } from "../infrastructure/database/types";
import { AppError } from "./errors";
import type { CompensationReferenceService } from "./compensationReferenceService";

/** Nombre de lignes normalisées conservées pour l’aperçu affiché à l’écran. */
const PREVIEW_SAMPLE_SIZE = 20;

export interface ParseFileInput {
  arrayBuffer: ArrayBuffer;
  fileName: string;
  fileSizeBytes: number;
}

export interface BuildPreviewInput {
  campaignId: number;
  fileName: string;
  format: HrImportFileFormat;
  sheetName: string;
  rows: unknown[][];
  headerRowIndex: number;
  mapping: HrImportColumnMappingEntry[];
  todayIsoDate?: string;
}

export interface ConfirmImportInput {
  campaignId: number;
  fileName: string;
  format: HrImportFileFormat;
  sheetName: string;
  fileSizeBytes: number;
  rows: unknown[][];
  headerRowIndex: number;
  mapping: HrImportColumnMappingEntry[];
  todayIsoDate?: string;
}

function defaultClock(): string {
  return new Date().toISOString().slice(0, 10);
}

export class HrImportService {
  constructor(
    private readonly campaignRepository: CampaignRepository,
    private readonly referenceService: CompensationReferenceService,
    private readonly hrImportRepository: HrImportRepository,
    private readonly clock: () => string = defaultClock,
  ) {}

  async parseFile(input: ParseFileInput): Promise<ParsedImportFile> {
    try {
      return await parseSpreadsheetBuffer(input);
    } catch (error) {
      throw new AppError(
        "VALIDATION",
        error instanceof Error
          ? error.message
          : "Le fichier importé n’a pas pu être lu.",
      );
    }
  }

  detectHeaderRowIndex(rows: unknown[][]): number {
    return detectHeaderRow(rows);
  }

  buildAutoMapping(headers: string[]): HrImportColumnMappingEntry[] {
    return buildAutoMappingFromHeaders(headers);
  }

  updateMappingEntry(
    mapping: HrImportColumnMappingEntry[],
    targetField: HrImportColumnKey,
    sourceIndex: number | null,
    headers: string[],
  ): HrImportColumnMappingEntry[] {
    return mapping.map((entry) =>
      entry.targetField === targetField
        ? {
            targetField,
            sourceHeader:
              sourceIndex !== null ? headers[sourceIndex] ?? null : null,
            sourceIndex,
          }
        : entry,
    );
  }

  validateMapping(mapping: HrImportColumnMappingEntry[]): {
    errors: HrImportIssue[];
  } {
    return validateColumnMapping(mapping);
  }

  async buildPreview(input: BuildPreviewInput): Promise<HrImportPreview> {
    const campaign = await this.requireCampaign(input.campaignId);
    this.ensureNotArchived(campaign);
    this.ensureSheetHasContent(input.rows);
    this.ensureRowLimit(input.rows, input.headerRowIndex);

    const { errors: mappingErrors } = validateColumnMapping(input.mapping);
    const todayIsoDate = input.todayIsoDate ?? this.clock();

    const referenceSet = await this.referenceService.getReferenceSet(
      campaign.id,
    );
    const completeness = computeReferenceCompleteness(referenceSet);

    const {
      normalized,
      issues: rowIssues,
      validCount,
      errorCount,
      warningCount,
      duplicateNumbers,
    } = normalizeImportRows({
      rows: input.rows,
      headerRowIndex: input.headerRowIndex,
      mapping: input.mapping,
      jobFamilies: referenceSet.jobFamilies,
      grades: referenceSet.grades,
      todayIsoDate,
      campaignReferenceYear: campaign.referenceYear,
      referenceIncomplete: !completeness.ready,
    });

    return {
      fileName: extractBaseFileName(input.fileName),
      format: input.format,
      sheetName: input.sheetName,
      headerRowIndex: input.headerRowIndex,
      mapping: [...input.mapping],
      sourceRowCount: normalized.length,
      validCount,
      errorCount: errorCount + mappingErrors.length,
      warningCount,
      duplicateNumbers,
      issues: [...mappingErrors, ...rowIssues],
      sampleRows: normalized.slice(0, PREVIEW_SAMPLE_SIZE),
    };
  }

  async confirmImport(input: ConfirmImportInput): Promise<ImportConfirmation> {
    const campaign = await this.requireCampaign(input.campaignId);
    this.ensureNotArchived(campaign);
    this.ensureSheetHasContent(input.rows);
    this.ensureRowLimit(input.rows, input.headerRowIndex);

    const { errors: mappingErrors } = validateColumnMapping(input.mapping);
    if (mappingErrors.length > 0) {
      throw new AppError(
        "VALIDATION",
        "Le mapping des colonnes contient des erreurs bloquantes. Corrigez-le avant de confirmer l’import.",
      );
    }

    const todayIsoDate = input.todayIsoDate ?? this.clock();
    const referenceSet = await this.referenceService.getReferenceSet(
      campaign.id,
    );
    const completeness = computeReferenceCompleteness(referenceSet);

    const { normalized, validCount, errorCount, warningCount } =
      normalizeImportRows({
      rows: input.rows,
      headerRowIndex: input.headerRowIndex,
      mapping: input.mapping,
      jobFamilies: referenceSet.jobFamilies,
      grades: referenceSet.grades,
      todayIsoDate,
      campaignReferenceYear: campaign.referenceYear,
      referenceIncomplete: !completeness.ready,
    });

    if (errorCount > 0) {
      throw new AppError(
        "VALIDATION",
        "Le fichier contient des lignes en erreur. Corrigez-les avant de confirmer l’import.",
      );
    }
    if (validCount === 0) {
      throw new AppError("VALIDATION", "Aucun salarié valide à importer.");
    }

    const employees = toInsertableRows(normalized);
    if (employees.length === 0) {
      throw new AppError("VALIDATION", "Aucun salarié valide à importer.");
    }

    return this.hrImportRepository.replaceCurrentPopulation({
      campaignId: campaign.id,
      fileName: extractBaseFileName(input.fileName),
      format: input.format,
      sheetName: input.sheetName,
      fileSizeBytes: input.fileSizeBytes,
      sourceRowCount: normalized.length,
      warningCount,
      employees,
    });
  }

  async getCurrentBatch(campaignId: number): Promise<HrImportBatch | null> {
    await this.requireCampaign(campaignId);
    return this.hrImportRepository.getCurrentBatch(campaignId);
  }

  async listBatches(campaignId: number): Promise<HrImportBatch[]> {
    await this.requireCampaign(campaignId);
    return this.hrImportRepository.listImportBatches(campaignId);
  }

  async getPopulationSummary(campaignId: number): Promise<PopulationSummary> {
    await this.requireCampaign(campaignId);
    return this.hrImportRepository.getPopulationSummary(campaignId);
  }

  async listCurrentPopulation(
    campaignId: number,
    query: PopulationQuery,
  ): Promise<PaginatedPopulation> {
    await this.requireCampaign(campaignId);
    return this.hrImportRepository.listCurrentPopulation(campaignId, query);
  }

  async getCurrentPopulationCount(campaignId: number): Promise<number> {
    return this.hrImportRepository.getCurrentPopulationCount(campaignId);
  }

  private async requireCampaign(id: number): Promise<Campaign> {
    const campaign = await this.campaignRepository.getCampaign(id);
    if (!campaign) {
      throw new AppError("NOT_FOUND", "Campagne introuvable.");
    }
    return campaign;
  }

  private ensureNotArchived(campaign: Campaign): void {
    if (campaign.status === "archived") {
      throw new AppError(
        "INVALID_STATE",
        "Cette campagne est archivée : l’import de population est en lecture seule. Restaurez-la pour importer.",
      );
    }
  }

  private ensureSheetHasContent(rows: unknown[][]): void {
    const hasContent = rows.some((row) =>
      (row ?? []).some((cell) => String(cell ?? "").trim() !== ""),
    );
    if (!hasContent) {
      throw new AppError(
        "VALIDATION",
        "La feuille sélectionnée est vide. Choisissez une autre feuille ou un autre fichier.",
      );
    }
  }

  private ensureRowLimit(rows: unknown[][], headerRowIndex: number): void {
    let dataRows = 0;
    for (let index = headerRowIndex + 1; index < rows.length; index += 1) {
      const row = rows[index] ?? [];
      if (row.some((cell) => String(cell ?? "").trim() !== "")) {
        dataRows += 1;
      }
    }
    if (dataRows > MAX_IMPORT_DATA_ROWS) {
      throw new AppError(
        "VALIDATION",
        `Le fichier dépasse la limite de ${MAX_IMPORT_DATA_ROWS} lignes de données.`,
      );
    }
  }
}

/** Ne garde que les lignes valides, avec tous les champs requis renseignés. */
function toInsertableRows(
  rows: NormalizedImportRow[],
): InsertableEmployeeRow[] {
  const result: InsertableEmployeeRow[] = [];
  for (const row of rows) {
    if (!row.isValid) {
      continue;
    }
    if (
      row.employeeNumber === null ||
      row.employeeLabel === null ||
      row.jobFamilyId === null ||
      row.gradeId === null ||
      row.contractType === null ||
      row.employmentStatus === null ||
      row.hireDate === null ||
      row.decemberBaseSalary === null
    ) {
      // Garde-fou défensif : une ligne valide doit avoir tous ses champs requis.
      continue;
    }
    result.push({
      sourceRowNumber: row.sourceRowNumber,
      employeeNumber: row.employeeNumber,
      employeeLabel: row.employeeLabel,
      jobFamilyId: row.jobFamilyId,
      gradeId: row.gradeId,
      contractType: row.contractType,
      employmentStatus: row.employmentStatus,
      hireDate: row.hireDate,
      decemberBaseSalary: row.decemberBaseSalary,
      nineBoxCode: row.nineBoxCode,
      confirmedUnderperformer: row.confirmedUnderperformer,
      promotionAmount: row.promotionAmount,
      correctionAmount: row.correctionAmount,
      socialMeasureAmount: row.socialMeasureAmount,
      promotionDate: row.promotionDate,
      salaryBeforePromotion: row.salaryBeforePromotion,
      salaryAfterPromotion: row.salaryAfterPromotion,
      previousGradeId: row.previousGradeId,
      promotedGradeId: row.promotedGradeId,
      previousJobFamilyId: row.previousJobFamilyId,
      promotedJobFamilyId: row.promotedJobFamilyId,
    });
  }
  return result;
}
