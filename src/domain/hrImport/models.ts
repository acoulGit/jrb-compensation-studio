/** Modèles de domaine de l’import RH versionné par campagne (Lot 1C). */

export type HrImportBatchStatus = "current" | "superseded";

export const HR_IMPORT_BATCH_STATUSES: readonly HrImportBatchStatus[] = [
  "current",
  "superseded",
] as const;

export type HrImportFileFormat = "xlsx" | "xls" | "csv";

export const HR_IMPORT_FILE_FORMATS: readonly HrImportFileFormat[] = [
  "xlsx",
  "xls",
  "csv",
] as const;

export type ContractType =
  | "cdi"
  | "cdd"
  | "temporary"
  | "contractor"
  | "other";

export const CONTRACT_TYPES: readonly ContractType[] = [
  "cdi",
  "cdd",
  "temporary",
  "contractor",
  "other",
] as const;

export const CONTRACT_TYPE_LABELS: Readonly<Record<ContractType, string>> = {
  cdi: "CDI",
  cdd: "CDD",
  temporary: "Intérimaire",
  contractor: "Prestataire",
  other: "Autre",
};

export type EmploymentStatus =
  | "active"
  | "group_detachment"
  | "legal_leave"
  | "external_availability"
  | "suspended"
  | "departed"
  | "other";

export const EMPLOYMENT_STATUSES: readonly EmploymentStatus[] = [
  "active",
  "group_detachment",
  "legal_leave",
  "external_availability",
  "suspended",
  "departed",
  "other",
] as const;

export const EMPLOYMENT_STATUS_LABELS: Readonly<
  Record<EmploymentStatus, string>
> = {
  active: "Actif",
  group_detachment: "Détachement groupe",
  legal_leave: "Congé légal",
  external_availability: "Disponibilité hors groupe",
  suspended: "Suspendu",
  departed: "Départ",
  other: "Autre",
};

/** Colonnes obligatoires (une valeur exploitable est requise sur chaque ligne). */
export type RequiredHrImportColumnKey =
  | "employeeNumber"
  | "employeeLabel"
  | "jobFamilyCode"
  | "gradeCode"
  | "contractType"
  | "employmentStatus"
  | "hireDate"
  | "decemberBaseSalary";

/** Colonnes optionnelles (valeur par défaut appliquée si absente). */
export type OptionalHrImportColumnKey =
  | "nineBoxCode"
  | "confirmedUnderperformer"
  | "neutralizeNineBoxEffect"
  | "promotionAmount"
  | "correctionAmount"
  | "socialMeasureAmount"
  | "promotionDate"
  | "salaryBeforePromotion"
  | "salaryAfterPromotion"
  | "previousGradeCode"
  | "promotedGradeCode"
  | "previousJobFamilyCode"
  | "promotedJobFamilyCode";

export type HrImportColumnKey =
  | RequiredHrImportColumnKey
  | OptionalHrImportColumnKey;

export interface HrImportColumn {
  key: HrImportColumnKey;
  label: string;
  required: boolean;
}

export const REQUIRED_IMPORT_COLUMNS: readonly HrImportColumn[] = [
  { key: "employeeNumber", label: "Matricule", required: true },
  { key: "employeeLabel", label: "Nom complet", required: true },
  { key: "jobFamilyCode", label: "Famille de métiers", required: true },
  { key: "gradeCode", label: "Grade", required: true },
  { key: "contractType", label: "Type de contrat", required: true },
  { key: "employmentStatus", label: "Statut d’emploi", required: true },
  { key: "hireDate", label: "Date d’embauche", required: true },
  {
    key: "decemberBaseSalary",
    label: "Salaire de base décembre N-1",
    required: true,
  },
] as const;

export const OPTIONAL_IMPORT_COLUMNS: readonly HrImportColumn[] = [
  { key: "nineBoxCode", label: "Code 9-Box", required: false },
  {
    key: "confirmedUnderperformer",
    label: "Sous-performant confirmé",
    required: false,
  },
  {
    key: "neutralizeNineBoxEffect",
    label: "Neutraliser effet 9-Box",
    required: false,
  },
  { key: "promotionAmount", label: "Montant de promotion", required: false },
  { key: "correctionAmount", label: "Montant de correction", required: false },
  {
    key: "socialMeasureAmount",
    label: "Montant mesure RH / sociale",
    required: false,
  },
  { key: "promotionDate", label: "Date de promotion", required: false },
  {
    key: "salaryBeforePromotion",
    label: "Salaire de base avant promotion",
    required: false,
  },
  {
    key: "salaryAfterPromotion",
    label: "Salaire de base après promotion",
    required: false,
  },
  { key: "previousGradeCode", label: "Ancien grade", required: false },
  { key: "promotedGradeCode", label: "Nouveau grade", required: false },
  {
    key: "previousJobFamilyCode",
    label: "Ancienne famille de métiers",
    required: false,
  },
  {
    key: "promotedJobFamilyCode",
    label: "Nouvelle famille de métiers",
    required: false,
  },
] as const;

/** Association entre un champ cible et la colonne source (ou aucune). */
export interface HrImportColumnMappingEntry {
  targetField: HrImportColumnKey;
  sourceHeader: string | null;
  sourceIndex: number | null;
}

export type HrImportColumnMapping = readonly HrImportColumnMappingEntry[];

/** Feuille d’un classeur analysée, indépendamment du format source. */
export interface ParsedSheet {
  name: string;
  /** Lignes candidates pour la détection d’en-tête, en texte affichable. */
  headerCandidateRows: string[][];
  /** Lignes de données situées après l’en-tête retenu, en texte affichable. */
  dataRows: string[][];
}

export interface ParsedWorkbook {
  fileName: string;
  format: HrImportFileFormat;
  sheets: ParsedSheet[];
}

/** Ligne brute issue du fichier, avant résolution des identifiants. */
export interface RawImportRow {
  sourceRowNumber: number;
  cells: readonly unknown[];
}

/** Ligne normalisée, avec identifiants résolus et statut de validité. */
export interface NormalizedImportRow {
  sourceRowNumber: number;
  isValid: boolean;
  employeeNumber: string | null;
  employeeLabel: string | null;
  jobFamilyId: number | null;
  jobFamilyCode: string | null;
  jobFamilyLabel: string | null;
  gradeId: number | null;
  gradeCode: string | null;
  gradeLabel: string | null;
  contractType: ContractType | null;
  employmentStatus: EmploymentStatus | null;
  hireDate: string | null;
  decemberBaseSalary: number | null;
  nineBoxCode: number | null;
  confirmedUnderperformer: boolean;
  /** Défaut métier = false (Non) si colonne absente ou vide. */
  neutralizeNineBoxEffect: boolean;
  promotionAmount: number;
  correctionAmount: number;
  socialMeasureAmount: number;
  /** Groupe promotion structuré (Lot 2A-H2C-1) — null si aucune promotion. */
  promotionDate: string | null;
  salaryBeforePromotion: number | null;
  salaryAfterPromotion: number | null;
  previousGradeId: number | null;
  previousGradeCode: string | null;
  promotedGradeId: number | null;
  promotedGradeCode: string | null;
  previousJobFamilyId: number | null;
  previousJobFamilyCode: string | null;
  promotedJobFamilyId: number | null;
  promotedJobFamilyCode: string | null;
}

/** Salarié persisté (snapshot d’un lot d’import), forme domaine camelCase. */
export interface EmployeeSnapshot {
  id: number;
  importBatchId: number;
  campaignId: number;
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
  /** Défaut métier = false (Non). */
  neutralizeNineBoxEffect: boolean;
  promotionAmount: number;
  correctionAmount: number;
  socialMeasureAmount: number;
  /** Groupe promotion structuré (Lot 2A-H2C-1) — null si aucune promotion. */
  promotionDate: string | null;
  salaryBeforePromotion: number | null;
  salaryAfterPromotion: number | null;
  previousGradeId: number | null;
  promotedGradeId: number | null;
  previousJobFamilyId: number | null;
  promotedJobFamilyId: number | null;
  sourceRowNumber: number;
  createdAt: string;
}

export interface HrImportBatch {
  id: number;
  campaignId: number;
  status: HrImportBatchStatus;
  sourceFileName: string;
  sourceFormat: HrImportFileFormat;
  sourceSheetName: string | null;
  fileSizeBytes: number;
  sourceRowCount: number;
  importedRowCount: number;
  warningCount: number;
  importedAt: string;
  createdAt: string;
}

export type HrImportIssueSeverity = "error" | "warning";

export interface HrImportIssue {
  severity: HrImportIssueSeverity;
  code: string;
  sourceRowNumber: number | null;
  field: string | null;
  message: string;
}

/** Aperçu produit avant confirmation de l’import (aucune écriture en base). */
export interface HrImportPreview {
  fileName: string;
  format: HrImportFileFormat;
  sheetName: string;
  headerRowIndex: number;
  mapping: HrImportColumnMappingEntry[];
  sourceRowCount: number;
  validCount: number;
  errorCount: number;
  warningCount: number;
  duplicateNumbers: number;
  issues: HrImportIssue[];
  sampleRows: NormalizedImportRow[];
}

/** Résumé d’un lot confirmé et persisté. */
export interface HrImportSummary {
  batch: HrImportBatch;
  issues: HrImportIssue[];
}

export interface PopulationSummary {
  campaignId: number;
  currentBatch: HrImportBatch | null;
  employeeCount: number;
  nineBoxCount: number;
  underperformerCount: number;
  representedJobFamilyIds: number[];
  representedGradeIds: number[];
  contractTypeCounts: Readonly<Record<ContractType, number>>;
  employmentStatusCounts: Readonly<Record<EmploymentStatus, number>>;
}

export interface PaginatedPopulation {
  items: EmployeeSnapshot[];
  total: number;
  limit: number;
  offset: number;
}

/** Résultat de la confirmation d’un import (bascule du lot courant). */
export interface ImportConfirmation {
  batch: HrImportBatch;
  importedRowCount: number;
  warningCount: number;
  supersededBatchId: number | null;
}

export interface PopulationQuery {
  limit: number;
  offset: number;
  search?: string;
}
