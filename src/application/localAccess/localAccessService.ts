/**
 * Invocation des commandes Tauri d’accès local (Lot 2B-RC1-SEC1-A).
 *
 * Aucun mot de passe n’est journalisé. Les erreurs renvoyées par le backend
 * sont déjà des messages en français prêts à afficher (jamais de secret ni de
 * détail technique).
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  ChangeLocalPasswordInput,
  LocalAccessOutcome,
  LocalAccessStatusDto,
  LocalAccessVoidOutcome,
  SetupLocalAccessInput,
  UnlockLocalAccessInput,
} from "./localAccessModels";

const GENERIC_FAILURE_MESSAGE = "L’opération a échoué. Réessayez.";

function extractMessage(error: unknown): string {
  if (typeof error === "string" && error.trim().length > 0) return error;
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return GENERIC_FAILURE_MESSAGE;
}

export async function getLocalAccessStatus(): Promise<LocalAccessStatusDto> {
  return invoke<LocalAccessStatusDto>("get_local_access_status");
}

export async function setupLocalAccess(
  input: SetupLocalAccessInput,
): Promise<LocalAccessOutcome> {
  try {
    const status = await invoke<LocalAccessStatusDto>("setup_local_access", { input });
    return { ok: true, status };
  } catch (error) {
    return { ok: false, message: extractMessage(error) };
  }
}

export async function unlockLocalAccess(
  input: UnlockLocalAccessInput,
): Promise<LocalAccessOutcome> {
  try {
    const status = await invoke<LocalAccessStatusDto>("unlock_local_access", { input });
    return { ok: true, status };
  } catch (error) {
    return { ok: false, message: extractMessage(error) };
  }
}

export async function changeLocalPassword(
  input: ChangeLocalPasswordInput,
): Promise<LocalAccessVoidOutcome> {
  try {
    await invoke<void>("change_local_password", { input });
    return { ok: true };
  } catch (error) {
    return { ok: false, message: extractMessage(error) };
  }
}

export async function lockLocalAccess(): Promise<LocalAccessVoidOutcome> {
  try {
    await invoke<void>("lock_local_access");
    return { ok: true };
  } catch (error) {
    return { ok: false, message: extractMessage(error) };
  }
}
