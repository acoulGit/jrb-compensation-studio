/** Types SQLite (snake_case) pour le référentiel de rémunération. */

import type { FactorLevel, NineBoxMode } from "../../domain/compensationReference/models";

export interface ReferenceConfigRow {
  campaign_id: number;
  nine_box_mode: string;
  created_at: string;
  updated_at: string;
}

export interface JobFamilyRow {
  id: number;
  campaign_id: number;
  code: string;
  label: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface GradeRow {
  id: number;
  campaign_id: number;
  code: string;
  label: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface SalaryGridRow {
  campaign_id: number;
  job_family_id: number;
  grade_id: number;
  s0_amount: number | null;
  created_at: string;
  updated_at: string;
}

export interface SalaryPositionRow {
  id: number;
  campaign_id: number;
  code: string;
  label: string;
  sort_order: number;
  reference_ratio_bps: number | null;
  position_factor_milli: number;
  created_at: string;
  updated_at: string;
}

export interface LevelFactorRow {
  campaign_id: number;
  level: string;
  label: string;
  sort_order: number;
  factor_milli: number;
  created_at: string;
  updated_at: string;
}

export interface NineBoxFactorRow {
  campaign_id: number;
  box_code: number;
  performance_level: string;
  potential_level: string;
  factor_milli: number;
  created_at: string;
  updated_at: string;
}

export type {
  FactorLevel,
  NineBoxMode,
};
