/**
 * Mapping CampaignSimulationExecutionResult → SaveSimulationRunDto
 * (Lot 2B-P1 / sémantique schema v3 — contrat de calcul v4).
 *
 * Principe : mapping DIRECT moteur → DTO, AUCUN recalcul métier. Les seules
 * dérivations autorisées sont calendaires (comptes de mois) et de codes stables
 * (promotion_payment_timing). Tous les montants/fractions sont sérialisés en
 * TEXT canonique.
 *
 * Réutilisation des colonnes 0005 (période) :
 * - budget_target_*     = enveloppe de la période d'effet
 * - theoretical_total_* = allocation théorique de la période
 * - actual_operation_amount_fcfa_text = coût effectif de campagne (période)
 * - total_rounding_delta_* = delta de période (combiné)
 *
 * Colonnes v3 (migration 0007) : rétroactivité, ancienneté, minimum garanti,
 * enveloppe promotion-aware et trajectoire mensuelle (12 mois).
 */

import {
  CALCULATION_CONTRACT_VERSION,
  MINIMUM_INCREASE_CONTRACT_VERSION,
  RESULT_SCHEMA_VERSION,
  RESULT_SCHEMA_VERSION_V2,
  SENIORITY_IMPACT_CONTRACT_VERSION,
  type MinimumIncreasePolicy,
} from "../../domain/compensationCalculation";
import { CompensationCalculationError } from "../../domain/compensationCalculation";
import type {
  CampaignSimulationExecutionResult,
  MonthlyCompensationTrajectoryView,
} from "./campaignSimulationExecutionModels";
import {
  bigintToCanonicalText,
  exactAmountToCanonicalTexts,
} from "./canonicalDecimalText";
import type {
  SaveSimulationEmployeeDto,
  SaveSimulationEmployeeMonthDto,
  SaveSimulationRunDto,
} from "./simulationPersistenceModels";

function mapMinimumPolicyTexts(policy: MinimumIncreasePolicy | undefined): {
  minimumMonthlyAmountText: string | null;
  minimumRateNumeratorText: string | null;
  minimumRateDenominatorText: string | null;
} {
  if (!policy || policy.mode === "none") {
    return {
      minimumMonthlyAmountText: null,
      minimumRateNumeratorText: null,
      minimumRateDenominatorText: null,
    };
  }
  if (policy.mode === "fixed_monthly_amount") {
    return {
      minimumMonthlyAmountText:
        policy.minimumMonthlyAmountFcfa !== null
          ? bigintToCanonicalText(policy.minimumMonthlyAmountFcfa)
          : null,
      minimumRateNumeratorText: null,
      minimumRateDenominatorText: null,
    };
  }
  const rate = policy.minimumIncreaseRate
    ? exactAmountToCanonicalTexts(policy.minimumIncreaseRate)
    : null;
  return {
    minimumMonthlyAmountText: null,
    minimumRateNumeratorText: rate?.numeratorText ?? null,
    minimumRateDenominatorText: rate?.denominatorText ?? null,
  };
}

/**
 * Interdit la sauvegarde silencieuse d'un résultat contrat ≥ 3 dans un snapshot
 * schema < 3 (incomplet), et contrat ≥ 5 dans un schema < 4 (sans 9-Box v4).
 * N'affecte ni le calcul ni l'affichage.
 */
export function assertSimulationResultPersistable(input: {
  calculationContractVersion: number;
  resultSchemaVersion?: number;
}): void {
  const schemaVersion = input.resultSchemaVersion ?? RESULT_SCHEMA_VERSION;
  if (input.calculationContractVersion >= 9 && schemaVersion < 7) {
    throw new CompensationCalculationError(
      "SIMULATION_SNAPSHOT_SCHEMA_REQUIRES_CONSOLIDATION",
      "Cette simulation utilise le mécanisme social exclusif / forfait universel et ne peut pas être enregistrée dans l’ancien format d’historique (schema < 7). Finalisez la consolidation en schema v7 avant l’enregistrement.",
    );
  }
  if (input.calculationContractVersion >= 8 && schemaVersion < 6) {
    throw new CompensationCalculationError(
      "SIMULATION_SNAPSHOT_SCHEMA_REQUIRES_CONSOLIDATION",
      "Cette simulation utilise le mois d’effet explicite du minimum garanti et ne peut pas être enregistrée dans l’ancien format d’historique (schema < 6). Finalisez la consolidation en schema v6 avant l’enregistrement.",
    );
  }
  if (input.calculationContractVersion >= 6 && schemaVersion < 5) {
    throw new CompensationCalculationError(
      "SIMULATION_SNAPSHOT_SCHEMA_REQUIRES_CONSOLIDATION",
      "Cette simulation utilise le coefficient provisoire 9-Box « Performance à confirmer » et ne peut pas être enregistrée dans l’ancien format d’historique (schema < 5). Finalisez la consolidation en schema v5 avant l’enregistrement.",
    );
  }
  if (input.calculationContractVersion >= 5 && schemaVersion < 4) {
    throw new CompensationCalculationError(
      "SIMULATION_SNAPSHOT_SCHEMA_REQUIRES_CONSOLIDATION",
      "Cette simulation utilise le contrat de neutralisation 9-Box et ne peut pas être enregistrée dans l’ancien format d’historique (schema < 4). Finalisez la consolidation en schema v4 avant l’enregistrement.",
    );
  }
  if (input.calculationContractVersion >= 3 && schemaVersion < 3) {
    throw new CompensationCalculationError(
      "SIMULATION_SNAPSHOT_SCHEMA_REQUIRES_CONSOLIDATION",
      "Cette simulation utilise le contrat de période configurable et ne peut pas être enregistrée dans l’ancien format d’historique (schema < 3). Finalisez la consolidation en schema v3 avant l’enregistrement.",
    );
  }
}

function bi(value: bigint): string {
  return bigintToCanonicalText(value);
}

function nullableBi(value: bigint | null | undefined): string | null {
  return value === null || value === undefined ? null : bigintToCanonicalText(value);
}

/**
 * Vérifie l’entier 1–12 du mois d’effet du minimum garanti avant écriture
 * (schema v6, contrat v8). Aucune valeur par défaut inventée.
 */
function assertMinimumGuaranteeEffectiveMonth(
  month: number | null | undefined,
  fallbackTechnicalMonth: number,
): number {
  const resolved =
    month === null || month === undefined ? fallbackTechnicalMonth : month;
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > 12) {
    throw new Error(
      "Le mois d’effet du minimum garanti doit être un entier compris entre 1 et 12 avant enregistrement.",
    );
  }
  return resolved;
}

function promotionPaymentTiming(
  month: MonthlyCompensationTrajectoryView,
): SaveSimulationEmployeeMonthDto["promotionPaymentTiming"] {
  // Code stable dérivé du domaine, sans recalcul métier.
  return month.promotionActive ? month.paymentTiming : "not_applicable";
}

function mapMonth(
  month: MonthlyCompensationTrajectoryView,
): SaveSimulationEmployeeMonthDto {
  const targetRate = exactAmountToCanonicalTexts(month.targetCompensatoryRate);
  const promoOffset = exactAmountToCanonicalTexts(month.promotionRateOffset);
  const complementRate = exactAmountToCanonicalTexts(
    month.compensatoryComplementRate,
  );
  const theoreticalComplement = exactAmountToCanonicalTexts(
    month.theoreticalCompensatoryComplement,
  );
  const guaranteed = exactAmountToCanonicalTexts(month.guaranteedTotalIncreaseExact);
  const requiredMinimum = exactAmountToCanonicalTexts(
    month.requiredMinimumComplementExact,
  );
  const weighted = exactAmountToCanonicalTexts(month.weightedComplementExact);
  const theoretical = exactAmountToCanonicalTexts(month.theoreticalComplementExact);

  return {
    month: month.month,
    baseSalaryFcfaText: bi(month.baseSalaryFcfa),
    gradeCode: month.gradeCode,
    jobFamilyCode: month.jobFamilyCode,
    salaryPositionLabel: month.salaryPositionLabel,
    targetCompensatoryRateNumeratorText: targetRate.numeratorText,
    targetCompensatoryRateDenominatorText: targetRate.denominatorText,
    promotionRateOffsetNumeratorText: promoOffset.numeratorText,
    promotionRateOffsetDenominatorText: promoOffset.denominatorText,
    compensatoryComplementRateNumeratorText: complementRate.numeratorText,
    compensatoryComplementRateDenominatorText: complementRate.denominatorText,
    theoreticalCompensatoryComplementNumeratorText:
      theoreticalComplement.numeratorText,
    theoreticalCompensatoryComplementDenominatorText:
      theoreticalComplement.denominatorText,
    roundedCompensatoryComplementFcfaText: bi(
      month.roundedCompensatoryComplementFcfa,
    ),
    promotionBudgetCostFcfaText: bi(month.promotionBudgetCostFcfa),
    finalSalaryFcfaText: bi(month.finalSalaryFcfa),
    seniorityRatePercent: Math.round(month.seniorityRatePercent),
    promotionSeniorityImpactFcfaText: bi(month.promotionSeniorityImpactFcfa),
    compensatorySeniorityImpactFcfaText: bi(month.compensatorySeniorityImpactFcfa),
    totalSeniorityImpactFcfaText: bi(month.totalSeniorityImpactFcfa),
    paymentTiming: month.paymentTiming,
    promotionPaymentTiming: promotionPaymentTiming(month),
    coveredByCampaignPeriod: month.coveredByCampaignPeriod,
    includedInCampaignEnvelope: month.includedInCampaignEnvelope,
    promotionActive: month.promotionActive,
    promotionStatus: month.promotionStatus,
    isMinimumIncreasePopulationEmployee: month.isMinimumIncreasePopulationEmployee,
    guaranteedTotalIncreaseNumeratorText: guaranteed.numeratorText,
    guaranteedTotalIncreaseDenominatorText: guaranteed.denominatorText,
    applicablePromotionIncrementFcfaText: bi(month.applicablePromotionIncrementFcfa),
    requiredMinimumComplementNumeratorText: requiredMinimum.numeratorText,
    requiredMinimumComplementDenominatorText: requiredMinimum.denominatorText,
    minimumComplementFloorFcfaText: bi(month.minimumComplementFloorFcfa),
    weightedComplementNumeratorText: weighted.numeratorText,
    weightedComplementDenominatorText: weighted.denominatorText,
    theoreticalComplementNumeratorText: theoretical.numeratorText,
    theoreticalComplementDenominatorText: theoretical.denominatorText,
    actualComplementAboveMinimumFcfaText: bi(month.actualComplementAboveMinimumFcfa),
    universalFixedAmountFcfaText: bi(month.universalFixedAmountFcfa),
  };
}

function mapEmployee(
  employee: CampaignSimulationExecutionResult["employees"][number],
): SaveSimulationEmployeeDto {
  const evaluationFactor = exactAmountToCanonicalTexts(employee.evaluationFactor);
  const theoreticalWeight = exactAmountToCanonicalTexts(
    employee.theoreticalMatrixWeight,
  );
  const effectiveWeight = exactAmountToCanonicalTexts(
    employee.effectiveMatrixWeight,
  );
  const allocationWeight = exactAmountToCanonicalTexts(employee.allocationWeight);
  const theoRate = exactAmountToCanonicalTexts(
    employee.monthlyTheoreticalIncreaseRate,
  );
  const theoAmount = exactAmountToCanonicalTexts(
    employee.monthlyTheoreticalIncrease,
  );
  const roundingDelta = exactAmountToCanonicalTexts(
    employee.monthlyRoundingDelta,
  );
  const annualTheoretical = exactAmountToCanonicalTexts(
    employee.annualTheoreticalAllocation,
  );
  const annualRoundingDelta = exactAmountToCanonicalTexts(
    employee.annualRoundingDelta,
  );
  const promotionRate =
    employee.promotionRate === null
      ? { numeratorText: null, denominatorText: null }
      : (() => {
          const parts = exactAmountToCanonicalTexts(employee.promotionRate!);
          return {
            numeratorText: parts.numeratorText,
            denominatorText: parts.denominatorText,
          };
        })();

  return {
    employeeId: employee.employeeId,
    employeeDisplayName: employee.employeeDisplayName,
    familyCode: employee.familyCode,
    familyLabel: employee.familyLabel,
    gradeCode: employee.gradeCode,
    gradeLabel: employee.gradeLabel,
    salaryFcfaText: bi(employee.salaryFcfa),
    s0FcfaText: bi(employee.s0Fcfa),
    salaryRatioBasisPoints: employee.salaryRatioBasisPoints,
    salaryPositionCode: employee.salaryPositionCode,
    salaryPositionLabel: employee.salaryPositionLabel,
    positionFactorMilli: employee.positionFactorMilli,
    evaluationMode: employee.evaluationMode,
    performanceLevel: employee.performanceLevel,
    potentialLevel: employee.potentialLevel,
    evaluationFactorNumeratorText: evaluationFactor.numeratorText,
    evaluationFactorDenominatorText: evaluationFactor.denominatorText,
    theoreticalMatrixWeightNumeratorText: theoreticalWeight.numeratorText,
    theoreticalMatrixWeightDenominatorText: theoreticalWeight.denominatorText,
    effectiveMatrixWeightNumeratorText: effectiveWeight.numeratorText,
    effectiveMatrixWeightDenominatorText: effectiveWeight.denominatorText,
    allocationWeightNumeratorText: allocationWeight.numeratorText,
    allocationWeightDenominatorText: allocationWeight.denominatorText,
    blockingReason: employee.blockingReason,
    theoreticalIncreaseRateNumeratorText: theoRate.numeratorText,
    theoreticalIncreaseRateDenominatorText: theoRate.denominatorText,
    theoreticalIncreaseAmountNumeratorText: theoAmount.numeratorText,
    theoreticalIncreaseAmountDenominatorText: theoAmount.denominatorText,
    finalRoundedIncreaseFcfaText: bi(employee.monthlyFinalRoundedIncreaseFcfa),
    individualRoundingDeltaNumeratorText: roundingDelta.numeratorText,
    individualRoundingDeltaDenominatorText: roundingDelta.denominatorText,
    finalSalaryFcfaText: bi(employee.monthlyFinalSalaryFcfa),
    explanationStepsJson: JSON.stringify(employee.explanationSteps),

    // ---- Champs schema v3 ----
    annualTheoreticalAllocationNumeratorText: annualTheoretical.numeratorText,
    annualTheoreticalAllocationDenominatorText: annualTheoretical.denominatorText,
    annualActualCostFcfaText: bi(employee.annualActualCostFcfa),
    annualRoundingDeltaNumeratorText: annualRoundingDelta.numeratorText,
    annualRoundingDeltaDenominatorText: annualRoundingDelta.denominatorText,
    campaignYear: employee.campaignYear,
    retroactivityStartMonth: employee.retroactivityStartMonth,
    technicalApplicationMonth: employee.technicalApplicationMonth,
    minimumGuaranteeEffectiveMonth: assertMinimumGuaranteeEffectiveMonth(
      employee.minimumGuaranteeEffectiveMonth,
      employee.technicalApplicationMonth,
    ),
    campaignCoveredMonthCount: employee.campaignCoveredMonthCount,
    retroactiveMonths: employee.retroactiveMonths,
    remainingDirectPaymentMonths: employee.remainingDirectPaymentMonths,
    baseSalaryReminderFcfaText: bi(employee.baseSalaryReminderFcfa),
    remainingYearDirectIncreaseCostFcfaText: bi(
      employee.remainingYearDirectIncreaseCostFcfa,
    ),
    annualActualBaseIncreaseCostFcfaText: bi(
      employee.annualActualBaseIncreaseCostFcfa,
    ),
    hireDate: employee.hireDate,
    technicalApplicationMonthSeniorityRatePercent: Math.round(
      employee.technicalApplicationMonthSeniorityRatePercent,
    ),
    seniorityReminderFcfaText: bi(employee.seniorityReminderFcfa),
    remainingYearDirectSeniorityImpactFcfaText: bi(
      employee.remainingYearDirectSeniorityImpactFcfa,
    ),
    annualSeniorityImpactFcfaText: bi(employee.annualSeniorityImpactFcfa),
    fullYearRunRatePromotionCostFcfaText: bi(
      employee.fullYearRunRatePromotionCostFcfa,
    ),
    fullYearRunRateCompensatoryCostFcfaText: bi(
      employee.fullYearRunRateCompensatoryCostFcfa,
    ),
    fullYearRunRateCombinedBaseMeasureCostFcfaText: bi(
      employee.fullYearRunRateCombinedBaseMeasureCostFcfa,
    ),
    fullYearRunRateSeniorityImpactFcfaText: bi(
      employee.fullYearRunRateSeniorityImpactFcfa,
    ),
    compensatoryMeasureEligible: employee.compensatoryMeasureEligible,
    isPromotionBudgetPopulationEmployee:
      employee.isPromotionBudgetPopulationEmployee,
    employmentStatus: employee.employmentStatus,
    contractType: employee.contractType,
    promotionStatusKind: employee.promotionStatusKind,
    compensatoryEligibilityKind: employee.compensatoryEligibilityKind,
    compensatoryIneligibilityReasonCode:
      employee.compensatoryIneligibilityReasonCode,
    hasStructuredPromotion: employee.hasStructuredPromotion,
    promotionDate: employee.promotionDate,
    promotionYear: employee.promotionYear,
    promotionMonth: employee.promotionMonth,
    previousGradeCode: employee.previousGradeCode,
    promotedGradeCode: employee.promotedGradeCode,
    previousJobFamilyCode: employee.previousJobFamilyCode,
    promotedJobFamilyCode: employee.promotedJobFamilyCode,
    salaryBeforePromotionFcfaText: nullableBi(employee.salaryBeforePromotionFcfa),
    salaryAfterPromotionFcfaText: nullableBi(employee.salaryAfterPromotionFcfa),
    promotionAmountFcfaText: nullableBi(employee.promotionAmountFcfa),
    promotionRateNumeratorText: promotionRate.numeratorText,
    promotionRateDenominatorText: promotionRate.denominatorText,
    promotionCampaignCostInformativeFcfaText: bi(
      employee.promotionCampaignCostInformativeFcfa,
    ),
    annualPromotionBudgetCostFcfaText: bi(employee.annualPromotionBudgetCostFcfa),
    promotionCostAlreadyPaidBeforeTechnicalMonthFcfaText: bi(
      employee.promotionCostAlreadyPaidBeforeTechnicalMonthFcfa,
    ),
    promotionCostFromTechnicalMonthToDecemberFcfaText: bi(
      employee.promotionCostFromTechnicalMonthToDecemberFcfa,
    ),
    annualPromotionSeniorityImpactFcfaText: bi(
      employee.annualPromotionSeniorityImpactFcfa,
    ),
    combinedAnnualSeniorityImpactFcfaText: bi(
      employee.combinedAnnualSeniorityImpactFcfa,
    ),
    combinedAnnualActualCostFcfaText: bi(employee.combinedAnnualActualCostFcfa),
    technicalMonthCompensatoryComplementFcfaText: bi(
      employee.technicalMonthCompensatoryComplementFcfa,
    ),
    technicalMonthFinalSalaryFcfaText: bi(employee.technicalMonthFinalSalaryFcfa),
    isMinimumIncreasePopulationEmployee:
      employee.isMinimumIncreasePopulationEmployee,
    minimumIncreaseExclusionReason: employee.minimumIncreaseExclusionReason,
    campaignPeriodMinimumComplementFloorCostFcfaText: bi(
      employee.campaignPeriodMinimumComplementFloorCostFcfa,
    ),
    campaignPeriodCompensationAboveMinimumCostFcfaText: bi(
      employee.campaignPeriodCompensationAboveMinimumCostFcfa,
    ),
    minimumCompensatoryReminderFcfaText: bi(
      employee.minimumCompensatoryReminderFcfa,
    ),
    aboveMinimumCompensatoryReminderFcfaText: bi(
      employee.aboveMinimumCompensatoryReminderFcfa,
    ),
    minimumRemainingYearDirectCostFcfaText: bi(
      employee.minimumRemainingYearDirectCostFcfa,
    ),
    aboveMinimumRemainingYearDirectCostFcfaText: bi(
      employee.aboveMinimumRemainingYearDirectCostFcfa,
    ),
    fullYearRunRateMinimumComplementCostFcfaText: bi(
      employee.fullYearRunRateMinimumComplementCostFcfa,
    ),
    fullYearRunRateCompensationAboveMinimumCostFcfaText: bi(
      employee.fullYearRunRateCompensationAboveMinimumCostFcfa,
    ),
    isUniversalFixedAmountEligible: employee.isUniversalFixedAmountEligible,
    universalFixedAmountExclusionReason: employee.universalFixedAmountExclusionReason,
    universalFixedAmountMonthlyAmountText: bi(
      employee.universalFixedAmountMonthlyAmountFcfa,
    ),
    universalFixedAmountEffectiveMonth: employee.universalFixedAmountEffectiveMonth,
    universalFixedAmountMinimumSeniorityMonths:
      employee.universalFixedAmountMinimumSeniorityMonths,
    universalFixedAmountSeniorityReferenceDate:
      employee.universalFixedAmountSeniorityReferenceDate,
    campaignPeriodUniversalFixedAmountCostText: bi(
      employee.campaignPeriodUniversalFixedAmountCostFcfa,
    ),
    universalFixedAmountReminderText: bi(employee.universalFixedAmountReminderFcfa),
    universalFixedAmountRemainingYearDirectCostText: bi(
      employee.universalFixedAmountRemainingYearDirectCostFcfa,
    ),
    fullYearRunRateUniversalFixedAmountCostText: bi(
      employee.fullYearRunRateUniversalFixedAmountCostFcfa,
    ),
    // ---- Champs schema v4 (Lot 2B-RC1-H1) ----
    neutralizeNineBoxEffect: employee.neutralizeNineBoxEffect,
    sourceNineBoxCode: employee.sourceNineBoxCode,
    nineBoxTreatmentKind: employee.nineBoxTreatmentKind,
    months: employee.monthlyCompensationTrajectory.map(mapMonth),
  };
}

export function mapExecutionResultToSaveDto(input: {
  result: CampaignSimulationExecutionResult;
  expectedCampaignStatus: "draft" | "active";
  sourceImportFileName: string | null;
  /** Politique minimum validée — requise pour snapshot autosuffisant (mode ≠ none). */
  minimumIncreasePolicy?: MinimumIncreasePolicy;
}): SaveSimulationRunDto {
  const { result } = input;

  assertSimulationResultPersistable({
    calculationContractVersion:
      result.calculationContractVersion ?? CALCULATION_CONTRACT_VERSION,
    resultSchemaVersion: RESULT_SCHEMA_VERSION,
  });

  const budget = result.budgetSummary;
  const population = result.populationSummary;
  const envelope = budget.envelopeSummary;
  const paymentCalendar = budget.paymentCalendar;
  const minimumPolicyTexts = mapMinimumPolicyTexts(input.minimumIncreasePolicy);
  const budgetTarget = exactAmountToCanonicalTexts(budget.exactBudgetTarget);
  const theoretical = exactAmountToCanonicalTexts(
    budget.annualTheoreticalAllocatedTotal,
  );
  const roundingDelta = exactAmountToCanonicalTexts(
    budget.annualTotalRoundingDelta,
  );

  if (
    result.campaignStatus === "unknown" ||
    result.campaignStatus === "archived"
  ) {
    throw new Error("Le statut de campagne du résultat n’est pas enregistrable.");
  }

  const availableAfterPromotions = exactAmountToCanonicalTexts(
    envelope.availableAnnualCompensatoryBudgetFcfa,
  );
  const availableAfterPromotionsAndMinimum = exactAmountToCanonicalTexts(
    envelope.availableBudgetAfterPromotionsAndMinimumFcfa,
  );
  const availableAfterPromotionsAndSocialMechanism = exactAmountToCanonicalTexts(
    population.availableBudgetAfterPromotionsAndSocialMechanismFcfa,
  );
  const theoreticalCompensatory = exactAmountToCanonicalTexts(
    envelope.totalAnnualTheoreticalCompensatoryCostFcfa,
  );
  const calibrationRate = exactAmountToCanonicalTexts(
    envelope.compensatoryCalibrationRate,
  );

  // Dérivations calendaires (pas de recalcul métier de montants).
  const retro = population.retroactivityStartMonth;
  const technical = population.technicalApplicationMonth;
  const reminderMonthCount = Math.max(0, technical - retro);
  const directPaymentMonthCount = Math.max(0, 12 - technical + 1);

  return {
    campaignId: result.campaignId,
    expectedCampaignStatus: input.expectedCampaignStatus,
    expectedCurrentImportBatchId: result.currentImportBatchId,
    campaignName: result.campaignName ?? `Campagne #${result.campaignId}`,
    campaignYear: result.campaignYear ?? 0,
    campaignStatusAtRun: result.campaignStatus,
    evaluationMode: result.evaluationMode,
    sourceImportBatchId: result.currentImportBatchId,
    sourceImportFileName: input.sourceImportFileName,
    sourceFingerprint: result.sourceFingerprint,
    configurationFingerprint: result.configurationFingerprint,
    budgetTargetMode: budget.budgetTargetMode,
    manualBudgetFcfaText:
      budget.manualBudgetFcfa !== undefined
        ? bi(budget.manualBudgetFcfa)
        : null,
    eligiblePayrollFcfaText:
      budget.eligiblePayrollFcfa !== undefined
        ? bi(budget.eligiblePayrollFcfa)
        : null,
    budgetRateBasisPoints:
      budget.budgetRateBasisPoints !== undefined
        ? Number(budget.budgetRateBasisPoints)
        : null,
    budgetTargetNumeratorText: budgetTarget.numeratorText,
    budgetTargetDenominatorText: budgetTarget.denominatorText,
    roundingMode: budget.roundingMode,
    roundingStepFcfaText: bi(budget.roundingStepFcfa),
    employeeCount: population.employeeCount,
    positiveWeightEmployeeCount: population.positiveWeightEmployeeCount,
    zeroWeightEmployeeCount: population.zeroWeightEmployeeCount,
    confirmedUnderperformerCount: population.confirmedUnderperformerCount,
    theoreticalTotalNumeratorText: theoretical.numeratorText,
    theoreticalTotalDenominatorText: theoretical.denominatorText,
    actualOperationAmountFcfaText: bi(budget.annualActualOperationCostFcfa),
    totalRoundingDeltaNumeratorText: roundingDelta.numeratorText,
    totalRoundingDeltaDenominatorText: roundingDelta.denominatorText,

    // ---- Schema v3 ----
    resultSchemaVersion: RESULT_SCHEMA_VERSION,
    retroactivityStartMonth: retro,
    technicalApplicationMonth: technical,
    minimumGuaranteeEffectiveMonth: assertMinimumGuaranteeEffectiveMonth(
      population.minimumGuaranteeEffectiveMonth,
      technical,
    ),
    campaignCoveredMonthCount: population.campaignCoveredMonthCount,
    reminderMonthCount,
    directPaymentMonthCount,
    calculationContractVersion:
      result.calculationContractVersion ?? CALCULATION_CONTRACT_VERSION,
    seniorityImpactContractVersion: SENIORITY_IMPACT_CONTRACT_VERSION,
    minimumIncreaseContractVersion: MINIMUM_INCREASE_CONTRACT_VERSION,
    minimumIncreaseMode: population.minimumIncreaseMode,
    minimumMonthlyAmountText: minimumPolicyTexts.minimumMonthlyAmountText,
    minimumRateNumeratorText: minimumPolicyTexts.minimumRateNumeratorText,
    minimumRateDenominatorText: minimumPolicyTexts.minimumRateDenominatorText,
    promotionCampaignPeriodBudgetCostText: bi(
      envelope.totalAnnualPromotionBudgetCostFcfa,
    ),
    totalMinimumComplementFloorCostText: bi(
      envelope.totalMinimumComplementFloorCostFcfa,
    ),
    availableBudgetAfterPromotionsNumeratorText:
      availableAfterPromotions.numeratorText,
    availableBudgetAfterPromotionsDenominatorText:
      availableAfterPromotions.denominatorText,
    availableBudgetAfterPromotionsAndMinimumNumeratorText:
      availableAfterPromotionsAndMinimum.numeratorText,
    availableBudgetAfterPromotionsAndMinimumDenominatorText:
      availableAfterPromotionsAndMinimum.denominatorText,
    theoreticalCompensatoryCampaignPeriodCostNumeratorText:
      theoreticalCompensatory.numeratorText,
    theoreticalCompensatoryCampaignPeriodCostDenominatorText:
      theoreticalCompensatory.denominatorText,
    actualCompensatoryCampaignPeriodCostText: bi(
      envelope.totalAnnualActualCompensatoryCostFcfa,
    ),
    actualMinimumComplementPaidCostText: bi(
      envelope.actualMinimumComplementPaidCostFcfa,
    ),
    actualCompensationAboveMinimumCostText: bi(
      envelope.actualCompensationAboveMinimumCostFcfa,
    ),
    actualCombinedCampaignPeriodCostText: bi(
      envelope.totalAnnualActualCombinedBaseMeasureCostFcfa,
    ),
    compensatoryCalibrationRateNumeratorText: calibrationRate.numeratorText,
    compensatoryCalibrationRateDenominatorText: calibrationRate.denominatorText,
    minimumIncreasePopulationEmployeeCount:
      population.minimumIncreasePopulationEmployeeCount,
    promotedIncludedEmployeeCount: population.promotedIncludedEmployeeCount,
    totalBaseSalaryReminderText: bi(population.totalBaseSalaryReminderFcfa),
    totalRemainingYearDirectIncreaseCostText: bi(
      population.totalRemainingYearDirectIncreaseCostFcfa,
    ),
    totalAnnualActualBaseIncreaseCostText: bi(
      population.totalAnnualActualBaseIncreaseCostFcfa,
    ),
    totalSeniorityReminderText: bi(population.totalSeniorityReminderFcfa),
    totalRemainingYearDirectSeniorityImpactText: bi(
      population.totalRemainingYearDirectSeniorityImpactFcfa,
    ),
    totalAnnualSeniorityImpactText: bi(population.totalAnnualSeniorityImpactFcfa),
    totalAnnualPromotionSeniorityImpactText: bi(
      population.totalAnnualPromotionSeniorityImpactFcfa,
    ),
    totalAnnualPromotionBudgetCostText: bi(
      population.totalAnnualPromotionBudgetCostFcfa,
    ),
    totalCombinedAnnualActualCostText: bi(
      population.totalCombinedAnnualActualCostFcfa,
    ),
    totalCombinedAnnualSeniorityImpactText: bi(
      population.totalCombinedAnnualSeniorityImpactFcfa,
    ),
    fullYearRunRatePromotionCostText: bi(
      population.fullYearRunRatePromotionCostFcfa,
    ),
    fullYearRunRateCompensatoryCostText: bi(
      population.fullYearRunRateCompensatoryCostFcfa,
    ),
    fullYearRunRateCombinedBaseMeasureCostText: bi(
      population.fullYearRunRateCombinedBaseMeasureCostFcfa,
    ),
    fullYearRunRateSeniorityImpactText: bi(
      population.fullYearRunRateSeniorityImpactFcfa,
    ),
    fullYearRunRateMinimumComplementCostText: bi(
      result.employees.reduce(
        (sum, employee) => sum + employee.fullYearRunRateMinimumComplementCostFcfa,
        0n,
      ),
    ),
    fullYearRunRateCompensationAboveMinimumCostText: bi(
      result.employees.reduce(
        (sum, employee) =>
          sum + employee.fullYearRunRateCompensationAboveMinimumCostFcfa,
        0n,
      ),
    ),
    promotionCostPaidBeforeTechnicalMonthText: bi(
      paymentCalendar.totalPromotionCostAlreadyPaidBeforeTechnicalMonthFcfa,
    ),
    promotionCostFromTechnicalMonthToDecemberText: bi(
      paymentCalendar.totalPromotionCostFromTechnicalMonthToDecemberFcfa,
    ),
    minimumCompensatoryReminderText: bi(
      result.employees.reduce(
        (sum, employee) => sum + employee.minimumCompensatoryReminderFcfa,
        0n,
      ),
    ),
    aboveMinimumCompensatoryReminderText: bi(
      result.employees.reduce(
        (sum, employee) => sum + employee.aboveMinimumCompensatoryReminderFcfa,
        0n,
      ),
    ),
    totalCompensatoryReminderText: bi(
      paymentCalendar.totalCompensatoryReminderFcfa,
    ),
    minimumRemainingYearDirectCostText: bi(
      result.employees.reduce(
        (sum, employee) => sum + employee.minimumRemainingYearDirectCostFcfa,
        0n,
      ),
    ),
    aboveMinimumRemainingYearDirectCostText: bi(
      result.employees.reduce(
        (sum, employee) => sum + employee.aboveMinimumRemainingYearDirectCostFcfa,
        0n,
      ),
    ),
    totalRemainingYearDirectCompensatoryCostText: bi(
      paymentCalendar.totalRemainingYearDirectCompensatoryCostFcfa,
    ),
    neutralizeNineBoxEffectEmployeeCount:
      population.neutralizeNineBoxEffectEmployeeCount,
    nineBoxConfirmationFactorMilli: population.nineBoxConfirmationFactorMilli,
    socialMechanismKind: population.socialMechanismKind,
    universalFixedAmountMonthlyFcfa:
      population.socialMechanismKind === "universal_fixed_amount"
        ? Number(population.universalFixedAmountMonthlyAmountFcfa)
        : null,
    universalFixedAmountEffectiveMonth:
      population.socialMechanismKind === "universal_fixed_amount"
        ? population.universalFixedAmountEffectiveMonth
        : null,
    universalFixedAmountMinimumSeniorityMonths:
      population.socialMechanismKind === "universal_fixed_amount"
        ? population.universalFixedAmountMinimumSeniorityMonths
        : null,
    universalFixedAmountSeniorityReferenceDate:
      population.socialMechanismKind === "universal_fixed_amount"
        ? population.universalFixedAmountSeniorityReferenceDate
        : null,
    universalFixedAmountEligibleEmployeeCount:
      population.universalFixedAmountEligibleEmployeeCount,
    universalFixedAmountExposureCount: population.universalFixedAmountExposureCount,
    totalUniversalFixedAmountCostText: bi(population.totalUniversalFixedAmountCostFcfa),
    availableBudgetAfterPromotionsAndSocialMechanismNumeratorText:
      availableAfterPromotionsAndSocialMechanism.numeratorText,
    availableBudgetAfterPromotionsAndSocialMechanismDenominatorText:
      availableAfterPromotionsAndSocialMechanism.denominatorText,
    totalUniversalFixedAmountReminderText: bi(
      population.totalUniversalFixedAmountReminderFcfa,
    ),
    totalUniversalFixedAmountRemainingYearDirectCostText: bi(
      population.totalUniversalFixedAmountRemainingYearDirectCostFcfa,
    ),
    fullYearRunRateUniversalFixedAmountCostText: bi(
      population.fullYearRunRateUniversalFixedAmountCostFcfa,
    ),
    employees: result.employees.map(mapEmployee),
  };
}

export { RESULT_SCHEMA_VERSION, RESULT_SCHEMA_VERSION_V2 };
