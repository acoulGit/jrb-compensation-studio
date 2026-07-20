/**
 * Contrat de calcul annuel / mensuel (correctif Lot 2A-H1).
 *
 * Le budget cible est le coût ANNUEL des augmentations de salaire de base
 * pour 12 mois complets, hors charges patronales.
 * Les salaires importés, S0 et le nouveau salaire sont MENSUELS.
 * L’arrondi s’applique uniquement à l’augmentation mensuelle individuelle.
 */

/** Version du contrat de calcul (empreintes / compatibilité). */
export const CALCULATION_CONTRACT_VERSION = 2 as const;

/** Période budgétaire annuelle fixe pour ce MVP (mois). */
export const ANNUAL_BUDGET_PERIOD_MONTHS = 12n;

/** Charges patronales exclues du budget cible. */
export const EMPLOYER_CHARGES_INCLUDED = false;

/**
 * Version du schéma sémantique des snapshots persistés.
 * v1 = sémantique obsolète (budget traité comme mensuel) — ne pas recalculer.
 * v2 = sémantique annuelle/mensuelle corrigée.
 */
export const RESULT_SCHEMA_VERSION = 2 as const;

export const RESULT_SCHEMA_VERSION_LEGACY = 1 as const;
