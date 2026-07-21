/** Erreurs typées du moteur de calcul (Lots 2A-2 / 2A-3 / 2A-4). */

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
  | "INVALID_ROUNDING_STEP"
  // Lot 2A-4 — orchestrateur
  | "S0_REFERENCE_NOT_FOUND"
  | "DUPLICATE_S0_REFERENCE"
  | "INVALID_FAMILY_CODE"
  | "INVALID_GRADE_CODE"
  | "EMPLOYEE_CALCULATION_FAILED"
  | "POPULATION_CALCULATION_FAILED"
  | "INVALID_ALLOCATION_WEIGHT"
  | "INCOMPLETE_CALCULATION_REFERENCES"
  // Lot 2A-H2A — calendrier d’application / rappel
  | "INVALID_CAMPAIGN_YEAR"
  | "INVALID_TECHNICAL_APPLICATION_MONTH"
  | "INVALID_MONTHLY_FINAL_INCREASE"
  | "INVALID_RETROACTIVE_MONTHS"
  | "INVALID_REMAINING_DIRECT_PAYMENT_MONTHS"
  | "APPLICATION_CALENDAR_INVARIANT_FAILED"
  | "BASE_SALARY_REMINDER_INVARIANT_FAILED"
  // Lot 2A-H2D-1 — rétroactivité configurable
  | "INVALID_RETROACTIVITY_START_MONTH"
  | "RETROACTIVITY_MONTH_AFTER_APPLICATION_MONTH"
  | "SIMULATION_SNAPSHOT_SCHEMA_REQUIRES_CONSOLIDATION"
  // Lot 2A-H2B — incidence d’ancienneté
  | "MISSING_HIRE_DATE"
  | "INVALID_HIRE_DATE"
  | "HIRE_DATE_AFTER_CAMPAIGN_YEAR"
  | "INVALID_SENIORITY_RATE"
  | "INVALID_SENIORITY_ANNIVERSARY_COUNT"
  | "SENIORITY_IMPACT_INVARIANT_FAILED"
  // Lot 2A-H2C-2 — moteur budget promotion / calibrage compensatoire
  | "INVALID_EMPLOYMENT_STATUS"
  | "INVALID_COMPENSATORY_MEASURE_ELIGIBLE"
  | "PROMOTION_COST_EXCEEDS_BUDGET"
  | "NO_COMPENSATORY_ALLOCATION_CAPACITY"
  | "PROMOTION_BUDGET_INVARIANT_FAILED";

export class CompensationCalculationError extends Error {
  readonly code: CompensationCalculationErrorCode;
  /** Issues structurées (population / salarié). */
  readonly issues?: readonly PopulationCalculationIssueLike[];

  constructor(
    code: CompensationCalculationErrorCode,
    message: string,
    issues?: readonly PopulationCalculationIssueLike[],
  ) {
    super(message);
    this.name = "CompensationCalculationError";
    this.code = code;
    this.issues = issues;
  }
}

/** Forme minimale d’une issue (évite cycle d’import avec les modèles). */
export interface PopulationCalculationIssueLike {
  employeeId?: string;
  code: string;
  field?: string;
  message: string;
  step?: string;
  details?: Readonly<Record<string, string | number | boolean | null>>;
}

export function isCompensationCalculationError(
  error: unknown,
): error is CompensationCalculationError {
  return error instanceof CompensationCalculationError;
}
