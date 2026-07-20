/** Modèles orchestrateur population préparée (Lot 2A-4). */

import type { BudgetTargetInput, ResolvedBudgetTarget } from "./budgetTargetModels";
import type { ExactAmount } from "./exactFraction";
import type {
  CalculationExplanationStep,
  EvaluationFactorResult,
  IndividualWeightResult,
  LevelFactorRef,
  MatrixBlockingReason,
  NineBoxFactorRef,
  SalaryPositionInputRow,
  SalaryPositionResult,
} from "./models";
import type { NineBoxMode, PerformanceLevel, PotentialLevel } from "../compensationReference/models";
import type { RoundingPolicy } from "./populationAllocationModels";

/**
 * Convention JRB : répartition du budget ANNUEL proportionnelle au
 * salaire MENSUEL × poids matriciel.
 * Le facteur commun 12 s’annule dans la répartition ; annualiser le poids
 * ne change pas les parts relatives.
 * Même poids matriciel ⇒ même taux théorique d’augmentation mensuel.
 */
export const ALLOCATION_BASIS_SALARY_TIMES_MATRIX_WEIGHT =
  "salary_times_effective_matrix_weight" as const;

export type AllocationBasis =
  typeof ALLOCATION_BASIS_SALARY_TIMES_MATRIX_WEIGHT;

/** Cellule S0 fournie à l’orchestrateur (indépendante de l’import RH). */
export interface PreparedSalaryGridCell {
  familyCode: string;
  gradeCode: string;
  familyLabel?: string;
  gradeLabel?: string;
  s0Fcfa: number | bigint | null;
}

export interface PreparedEmployeeCalculationInput {
  employeeId: string;
  familyCode: string;
  gradeCode: string;
  salaryFcfa: number | bigint;
  performanceLevel?: PerformanceLevel;
  potentialLevel?: PotentialLevel;
  confirmedUnderperformer: boolean;
}

export interface PopulationCalculationReferences {
  evaluationMode: NineBoxMode;
  salaryGrid: readonly PreparedSalaryGridCell[];
  salaryPositions: readonly SalaryPositionInputRow[];
  performanceFactors: readonly LevelFactorRef[];
  potentialFactors: readonly LevelFactorRef[];
  nineBoxFactors: readonly NineBoxFactorRef[];
}

export interface PreparedPopulationCalculationInput {
  employees: readonly PreparedEmployeeCalculationInput[];
  references: PopulationCalculationReferences;
  budgetTarget: BudgetTargetInput;
  roundingPolicy: RoundingPolicy;
}

export interface PopulationCalculationIssue {
  employeeId?: string;
  code: string;
  field?: string;
  message: string;
  step?: string;
  details?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface PopulationCalculationValidationResult {
  isValid: boolean;
  issues: PopulationCalculationIssue[];
}

export interface EmployeeS0Resolution {
  familyCode: string;
  gradeCode: string;
  familyLabel?: string;
  gradeLabel?: string;
  s0Fcfa: bigint;
  explanationSteps: CalculationExplanationStep[];
}

export interface PreparedEmployeeCalculationResult {
  employeeId: string;
  familyCode: string;
  gradeCode: string;
  salaryFcfa: bigint;
  s0Resolution: EmployeeS0Resolution;
  salaryPositionResult: SalaryPositionResult;
  evaluationFactorResult: EvaluationFactorResult;
  individualMatrixWeightResult: IndividualWeightResult;
  theoreticalMatrixWeight: ExactAmount;
  effectiveMatrixWeight: ExactAmount;
  allocationWeight: ExactAmount;
  blockingReason?: MatrixBlockingReason;
  explanationSteps: CalculationExplanationStep[];
}

export interface EmployeeCompensationCalculationResult {
  employeeId: string;
  familyCode: string;
  gradeCode: string;
  /** Salaire de base mensuel. */
  salaryFcfa: bigint;
  /** Médiane S0 mensuelle. */
  s0Fcfa: bigint;
  salaryRatioBasisPoints: number;
  salaryPositionCode: string;
  salaryPositionLabel: string;
  positionFactorMilli: number;
  evaluationMode: NineBoxMode;
  performanceLevel?: PerformanceLevel;
  potentialLevel?: PotentialLevel;
  evaluationFactorNumerator: number;
  evaluationFactorScale: number;
  theoreticalMatrixWeight: ExactAmount;
  effectiveMatrixWeight: ExactAmount;
  allocationWeight: ExactAmount;
  /**
   * Coefficient de calibrage annuel :
   * annualBudgetTarget / Σ(monthlySalary × effectiveMatrixWeight).
   */
  calibrationCoefficient: ExactAmount;
  /** Part annuelle exacte du budget cible. */
  annualTheoreticalAllocation: ExactAmount;
  /** Augmentation mensuelle théorique = annualTheoreticalAllocation / 12. */
  monthlyTheoreticalIncrease: ExactAmount;
  /**
   * Taux d’augmentation du salaire mensuel =
   * monthlyTheoreticalIncrease / monthlyBaseSalary.
   */
  monthlyTheoreticalIncreaseRate: ExactAmount;
  /** Augmentation mensuelle finale après arrondi. */
  monthlyFinalRoundedIncreaseFcfa: bigint;
  /** Écart mensuel d’arrondi = final − théorique mensuel. */
  monthlyRoundingDelta: ExactAmount;
  /** Coût annuel réel = monthlyFinalRoundedIncrease × 12. */
  annualActualCostFcfa: bigint;
  /** Écart annuel d’arrondi = annualActualCost − annualTheoreticalAllocation. */
  annualRoundingDelta: ExactAmount;
  /** Nouveau salaire mensuel = salaire mensuel + augmentation mensuelle finale. */
  monthlyFinalSalaryFcfa: bigint;
  blockingReason?: MatrixBlockingReason;
  explanationSteps: CalculationExplanationStep[];
}

export interface PopulationCalculationSummary {
  employeeCount: number;
  positiveWeightEmployeeCount: number;
  zeroWeightEmployeeCount: number;
  confirmedUnderperformerCount: number;
  /** Budget annuel cible exact. */
  annualBudgetTarget: ExactAmount;
  totalAllocationWeight: ExactAmount;
  calibrationCoefficient: ExactAmount;
  /** Σ allocations théoriques annuelles (= budget annuel si poids > 0). */
  annualTheoreticalAllocatedTotal: ExactAmount;
  /** annualTheoreticalAllocatedTotal / 12. */
  monthlyTheoreticalIncreaseTotal: ExactAmount;
  /** Σ (augmentations mensuelles finales × 12). */
  annualActualOperationCostFcfa: bigint;
  /** annualActualOperationCost − annualBudgetTarget. */
  annualTotalRoundingDelta: ExactAmount;
  roundingStepFcfa: bigint;
  evaluationMode: NineBoxMode;
  allocationBasis: AllocationBasis;
  isTheoreticalBudgetExactlyAllocated: boolean;
  /** Somme des salaires MENSUELS de la population (trace informative). */
  populationSalarySumFcfa: bigint;
}

export interface PreparedPopulationCalculationResult {
  budgetTargetResult: ResolvedBudgetTarget;
  evaluationMode: NineBoxMode;
  roundingPolicy: {
    mode: RoundingPolicy["mode"];
    stepFcfa: bigint;
  };
  allocationBasis: AllocationBasis;
  totalAllocationWeight: ExactAmount;
  calibrationCoefficient: ExactAmount;
  employees: EmployeeCompensationCalculationResult[];
  /** Alias explicite : total théorique ANNUEL. */
  annualTheoreticalAllocatedTotal: ExactAmount;
  annualActualOperationCostFcfa: bigint;
  annualTotalRoundingDelta: ExactAmount;
  populationSummary: PopulationCalculationSummary;
  explanationSteps: CalculationExplanationStep[];
}

/** Comparaison lexicographique stable (unités de code UTF-16), sans locale. */
export function compareEmployeeIdAsc(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
