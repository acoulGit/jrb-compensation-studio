/**
 * Période d’effet configurable de campagne (Lot 2A-H2D-1).
 *
 * Le budget cible finance la période [retroactivityStartMonth … décembre].
 * Le mois d’application technique sépare rappel et paiement direct.
 */

import { CompensationCalculationError } from "./errors";

/** Nombre de mois d’une année civile complète (indicateur plein effet). */
export const FULL_YEAR_MONTH_COUNT = 12;

const MONTH_LABELS_FR = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
] as const;

function monthLabelFr(month: number): string {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return String(month);
  }
  return MONTH_LABELS_FR[month - 1]!;
}

export interface CampaignPeriodInput {
  campaignYear: number;
  retroactivityStartMonth: number;
  technicalApplicationMonth: number;
}

export interface CampaignPeriodBreakdown {
  campaignYear: number;
  retroactivityStartMonth: number;
  technicalApplicationMonth: number;
  /** 13 − retroactivityStartMonth */
  campaignCoveredMonthCount: number;
  /** technicalApplicationMonth − retroactivityStartMonth (≥ 0) */
  reminderMonthCount: number;
  /** 13 − technicalApplicationMonth (≥ 1) */
  directPaymentMonthCount: number;
}

export function validateRetroactivityStartMonth(month: number): void {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new CompensationCalculationError(
      "INVALID_RETROACTIVITY_START_MONTH",
      "Le mois de début de rétroactivité doit être un entier entre 1 (janvier) et 12 (décembre).",
    );
  }
}

export function validateCampaignPeriod(input: CampaignPeriodInput): void {
  if (
    !Number.isInteger(input.campaignYear) ||
    input.campaignYear < 2000 ||
    input.campaignYear > 2100
  ) {
    throw new CompensationCalculationError(
      "INVALID_CAMPAIGN_YEAR",
      "L’année de campagne doit être un entier entre 2000 et 2100.",
    );
  }
  validateRetroactivityStartMonth(input.retroactivityStartMonth);
  if (
    !Number.isInteger(input.technicalApplicationMonth) ||
    input.technicalApplicationMonth < 1 ||
    input.technicalApplicationMonth > 12
  ) {
    throw new CompensationCalculationError(
      "INVALID_TECHNICAL_APPLICATION_MONTH",
      "Le mois d’application technique doit être un entier entre 1 (janvier) et 12 (décembre).",
    );
  }
  if (input.retroactivityStartMonth > input.technicalApplicationMonth) {
    throw new CompensationCalculationError(
      "RETROACTIVITY_MONTH_AFTER_APPLICATION_MONTH",
      `Le début de rétroactivité (${monthLabelFr(input.retroactivityStartMonth)}) ne peut pas être postérieur au mois d’application technique (${monthLabelFr(input.technicalApplicationMonth)}).`,
    );
  }
}

export function computeCampaignPeriodBreakdown(
  input: CampaignPeriodInput,
): CampaignPeriodBreakdown {
  validateCampaignPeriod(input);
  const campaignCoveredMonthCount = 13 - input.retroactivityStartMonth;
  const reminderMonthCount =
    input.technicalApplicationMonth - input.retroactivityStartMonth;
  const directPaymentMonthCount = 13 - input.technicalApplicationMonth;

  if (
    reminderMonthCount + directPaymentMonthCount !==
    campaignCoveredMonthCount
  ) {
    throw new CompensationCalculationError(
      "APPLICATION_CALENDAR_INVARIANT_FAILED",
      "Incohérence période : rappel + paiement direct ≠ mois couverts.",
    );
  }

  return {
    campaignYear: input.campaignYear,
    retroactivityStartMonth: input.retroactivityStartMonth,
    technicalApplicationMonth: input.technicalApplicationMonth,
    campaignCoveredMonthCount,
    reminderMonthCount,
    directPaymentMonthCount,
  };
}

/** Mois inclus dans la période budgétaire [retro … décembre]. */
export function isMonthInCampaignPeriod(
  month: number,
  retroactivityStartMonth: number,
): boolean {
  return month >= retroactivityStartMonth && month <= FULL_YEAR_MONTH_COUNT;
}

/**
 * Mois où le plancher du minimum garanti s’applique (Lot 2B-RC1-H4).
 * Borne inférieure = max(rétroactivité générale, mois d’effet du minimum).
 * Un mois d’effet configuré avant la rétroactivité ne crée aucune période hors campagne.
 */
export function isMonthCoveredByMinimumGuarantee(
  month: number,
  retroactivityStartMonth: number,
  minimumGuaranteeEffectiveMonth: number,
): boolean {
  const start = Math.max(
    retroactivityStartMonth,
    minimumGuaranteeEffectiveMonth,
  );
  return month >= start && month <= FULL_YEAR_MONTH_COUNT;
}

/**
 * Début budgétaire d’une promotion incluse :
 * max(rétroactivité, mois d’effet effectif). Promotion N-1 → effet dès janvier.
 */
export function computePromotionBudgetStartMonth(input: {
  retroactivityStartMonth: number;
  isPreviousYearPromotion: boolean;
  promotionMonth: number;
}): number {
  const effectivePromotionMonth = input.isPreviousYearPromotion
    ? 1
    : input.promotionMonth;
  return Math.max(input.retroactivityStartMonth, effectivePromotionMonth);
}

/** Nombre de mois de coût promo imputables sur la période de campagne. */
export function computePromotionCampaignPeriodMonthCount(input: {
  includedInSimulation: boolean;
  retroactivityStartMonth: number;
  isPreviousYearPromotion: boolean;
  promotionMonth: number;
}): number {
  if (!input.includedInSimulation) {
    return 0;
  }
  const budgetStart = computePromotionBudgetStartMonth(input);
  return Math.max(0, 13 - budgetStart);
}
