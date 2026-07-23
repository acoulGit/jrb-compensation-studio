/**
 * Invocation de l’export Excel RH et sélection de la destination (Lot 2B-E1).
 *
 * Aucun mot de passe n’est journalisé ni renvoyé : `sanitizeReturnedMessage`
 * retire défensivement toute occurrence du mot de passe d’un message d’erreur
 * avant affichage (le backend ne devrait jamais le divulguer).
 */

import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type {
  ExportSimulationRunExcelInput,
  ExportSimulationRunExcelResult,
} from "./hrExcelExportModels";
import { isCancelledMessage } from "./hrExcelExportErrorMessages";

export type ExportSimulationRunExcelOutcome =
  | { ok: true; result: ExportSimulationRunExcelResult }
  | { ok: false; message: string; cancelled?: boolean };

const GENERIC_FAILURE_MESSAGE =
  "L’export du rapport RH a échoué. Réessayez ou choisissez une autre destination.";

/** Retire défensivement le mot de passe d’un message avant affichage. */
function sanitizeReturnedMessage(
  message: string,
  password: string | null,
): string {
  if (!password) return message;
  if (!message.includes(password)) return message;
  return GENERIC_FAILURE_MESSAGE;
}

export async function exportSimulationRunExcel(
  input: ExportSimulationRunExcelInput,
): Promise<ExportSimulationRunExcelOutcome> {
  try {
    const result = await invoke<ExportSimulationRunExcelResult>(
      "export_simulation_run_excel",
      { input },
    );
    return { ok: true, result };
  } catch (error) {
    const rawMessage =
      typeof error === "string"
        ? error
        : error instanceof Error
          ? error.message
          : GENERIC_FAILURE_MESSAGE;
    const cancelled = isCancelledMessage(rawMessage);
    const message = sanitizeReturnedMessage(
      rawMessage || GENERIC_FAILURE_MESSAGE,
      input.password,
    );
    return cancelled
      ? { ok: false, message, cancelled: true }
      : { ok: false, message };
  }
}

/**
 * Ouvre le sélecteur de destination Windows pour un classeur `.xlsx`.
 * Renvoie `null` si l’utilisateur annule.
 */
export async function pickExcelSavePath(
  defaultFileName: string,
): Promise<string | null> {
  const selected = await save({
    title: "Enregistrer le rapport RH",
    defaultPath: defaultFileName,
    filters: [{ name: "Excel Workbook", extensions: ["xlsx"] }],
  });
  return selected ?? null;
}
