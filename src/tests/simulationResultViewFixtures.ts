/**
 * Valeurs par défaut H2C-2B pour fixtures de tests de persistance / mapping.
 */

import type {
  PaymentCalendarSummaryView,
  PromotionAwareEnvelopeSummaryView,
  SeniorityImpactSummaryView,
  SimulationBudgetSummaryView,
  EmployeeSimulationResultView,
} from "../application/campaignSimulation/campaignSimulationExecutionModels";

const ZERO_LABEL = "0 FCFA";

export function emptyEnvelopeSummary(
  overrides: Partial<PromotionAwareEnvelopeSummaryView> = {},
): PromotionAwareEnvelopeSummaryView {
  return {
    annualBudgetTargetFcfa: { numerator: 0n, denominator: 1n },
    annualBudgetTargetLabel: ZERO_LABEL,
    totalAnnualPromotionBudgetCostFcfa: 0n,
    totalAnnualPromotionBudgetCostLabel: ZERO_LABEL,
    availableAnnualCompensatoryBudgetFcfa: { numerator: 0n, denominator: 1n },
    availableAnnualCompensatoryBudgetLabel: ZERO_LABEL,
    totalAnnualTheoreticalCompensatoryCostFcfa: {
      numerator: 0n,
      denominator: 1n,
    },
    totalAnnualTheoreticalCompensatoryCostLabel: ZERO_LABEL,
    totalAnnualActualCompensatoryCostFcfa: 0n,
    totalAnnualActualCompensatoryCostLabel: ZERO_LABEL,
    totalAnnualActualCombinedBaseMeasureCostFcfa: 0n,
    totalAnnualActualCombinedBaseMeasureCostLabel: ZERO_LABEL,
    annualCombinedRoundingDeltaFcfa: { numerator: 0n, denominator: 1n },
    annualCombinedRoundingDeltaLabel: ZERO_LABEL,
    compensatoryCalibrationRate: { numerator: 0n, denominator: 1n },
    compensatoryCalibrationRateLabel: "0,0000 %",
    ...overrides,
  };
}

export function emptyPaymentCalendar(
  overrides: Partial<PaymentCalendarSummaryView> = {},
): PaymentCalendarSummaryView {
  return {
    totalPromotionCostAlreadyPaidBeforeTechnicalMonthFcfa: 0n,
    totalPromotionCostAlreadyPaidBeforeTechnicalMonthLabel: ZERO_LABEL,
    totalPromotionCostFromTechnicalMonthToDecemberFcfa: 0n,
    totalPromotionCostFromTechnicalMonthToDecemberLabel: ZERO_LABEL,
    totalAnnualPromotionBudgetCostFcfa: 0n,
    totalAnnualPromotionBudgetCostLabel: ZERO_LABEL,
    totalCompensatoryReminderFcfa: 0n,
    totalCompensatoryReminderLabel: ZERO_LABEL,
    totalRemainingYearDirectCompensatoryCostFcfa: 0n,
    totalRemainingYearDirectCompensatoryCostLabel: ZERO_LABEL,
    totalAnnualActualCompensatoryCostFcfa: 0n,
    totalAnnualActualCompensatoryCostLabel: ZERO_LABEL,
    compensatoryReminderPlusDirectEqualsAnnual: true,
    ...overrides,
  };
}

export function emptySeniorityImpactSummary(
  overrides: Partial<SeniorityImpactSummaryView> = {},
): SeniorityImpactSummaryView {
  return {
    totalAnnualPromotionSeniorityImpactFcfa: 0n,
    totalAnnualPromotionSeniorityImpactLabel: ZERO_LABEL,
    totalAnnualCompensatorySeniorityImpactFcfa: 0n,
    totalAnnualCompensatorySeniorityImpactLabel: ZERO_LABEL,
    totalAnnualSeniorityImpactFcfa: 0n,
    totalAnnualSeniorityImpactLabel: ZERO_LABEL,
    totalPromotionSeniorityAlreadyPaidBeforeTechnicalMonthFcfa: 0n,
    totalPromotionSeniorityAlreadyPaidBeforeTechnicalMonthLabel: ZERO_LABEL,
    totalPromotionSeniorityFromTechnicalMonthToDecemberFcfa: 0n,
    totalPromotionSeniorityFromTechnicalMonthToDecemberLabel: ZERO_LABEL,
    totalCompensatorySeniorityReminderFcfa: 0n,
    totalCompensatorySeniorityReminderLabel: ZERO_LABEL,
    totalRemainingYearDirectCompensatorySeniorityImpactFcfa: 0n,
    totalRemainingYearDirectCompensatorySeniorityImpactLabel: ZERO_LABEL,
    ...overrides,
  };
}

export function withPromotionAwareBudgetSummary(
  base: Omit<
    SimulationBudgetSummaryView,
    | "envelopeSummary"
    | "paymentCalendar"
    | "seniorityImpactSummary"
    | "hasStructuredPromotions"
    | "hasImputedPromotionBudgetCost"
  > &
    Partial<
      Pick<
        SimulationBudgetSummaryView,
        | "envelopeSummary"
        | "paymentCalendar"
        | "seniorityImpactSummary"
        | "hasStructuredPromotions"
        | "hasImputedPromotionBudgetCost"
      >
    >,
): SimulationBudgetSummaryView {
  return {
    ...base,
    envelopeSummary: base.envelopeSummary ?? emptyEnvelopeSummary({
      annualBudgetTargetFcfa: base.exactBudgetTarget,
      annualBudgetTargetLabel: base.exactBudgetTargetLabel,
      availableAnnualCompensatoryBudgetFcfa: base.exactBudgetTarget,
      availableAnnualCompensatoryBudgetLabel: base.exactBudgetTargetLabel,
      totalAnnualTheoreticalCompensatoryCostFcfa:
        base.annualTheoreticalAllocatedTotal,
      totalAnnualTheoreticalCompensatoryCostLabel:
        base.annualTheoreticalAllocatedTotalLabel,
      totalAnnualActualCompensatoryCostFcfa: base.annualActualOperationCostFcfa,
      totalAnnualActualCompensatoryCostLabel: base.annualActualOperationCostLabel,
      totalAnnualActualCombinedBaseMeasureCostFcfa:
        base.annualActualOperationCostFcfa,
      totalAnnualActualCombinedBaseMeasureCostLabel:
        base.annualActualOperationCostLabel,
      annualCombinedRoundingDeltaFcfa: base.annualTotalRoundingDelta,
      annualCombinedRoundingDeltaLabel: base.annualTotalRoundingDeltaLabel,
    }),
    paymentCalendar: base.paymentCalendar ?? emptyPaymentCalendar({
      totalCompensatoryReminderFcfa: 0n,
      totalRemainingYearDirectCompensatoryCostFcfa:
        base.annualActualOperationCostFcfa,
      totalAnnualActualCompensatoryCostFcfa: base.annualActualOperationCostFcfa,
      totalAnnualActualCompensatoryCostLabel: base.annualActualOperationCostLabel,
    }),
    seniorityImpactSummary:
      base.seniorityImpactSummary ?? emptySeniorityImpactSummary(),
    hasStructuredPromotions: base.hasStructuredPromotions ?? false,
    hasImputedPromotionBudgetCost: base.hasImputedPromotionBudgetCost ?? false,
  };
}

export function withPromotionAwareEmployeeDefaults(
  employee: Omit<
    EmployeeSimulationResultView,
    | "compensatoryMeasureEligible"
    | "isPromotionBudgetPopulationEmployee"
    | "employmentStatus"
    | "contractType"
    | "promotionStatusLabel"
    | "promotionStatusKind"
    | "compensatoryEligibilityLabel"
    | "compensatoryEligibilityKind"
    | "compensatoryIneligibilityReasonCode"
    | "compensatoryIneligibilityReasonLabel"
    | "hasStructuredPromotion"
    | "promotionDate"
    | "promotionYear"
    | "promotionMonth"
    | "previousGradeCode"
    | "promotedGradeCode"
    | "previousJobFamilyCode"
    | "promotedJobFamilyCode"
    | "salaryBeforePromotionFcfa"
    | "salaryAfterPromotionFcfa"
    | "promotionAmountFcfa"
    | "promotionRate"
    | "promotionRateLabel"
    | "promotionInclusionStatusLabel"
    | "promotionCampaignCostInformativeFcfa"
    | "promotionCampaignCostInformativeLabel"
    | "annualPromotionBudgetCostFcfa"
    | "annualPromotionBudgetCostLabel"
    | "promotionCostAlreadyPaidBeforeTechnicalMonthFcfa"
    | "promotionCostAlreadyPaidBeforeTechnicalMonthLabel"
    | "promotionCostFromTechnicalMonthToDecemberFcfa"
    | "promotionCostFromTechnicalMonthToDecemberLabel"
    | "annualPromotionSeniorityImpactFcfa"
    | "annualPromotionSeniorityImpactLabel"
    | "combinedAnnualSeniorityImpactFcfa"
    | "combinedAnnualSeniorityImpactLabel"
    | "combinedAnnualActualCostFcfa"
    | "combinedAnnualActualCostLabel"
    | "technicalMonthCompensatoryComplementFcfa"
    | "technicalMonthCompensatoryComplementLabel"
    | "technicalMonthFinalSalaryFcfa"
    | "technicalMonthFinalSalaryLabel"
    | "monthlyCompensationTrajectory"
  > &
    Partial<EmployeeSimulationResultView>,
): EmployeeSimulationResultView {
  return {
    compensatoryMeasureEligible: true,
    isPromotionBudgetPopulationEmployee: true,
    employmentStatus: "active",
    contractType: "cdi",
    promotionStatusLabel: "Aucune",
    promotionStatusKind: "none",
    compensatoryEligibilityLabel: "Éligible",
    compensatoryEligibilityKind: "eligible",
    compensatoryIneligibilityReasonCode: null,
    compensatoryIneligibilityReasonLabel: null,
    hasStructuredPromotion: false,
    promotionDate: null,
    promotionYear: null,
    promotionMonth: null,
    previousGradeCode: null,
    promotedGradeCode: null,
    previousJobFamilyCode: null,
    promotedJobFamilyCode: null,
    salaryBeforePromotionFcfa: null,
    salaryAfterPromotionFcfa: null,
    promotionAmountFcfa: null,
    promotionRate: null,
    promotionRateLabel: null,
    promotionInclusionStatusLabel: null,
    promotionCampaignCostInformativeFcfa: 0n,
    promotionCampaignCostInformativeLabel: ZERO_LABEL,
    annualPromotionBudgetCostFcfa: 0n,
    annualPromotionBudgetCostLabel: ZERO_LABEL,
    promotionCostAlreadyPaidBeforeTechnicalMonthFcfa: 0n,
    promotionCostAlreadyPaidBeforeTechnicalMonthLabel: ZERO_LABEL,
    promotionCostFromTechnicalMonthToDecemberFcfa: 0n,
    promotionCostFromTechnicalMonthToDecemberLabel: ZERO_LABEL,
    annualPromotionSeniorityImpactFcfa: 0n,
    annualPromotionSeniorityImpactLabel: ZERO_LABEL,
    combinedAnnualSeniorityImpactFcfa: employee.annualSeniorityImpactFcfa ?? 0n,
    combinedAnnualSeniorityImpactLabel: ZERO_LABEL,
    combinedAnnualActualCostFcfa: employee.annualActualCostFcfa ?? 0n,
    combinedAnnualActualCostLabel: ZERO_LABEL,
    technicalMonthCompensatoryComplementFcfa:
      employee.monthlyFinalRoundedIncreaseFcfa,
    technicalMonthCompensatoryComplementLabel: "x",
    technicalMonthFinalSalaryFcfa: employee.monthlyFinalSalaryFcfa,
    technicalMonthFinalSalaryLabel: "x",
    monthlyCompensationTrajectory: [],
    ...employee,
  };
}
