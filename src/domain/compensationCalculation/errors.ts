/** Erreurs typées du moteur individuel (Lot 2A-2). */

export type CompensationCalculationErrorCode =
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
  | "UNSUPPORTED_EVALUATION_MODE";

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
