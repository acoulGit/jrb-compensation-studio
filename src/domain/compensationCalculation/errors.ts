/** Erreurs typées du moteur de calcul (Lots 2A-2 / 2A-3). */

export type CompensationCalculationErrorCode =
  // Lot 2A-2 — individuel
  | "INVALID_SALARY"
  | "INVALID_S0"
  | "EMPTY_POSITION_REFERENCE"
  | "DUPLICATE_POSITION"
  | "INCOHERENT_POSITION_THRESHOLDS"
  | "POSITION_NOT_FOUND"
  | "MISSING_PERFORMANCE_LEVEL"
  | "MISSING_POTENTIAL_LEVEL"
  | "DUPLICATE_FACTOR"
  | "FACTOR_NOT_FOUND"
  | "INVALID_FACTOR"
  | "UNSUPPORTED_EVALUATION_MODE"
  // Lot 2A-3 — budget cible
  | "UNSUPPORTED_BUDGET_TARGET_MODE"
  | "MISSING_MANUAL_BUDGET"
  | "INVALID_MANUAL_BUDGET"
  | "MISSING_ELIGIBLE_PAYROLL"
  | "INVALID_ELIGIBLE_PAYROLL"
  | "MISSING_BUDGET_RATE"
  | "INVALID_BUDGET_RATE"
  // Lot 2A-3 — population / poids
  | "EMPTY_POPULATION"
  | "DUPLICATE_EMPLOYEE_ID"
  | "INVALID_EMPLOYEE_ID"
  | "INVALID_WEIGHT"
  | "INVALID_WEIGHT_SCALE"
  | "NO_POSITIVE_WEIGHT"
  // Lot 2A-3 — allocation théorique
  | "INVALID_BUDGET_TARGET"
  | "THEORETICAL_ALLOCATION_RECONCILIATION_FAILED"
  // Lot 2A-3 — arrondi
  | "MISSING_ROUNDING_POLICY"
  | "UNSUPPORTED_ROUNDING_MODE"
  | "INVALID_ROUNDING_STEP";

export class CompensationCalculationError extends Error {
  readonly code: CompensationCalculationErrorCode;

  constructor(code: CompensationCalculationErrorCode, message: string) {
    super(message);
    this.name = "CompensationCalculationError";
    this.code = code;
  }
}

export function isCompensationCalculationError(
  error: unknown,
): error is CompensationCalculationError {
  return error instanceof CompensationCalculationError;
}
