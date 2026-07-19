/** Moteur individuel pur — positionnement et pondération (Lot 2A-2). */

export {
  absBigInt,
  computeDisplayRatioBasisPoints,
  divRoundHalfUp,
  formatRatioBpsForDisplay,
} from "./arithmetic";
export {
  calculateIndividualMatrixWeight,
} from "./calculateIndividualMatrixWeight";
export {
  CompensationCalculationError,
  isCompensationCalculationError,
  type CompensationCalculationErrorCode,
} from "./errors";
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
export { resolveEvaluationFactor } from "./resolveEvaluationFactor";
export { resolveSalaryPosition } from "./resolveSalaryPosition";
