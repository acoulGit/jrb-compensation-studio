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
import type { PromotionEvent } from "./promotionTrajectory";
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
  /**
   * Date d’embauche canonique ISO `YYYY-MM-DD` (champ import `hireDate`).
   * Obligatoire pour l’incidence d’ancienneté (Lot 2A-H2B).
   */
  hireDate: string;
  performanceLevel?: PerformanceLevel;
  potentialLevel?: PotentialLevel;
  confirmedUnderperformer: boolean;
  /** Promotion structurée importée (Lot 2A-H2C-1) — null si absent. */
  promotion?: PromotionEvent | null;
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
  /** Année de campagne explicite (déterministe — jamais Date.now() dans le moteur). */
  campaignYear: number;
  /** Mois d’application technique (1 = janvier … 12 = décembre). */
  technicalApplicationMonth: number;
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
  /** Date d’embauche ISO (propagée depuis l’entrée préparée). */
  hireDate: string;
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
  /** Année de campagne (calendrier d’application). */
  campaignYear: number;
  /** Mois d’application technique (1–12). */
  technicalApplicationMonth: number;
  /** Mois de rappel = technicalApplicationMonth - 1 (0–11). */
  retroactiveMonths: number;
  /** Mois restants payés directement = 13 - technicalApplicationMonth (1–12). */
  remainingDirectPaymentMonths: number;
  /** Rappel de salaire de base versé au mois d’application. */
  baseSalaryReminderFcfa: bigint;
  /** Coût des augmentations payées directement sur le reste de l’année. */
  remainingYearDirectIncreaseCostFcfa: bigint;
  /**
   * Coût annuel réel de l’augmentation de base (= monthlyFinal × 12).
   * Alias sémantique de annualActualCostFcfa (même valeur).
   */
  annualActualBaseIncreaseCostFcfa: bigint;
  /** Date d’embauche ISO (Lot 2A-H2B). */
  hireDate: string;
  /** Taux d’ancienneté au mois d’application technique (%). */
  technicalApplicationMonthSeniorityRatePercent: number;
  /** Calendrier mensuel janvier–décembre (déterministe). */
  monthlySeniorityImpactSchedule: readonly {
    month: number;
    ratePercent: number;
    monthlySeniorityImpactFcfa: bigint;
    paymentTiming: "reminder" | "direct";
  }[];
  /** Rappel d’incidence d’ancienneté (hors budget). */
  seniorityReminderFcfa: bigint;
  /** Incidence d’ancienneté payée directement sur le reste de l’année. */
  remainingYearDirectSeniorityImpactFcfa: bigint;
  /** Incidence annuelle totale d’ancienneté (hors budget). */
  annualSeniorityImpactFcfa: bigint;
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
  campaignYear: number;
  technicalApplicationMonth: number;
  totalBaseSalaryReminderFcfa: bigint;
  totalRemainingYearDirectIncreaseCostFcfa: bigint;
  totalAnnualActualBaseIncreaseCostFcfa: bigint;
  /** Totaux incidence d’ancienneté (hors budget — Lot 2A-H2B). */
  totalSeniorityReminderFcfa: bigint;
  totalRemainingYearDirectSeniorityImpactFcfa: bigint;
  totalAnnualSeniorityImpactFcfa: bigint;
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
  campaignYear: number;
  technicalApplicationMonth: number;
  totalBaseSalaryReminderFcfa: bigint;
  totalRemainingYearDirectIncreaseCostFcfa: bigint;
  totalAnnualActualBaseIncreaseCostFcfa: bigint;
  totalSeniorityReminderFcfa: bigint;
  totalRemainingYearDirectSeniorityImpactFcfa: bigint;
  totalAnnualSeniorityImpactFcfa: bigint;
  populationSummary: PopulationCalculationSummary;
  explanationSteps: CalculationExplanationStep[];
}

/** Comparaison lexicographique stable (unités de code UTF-16), sans locale. */
export function compareEmployeeIdAsc(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
