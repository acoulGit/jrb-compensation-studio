/**
 * Historique de simulations SQLite (Lot 2B-4A).
 * Écriture via commande Rust atomique ; lecture via plugin SQL.
 */

import { invoke } from "@tauri-apps/api/core";
import {
  DEFAULT_SIMULATION_HISTORY_PAGE_SIZE,
  MAX_SIMULATION_HISTORY_PAGE_SIZE,
  type PaginatedSimulationRuns,
  type PersistedSimulationEmployeeResult,
  type PersistedSimulationRunDetail,
  type PersistedSimulationRunSummary,
  type SaveSimulationRunCommandResult,
  type SaveSimulationRunDto,
  type SimulationHistoryListOptions,
} from "../../../application/campaignSimulation/simulationPersistenceModels";
import { getDatabase } from "../connection";
import {
  mapSimulationEmployeeResult,
  mapSimulationRunSummary,
  type SimulationEmployeeResultRow,
  type SimulationRunRow,
} from "../simulationHistoryMappers";
import type { SimulationHistoryRepository } from "./simulationHistoryRepository";

function invokeErrorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim()) {
    return error;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "L’enregistrement de la simulation a échoué.";
}

export class SqliteSimulationHistoryRepository
  implements SimulationHistoryRepository
{
  async saveSimulationRun(
    dto: SaveSimulationRunDto,
  ): Promise<SaveSimulationRunCommandResult> {
    try {
      return await invoke<SaveSimulationRunCommandResult>("save_simulation_run", {
        input: dto,
      });
    } catch (error) {
      throw new Error(invokeErrorMessage(error));
    }
  }

  async listSimulationRuns(
    campaignId: number,
    options?: SimulationHistoryListOptions,
  ): Promise<PaginatedSimulationRuns> {
    const limit = Math.min(
      Math.max(options?.limit ?? DEFAULT_SIMULATION_HISTORY_PAGE_SIZE, 1),
      MAX_SIMULATION_HISTORY_PAGE_SIZE,
    );
    const offset = Math.max(options?.offset ?? 0, 0);
    const db = await getDatabase();
    const totalRow = await db.select<{ total: number }[]>(
      `SELECT COUNT(*) AS total
       FROM compensation_simulation_runs
       WHERE campaign_id = $1`,
      [campaignId],
    );
    const total = Number(totalRow[0]?.total ?? 0);
    const rows = await db.select<SimulationRunRow[]>(
      `SELECT *
       FROM compensation_simulation_runs
       WHERE campaign_id = $1
       ORDER BY run_number DESC
       LIMIT $2 OFFSET $3`,
      [campaignId, limit, offset],
    );
    return {
      items: rows.map(mapSimulationRunSummary),
      total,
      limit,
      offset,
    };
  }

  async getSimulationRunSummary(
    runId: number,
  ): Promise<PersistedSimulationRunSummary | null> {
    const db = await getDatabase();
    const rows = await db.select<SimulationRunRow[]>(
      `SELECT * FROM compensation_simulation_runs WHERE id = $1`,
      [runId],
    );
    const row = rows[0];
    return row ? mapSimulationRunSummary(row) : null;
  }

  async getSimulationRun(
    runId: number,
  ): Promise<PersistedSimulationRunDetail | null> {
    const summary = await this.getSimulationRunSummary(runId);
    if (!summary) return null;
    const employees = await this.listSimulationEmployeeResults(runId);
    return { summary, employees };
  }

  async listSimulationEmployeeResults(
    runId: number,
  ): Promise<PersistedSimulationEmployeeResult[]> {
    const db = await getDatabase();
    const rows = await db.select<SimulationEmployeeResultRow[]>(
      `SELECT *
       FROM compensation_simulation_employee_results
       WHERE simulation_run_id = $1
       ORDER BY employee_id ASC`,
      [runId],
    );
    return rows.map(mapSimulationEmployeeResult);
  }
}
