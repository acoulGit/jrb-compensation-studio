/** Contrat de lecture / écriture de l’historique de simulations (Lot 2B-4A). */

import type {
  PaginatedSimulationRuns,
  PersistedSimulationEmployeeMonthResult,
  PersistedSimulationEmployeeResult,
  PersistedSimulationRunDetail,
  PersistedSimulationRunSummary,
  SaveSimulationRunCommandResult,
  SaveSimulationRunDto,
  SimulationHistoryListOptions,
} from "../../../application/campaignSimulation/simulationPersistenceModels";

export interface SimulationHistoryRepository {
  saveSimulationRun(
    dto: SaveSimulationRunDto,
  ): Promise<SaveSimulationRunCommandResult>;

  listSimulationRuns(
    campaignId: number,
    options?: SimulationHistoryListOptions,
  ): Promise<PaginatedSimulationRuns>;

  getSimulationRun(runId: number): Promise<PersistedSimulationRunDetail | null>;

  listSimulationEmployeeResults(
    runId: number,
  ): Promise<PersistedSimulationEmployeeResult[]>;

  /** Lecture des lignes mensuelles d'un salarié (schema v3, jan→déc). */
  listSimulationEmployeeMonthResults(
    employeeResultId: number,
  ): Promise<PersistedSimulationEmployeeMonthResult[]>;

  /** Lecture résumé seule (sans salariés). */
  getSimulationRunSummary(
    runId: number,
  ): Promise<PersistedSimulationRunSummary | null>;
}
