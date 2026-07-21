/** Contrat de persistance de l’import RH versionné par campagne (Lot 1C). */

import type {
  ContractType,
  EmploymentStatus,
  HrImportBatch,
  HrImportFileFormat,
  ImportConfirmation,
  PaginatedPopulation,
  PopulationQuery,
  PopulationSummary,
} from "../../../domain/hrImport/models";

/** Ligne prête à insérer : identiques aux `NormalizedImportRow` valides, sans champ `null`. */
export interface InsertableEmployeeRow {
  sourceRowNumber: number;
  employeeNumber: string;
  employeeLabel: string;
  jobFamilyId: number;
  gradeId: number;
  contractType: ContractType;
  employmentStatus: EmploymentStatus;
  hireDate: string;
  decemberBaseSalary: number;
  nineBoxCode: number | null;
  confirmedUnderperformer: boolean;
  promotionAmount: number;
  correctionAmount: number;
  socialMeasureAmount: number;
  promotionDate: string | null;
  salaryBeforePromotion: number | null;
  salaryAfterPromotion: number | null;
  previousGradeId: number | null;
  promotedGradeId: number | null;
  previousJobFamilyId: number | null;
  promotedJobFamilyId: number | null;
}

export interface ReplacePopulationInput {
  campaignId: number;
  /** Nom de base du fichier (chemin déjà retiré). */
  fileName: string;
  format: HrImportFileFormat;
  sheetName: string | null;
  fileSizeBytes: number;
  sourceRowCount: number;
  warningCount: number;
  employees: InsertableEmployeeRow[];
}

export interface HrImportRepository {
  /** Bascule le lot courant en `superseded` et insère le nouveau lot `current`. */
  replaceCurrentPopulation(
    input: ReplacePopulationInput,
  ): Promise<ImportConfirmation>;
  getCurrentBatch(campaignId: number): Promise<HrImportBatch | null>;
  listImportBatches(campaignId: number): Promise<HrImportBatch[]>;
  getPopulationSummary(campaignId: number): Promise<PopulationSummary>;
  listCurrentPopulation(
    campaignId: number,
    query: PopulationQuery,
  ): Promise<PaginatedPopulation>;
  getCurrentPopulationCount(campaignId: number): Promise<number>;
}
