/**
 * Génération d’un mot de passe RH robuste via la commande Tauri (Lot 2B-E1).
 *
 * Le mot de passe n’est JAMAIS journalisé. En cas d’échec de l’invocation,
 * un message générique est renvoyé (aucun détail technique sensible).
 */

import { invoke } from "@tauri-apps/api/core";
import type { GenerateHrExportPasswordResult } from "./hrExcelExportModels";

export type GenerateHrExportPasswordOutcome =
  | { ok: true; password: string; length: number }
  | { ok: false; message: string };

const GENERATE_FAILED_MESSAGE =
  "La génération du mot de passe a échoué. Saisissez un mot de passe manuellement.";

export async function generateHrExportPassword(): Promise<GenerateHrExportPasswordOutcome> {
  try {
    const result = await invoke<GenerateHrExportPasswordResult>(
      "generate_hr_export_password",
    );
    if (
      !result ||
      typeof result.password !== "string" ||
      result.password.length === 0
    ) {
      return { ok: false, message: GENERATE_FAILED_MESSAGE };
    }
    return {
      ok: true,
      password: result.password,
      length:
        typeof result.length === "number"
          ? result.length
          : Array.from(result.password).length,
    };
  } catch {
    return { ok: false, message: GENERATE_FAILED_MESSAGE };
  }
}
