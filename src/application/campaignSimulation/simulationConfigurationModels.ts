/** Modèles de configuration de simulation en session (Lot 2B-2). */

import type {
  BudgetTargetInput,
  RoundingPolicy,
} from "../../domain/compensationCalculation";
import type { CampaignSimulationReadinessReport } from "./campaignSimulationModels";
import type {
  BudgetTargetModeChoice,
  SimulationConfigurationDraftFields,
} from "./parseSimulationConfiguration";

export type {
  BudgetTargetModeChoice,
  SimulationConfigurationDraftFields,
};

export interface CampaignSimulationConfigurationDraft
  extends SimulationConfigurationDraftFields {
  campaignId: number;
}

export interface ValidatedCampaignSimulationConfiguration {
  campaignId: number;
  budgetTarget: BudgetTargetInput;
  roundingPolicy: RoundingPolicy;
  readinessReport: CampaignSimulationReadinessReport;
  /** Compteur de session (non temporel) incrémenté à chaque validation. */
  validatedAtSessionSequence: number;
  configurationFingerprint: string;
  /** Empreinte des sources + config au moment de la validation (Lot 2B-3). */
  sourceFingerprint: string;
}

export function createEmptyConfigurationDraft(
  campaignId: number,
): CampaignSimulationConfigurationDraft {
  return {
    campaignId,
    budgetTargetMode: null,
    manualBudgetInput: "",
    eligiblePayrollInput: "",
    budgetRatePercentInput: "",
    roundingMode: "nearest_half_up",
    roundingStepInput: "",
  };
}

export const ROUNDING_STEP_SUGGESTIONS = [
  "1",
  "5",
  "10",
  "50",
  "100",
  "500",
  "1000",
] as const;
