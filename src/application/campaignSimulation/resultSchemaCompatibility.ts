/**
 * Compatibilité des snapshots persistés (result_schema_version) —
 * Lot 2B-P1 / 2B-RC1-H1 / H2 / H4.
 * v6 = courant (contrat v8, mois d’effet explicite du minimum garanti).
 * v5 = présentable (contrats v6–v7, minimum aligné historiquement sur la rétro).
 * v4 = présentable (contrat v5, neutralisation 9-Box à facteur 1).
 * v3 = présentable (contrat v4 consolidé, mois persistés — sans champs 9-Box v4/v5).
 * v2 = incomplet (annuel/mensuel sans mois ni ancienneté/minimum persistés).
 * v1 = incompatible (sémantique obsolète — ne pas recalculer).
 * autre = inconnu (refus par prudence).
 */

import {
  RESULT_SCHEMA_VERSION,
  RESULT_SCHEMA_VERSION_LEGACY,
  RESULT_SCHEMA_VERSION_V2,
  RESULT_SCHEMA_VERSION_V3,
  RESULT_SCHEMA_VERSION_V4,
  RESULT_SCHEMA_VERSION_V5,
} from "../../domain/compensationCalculation";

export type ResultSchemaCompatibility =
  | "current"
  | "incomplete"
  | "incompatible"
  | "unknown";

export function classifyResultSchemaVersion(
  version: number,
): ResultSchemaCompatibility {
  if (
    version === RESULT_SCHEMA_VERSION ||
    version === RESULT_SCHEMA_VERSION_V5 ||
    version === RESULT_SCHEMA_VERSION_V4 ||
    version === RESULT_SCHEMA_VERSION_V3
  ) {
    return "current";
  }
  if (version === RESULT_SCHEMA_VERSION_V2) return "incomplete";
  if (version === RESULT_SCHEMA_VERSION_LEGACY) return "incompatible";
  return "unknown";
}

export function isCurrentResultSchemaVersion(version: number): boolean {
  return version === RESULT_SCHEMA_VERSION;
}

export function isLegacyResultSchemaVersion(version: number): boolean {
  return version === RESULT_SCHEMA_VERSION_LEGACY;
}

/** Un snapshot peut-il être présenté (v3–v6) ? */
export function canPresentResultSchemaVersion(version: number): boolean {
  return (
    version === RESULT_SCHEMA_VERSION ||
    version === RESULT_SCHEMA_VERSION_V5 ||
    version === RESULT_SCHEMA_VERSION_V4 ||
    version === RESULT_SCHEMA_VERSION_V3
  );
}

/** Message utilisateur pour un snapshot version 1 (ancien contrat). */
export const LEGACY_RESULT_SCHEMA_MESSAGE =
  "Snapshot créé avec un ancien contrat de calcul. Relancez la simulation pour produire un résultat actuel.";

/** Message utilisateur pour un snapshot version 2 (incomplet vs v3/v4). */
export const INCOMPLETE_RESULT_SCHEMA_MESSAGE =
  "Snapshot créé avant la persistance complète de la période configurable, des promotions, du minimum garanti et des incidences d’ancienneté. Relancez la simulation pour produire un historique complet.";

/** Message utilisateur pour un schéma inconnu (refus). */
export const UNKNOWN_RESULT_SCHEMA_MESSAGE =
  "Cette simulation enregistrée utilise un schéma non reconnu. Elle ne peut pas être affichée en toute sécurité.";

/** Message associé au statut de compatibilité (null si présentable courant). */
export function resultSchemaCompatibilityMessage(
  version: number,
): string | null {
  switch (classifyResultSchemaVersion(version)) {
    case "current":
      return null;
    case "incomplete":
      return INCOMPLETE_RESULT_SCHEMA_MESSAGE;
    case "incompatible":
      return LEGACY_RESULT_SCHEMA_MESSAGE;
    case "unknown":
    default:
      return UNKNOWN_RESULT_SCHEMA_MESSAGE;
  }
}
