/**
 * Contrat de calcul de campagne (Lot 2A-H1 → Lot 2B-RC1-H5).
 *
 * v2 : budget cible = coût annuel 12 mois (rétroactivité implicite janvier).
 * v3 : période budgétaire configurable via `retroactivityStartMonth`.
 * v4 : minimum garanti d’augmentation optionnel (modes exclusifs) ;
 *      réservation du coût plancher avant allocation du reliquat ;
 *      promotion comprise dans l’atteinte du minimum.
 * v5 : neutralisation individuelle de l’effet 9-Box (facteur effectif = 1) ;
 *      la sous-performance confirmée reste applicable.
 * v6 : même déclencheur d’import (`neutralizeNineBoxEffect`) applique le
 *      coefficient global « Performance à confirmer » (milli, défaut 900).
 * v7 : promotion salariale sans changement de grade autorisée
 *      (même grade ou grade après vide → conservation du grade d’origine).
 * v8 : mois d’effet configurable du minimum garanti
 *      (`minimumGuaranteeEffectiveMonth`) ; la part au-dessus du minimum
 *      conserve la rétroactivité générale.
 * v9 : mécanisme social exclusif (aucun / minimum garanti / forfait social
 *      universel) ; forfait additif avec mois d’effet et ancienneté propres ;
 *      budget résiduel matrice après réservation du forfait.
 *
 * Les salaires importés, S0 et le nouveau salaire restent MENSUELS.
 * L’arrondi s’applique uniquement à l’augmentation mensuelle individuelle
 * (sauf plafond ceil du plancher minimum).
 */

/** Version du contrat de calcul (empreintes / compatibilité). */
export const CALCULATION_CONTRACT_VERSION = 9 as const;

/** Contrat v8 (avant forfait social universel). */
export const CALCULATION_CONTRACT_VERSION_V8 = 8 as const;

/** Contrat v7 (avant mois d’effet configurable du minimum). */
export const CALCULATION_CONTRACT_VERSION_V7 = 7 as const;

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
 * v4 = contrat v5 (migration 0008) : neutralisation individuelle 9-Box
 *      (facteur = 1,000 ; traitement « Effet 9-Box neutralisé »).
 * v5 = contrats v6–v7 (migration 0009) : coefficient provisoire global
 *      « Performance à confirmer » ; structure promotion déjà capable de
 *      stocker un grade après identique au grade avant (contrat v7).
 * v6 = contrat v8 (migration 0012) : mois d’effet explicite du minimum
 *      garanti (`minimum_guarantee_effective_month`). Les snapshots v5
 *      restent lisibles ; leur mois d’effet historique se résout vers
 *      `retroactivityStartMonth` (jamais vers le mois technique).
 * v7 = contrat v9 (migration 0013) : mécanisme social exclusif + forfait
 *      social universel (montant, mois d’effet, ancienneté minimale) et
 *      champs individuels / agrégats associés. Les snapshots ≤ 6 restent
 *      lisibles ; mécanisme dérivé du mode de minimum si absent.
 *
 * Règle de compatibilité d'écriture : un résultat contrat ≥ 6 exige schema ≥ 5 ;
 * un résultat contrat ≥ 8 exige schema ≥ 6 ;
 * un résultat contrat ≥ 9 exige schema ≥ 7.
 * Les snapshots v1–v6 restent lisibles mais ne doivent pas être
 * réinterprétés avec le modèle v7 (pas de forfait inventé pour v6).
 * Contrat 6 et contrat 7 partagent le schema 5 (pas de migration structurelle
 * pour H3).
 */
export const RESULT_SCHEMA_VERSION = 7 as const;

/** Schema v6 (contrat v8, sans forfait social universel). */
export const RESULT_SCHEMA_VERSION_V6 = 6 as const;

/** Schema v5 (contrats v6–v7, sans mois d’effet minimum explicite). */
export const RESULT_SCHEMA_VERSION_V5 = 5 as const;

/** Schema v4 (contrat v5, neutralisation 9-Box à facteur 1). */
export const RESULT_SCHEMA_VERSION_V4 = 4 as const;

/** Schema v3 (contrat v4 consolidé, sans neutralisation 9-Box). */
export const RESULT_SCHEMA_VERSION_V3 = 3 as const;

/** Version de schéma annuelle/mensuelle, sans mois persistés. */
export const RESULT_SCHEMA_VERSION_V2 = 2 as const;

export const RESULT_SCHEMA_VERSION_LEGACY = 1 as const;
