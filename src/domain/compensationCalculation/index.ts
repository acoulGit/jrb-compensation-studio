/** Moteur de calcul pur — Lots 2A-2, 2A-3 et 2A-4 (orchestrateur population). */

export {
  absBigInt,
  computeDisplayRatioBasisPoints,
  divRoundHalfUp,
  formatRatioBpsForDisplay,
} from "./arithmetic";
export { allocateTheoreticalPopulationBudget } from "./allocateTheoreticalPopulationBudget";
export {
  BUDGET_TARGET_MODES,
  type BudgetTargetInput,
  type BudgetTargetMode,
  type ResolvedBudgetTarget,
} from "./budgetTargetModels";
export { calculateIndividualMatrixWeight } from "./calculateIndividualMatrixWeight";
export {
  buildAllocationWeight,
  calculatePreparedEmployeeCompensation,
} from "./calculatePreparedEmployeeCompensation";
export { calculatePreparedPopulationCompensation } from "./calculatePreparedPopulationCompensation";
export { calculatePopulationBudgetAllocation } from "./calculatePopulationBudgetAllocation";
export {
  CompensationCalculationError,
  isCompensationCalculationError,
  type CompensationCalculationErrorCode,
  type PopulationCalculationIssueLike,
} from "./errors";
export {
  addFractions,
  compareFractions,
  divideFractions,
  exactAmountFromInteger,
  formatExactAmount,
  fractionsEqual,
  gcdBigInt,
  isNonNegativeFraction,
  isZeroFraction,
  lcmBigInt,
  multiplyFractions,
  reduceFraction,
  roundFractionToStepHalfUp,
  subtractFractions,
  type ExactAmount,
} from "./exactFraction";
export {
  EVALUATION_FACTOR_SCALE,
  INDIVIDUAL_WEIGHT_SCALE,
  NEUTRAL_EVALUATION_FACTOR_SCALED,
  toSalaryPositionInputRows,
  type CalculationExplanationStep,
  type EvaluationFactorInput,
  type EvaluationFactorResult,
  type EvaluationFactorSelection,
  type IndividualWeightInput,
  type IndividualWeightResult,
  type LevelFactorRef,
  type MatrixBlockingReason,
  type NineBoxFactorRef,
  type SalaryPositionInput,
  type SalaryPositionInputRow,
  type SalaryPositionResult,
} from "./models";
export {
  ROUNDING_MODES,
  type CalculatePopulationBudgetAllocationInput,
  type PopulationAllocationEmployeeInput,
  type PopulationBudgetAllocationResult,
  type RoundedEmployeeAllocation,
  type RoundingMode,
  type RoundingPolicy,
  type RoundPopulationAllocationsInput,
  type TheoreticalEmployeeAllocation,
  type TheoreticalPopulationAllocationInput,
  type TheoreticalPopulationAllocationResult,
} from "./populationAllocationModels";
export {
  ALLOCATION_BASIS_SALARY_TIMES_MATRIX_WEIGHT,
  compareEmployeeIdAsc,
  type AllocationBasis,
  type EmployeeCompensationCalculationResult,
  type EmployeeS0Resolution,
  type PopulationCalculationIssue,
  type PopulationCalculationReferences,
  type PopulationCalculationSummary,
  type PopulationCalculationValidationResult,
  type PreparedEmployeeCalculationInput,
  type PreparedEmployeeCalculationResult,
  type PreparedPopulationCalculationInput,
  type PreparedPopulationCalculationResult,
  type PreparedSalaryGridCell,
} from "./preparedPopulationModels";
export { resolveBudgetTarget } from "./resolveBudgetTarget";
export { resolveEmployeeS0 } from "./resolveEmployeeS0";
export { resolveEvaluationFactor } from "./resolveEvaluationFactor";
export { resolveSalaryPosition } from "./resolveSalaryPosition";
export { roundPopulationAllocations } from "./roundPopulationAllocations";
export {
  validatePreparedPopulationCalculationInput,
} from "./validatePreparedPopulationCalculationInput";
