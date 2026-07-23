/** Liste paginée de l’historique de simulations d’une campagne (Lot 2B-4B). */

import type { SimulationHistoryRepository } from "../../infrastructure/database/repositories/simulationHistoryRepository";
import type {
  PaginatedSimulationRuns,
  SimulationHistoryListOptions,
} from "./simulationPersistenceModels";
import type { SimulationPersistenceCode } from "./simulationPersistenceCodes";

export interface ListCampaignSimulationHistorySuccess {
  ok: true;
  page: PaginatedSimulationRuns;
}

export interface ListCampaignSimulationHistoryFailure {
  ok: false;
  code: SimulationPersistenceCode;
  message: string;
}

export type ListCampaignSimulationHistoryOutcome =
  | ListCampaignSimulationHistorySuccess
  | ListCampaignSimulationHistoryFailure;

export async function listCampaignSimulationHistory(
  repository: SimulationHistoryRepository,
  campaignId: number,
  options?: SimulationHistoryListOptions,
): Promise<ListCampaignSimulationHistoryOutcome> {
  try {
    const page = await repository.listSimulationRuns(campaignId, options);
    return { ok: true, page };
  } catch {
    return {
      ok: false,
      code: "SIMULATION_HISTORY_READ_FAILED",
      message: "L’historique des simulations n’a pas pu être chargé.",
    };
  }
}
