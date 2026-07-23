/**
 * Mappers SQLite → modèles persistés de simulation (Lot 2B-4A).
 * Aucune conversion Number des montants exacts.
 */

import type { CampaignStatus } from "../../domain/campaign/models";
import type { NineBoxMode } from "../../domain/compensationReference/models";
import {
  deriveSocialMechanismKindFromMinimumIncreaseMode,
  resolveUniversalFixedAmountSeniorityReferenceDate,
  type ExactAmount,
  type SocialMechanismKind,
} from "../../domain/compensationCalculation";
import {
  parseCanonicalExactAmount,
  parseCanonicalIntegerText,
} from "../../application/campaignSimulation/canonicalDecimalText";
import type {
  PersistedSimulationEmployeeMonthResult,
  PersistedSimulationEmployeeResult,
  PersistedSimulationRunSummary,
} from "../../application/campaignSimulation/simulationPersistenceModels";

export interface SimulationRunRow {
  id: number;
  campaign_id: number;
  run_number: number;
  result_schema_version: number;
  campaign_name: string;
  campaign_year: number;
  campaign_status_at_run: string;
  evaluation_mode: string;
  source_import_batch_id: number | null;
  source_import_file_name: string | null;
  source_fingerprint: string;
  configuration_fingerprint: string;
  budget_target_mode: string;
  manual_budget_fcfa_text: string | null;
  eligible_payroll_fcfa_text: string | null;
  budget_rate_basis_points: number | null;
  budget_target_numerator_text: string;
  budget_target_denominator_text: string;
  rounding_mode: string;
  rounding_step_fcfa_text: string;
  employee_count: number;
  positive_weight_employee_count: number;
  zero_weight_employee_count: number;
  confirmed_underperformer_count: number;
  /** Schema v4 (migration 0008) — null sur snapshots v3 et antérieurs. */
  neutralize_nine_box_effect_employee_count?: number | null;
  /** Schema v5 (migration 0009) — null sur snapshots v4 et antérieurs. */
  nine_box_confirmation_factor_milli?: number | null;
  theoretical_total_numerator_text: string;
  theoretical_total_denominator_text: string;
  actual_operation_amount_fcfa_text: string;
  total_rounding_delta_numerator_text: string;
  total_rounding_delta_denominator_text: string;
  created_at: string;

  /**
   * Colonnes schema v3 (migration 0007). Optionnelles / nullables : absentes ou
   * NULL pour les snapshots v1/v2 — lues sans faux zéro.
   */
  retroactivity_start_month?: number | null;
  technical_application_month?: number | null;
  minimum_guarantee_effective_month?: number | null;
  campaign_covered_month_count?: number | null;
  promotion_campaign_period_budget_cost_text?: string | null;
  total_minimum_complement_floor_cost_text?: string | null;
  actual_compensation_above_minimum_cost_text?: string | null;
  actual_combined_campaign_period_cost_text?: string | null;
  full_year_run_rate_combined_base_measure_cost_text?: string | null;

  /** Colonnes schema v7 (migration 0013) — nullables pour snapshots v6. */
  minimum_increase_mode?: string | null;
  social_mechanism_kind?: string | null;
  universal_fixed_amount_monthly_fcfa?: number | null;
  universal_fixed_amount_effective_month?: number | null;
  universal_fixed_amount_minimum_seniority_months?: number | null;
  universal_fixed_amount_seniority_reference_date?: string | null;
  universal_fixed_amount_eligible_employee_count?: number | null;
  universal_fixed_amount_exposure_count?: number | null;
  total_universal_fixed_amount_cost_text?: string | null;
  available_budget_after_promotions_and_social_mechanism_num_text?: string | null;
  available_budget_after_promotions_and_social_mechanism_den_text?: string | null;
  total_universal_fixed_amount_reminder_text?: string | null;
  total_universal_fixed_amount_remaining_year_direct_cost_text?: string | null;
  full_year_run_rate_universal_fixed_amount_cost_text?: string | null;
}

export interface SimulationEmployeeResultRow {
  id: number;
  simulation_run_id: number;
  employee_id: string;
  employee_display_name: string | null;
  family_code: string;
  family_label: string | null;
  grade_code: string;
  grade_label: string | null;
  salary_fcfa_text: string;
  s0_fcfa_text: string;
  salary_ratio_basis_points: number;
  salary_position_code: string;
  salary_position_label: string;
  position_factor_milli: number;
  evaluation_mode: string;
  performance_level: string | null;
  potential_level: string | null;
  evaluation_factor_numerator_text: string;
  evaluation_factor_denominator_text: string;
  theoretical_matrix_weight_numerator_text: string;
  theoretical_matrix_weight_denominator_text: string;
  effective_matrix_weight_numerator_text: string;
  effective_matrix_weight_denominator_text: string;
  allocation_weight_numerator_text: string;
  allocation_weight_denominator_text: string;
  blocking_reason: string | null;
  theoretical_increase_rate_numerator_text: string;
  theoretical_increase_rate_denominator_text: string;
  theoretical_increase_amount_numerator_text: string;
  theoretical_increase_amount_denominator_text: string;
  final_rounded_increase_fcfa_text: string;
  individual_rounding_delta_numerator_text: string;
  individual_rounding_delta_denominator_text: string;
  final_salary_fcfa_text: string;
  explanation_steps_json: string;
  /** Colonnes schema v4 (migration 0008) — nullables pour snapshots v3. */
  neutralize_nine_box_effect?: number | null;
  source_nine_box_code?: number | null;
  nine_box_treatment_kind?: string | null;
  /** Rappels compensatoires (migration 0007) — nullables pour snapshots v2. */
  base_salary_reminder_text?: string | null;
  minimum_compensatory_reminder_text?: string | null;
  above_minimum_compensatory_reminder_text?: string | null;
  /** Colonnes schema v7 (migration 0013) — nullables pour snapshots v6. */
  is_universal_fixed_amount_eligible?: number | null;
  universal_fixed_amount_exclusion_reason?: string | null;
  campaign_period_universal_fixed_amount_cost_text?: string | null;
  universal_fixed_amount_reminder_text?: string | null;
  universal_fixed_amount_remaining_year_direct_cost_text?: string | null;
  full_year_run_rate_universal_fixed_amount_cost_text?: string | null;
  universal_fixed_amount_seniority_reference_date?: string | null;
}

/** Ligne mensuelle persistée (schema v3, Lot 2B-P1). */
export interface SimulationEmployeeMonthResultRow {
  id: number;
  employee_result_id: number;
  month: number;
  base_salary_fcfa_text: string;
  grade_code: string;
  job_family_code: string;
  salary_position_label: string | null;
  target_compensatory_rate_num_text: string;
  target_compensatory_rate_den_text: string;
  promotion_rate_offset_num_text: string;
  promotion_rate_offset_den_text: string;
  compensatory_complement_rate_num_text: string;
  compensatory_complement_rate_den_text: string;
  theoretical_compensatory_complement_num_text: string;
  theoretical_compensatory_complement_den_text: string;
  rounded_compensatory_complement_fcfa_text: string;
  promotion_budget_cost_fcfa_text: string;
  final_salary_fcfa_text: string;
  seniority_rate_percent: number;
  promotion_seniority_impact_fcfa_text: string;
  compensatory_seniority_impact_fcfa_text: string;
  total_seniority_impact_fcfa_text: string;
  payment_timing: string;
  promotion_payment_timing: string;
  covered_by_campaign_period: number;
  included_in_campaign_envelope: number;
  promotion_active: number;
  promotion_status: string;
  is_minimum_increase_population_employee: number;
  guaranteed_total_increase_num_text: string;
  guaranteed_total_increase_den_text: string;
  applicable_promotion_increment_fcfa_text: string;
  required_minimum_complement_num_text: string;
  required_minimum_complement_den_text: string;
  minimum_complement_floor_fcfa_text: string;
  weighted_complement_num_text: string;
  weighted_complement_den_text: string;
  theoretical_complement_num_text: string;
  theoretical_complement_den_text: string;
  actual_complement_above_minimum_fcfa_text: string;
  universal_fixed_amount_fcfa_text?: string | null;
}

function asPaymentTiming(
  value: string,
): PersistedSimulationEmployeeMonthResult["paymentTiming"] {
  if (value === "outside_campaign" || value === "reminder" || value === "direct") {
    return value;
  }
  throw new Error(`Timing de paiement persisté invalide: ${value}`);
}

function asPromotionPaymentTiming(
  value: string,
): PersistedSimulationEmployeeMonthResult["promotionPaymentTiming"] {
  if (
    value === "outside_campaign" ||
    value === "reminder" ||
    value === "direct" ||
    value === "not_applicable"
  ) {
    return value;
  }
  throw new Error(`Timing de promotion persisté invalide: ${value}`);
}

function asCampaignStatus(value: string): CampaignStatus {
  if (value === "draft" || value === "active" || value === "archived") {
    return value;
  }
  throw new Error(`Statut de campagne persisté invalide: ${value}`);
}

function asNineBoxMode(value: string): NineBoxMode {
  if (
    value === "none" ||
    value === "performance_only" ||
    value === "performance_potential" ||
    value === "full_nine_box"
  ) {
    return value;
  }
  throw new Error(`Mode d’évaluation persisté invalide: ${value}`);
}

function nullableIntegerText(value: string | null | undefined): bigint | null {
  if (value === null || value === undefined || value.trim() === "") {
    return null;
  }
  return parseCanonicalIntegerText(value, { allowNegative: true });
}

function parseExplanationSteps(
  raw: string,
): PersistedSimulationEmployeeResult["explanationSteps"] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((item) => {
      if (!item || typeof item !== "object") {
        return { step: "unknown" };
      }
      const record = item as Record<string, unknown>;
      return {
        step: typeof record.step === "string" ? record.step : "unknown",
        formula:
          typeof record.formula === "string" ? record.formula : undefined,
        outputValue:
          typeof record.outputValue === "string"
            ? record.outputValue
            : undefined,
      };
    });
  } catch {
    return [];
  }
}

function resolvePersistedUniversalFixedAmountSeniorityReferenceDate(
  stored: string | null | undefined,
  campaignYear: number,
): string {
  if (stored !== undefined && stored !== null && stored.trim() !== "") {
    return stored.trim();
  }
  return resolveUniversalFixedAmountSeniorityReferenceDate({ campaignYear }).date;
}

function resolvePersistedSocialMechanismKind(row: SimulationRunRow): SocialMechanismKind {
  if (
    row.social_mechanism_kind === "none" ||
    row.social_mechanism_kind === "minimum_guaranteed" ||
    row.social_mechanism_kind === "universal_fixed_amount"
  ) {
    return row.social_mechanism_kind;
  }
  return deriveSocialMechanismKindFromMinimumIncreaseMode(row.minimum_increase_mode);
}

function nullableExactAmount(
  numeratorText: string | null | undefined,
  denominatorText: string | null | undefined,
): ExactAmount | null {
  if (
    numeratorText === null ||
    numeratorText === undefined ||
    numeratorText.trim() === "" ||
    denominatorText === null ||
    denominatorText === undefined ||
    denominatorText.trim() === ""
  ) {
    return null;
  }
  return parseCanonicalExactAmount({
    numeratorText,
    denominatorText,
    allowNegativeNumerator: true,
  });
}

export function mapSimulationEmployeeMonthResult(
  row: SimulationEmployeeMonthResultRow,
): PersistedSimulationEmployeeMonthResult {
  const positiveIntegerText = { allowNegative: false } as const;
  return {
    id: row.id,
    employeeResultId: row.employee_result_id,
    month: row.month,
    baseSalaryFcfa: parseCanonicalIntegerText(
      row.base_salary_fcfa_text,
      positiveIntegerText,
    ),
    gradeCode: row.grade_code,
    jobFamilyCode: row.job_family_code,
    salaryPositionLabel: row.salary_position_label,
    targetCompensatoryRate: parseCanonicalExactAmount({
      numeratorText: row.target_compensatory_rate_num_text,
      denominatorText: row.target_compensatory_rate_den_text,
    }),
    promotionRateOffset: parseCanonicalExactAmount({
      numeratorText: row.promotion_rate_offset_num_text,
      denominatorText: row.promotion_rate_offset_den_text,
    }),
    compensatoryComplementRate: parseCanonicalExactAmount({
      numeratorText: row.compensatory_complement_rate_num_text,
      denominatorText: row.compensatory_complement_rate_den_text,
    }),
    theoreticalCompensatoryComplement: parseCanonicalExactAmount({
      numeratorText: row.theoretical_compensatory_complement_num_text,
      denominatorText: row.theoretical_compensatory_complement_den_text,
    }),
    roundedCompensatoryComplementFcfa: parseCanonicalIntegerText(
      row.rounded_compensatory_complement_fcfa_text,
      positiveIntegerText,
    ),
    promotionBudgetCostFcfa: parseCanonicalIntegerText(
      row.promotion_budget_cost_fcfa_text,
      positiveIntegerText,
    ),
    finalSalaryFcfa: parseCanonicalIntegerText(
      row.final_salary_fcfa_text,
      positiveIntegerText,
    ),
    seniorityRatePercent: row.seniority_rate_percent,
    promotionSeniorityImpactFcfa: parseCanonicalIntegerText(
      row.promotion_seniority_impact_fcfa_text,
      positiveIntegerText,
    ),
    compensatorySeniorityImpactFcfa: parseCanonicalIntegerText(
      row.compensatory_seniority_impact_fcfa_text,
      positiveIntegerText,
    ),
    totalSeniorityImpactFcfa: parseCanonicalIntegerText(
      row.total_seniority_impact_fcfa_text,
      positiveIntegerText,
    ),
    paymentTiming: asPaymentTiming(row.payment_timing),
    promotionPaymentTiming: asPromotionPaymentTiming(row.promotion_payment_timing),
    coveredByCampaignPeriod: row.covered_by_campaign_period === 1,
    includedInCampaignEnvelope: row.included_in_campaign_envelope === 1,
    promotionActive: row.promotion_active === 1,
    promotionStatus: row.promotion_status,
    isMinimumIncreasePopulationEmployee:
      row.is_minimum_increase_population_employee === 1,
    guaranteedTotalIncrease: parseCanonicalExactAmount({
      numeratorText: row.guaranteed_total_increase_num_text,
      denominatorText: row.guaranteed_total_increase_den_text,
    }),
    applicablePromotionIncrementFcfa: parseCanonicalIntegerText(
      row.applicable_promotion_increment_fcfa_text,
      positiveIntegerText,
    ),
    requiredMinimumComplement: parseCanonicalExactAmount({
      numeratorText: row.required_minimum_complement_num_text,
      denominatorText: row.required_minimum_complement_den_text,
    }),
    minimumComplementFloorFcfa: parseCanonicalIntegerText(
      row.minimum_complement_floor_fcfa_text,
      positiveIntegerText,
    ),
    weightedComplement: parseCanonicalExactAmount({
      numeratorText: row.weighted_complement_num_text,
      denominatorText: row.weighted_complement_den_text,
    }),
    theoreticalComplement: parseCanonicalExactAmount({
      numeratorText: row.theoretical_complement_num_text,
      denominatorText: row.theoretical_complement_den_text,
    }),
    actualComplementAboveMinimumFcfa: parseCanonicalIntegerText(
      row.actual_complement_above_minimum_fcfa_text,
      positiveIntegerText,
    ),
    universalFixedAmountFcfa: nullableIntegerText(row.universal_fixed_amount_fcfa_text),
  };
}

export function mapSimulationRunSummary(
  row: SimulationRunRow,
): PersistedSimulationRunSummary {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    runNumber: row.run_number,
    resultSchemaVersion: row.result_schema_version,
    campaignName: row.campaign_name,
    campaignYear: row.campaign_year,
    campaignStatusAtRun: asCampaignStatus(row.campaign_status_at_run),
    evaluationMode: asNineBoxMode(row.evaluation_mode),
    sourceImportBatchId: row.source_import_batch_id,
    sourceImportFileName: row.source_import_file_name,
    sourceFingerprint: row.source_fingerprint,
    configurationFingerprint: row.configuration_fingerprint,
    budgetTargetMode: row.budget_target_mode,
    manualBudgetFcfa: row.manual_budget_fcfa_text
      ? parseCanonicalIntegerText(row.manual_budget_fcfa_text, {
          allowNegative: false,
        })
      : null,
    eligiblePayrollFcfa: row.eligible_payroll_fcfa_text
      ? parseCanonicalIntegerText(row.eligible_payroll_fcfa_text, {
          allowNegative: false,
        })
      : null,
    budgetRateBasisPoints:
      row.budget_rate_basis_points === null ||
      row.budget_rate_basis_points === undefined
        ? null
        : BigInt(row.budget_rate_basis_points),
    exactBudgetTarget: parseCanonicalExactAmount({
      numeratorText: row.budget_target_numerator_text,
      denominatorText: row.budget_target_denominator_text,
      allowNegativeNumerator: false,
    }),
    roundingMode: row.rounding_mode,
    roundingStepFcfa: parseCanonicalIntegerText(row.rounding_step_fcfa_text, {
      allowNegative: false,
    }),
    employeeCount: row.employee_count,
    positiveWeightEmployeeCount: row.positive_weight_employee_count,
    zeroWeightEmployeeCount: row.zero_weight_employee_count,
    confirmedUnderperformerCount: row.confirmed_underperformer_count,
    neutralizeNineBoxEffectEmployeeCount:
      row.neutralize_nine_box_effect_employee_count ?? null,
    nineBoxConfirmationFactorMilli:
      row.nine_box_confirmation_factor_milli ?? null,
    theoreticalAllocatedTotal: parseCanonicalExactAmount({
      numeratorText: row.theoretical_total_numerator_text,
      denominatorText: row.theoretical_total_denominator_text,
      allowNegativeNumerator: false,
    }),
    actualOperationAmountFcfa: parseCanonicalIntegerText(
      row.actual_operation_amount_fcfa_text,
      { allowNegative: false },
    ),
    totalRoundingDelta: parseCanonicalExactAmount({
      numeratorText: row.total_rounding_delta_numerator_text,
      denominatorText: row.total_rounding_delta_denominator_text,
      allowNegativeNumerator: true,
    }),
    createdAt: row.created_at,
    retroactivityStartMonth: row.retroactivity_start_month ?? null,
    technicalApplicationMonth: row.technical_application_month ?? null,
    minimumGuaranteeEffectiveMonth:
      row.minimum_guarantee_effective_month ?? null,
    campaignCoveredMonthCount: row.campaign_covered_month_count ?? null,
    promotionCampaignPeriodBudgetCostFcfa: nullableIntegerText(
      row.promotion_campaign_period_budget_cost_text,
    ),
    totalMinimumComplementFloorCostFcfa: nullableIntegerText(
      row.total_minimum_complement_floor_cost_text,
    ),
    actualCompensationAboveMinimumCostFcfa: nullableIntegerText(
      row.actual_compensation_above_minimum_cost_text,
    ),
    actualCombinedCampaignPeriodCostFcfa: nullableIntegerText(
      row.actual_combined_campaign_period_cost_text,
    ),
    fullYearRunRateCombinedBaseMeasureCostFcfa: nullableIntegerText(
      row.full_year_run_rate_combined_base_measure_cost_text,
    ),
    socialMechanismKind: resolvePersistedSocialMechanismKind(row),
    universalFixedAmountMonthlyFcfa:
      row.universal_fixed_amount_monthly_fcfa === null ||
      row.universal_fixed_amount_monthly_fcfa === undefined
        ? null
        : BigInt(row.universal_fixed_amount_monthly_fcfa),
    universalFixedAmountEffectiveMonth:
      row.universal_fixed_amount_effective_month ?? null,
    universalFixedAmountMinimumSeniorityMonths:
      row.universal_fixed_amount_minimum_seniority_months ?? null,
    universalFixedAmountSeniorityReferenceDate:
      resolvePersistedUniversalFixedAmountSeniorityReferenceDate(
        row.universal_fixed_amount_seniority_reference_date,
        row.campaign_year,
      ),
    universalFixedAmountEligibleEmployeeCount:
      row.universal_fixed_amount_eligible_employee_count ?? null,
    universalFixedAmountExposureCount:
      row.universal_fixed_amount_exposure_count ?? null,
    totalUniversalFixedAmountCostFcfa: nullableIntegerText(
      row.total_universal_fixed_amount_cost_text,
    ),
    availableBudgetAfterPromotionsAndSocialMechanism: nullableExactAmount(
      row.available_budget_after_promotions_and_social_mechanism_num_text,
      row.available_budget_after_promotions_and_social_mechanism_den_text,
    ),
    totalUniversalFixedAmountReminderFcfa: nullableIntegerText(
      row.total_universal_fixed_amount_reminder_text,
    ),
    totalUniversalFixedAmountRemainingYearDirectCostFcfa: nullableIntegerText(
      row.total_universal_fixed_amount_remaining_year_direct_cost_text,
    ),
    fullYearRunRateUniversalFixedAmountCostFcfa: nullableIntegerText(
      row.full_year_run_rate_universal_fixed_amount_cost_text,
    ),
  };
}

export function mapSimulationEmployeeResult(
  row: SimulationEmployeeResultRow,
  options?: { campaignYear?: number },
): PersistedSimulationEmployeeResult {
  return {
    id: row.id,
    simulationRunId: row.simulation_run_id,
    employeeId: row.employee_id,
    employeeDisplayName: row.employee_display_name,
    familyCode: row.family_code,
    familyLabel: row.family_label,
    gradeCode: row.grade_code,
    gradeLabel: row.grade_label,
    salaryFcfa: parseCanonicalIntegerText(row.salary_fcfa_text, {
      allowNegative: false,
    }),
    s0Fcfa: parseCanonicalIntegerText(row.s0_fcfa_text, { allowNegative: false }),
    salaryRatioBasisPoints: row.salary_ratio_basis_points,
    salaryPositionCode: row.salary_position_code,
    salaryPositionLabel: row.salary_position_label,
    positionFactorMilli: row.position_factor_milli,
    evaluationMode: asNineBoxMode(row.evaluation_mode),
    performanceLevel: row.performance_level,
    potentialLevel: row.potential_level,
    evaluationFactor: parseCanonicalExactAmount({
      numeratorText: row.evaluation_factor_numerator_text,
      denominatorText: row.evaluation_factor_denominator_text,
    }),
    theoreticalMatrixWeight: parseCanonicalExactAmount({
      numeratorText: row.theoretical_matrix_weight_numerator_text,
      denominatorText: row.theoretical_matrix_weight_denominator_text,
    }),
    effectiveMatrixWeight: parseCanonicalExactAmount({
      numeratorText: row.effective_matrix_weight_numerator_text,
      denominatorText: row.effective_matrix_weight_denominator_text,
    }),
    allocationWeight: parseCanonicalExactAmount({
      numeratorText: row.allocation_weight_numerator_text,
      denominatorText: row.allocation_weight_denominator_text,
    }),
    blockingReason: row.blocking_reason,
    theoreticalIncreaseRate: parseCanonicalExactAmount({
      numeratorText: row.theoretical_increase_rate_numerator_text,
      denominatorText: row.theoretical_increase_rate_denominator_text,
    }),
    theoreticalIncreaseAmount: parseCanonicalExactAmount({
      numeratorText: row.theoretical_increase_amount_numerator_text,
      denominatorText: row.theoretical_increase_amount_denominator_text,
    }),
    finalRoundedIncreaseAmountFcfa: parseCanonicalIntegerText(
      row.final_rounded_increase_fcfa_text,
      { allowNegative: false },
    ),
    individualRoundingDelta: parseCanonicalExactAmount({
      numeratorText: row.individual_rounding_delta_numerator_text,
      denominatorText: row.individual_rounding_delta_denominator_text,
      allowNegativeNumerator: true,
    }),
    finalSalaryFcfa: parseCanonicalIntegerText(row.final_salary_fcfa_text, {
      allowNegative: false,
    }),
    explanationSteps: parseExplanationSteps(row.explanation_steps_json),
    neutralizeNineBoxEffect:
      row.neutralize_nine_box_effect === null ||
      row.neutralize_nine_box_effect === undefined
        ? null
        : row.neutralize_nine_box_effect === 1,
    sourceNineBoxCode:
      row.source_nine_box_code === undefined ? null : row.source_nine_box_code,
    nineBoxTreatmentKind:
      row.nine_box_treatment_kind === undefined
        ? null
        : row.nine_box_treatment_kind,
    baseSalaryReminderFcfa: nullableIntegerText(row.base_salary_reminder_text),
    minimumCompensatoryReminderFcfa: nullableIntegerText(
      row.minimum_compensatory_reminder_text,
    ),
    aboveMinimumCompensatoryReminderFcfa: nullableIntegerText(
      row.above_minimum_compensatory_reminder_text,
    ),
    isUniversalFixedAmountEligible:
      row.is_universal_fixed_amount_eligible === null ||
      row.is_universal_fixed_amount_eligible === undefined
        ? null
        : row.is_universal_fixed_amount_eligible === 1,
    universalFixedAmountExclusionReason:
      row.universal_fixed_amount_exclusion_reason ?? null,
    universalFixedAmountSeniorityReferenceDate:
      options?.campaignYear !== undefined
        ? resolvePersistedUniversalFixedAmountSeniorityReferenceDate(
            row.universal_fixed_amount_seniority_reference_date,
            options.campaignYear,
          )
        : row.universal_fixed_amount_seniority_reference_date ?? null,
    campaignPeriodUniversalFixedAmountCostFcfa: nullableIntegerText(
      row.campaign_period_universal_fixed_amount_cost_text,
    ),
    universalFixedAmountReminderFcfa: nullableIntegerText(
      row.universal_fixed_amount_reminder_text,
    ),
    universalFixedAmountRemainingYearDirectCostFcfa: nullableIntegerText(
      row.universal_fixed_amount_remaining_year_direct_cost_text,
    ),
    fullYearRunRateUniversalFixedAmountCostFcfa: nullableIntegerText(
      row.full_year_run_rate_universal_fixed_amount_cost_text,
    ),
  };
}
