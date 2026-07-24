/**
 * Sauvegarde explicite d’une simulation courante réussie (Lot 2B-4A).
 */

import { buildCampaignSimulationReadiness } from "./buildCampaignSimulationReadiness";
import { buildSimulationSourceFingerprint } from "./buildSimulationSourceFingerprint";
import { mapExecutionResultToSaveDto } from "./mapExecutionResultToSaveDto";
import type {
  CampaignSimulationExecutionResult,
  SimulationExecutionStatus,
} from "./campaignSimulationExecutionModels";
import type { CampaignSimulationReadinessPorts } from "./campaignSimulationModels";
import type { ValidatedCampaignSimulationConfiguration } from "./simulationConfigurationModels";
import type { SimulationPersistenceCode } from "./simulationPersistenceCodes";
import type {
  SaveCampaignSimulationOutcome,
  SaveSimulationRunDto,
} from "./simulationPersistenceModels";
import type { SimulationHistoryRepository } from "../../infrastructure/database/repositories/simulationHistoryRepository";

export interface SaveCurrentCampaignSimulationInput {
  campaignId: number;
  executionStatus: SimulationExecutionStatus;
  isStale: boolean;
  result: CampaignSimulationExecutionResult | null;
  validatedConfiguration: ValidatedCampaignSimulationConfiguration | null;
  ports: CampaignSimulationReadinessPorts;
  repository: SimulationHistoryRepository;
}

function failure(
  code: SimulationPersistenceCode,
  message: string,
): SaveCampaignSimulationOutcome {
  return { ok: false, code, message };
}

/**
 * Enregistre un snapshot immuable de la simulation courante.
 * N’appelle le repository qu’après toutes les gardes métier.
 */
export async function saveCurrentCampaignSimulation(
  input: SaveCurrentCampaignSimulationInput,
): Promise<SaveCampaignSimulationOutcome> {
  const {
    campaignId,
    executionStatus,
    isStale,
    result,
    validatedConfiguration,
    ports,
    repository,
  } = input;

  if (executionStatus !== "success" || !result || isStale) {
    if (isStale || executionStatus === "stale") {
      return failure(
        "SIMULATION_RESULT_STALE",
        "Le résultat de simulation est obsolète. Relancez le calcul avant d’enregistrer.",
      );
    }
    return failure(
      "SIMULATION_RESULT_NOT_AVAILABLE",
      "Aucun résultat de simulation réussi n’est disponible pour l’enregistrement.",
    );
  }

  if (result.campaignId !== campaignId) {
    return failure(
      "SIMULATION_RESULT_CAMPAIGN_MISMATCH",
      "Le résultat n’appartient pas à la campagne sélectionnée.",
    );
  }

  const campaign = await ports.getCampaign(campaignId);
  if (!campaign) {
    return failure(
      "SIMULATION_SAVE_FAILED",
      "La campagne sélectionnée est introuvable.",
    );
  }

  if (campaign.status === "archived") {
    return failure(
      "CAMPAIGN_ARCHIVED",
      "Une campagne archivée ne peut pas enregistrer une nouvelle simulation.",
    );
  }

  if (campaign.status !== "draft" && campaign.status !== "active") {
    return failure(
      "SIMULATION_SAVE_FAILED",
      "Le statut de la campagne n’autorise pas l’enregistrement.",
    );
  }

  if (!validatedConfiguration) {
    return failure(
      "SIMULATION_CONFIGURATION_MISMATCH",
      "Aucune configuration validée n’est disponible pour cette simulation.",
    );
  }

  if (
    validatedConfiguration.campaignId !== campaignId ||
    validatedConfiguration.configurationFingerprint !==
      result.configurationFingerprint ||
    validatedConfiguration.sourceFingerprint !== result.sourceFingerprint
  ) {
    return failure(
      "SIMULATION_CONFIGURATION_MISMATCH",
      "La configuration validée ne correspond plus au résultat à enregistrer.",
    );
  }

  const currentBatch = await ports.getCurrentBatch(campaignId);
  const currentBatchId = currentBatch?.id ?? null;
  if (currentBatchId !== result.currentImportBatchId) {
    return failure(
      "CURRENT_IMPORT_BATCH_CHANGED",
      "Le lot RH courant a changé depuis le calcul. Relancez la simulation avant d’enregistrer.",
    );
  }

  const readiness = await buildCampaignSimulationReadiness(
    {
      campaignId,
      budgetTarget: validatedConfiguration.budgetTarget,
      roundingPolicy: validatedConfiguration.roundingPolicy,
    },
    ports,
  );

  const currentFingerprint = buildSimulationSourceFingerprint({
    campaignId,
    campaignStatus: readiness.campaignStatus,
    evaluationMode: readiness.evaluationMode,
    currentImportBatchId: readiness.currentImportBatchId,
    preparedEmployees: readiness.preparedEmployees,
    preparedReferences: readiness.preparedReferences,
    budgetTarget: validatedConfiguration.budgetTarget,
    roundingPolicy: validatedConfiguration.roundingPolicy,
    campaignYear: validatedConfiguration.campaignYear,
    retroactivityStartMonth: validatedConfiguration.retroactivityStartMonth,
    technicalApplicationMonth: validatedConfiguration.technicalApplicationMonth,
    minimumGuaranteeEffectiveMonth:
      validatedConfiguration.minimumGuaranteeEffectiveMonth,
    minimumIncreasePolicy: validatedConfiguration.minimumIncreasePolicy,
    socialMechanismKind: validatedConfiguration.socialMechanismKind,
    universalFixedAmountPolicy: validatedConfiguration.universalFixedAmountPolicy,
    employerCostPolicy: validatedConfiguration.employerCostPolicy,
  });

  if (currentFingerprint !== result.sourceFingerprint) {
    return failure(
      "SIMULATION_INPUTS_CHANGED_BEFORE_SAVE",
      "Les données sources ont changé depuis le calcul. Relancez la simulation avant d’enregistrer.",
    );
  }

  let dto: SaveSimulationRunDto;
  try {
    dto = mapExecutionResultToSaveDto({
      result,
      expectedCampaignStatus: campaign.status,
      sourceImportFileName: currentBatch?.sourceFileName ?? null,
      minimumIncreasePolicy: validatedConfiguration.minimumIncreasePolicy,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code ===
        "SIMULATION_SNAPSHOT_SCHEMA_REQUIRES_CONSOLIDATION"
    ) {
      return failure(
        "SIMULATION_SNAPSHOT_SCHEMA_REQUIRES_CONSOLIDATION",
        error.message,
      );
    }
    return failure(
      "SIMULATION_SAVE_FAILED",
      "Le résultat de simulation n’a pas pu être préparé pour l’enregistrement.",
    );
  }

  try {
    const saved = await repository.saveSimulationRun(dto);
    return { ok: true, saved };
  } catch {
    return failure(
      "SIMULATION_SAVE_FAILED",
      "L’enregistrement de la simulation a échoué.",
    );
  }
}
