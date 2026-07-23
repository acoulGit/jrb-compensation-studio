/**
 * Calendrier d’application technique et rappel de salaire de base
 * (Lot 2A-H2A / Lot 2A-H2D-1).
 *
 * Le rappel couvre [retroactivityStartMonth … technicalApplicationMonth − 1].
 * Le paiement direct couvre [technicalApplicationMonth … décembre].
 * Le coût de campagne = somme sur la période couverte (pas forcément 12 mois).
 */

import {
  computeCampaignPeriodBreakdown,
  FULL_YEAR_MONTH_COUNT,
  type CampaignPeriodBreakdown,
} from "./campaignPeriod";
import { CompensationCalculationError } from "./errors";

export const TECHNICAL_APPLICATION_MONTH_MIN = 1;
export const TECHNICAL_APPLICATION_MONTH_MAX = 12;

export const CAMPAIGN_YEAR_MIN = 2000;
export const CAMPAIGN_YEAR_MAX = 2100;

export const TECHNICAL_APPLICATION_MONTH_LABELS_FR = [
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

export interface ApplicationCalendarInput {
  campaignYear: number;
  technicalApplicationMonth: number;
  /** Défaut métier = 1 (janvier) pour parité des simulations historiques. */
  retroactivityStartMonth?: number;
}

export interface BaseSalaryReminderBreakdown {
  campaignYear: number;
  retroactivityStartMonth: number;
  technicalApplicationMonth: number;
  campaignCoveredMonthCount: number;
  /** Alias historique : reminderMonthCount. */
  retroactiveMonths: number;
  remainingDirectPaymentMonths: number;
  baseSalaryReminderFcfa: bigint;
  remainingYearDirectIncreaseCostFcfa: bigint;
  /**
   * Coût effectif de campagne (période couverte).
   * @deprecated nom — préférer sémantique `campaignPeriodActualBaseIncreaseCostFcfa`.
   */
  annualActualBaseIncreaseCostFcfa: bigint;
  /** Indicateur informatif : rythme de décembre × 12. */
  fullYearRunRateBaseIncreaseCostFcfa: bigint;
}

export function technicalApplicationMonthLabelFr(month: number): string {
  if (
    !Number.isInteger(month) ||
    month < TECHNICAL_APPLICATION_MONTH_MIN ||
    month > TECHNICAL_APPLICATION_MONTH_MAX
  ) {
    return String(month);
  }
  return TECHNICAL_APPLICATION_MONTH_LABELS_FR[month - 1]!;
}

export function validateCampaignYear(campaignYear: number): void {
  if (
    !Number.isInteger(campaignYear) ||
    campaignYear < CAMPAIGN_YEAR_MIN ||
    campaignYear > CAMPAIGN_YEAR_MAX
  ) {
    throw new CompensationCalculationError(
      "INVALID_CAMPAIGN_YEAR",
      `L’année de campagne doit être un entier entre ${CAMPAIGN_YEAR_MIN} et ${CAMPAIGN_YEAR_MAX}.`,
    );
  }
}

export function validateTechnicalApplicationMonth(month: number): void {
  if (
    !Number.isInteger(month) ||
    month < TECHNICAL_APPLICATION_MONTH_MIN ||
    month > TECHNICAL_APPLICATION_MONTH_MAX
  ) {
    throw new CompensationCalculationError(
      "INVALID_TECHNICAL_APPLICATION_MONTH",
      "Le mois d’application technique doit être un entier entre 1 (janvier) et 12 (décembre).",
    );
  }
}

export function validateApplicationCalendar(input: ApplicationCalendarInput): void {
  const retroactivityStartMonth = input.retroactivityStartMonth ?? 1;
  computeCampaignPeriodBreakdown({
    campaignYear: input.campaignYear,
    retroactivityStartMonth,
    technicalApplicationMonth: input.technicalApplicationMonth,
  });
}

/**
 * Ventile le coût de campagne d’une augmentation mensuelle constante
 * entre rappel et paiement direct. Ne modifie pas l’allocation ni l’arrondi.
 */
export function computeBaseSalaryReminderBreakdown(input: {
  campaignYear: number;
  technicalApplicationMonth: number;
  retroactivityStartMonth?: number;
  monthlyFinalIncreaseFcfa: bigint;
}): BaseSalaryReminderBreakdown {
  const retroactivityStartMonth = input.retroactivityStartMonth ?? 1;
  const period: CampaignPeriodBreakdown = computeCampaignPeriodBreakdown({
    campaignYear: input.campaignYear,
    retroactivityStartMonth,
    technicalApplicationMonth: input.technicalApplicationMonth,
  });

  if (typeof input.monthlyFinalIncreaseFcfa !== "bigint") {
    throw new CompensationCalculationError(
      "INVALID_MONTHLY_FINAL_INCREASE",
      "L’augmentation mensuelle finale doit être un BigInt FCFA.",
    );
  }
  if (input.monthlyFinalIncreaseFcfa < 0n) {
    throw new CompensationCalculationError(
      "INVALID_MONTHLY_FINAL_INCREASE",
      "L’augmentation mensuelle finale ne peut pas être négative.",
    );
  }

  const monthly = input.monthlyFinalIncreaseFcfa;
  const baseSalaryReminderFcfa = monthly * BigInt(period.reminderMonthCount);
  const remainingYearDirectIncreaseCostFcfa =
    monthly * BigInt(period.directPaymentMonthCount);
  const annualActualBaseIncreaseCostFcfa =
    monthly * BigInt(period.campaignCoveredMonthCount);
  const fullYearRunRateBaseIncreaseCostFcfa =
    monthly * BigInt(FULL_YEAR_MONTH_COUNT);

  if (
    baseSalaryReminderFcfa + remainingYearDirectIncreaseCostFcfa !==
    annualActualBaseIncreaseCostFcfa
  ) {
    throw new CompensationCalculationError(
      "BASE_SALARY_REMINDER_INVARIANT_FAILED",
      "Incohérence rappel : rappel + paiement direct ≠ coût de période.",
    );
  }

  return {
    campaignYear: input.campaignYear,
    retroactivityStartMonth,
    technicalApplicationMonth: period.technicalApplicationMonth,
    campaignCoveredMonthCount: period.campaignCoveredMonthCount,
    retroactiveMonths: period.reminderMonthCount,
    remainingDirectPaymentMonths: period.directPaymentMonthCount,
    baseSalaryReminderFcfa,
    remainingYearDirectIncreaseCostFcfa,
    annualActualBaseIncreaseCostFcfa,
    fullYearRunRateBaseIncreaseCostFcfa,
  };
}
