/** Modèles d’exécution / résultat de simulation (Lot 2B-3). */

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
  exactBudgetTarget: ExactAmount;
  exactBudgetTargetLabel: string;
  manualBudgetFcfa?: bigint;
  eligiblePayrollFcfa?: bigint;
  budgetRateBasisPoints?: bigint;
  actualOperationAmountFcfa: bigint;
  actualOperationAmountLabel: string;
  totalRoundingDelta: ExactAmount;
  totalRoundingDeltaLabel: string;
  theoreticalAllocatedTotal: ExactAmount;
  theoreticalAllocatedTotalLabel: string;
  roundingMode: RoundingPolicy["mode"];
  roundingStepFcfa: bigint;
}

export interface SimulationPopulationSummaryView {
  employeeCount: number;
  positiveWeightEmployeeCount: number;
  zeroWeightEmployeeCount: number;
  confirmedUnderperformerCount: number;
  theoreticalAllocatedTotal: ExactAmount;
  actualOperationAmountFcfa: bigint;
  totalRoundingDelta: ExactAmount;
  isTheoreticalBudgetExactlyAllocated: boolean;
}

export interface EmployeeSimulationResultView {
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
  /** Fractions exactes (persistance Lot 2B-4A) — hors recalcul moteur. */
  evaluationFactor: ExactAmount;
  theoreticalMatrixWeight: ExactAmount;
  effectiveMatrixWeight: ExactAmount;
  allocationWeight: ExactAmount;
  evaluationFactorLabel: string;
  theoreticalMatrixWeightLabel: string;
  effectiveMatrixWeightLabel: string;
  allocationWeightLabel: string;
  blockingReason: string | null;
  theoreticalIncreaseRate: ExactAmount;
  theoreticalIncreaseAmount: ExactAmount;
  theoreticalIncreaseRateLabel: string;
  theoreticalIncreaseAmountLabel: string;
  finalRoundedIncreaseAmountFcfa: bigint;
  individualRoundingDelta: ExactAmount;
  individualRoundingDeltaLabel: string;
  finalSalaryFcfa: bigint;
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
  campaignStatus: CampaignStatus | "unknown";
  evaluationMode: NineBoxMode;
  currentImportBatchId: number | null;
  runSequence: number;
  sourceFingerprint: string;
  configurationFingerprint: string;
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
