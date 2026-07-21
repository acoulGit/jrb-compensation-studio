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
export {
  ANNUAL_BUDGET_PERIOD_MONTHS,
  CALCULATION_CONTRACT_VERSION,
  EMPLOYER_CHARGES_INCLUDED,
  FULL_YEAR_MONTH_COUNT,
  RESULT_SCHEMA_VERSION,
  RESULT_SCHEMA_VERSION_V2,
  RESULT_SCHEMA_VERSION_LEGACY,
} from "./calculationContract";
export { calculatePreparedPopulationCompensation } from "./calculatePreparedPopulationCompensation";
export {
  CAMPAIGN_YEAR_MAX,
  CAMPAIGN_YEAR_MIN,
  TECHNICAL_APPLICATION_MONTH_LABELS_FR,
  TECHNICAL_APPLICATION_MONTH_MAX,
  TECHNICAL_APPLICATION_MONTH_MIN,
  computeBaseSalaryReminderBreakdown,
  technicalApplicationMonthLabelFr,
  validateApplicationCalendar,
  validateCampaignYear,
  validateTechnicalApplicationMonth,
  type ApplicationCalendarInput,
  type BaseSalaryReminderBreakdown,
} from "./baseSalaryReminder";
export {
  computeCampaignPeriodBreakdown,
  computePromotionBudgetStartMonth,
  computePromotionCampaignPeriodMonthCount,
  isMonthInCampaignPeriod,
  validateCampaignPeriod,
  validateRetroactivityStartMonth,
  type CampaignPeriodBreakdown,
  type CampaignPeriodInput,
} from "./campaignPeriod";
export {
  SENIORITY_IMPACT_CONTRACT_VERSION,
  anniversaryEffectYearMonth,
  ceilFcfaPercentOfAmount,
  computeSeniorityImpactBreakdown,
  effectiveAnniversaryCountAt,
  parseHireDateIso,
  seniorityRatePercentAt,
  seniorityRatePercentFromEffectiveAnniversaryCount,
  validateHireDateForCampaign,
  type MonthlySeniorityImpactEntry,
  type ParsedHireDate,
  type SeniorityImpactBreakdown,
  type SeniorityPaymentTiming,
} from "./seniorityImpact";
export {
  PROMOTION_TRAJECTORY_CONTRACT_VERSION,
  PromotionValidationError,
  buildPromotionAwareMonthlySalaryTrajectory,
  buildPromotionEvent,
  parsePromotionDateIso,
  promotionRateFromAmounts,
  validatePromotionAgainstDecemberSnapshot,
  type MonthlySalaryTrajectoryEntry,
  type PromotionAwareTrajectoryResult,
  type PromotionCampaignCostPreview,
  type PromotionEvent,
  type PromotionInclusionStatus,
} from "./promotionTrajectory";
export {
  PROMOTION_BUDGET_EMPLOYMENT_STATUSES,
  PROMOTION_BUDGET_POPULATION_STATUSES,
  isPromotionBudgetPopulationEmployee,
  type PromotionBudgetEmploymentStatus,
} from "./promotionBudgetPopulation";
export {
  COMPENSATORY_ELIGIBLE_CONTRACT_TYPES,
  COMPENSATORY_MEASURE_ELIGIBILITY_CONTRACT_VERSION,
  hasMinimumSeniorityAtDecemberNMinus1,
  isCompensatoryMeasureEligible,
  type CompensatoryEligibleContractType,
  type CompensatoryMeasureEligibilityInput,
} from "./compensatoryMeasureEligibility";
export {
  MINIMUM_INCREASE_CONTRACT_VERSION,
  MINIMUM_INCREASE_ELIGIBLE_CONTRACT_TYPES,
  MINIMUM_INCREASE_POPULATION_STATUSES,
  isMinimumIncreasePopulationEmployee,
  resolveMinimumIncreaseExclusionReason,
  type MinimumIncreaseEligibleContractType,
  type MinimumIncreaseExclusionReason,
  type MinimumIncreasePopulationInput,
} from "./minimumIncreasePopulation";
export {
  MINIMUM_INCREASE_MODES,
  NO_MINIMUM_INCREASE_POLICY,
  ceilFractionToConfiguredRoundingStep,
  computeGuaranteedTotalIncreaseExact,
  computeMinimumComplementFloorFcfa,
  computeRequiredMinimumComplementExact,
  minimumIncreaseRateFromPercentParts,
  validateMinimumIncreasePolicy,
  type MinimumIncreaseMode,
  type MinimumIncreasePolicy,
} from "./minimumIncrease";
export {
  PROMOTION_COMPENSATORY_CALIBRATION_CONTRACT_VERSION,
  promotionAnnualBudgetCostFcfa,
  solvePromotionAwareCompensatoryCalibrationRate,
  sumPromotionAnnualBudgetCostFcfa,
  type PromotionCompensatoryExposure,
} from "./promotionCompensatoryCalibration";
export {
  PROMOTION_AWARE_COMPENSATION_CONTRACT_VERSION,
  buildEmployeePromotionAwareExposures,
  finalizeEmployeePromotionAwareCompensation,
  type BuildEmployeePromotionAwareExposuresInput,
  type EmployeeMonthlyExposureContext,
  type EmployeePromotionAwareExposureResult,
  type FinalizeEmployeePromotionAwareCompensationInput,
  type FinalizeEmployeePromotionAwareCompensationResult,
} from "./promotionAwareEmployeeCompensation";
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
  type MonthlyCompensationTrajectoryEntry,
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
