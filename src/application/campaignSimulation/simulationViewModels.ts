/** Modèles de vue partagés entre résultat courant et historique (Lot 2B-4B). */

import type { NineBoxMode } from "../../domain/compensationReference/models";
import type { CampaignStatus } from "../../domain/campaign/models";
import type { ResultSchemaCompatibility } from "./resultSchemaCompatibility";

export type SimulationViewMode = "current" | "persisted-readonly";

/**
 * Ligne mensuelle de vue (schema v3, jan→déc). Présente uniquement lorsque la
 * trajectoire mensuelle est disponible (résultat courant, ou snapshot v3).
 * Jamais fabriquée pour les snapshots v1/v2 (aucun détail mensuel inventé).
 */
export interface SimulationEmployeeMonthViewModel {
  month: number;
  monthLabel: string;
  baseSalaryLabel: string;
  gradeCode: string;
  jobFamilyCode: string;
  compensatoryComplementRateLabel: string;
  theoreticalCompensatoryComplementLabel: string;
  minimumComplementFloorLabel: string;
  actualComplementAboveMinimumLabel: string;
  roundedCompensatoryComplementLabel: string;
  promotionBudgetCostLabel: string;
  finalSalaryLabel: string;
  seniorityRateLabel: string;
  totalSeniorityImpactLabel: string;
  paymentTiming: "outside_campaign" | "reminder" | "direct";
  promotionPaymentTiming:
    | "outside_campaign"
    | "reminder"
    | "direct"
    | "not_applicable";
  coveredByCampaignPeriod: boolean;
}

export interface SimulationSummaryViewModel {
  mode: SimulationViewMode;
  campaignId: number;
  campaignName: string;
  campaignYear: number | null;
  campaignStatusAtRun?: CampaignStatus;
  evaluationMode: NineBoxMode;
  employeeCount: number;
  positiveWeightEmployeeCount: number;
  zeroWeightEmployeeCount: number;
  confirmedUnderperformerCount: number;
  /** Schema v4 — null/undefined sur anciens snapshots. */
  neutralizeNineBoxEffectEmployeeCount?: number | null;
  budgetTargetLabel: string;
  theoreticalAllocatedTotalLabel: string;
  actualOperationAmountLabel: string;
  totalRoundingDeltaLabel: string;
  roundingMode: string;
  roundingStepLabel: string;
  budgetTargetMode: string;
  manualBudgetLabel: string | null;
  eligiblePayrollLabel: string | null;
  budgetRateLabel: string | null;
  runSequence?: number;
  runNumber?: number;
  createdAt?: string;
  sourceImportBatchId: number | null;
  sourceImportFileName: string | null;
  sourceFingerprint?: string;
  configurationFingerprint?: string;
  resultSchemaVersion?: number;

  /**
   * Compatibilité du schéma du snapshot présenté (schema v3). `current` pour un
   * résultat courant ; `incomplete` / `incompatible` / `unknown` pour un
   * snapshot persisté selon `result_schema_version`.
   */
  schemaCompatibility?: ResultSchemaCompatibility;
  /** Message de dégradation associé (null si vue complète). */
  schemaCompatibilityMessage?: string | null;

  /**
   * Champs schema v3 (période d'effet configurable, promotion-aware, minimum,
   * plein effet). `null` = information indisponible pour ce snapshot (v1/v2) :
   * jamais de faux zéro.
   */
  retroactivityStartMonth?: number | null;
  technicalApplicationMonth?: number | null;
  campaignCoveredMonthCount?: number | null;
  periodPromotionBudgetCostLabel?: string | null;
  periodMinimumComplementFloorCostLabel?: string | null;
  periodCompensationAboveMinimumCostLabel?: string | null;
  periodCombinedActualCostLabel?: string | null;
  periodCombinedRoundingDeltaLabel?: string | null;
  fullYearRunRateCombinedBaseMeasureCostLabel?: string | null;
}

export interface SimulationEmployeeViewModel {
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
  evaluationFactorLabel: string;
  theoreticalMatrixWeightLabel: string;
  effectiveMatrixWeightLabel: string;
  allocationWeightLabel: string;
  blockingReason: string | null;
  /**
   * Champs schema v4 (Lot 2B-RC1-H1). Optionnels : absents / null pour
   * snapshots v3 — jamais de faux Non.
   */
  neutralizeNineBoxEffect?: boolean | null;
  sourceNineBoxCode?: number | null;
  nineBoxTreatmentKind?: string | null;
  nineBoxTreatmentLabel?: string | null;
  theoreticalIncreaseRateLabel: string;
  theoreticalIncreaseAmountLabel: string;
  finalRoundedIncreaseAmountFcfa: bigint;
  individualRoundingDeltaLabel: string;
  finalSalaryFcfa: bigint;
  explanationSteps: readonly {
    step: string;
    formula?: string;
    outputValue?: string;
  }[];

  /**
   * Champs schema v3 optionnels. Renseignés pour un résultat courant ; `null` /
   * absents pour un snapshot v1/v2 (aucun faux zéro, aucun détail mensuel
   * inventé). `months` est ordonné jan→déc lorsqu'il est présent.
   */
  compensatoryEligibilityLabel?: string | null;
  promotionStatusLabel?: string | null;
  annualPromotionBudgetCostLabel?: string | null;
  campaignPeriodMinimumComplementFloorCostLabel?: string | null;
  campaignPeriodCompensationAboveMinimumCostLabel?: string | null;
  combinedAnnualActualCostLabel?: string | null;
  annualRoundingDeltaLabel?: string | null;
  fullYearRunRateCombinedBaseMeasureCostLabel?: string | null;
  technicalMonthFinalSalaryLabel?: string | null;
  months?: SimulationEmployeeMonthViewModel[] | null;
}

export interface SimulationResultViewModel {
  summary: SimulationSummaryViewModel;
  employees: SimulationEmployeeViewModel[];
}
