/**
 * Population de consommation du budget promotion (Lot 2A-H2C-2).
 *
 * Un salarié ne consomme le budget promotion que s'il appartient à une
 * population de paie « active » au sens large (statuts payables). Les
 * statuts départ / suspension / disponibilité hors groupe / autre sont
 * exclus, même si une promotion structurée est rattachée à leur dossier.
 *
 * Fallback `status absent → actif` : réservé aux fixtures techniques et aux
 * entrées préparées héritées. L’import RH (Lot 1C) impose un statut
 * d’emploi obligatoire sur chaque ligne persistée ; ce fallback ne doit
 * donc pas masquer une donnée invalide en production.
 */

export type PromotionBudgetEmploymentStatus =
  | "active"
  | "group_detachment"
  | "legal_leave"
  | "external_availability"
  | "suspended"
  | "departed"
  | "other";

export const PROMOTION_BUDGET_EMPLOYMENT_STATUSES: readonly PromotionBudgetEmploymentStatus[] =
  [
    "active",
    "group_detachment",
    "legal_leave",
    "external_availability",
    "suspended",
    "departed",
    "other",
  ] as const;

/** Statuts payables consommant le budget promotion. */
export const PROMOTION_BUDGET_POPULATION_STATUSES: readonly PromotionBudgetEmploymentStatus[] =
  ["active", "group_detachment", "legal_leave"] as const;

/**
 * Détermine si un salarié appartient à la population de consommation du
 * budget promotion. Statut absent (undefined/null) → traité comme actif.
 */
export function isPromotionBudgetPopulationEmployee(input: {
  employmentStatus?: PromotionBudgetEmploymentStatus | string | null;
}): boolean {
  if (input.employmentStatus === undefined || input.employmentStatus === null) {
    return true;
  }
  return (PROMOTION_BUDGET_POPULATION_STATUSES as readonly string[]).includes(
    input.employmentStatus,
  );
}
