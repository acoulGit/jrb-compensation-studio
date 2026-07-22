/** Valeurs de démarrage du référentiel (non métier, configurables). */

import type {
  FactorLevel,
  NineBoxMode,
  PerformanceLevel,
  PotentialLevel,
} from "./models";

export { DEFAULT_NINE_BOX_ORIENTATION } from "./nineBoxOrientation";

export interface DefaultJobFamilySeed {
  code: string;
  label: string;
  sortOrder: number;
}

export interface DefaultGradeSeed {
  code: string;
  label: string;
  sortOrder: number;
}

export interface DefaultSalaryPositionSeed {
  code: string;
  label: string;
  sortOrder: number;
  referenceRatioBps: number | null;
  positionFactorMilli: number;
}

export interface DefaultLevelFactorSeed {
  level: FactorLevel;
  label: string;
  sortOrder: number;
  factorMilli: number;
}

export interface DefaultNineBoxSeed {
  boxCode: number;
  performanceLevel: PerformanceLevel;
  potentialLevel: PotentialLevel;
  factorMilli: number;
}

export const DEFAULT_NINE_BOX_MODE: NineBoxMode = "none";

/** Coefficient provisoire 9-Box (millièmes) — Lot 2B-RC1-H2 ; 900 = 0,900. */
export const DEFAULT_NINE_BOX_CONFIRMATION_FACTOR_MILLI = 900;

export const DEFAULT_JOB_FAMILIES: readonly DefaultJobFamilySeed[] = [
  { code: "F1", label: "Famille 1", sortOrder: 1 },
  { code: "F2", label: "Famille 2", sortOrder: 2 },
  { code: "F3", label: "Famille 3", sortOrder: 3 },
  { code: "F4", label: "Famille 4", sortOrder: 4 },
  { code: "F5", label: "Famille 5", sortOrder: 5 },
] as const;

export const DEFAULT_GRADES: readonly DefaultGradeSeed[] = [
  { code: "G1", label: "Grade 1", sortOrder: 1 },
  { code: "G2", label: "Grade 2", sortOrder: 2 },
  { code: "G3", label: "Grade 3", sortOrder: 3 },
  { code: "G4", label: "Grade 4", sortOrder: 4 },
  { code: "G5", label: "Grade 5", sortOrder: 5 },
  { code: "G6", label: "Grade 6", sortOrder: 6 },
] as const;

export const DEFAULT_SALARY_POSITIONS: readonly DefaultSalaryPositionSeed[] = [
  {
    code: "Sout-",
    label: "Sout-",
    sortOrder: 1,
    referenceRatioBps: null,
    positionFactorMilli: 1300,
  },
  {
    code: "S7-",
    label: "S7-",
    sortOrder: 2,
    referenceRatioBps: 6500,
    positionFactorMilli: 1250,
  },
  {
    code: "S6-",
    label: "S6-",
    sortOrder: 3,
    referenceRatioBps: 7000,
    positionFactorMilli: 1200,
  },
  {
    code: "S5-",
    label: "S5-",
    sortOrder: 4,
    referenceRatioBps: 7500,
    positionFactorMilli: 1150,
  },
  {
    code: "S4-",
    label: "S4-",
    sortOrder: 5,
    referenceRatioBps: 8000,
    positionFactorMilli: 1100,
  },
  {
    code: "S3-",
    label: "S3-",
    sortOrder: 6,
    referenceRatioBps: 8500,
    positionFactorMilli: 1050,
  },
  {
    code: "S2-",
    label: "S2-",
    sortOrder: 7,
    referenceRatioBps: 9000,
    positionFactorMilli: 1000,
  },
  {
    code: "S1-",
    label: "S1-",
    sortOrder: 8,
    referenceRatioBps: 9500,
    positionFactorMilli: 950,
  },
  {
    code: "S0",
    label: "S0",
    sortOrder: 9,
    referenceRatioBps: 10000,
    positionFactorMilli: 900,
  },
  {
    code: "S1+",
    label: "S1+",
    sortOrder: 10,
    referenceRatioBps: 10500,
    positionFactorMilli: 850,
  },
  {
    code: "S2+",
    label: "S2+",
    sortOrder: 11,
    referenceRatioBps: 11000,
    positionFactorMilli: 800,
  },
  {
    code: "S3+",
    label: "S3+",
    sortOrder: 12,
    referenceRatioBps: 11500,
    positionFactorMilli: 750,
  },
  {
    code: "S4+",
    label: "S4+",
    sortOrder: 13,
    referenceRatioBps: 12000,
    positionFactorMilli: 650,
  },
  {
    code: "S5+",
    label: "S5+",
    sortOrder: 14,
    referenceRatioBps: 12500,
    positionFactorMilli: 550,
  },
  {
    code: "S6+",
    label: "S6+",
    sortOrder: 15,
    referenceRatioBps: 13000,
    positionFactorMilli: 450,
  },
  {
    code: "S7+",
    label: "S7+",
    sortOrder: 16,
    referenceRatioBps: 13500,
    positionFactorMilli: 300,
  },
  {
    code: "Sout+",
    label: "Sout+",
    sortOrder: 17,
    referenceRatioBps: null,
    positionFactorMilli: 100,
  },
] as const;

export const DEFAULT_PERFORMANCE_FACTORS: readonly DefaultLevelFactorSeed[] = [
  { level: "low", label: "Faible", sortOrder: 1, factorMilli: 250 },
  { level: "medium", label: "Moyenne", sortOrder: 2, factorMilli: 1000 },
  { level: "high", label: "Élevée", sortOrder: 3, factorMilli: 1250 },
] as const;

export const DEFAULT_POTENTIAL_FACTORS: readonly DefaultLevelFactorSeed[] = [
  { level: "low", label: "Faible", sortOrder: 1, factorMilli: 950 },
  { level: "medium", label: "Moyen", sortOrder: 2, factorMilli: 1000 },
  { level: "high", label: "Élevé", sortOrder: 3, factorMilli: 1050 },
] as const;

export const DEFAULT_NINE_BOX_FACTORS: readonly DefaultNineBoxSeed[] = [
  {
    boxCode: 1,
    performanceLevel: "low",
    potentialLevel: "low",
    factorMilli: 200,
  },
  {
    boxCode: 2,
    performanceLevel: "medium",
    potentialLevel: "low",
    factorMilli: 800,
  },
  {
    boxCode: 3,
    performanceLevel: "high",
    potentialLevel: "low",
    factorMilli: 1100,
  },
  {
    boxCode: 4,
    performanceLevel: "low",
    potentialLevel: "medium",
    factorMilli: 250,
  },
  {
    boxCode: 5,
    performanceLevel: "medium",
    potentialLevel: "medium",
    factorMilli: 1000,
  },
  {
    boxCode: 6,
    performanceLevel: "high",
    potentialLevel: "medium",
    factorMilli: 1250,
  },
  {
    boxCode: 7,
    performanceLevel: "low",
    potentialLevel: "high",
    factorMilli: 300,
  },
  {
    boxCode: 8,
    performanceLevel: "medium",
    potentialLevel: "high",
    factorMilli: 1100,
  },
  {
    boxCode: 9,
    performanceLevel: "high",
    potentialLevel: "high",
    factorMilli: 1400,
  },
] as const;
