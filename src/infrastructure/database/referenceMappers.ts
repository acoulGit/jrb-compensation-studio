import {
  FACTOR_LEVELS,
  NINE_BOX_MODES,
  type CompensationReferenceConfig,
  type CompensationReferenceSet,
  type FactorLevel,
  type Grade,
  type JobFamily,
  type NineBoxFactor,
  type NineBoxMode,
  type NineBoxOrientation,
  type PerformanceFactor,
  type PotentialFactor,
  type SalaryGridCell,
  type SalaryPosition,
} from "../../domain/compensationReference/models";
import { NINE_BOX_ORIENTATIONS } from "../../domain/compensationReference/nineBoxOrientation";
import type {
  GradeRow,
  JobFamilyRow,
  LevelFactorRow,
  NineBoxFactorRow,
  ReferenceConfigRow,
  SalaryGridRow,
  SalaryPositionRow,
} from "./referenceTypes";

export function mapReferenceConfig(
  row: ReferenceConfigRow,
): CompensationReferenceConfig {
  if (!isNineBoxMode(row.nine_box_mode)) {
    throw new Error(`Mode 9-Box inconnu : ${row.nine_box_mode}`);
  }
  if (!isNineBoxOrientation(row.nine_box_orientation)) {
    throw new Error(
      `Orientation 9-Box inconnue : ${row.nine_box_orientation}`,
    );
  }
  return {
    campaignId: row.campaign_id,
    nineBoxMode: row.nine_box_mode,
    nineBoxOrientation: row.nine_box_orientation,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapJobFamily(row: JobFamilyRow): JobFamily {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    code: row.code,
    label: row.label,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapGrade(row: GradeRow): Grade {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    code: row.code,
    label: row.label,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSalaryGridCell(row: SalaryGridRow): SalaryGridCell {
  return {
    campaignId: row.campaign_id,
    jobFamilyId: row.job_family_id,
    gradeId: row.grade_id,
    s0Amount: row.s0_amount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSalaryPosition(row: SalaryPositionRow): SalaryPosition {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    code: row.code,
    label: row.label,
    sortOrder: row.sort_order,
    referenceRatioBps: row.reference_ratio_bps,
    positionFactorMilli: row.position_factor_milli,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPerformanceFactor(row: LevelFactorRow): PerformanceFactor {
  if (!isFactorLevel(row.level)) {
    throw new Error(`Niveau de performance inconnu : ${row.level}`);
  }
  return {
    campaignId: row.campaign_id,
    level: row.level,
    label: row.label,
    sortOrder: row.sort_order,
    factorMilli: row.factor_milli,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPotentialFactor(row: LevelFactorRow): PotentialFactor {
  if (!isFactorLevel(row.level)) {
    throw new Error(`Niveau de potentiel inconnu : ${row.level}`);
  }
  return {
    campaignId: row.campaign_id,
    level: row.level,
    label: row.label,
    sortOrder: row.sort_order,
    factorMilli: row.factor_milli,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapNineBoxFactor(row: NineBoxFactorRow): NineBoxFactor {
  if (!isFactorLevel(row.performance_level)) {
    throw new Error(
      `Niveau de performance 9-Box inconnu : ${row.performance_level}`,
    );
  }
  if (!isFactorLevel(row.potential_level)) {
    throw new Error(
      `Niveau de potentiel 9-Box inconnu : ${row.potential_level}`,
    );
  }
  return {
    campaignId: row.campaign_id,
    boxCode: row.box_code,
    performanceLevel: row.performance_level,
    potentialLevel: row.potential_level,
    factorMilli: row.factor_milli,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function assembleReferenceSet(
  campaignId: number,
  config: CompensationReferenceConfig,
  jobFamilies: JobFamily[],
  grades: Grade[],
  salaryGrid: SalaryGridCell[],
  salaryPositions: SalaryPosition[],
  performanceFactors: PerformanceFactor[],
  potentialFactors: PotentialFactor[],
  nineBoxFactors: NineBoxFactor[],
): CompensationReferenceSet {
  return {
    campaignId,
    config,
    jobFamilies: [...jobFamilies].sort((a, b) => a.sortOrder - b.sortOrder),
    grades: [...grades].sort((a, b) => a.sortOrder - b.sortOrder),
    salaryGrid: [...salaryGrid],
    salaryPositions: [...salaryPositions].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    ),
    performanceFactors: [...performanceFactors].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    ),
    potentialFactors: [...potentialFactors].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    ),
    nineBoxFactors: [...nineBoxFactors].sort((a, b) => a.boxCode - b.boxCode),
  };
}

function isNineBoxMode(value: string): value is NineBoxMode {
  return (NINE_BOX_MODES as readonly string[]).includes(value);
}

function isNineBoxOrientation(value: string): value is NineBoxOrientation {
  return (NINE_BOX_ORIENTATIONS as readonly string[]).includes(value);
}

function isFactorLevel(value: string): value is FactorLevel {
  return (FACTOR_LEVELS as readonly string[]).includes(value);
}
