/**
 * Modèles persistés et DTO de sauvegarde (Lot 2B-4A).
 * BigInt / fractions transmis uniquement en chaînes décimales.
 */

import type { ExactAmount } from "../../domain/compensationCalculation";
import type { CampaignStatus } from "../../domain/campaign/models";
import type { NineBoxMode } from "../../domain/compensationReference/models";
import type { SimulationPersistenceCode } from "./simulationPersistenceCodes";

/**
 * Trajectoire mensuelle persistée (schema v3, Lot 2B-P1).
 * Un DTO par mois (1 = janvier … 12 = décembre). Codes calendrier stables,
 * dérivés du domaine sans recalcul métier.
 */
export interface SaveSimulationEmployeeMonthDto {
  month: number;
  baseSalaryFcfaText: string;
  gradeCode: string;
  jobFamilyCode: string;
  salaryPositionLabel: string | null;
  targetCompensatoryRateNumeratorText: string;
  targetCompensatoryRateDenominatorText: string;
  promotionRateOffsetNumeratorText: string;
  promotionRateOffsetDenominatorText: string;
  compensatoryComplementRateNumeratorText: string;
  compensatoryComplementRateDenominatorText: string;
  theoreticalCompensatoryComplementNumeratorText: string;
  theoreticalCompensatoryComplementDenominatorText: string;
  roundedCompensatoryComplementFcfaText: string;
  promotionBudgetCostFcfaText: string;
  finalSalaryFcfaText: string;
  seniorityRatePercent: number;
  promotionSeniorityImpactFcfaText: string;
  compensatorySeniorityImpactFcfaText: string;
  totalSeniorityImpactFcfaText: string;
  paymentTiming: "outside_campaign" | "reminder" | "direct";
  promotionPaymentTiming:
    | "outside_campaign"
    | "reminder"
    | "direct"
    | "not_applicable";
  coveredByCampaignPeriod: boolean;
  includedInCampaignEnvelope: boolean;
  promotionActive: boolean;
  promotionStatus: string;
  isMinimumIncreasePopulationEmployee: boolean;
  guaranteedTotalIncreaseNumeratorText: string;
  guaranteedTotalIncreaseDenominatorText: string;
  applicablePromotionIncrementFcfaText: string;
  requiredMinimumComplementNumeratorText: string;
  requiredMinimumComplementDenominatorText: string;
  minimumComplementFloorFcfaText: string;
  weightedComplementNumeratorText: string;
  weightedComplementDenominatorText: string;
  theoreticalComplementNumeratorText: string;
  theoreticalComplementDenominatorText: string;
  actualComplementAboveMinimumFcfaText: string;
  /** Forfait social universel du mois (schema v7, Lot 2B-RC1-H5). */
  universalFixedAmountFcfaText?: string;
}

export interface SaveSimulationEmployeeDto {
  employeeId: string;
  employeeDisplayName: string | null;
  familyCode: string;
  familyLabel: string | null;
  gradeCode: string;
  gradeLabel: string | null;
  salaryFcfaText: string;
  s0FcfaText: string;
  salaryRatioBasisPoints: number;
  salaryPositionCode: string;
  salaryPositionLabel: string;
  positionFactorMilli: number;
  evaluationMode: string;
  performanceLevel: string | null;
  potentialLevel: string | null;
  evaluationFactorNumeratorText: string;
  evaluationFactorDenominatorText: string;
  theoreticalMatrixWeightNumeratorText: string;
  theoreticalMatrixWeightDenominatorText: string;
  effectiveMatrixWeightNumeratorText: string;
  effectiveMatrixWeightDenominatorText: string;
  allocationWeightNumeratorText: string;
  allocationWeightDenominatorText: string;
  blockingReason: string | null;
  theoreticalIncreaseRateNumeratorText: string;
  theoreticalIncreaseRateDenominatorText: string;
  theoreticalIncreaseAmountNumeratorText: string;
  theoreticalIncreaseAmountDenominatorText: string;
  finalRoundedIncreaseFcfaText: string;
  individualRoundingDeltaNumeratorText: string;
  individualRoundingDeltaDenominatorText: string;
  finalSalaryFcfaText: string;
  explanationStepsJson: string;

  /**
   * Champs schema v3 (Lot 2B-P1). Optionnels : absents pour les DTO v2
   * historiques (mappés en NULL côté persistance, aucun faux zéro).
   */
  annualTheoreticalAllocationNumeratorText?: string;
  annualTheoreticalAllocationDenominatorText?: string;
  annualActualCostFcfaText?: string;
  annualRoundingDeltaNumeratorText?: string;
  annualRoundingDeltaDenominatorText?: string;
  campaignYear?: number | null;
  retroactivityStartMonth?: number | null;
  technicalApplicationMonth?: number | null;
  /** Mois d’effet du minimum garanti (1–12) — schema v6 (Lot 2B-RC1-H4). */
  minimumGuaranteeEffectiveMonth?: number | null;
  campaignCoveredMonthCount?: number | null;
  retroactiveMonths?: number | null;
  remainingDirectPaymentMonths?: number | null;
  baseSalaryReminderFcfaText?: string;
  remainingYearDirectIncreaseCostFcfaText?: string;
  annualActualBaseIncreaseCostFcfaText?: string;
  hireDate?: string | null;
  technicalApplicationMonthSeniorityRatePercent?: number | null;
  seniorityReminderFcfaText?: string;
  remainingYearDirectSeniorityImpactFcfaText?: string;
  annualSeniorityImpactFcfaText?: string;
  fullYearRunRatePromotionCostFcfaText?: string;
  fullYearRunRateCompensatoryCostFcfaText?: string;
  fullYearRunRateCombinedBaseMeasureCostFcfaText?: string;
  fullYearRunRateSeniorityImpactFcfaText?: string;
  compensatoryMeasureEligible?: boolean | null;
  isPromotionBudgetPopulationEmployee?: boolean | null;
  employmentStatus?: string | null;
  contractType?: string | null;
  promotionStatusKind?: string | null;
  compensatoryEligibilityKind?: string | null;
  compensatoryIneligibilityReasonCode?: string | null;
  hasStructuredPromotion?: boolean | null;
  promotionDate?: string | null;
  promotionYear?: number | null;
  promotionMonth?: number | null;
  previousGradeCode?: string | null;
  promotedGradeCode?: string | null;
  previousJobFamilyCode?: string | null;
  promotedJobFamilyCode?: string | null;
  salaryBeforePromotionFcfaText?: string | null;
  salaryAfterPromotionFcfaText?: string | null;
  promotionAmountFcfaText?: string | null;
  promotionRateNumeratorText?: string | null;
  promotionRateDenominatorText?: string | null;
  promotionCampaignCostInformativeFcfaText?: string;
  annualPromotionBudgetCostFcfaText?: string;
  promotionCostAlreadyPaidBeforeTechnicalMonthFcfaText?: string;
  promotionCostFromTechnicalMonthToDecemberFcfaText?: string;
  annualPromotionSeniorityImpactFcfaText?: string;
  combinedAnnualSeniorityImpactFcfaText?: string;
  combinedAnnualActualCostFcfaText?: string;
  technicalMonthCompensatoryComplementFcfaText?: string;
  technicalMonthFinalSalaryFcfaText?: string;
  isMinimumIncreasePopulationEmployee?: boolean | null;
  minimumIncreaseExclusionReason?: string | null;
  campaignPeriodMinimumComplementFloorCostFcfaText?: string;
  campaignPeriodCompensationAboveMinimumCostFcfaText?: string;
  minimumCompensatoryReminderFcfaText?: string;
  aboveMinimumCompensatoryReminderFcfaText?: string;
  minimumRemainingYearDirectCostFcfaText?: string;
  aboveMinimumRemainingYearDirectCostFcfaText?: string;
  fullYearRunRateMinimumComplementCostFcfaText?: string;
  fullYearRunRateCompensationAboveMinimumCostFcfaText?: string;
  /** Trajectoire mensuelle (12 mois) — présente uniquement en schema v3. */
  months?: SaveSimulationEmployeeMonthDto[];

  /**
   * Champs schema v7 (Lot 2B-RC1-H5). Optionnels / nullables : absents pour
   * les snapshots v6 historiques (mappés en NULL).
   */
  isUniversalFixedAmountEligible?: boolean | null;
  universalFixedAmountExclusionReason?: string | null;
  universalFixedAmountMonthlyAmountText?: string | null;
  universalFixedAmountEffectiveMonth?: number | null;
  universalFixedAmountMinimumSeniorityMonths?: number | null;
  universalFixedAmountSeniorityReferenceDate?: string | null;
  campaignPeriodUniversalFixedAmountCostText?: string | null;
  universalFixedAmountReminderText?: string | null;
  universalFixedAmountRemainingYearDirectCostText?: string | null;
  fullYearRunRateUniversalFixedAmountCostText?: string | null;

  /**
   * Champs schema v4 (Lot 2B-RC1-H1). Optionnels / nullables : absents pour
   * les snapshots v3 historiques (mappés en NULL, jamais de faux Non).
   */
  neutralizeNineBoxEffect?: boolean | null;
  sourceNineBoxCode?: number | null;
  nineBoxTreatmentKind?: string | null;
}

export interface SaveSimulationRunDto {
  campaignId: number;
  expectedCampaignStatus: "draft" | "active";
  expectedCurrentImportBatchId: number | null;
  campaignName: string;
  campaignYear: number;
  campaignStatusAtRun: CampaignStatus;
  evaluationMode: NineBoxMode;
  sourceImportBatchId: number | null;
  sourceImportFileName: string | null;
  sourceFingerprint: string;
  configurationFingerprint: string;
  budgetTargetMode: string;
  manualBudgetFcfaText: string | null;
  eligiblePayrollFcfaText: string | null;
  budgetRateBasisPoints: number | null;
  budgetTargetNumeratorText: string;
  budgetTargetDenominatorText: string;
  roundingMode: string;
  roundingStepFcfaText: string;
  employeeCount: number;
  positiveWeightEmployeeCount: number;
  zeroWeightEmployeeCount: number;
  confirmedUnderperformerCount: number;
  theoreticalTotalNumeratorText: string;
  theoreticalTotalDenominatorText: string;
  actualOperationAmountFcfaText: string;
  totalRoundingDeltaNumeratorText: string;
  totalRoundingDeltaDenominatorText: string;

  /**
   * Version de schéma cible du snapshot. Absente = schema v3 par défaut
   * (les DTO v2 historiques ne fixent pas ce champ).
   */
  resultSchemaVersion?: number;

  /** Champs schema v3 (Lot 2B-P1) — configuration contrat v4. */
  retroactivityStartMonth?: number | null;
  technicalApplicationMonth?: number | null;
  /** Mois d’effet du minimum garanti (schema v6 / contrat v8). NULL = historique. */
  minimumGuaranteeEffectiveMonth?: number | null;
  campaignCoveredMonthCount?: number | null;
  reminderMonthCount?: number | null;
  directPaymentMonthCount?: number | null;
  calculationContractVersion?: number | null;
  seniorityImpactContractVersion?: number | null;
  minimumIncreaseContractVersion?: number | null;
  minimumIncreaseMode?: string | null;
  minimumMonthlyAmountText?: string | null;
  minimumRateNumeratorText?: string | null;
  minimumRateDenominatorText?: string | null;

  /** Enveloppe promotion-aware (v3). */
  promotionCampaignPeriodBudgetCostText?: string;
  totalMinimumComplementFloorCostText?: string;
  availableBudgetAfterPromotionsNumeratorText?: string;
  availableBudgetAfterPromotionsDenominatorText?: string;
  availableBudgetAfterPromotionsAndMinimumNumeratorText?: string;
  availableBudgetAfterPromotionsAndMinimumDenominatorText?: string;
  theoreticalCompensatoryCampaignPeriodCostNumeratorText?: string;
  theoreticalCompensatoryCampaignPeriodCostDenominatorText?: string;
  actualCompensatoryCampaignPeriodCostText?: string;
  actualMinimumComplementPaidCostText?: string;
  actualCompensationAboveMinimumCostText?: string;
  actualCombinedCampaignPeriodCostText?: string;
  compensatoryCalibrationRateNumeratorText?: string;
  compensatoryCalibrationRateDenominatorText?: string;
  minimumIncreasePopulationEmployeeCount?: number | null;
  promotedIncludedEmployeeCount?: number | null;

  /** Rappels / directs / ancienneté / plein effet (population, v3). */
  totalBaseSalaryReminderText?: string;
  totalRemainingYearDirectIncreaseCostText?: string;
  totalAnnualActualBaseIncreaseCostText?: string;
  totalSeniorityReminderText?: string;
  totalRemainingYearDirectSeniorityImpactText?: string;
  totalAnnualSeniorityImpactText?: string;
  totalAnnualPromotionSeniorityImpactText?: string;
  totalAnnualPromotionBudgetCostText?: string;
  totalCombinedAnnualActualCostText?: string;
  totalCombinedAnnualSeniorityImpactText?: string;
  fullYearRunRatePromotionCostText?: string;
  fullYearRunRateCompensatoryCostText?: string;
  fullYearRunRateCombinedBaseMeasureCostText?: string;
  fullYearRunRateSeniorityImpactText?: string;
  fullYearRunRateMinimumComplementCostText?: string;
  fullYearRunRateCompensationAboveMinimumCostText?: string;

  /** Calendrier de paiement agrégé (v3). */
  promotionCostPaidBeforeTechnicalMonthText?: string;
  promotionCostFromTechnicalMonthToDecemberText?: string;
  minimumCompensatoryReminderText?: string;
  aboveMinimumCompensatoryReminderText?: string;
  totalCompensatoryReminderText?: string;
  minimumRemainingYearDirectCostText?: string;
  aboveMinimumRemainingYearDirectCostText?: string;
  totalRemainingYearDirectCompensatoryCostText?: string;

  /** Compteur population schema v4 (Lot 2B-RC1-H1). */
  neutralizeNineBoxEffectEmployeeCount?: number | null;

  /** Coefficient provisoire global « Performance à confirmer » (Lot 2B-RC1-H2). */
  nineBoxConfirmationFactorMilli?: number | null;

  /** Mécanisme social exclusif (schema v7 / contrat v9, Lot 2B-RC1-H5). */
  socialMechanismKind?: string | null;
  universalFixedAmountMonthlyFcfa?: number | null;
  universalFixedAmountEffectiveMonth?: number | null;
  universalFixedAmountMinimumSeniorityMonths?: number | null;
  universalFixedAmountSeniorityReferenceDate?: string | null;
  universalFixedAmountEligibleEmployeeCount?: number | null;
  universalFixedAmountExposureCount?: number | null;
  totalUniversalFixedAmountCostText?: string;
  availableBudgetAfterPromotionsAndSocialMechanismNumeratorText?: string;
  availableBudgetAfterPromotionsAndSocialMechanismDenominatorText?: string;
  totalUniversalFixedAmountReminderText?: string;
  totalUniversalFixedAmountRemainingYearDirectCostText?: string;
  fullYearRunRateUniversalFixedAmountCostText?: string;

  employees: SaveSimulationEmployeeDto[];
}

export interface SaveSimulationRunCommandResult {
  simulationRunId: number;
  runNumber: number;
  createdAt: string;
  employeeCount: number;
}

export interface PersistedSimulationRunSummary {
  id: number;
  campaignId: number;
  runNumber: number;
  resultSchemaVersion: number;
  campaignName: string;
  campaignYear: number;
  campaignStatusAtRun: CampaignStatus;
  evaluationMode: NineBoxMode;
  sourceImportBatchId: number | null;
  sourceImportFileName: string | null;
  sourceFingerprint: string;
  configurationFingerprint: string;
  budgetTargetMode: string;
  manualBudgetFcfa: bigint | null;
  eligiblePayrollFcfa: bigint | null;
  budgetRateBasisPoints: bigint | null;
  exactBudgetTarget: ExactAmount;
  roundingMode: string;
  roundingStepFcfa: bigint;
  employeeCount: number;
  positiveWeightEmployeeCount: number;
  zeroWeightEmployeeCount: number;
  confirmedUnderperformerCount: number;
  theoreticalAllocatedTotal: ExactAmount;
  actualOperationAmountFcfa: bigint;
  totalRoundingDelta: ExactAmount;
  createdAt: string;

  /**
   * Champs schema v3 (migration 0007) relus en lecture seule. `null` /
   * `undefined` pour les snapshots v1/v2 (colonnes NULL) — jamais de faux zéro.
   */
  retroactivityStartMonth?: number | null;
  technicalApplicationMonth?: number | null;
  /** Schema v6 — null pour historique (résolu vers rétroactivité en lecture). */
  minimumGuaranteeEffectiveMonth?: number | null;
  campaignCoveredMonthCount?: number | null;
  promotionCampaignPeriodBudgetCostFcfa?: bigint | null;
  totalMinimumComplementFloorCostFcfa?: bigint | null;
  actualCompensationAboveMinimumCostFcfa?: bigint | null;
  actualCombinedCampaignPeriodCostFcfa?: bigint | null;
  fullYearRunRateCombinedBaseMeasureCostFcfa?: bigint | null;
  /** Compteur schema v4 — null pour snapshots v3. */
  neutralizeNineBoxEffectEmployeeCount?: number | null;
  /** Coefficient provisoire 9-Box schema v5 — null pour snapshots v4 et antérieurs. */
  nineBoxConfirmationFactorMilli?: number | null;
  /** Mécanisme social schema v7 — null pour historique (dérivé en lecture). */
  socialMechanismKind?: string | null;
  universalFixedAmountMonthlyFcfa?: bigint | null;
  universalFixedAmountEffectiveMonth?: number | null;
  universalFixedAmountMinimumSeniorityMonths?: number | null;
  universalFixedAmountSeniorityReferenceDate?: string | null;
  universalFixedAmountEligibleEmployeeCount?: number | null;
  universalFixedAmountExposureCount?: number | null;
  totalUniversalFixedAmountCostFcfa?: bigint | null;
  availableBudgetAfterPromotionsAndSocialMechanism?: ExactAmount | null;
  totalUniversalFixedAmountReminderFcfa?: bigint | null;
  totalUniversalFixedAmountRemainingYearDirectCostFcfa?: bigint | null;
  fullYearRunRateUniversalFixedAmountCostFcfa?: bigint | null;
}

export interface PersistedSimulationEmployeeResult {
  id: number;
  simulationRunId: number;
  employeeId: string;
  employeeDisplayName: string | null;
  familyCode: string;
  familyLabel: string | null;
  gradeCode: string;
  gradeLabel: string | null;
  salaryFcfa: bigint;
  s0Fcfa: bigint;
  salaryRatioBasisPoints: number;
  salaryPositionCode: string;
  salaryPositionLabel: string;
  positionFactorMilli: number;
  evaluationMode: NineBoxMode;
  performanceLevel: string | null;
  potentialLevel: string | null;
  evaluationFactor: ExactAmount;
  theoreticalMatrixWeight: ExactAmount;
  effectiveMatrixWeight: ExactAmount;
  allocationWeight: ExactAmount;
  blockingReason: string | null;
  theoreticalIncreaseRate: ExactAmount;
  theoreticalIncreaseAmount: ExactAmount;
  finalRoundedIncreaseAmountFcfa: bigint;
  individualRoundingDelta: ExactAmount;
  finalSalaryFcfa: bigint;
  explanationSteps: readonly {
    step: string;
    formula?: string;
    outputValue?: string;
  }[];
  /** Trajectoire mensuelle relue (schema v3). Vide pour snapshots v1/v2. */
  months?: PersistedSimulationEmployeeMonthResult[];

  /**
   * Rappels compensatoires (schema v3+) — null si colonnes absentes ou snapshot
   * antérieur (jamais de faux zéro).
   */
  baseSalaryReminderFcfa?: bigint | null;
  minimumCompensatoryReminderFcfa?: bigint | null;
  aboveMinimumCompensatoryReminderFcfa?: bigint | null;

  /** Champs schema v7 (Lot 2B-RC1-H5) — null pour snapshots v6. */
  isUniversalFixedAmountEligible?: boolean | null;
  universalFixedAmountExclusionReason?: string | null;
  universalFixedAmountSeniorityReferenceDate?: string | null;
  campaignPeriodUniversalFixedAmountCostFcfa?: bigint | null;
  universalFixedAmountReminderFcfa?: bigint | null;
  universalFixedAmountRemainingYearDirectCostFcfa?: bigint | null;
  fullYearRunRateUniversalFixedAmountCostFcfa?: bigint | null;

  /**
   * Champs schema v4 (Lot 2B-RC1-H1). `null` pour snapshots v3 historiques —
   * jamais de faux Non reconstruit.
   */
  neutralizeNineBoxEffect?: boolean | null;
  sourceNineBoxCode?: number | null;
  nineBoxTreatmentKind?: string | null;
}

/** Ligne mensuelle relue (schema v3, Lot 2B-P1). */
export interface PersistedSimulationEmployeeMonthResult {
  id: number;
  employeeResultId: number;
  month: number;
  baseSalaryFcfa: bigint;
  gradeCode: string;
  jobFamilyCode: string;
  salaryPositionLabel: string | null;
  targetCompensatoryRate: ExactAmount;
  promotionRateOffset: ExactAmount;
  compensatoryComplementRate: ExactAmount;
  theoreticalCompensatoryComplement: ExactAmount;
  roundedCompensatoryComplementFcfa: bigint;
  promotionBudgetCostFcfa: bigint;
  finalSalaryFcfa: bigint;
  seniorityRatePercent: number;
  promotionSeniorityImpactFcfa: bigint;
  compensatorySeniorityImpactFcfa: bigint;
  totalSeniorityImpactFcfa: bigint;
  paymentTiming: "outside_campaign" | "reminder" | "direct";
  promotionPaymentTiming:
    | "outside_campaign"
    | "reminder"
    | "direct"
    | "not_applicable";
  coveredByCampaignPeriod: boolean;
  includedInCampaignEnvelope: boolean;
  promotionActive: boolean;
  promotionStatus: string;
  isMinimumIncreasePopulationEmployee: boolean;
  guaranteedTotalIncrease: ExactAmount;
  applicablePromotionIncrementFcfa: bigint;
  requiredMinimumComplement: ExactAmount;
  minimumComplementFloorFcfa: bigint;
  weightedComplement: ExactAmount;
  theoreticalComplement: ExactAmount;
  actualComplementAboveMinimumFcfa: bigint;
  /** Forfait social universel du mois (schema v7). */
  universalFixedAmountFcfa?: bigint | null;
}

export interface PersistedSimulationRunDetail {
  summary: PersistedSimulationRunSummary;
  employees: PersistedSimulationEmployeeResult[];
}

export interface SimulationHistoryListOptions {
  limit?: number;
  offset?: number;
}

export interface PaginatedSimulationRuns {
  items: PersistedSimulationRunSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface SaveCampaignSimulationSuccess {
  ok: true;
  saved: SaveSimulationRunCommandResult;
}

export interface SaveCampaignSimulationFailure {
  ok: false;
  code: SimulationPersistenceCode;
  message: string;
}

export type SaveCampaignSimulationOutcome =
  | SaveCampaignSimulationSuccess
  | SaveCampaignSimulationFailure;

export const DEFAULT_SIMULATION_HISTORY_PAGE_SIZE = 20;
export const MAX_SIMULATION_HISTORY_PAGE_SIZE = 100;
