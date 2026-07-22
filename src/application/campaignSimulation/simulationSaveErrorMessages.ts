/** Messages utilisateur pour les codes de sauvegarde (Lot 2B-4B). */

import type { SimulationPersistenceCode } from "./simulationPersistenceCodes";

const SAVE_ERROR_MESSAGES: Partial<Record<SimulationPersistenceCode, string>> = {
  SIMULATION_RESULT_NOT_AVAILABLE:
    "Aucun résultat de simulation réussi n’est disponible pour l’enregistrement.",
  SIMULATION_RESULT_STALE:
    "Le résultat de simulation est obsolète. Relancez le calcul avant d’enregistrer.",
  SIMULATION_RESULT_CAMPAIGN_MISMATCH:
    "Le résultat n’appartient pas à la campagne sélectionnée.",
  SIMULATION_CONFIGURATION_MISMATCH:
    "La configuration validée ne correspond plus au résultat à enregistrer.",
  SIMULATION_INPUTS_CHANGED_BEFORE_SAVE:
    "Les données sources ont changé depuis le calcul. Relancez la simulation avant d’enregistrer.",
  CAMPAIGN_ARCHIVED:
    "Une campagne archivée ne peut pas enregistrer une nouvelle simulation.",
  CURRENT_IMPORT_BATCH_CHANGED:
    "Le lot RH courant a changé depuis le calcul. Relancez la simulation avant d’enregistrer.",
  SIMULATION_SAVE_FAILED: "La simulation n’a pas pu être enregistrée.",
};

export function saveErrorMessageForCode(code: SimulationPersistenceCode): string {
  return SAVE_ERROR_MESSAGES[code] ?? "La simulation n’a pas pu être enregistrée.";
}
