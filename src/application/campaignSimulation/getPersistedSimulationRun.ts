/** Lecture d'un run de simulation persisté (Lot 2B-4B). */

import type { SimulationHistoryRepository } from "../../infrastructure/database/repositories/simulationHistoryRepository";
import { mapPersistedDetailToViewModel } from "./mapToSimulationViewModel";
import {
  classifyResultSchemaVersion,
  resultSchemaCompatibilityMessage,
  UNKNOWN_RESULT_SCHEMA_MESSAGE,
  type ResultSchemaCompatibility,
} from "./resultSchemaCompatibility";
import type { PersistedSimulationRunDetail } from "./simulationPersistenceModels";
import type { SimulationPersistenceCode } from "./simulationPersistenceCodes";
import type { SimulationResultViewModel } from "./simulationViewModels";

export interface GetPersistedSimulationRunSuccess {
  ok: true;
  detail: PersistedSimulationRunDetail;
  view: SimulationResultViewModel;
  /** Compatibilité du schéma présenté. */
  compatibility: ResultSchemaCompatibility;
  /** Message de dégradation (null si vue complète v3). */
  compatibilityMessage: string | null;
}

export interface GetPersistedSimulationRunFailure {
  ok: false;
  code: SimulationPersistenceCode;
  message: string;
}

export type GetPersistedSimulationRunOutcome =
  | GetPersistedSimulationRunSuccess
  | GetPersistedSimulationRunFailure;

export async function getPersistedSimulationRun(
  repository: SimulationHistoryRepository,
  runId: number,
): Promise<GetPersistedSimulationRunOutcome> {
  let detail: PersistedSimulationRunDetail | null;
  try {
    detail = await repository.getSimulationRun(runId);
  } catch {
    return {
      ok: false,
      code: "SIMULATION_HISTORY_READ_FAILED",
      message: "Cette simulation enregistrée n’a pas pu être consultée.",
    };
  }

  if (!detail) {
    return {
      ok: false,
      code: "SIMULATION_RUN_NOT_FOUND",
      message: "Cette simulation enregistrée est introuvable.",
    };
  }

  const compatibility = classifyResultSchemaVersion(
    detail.summary.resultSchemaVersion,
  );

  // Schéma non reconnu : refus explicite (aucune présentation hasardeuse).
  if (compatibility === "unknown") {
    return {
      ok: false,
      code: "SIMULATION_HISTORY_READ_FAILED",
      message: UNKNOWN_RESULT_SCHEMA_MESSAGE,
    };
  }

  let view: SimulationResultViewModel;
  try {
    // La vue est complète pour v3 ; partielle (sans mois ni champs v3 inventés)
    // pour v1 incompatible / v2 incomplète.
    view = mapPersistedDetailToViewModel(detail);
  } catch {
    return {
      ok: false,
      code: "SIMULATION_HISTORY_READ_FAILED",
      message: "Cette simulation enregistrée contient une donnée illisible.",
    };
  }

  return {
    ok: true,
    detail,
    view,
    compatibility,
    compatibilityMessage: resultSchemaCompatibilityMessage(
      detail.summary.resultSchemaVersion,
    ),
  };
}
