/**
 * Types partagés avec les commandes Tauri d’accès local (Lot 2B-RC1-SEC1-A).
 *
 * `LocalAccessStatusDto` ne contient jamais de secret (ni mot de passe, ni
 * hachage) : uniquement ce qui est nécessaire pour choisir l’écran d’accès à
 * afficher (configuration initiale, saisie du mot de passe, période expirée
 * ou anomalie d’horloge détectée).
 */

export interface LocalAccessStatusDto {
  isSetUp: boolean;
  isUnlocked: boolean;
  isExpired: boolean;
  clockAnomalyDetected: boolean;
  installationId: string | null;
  initialValidUntil: string | null;
  currentValidUntil: string | null;
  /** Jours restants avant expiration ; `null` si non calculable. */
  remainingDays: number | null;
}

export interface SetupLocalAccessInput {
  password: string;
  passwordConfirmation: string;
}

export interface UnlockLocalAccessInput {
  password: string;
}

export interface ChangeLocalPasswordInput {
  oldPassword: string;
  newPassword: string;
  newPasswordConfirmation: string;
}

export type LocalAccessOutcome =
  | { ok: true; status: LocalAccessStatusDto }
  | { ok: false; message: string };

export type LocalAccessVoidOutcome = { ok: true } | { ok: false; message: string };
