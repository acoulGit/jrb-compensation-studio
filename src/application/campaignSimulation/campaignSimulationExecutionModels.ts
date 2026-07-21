/** Modèles d’exécution / résultat de simulation (Lot 2B-3 / correctif 2A-H1). */

import type {
  BudgetTargetInput,
  ExactAmount,
  RoundingPolicy,
} from "../../domain/compensationCalculation";
import type { CampaignStatus } from "../../domain/campaign/models";
import type { NineBoxMode } from "../../domain/compensationReference/models";
import type { CampaignSimulationReadinessIssue } from "./campaignSimulationModels";
import type { CampaignSimulationExecutionCode } from "./campaignSimulationExecutionCodes";
import type { ValidatedCampaignSimulationConfiguration } from "./simulationConfigurationModels";
import type { CampaignSimulationReadinessPorts } from "./campaignSimulationModels";

export type SimulationExecutionStatus =
  | "idle"
  | "ready"
  | "running"
  | "success"
  | "error"
  | "stale";

export interface SimulationBudgetSummaryView {
  budgetTargetMode: BudgetTargetInput["mode"];
  /** Budget annuel cible exact. */
  exactBudgetTarget: ExactAmount;
  exactBudgetTargetLabel: string;
  manualBudgetFcfa?: bigint;
  /** Masse mensuelle éligible saisie (mode pourcentage). */
  eligiblePayrollFcfa?: bigint;
  budgetRateBasisPoints?: bigint;
  /** Coût annuel réel après arrondi. */
  annualActualOperationCostFcfa: bigint;
  annualActualOperationCostLabel: string;
  /** Écart annuel d’arrondi. */
  annualTotalRoundingDelta: ExactAmount;
  annualTotalRoundingDeltaLabel: string;
  /** Allocation théorique annuelle totale. */
  annualTheoreticalAllocatedTotal: ExactAmount;
  annualTheoreticalAllocatedTotalLabel: string;
  /** Augmentation mensuelle théorique totale (= annuel / 12). */
  monthlyTheoreticalIncreaseTotal: ExactAmount;
  monthlyTheoreticalIncreaseTotalLabel: string;
  roundingMode: RoundingPolicy["mode"];
  roundingStepFcfa: bigint;
  /** Lot 2A-H2C-2B — synthèse d’enveloppe promotion-aware. */
  envelopeSummary: PromotionAwareEnvelopeSummaryView;
  paymentCalendar: PaymentCalendarSummaryView;
  seniorityImpactSummary: SeniorityImpactSummaryView;
  /** True si au moins un salarié a une promotion structurée (affichage conditionnel). */
  hasStructuredPromotions: boolean;
  /** True si au moins un coût promotion imputable > 0. */
  hasImputedPromotionBudgetCost: boolean;
}

/** Synthèse budgétaire population (Lot 2A-H2C-2B). */
export interface PromotionAwareEnvelopeSummaryView {
  annualBudgetTargetFcfa: ExactAmount;
  annualBudgetTargetLabel: string;
  totalAnnualPromotionBudgetCostFcfa: bigint;
  totalAnnualPromotionBudgetCostLabel: string;
  availableAnnualCompensatoryBudgetFcfa: ExactAmount;
  availableAnnualCompensatoryBudgetLabel: string;
  totalAnnualTheoreticalCompensatoryCostFcfa: ExactAmount;
  totalAnnualTheoreticalCompensatoryCostLabel: string;
  totalAnnualActualCompensatoryCostFcfa: bigint;
  totalAnnualActualCompensatoryCostLabel: string;
  totalAnnualActualCombinedBaseMeasureCostFcfa: bigint;
  totalAnnualActualCombinedBaseMeasureCostLabel: string;
  annualCombinedRoundingDeltaFcfa: ExactAmount;
  annualCombinedRoundingDeltaLabel: string;
  compensatoryCalibrationRate: ExactAmount;
  compensatoryCalibrationRateLabel: string;
}

/** Calendrier de paiement population (Lot 2A-H2C-2B). */
export interface PaymentCalendarSummaryView {
  totalPromotionCostAlreadyPaidBeforeTechnicalMonthFcfa: bigint;
  totalPromotionCostAlreadyPaidBeforeTechnicalMonthLabel: string;
  totalPromotionCostFromTechnicalMonthToDecemberFcfa: bigint;
  totalPromotionCostFromTechnicalMonthToDecemberLabel: string;
  totalAnnualPromotionBudgetCostFcfa: bigint;
  totalAnnualPromotionBudgetCostLabel: string;
  totalCompensatoryReminderFcfa: bigint;
  totalCompensatoryReminderLabel: string;
  totalRemainingYearDirectCompensatoryCostFcfa: bigint;
  totalRemainingYearDirectCompensatoryCostLabel: string;
  totalAnnualActualCompensatoryCostFcfa: bigint;
  totalAnnualActualCompensatoryCostLabel: string;
  /** Invariant visuel : rappel + direct = annuel réel. */
  compensatoryReminderPlusDirectEqualsAnnual: boolean;
}

/** Incidences d’ancienneté hors budget (Lot 2A-H2C-2B). */
export interface SeniorityImpactSummaryView {
  totalAnnualPromotionSeniorityImpactFcfa: bigint;
  totalAnnualPromotionSeniorityImpactLabel: string;
  totalAnnualCompensatorySeniorityImpactFcfa: bigint;
  totalAnnualCompensatorySeniorityImpactLabel: string;
  totalAnnualSeniorityImpactFcfa: bigint;
  totalAnnualSeniorityImpactLabel: string;
  totalPromotionSeniorityAlreadyPaidBeforeTechnicalMonthFcfa: bigint;
  totalPromotionSeniorityAlreadyPaidBeforeTechnicalMonthLabel: string;
  totalPromotionSeniorityFromTechnicalMonthToDecemberFcfa: bigint;
  totalPromotionSeniorityFromTechnicalMonthToDecemberLabel: string;
  totalCompensatorySeniorityReminderFcfa: bigint;
  totalCompensatorySeniorityReminderLabel: string;
  totalRemainingYearDirectCompensatorySeniorityImpactFcfa: bigint;
  totalRemainingYearDirectCompensatorySeniorityImpactLabel: string;
}

/** Trajectoire mensuelle formatée (Lot 2A-H2C-2B). */
export interface MonthlyCompensationTrajectoryView {
  month: number;
  monthLabel: string;
  baseSalaryFcfa: bigint;
  baseSalaryLabel: string;
  gradeCode: string;
  jobFamilyCode: string;
  salaryPositionLabel: string | null;
  targetCompensatoryRate: ExactAmount;
  targetCompensatoryRateLabel: string;
  promotionRateOffset: ExactAmount;
  promotionRateOffsetLabel: string;
  compensatoryComplementRate: ExactAmount;
  compensatoryComplementRateLabel: string;
  theoreticalCompensatoryComplement: ExactAmount;
  theoreticalCompensatoryComplementLabel: string;
  roundedCompensatoryComplementFcfa: bigint;
  roundedCompensatoryComplementLabel: string;
  promotionBudgetCostFcfa: bigint;
  promotionBudgetCostLabel: string;
  finalSalaryFcfa: bigint;
  finalSalaryLabel: string;
  seniorityRatePercent: number;
  seniorityRateLabel: string;
  promotionSeniorityImpactFcfa: bigint;
  promotionSeniorityImpactLabel: string;
  compensatorySeniorityImpactFcfa: bigint;
  compensatorySeniorityImpactLabel: string;
  totalSeniorityImpactFcfa: bigint;
  totalSeniorityImpactLabel: string;
  promotionPaymentStatusLabel: string;
  compensatoryPaymentStatusLabel: string;
  paymentTiming: "reminder" | "direct";
  promotionActive: boolean;
  promotionStatus: string;
}

export interface SimulationPopulationSummaryView {
  employeeCount: number;
  positiveWeightEmployeeCount: number;
  zeroWeightEmployeeCount: number;
  confirmedUnderperformerCount: number;
  annualTheoreticalAllocatedTotal: ExactAmount;
  annualActualOperationCostFcfa: bigint;
  annualTotalRoundingDelta: ExactAmount;
  isTheoreticalBudgetExactlyAllocated: boolean;
  campaignYear: number;
  technicalApplicationMonth: number;
  totalBaseSalaryReminderFcfa: bigint;
  totalRemainingYearDirectIncreaseCostFcfa: bigint;
  totalAnnualActualBaseIncreaseCostFcfa: bigint;
  totalSeniorityReminderFcfa: bigint;
  totalRemainingYearDirectSeniorityImpactFcfa: bigint;
  totalAnnualSeniorityImpactFcfa: bigint;
  promotedIncludedEmployeeCount: number;
  totalAnnualPromotionBudgetCostFcfa: bigint;
  availableAnnualCompensatoryBudget: ExactAmount;
  totalCombinedAnnualActualCostFcfa: bigint;
  totalAnnualPromotionSeniorityImpactFcfa: bigint;
  totalCombinedAnnualSeniorityImpactFcfa: bigint;
  compensatoryCalibrationRate: ExactAmount;
}

export interface EmployeeSimulationResultView {
  employeeId: string;
  employeeDisplayName: string | null;
  familyCode: string;
  familyLabel: string | null;
  gradeCode: string;
  gradeLabel: string | null;
  /** Salaire mensuel. */
  salaryFcfa: bigint;
  /** S0 mensuel. */
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
  evaluationFactorLabel: string;
  theoreticalMatrixWeightLabel: string;
  effectiveMatrixWeightLabel: string;
  allocationWeightLabel: string;
  blockingReason: string | null;
  /** Allocation théorique annuelle. */
  annualTheoreticalAllocation: ExactAmount;
  annualTheoreticalAllocationLabel: string;
  /** Augmentation mensuelle théorique. */
  monthlyTheoreticalIncrease: ExactAmount;
  monthlyTheoreticalIncreaseLabel: string;
  /** Taux d’augmentation mensuel. */
  monthlyTheoreticalIncreaseRate: ExactAmount;
  monthlyTheoreticalIncreaseRateLabel: string;
  /** Augmentation mensuelle finale arrondie. */
  monthlyFinalRoundedIncreaseFcfa: bigint;
  /** Écart mensuel d’arrondi. */
  monthlyRoundingDelta: ExactAmount;
  monthlyRoundingDeltaLabel: string;
  /** Coût annuel réel. */
  annualActualCostFcfa: bigint;
  /** Écart annuel d’arrondi. */
  annualRoundingDelta: ExactAmount;
  annualRoundingDeltaLabel: string;
  /** Nouveau salaire mensuel. */
  monthlyFinalSalaryFcfa: bigint;
  campaignYear: number;
  technicalApplicationMonth: number;
  retroactiveMonths: number;
  remainingDirectPaymentMonths: number;
  baseSalaryReminderFcfa: bigint;
  remainingYearDirectIncreaseCostFcfa: bigint;
  annualActualBaseIncreaseCostFcfa: bigint;
  hireDate: string;
  technicalApplicationMonthSeniorityRatePercent: number;
  monthlySeniorityImpactSchedule: readonly {
    month: number;
    ratePercent: number;
    monthlySeniorityImpactFcfa: bigint;
    paymentTiming: "reminder" | "direct";
  }[];
  seniorityReminderFcfa: bigint;
  remainingYearDirectSeniorityImpactFcfa: bigint;
  annualSeniorityImpactFcfa: bigint;
  /** Lot 2A-H2C-2B — champs promotion / complément / trajectoire. */
  compensatoryMeasureEligible: boolean;
  isPromotionBudgetPopulationEmployee: boolean;
  employmentStatus: string | null;
  contractType: string | null;
  promotionStatusLabel: string;
  promotionStatusKind: string;
  compensatoryEligibilityLabel: string;
  compensatoryEligibilityKind: string;
  compensatoryIneligibilityReasonCode: string | null;
  compensatoryIneligibilityReasonLabel: string | null;
  hasStructuredPromotion: boolean;
  promotionDate: string | null;
  promotionYear: number | null;
  promotionMonth: number | null;
  previousGradeCode: string | null;
  promotedGradeCode: string | null;
  previousJobFamilyCode: string | null;
  promotedJobFamilyCode: string | null;
  salaryBeforePromotionFcfa: bigint | null;
  salaryAfterPromotionFcfa: bigint | null;
  promotionAmountFcfa: bigint | null;
  promotionRate: ExactAmount | null;
  promotionRateLabel: string | null;
  promotionInclusionStatusLabel: string | null;
  /** Coût brut informatif H2C-1. */
  promotionCampaignCostInformativeFcfa: bigint;
  promotionCampaignCostInformativeLabel: string;
  /** Coût imputé à l’enveloppe. */
  annualPromotionBudgetCostFcfa: bigint;
  annualPromotionBudgetCostLabel: string;
  promotionCostAlreadyPaidBeforeTechnicalMonthFcfa: bigint;
  promotionCostAlreadyPaidBeforeTechnicalMonthLabel: string;
  promotionCostFromTechnicalMonthToDecemberFcfa: bigint;
  promotionCostFromTechnicalMonthToDecemberLabel: string;
  annualPromotionSeniorityImpactFcfa: bigint;
  annualPromotionSeniorityImpactLabel: string;
  combinedAnnualSeniorityImpactFcfa: bigint;
  combinedAnnualSeniorityImpactLabel: string;
  combinedAnnualActualCostFcfa: bigint;
  combinedAnnualActualCostLabel: string;
  /** Complément au mois d’application technique. */
  technicalMonthCompensatoryComplementFcfa: bigint;
  technicalMonthCompensatoryComplementLabel: string;
  technicalMonthFinalSalaryFcfa: bigint;
  technicalMonthFinalSalaryLabel: string;
  monthlyCompensationTrajectory: readonly MonthlyCompensationTrajectoryView[];
  explanationSteps: readonly {
    step: string;
    formula?: string;
    outputValue?: string;
  }[];
}

export interface CampaignSimulationExecutionResult {
  campaignId: number;
  campaignName: string | null;
  campaignYear: number | null;
  technicalApplicationMonth: number | null;
  campaignStatus: CampaignStatus | "unknown";
  evaluationMode: NineBoxMode;
  currentImportBatchId: number | null;
  runSequence: number;
  sourceFingerprint: string;
  configurationFingerprint: string;
  /** Version du contrat de calcul ayant produit ce résultat. */
  calculationContractVersion: number;
  budgetSummary: SimulationBudgetSummaryView;
  populationSummary: SimulationPopulationSummaryView;
  employees: EmployeeSimulationResultView[];
  explanationSteps: readonly {
    step: string;
    formula?: string;
    outputValue?: string;
  }[];
}

export interface CampaignSimulationExecutionIssue {
  code: CampaignSimulationExecutionCode | string;
  message: string;
  scope?: string;
  employeeId?: string;
  field?: string;
  details?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface ExecuteCampaignSimulationSuccess {
  ok: true;
  result: CampaignSimulationExecutionResult;
}

export interface ExecuteCampaignSimulationFailure {
  ok: false;
  code: CampaignSimulationExecutionCode;
  message: string;
  issues: CampaignSimulationExecutionIssue[];
  readinessIssues?: CampaignSimulationReadinessIssue[];
}

export type ExecuteCampaignSimulationOutcome =
  | ExecuteCampaignSimulationSuccess
  | ExecuteCampaignSimulationFailure;

export interface ExecuteCampaignSimulationInput {
  campaignId: number;
  validatedConfiguration: ValidatedCampaignSimulationConfiguration;
  /** Empreinte attendue au moment de la validation (sources + config). */
  expectedSourceFingerprint: string;
  ports: CampaignSimulationReadinessPorts;
  /** Labels salariés optionnels (employeeId → display name). */
  employeeLabelsById?: ReadonlyMap<string, string>;
  runSequence: number;
}
