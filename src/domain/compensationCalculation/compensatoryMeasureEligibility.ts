/**
 * Éligibilité à la mesure compensatoire (Lot 2A-H2C-2A).
 *
 * Réutilise exactement les règles documentées dans `docs/BUSINESS_RULES.md`
 * (§ Éligibilité) et le contrat de calcul (§ 3 — éligibilité individuelle) :
 * - CDI et CDD inclus ;
 * - intérimaires (`temporary`) et prestataires (`contractor`) exclus ;
 * - ancienneté minimale de 12 mois au 31 décembre N-1 ;
 * - gel des actions si disponibilité hors groupe (`external_availability`).
 *
 * Période d’essai : règle métier documentée, **non opérationalisée** ici faute
 * de champ d’import dédié (pas d’invention de date d’essai).
 *
 * Distinct de `isPromotionBudgetPopulationEmployee` : un salarié peut consommer
 * le budget promotion tout en étant inéligible au complément compensatoire.
 */

import { parseHireDateIso } from "./seniorityImpact";

export const COMPENSATORY_MEASURE_ELIGIBILITY_CONTRACT_VERSION = 1 as const;

/** Contrats éligibles à la mesure compensatoire (règles métier validées). */
export const COMPENSATORY_ELIGIBLE_CONTRACT_TYPES = ["cdi", "cdd"] as const;

export type CompensatoryEligibleContractType =
  (typeof COMPENSATORY_ELIGIBLE_CONTRACT_TYPES)[number];

export interface CompensatoryMeasureEligibilityInput {
  /**
   * Type de contrat importé. Absent/null : compatibilité fixtures techniques
   * (ne bloque pas) ; l’import RH réel fournit toujours un contrat obligatoire.
   */
  contractType?: string | null;
  /** Date d’embauche ISO `YYYY-MM-DD` (requis pour l’ancienneté au 31/12 N-1). */
  hireDate: string;
  /** Année de campagne N (explicite — jamais Date.now()). */
  campaignYear: number;
  /**
   * Statut d’emploi. `external_availability` gèle les actions (inéligible).
   * Absent/null : ne gèle pas (compat fixtures) ; l’import RH exige le statut.
   */
  employmentStatus?: string | null;
  /**
   * Override explicite (tests / préparation manuelle).
   * `false` force l’inéligibilité ; `true` / absent → évaluation des règles.
   */
  override?: boolean;
}

/**
 * Ancienneté ≥ 12 mois au 31 décembre N-1.
 * Équivalent : date d’embauche ≤ 31 décembre N-2.
 * Parse ISO déterministe (réutilise `parseHireDateIso`).
 */
export function hasMinimumSeniorityAtDecemberNMinus1(
  hireDate: string,
  campaignYear: number,
): boolean {
  const hire = parseHireDateIso(hireDate);
  const cutoffYear = campaignYear - 2;
  if (hire.year < cutoffYear) {
    return true;
  }
  if (hire.year > cutoffYear) {
    return false;
  }
  // Embauche au cours de N-2 : au 31/12 N-1 l’ancienneté est ≥ 12 mois.
  return true;
}

/**
 * Prédicat d’éligibilité à la mesure compensatoire.
 * Distinct de la population budgétaire promotion.
 */
export function isCompensatoryMeasureEligible(
  input: CompensatoryMeasureEligibilityInput,
): boolean {
  if (input.override === false) {
    return false;
  }

  if (input.employmentStatus === "external_availability") {
    return false;
  }

  if (
    input.contractType !== undefined &&
    input.contractType !== null &&
    input.contractType !== ""
  ) {
    const contract = input.contractType.trim().toLowerCase();
    if (
      !(COMPENSATORY_ELIGIBLE_CONTRACT_TYPES as readonly string[]).includes(
        contract,
      )
    ) {
      return false;
    }
  }

  if (!hasMinimumSeniorityAtDecemberNMinus1(input.hireDate, input.campaignYear)) {
    return false;
  }

  return true;
}
