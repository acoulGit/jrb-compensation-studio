/**
 * Contrat de calcul de campagne (Lot 2A-H1 → Lot 2A-H2D-1).
 *
 * v2 : budget cible = coût annuel 12 mois (rétroactivité implicite janvier).
 * v3 : période budgétaire configurable via `retroactivityStartMonth` ;
 *      le budget cible couvre [rétroactivité … décembre] ;
 *      distinction coût de campagne / coût à plein effet (décembre × 12).
 *
 * Les salaires importés, S0 et le nouveau salaire restent MENSUELS.
 * L’arrondi s’applique uniquement à l’augmentation mensuelle individuelle.
 */

/** Version du contrat de calcul (empreintes / compatibilité). */
export const CALCULATION_CONTRACT_VERSION = 3 as const;

/**
 * Nombre de mois d’une année civile complète (indicateur plein effet).
 * Ne signifie PAS que le budget cible couvre nécessairement 12 mois.
 */
export const FULL_YEAR_MONTH_COUNT = 12;

/**
 * @deprecated Compatibilité transitoire H2D-1 — préférer `FULL_YEAR_MONTH_COUNT`.
 * Ne pas interpréter comme « le budget couvre toujours 12 mois ».
 */
export const ANNUAL_BUDGET_PERIOD_MONTHS = BigInt(FULL_YEAR_MONTH_COUNT);

/** Charges patronales exclues du budget cible. */
export const EMPLOYER_CHARGES_INCLUDED = false;

/**
 * Version du schéma sémantique des snapshots persistés.
 * v1 = sémantique obsolète (budget traité comme mensuel) — ne pas recalculer.
 * v2 = sémantique annuelle/mensuelle corrigée (contrat 2, rétro janvier implicite).
 * Un résultat contrat 3 ne peut pas être sauvegardé en schema v2
 * (consolidation schema v3 requise — Lot ultérieur).
 */
export const RESULT_SCHEMA_VERSION = 2 as const;

export const RESULT_SCHEMA_VERSION_LEGACY = 1 as const;
