/**
 * Modèles persistés et DTO de sauvegarde (Lot 2B-4A).
 * BigInt / fractions transmis uniquement en chaînes décimales.
 */

import type { ExactAmount } from "../../domain/compensationCalculation";
import type { CampaignStatus } from "../../domain/campaign/models";
import type { NineBoxMode } from "../../domain/compensationReference/models";
import type { SimulationPersistenceCode } from "./simulationPersistenceCodes";

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
