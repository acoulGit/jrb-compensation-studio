/**
 * Population du minimum garanti d’augmentation (Lot 2A-H2D-2).
 *
 * Distinct de `isCompensatoryMeasureEligible` :
 * - pas d’exigence d’ancienneté ≥ 12 mois ;
 * - pas d’exclusion des sous-performants ;
 * - CDI/CDD + statuts payables uniquement.
 */

import type { PromotionBudgetEmploymentStatus } from "./promotionBudgetPopulation";

/** Contrat courant : mois d’effet configurable (Lot 2B-RC1-H4). */
export const MINIMUM_INCREASE_CONTRACT_VERSION = 2 as const;

/** Contrat historique (minimum aligné sur la rétroactivité générale). */
export const MINIMUM_INCREASE_CONTRACT_VERSION_V1 = 1 as const;

export const MINIMUM_INCREASE_ELIGIBLE_CONTRACT_TYPES = ["cdi", "cdd"] as const;

export type MinimumIncreaseEligibleContractType =
  (typeof MINIMUM_INCREASE_ELIGIBLE_CONTRACT_TYPES)[number];

export const MINIMUM_INCREASE_POPULATION_STATUSES: readonly PromotionBudgetEmploymentStatus[] =
  ["active", "group_detachment", "legal_leave"] as const;

export type MinimumIncreaseExclusionReason =
  | "MISSING_CONTRACT_TYPE"
  | "CONTRACT_TYPE_EXCLUDED"
  | "EMPLOYMENT_STATUS_EXCLUDED"
  | null;

export interface MinimumIncreasePopulationInput {
  contractType?: string | null;
  employmentStatus?: PromotionBudgetEmploymentStatus | string | null;
}

export function resolveMinimumIncreaseExclusionReason(
  input: MinimumIncreasePopulationInput,
): MinimumIncreaseExclusionReason {
  if (
    input.contractType === undefined ||
    input.contractType === null ||
    input.contractType.trim() === ""
  ) {
    // Compat fixtures techniques sans contrat : inclus (comme promo budget).
    // En production l’import RH impose le contrat.
  } else {
    const contract = input.contractType.trim().toLowerCase();
    if (
      !(MINIMUM_INCREASE_ELIGIBLE_CONTRACT_TYPES as readonly string[]).includes(
        contract,
      )
    ) {
      return "CONTRACT_TYPE_EXCLUDED";
    }
  }

  if (
    input.employmentStatus !== undefined &&
    input.employmentStatus !== null &&
    input.employmentStatus !== ""
  ) {
    if (
      !(MINIMUM_INCREASE_POPULATION_STATUSES as readonly string[]).includes(
        input.employmentStatus,
      )
    ) {
      return "EMPLOYMENT_STATUS_EXCLUDED";
    }
  }

  return null;
}

/**
 * Appartenance à la population du minimum garanti.
 * Statut absent → traité comme actif (compat fixtures).
 * Contrat absent → inclus (compat fixtures) ; sinon CDI/CDD uniquement.
 */
export function isMinimumIncreasePopulationEmployee(
  input: MinimumIncreasePopulationInput,
): boolean {
  return resolveMinimumIncreaseExclusionReason(input) === null;
}
