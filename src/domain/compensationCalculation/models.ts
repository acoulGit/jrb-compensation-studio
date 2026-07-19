/** Modèles du moteur individuel de positionnement et pondération (Lot 2A-2). */

import type {
  FactorLevel,
  NineBoxMode,
  PerformanceLevel,
  PotentialLevel,
  SalaryPosition,
} from "../compensationReference/models";

/** Échelle uniforme du facteur d’évaluation (1 000 000 = 1,000). */
export const EVALUATION_FACTOR_SCALE = 1_000_000;

/** Échelle uniforme du poids individuel composite. */
export const INDIVIDUAL_WEIGHT_SCALE = 1_000_000_000;

/** Facteur d’évaluation neutre (mode `none`) : 1,000. */
export const NEUTRAL_EVALUATION_FACTOR_SCALED = EVALUATION_FACTOR_SCALE;

export type MatrixBlockingReason = "CONFIRMED_UNDERPERFORMER";

export interface CalculationExplanationStep {
  /** Code stable machine. */
  code: string;
  /** Libellé français. */
  label: string;
  inputValues: Readonly<Record<string, string | number | boolean | null>>;
  outputValue: string | number | boolean | null;
  formula: string;
  reason: string;
}

/** Position salariale minimale pour le calcul (sans métadonnées de campagne). */
export interface SalaryPositionInputRow {
  code: string;
  label: string;
  referenceRatioBps: number | null;
  positionFactorMilli: number;
}

/** Facteur de niveau minimal pour le moteur. */
export interface LevelFactorRef {
  level: FactorLevel;
  factorMilli: number;
}

/** Facteur 9-Box minimal (boxCode optionnel, hors clé métier). */
export interface NineBoxFactorRef {
  performanceLevel: PerformanceLevel;
  potentialLevel: PotentialLevel;
  factorMilli: number;
  boxCode?: number;
}

export interface SalaryPositionInput {
  salaryFcfa: number;
  s0Fcfa: number;
  salaryPositions: readonly SalaryPositionInputRow[];
}

export interface SalaryPositionResult {
  salaryFcfa: number;
  s0Fcfa: number;
  /** Ratio Salaire/S0 en basis points entiers (half-up), pour affichage. */
  ratioBasisPoints: number;
  positionCode: string;
  positionLabel: string;
  positionFactorMilli: number;
  /** Borne basse inclusive du voisinage (bps), null pour Sout-. */
  lowerBoundaryBps: number | null;
  /** Borne haute inclusive du voisinage (bps), null pour Sout+. */
  upperBoundaryBps: number | null;
  /** Ratio de référence retenu (bps), null pour Sout- / Sout+. */
  referenceRatioBps: number | null;
  explanation: CalculationExplanationStep[];
}

export interface EvaluationFactorInput {
  mode: NineBoxMode;
  performanceLevel?: PerformanceLevel;
  potentialLevel?: PotentialLevel;
  performanceFactors: readonly LevelFactorRef[];
  potentialFactors: readonly LevelFactorRef[];
  nineBoxFactors: readonly NineBoxFactorRef[];
}

export interface EvaluationFactorSelection {
  kind:
    | "neutral"
    | "performance"
    | "nine_box"
    | "performance_potential";
  performanceLevel?: PerformanceLevel;
  potentialLevel?: PotentialLevel;
  performanceFactorMilli?: number;
  potentialFactorMilli?: number;
  nineBoxFactorMilli?: number;
  nineBoxCode?: number;
}

export interface EvaluationFactorResult {
  mode: NineBoxMode;
  performanceLevel?: PerformanceLevel;
  potentialLevel?: PotentialLevel;
  selectedFactors: EvaluationFactorSelection;
  /** Numérateur entier du facteur (échelle EVALUATION_FACTOR_SCALE). */
  exactFactorNumerator: number;
  exactFactorScale: typeof EVALUATION_FACTOR_SCALE;
  explanation: CalculationExplanationStep[];
}

export interface IndividualWeightInput extends SalaryPositionInput {
  mode: NineBoxMode;
  performanceLevel?: PerformanceLevel;
  potentialLevel?: PotentialLevel;
  performanceFactors: readonly LevelFactorRef[];
  potentialFactors: readonly LevelFactorRef[];
  nineBoxFactors: readonly NineBoxFactorRef[];
  confirmedUnderperformer?: boolean;
}

export interface IndividualWeightResult {
  salaryPosition: SalaryPositionResult;
  evaluationFactor: EvaluationFactorResult;
  /** Poids théorique (avant blocage sous-performant). */
  theoreticalWeightNumerator: bigint;
  /** Poids effectif (0 si bloqué). */
  exactWeightNumerator: bigint;
  exactWeightScale: typeof INDIVIDUAL_WEIGHT_SCALE;
  isZero: boolean;
  blockingReason?: MatrixBlockingReason;
  explanationSteps: CalculationExplanationStep[];
}

export function toSalaryPositionInputRows(
  positions: readonly SalaryPosition[],
): SalaryPositionInputRow[] {
  return positions.map((position) => ({
    code: position.code,
    label: position.label,
    referenceRatioBps: position.referenceRatioBps,
    positionFactorMilli: position.positionFactorMilli,
  }));
}
