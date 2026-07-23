/** Modèles de configuration de simulation en session (Lot 2B-2). */

import type {
  BudgetTargetInput,
  MinimumIncreasePolicy,
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
  /** Année de campagne explicite (déterministe). */
  campaignYear: number;
  /** Début de rétroactivité (1–12). Défaut = 1. */
  retroactivityStartMonth: number;
  /** Mois d’application technique (1–12). */
  technicalApplicationMonth: number;
  /**
   * Mois d’effet du minimum garanti (1–12).
   * Défaut = mois technique (Lot 2B-RC1-H4).
   */
  minimumGuaranteeEffectiveMonth: number;
  /** Politique de minimum garanti d’augmentation (Lot 2A-H2D-2). */
  minimumIncreasePolicy: MinimumIncreasePolicy;
  readinessReport: CampaignSimulationReadinessReport;
  /** Compteur de session (non temporel) incrémenté à chaque validation. */
  validatedAtSessionSequence: number;
  configurationFingerprint: string;
  /** Empreinte des sources + config au moment de la validation (Lot 2B-3). */
  sourceFingerprint: string;
}

/**
 * Brouillon vide. L’année courante n’est utilisée qu’ici (UI), jamais dans le moteur.
 */
export function createEmptyConfigurationDraft(
  campaignId: number,
  options?: { campaignYear?: number },
): CampaignSimulationConfigurationDraft {
  const uiDefaultYear =
    options?.campaignYear ?? new Date().getFullYear();
  return {
    campaignId,
    budgetTargetMode: null,
    manualBudgetInput: "",
    eligiblePayrollInput: "",
    budgetRatePercentInput: "",
    roundingMode: "nearest_half_up",
    roundingStepInput: "",
    campaignYearInput: String(uiDefaultYear),
    retroactivityStartMonthInput: "1",
    technicalApplicationMonthInput: "1",
    minimumGuaranteeEffectiveMonthInput: "1",
    minimumIncreaseMode: "none",
    minimumMonthlyAmountInput: "",
    minimumIncreaseRatePercentInput: "",
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
