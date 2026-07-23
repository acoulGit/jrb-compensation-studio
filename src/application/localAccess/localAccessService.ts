/**
 * Invocation des commandes Tauri d’accès local (Lots SEC1-A / SEC1-B).
 *
 * Aucun mot de passe ni code de licence n’est journalisé. Les erreurs
 * renvoyées par le backend sont déjà des messages en français prêts à
 * afficher (jamais de secret ni de détail cryptographique).
 */

import { invoke } from "@tauri-apps/api/core";
import type {
  ActivateOfflineLicenseInput,
  ChangeLocalPasswordInput,
  LicenseActivationDto,
  LicenseActivationOutcome,
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

export async function activateOfflineLicense(
  input: ActivateOfflineLicenseInput,
): Promise<LicenseActivationOutcome> {
  try {
    const activation = await invoke<LicenseActivationDto>("activate_offline_license", {
      input,
    });
    return { ok: true, activation };
  } catch (error) {
    return { ok: false, message: extractMessage(error) };
  }
}
