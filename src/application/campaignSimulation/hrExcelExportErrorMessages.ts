/**
 * Messages et validation frontend de l’export Excel RH (Lot 2B-E1).
 *
 * Les messages reflètent les erreurs françaises renvoyées par le backend Rust
 * (Result Err String). Aucune fonction ne journalise ni ne renvoie un mot de
 * passe : `looksLikePasswordLeak` sert de garde-fou défensif.
 */

import { MIN_PASSWORD_LENGTH } from "./hrExcelExportModels";

/** Indication pour un snapshot v2 (incomplet vs contrat courant). */
export const EXPORT_V2_DISABLED_HINT =
  "Export indisponible : cette simulation a été enregistrée avant la persistance complète de la trajectoire mensuelle. Relancez la simulation pour produire un snapshot exportable.";

/** Indication pour un snapshot v1 (contrat de calcul incompatible). */
export const EXPORT_V1_DISABLED_HINT =
  "Export indisponible : cette simulation repose sur un ancien contrat de calcul incompatible avec l’export RH. Relancez la simulation.";

/** Indication pour un schéma inconnu (refus par prudence). */
export const EXPORT_UNKNOWN_DISABLED_HINT =
  "Export indisponible : cette simulation utilise un schéma de résultat non reconnu.";

/** Avertissement affiché lorsqu’un export non protégé est envisagé. */
export const EXPORT_UNPROTECTED_WARNING =
  "Ce fichier contient des données salariales confidentielles.";

/** Messages de validation des champs mot de passe (côté client). */
export const EXPORT_PASSWORD_EMPTY_MESSAGE =
  "Un mot de passe est requis pour un export protégé.";
export const EXPORT_PASSWORD_WHITESPACE_MESSAGE =
  "Le mot de passe ne peut pas être composé uniquement d’espaces.";
export const EXPORT_PASSWORD_TOO_SHORT_MESSAGE = `Le mot de passe de protection doit comporter au moins ${MIN_PASSWORD_LENGTH} caractères.`;
export const EXPORT_PASSWORD_MISMATCH_MESSAGE =
  "La confirmation du mot de passe ne correspond pas.";
export const EXPORT_UNPROTECTED_CONFIRMATION_MESSAGE =
  "Confirmez l’export sans protection pour continuer.";

/** Motifs indiquant que le backend a signalé une annulation. */
const CANCELLED_PATTERNS = [/annul/i, /cancel/i];

/** Détecte si un message d’erreur correspond à une annulation. */
export function isCancelledMessage(message: string): boolean {
  return CANCELLED_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Garde-fou défensif : indique si une chaîne ressemble à une fuite de mot de
 * passe. Le backend ne renvoie jamais le mot de passe ; cette fonction protège
 * contre une régression accidentelle avant affichage.
 */
export function looksLikePasswordLeak(
  candidate: string,
  password: string | null | undefined,
): boolean {
  if (!password) return false;
  const trimmed = password.trim();
  if (trimmed.length < MIN_PASSWORD_LENGTH) return false;
  return candidate.includes(trimmed);
}

export interface ValidateExportPasswordOptionsInput {
  protect: boolean;
  password: string;
  confirmation: string;
}

export type ValidateExportPasswordResult =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Valide les champs mot de passe avant appel de l’export.
 *
 * Lorsque `protect` est faux, la validation des champs mot de passe est sans
 * objet (la confirmation d’export non protégé est gérée séparément).
 */
export function validateExportPasswordOptions(
  input: ValidateExportPasswordOptionsInput,
): ValidateExportPasswordResult {
  if (!input.protect) {
    return { ok: true };
  }

  const { password, confirmation } = input;

  if (password.length === 0) {
    return { ok: false, message: EXPORT_PASSWORD_EMPTY_MESSAGE };
  }
  if (password.trim().length === 0) {
    return { ok: false, message: EXPORT_PASSWORD_WHITESPACE_MESSAGE };
  }
  if (Array.from(password).length < MIN_PASSWORD_LENGTH) {
    return { ok: false, message: EXPORT_PASSWORD_TOO_SHORT_MESSAGE };
  }
  if (password !== confirmation) {
    return { ok: false, message: EXPORT_PASSWORD_MISMATCH_MESSAGE };
  }

  return { ok: true };
}
