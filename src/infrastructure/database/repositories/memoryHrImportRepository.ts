/** Double en mémoire de l’import RH, pour les tests (Lot 1C). */

import {
  CONTRACT_TYPES,
  EMPLOYMENT_STATUSES,
  type EmployeeSnapshot,
  type HrImportBatch,
  type ImportConfirmation,
  type PaginatedPopulation,
  type PopulationQuery,
  type PopulationSummary,
} from "../../../domain/hrImport/models";
import {
  DEFAULT_POPULATION_PAGE_SIZE,
  MAX_POPULATION_PAGE_SIZE,
} from "../../imports/importLimits";
import type {
  HrImportRepository,
  ReplacePopulationInput,
} from "./hrImportRepository";

export interface MemoryHrImportRepositoryOptions {
  /** Fait échouer le prochain appel à `replaceCurrentPopulation` (test de rollback). */
  failNextReplace?: boolean;
}

export class MemoryHrImportRepository implements HrImportRepository {
  private batches: HrImportBatch[] = [];
  private employeesByBatchId = new Map<number, EmployeeSnapshot[]>();
  private nextBatchId = 1;
  private nextEmployeeId = 1;
  private failNextReplace: boolean;

  constructor(options: MemoryHrImportRepositoryOptions = {}) {
    this.failNextReplace = options.failNextReplace ?? false;
  }

  /** Permet aux tests de programmer un échec après construction du double. */
  setFailNextReplace(value: boolean): void {
    this.failNextReplace = value;
  }

  async replaceCurrentPopulation(
    input: ReplacePopulationInput,
  ): Promise<ImportConfirmation> {
    if (this.failNextReplace) {
      this.failNextReplace = false;
      throw new Error("Échec simulé de l’import (test).");
    }
    if (input.employees.length === 0) {
      throw new Error("Aucun salarié valide à importer.");
    }

    const now = new Date().toISOString();
    let supersededBatchId: number | null = null;

    const currentBatch = this.batches.find(
      (batch) =>
        batch.campaignId === input.campaignId && batch.status === "current",
    );
    if (currentBatch) {
      currentBatch.status = "superseded";
      supersededBatchId = currentBatch.id;
    }

    const batch: HrImportBatch = {
      id: this.nextBatchId++,
      campaignId: input.campaignId,
      status: "current",
      sourceFileName: input.fileName,
      sourceFormat: input.format,
      sourceSheetName: input.sheetName,
      fileSizeBytes: input.fileSizeBytes,
      sourceRowCount: input.sourceRowCount,
      importedRowCount: input.employees.length,
      warningCount: input.warningCount,
      importedAt: now,
      createdAt: now,
    };
    this.batches.push(batch);

    const employees: EmployeeSnapshot[] = input.employees.map((employee) => ({
      id: this.nextEmployeeId++,
      importBatchId: batch.id,
      campaignId: input.campaignId,
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
      sourceRowNumber: employee.sourceRowNumber,
      createdAt: now,
    }));
    this.employeesByBatchId.set(batch.id, employees);

    return {
      batch: { ...batch },
      importedRowCount: employees.length,
      warningCount: input.warningCount,
      supersededBatchId,
    };
  }

  async getCurrentBatch(campaignId: number): Promise<HrImportBatch | null> {
    const batch = this.batches.find(
      (item) => item.campaignId === campaignId && item.status === "current",
    );
    return batch ? { ...batch } : null;
  }

  async listImportBatches(campaignId: number): Promise<HrImportBatch[]> {
    return this.batches
      .filter((batch) => batch.campaignId === campaignId)
      .sort(
        (a, b) => b.importedAt.localeCompare(a.importedAt) || b.id - a.id,
      )
      .map((batch) => ({ ...batch }));
  }

  async getPopulationSummary(campaignId: number): Promise<PopulationSummary> {
    const currentBatch = await this.getCurrentBatch(campaignId);
    const employees = currentBatch
      ? this.employeesByBatchId.get(currentBatch.id) ?? []
      : [];

    return {
      campaignId,
      currentBatch,
      employeeCount: employees.length,
      nineBoxCount: employees.filter((item) => item.nineBoxCode !== null)
        .length,
      underperformerCount: employees.filter(
        (item) => item.confirmedUnderperformer,
      ).length,
      representedJobFamilyIds: Array.from(
        new Set(employees.map((item) => item.jobFamilyId)),
      ).sort((a, b) => a - b),
      representedGradeIds: Array.from(
        new Set(employees.map((item) => item.gradeId)),
      ).sort((a, b) => a - b),
      contractTypeCounts: countBy(
        CONTRACT_TYPES,
        employees,
        (item) => item.contractType,
      ),
      employmentStatusCounts: countBy(
        EMPLOYMENT_STATUSES,
        employees,
        (item) => item.employmentStatus,
      ),
    };
  }

  async listCurrentPopulation(
    campaignId: number,
    query: PopulationQuery,
  ): Promise<PaginatedPopulation> {
    const currentBatch = await this.getCurrentBatch(campaignId);
    const employees = currentBatch
      ? this.employeesByBatchId.get(currentBatch.id) ?? []
      : [];

    const search = query.search?.trim().toLowerCase();
    const filtered = search
      ? employees.filter(
          (item) =>
            item.employeeNumber.toLowerCase().includes(search) ||
            item.employeeLabel.toLowerCase().includes(search),
        )
      : employees;

    const sorted = [...filtered].sort((a, b) =>
      a.employeeNumber.localeCompare(b.employeeNumber),
    );
    const limit = clampLimit(query.limit);
    const offset = Math.max(0, Math.trunc(query.offset) || 0);

    return {
      items: sorted.slice(offset, offset + limit).map((item) => ({ ...item })),
      total: sorted.length,
      limit,
      offset,
    };
  }

  async getCurrentPopulationCount(campaignId: number): Promise<number> {
    const currentBatch = await this.getCurrentBatch(campaignId);
    if (!currentBatch) {
      return 0;
    }
    return this.employeesByBatchId.get(currentBatch.id)?.length ?? 0;
  }
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_POPULATION_PAGE_SIZE;
  }
  return Math.min(Math.trunc(limit), MAX_POPULATION_PAGE_SIZE);
}

function countBy<TKey extends string, TItem>(
  keys: readonly TKey[],
  items: TItem[],
  getKey: (item: TItem) => TKey,
): Readonly<Record<TKey, number>> {
  const counts = {} as Record<TKey, number>;
  for (const key of keys) {
    counts[key] = 0;
  }
  for (const item of items) {
    const key = getKey(item);
    counts[key] += 1;
  }
  return counts;
}
