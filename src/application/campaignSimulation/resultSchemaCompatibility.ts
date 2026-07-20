/**
 * Compatibilité des snapshots persistés (result_schema_version).
 * v1 = sémantique obsolète (ne pas présenter comme conforme H1).
 * v2 = sémantique annuelle/mensuelle corrigée.
 */

import {
  RESULT_SCHEMA_VERSION,
  RESULT_SCHEMA_VERSION_LEGACY,
} from "../../domain/compensationCalculation";

export function isCurrentResultSchemaVersion(version: number): boolean {
  return version === RESULT_SCHEMA_VERSION;
}

export function isLegacyResultSchemaVersion(version: number): boolean {
  return version === RESULT_SCHEMA_VERSION_LEGACY;
}

/** Message utilisateur pour un snapshot version 1 (non conforme H1). */
export const LEGACY_RESULT_SCHEMA_MESSAGE =
  "Cette simulation enregistrée utilise une sémantique de calcul obsolète (version 1). Elle ne doit pas être interprétée avec le modèle annuel/mensuel actuel. Aucun recalcul automatique n’est effectué.";
