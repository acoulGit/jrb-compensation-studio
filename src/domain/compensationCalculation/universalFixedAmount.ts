/**
 * Forfait social universel (Lot 2B-RC1-H5).
 *
 * Montant fixe additif mensuel — jamais un plancher.
 * `augmentationTotale = augmentationMatricielle + forfait (+ autres composantes)`.
 */

import { CompensationCalculationError } from "./errors";
import { isMonthCoveredByUniversalFixedAmount } from "./campaignPeriod";
import {
  UNIVERSAL_FIXED_AMOUNT_CONTRACT_VERSION,
  parseSeniorityReferenceDateIso,
} from "./universalFixedAmountPopulation";

export { UNIVERSAL_FIXED_AMOUNT_CONTRACT_VERSION };

export interface UniversalFixedAmountPolicy {
  /** Montant mensuel FCFA (≥ 0). */
  monthlyAmountFcfa: bigint;
  /** Mois d’effet (1–12), indépendant du mois d’effet du minimum garanti. */
  effectiveMonth: number;
  /** Ancienneté minimale en mois (≥ 0). Défaut métier = 0. */
  minimumSeniorityMonths: number;
  /**
   * Date de référence ISO `YYYY-MM-DD` pour l’éligibilité d’ancienneté.
   * Indépendante du mois d’effet (incidence budgétaire seule).
   * Défaut métier = 31/12/(N−1).
   */
  seniorityReferenceDate: string;
}

/** Politique inactive (mécanisme social ≠ forfait). */
export const NO_UNIVERSAL_FIXED_AMOUNT_POLICY: UniversalFixedAmountPolicy = {
  monthlyAmountFcfa: 0n,
  effectiveMonth: 1,
  minimumSeniorityMonths: 0,
  seniorityReferenceDate: "2000-12-31",
};

export function validateUniversalFixedAmountPolicy(
  policy: UniversalFixedAmountPolicy,
): void {
  if (typeof policy.monthlyAmountFcfa !== "bigint") {
    throw new CompensationCalculationError(
      "INVALID_UNIVERSAL_FIXED_AMOUNT",
      "Le montant du forfait social universel doit être un BigInt FCFA.",
    );
  }
  if (policy.monthlyAmountFcfa < 0n) {
    throw new CompensationCalculationError(
      "INVALID_UNIVERSAL_FIXED_AMOUNT",
      "Le montant du forfait social universel ne peut pas être négatif.",
    );
  }
  if (
    !Number.isInteger(policy.effectiveMonth) ||
    policy.effectiveMonth < 1 ||
    policy.effectiveMonth > 12
  ) {
    throw new CompensationCalculationError(
      "INVALID_UNIVERSAL_FIXED_AMOUNT_EFFECTIVE_MONTH",
      "Le mois d’effet du forfait social universel doit être compris entre janvier et décembre.",
    );
  }
  if (
    !Number.isInteger(policy.minimumSeniorityMonths) ||
    policy.minimumSeniorityMonths < 0
  ) {
    throw new CompensationCalculationError(
      "INVALID_UNIVERSAL_FIXED_AMOUNT_MINIMUM_SENIORITY",
      "L’ancienneté minimale du forfait social universel doit être un entier ≥ 0.",
    );
  }
  if (
    typeof policy.seniorityReferenceDate !== "string" ||
    policy.seniorityReferenceDate.trim() === ""
  ) {
    throw new CompensationCalculationError(
      "MISSING_UNIVERSAL_FIXED_AMOUNT_SENIORITY_REFERENCE_DATE",
      "La date de référence de l’ancienneté du forfait social universel est obligatoire.",
    );
  }
  parseSeniorityReferenceDateIso(policy.seniorityReferenceDate.trim());
}

/**
 * Montant mensuel du forfait pour un salarié / mois donné.
 * 0 si non éligible, hors couverture, ou politique inactive.
 */
export function computeUniversalFixedAmountForMonth(input: {
  policy: UniversalFixedAmountPolicy;
  isEligible: boolean;
  month: number;
  retroactivityStartMonth: number;
  /** false = mécanisme social ≠ forfait (aucun effet). */
  isActive: boolean;
}): bigint {
  if (!input.isActive || !input.isEligible) {
    return 0n;
  }
  validateUniversalFixedAmountPolicy(input.policy);
  if (
    !isMonthCoveredByUniversalFixedAmount(
      input.month,
      input.retroactivityStartMonth,
      input.policy.effectiveMonth,
    )
  ) {
    return 0n;
  }
  return input.policy.monthlyAmountFcfa;
}

/** Nombre de mois d’incidence budgétaire du forfait (convention H4). */
export function universalFixedAmountCoveredMonthCount(input: {
  retroactivityStartMonth: number;
  effectiveMonth: number;
}): number {
  const start = Math.max(input.retroactivityStartMonth, input.effectiveMonth);
  if (start > 12) {
    return 0;
  }
  return 13 - start;
}
