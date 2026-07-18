/** Modèles de domaine du référentiel de rémunération (Lot 1B). */

export type NineBoxMode =
  | "none"
  | "performance_only"
  | "full_nine_box"
  | "performance_potential";

export const NINE_BOX_MODES: readonly NineBoxMode[] = [
  "none",
  "performance_only",
  "full_nine_box",
  "performance_potential",
] as const;

export type FactorLevel = "low" | "medium" | "high";

export const FACTOR_LEVELS: readonly FactorLevel[] = [
  "low",
  "medium",
  "high",
] as const;

export const JOB_FAMILY_COUNT = 5;
export const GRADE_COUNT = 6;
export const SALARY_GRID_CELL_COUNT = JOB_FAMILY_COUNT * GRADE_COUNT;
export const SALARY_POSITION_COUNT = 17;
export const PERFORMANCE_FACTOR_COUNT = 3;
export const POTENTIAL_FACTOR_COUNT = 3;
export const NINE_BOX_FACTOR_COUNT = 9;

export const MAX_CODE_LENGTH = 16;
export const MAX_LABEL_LENGTH = 80;
export const MAX_FACTOR_MILLI = 10_000;
export const MIN_FACTOR_MILLI = 0;

export interface CompensationReferenceConfig {
  campaignId: number;
  nineBoxMode: NineBoxMode;
  createdAt: string;
  updatedAt: string;
}

export interface JobFamily {
  id: number;
  campaignId: number;
  code: string;
  label: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Grade {
  id: number;
  campaignId: number;
  code: string;
  label: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SalaryGridCell {
  campaignId: number;
  jobFamilyId: number;
  gradeId: number;
  s0Amount: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SalaryPosition {
  id: number;
  campaignId: number;
  code: string;
  label: string;
  sortOrder: number;
  /** Ratio en basis points (10000 = 100 %). NULL pour Sout- / Sout+. */
  referenceRatioBps: number | null;
  /** Coefficient en millièmes (1000 = 1,000). */
  positionFactorMilli: number;
  createdAt: string;
  updatedAt: string;
}

export interface PerformanceFactor {
  campaignId: number;
  level: FactorLevel;
  label: string;
  sortOrder: number;
  factorMilli: number;
  createdAt: string;
  updatedAt: string;
}

export interface PotentialFactor {
  campaignId: number;
  level: FactorLevel;
  label: string;
  sortOrder: number;
  factorMilli: number;
  createdAt: string;
  updatedAt: string;
}

export interface NineBoxFactor {
  campaignId: number;
  boxCode: number;
  performanceLevel: FactorLevel;
  potentialLevel: FactorLevel;
  factorMilli: number;
  createdAt: string;
  updatedAt: string;
}

export interface CompensationReferenceSet {
  campaignId: number;
  config: CompensationReferenceConfig;
  jobFamilies: JobFamily[];
  grades: Grade[];
  salaryGrid: SalaryGridCell[];
  salaryPositions: SalaryPosition[];
  performanceFactors: PerformanceFactor[];
  potentialFactors: PotentialFactor[];
  nineBoxFactors: NineBoxFactor[];
}

export type CompletenessSectionStatus = "complete" | "incomplete" | "not_required";

export interface ReferenceValidationIssue {
  code: string;
  message: string;
  section:
    | "structure"
    | "salary_grid"
    | "positions"
    | "performance"
    | "potential"
    | "nine_box"
    | "mode"
    | "general";
}

export interface ReferenceCompleteness {
  ready: boolean;
  badge: "Prêt" | "À compléter";
  completedSections: number;
  totalSections: number;
  percent: number;
  structureComplete: boolean;
  salaryGridComplete: boolean;
  salaryGridFilledCount: number;
  salaryGridTotal: number;
  positionsComplete: boolean;
  performanceStatus: CompletenessSectionStatus;
  potentialStatus: CompletenessSectionStatus;
  nineBoxStatus: CompletenessSectionStatus;
  nineBoxMode: NineBoxMode;
  issues: ReferenceValidationIssue[];
}

export interface StructureItemInput {
  id: number;
  code: string;
  label: string;
}

export interface SalaryGridCellInput {
  jobFamilyId: number;
  gradeId: number;
  s0Amount: number | null;
}

export interface FactorMilliUpdate {
  idOrKey: string;
  factorMilli: number;
}

export interface SalaryPositionFactorInput {
  id: number;
  positionFactorMilli: number;
}

export interface LevelFactorInput {
  level: FactorLevel;
  factorMilli: number;
}

export interface NineBoxFactorInput {
  boxCode: number;
  factorMilli: number;
}
