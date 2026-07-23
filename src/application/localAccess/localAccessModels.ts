/**
 * Types partagés avec les commandes Tauri d’accès local (Lots SEC1-A / SEC1-B).
 *
 * Aucun secret (mot de passe, hachage, signature, clé) n’est exposé ici.
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
  /** True si l’écran d’activation / le renouvellement est pertinent. */
  canActivateLicense: boolean;
  lastLicenseId: string | null;
  lastLicenseActivatedAt: string | null;
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

export interface ActivateOfflineLicenseInput {
  licenseCode: string;
}

export interface LicenseActivationDto {
  licenseId: string;
  durationMonths: number;
  previousValidUntil: string;
  newValidUntil: string;
  customer: string | null;
  activatedAt: string;
}

export type LocalAccessOutcome =
  | { ok: true; status: LocalAccessStatusDto }
  | { ok: false; message: string };

export type LocalAccessVoidOutcome = { ok: true } | { ok: false; message: string };

export type LicenseActivationOutcome =
  | { ok: true; activation: LicenseActivationDto }
  | { ok: false; message: string };
