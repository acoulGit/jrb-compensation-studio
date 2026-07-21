/**
 * Contrat de calcul de campagne (Lot 2A-H1 → Lot 2A-H2D-2).
 *
 * v2 : budget cible = coût annuel 12 mois (rétroactivité implicite janvier).
 * v3 : période budgétaire configurable via `retroactivityStartMonth`.
 * v4 : minimum garanti d’augmentation optionnel (modes exclusifs) ;
 *      réservation du coût plancher avant allocation du reliquat ;
 *      promotion comprise dans l’atteinte du minimum.
 *
 * Les salaires importés, S0 et le nouveau salaire restent MENSUELS.
 * L’arrondi s’applique uniquement à l’augmentation mensuelle individuelle
 * (sauf plafond ceil du plancher minimum).
 */

/** Version du contrat de calcul (empreintes / compatibilité). */
export const CALCULATION_CONTRACT_VERSION = 4 as const;

/**
 * Nombre de mois d’une année civile complète (indicateur plein effet).
 * Ne signifie PAS que le budget cible couvre nécessairement 12 mois.
 */
export const FULL_YEAR_MONTH_COUNT = 12;

/**
 * @deprecated Compatibilité transitoire — préférer `FULL_YEAR_MONTH_COUNT`.
 */
export const ANNUAL_BUDGET_PERIOD_MONTHS = BigInt(FULL_YEAR_MONTH_COUNT);

/** Charges patronales exclues du budget cible. */
export const EMPLOYER_CHARGES_INCLUDED = false;

/**
 * Version du schéma sémantique des snapshots persistés.
 * v1 = sémantique obsolète — ne pas recalculer.
 * v2 = sémantique annuelle/mensuelle (contrats 2–3, rétro configurable),
 *      SANS trajectoire mensuelle persistée ni champs ancienneté/minimum.
 * v3 = consolidation du contrat v4 (migration 0007) : rétroactivité,
 *      incidence d'ancienneté, minimum garanti et trajectoire mensuelle
 *      (12 mois) persistés fidèlement, sans recalcul.
 *
 * Règle de compatibilité d'écriture : un résultat contrat ≥ 3 exige schema ≥ 3
 * (voir `assertSimulationResultPersistable`). Les snapshots v1/v2 restent
 * lisibles mais ne doivent pas être réinterprétés avec le modèle v3.
 */
export const RESULT_SCHEMA_VERSION = 3 as const;

/** Version de schéma précédente (annuelle/mensuelle, sans mois persistés). */
export const RESULT_SCHEMA_VERSION_V2 = 2 as const;

export const RESULT_SCHEMA_VERSION_LEGACY = 1 as const;
