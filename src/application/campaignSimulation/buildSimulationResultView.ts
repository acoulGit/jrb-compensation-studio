/**
 * Construction de la vue consultable à partir du résultat moteur
 * (Lot 2B-3 / correctif 2A-H1 / Lot 2A-H2C-2B).
 * Ne recalcule aucun montant métier : lit / agrège / formate les champs explicites.
 */

import {
  CALCULATION_CONTRACT_VERSION,
  formatExactAmount,
  technicalApplicationMonthLabelFr,
  type CalculationExplanationStep,
  type EmployeeCompensationCalculationResult,
  type MonthlyCompensationTrajectoryEntry,
  type PreparedPopulationCalculationResult,
} from "../../domain/compensationCalculation";
import type { CampaignStatus } from "../../domain/campaign/models";
import type { NineBoxMode } from "../../domain/compensationReference/models";
import {
  formatExactAmountAsFcfa,
  formatExactRateAsPercent,
  formatExactWeight,
  formatFactorMilli,
  formatFcfaInteger,
  formatSeniorityRatePercent,
  formatSignedExactAmountAsFcfa,
  formatSignedFcfaInteger,
  formatBasisPointsAsPercent,
} from "./formatExactBudgetDisplay";
import type {
  CampaignSimulationExecutionResult,
  EmployeeSimulationResultView,
  MonthlyCompensationTrajectoryView,
  PaymentCalendarSummaryView,
  PromotionAwareEnvelopeSummaryView,
  SeniorityImpactSummaryView,
  SimulationBudgetSummaryView,
  SimulationPopulationSummaryView,
} from "./campaignSimulationExecutionModels";
import {
  compensatoryEligibilityKind,
  formatCompensatoryEligibilityLabel,
  formatCompensatoryIneligibilityReasonLabel,
  formatCompensatoryPaymentStatusLabel,
  formatPromotionInclusionStatusLabel,
  formatPromotionPaymentStatusLabel,
  formatPromotionStatusLabel,
  promotionStatusKind,
  readTechnicalMonthTrajectoryEntry,
  resolveCompensatoryIneligibilityReason,
} from "./promotionAwareResultLabels";

function mapExplanationSteps(
  steps: readonly CalculationExplanationStep[],
): CampaignSimulationExecutionResult["explanationSteps"] {
  return steps.map((step) => ({
    step: step.code,
    formula: step.formula,
    outputValue:
      step.outputValue === null || step.outputValue === undefined
        ? undefined
        : String(step.outputValue),
  }));
}

function mapTrajectoryEntry(
  entry: MonthlyCompensationTrajectoryEntry,
  technicalApplicationMonth: number,
  salaryPositionLabel: string | null,
): MonthlyCompensationTrajectoryView {
  return {
    month: entry.month,
    monthLabel: technicalApplicationMonthLabelFr(entry.month),
    baseSalaryFcfa: entry.baseSalaryFcfa,
    baseSalaryLabel: formatFcfaInteger(entry.baseSalaryFcfa),
    gradeCode: entry.gradeCode,
    jobFamilyCode: entry.jobFamilyCode,
    salaryPositionLabel,
    targetCompensatoryRate: entry.targetCompensatoryRate,
    targetCompensatoryRateLabel: formatExactRateAsPercent(
      entry.targetCompensatoryRate,
      4,
    ),
    promotionRateOffset: entry.promotionRateOffset,
    promotionRateOffsetLabel: formatExactRateAsPercent(
      entry.promotionRateOffset,
      2,
    ),
    compensatoryComplementRate: entry.compensatoryComplementRate,
    compensatoryComplementRateLabel: formatExactRateAsPercent(
      entry.compensatoryComplementRate,
      4,
    ),
    theoreticalCompensatoryComplement: entry.theoreticalCompensatoryComplement,
    theoreticalCompensatoryComplementLabel: formatExactAmountAsFcfa(
      entry.theoreticalCompensatoryComplement,
    ),
    roundedCompensatoryComplementFcfa: entry.roundedCompensatoryComplementFcfa,
    roundedCompensatoryComplementLabel: formatFcfaInteger(
      entry.roundedCompensatoryComplementFcfa,
    ),
    promotionBudgetCostFcfa: entry.promotionBudgetCostFcfa,
    promotionBudgetCostLabel: formatFcfaInteger(entry.promotionBudgetCostFcfa),
    finalSalaryFcfa: entry.finalSalaryFcfa,
    finalSalaryLabel: formatFcfaInteger(entry.finalSalaryFcfa),
    seniorityRatePercent: entry.seniorityRatePercent,
    seniorityRateLabel: formatSeniorityRatePercent(entry.seniorityRatePercent),
    promotionSeniorityImpactFcfa: entry.promotionSeniorityImpactFcfa,
    promotionSeniorityImpactLabel: formatFcfaInteger(
      entry.promotionSeniorityImpactFcfa,
    ),
    compensatorySeniorityImpactFcfa: entry.compensatorySeniorityImpactFcfa,
    compensatorySeniorityImpactLabel: formatFcfaInteger(
      entry.compensatorySeniorityImpactFcfa,
    ),
    totalSeniorityImpactFcfa: entry.totalSeniorityImpactFcfa,
    totalSeniorityImpactLabel: formatFcfaInteger(entry.totalSeniorityImpactFcfa),
    promotionPaymentStatusLabel: formatPromotionPaymentStatusLabel(
      entry,
      technicalApplicationMonth,
    ),
    compensatoryPaymentStatusLabel: formatCompensatoryPaymentStatusLabel(
      entry.paymentTiming,
    ),
    paymentTiming: entry.paymentTiming,
    coveredByCampaignPeriod: entry.coveredByCampaignPeriod,
    includedInCampaignEnvelope: entry.includedInCampaignEnvelope,
    promotionActive: entry.promotionActive,
    promotionStatus: entry.promotionStatus,
  };
}

function mapEmployee(
  employee: EmployeeCompensationCalculationResult,
  labels: ReadonlyMap<string, string>,
  familyLabels: ReadonlyMap<string, string>,
  gradeLabels: ReadonlyMap<string, string>,
): EmployeeSimulationResultView {
  const displayName = labels.get(employee.employeeId) ?? null;
  const evaluationFactor = {
    numerator: BigInt(employee.evaluationFactorNumerator),
    denominator: BigInt(employee.evaluationFactorScale),
  };
  const technicalMonthEntry = readTechnicalMonthTrajectoryEntry(employee);
  const promotion = employee.promotion;
  const ineligibilityReason = resolveCompensatoryIneligibilityReason({
    compensatoryMeasureEligible: employee.compensatoryMeasureEligible,
    blockingReason: employee.blockingReason ?? null,
    contractType: employee.contractType,
    hireDate: employee.hireDate,
    campaignYear: employee.campaignYear,
    employmentStatus: employee.employmentStatus,
  });

  const promotionStatusLabel = formatPromotionStatusLabel({
    promotion,
    promotionYear: employee.promotionYear,
    promotionMonth: employee.promotionMonth,
    campaignYear: employee.campaignYear,
    promotionInclusion: employee.promotionInclusion,
    isPromotionBudgetPopulationEmployee:
      employee.isPromotionBudgetPopulationEmployee,
  });

  const trajectory = employee.monthlyCompensationTrajectory.map((entry) =>
    mapTrajectoryEntry(
      entry,
      employee.technicalApplicationMonth,
      employee.salaryPositionLabel,
    ),
  );

  return {
    employeeId: employee.employeeId,
    employeeDisplayName: displayName,
    familyCode: employee.familyCode,
    familyLabel: familyLabels.get(employee.familyCode) ?? null,
    gradeCode: employee.gradeCode,
    gradeLabel: gradeLabels.get(employee.gradeCode) ?? null,
    salaryFcfa: BigInt(employee.salaryFcfa),
    s0Fcfa: BigInt(employee.s0Fcfa),
    salaryRatioBasisPoints: employee.salaryRatioBasisPoints,
    salaryPositionCode: employee.salaryPositionCode,
    salaryPositionLabel: employee.salaryPositionLabel,
    positionFactorMilli: employee.positionFactorMilli,
    evaluationMode: employee.evaluationMode,
    performanceLevel: employee.performanceLevel ?? null,
    potentialLevel: employee.potentialLevel ?? null,
    evaluationFactor,
    theoreticalMatrixWeight: employee.theoreticalMatrixWeight,
    effectiveMatrixWeight: employee.effectiveMatrixWeight,
    allocationWeight: employee.allocationWeight,
    evaluationFactorLabel: formatExactWeight(evaluationFactor),
    theoreticalMatrixWeightLabel: formatExactWeight(
      employee.theoreticalMatrixWeight,
    ),
    effectiveMatrixWeightLabel: formatExactWeight(employee.effectiveMatrixWeight),
    allocationWeightLabel: formatExactWeight(employee.allocationWeight),
    blockingReason: employee.blockingReason ?? null,
    annualTheoreticalAllocation: employee.annualTheoreticalAllocation,
    annualTheoreticalAllocationLabel: formatExactAmountAsFcfa(
      employee.annualTheoreticalAllocation,
    ),
    monthlyTheoreticalIncrease: employee.monthlyTheoreticalIncrease,
    monthlyTheoreticalIncreaseLabel: formatExactAmountAsFcfa(
      employee.monthlyTheoreticalIncrease,
    ),
    monthlyTheoreticalIncreaseRate: employee.monthlyTheoreticalIncreaseRate,
    monthlyTheoreticalIncreaseRateLabel: formatExactRateAsPercent(
      employee.monthlyTheoreticalIncreaseRate,
      4,
    ),
    monthlyFinalRoundedIncreaseFcfa: employee.monthlyFinalRoundedIncreaseFcfa,
    monthlyRoundingDelta: employee.monthlyRoundingDelta,
    monthlyRoundingDeltaLabel: formatExactAmountAsFcfa(
      employee.monthlyRoundingDelta,
    ),
    annualActualCostFcfa: employee.annualActualCostFcfa,
    annualRoundingDelta: employee.annualRoundingDelta,
    annualRoundingDeltaLabel: formatExactAmountAsFcfa(
      employee.annualRoundingDelta,
    ),
    monthlyFinalSalaryFcfa: employee.monthlyFinalSalaryFcfa,
    campaignYear: employee.campaignYear,
    retroactivityStartMonth: employee.retroactivityStartMonth,
    technicalApplicationMonth: employee.technicalApplicationMonth,
    campaignCoveredMonthCount: employee.campaignCoveredMonthCount,
    retroactiveMonths: employee.retroactiveMonths,
    remainingDirectPaymentMonths: employee.remainingDirectPaymentMonths,
    baseSalaryReminderFcfa: employee.baseSalaryReminderFcfa,
    remainingYearDirectIncreaseCostFcfa:
      employee.remainingYearDirectIncreaseCostFcfa,
    annualActualBaseIncreaseCostFcfa: employee.annualActualBaseIncreaseCostFcfa,
    hireDate: employee.hireDate,
    technicalApplicationMonthSeniorityRatePercent:
      employee.technicalApplicationMonthSeniorityRatePercent,
    monthlySeniorityImpactSchedule: employee.monthlySeniorityImpactSchedule.map(
      (entry) => ({
        month: entry.month,
        ratePercent: entry.ratePercent,
        monthlySeniorityImpactFcfa: entry.monthlySeniorityImpactFcfa,
        paymentTiming: entry.paymentTiming,
      }),
    ),
    seniorityReminderFcfa: employee.seniorityReminderFcfa,
    remainingYearDirectSeniorityImpactFcfa:
      employee.remainingYearDirectSeniorityImpactFcfa,
    annualSeniorityImpactFcfa: employee.annualSeniorityImpactFcfa,
    fullYearRunRatePromotionCostFcfa: employee.fullYearRunRatePromotionCostFcfa,
    fullYearRunRatePromotionCostLabel: formatFcfaInteger(
      employee.fullYearRunRatePromotionCostFcfa,
    ),
    fullYearRunRateCompensatoryCostFcfa:
      employee.fullYearRunRateCompensatoryCostFcfa,
    fullYearRunRateCompensatoryCostLabel: formatFcfaInteger(
      employee.fullYearRunRateCompensatoryCostFcfa,
    ),
    fullYearRunRateCombinedBaseMeasureCostFcfa:
      employee.fullYearRunRateCombinedBaseMeasureCostFcfa,
    fullYearRunRateCombinedBaseMeasureCostLabel: formatFcfaInteger(
      employee.fullYearRunRateCombinedBaseMeasureCostFcfa,
    ),
    fullYearRunRateSeniorityImpactFcfa:
      employee.fullYearRunRateSeniorityImpactFcfa,
    fullYearRunRateSeniorityImpactLabel: formatFcfaInteger(
      employee.fullYearRunRateSeniorityImpactFcfa,
    ),
    compensatoryMeasureEligible: employee.compensatoryMeasureEligible,
    isPromotionBudgetPopulationEmployee:
      employee.isPromotionBudgetPopulationEmployee,
    employmentStatus: employee.employmentStatus,
    contractType: employee.contractType,
    promotionStatusLabel,
    promotionStatusKind: promotionStatusKind({
      promotion,
      promotionYear: employee.promotionYear,
      promotionInclusion: employee.promotionInclusion,
      isPromotionBudgetPopulationEmployee:
        employee.isPromotionBudgetPopulationEmployee,
      campaignYear: employee.campaignYear,
    }),
    compensatoryEligibilityLabel: formatCompensatoryEligibilityLabel({
      compensatoryMeasureEligible: employee.compensatoryMeasureEligible,
      blockingReason: employee.blockingReason ?? null,
    }),
    compensatoryEligibilityKind: compensatoryEligibilityKind({
      compensatoryMeasureEligible: employee.compensatoryMeasureEligible,
      blockingReason: employee.blockingReason ?? null,
    }),
    compensatoryIneligibilityReasonCode: ineligibilityReason,
    compensatoryIneligibilityReasonLabel:
      formatCompensatoryIneligibilityReasonLabel(ineligibilityReason),
    hasStructuredPromotion: promotion !== null,
    promotionDate: promotion?.promotionDate ?? null,
    promotionYear: employee.promotionYear,
    promotionMonth: employee.promotionMonth,
    previousGradeCode: promotion?.previousGradeCode ?? null,
    promotedGradeCode: promotion?.promotedGradeCode ?? null,
    previousJobFamilyCode: promotion?.previousJobFamilyCode ?? null,
    promotedJobFamilyCode: promotion?.promotedJobFamilyCode ?? null,
    salaryBeforePromotionFcfa: promotion?.salaryBeforePromotionFcfa ?? null,
    salaryAfterPromotionFcfa: promotion?.salaryAfterPromotionFcfa ?? null,
    promotionAmountFcfa: promotion?.promotionAmountFcfa ?? null,
    promotionRate: promotion?.promotionRate ?? null,
    promotionRateLabel: promotion
      ? formatExactRateAsPercent(promotion.promotionRate, 2)
      : null,
    promotionInclusionStatusLabel: promotion
      ? formatPromotionInclusionStatusLabel(employee.promotionInclusion)
      : null,
    promotionCampaignCostInformativeFcfa:
      employee.promotionInclusion.promotionCampaignCostFcfa,
    promotionCampaignCostInformativeLabel: formatFcfaInteger(
      employee.promotionInclusion.promotionCampaignCostFcfa,
    ),
    annualPromotionBudgetCostFcfa: employee.annualPromotionBudgetCostFcfa,
    annualPromotionBudgetCostLabel: formatFcfaInteger(
      employee.annualPromotionBudgetCostFcfa,
    ),
    promotionCostAlreadyPaidBeforeTechnicalMonthFcfa:
      employee.promotionCostAlreadyPaidBeforeTechnicalMonthFcfa,
    promotionCostAlreadyPaidBeforeTechnicalMonthLabel: formatFcfaInteger(
      employee.promotionCostAlreadyPaidBeforeTechnicalMonthFcfa,
    ),
    promotionCostFromTechnicalMonthToDecemberFcfa:
      employee.promotionCostFromTechnicalMonthToDecemberFcfa,
    promotionCostFromTechnicalMonthToDecemberLabel: formatFcfaInteger(
      employee.promotionCostFromTechnicalMonthToDecemberFcfa,
    ),
    annualPromotionSeniorityImpactFcfa: employee.annualPromotionSeniorityImpactFcfa,
    annualPromotionSeniorityImpactLabel: formatFcfaInteger(
      employee.annualPromotionSeniorityImpactFcfa,
    ),
    combinedAnnualSeniorityImpactFcfa: employee.combinedAnnualSeniorityImpactFcfa,
    combinedAnnualSeniorityImpactLabel: formatFcfaInteger(
      employee.combinedAnnualSeniorityImpactFcfa,
    ),
    combinedAnnualActualCostFcfa: employee.combinedAnnualActualCostFcfa,
    combinedAnnualActualCostLabel: formatFcfaInteger(
      employee.combinedAnnualActualCostFcfa,
    ),
    technicalMonthCompensatoryComplementFcfa:
      technicalMonthEntry?.roundedCompensatoryComplementFcfa ??
      employee.monthlyFinalRoundedIncreaseFcfa,
    technicalMonthCompensatoryComplementLabel: formatFcfaInteger(
      technicalMonthEntry?.roundedCompensatoryComplementFcfa ??
        employee.monthlyFinalRoundedIncreaseFcfa,
    ),
    technicalMonthFinalSalaryFcfa:
      technicalMonthEntry?.finalSalaryFcfa ?? employee.monthlyFinalSalaryFcfa,
    technicalMonthFinalSalaryLabel: formatFcfaInteger(
      technicalMonthEntry?.finalSalaryFcfa ?? employee.monthlyFinalSalaryFcfa,
    ),
    monthlyCompensationTrajectory: trajectory,
    explanationSteps: mapExplanationSteps(employee.explanationSteps),
  };
}

function buildEnvelopeSummary(
  engineResult: PreparedPopulationCalculationResult,
): PromotionAwareEnvelopeSummaryView {
  return {
    annualBudgetTargetFcfa: engineResult.budgetTargetResult.exactAmount,
    annualBudgetTargetLabel: formatExactAmountAsFcfa(
      engineResult.budgetTargetResult.exactAmount,
    ),
    totalAnnualPromotionBudgetCostFcfa:
      engineResult.totalAnnualPromotionBudgetCostFcfa,
    totalAnnualPromotionBudgetCostLabel: formatFcfaInteger(
      engineResult.totalAnnualPromotionBudgetCostFcfa,
    ),
    availableAnnualCompensatoryBudgetFcfa:
      engineResult.availableAnnualCompensatoryBudget,
    availableAnnualCompensatoryBudgetLabel: formatExactAmountAsFcfa(
      engineResult.availableAnnualCompensatoryBudget,
    ),
    totalAnnualTheoreticalCompensatoryCostFcfa:
      engineResult.annualTheoreticalAllocatedTotal,
    totalAnnualTheoreticalCompensatoryCostLabel: formatExactAmountAsFcfa(
      engineResult.annualTheoreticalAllocatedTotal,
    ),
    totalAnnualActualCompensatoryCostFcfa:
      engineResult.annualActualOperationCostFcfa,
    totalAnnualActualCompensatoryCostLabel: formatFcfaInteger(
      engineResult.annualActualOperationCostFcfa,
    ),
    totalAnnualActualCombinedBaseMeasureCostFcfa:
      engineResult.totalCombinedAnnualActualCostFcfa,
    totalAnnualActualCombinedBaseMeasureCostLabel: formatFcfaInteger(
      engineResult.totalCombinedAnnualActualCostFcfa,
    ),
    annualCombinedRoundingDeltaFcfa: engineResult.annualCombinedRoundingDeltaFcfa,
    annualCombinedRoundingDeltaLabel: formatSignedExactAmountAsFcfa(
      engineResult.annualCombinedRoundingDeltaFcfa,
    ),
    compensatoryCalibrationRate: engineResult.compensatoryCalibrationRate,
    compensatoryCalibrationRateLabel: formatExactRateAsPercent(
      engineResult.compensatoryCalibrationRate,
      4,
    ),
  };
}

function buildPaymentCalendar(
  engineResult: PreparedPopulationCalculationResult,
): PaymentCalendarSummaryView {
  const totalCompensatoryReminderFcfa = engineResult.totalBaseSalaryReminderFcfa;
  const totalRemainingYearDirectCompensatoryCostFcfa =
    engineResult.totalRemainingYearDirectIncreaseCostFcfa;
  const totalAnnualActualCompensatoryCostFcfa =
    engineResult.annualActualOperationCostFcfa;

  return {
    totalPromotionCostAlreadyPaidBeforeTechnicalMonthFcfa:
      engineResult.totalPromotionCostAlreadyPaidBeforeTechnicalMonthFcfa,
    totalPromotionCostAlreadyPaidBeforeTechnicalMonthLabel: formatFcfaInteger(
      engineResult.totalPromotionCostAlreadyPaidBeforeTechnicalMonthFcfa,
    ),
    totalPromotionCostFromTechnicalMonthToDecemberFcfa:
      engineResult.totalPromotionCostFromTechnicalMonthToDecemberFcfa,
    totalPromotionCostFromTechnicalMonthToDecemberLabel: formatFcfaInteger(
      engineResult.totalPromotionCostFromTechnicalMonthToDecemberFcfa,
    ),
    totalAnnualPromotionBudgetCostFcfa:
      engineResult.totalAnnualPromotionBudgetCostFcfa,
    totalAnnualPromotionBudgetCostLabel: formatFcfaInteger(
      engineResult.totalAnnualPromotionBudgetCostFcfa,
    ),
    totalCompensatoryReminderFcfa,
    totalCompensatoryReminderLabel: formatFcfaInteger(totalCompensatoryReminderFcfa),
    totalRemainingYearDirectCompensatoryCostFcfa,
    totalRemainingYearDirectCompensatoryCostLabel: formatFcfaInteger(
      totalRemainingYearDirectCompensatoryCostFcfa,
    ),
    totalAnnualActualCompensatoryCostFcfa,
    totalAnnualActualCompensatoryCostLabel: formatFcfaInteger(
      totalAnnualActualCompensatoryCostFcfa,
    ),
    // Invariant d’affichage : comparaison des montants moteur, sans recomposition.
    compensatoryReminderPlusDirectEqualsAnnual:
      totalCompensatoryReminderFcfa +
        totalRemainingYearDirectCompensatoryCostFcfa ===
      totalAnnualActualCompensatoryCostFcfa,
  };
}

function buildSeniorityImpactSummary(
  engineResult: PreparedPopulationCalculationResult,
): SeniorityImpactSummaryView {
  return {
    totalAnnualPromotionSeniorityImpactFcfa:
      engineResult.totalAnnualPromotionSeniorityImpactFcfa,
    totalAnnualPromotionSeniorityImpactLabel: formatFcfaInteger(
      engineResult.totalAnnualPromotionSeniorityImpactFcfa,
    ),
    totalAnnualCompensatorySeniorityImpactFcfa:
      engineResult.totalAnnualSeniorityImpactFcfa,
    totalAnnualCompensatorySeniorityImpactLabel: formatFcfaInteger(
      engineResult.totalAnnualSeniorityImpactFcfa,
    ),
    totalAnnualSeniorityImpactFcfa:
      engineResult.totalCombinedAnnualSeniorityImpactFcfa,
    totalAnnualSeniorityImpactLabel: formatFcfaInteger(
      engineResult.totalCombinedAnnualSeniorityImpactFcfa,
    ),
    totalPromotionSeniorityAlreadyPaidBeforeTechnicalMonthFcfa:
      engineResult.totalPromotionSeniorityAlreadyPaidBeforeTechnicalMonthFcfa,
    totalPromotionSeniorityAlreadyPaidBeforeTechnicalMonthLabel:
      formatFcfaInteger(
        engineResult.totalPromotionSeniorityAlreadyPaidBeforeTechnicalMonthFcfa,
      ),
    totalPromotionSeniorityFromTechnicalMonthToDecemberFcfa:
      engineResult.totalPromotionSeniorityFromTechnicalMonthToDecemberFcfa,
    totalPromotionSeniorityFromTechnicalMonthToDecemberLabel: formatFcfaInteger(
      engineResult.totalPromotionSeniorityFromTechnicalMonthToDecemberFcfa,
    ),
    totalCompensatorySeniorityReminderFcfa:
      engineResult.totalSeniorityReminderFcfa,
    totalCompensatorySeniorityReminderLabel: formatFcfaInteger(
      engineResult.totalSeniorityReminderFcfa,
    ),
    totalRemainingYearDirectCompensatorySeniorityImpactFcfa:
      engineResult.totalRemainingYearDirectSeniorityImpactFcfa,
    totalRemainingYearDirectCompensatorySeniorityImpactLabel: formatFcfaInteger(
      engineResult.totalRemainingYearDirectSeniorityImpactFcfa,
    ),
  };
}

export function buildSimulationResultView(input: {
  campaignId: number;
  campaignName: string | null;
  campaignYear: number | null;
  campaignStatus: CampaignStatus | "unknown";
  evaluationMode: NineBoxMode;
  currentImportBatchId: number | null;
  runSequence: number;
  sourceFingerprint: string;
  configurationFingerprint: string;
  engineResult: PreparedPopulationCalculationResult;
  employeeLabelsById: ReadonlyMap<string, string>;
  familyLabelsByCode?: ReadonlyMap<string, string>;
  gradeLabelsByCode?: ReadonlyMap<string, string>;
}): CampaignSimulationExecutionResult {
  const { engineResult } = input;
  const summary = engineResult.populationSummary;
  const budgetTarget = engineResult.budgetTargetResult;

  const familyLabels = input.familyLabelsByCode ?? new Map<string, string>();
  const gradeLabels = input.gradeLabelsByCode ?? new Map<string, string>();

  const employees = engineResult.employees.map((employee) =>
    mapEmployee(
      employee,
      input.employeeLabelsById,
      familyLabels,
      gradeLabels,
    ),
  );

  const hasStructuredPromotions = employees.some(
    (employee) => employee.hasStructuredPromotion,
  );

  const budgetSummary: SimulationBudgetSummaryView = {
    budgetTargetMode: budgetTarget.mode,
    exactBudgetTarget: budgetTarget.exactAmount,
    exactBudgetTargetLabel: formatExactAmountAsFcfa(budgetTarget.exactAmount),
    manualBudgetFcfa:
      budgetTarget.mode === "manual_amount"
        ? BigInt(budgetTarget.manualBudgetFcfa ?? 0)
        : undefined,
    eligiblePayrollFcfa:
      budgetTarget.mode === "percentage_of_eligible_payroll"
        ? BigInt(budgetTarget.eligiblePayrollFcfa ?? 0)
        : undefined,
    budgetRateBasisPoints:
      budgetTarget.mode === "percentage_of_eligible_payroll"
        ? BigInt(budgetTarget.budgetRateBasisPoints ?? 0)
        : undefined,
    annualActualOperationCostFcfa: engineResult.annualActualOperationCostFcfa,
    annualActualOperationCostLabel: formatFcfaInteger(
      engineResult.annualActualOperationCostFcfa,
    ),
    annualTotalRoundingDelta: engineResult.annualTotalRoundingDelta,
    annualTotalRoundingDeltaLabel: formatSignedExactAmountAsFcfa(
      engineResult.annualTotalRoundingDelta,
    ),
    annualTheoreticalAllocatedTotal: summary.annualTheoreticalAllocatedTotal,
    annualTheoreticalAllocatedTotalLabel: formatExactAmountAsFcfa(
      summary.annualTheoreticalAllocatedTotal,
    ),
    monthlyTheoreticalIncreaseTotal: summary.monthlyTheoreticalIncreaseTotal,
    monthlyTheoreticalIncreaseTotalLabel: formatExactAmountAsFcfa(
      summary.monthlyTheoreticalIncreaseTotal,
    ),
    roundingMode: engineResult.roundingPolicy.mode,
    roundingStepFcfa: BigInt(engineResult.roundingPolicy.stepFcfa),
    envelopeSummary: buildEnvelopeSummary(engineResult),
    paymentCalendar: buildPaymentCalendar(engineResult),
    seniorityImpactSummary: buildSeniorityImpactSummary(engineResult),
    fullYearRunRatePromotionCostFcfa:
      engineResult.fullYearRunRatePromotionCostFcfa,
    fullYearRunRatePromotionCostLabel: formatFcfaInteger(
      engineResult.fullYearRunRatePromotionCostFcfa,
    ),
    fullYearRunRateCompensatoryCostFcfa:
      engineResult.fullYearRunRateCompensatoryCostFcfa,
    fullYearRunRateCompensatoryCostLabel: formatFcfaInteger(
      engineResult.fullYearRunRateCompensatoryCostFcfa,
    ),
    fullYearRunRateCombinedBaseMeasureCostFcfa:
      engineResult.fullYearRunRateCombinedBaseMeasureCostFcfa,
    fullYearRunRateCombinedBaseMeasureCostLabel: formatFcfaInteger(
      engineResult.fullYearRunRateCombinedBaseMeasureCostFcfa,
    ),
    fullYearRunRateSeniorityImpactFcfa:
      engineResult.fullYearRunRateSeniorityImpactFcfa,
    fullYearRunRateSeniorityImpactLabel: formatFcfaInteger(
      engineResult.fullYearRunRateSeniorityImpactFcfa,
    ),
    hasStructuredPromotions,
    hasImputedPromotionBudgetCost:
      engineResult.totalAnnualPromotionBudgetCostFcfa > 0n,
  };

  const populationSummary: SimulationPopulationSummaryView = {
    employeeCount: summary.employeeCount,
    positiveWeightEmployeeCount: summary.positiveWeightEmployeeCount,
    zeroWeightEmployeeCount: summary.zeroWeightEmployeeCount,
    confirmedUnderperformerCount: summary.confirmedUnderperformerCount,
    annualTheoreticalAllocatedTotal: summary.annualTheoreticalAllocatedTotal,
    annualActualOperationCostFcfa: summary.annualActualOperationCostFcfa,
    annualTotalRoundingDelta: summary.annualTotalRoundingDelta,
    isTheoreticalBudgetExactlyAllocated:
      summary.isTheoreticalBudgetExactlyAllocated,
    campaignYear: summary.campaignYear,
    retroactivityStartMonth: summary.retroactivityStartMonth,
    technicalApplicationMonth: summary.technicalApplicationMonth,
    campaignCoveredMonthCount: summary.campaignCoveredMonthCount,
    totalBaseSalaryReminderFcfa: summary.totalBaseSalaryReminderFcfa,
    totalRemainingYearDirectIncreaseCostFcfa:
      summary.totalRemainingYearDirectIncreaseCostFcfa,
    totalAnnualActualBaseIncreaseCostFcfa:
      summary.totalAnnualActualBaseIncreaseCostFcfa,
    totalSeniorityReminderFcfa: summary.totalSeniorityReminderFcfa,
    totalRemainingYearDirectSeniorityImpactFcfa:
      summary.totalRemainingYearDirectSeniorityImpactFcfa,
    totalAnnualSeniorityImpactFcfa: summary.totalAnnualSeniorityImpactFcfa,
    fullYearRunRatePromotionCostFcfa: summary.fullYearRunRatePromotionCostFcfa,
    fullYearRunRatePromotionCostLabel: formatFcfaInteger(
      summary.fullYearRunRatePromotionCostFcfa,
    ),
    fullYearRunRateCompensatoryCostFcfa:
      summary.fullYearRunRateCompensatoryCostFcfa,
    fullYearRunRateCompensatoryCostLabel: formatFcfaInteger(
      summary.fullYearRunRateCompensatoryCostFcfa,
    ),
    fullYearRunRateCombinedBaseMeasureCostFcfa:
      summary.fullYearRunRateCombinedBaseMeasureCostFcfa,
    fullYearRunRateCombinedBaseMeasureCostLabel: formatFcfaInteger(
      summary.fullYearRunRateCombinedBaseMeasureCostFcfa,
    ),
    fullYearRunRateSeniorityImpactFcfa:
      summary.fullYearRunRateSeniorityImpactFcfa,
    fullYearRunRateSeniorityImpactLabel: formatFcfaInteger(
      summary.fullYearRunRateSeniorityImpactFcfa,
    ),
    promotedIncludedEmployeeCount: summary.promotedIncludedEmployeeCount,
    totalAnnualPromotionBudgetCostFcfa: summary.totalAnnualPromotionBudgetCostFcfa,
    availableAnnualCompensatoryBudget: summary.availableAnnualCompensatoryBudget,
    totalCombinedAnnualActualCostFcfa: summary.totalCombinedAnnualActualCostFcfa,
    totalAnnualPromotionSeniorityImpactFcfa:
      summary.totalAnnualPromotionSeniorityImpactFcfa,
    totalCombinedAnnualSeniorityImpactFcfa:
      summary.totalCombinedAnnualSeniorityImpactFcfa,
    compensatoryCalibrationRate: summary.compensatoryCalibrationRate,
  };

  return {
    campaignId: input.campaignId,
    campaignName: input.campaignName,
    campaignYear: input.campaignYear,
    technicalApplicationMonth: engineResult.technicalApplicationMonth,
    campaignStatus: input.campaignStatus,
    evaluationMode: input.evaluationMode,
    currentImportBatchId: input.currentImportBatchId,
    runSequence: input.runSequence,
    sourceFingerprint: input.sourceFingerprint,
    configurationFingerprint: input.configurationFingerprint,
    calculationContractVersion: CALCULATION_CONTRACT_VERSION,
    budgetSummary,
    populationSummary,
    employees,
    explanationSteps: mapExplanationSteps(engineResult.explanationSteps),
  };
}

export {
  formatBasisPointsAsPercent,
  formatExactAmountAsFcfa,
  formatExactRateAsPercent,
  formatExactWeight,
  formatFactorMilli,
  formatFcfaInteger,
  formatExactAmount,
  formatSeniorityRatePercent,
  formatSignedExactAmountAsFcfa,
  formatSignedFcfaInteger,
};
