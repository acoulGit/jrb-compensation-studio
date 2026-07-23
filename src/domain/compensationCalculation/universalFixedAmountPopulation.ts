/**
 * Population du forfait social universel (Lot 2B-RC1-H5).
 *
 * Réutilise les indicateurs de classification existants :
 * - population « payable » CDI/CDD + statuts actifs (même base que le minimum) ;
 * - ancienneté minimale propre, évaluée en mois calendaires révolus à une
 *   **date de référence configurable** (défaut = 31/12 N−1).
 *
 * N’exclut PAS un salarié uniquement parce que sa matrice vaut 0 % /
 * qu’il n’atteint pas le seuil d’ancienneté matriciel (12 mois).
 */

import {
  MINIMUM_INCREASE_ELIGIBLE_CONTRACT_TYPES,
  MINIMUM_INCREASE_POPULATION_STATUSES,
} from "./minimumIncreasePopulation";
import type { PromotionBudgetEmploymentStatus } from "./promotionBudgetPopulation";
import { parseHireDateIso, type ParsedHireDate } from "./seniorityImpact";
import { CompensationCalculationError } from "./errors";

/**
 * Contrat forfait social universel (Lot 2B-RC1-H5).
 * v2 : date de référence d’ancienneté configurable.
 */
export const UNIVERSAL_FIXED_AMOUNT_CONTRACT_VERSION = 2 as const;

/** Contrat v1 (ancienneté figée au 31/12 N−1). */
export const UNIVERSAL_FIXED_AMOUNT_CONTRACT_VERSION_V1 = 1 as const;

export type UniversalFixedAmountExclusionReason =
  | "MISSING_CONTRACT_TYPE"
  | "CONTRACT_TYPE_EXCLUDED"
  | "EMPLOYMENT_STATUS_EXCLUDED"
  | "INSUFFICIENT_SENIORITY"
  | null;

export interface UniversalFixedAmountPopulationInput {
  contractType?: string | null;
  employmentStatus?: PromotionBudgetEmploymentStatus | string | null;
  hireDate: string;
  /**
   * Date de référence ISO `YYYY-MM-DD` pour l’ancienneté.
   * Indépendante du mois d’effet budgétaire du forfait.
   */
  seniorityReferenceDate: string;
  /** Ancienneté minimale requise en mois (≥ 0). */
  minimumSeniorityMonths: number;
}

/**
 * Défaut métier : 31 décembre de l’année précédant la campagne.
 * Ex. campagne 2026 → `2025-12-31`. Jamais `Date.now()`.
 */
export function defaultUniversalFixedAmountSeniorityReferenceDate(
  campaignYear: number,
): string {
  if (!Number.isInteger(campaignYear) || campaignYear < 2000 || campaignYear > 2100) {
    throw new CompensationCalculationError(
      "INVALID_CAMPAIGN_YEAR",
      "L’année de campagne doit être un entier entre 2000 et 2100.",
    );
  }
  return `${campaignYear - 1}-12-31`;
}

/**
 * Résout la date de référence : explicite si fournie, sinon défaut 31/12 N−1.
 * Utilisé pour la compatibilité des snapshots / configs sans champ.
 */
export function resolveUniversalFixedAmountSeniorityReferenceDate(input: {
  campaignYear: number;
  seniorityReferenceDate?: string | null;
}): { date: string; origin: "explicit" | "legacy_default_december_n_minus_1" } {
  if (
    input.seniorityReferenceDate !== undefined &&
    input.seniorityReferenceDate !== null &&
    String(input.seniorityReferenceDate).trim() !== ""
  ) {
    const date = String(input.seniorityReferenceDate).trim();
    parseSeniorityReferenceDateIso(date);
    return { date, origin: "explicit" };
  }
  return {
    date: defaultUniversalFixedAmountSeniorityReferenceDate(input.campaignYear),
    origin: "legacy_default_december_n_minus_1",
  };
}

/** Parse et valide une date de référence ISO YYYY-MM-DD (déterministe). */
export function parseSeniorityReferenceDateIso(
  raw: string | null | undefined,
): ParsedHireDate {
  try {
    return parseHireDateIso(raw);
  } catch (error) {
    if (error instanceof CompensationCalculationError) {
      throw new CompensationCalculationError(
        "INVALID_UNIVERSAL_FIXED_AMOUNT_SENIORITY_REFERENCE_DATE",
        "La date de référence de l’ancienneté du forfait doit être au format ISO YYYY-MM-DD.",
      );
    }
    throw error;
  }
}

/**
 * Ancienneté en mois calendaires révolus à une date de référence ISO.
 */
export function seniorityMonthsAtReferenceDate(
  hireDate: string,
  seniorityReferenceDate: string,
): number {
  const hire = parseHireDateIso(hireDate);
  const ref = parseSeniorityReferenceDateIso(seniorityReferenceDate);
  return seniorityMonthsAtReferenceDateFromParsed(hire, ref);
}

export function seniorityMonthsAtReferenceDateFromParsed(
  hire: ParsedHireDate,
  ref: ParsedHireDate,
): number {
  let months = (ref.year - hire.year) * 12 + (ref.month - hire.month);
  if (ref.day < hire.day) {
    months -= 1;
  }
  return months < 0 ? 0 : months;
}

/**
 * @deprecated Préférer `seniorityMonthsAtReferenceDate` avec date explicite.
 * Conservé pour compatibilité des appels H5 initiaux (31/12 N−1).
 */
export function seniorityMonthsAtDecemberNMinus1(
  hireDate: string,
  campaignYear: number,
): number {
  return seniorityMonthsAtReferenceDate(
    hireDate,
    defaultUniversalFixedAmountSeniorityReferenceDate(campaignYear),
  );
}

/**
 * Seuil d’ancienneté atteint à la date de référence.
 * `minimumSeniorityMonths === 0` → toujours vrai.
 */
export function hasUniversalFixedAmountSeniority(
  hireDate: string,
  seniorityReferenceDate: string,
  minimumSeniorityMonths: number,
): boolean {
  if (minimumSeniorityMonths <= 0) {
    return true;
  }
  return (
    seniorityMonthsAtReferenceDate(hireDate, seniorityReferenceDate) >=
    minimumSeniorityMonths
  );
}

export function resolveUniversalFixedAmountExclusionReason(
  input: UniversalFixedAmountPopulationInput,
): UniversalFixedAmountExclusionReason {
  if (
    input.contractType === undefined ||
    input.contractType === null ||
    input.contractType.trim() === ""
  ) {
    // Compat fixtures techniques sans contrat : inclus.
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

  if (
    !hasUniversalFixedAmountSeniority(
      input.hireDate,
      input.seniorityReferenceDate,
      input.minimumSeniorityMonths,
    )
  ) {
    return "INSUFFICIENT_SENIORITY";
  }

  return null;
}

export function isUniversalFixedAmountEligible(
  input: UniversalFixedAmountPopulationInput,
): boolean {
  return resolveUniversalFixedAmountExclusionReason(input) === null;
}
