/** Implémentation SQLite de l’import RH versionné par campagne (Lot 1C). */

import { invoke } from "@tauri-apps/api/core";
import {
  CONTRACT_TYPES,
  EMPLOYMENT_STATUSES,
  type HrImportBatch,
  type ImportConfirmation,
  type PaginatedPopulation,
  type PopulationQuery,
  type PopulationSummary,
} from "../../../domain/hrImport/models";
import { AppError } from "../../../services/errors";
import {
  DEFAULT_POPULATION_PAGE_SIZE,
  MAX_POPULATION_PAGE_SIZE,
} from "../../imports/importLimits";
import { getDatabase } from "../connection";
import {
  mapEmployeeSnapshot,
  mapHrImportBatch,
  type HrImportBatchRow,
  type HrImportEmployeeRow,
} from "../hrImportMappers";
import type {
  HrImportRepository,
  ReplacePopulationInput,
} from "./hrImportRepository";

function logImportMilestone(event: string, detail?: Record<string, number>): void {
  if (!import.meta.env.DEV) {
    return;
  }
  if (detail) {
    console.info(`[${event}]`, detail);
  } else {
    console.info(`[${event}]`);
  }
}

function invokeErrorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message;
    }
  }
  return "La confirmation de l’import a échoué.";
}

interface ReplacePopulationCommandResult {
  batch: {
    id: number;
    campaignId: number;
    status: string;
    sourceFileName: string;
    sourceFormat: string;
    sourceSheetName: string | null;
    fileSizeBytes: number;
    sourceRowCount: number;
    importedRowCount: number;
    warningCount: number;
    importedAt: string;
    createdAt: string;
  };
  importedRowCount: number;
  warningCount: number;
  supersededBatchId: number | null;
}

function validateReplaceInput(input: ReplacePopulationInput): void {
  if (!Number.isInteger(input.campaignId) || input.campaignId <= 0) {
    throw new Error("Campagne d’import invalide.");
  }
  if (!input.fileName.trim()) {
    throw new Error("Le nom du fichier source est obligatoire.");
  }
  if (input.fileName.includes("/") || input.fileName.includes("\\")) {
    throw new Error("Le nom du fichier source ne doit pas contenir de chemin.");
  }
  if (!["xlsx", "xls", "csv"].includes(input.format)) {
    throw new Error("Format de fichier non pris en charge.");
  }
  if (!Number.isFinite(input.fileSizeBytes) || input.fileSizeBytes <= 0) {
    throw new Error("La taille du fichier doit être strictement positive.");
  }
  if (input.employees.length === 0) {
    throw new Error("Aucun salarié valide à importer.");
  }
  for (const employee of input.employees) {
    if (!employee.employeeNumber.trim() || !employee.employeeLabel.trim()) {
      throw new Error("Chaque salarié doit avoir un matricule et un libellé.");
    }
    if (
      !Number.isInteger(employee.jobFamilyId) ||
      employee.jobFamilyId <= 0 ||
      !Number.isInteger(employee.gradeId) ||
      employee.gradeId <= 0
    ) {
      throw new Error("Famille ou grade invalide dans les lignes à importer.");
    }
  }
}

const BATCH_SELECT = `SELECT id, campaign_id, status, source_file_name, source_format,
                              source_sheet_name, file_size_bytes, source_row_count,
                              imported_row_count, warning_count, imported_at, created_at
                       FROM hr_import_batches`;

const EMPLOYEE_SELECT = `SELECT e.id, e.import_batch_id, e.campaign_id, e.employee_number,
                                 e.employee_label, e.job_family_id, e.grade_id, e.contract_type,
                                 e.employment_status, e.hire_date, e.december_base_salary,
                                 e.nine_box_code, e.confirmed_underperformer,
                                 e.neutralize_nine_box_effect, e.promotion_amount,
                                 e.correction_amount, e.social_measure_amount,
                                 e.promotion_date, e.salary_before_promotion, e.salary_after_promotion,
                                 e.previous_grade_id, e.promoted_grade_id,
                                 e.previous_job_family_id, e.promoted_job_family_id,
                                 e.source_row_number, e.created_at
                          FROM hr_import_employees e
                          INNER JOIN hr_import_batches b ON b.id = e.import_batch_id`;

export class SqliteHrImportRepository implements HrImportRepository {
  async replaceCurrentPopulation(
    input: ReplacePopulationInput,
  ): Promise<ImportConfirmation> {
    validateReplaceInput(input);
    logImportMilestone("HR_IMPORT_TX_BEGIN");

    try {
      const result = await invoke<ReplacePopulationCommandResult>(
        "replace_current_population",
        {
          input: {
            campaignId: input.campaignId,
            fileName: input.fileName,
            format: input.format,
            sheetName: input.sheetName,
            fileSizeBytes: input.fileSizeBytes,
            sourceRowCount: input.sourceRowCount,
            warningCount: input.warningCount,
            employees: input.employees.map((employee) => ({
              sourceRowNumber: employee.sourceRowNumber,
              employeeNumber: employee.employeeNumber,
              employeeLabel: employee.employeeLabel,
              jobFamilyId: employee.jobFamilyId,
              gradeId: employee.gradeId,
              contractType: employee.contractType,
              employmentStatus: employee.employmentStatus,
              hireDate: employee.hireDate,
              decemberBaseSalary: employee.decemberBaseSalary,
              nineBoxCode: employee.nineBoxCode,
              confirmedUnderperformer: employee.confirmedUnderperformer,
              neutralizeNineBoxEffect: employee.neutralizeNineBoxEffect,
              promotionAmount: employee.promotionAmount,
              correctionAmount: employee.correctionAmount,
              socialMeasureAmount: employee.socialMeasureAmount,
              promotionDate: employee.promotionDate,
              salaryBeforePromotion: employee.salaryBeforePromotion,
              salaryAfterPromotion: employee.salaryAfterPromotion,
              previousGradeId: employee.previousGradeId,
              promotedGradeId: employee.promotedGradeId,
              previousJobFamilyId: employee.previousJobFamilyId,
              promotedJobFamilyId: employee.promotedJobFamilyId,
            })),
          },
        },
      );

      if (result.supersededBatchId !== null) {
        logImportMilestone("HR_IMPORT_OLD_BATCH_SUPERSEDED");
      }
      logImportMilestone("HR_IMPORT_BATCH_INSERTED", {
        batchId: result.batch.id,
      });
      logImportMilestone("HR_IMPORT_INSERT_COUNT_VERIFIED");
      logImportMilestone("HR_IMPORT_TX_COMMIT");

      const batch = mapHrImportBatch({
        id: result.batch.id,
        campaign_id: result.batch.campaignId,
        status: result.batch.status,
        source_file_name: result.batch.sourceFileName,
        source_format: result.batch.sourceFormat,
        source_sheet_name: result.batch.sourceSheetName,
        file_size_bytes: result.batch.fileSizeBytes,
        source_row_count: result.batch.sourceRowCount,
        imported_row_count: result.batch.importedRowCount,
        warning_count: result.batch.warningCount,
        imported_at: result.batch.importedAt,
        created_at: result.batch.createdAt,
      });

      return {
        batch,
        importedRowCount: result.importedRowCount,
        warningCount: result.warningCount,
        supersededBatchId: result.supersededBatchId,
      };
    } catch (error) {
      logImportMilestone("HR_IMPORT_TX_ROLLBACK");
      throw new AppError("PERSISTENCE", invokeErrorMessage(error));
    }
  }

  async getCurrentBatch(campaignId: number): Promise<HrImportBatch | null> {
    const db = await getDatabase();
    const rows = await db.select<HrImportBatchRow[]>(
      `${BATCH_SELECT} WHERE campaign_id = $1 AND status = 'current'`,
      [campaignId],
    );
    const row = rows[0];
    return row ? mapHrImportBatch(row) : null;
  }

  async listImportBatches(campaignId: number): Promise<HrImportBatch[]> {
    const db = await getDatabase();
    const rows = await db.select<HrImportBatchRow[]>(
      `${BATCH_SELECT} WHERE campaign_id = $1 ORDER BY imported_at DESC, id DESC`,
      [campaignId],
    );
    return rows.map(mapHrImportBatch);
  }

  async getPopulationSummary(campaignId: number): Promise<PopulationSummary> {
    const currentBatch = await this.getCurrentBatch(campaignId);
    if (!currentBatch) {
      return {
        campaignId,
        currentBatch: null,
        employeeCount: 0,
        nineBoxCount: 0,
        underperformerCount: 0,
        representedJobFamilyIds: [],
        representedGradeIds: [],
        contractTypeCounts: buildZeroCounts(CONTRACT_TYPES),
        employmentStatusCounts: buildZeroCounts(EMPLOYMENT_STATUSES),
      };
    }

    const db = await getDatabase();
    const [totalsRows, familyRows, gradeRows, contractRows, statusRows] =
      await Promise.all([
        db.select<
          {
            employee_count: number;
            nine_box_count: number;
            underperformer_count: number;
          }[]
        >(
          `SELECT COUNT(*) as employee_count,
                  COALESCE(SUM(CASE WHEN nine_box_code IS NOT NULL THEN 1 ELSE 0 END), 0) as nine_box_count,
                  COALESCE(SUM(CASE WHEN confirmed_underperformer = 1 THEN 1 ELSE 0 END), 0) as underperformer_count
           FROM hr_import_employees
           WHERE import_batch_id = $1`,
          [currentBatch.id],
        ),
        db.select<{ job_family_id: number }[]>(
          "SELECT DISTINCT job_family_id FROM hr_import_employees WHERE import_batch_id = $1",
          [currentBatch.id],
        ),
        db.select<{ grade_id: number }[]>(
          "SELECT DISTINCT grade_id FROM hr_import_employees WHERE import_batch_id = $1",
          [currentBatch.id],
        ),
        db.select<{ contract_type: string; row_count: number }[]>(
          `SELECT contract_type, COUNT(*) as row_count FROM hr_import_employees
           WHERE import_batch_id = $1 GROUP BY contract_type`,
          [currentBatch.id],
        ),
        db.select<{ employment_status: string; row_count: number }[]>(
          `SELECT employment_status, COUNT(*) as row_count FROM hr_import_employees
           WHERE import_batch_id = $1 GROUP BY employment_status`,
          [currentBatch.id],
        ),
      ]);

    const totals = totalsRows[0];

    return {
      campaignId,
      currentBatch,
      employeeCount: totals?.employee_count ?? 0,
      nineBoxCount: totals?.nine_box_count ?? 0,
      underperformerCount: totals?.underperformer_count ?? 0,
      representedJobFamilyIds: familyRows
        .map((row) => row.job_family_id)
        .sort((a, b) => a - b),
      representedGradeIds: gradeRows
        .map((row) => row.grade_id)
        .sort((a, b) => a - b),
      contractTypeCounts: fillCounts(
        CONTRACT_TYPES,
        contractRows,
        (row) => row.contract_type,
        (row) => row.row_count,
      ),
      employmentStatusCounts: fillCounts(
        EMPLOYMENT_STATUSES,
        statusRows,
        (row) => row.employment_status,
        (row) => row.row_count,
      ),
    };
  }

  async listCurrentPopulation(
    campaignId: number,
    query: PopulationQuery,
  ): Promise<PaginatedPopulation> {
    const db = await getDatabase();
    const limit = clampLimit(query.limit);
    const offset = Math.max(0, Math.trunc(query.offset) || 0);
    const search = query.search?.trim();

    const filters = ["b.campaign_id = $1", "b.status = 'current'"];
    const params: unknown[] = [campaignId];

    if (search) {
      params.push(`%${search}%`);
      const searchIndex = params.length;
      filters.push(
        `(e.employee_number LIKE $${searchIndex} COLLATE NOCASE OR e.employee_label LIKE $${searchIndex} COLLATE NOCASE)`,
      );
    }

    const whereClause = filters.join(" AND ");

    const countRows = await db.select<{ total: number }[]>(
      `SELECT COUNT(*) as total
       FROM hr_import_employees e
       INNER JOIN hr_import_batches b ON b.id = e.import_batch_id
       WHERE ${whereClause}`,
      params,
    );
    const total = countRows[0]?.total ?? 0;

    const pageParams = [...params, limit, offset];
    const limitIndex = params.length + 1;
    const offsetIndex = params.length + 2;

    const rows = await db.select<HrImportEmployeeRow[]>(
      `${EMPLOYEE_SELECT}
       WHERE ${whereClause}
       ORDER BY e.employee_number
       LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      pageParams,
    );

    return {
      items: rows.map(mapEmployeeSnapshot),
      total,
      limit,
      offset,
    };
  }

  async getCurrentPopulationCount(campaignId: number): Promise<number> {
    const db = await getDatabase();
    const rows = await db.select<{ total: number }[]>(
      `SELECT COUNT(*) as total
       FROM hr_import_employees e
       INNER JOIN hr_import_batches b ON b.id = e.import_batch_id
       WHERE b.campaign_id = $1 AND b.status = 'current'`,
      [campaignId],
    );
    return rows[0]?.total ?? 0;
  }
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_POPULATION_PAGE_SIZE;
  }
  return Math.min(Math.trunc(limit), MAX_POPULATION_PAGE_SIZE);
}

function buildZeroCounts<TKey extends string>(
  keys: readonly TKey[],
): Record<TKey, number> {
  const counts = {} as Record<TKey, number>;
  for (const key of keys) {
    counts[key] = 0;
  }
  return counts;
}

function fillCounts<TKey extends string, TRow>(
  keys: readonly TKey[],
  rows: TRow[],
  getKey: (row: TRow) => string,
  getCount: (row: TRow) => number,
): Readonly<Record<TKey, number>> {
  const counts = buildZeroCounts(keys);
  for (const row of rows) {
    const key = getKey(row);
    if ((keys as readonly string[]).includes(key)) {
      counts[key as TKey] = getCount(row);
    }
  }
  return counts;
}
