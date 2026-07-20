/**
 * Calendrier d’application technique et rappel de salaire de base (Lot 2A-H2A).
 *
 * Le rappel est un décalage de paiement, pas un coût additionnel au budget annuel.
 * annualActualBaseIncreaseCost = monthlyFinalIncrease × 12
 *   = rappel + coût des mois restants payés directement.
 */

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
}

export interface BaseSalaryReminderBreakdown {
  campaignYear: number;
  technicalApplicationMonth: number;
  retroactiveMonths: number;
  remainingDirectPaymentMonths: number;
  baseSalaryReminderFcfa: bigint;
  remainingYearDirectIncreaseCostFcfa: bigint;
  annualActualBaseIncreaseCostFcfa: bigint;
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
  validateCampaignYear(input.campaignYear);
  validateTechnicalApplicationMonth(input.technicalApplicationMonth);
}

/**
 * Ventile le coût annuel de l’augmentation de base entre rappel et paiement direct.
 * Ne modifie pas l’allocation ni l’arrondi mensuel.
 */
export function computeBaseSalaryReminderBreakdown(input: {
  campaignYear: number;
  technicalApplicationMonth: number;
  monthlyFinalIncreaseFcfa: bigint;
}): BaseSalaryReminderBreakdown {
  validateApplicationCalendar({
    campaignYear: input.campaignYear,
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

  const technicalApplicationMonth = input.technicalApplicationMonth;
  const retroactiveMonths = technicalApplicationMonth - 1;
  const remainingDirectPaymentMonths = 13 - technicalApplicationMonth;

  if (retroactiveMonths < 0 || retroactiveMonths > 11) {
    throw new CompensationCalculationError(
      "INVALID_RETROACTIVE_MONTHS",
      "Le nombre de mois de rappel doit être entre 0 et 11.",
    );
  }
  if (
    remainingDirectPaymentMonths < 1 ||
    remainingDirectPaymentMonths > 12
  ) {
    throw new CompensationCalculationError(
      "INVALID_REMAINING_DIRECT_PAYMENT_MONTHS",
      "Le nombre de mois restants doit être entre 1 et 12.",
    );
  }
  if (retroactiveMonths + remainingDirectPaymentMonths !== 12) {
    throw new CompensationCalculationError(
      "APPLICATION_CALENDAR_INVARIANT_FAILED",
      "Incohérence calendrier : rappel + mois restants ≠ 12.",
    );
  }

  const monthly = input.monthlyFinalIncreaseFcfa;
  const baseSalaryReminderFcfa = monthly * BigInt(retroactiveMonths);
  const remainingYearDirectIncreaseCostFcfa =
    monthly * BigInt(remainingDirectPaymentMonths);
  const annualActualBaseIncreaseCostFcfa = monthly * 12n;

  if (
    baseSalaryReminderFcfa + remainingYearDirectIncreaseCostFcfa !==
    annualActualBaseIncreaseCostFcfa
  ) {
    throw new CompensationCalculationError(
      "BASE_SALARY_REMINDER_INVARIANT_FAILED",
      "Incohérence rappel : rappel + paiement direct ≠ coût annuel.",
    );
  }

  return {
    campaignYear: input.campaignYear,
    technicalApplicationMonth,
    retroactiveMonths,
    remainingDirectPaymentMonths,
    baseSalaryReminderFcfa,
    remainingYearDirectIncreaseCostFcfa,
    annualActualBaseIncreaseCostFcfa,
  };
}
