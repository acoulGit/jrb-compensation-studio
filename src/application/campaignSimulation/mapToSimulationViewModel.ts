/**
 * Adaptateurs résultat courant / persisté → vue partagée (Lot 2B-4B).
 *
 * Sémantique schema v3 (contrat v4) : la vue courante utilise les libellés
 * HEAD (`annualTheoreticalAllocatedTotalLabel`, valeurs mensuelles salarié) et
 * expose la période d'effet, les promotions, le minimum garanti et la
 * trajectoire mensuelle. Pour un snapshot persisté, la compatibilité est
 * classée via `classifyResultSchemaVersion` : les champs v3 indisponibles
 * restent `null` (jamais de faux zéro, jamais de détail mensuel inventé).
 */

import type {
  CampaignSimulationExecutionResult,
  MonthlyCompensationTrajectoryView,
} from "./campaignSimulationExecutionModels";
import {
  formatBasisPointsAsPercent,
  formatExactAmountAsFcfa,
  formatExactRateAsPercent,
  formatExactWeight,
  formatFactorMilli,
  formatFcfaInteger,
  formatSeniorityRatePercent,
} from "./formatExactBudgetDisplay";
import {
  formatNineBoxTreatmentLabel,
  SOCIAL_MECHANISM_KIND_LABELS_FR,
  technicalApplicationMonthLabelFr,
  type NineBoxTreatmentKind,
  type SocialMechanismKind,
} from "../../domain/compensationCalculation";
import {
  resolveMinimumGuaranteeEffectiveMonth,
} from "./resolveMinimumGuaranteeEffectiveMonth";
import {
  classifyResultSchemaVersion,
  resultSchemaCompatibilityMessage,
  type ResultSchemaCompatibility,
} from "./resultSchemaCompatibility";
import type {
  PersistedSimulationEmployeeMonthResult,
  PersistedSimulationEmployeeResult,
  PersistedSimulationRunDetail,
  PersistedSimulationRunSummary,
} from "./simulationPersistenceModels";
import type {
  SimulationEmployeeMonthViewModel,
  SimulationEmployeeViewModel,
  SimulationResultViewModel,
  SimulationSummaryViewModel,
} from "./simulationViewModels";

function formatIsoDateLabelFr(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) {
    return iso;
  }
  return `${match[3]}/${match[2]}/${match[1]}`;
}

const MONTH_LABELS_FR = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
] as const;

function monthLabelFr(month: number): string {
  return MONTH_LABELS_FR[month - 1] ?? `Mois ${month}`;
}

function formatUniversalFixedAmountExclusionReasonLabel(
  reason: string | null | undefined,
): string | null {
  if (!reason) return null;
  switch (reason) {
    case "MISSING_CONTRACT_TYPE":
      return "Type de contrat manquant";
    case "CONTRACT_TYPE_EXCLUDED":
      return "Type de contrat exclu";
    case "EMPLOYMENT_STATUS_EXCLUDED":
      return "Statut d’emploi exclu";
    case "INSUFFICIENT_SENIORITY":
      return "Ancienneté insuffisante";
    default:
      return reason;
  }
}

function formatUniversalFixedAmountEligibilityLabel(
  eligible: boolean | null | undefined,
  exclusionReason: string | null | undefined,
): string | null {
  if (eligible === null || eligible === undefined) return null;
  if (eligible) return "Éligible";
  const reason = formatUniversalFixedAmountExclusionReasonLabel(exclusionReason);
  return reason ? `Non éligible (${reason})` : "Non éligible";
}

function nullableFcfaLabel(value: bigint | null | undefined): string | null {
  return value === null || value === undefined ? null : formatFcfaInteger(value);
}

/** « Non disponible » pour un snapshot v4 et antérieur (jamais de 0,900 reconstruit). */
function nineBoxConfirmationFactorLabel(
  value: number | null | undefined,
): string | null {
  return value === null || value === undefined
    ? "Non disponible"
    : formatFactorMilli(value);
}

// ---------------------------------------------------------------------------
// Résultat courant (moteur v3)
// ---------------------------------------------------------------------------

function mapExecutionMonth(
  month: MonthlyCompensationTrajectoryView,
): SimulationEmployeeMonthViewModel {
  return {
    month: month.month,
    monthLabel: month.monthLabel,
    baseSalaryLabel: month.baseSalaryLabel,
    gradeCode: month.gradeCode,
    jobFamilyCode: month.jobFamilyCode,
    compensatoryComplementRateLabel: month.compensatoryComplementRateLabel,
    theoreticalCompensatoryComplementLabel:
      month.theoreticalCompensatoryComplementLabel,
    minimumComplementFloorLabel: month.minimumComplementFloorLabel,
    actualComplementAboveMinimumLabel: month.actualComplementAboveMinimumLabel,
    roundedCompensatoryComplementLabel: month.roundedCompensatoryComplementLabel,
    promotionBudgetCostLabel: month.promotionBudgetCostLabel,
    finalSalaryLabel: month.finalSalaryLabel,
    seniorityRateLabel: month.seniorityRateLabel,
    totalSeniorityImpactLabel: month.totalSeniorityImpactLabel,
    paymentTiming: month.paymentTiming,
    promotionPaymentTiming: month.promotionActive
      ? month.paymentTiming
      : "not_applicable",
    coveredByCampaignPeriod: month.coveredByCampaignPeriod,
  };
}

function mapExecutionEmployee(
  employee: CampaignSimulationExecutionResult["employees"][number],
): SimulationEmployeeViewModel {
  return {
    employeeId: employee.employeeId,
    employeeDisplayName: employee.employeeDisplayName,
    familyCode: employee.familyCode,
    familyLabel: employee.familyLabel,
    gradeCode: employee.gradeCode,
    gradeLabel: employee.gradeLabel,
    salaryFcfa: employee.salaryFcfa,
    s0Fcfa: employee.s0Fcfa,
    salaryRatioBasisPoints: employee.salaryRatioBasisPoints,
    salaryPositionCode: employee.salaryPositionCode,
    salaryPositionLabel: employee.salaryPositionLabel,
    positionFactorMilli: employee.positionFactorMilli,
    evaluationMode: employee.evaluationMode,
    performanceLevel: employee.performanceLevel,
    potentialLevel: employee.potentialLevel,
    evaluationFactorLabel: employee.evaluationFactorLabel,
    theoreticalMatrixWeightLabel: employee.theoreticalMatrixWeightLabel,
    effectiveMatrixWeightLabel: employee.effectiveMatrixWeightLabel,
    allocationWeightLabel: employee.allocationWeightLabel,
    neutralizeNineBoxEffect: employee.neutralizeNineBoxEffect,
    sourceNineBoxCode: employee.sourceNineBoxCode,
    nineBoxTreatmentKind: employee.nineBoxTreatmentKind,
    nineBoxTreatmentLabel: employee.nineBoxTreatmentLabel,
    blockingReason: employee.blockingReason,
    // Libellés HEAD : valeurs mensuelles individuelles (schema v3).
    theoreticalIncreaseRateLabel: employee.monthlyTheoreticalIncreaseRateLabel,
    theoreticalIncreaseAmountLabel: employee.monthlyTheoreticalIncreaseLabel,
    finalRoundedIncreaseAmountFcfa: employee.monthlyFinalRoundedIncreaseFcfa,
    individualRoundingDeltaLabel: employee.monthlyRoundingDeltaLabel,
    finalSalaryFcfa: employee.monthlyFinalSalaryFcfa,
    explanationSteps: employee.explanationSteps,
    // ---- Champs schema v3 ----
    compensatoryEligibilityLabel: employee.compensatoryEligibilityLabel,
    promotionStatusLabel: employee.promotionStatusLabel,
    annualPromotionBudgetCostLabel: employee.annualPromotionBudgetCostLabel,
    campaignPeriodMinimumComplementFloorCostLabel:
      employee.campaignPeriodMinimumComplementFloorCostLabel,
    campaignPeriodCompensationAboveMinimumCostLabel:
      employee.campaignPeriodCompensationAboveMinimumCostLabel,
    combinedAnnualActualCostLabel: employee.combinedAnnualActualCostLabel,
    annualRoundingDeltaLabel: employee.annualRoundingDeltaLabel,
    fullYearRunRateCombinedBaseMeasureCostLabel:
      employee.fullYearRunRateCombinedBaseMeasureCostLabel,
    technicalMonthFinalSalaryLabel: employee.technicalMonthFinalSalaryLabel,
    retroactivityStartMonth: employee.retroactivityStartMonth,
    technicalApplicationMonth: employee.technicalApplicationMonth,
    minimumGuaranteeEffectiveMonth:
      employee.minimumGuaranteeEffectiveMonth ??
      employee.technicalApplicationMonth,
    minimumGuaranteeEffectiveMonthOrigin: "explicit",
    minimumGuaranteeEffectiveMonthLabel: technicalApplicationMonthLabelFr(
      employee.minimumGuaranteeEffectiveMonth ??
        employee.technicalApplicationMonth,
    ),
    minimumCompensatoryReminderLabel: employee.minimumCompensatoryReminderLabel,
    aboveMinimumCompensatoryReminderLabel:
      employee.aboveMinimumCompensatoryReminderLabel,
    baseSalaryReminderLabel: formatFcfaInteger(employee.baseSalaryReminderFcfa),
    socialMechanismKind: employee.socialMechanismKind,
    isUniversalFixedAmountEligible: employee.isUniversalFixedAmountEligible,
    universalFixedAmountEligibilityLabel: formatUniversalFixedAmountEligibilityLabel(
      employee.isUniversalFixedAmountEligible,
      employee.universalFixedAmountExclusionReason,
    ),
    universalFixedAmountExclusionReasonLabel:
      formatUniversalFixedAmountExclusionReasonLabel(
        employee.universalFixedAmountExclusionReason,
      ),
    universalFixedAmountMonthlyAmountLabel: formatFcfaInteger(
      employee.universalFixedAmountMonthlyAmountFcfa,
    ),
    universalFixedAmountEffectiveMonth: employee.universalFixedAmountEffectiveMonth,
    universalFixedAmountEffectiveMonthLabel: technicalApplicationMonthLabelFr(
      employee.universalFixedAmountEffectiveMonth,
    ),
    universalFixedAmountSeniorityReferenceDate:
      employee.universalFixedAmountSeniorityReferenceDate,
    universalFixedAmountSeniorityReferenceDateLabel: formatIsoDateLabelFr(
      employee.universalFixedAmountSeniorityReferenceDate,
    ),
    campaignPeriodUniversalFixedAmountCostLabel:
      employee.campaignPeriodUniversalFixedAmountCostLabel,
    universalFixedAmountReminderLabel: employee.universalFixedAmountReminderLabel,
    universalFixedAmountRemainingYearDirectCostLabel:
      employee.universalFixedAmountRemainingYearDirectCostLabel,
    months: employee.monthlyCompensationTrajectory.map(mapExecutionMonth),
  };
}

export function mapExecutionResultToViewModel(
  result: CampaignSimulationExecutionResult,
): SimulationResultViewModel {
  const budget = result.budgetSummary;
  const population = result.populationSummary;
  const envelope = budget.envelopeSummary;
  const socialMechanismKind = population.socialMechanismKind as SocialMechanismKind;
  const summary: SimulationSummaryViewModel = {
    mode: "current",
    campaignId: result.campaignId,
    campaignName: result.campaignName ?? `Campagne #${result.campaignId}`,
    campaignYear: result.campaignYear,
    evaluationMode: result.evaluationMode,
    employeeCount: population.employeeCount,
    positiveWeightEmployeeCount: population.positiveWeightEmployeeCount,
    zeroWeightEmployeeCount: population.zeroWeightEmployeeCount,
    confirmedUnderperformerCount: population.confirmedUnderperformerCount,
    neutralizeNineBoxEffectEmployeeCount:
      population.neutralizeNineBoxEffectEmployeeCount,
    nineBoxConfirmationFactorMilli: population.nineBoxConfirmationFactorMilli,
    nineBoxConfirmationFactorLabel: nineBoxConfirmationFactorLabel(
      population.nineBoxConfirmationFactorMilli,
    ),
    budgetTargetLabel: budget.exactBudgetTargetLabel,
    theoreticalAllocatedTotalLabel: budget.annualTheoreticalAllocatedTotalLabel,
    actualOperationAmountLabel: budget.annualActualOperationCostLabel,
    totalRoundingDeltaLabel: budget.annualTotalRoundingDeltaLabel,
    roundingMode: budget.roundingMode,
    roundingStepLabel: formatFcfaInteger(budget.roundingStepFcfa),
    budgetTargetMode: budget.budgetTargetMode,
    manualBudgetLabel:
      budget.manualBudgetFcfa !== undefined
        ? formatFcfaInteger(budget.manualBudgetFcfa)
        : null,
    eligiblePayrollLabel:
      budget.eligiblePayrollFcfa !== undefined
        ? formatFcfaInteger(budget.eligiblePayrollFcfa)
        : null,
    budgetRateLabel:
      budget.budgetRateBasisPoints !== undefined
        ? formatBasisPointsAsPercent(budget.budgetRateBasisPoints)
        : null,
    runSequence: result.runSequence,
    sourceImportBatchId: result.currentImportBatchId,
    sourceImportFileName: null,
    schemaCompatibility: "current",
    schemaCompatibilityMessage: null,
    retroactivityStartMonth: population.retroactivityStartMonth,
    technicalApplicationMonth: population.technicalApplicationMonth,
    minimumGuaranteeEffectiveMonth: population.minimumGuaranteeEffectiveMonth,
    minimumGuaranteeEffectiveMonthOrigin: "explicit",
    campaignCoveredMonthCount: population.campaignCoveredMonthCount,
    periodPromotionBudgetCostLabel:
      envelope.totalAnnualPromotionBudgetCostLabel,
    periodMinimumComplementFloorCostLabel:
      envelope.totalMinimumComplementFloorCostLabel,
    periodCompensationAboveMinimumCostLabel:
      envelope.actualCompensationAboveMinimumCostLabel,
    periodCombinedActualCostLabel:
      envelope.totalAnnualActualCombinedBaseMeasureCostLabel,
    periodCombinedRoundingDeltaLabel: envelope.annualCombinedRoundingDeltaLabel,
    fullYearRunRateCombinedBaseMeasureCostLabel:
      budget.fullYearRunRateCombinedBaseMeasureCostLabel,
    socialMechanismKind: population.socialMechanismKind,
    socialMechanismKindLabel:
      SOCIAL_MECHANISM_KIND_LABELS_FR[socialMechanismKind] ??
      population.socialMechanismKind,
    universalFixedAmountMonthlyAmountLabel:
      socialMechanismKind === "universal_fixed_amount"
        ? formatFcfaInteger(population.universalFixedAmountMonthlyAmountFcfa)
        : null,
    universalFixedAmountEffectiveMonth:
      socialMechanismKind === "universal_fixed_amount"
        ? population.universalFixedAmountEffectiveMonth
        : null,
    universalFixedAmountEffectiveMonthLabel:
      socialMechanismKind === "universal_fixed_amount"
        ? technicalApplicationMonthLabelFr(
            population.universalFixedAmountEffectiveMonth,
          )
        : null,
    universalFixedAmountMinimumSeniorityMonths:
      socialMechanismKind === "universal_fixed_amount"
        ? population.universalFixedAmountMinimumSeniorityMonths
        : null,
    universalFixedAmountSeniorityReferenceDate:
      socialMechanismKind === "universal_fixed_amount"
        ? population.universalFixedAmountSeniorityReferenceDate
        : null,
    universalFixedAmountSeniorityReferenceDateLabel:
      socialMechanismKind === "universal_fixed_amount"
        ? formatIsoDateLabelFr(population.universalFixedAmountSeniorityReferenceDate)
        : null,
    universalFixedAmountEligibleEmployeeCount:
      socialMechanismKind === "universal_fixed_amount"
        ? population.universalFixedAmountEligibleEmployeeCount
        : null,
    totalUniversalFixedAmountCostLabel:
      socialMechanismKind === "universal_fixed_amount"
        ? envelope.totalUniversalFixedAmountCostLabel
        : null,
    availableBudgetAfterPromotionsAndSocialMechanismLabel:
      socialMechanismKind === "universal_fixed_amount"
        ? envelope.availableBudgetAfterPromotionsAndSocialMechanismLabel
        : null,
  };
  return {
    summary,
    employees: result.employees.map(mapExecutionEmployee),
  };
}

// ---------------------------------------------------------------------------
// Snapshot persisté (v1 / v2 / v3)
// ---------------------------------------------------------------------------

function mapPersistedMonth(
  month: PersistedSimulationEmployeeMonthResult,
): SimulationEmployeeMonthViewModel {
  return {
    month: month.month,
    monthLabel: monthLabelFr(month.month),
    baseSalaryLabel: formatFcfaInteger(month.baseSalaryFcfa),
    gradeCode: month.gradeCode,
    jobFamilyCode: month.jobFamilyCode,
    compensatoryComplementRateLabel: formatExactRateAsPercent(
      month.compensatoryComplementRate,
    ),
    theoreticalCompensatoryComplementLabel: formatExactAmountAsFcfa(
      month.theoreticalCompensatoryComplement,
    ),
    minimumComplementFloorLabel: formatFcfaInteger(
      month.minimumComplementFloorFcfa,
    ),
    actualComplementAboveMinimumLabel: formatFcfaInteger(
      month.actualComplementAboveMinimumFcfa,
    ),
    roundedCompensatoryComplementLabel: formatFcfaInteger(
      month.roundedCompensatoryComplementFcfa,
    ),
    promotionBudgetCostLabel: formatFcfaInteger(month.promotionBudgetCostFcfa),
    finalSalaryLabel: formatFcfaInteger(month.finalSalaryFcfa),
    seniorityRateLabel: formatSeniorityRatePercent(month.seniorityRatePercent),
    totalSeniorityImpactLabel: formatFcfaInteger(month.totalSeniorityImpactFcfa),
    paymentTiming: month.paymentTiming,
    promotionPaymentTiming: month.promotionPaymentTiming,
    coveredByCampaignPeriod: month.coveredByCampaignPeriod,
  };
}

function mapPersistedEmployee(
  employee: PersistedSimulationEmployeeResult,
  compatibility: ResultSchemaCompatibility,
  calendar?: {
    retroactivityStartMonth: number | null;
    technicalApplicationMonth: number | null;
    minimumGuaranteeEffectiveMonth: number | null;
    minimumGuaranteeEffectiveMonthOrigin:
      | "explicit"
      | "legacy_retroactivity"
      | null;
    minimumGuaranteeEffectiveMonthLabel: string | null;
  },
): SimulationEmployeeViewModel {
  const isCurrent = compatibility === "current";
  const hasMonths =
    isCurrent &&
    Array.isArray(employee.months) &&
    employee.months.length > 0;
  return {
    employeeId: employee.employeeId,
    employeeDisplayName: employee.employeeDisplayName,
    familyCode: employee.familyCode,
    familyLabel: employee.familyLabel,
    gradeCode: employee.gradeCode,
    gradeLabel: employee.gradeLabel,
    salaryFcfa: employee.salaryFcfa,
    s0Fcfa: employee.s0Fcfa,
    salaryRatioBasisPoints: employee.salaryRatioBasisPoints,
    salaryPositionCode: employee.salaryPositionCode,
    salaryPositionLabel: employee.salaryPositionLabel,
    positionFactorMilli: employee.positionFactorMilli,
    evaluationMode: employee.evaluationMode,
    performanceLevel: employee.performanceLevel,
    potentialLevel: employee.potentialLevel,
    evaluationFactorLabel: formatExactWeight(employee.evaluationFactor),
    theoreticalMatrixWeightLabel: formatExactWeight(
      employee.theoreticalMatrixWeight,
    ),
    effectiveMatrixWeightLabel: formatExactWeight(employee.effectiveMatrixWeight),
    allocationWeightLabel: formatExactWeight(employee.allocationWeight),
    neutralizeNineBoxEffect: employee.neutralizeNineBoxEffect ?? null,
    sourceNineBoxCode: employee.sourceNineBoxCode ?? null,
    nineBoxTreatmentKind: employee.nineBoxTreatmentKind ?? null,
    nineBoxTreatmentLabel: formatNineBoxTreatmentLabel(
      employee.nineBoxTreatmentKind as NineBoxTreatmentKind | null | undefined,
    ),
    blockingReason: employee.blockingReason,
    theoreticalIncreaseRateLabel: formatExactRateAsPercent(
      employee.theoreticalIncreaseRate,
    ),
    theoreticalIncreaseAmountLabel: formatExactAmountAsFcfa(
      employee.theoreticalIncreaseAmount,
    ),
    finalRoundedIncreaseAmountFcfa: employee.finalRoundedIncreaseAmountFcfa,
    individualRoundingDeltaLabel: formatExactAmountAsFcfa(
      employee.individualRoundingDelta,
    ),
    finalSalaryFcfa: employee.finalSalaryFcfa,
    explanationSteps: employee.explanationSteps,
    retroactivityStartMonth: calendar?.retroactivityStartMonth ?? null,
    technicalApplicationMonth: calendar?.technicalApplicationMonth ?? null,
    minimumGuaranteeEffectiveMonth:
      calendar?.minimumGuaranteeEffectiveMonth ?? null,
    minimumGuaranteeEffectiveMonthOrigin:
      calendar?.minimumGuaranteeEffectiveMonthOrigin ?? null,
    minimumGuaranteeEffectiveMonthLabel:
      calendar?.minimumGuaranteeEffectiveMonthLabel ?? null,
    minimumCompensatoryReminderLabel: isCurrent
      ? nullableFcfaLabel(employee.minimumCompensatoryReminderFcfa)
      : null,
    aboveMinimumCompensatoryReminderLabel: isCurrent
      ? nullableFcfaLabel(employee.aboveMinimumCompensatoryReminderFcfa)
      : null,
    baseSalaryReminderLabel: isCurrent
      ? nullableFcfaLabel(employee.baseSalaryReminderFcfa)
      : null,
    months: hasMonths
      ? employee.months!.map(mapPersistedMonth)
      : null,
  };
}

export function mapPersistedDetailToViewModel(
  detail: PersistedSimulationRunDetail,
): SimulationResultViewModel {
  const summaryRow: PersistedSimulationRunSummary = detail.summary;
  const compatibility = classifyResultSchemaVersion(
    summaryRow.resultSchemaVersion,
  );
  const isCurrent = compatibility === "current";
  const resolvedMinimumEffective = isCurrent
    ? resolveMinimumGuaranteeEffectiveMonth({
        resultSchemaVersion: summaryRow.resultSchemaVersion,
        storedMonth: summaryRow.minimumGuaranteeEffectiveMonth,
        retroactivityStartMonth: summaryRow.retroactivityStartMonth,
      })
    : null;
  const summary: SimulationSummaryViewModel = {
    mode: "persisted-readonly",
    campaignId: summaryRow.campaignId,
    campaignName: summaryRow.campaignName,
    campaignYear: summaryRow.campaignYear,
    campaignStatusAtRun: summaryRow.campaignStatusAtRun,
    evaluationMode: summaryRow.evaluationMode,
    employeeCount: summaryRow.employeeCount,
    positiveWeightEmployeeCount: summaryRow.positiveWeightEmployeeCount,
    zeroWeightEmployeeCount: summaryRow.zeroWeightEmployeeCount,
    confirmedUnderperformerCount: summaryRow.confirmedUnderperformerCount,
    neutralizeNineBoxEffectEmployeeCount:
      summaryRow.neutralizeNineBoxEffectEmployeeCount ?? null,
    nineBoxConfirmationFactorMilli:
      summaryRow.nineBoxConfirmationFactorMilli ?? null,
    nineBoxConfirmationFactorLabel: nineBoxConfirmationFactorLabel(
      summaryRow.nineBoxConfirmationFactorMilli,
    ),
    budgetTargetLabel: formatExactAmountAsFcfa(summaryRow.exactBudgetTarget),
    theoreticalAllocatedTotalLabel: formatExactAmountAsFcfa(
      summaryRow.theoreticalAllocatedTotal,
    ),
    actualOperationAmountLabel: formatFcfaInteger(
      summaryRow.actualOperationAmountFcfa,
    ),
    totalRoundingDeltaLabel: formatExactAmountAsFcfa(
      summaryRow.totalRoundingDelta,
    ),
    roundingMode: summaryRow.roundingMode,
    roundingStepLabel: formatFcfaInteger(summaryRow.roundingStepFcfa),
    budgetTargetMode: summaryRow.budgetTargetMode,
    manualBudgetLabel:
      summaryRow.manualBudgetFcfa !== null
        ? formatFcfaInteger(summaryRow.manualBudgetFcfa)
        : null,
    eligiblePayrollLabel:
      summaryRow.eligiblePayrollFcfa !== null
        ? formatFcfaInteger(summaryRow.eligiblePayrollFcfa)
        : null,
    budgetRateLabel:
      summaryRow.budgetRateBasisPoints !== null
        ? formatBasisPointsAsPercent(summaryRow.budgetRateBasisPoints)
        : null,
    runNumber: summaryRow.runNumber,
    createdAt: summaryRow.createdAt,
    sourceImportBatchId: summaryRow.sourceImportBatchId,
    sourceImportFileName: summaryRow.sourceImportFileName,
    sourceFingerprint: summaryRow.sourceFingerprint,
    configurationFingerprint: summaryRow.configurationFingerprint,
    resultSchemaVersion: summaryRow.resultSchemaVersion,
    schemaCompatibility: compatibility,
    schemaCompatibilityMessage: resultSchemaCompatibilityMessage(
      summaryRow.resultSchemaVersion,
    ),
    // Champs v3 : uniquement pour un snapshot courant ; sinon `null` (aucun
    // faux zéro pour v1/v2).
    retroactivityStartMonth: isCurrent
      ? (summaryRow.retroactivityStartMonth ?? null)
      : null,
    technicalApplicationMonth: isCurrent
      ? (summaryRow.technicalApplicationMonth ?? null)
      : null,
    minimumGuaranteeEffectiveMonth: resolvedMinimumEffective?.month ?? null,
    minimumGuaranteeEffectiveMonthOrigin:
      resolvedMinimumEffective?.origin ?? null,
    campaignCoveredMonthCount: isCurrent
      ? (summaryRow.campaignCoveredMonthCount ?? null)
      : null,
    periodPromotionBudgetCostLabel: isCurrent
      ? nullableFcfaLabel(summaryRow.promotionCampaignPeriodBudgetCostFcfa)
      : null,
    periodMinimumComplementFloorCostLabel: isCurrent
      ? nullableFcfaLabel(summaryRow.totalMinimumComplementFloorCostFcfa)
      : null,
    periodCompensationAboveMinimumCostLabel: isCurrent
      ? nullableFcfaLabel(summaryRow.actualCompensationAboveMinimumCostFcfa)
      : null,
    periodCombinedActualCostLabel: isCurrent
      ? nullableFcfaLabel(summaryRow.actualCombinedCampaignPeriodCostFcfa)
      : null,
    periodCombinedRoundingDeltaLabel: isCurrent
      ? formatExactAmountAsFcfa(summaryRow.totalRoundingDelta)
      : null,
    fullYearRunRateCombinedBaseMeasureCostLabel: isCurrent
      ? nullableFcfaLabel(summaryRow.fullYearRunRateCombinedBaseMeasureCostFcfa)
      : null,
  };
  return {
    summary,
    employees: detail.employees.map((employee) =>
      mapPersistedEmployee(employee, compatibility, {
        retroactivityStartMonth: summary.retroactivityStartMonth ?? null,
        technicalApplicationMonth: summary.technicalApplicationMonth ?? null,
        minimumGuaranteeEffectiveMonth:
          summary.minimumGuaranteeEffectiveMonth ?? null,
        minimumGuaranteeEffectiveMonthOrigin:
          summary.minimumGuaranteeEffectiveMonthOrigin ?? null,
        minimumGuaranteeEffectiveMonthLabel:
          resolvedMinimumEffective?.monthLabel ?? null,
      }),
    ),
  };
}
