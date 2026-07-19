/** Correspondance snake_case (SQLite) → camelCase (domaine) pour l’import RH. */

import {
  CONTRACT_TYPES,
  EMPLOYMENT_STATUSES,
  HR_IMPORT_BATCH_STATUSES,
  HR_IMPORT_FILE_FORMATS,
  type ContractType,
  type EmployeeSnapshot,
  type EmploymentStatus,
  type HrImportBatch,
  type HrImportBatchStatus,
  type HrImportFileFormat,
} from "../../domain/hrImport/models";

export interface HrImportBatchRow {
  id: number;
  campaign_id: number;
  status: string;
  source_file_name: string;
  source_format: string;
  source_sheet_name: string | null;
  file_size_bytes: number;
  source_row_count: number;
  imported_row_count: number;
  warning_count: number;
  imported_at: string;
  created_at: string;
}

export interface HrImportEmployeeRow {
  id: number;
  import_batch_id: number;
  campaign_id: number;
  employee_number: string;
  employee_label: string;
  job_family_id: number;
  grade_id: number;
  contract_type: string;
  employment_status: string;
  hire_date: string;
  december_base_salary: number;
  nine_box_code: number | null;
  confirmed_underperformer: number;
  promotion_amount: number;
  correction_amount: number;
  social_measure_amount: number;
  source_row_number: number;
  created_at: string;
}

export function mapHrImportBatch(row: HrImportBatchRow): HrImportBatch {
  if (!isHrImportBatchStatus(row.status)) {
    throw new Error(`Statut de lot d’import inconnu : ${row.status}`);
  }
  if (!isHrImportFileFormat(row.source_format)) {
    throw new Error(`Format de fichier d’import inconnu : ${row.source_format}`);
  }

  return {
    id: row.id,
    campaignId: row.campaign_id,
    status: row.status,
    sourceFileName: row.source_file_name,
    sourceFormat: row.source_format,
    sourceSheetName: row.source_sheet_name,
    fileSizeBytes: row.file_size_bytes,
    sourceRowCount: row.source_row_count,
    importedRowCount: row.imported_row_count,
    warningCount: row.warning_count,
    importedAt: row.imported_at,
    createdAt: row.created_at,
  };
}

export function mapEmployeeSnapshot(row: HrImportEmployeeRow): EmployeeSnapshot {
  if (!isContractType(row.contract_type)) {
    throw new Error(`Type de contrat inconnu : ${row.contract_type}`);
  }
  if (!isEmploymentStatus(row.employment_status)) {
    throw new Error(`Statut d’emploi inconnu : ${row.employment_status}`);
  }

  return {
    id: row.id,
    importBatchId: row.import_batch_id,
    campaignId: row.campaign_id,
    employeeNumber: row.employee_number,
    employeeLabel: row.employee_label,
    jobFamilyId: row.job_family_id,
    gradeId: row.grade_id,
    contractType: row.contract_type,
    employmentStatus: row.employment_status,
    hireDate: row.hire_date,
    decemberBaseSalary: row.december_base_salary,
    nineBoxCode: row.nine_box_code,
    confirmedUnderperformer: row.confirmed_underperformer === 1,
    promotionAmount: row.promotion_amount,
    correctionAmount: row.correction_amount,
    socialMeasureAmount: row.social_measure_amount,
    sourceRowNumber: row.source_row_number,
    createdAt: row.created_at,
  };
}

function isHrImportBatchStatus(value: string): value is HrImportBatchStatus {
  return (HR_IMPORT_BATCH_STATUSES as readonly string[]).includes(value);
}

function isHrImportFileFormat(value: string): value is HrImportFileFormat {
  return (HR_IMPORT_FILE_FORMATS as readonly string[]).includes(value);
}

function isContractType(value: string): value is ContractType {
  return (CONTRACT_TYPES as readonly string[]).includes(value);
}

function isEmploymentStatus(value: string): value is EmploymentStatus {
  return (EMPLOYMENT_STATUSES as readonly string[]).includes(value);
}
