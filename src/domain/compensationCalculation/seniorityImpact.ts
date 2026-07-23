/**
 * Incidence supplémentaire d’ancienneté (Lot 2A-H2B).
 *
 * Approximation conventionnelle : incidence calculée uniquement sur
 * l’augmentation mensuelle finale, sans reconstitution de la prime historique.
 * Hors enveloppe budgétaire de la mesure salariale.
 *
 * Le moteur est déterministe (année/mois ISO) — jamais Date.now() ni fuseau.
 */

import { CompensationCalculationError } from "./errors";
import { validateApplicationCalendar } from "./baseSalaryReminder";

/** Version du contrat d’incidence d’ancienneté (empreintes). */
export const SENIORITY_IMPACT_CONTRACT_VERSION = 1 as const;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type SeniorityPaymentTiming = "reminder" | "direct";

export interface ParsedHireDate {
  year: number;
  month: number;
  day: number;
  iso: string;
}

export interface MonthlySeniorityImpactEntry {
  month: number;
  ratePercent: number;
  monthlySeniorityImpactFcfa: bigint;
  paymentTiming: SeniorityPaymentTiming;
}

export interface SeniorityImpactBreakdown {
  hireDate: string;
  technicalApplicationMonthSeniorityRatePercent: number;
  monthlySeniorityImpactSchedule: readonly MonthlySeniorityImpactEntry[];
  seniorityReminderFcfa: bigint;
  remainingYearDirectSeniorityImpactFcfa: bigint;
  annualSeniorityImpactFcfa: bigint;
}

/**
 * Plafond FCFA (arrondi supérieur) : exact × rate / 100.
 * 1 555,01 → 1 556 ; 1 555,50 → 1 556 ; 1 555,00 → 1 555.
 */
export function ceilFcfaPercentOfAmount(
  amountFcfa: bigint,
  ratePercent: number,
): bigint {
  if (typeof amountFcfa !== "bigint") {
    throw new CompensationCalculationError(
      "INVALID_MONTHLY_FINAL_INCREASE",
      "L’assiette d’ancienneté doit être un BigInt FCFA.",
    );
  }
  if (amountFcfa < 0n) {
    throw new CompensationCalculationError(
      "INVALID_MONTHLY_FINAL_INCREASE",
      "L’assiette d’ancienneté ne peut pas être négative.",
    );
  }
  if (!Number.isInteger(ratePercent) || ratePercent < 0) {
    throw new CompensationCalculationError(
      "INVALID_SENIORITY_RATE",
      "Le taux d’ancienneté doit être un entier ≥ 0.",
    );
  }
  const numerator = amountFcfa * BigInt(ratePercent);
  if (numerator === 0n) {
    return 0n;
  }
  return (numerator + 99n) / 100n;
}

/**
 * Barème sans plafond :
 * effectiveAnniversaryCount < 3 → 0 %
 * sinon → effectiveAnniversaryCount + 2
 */
export function seniorityRatePercentFromEffectiveAnniversaryCount(
  effectiveAnniversaryCount: number,
): number {
  if (
    !Number.isInteger(effectiveAnniversaryCount) ||
    effectiveAnniversaryCount < 0
  ) {
    throw new CompensationCalculationError(
      "INVALID_SENIORITY_ANNIVERSARY_COUNT",
      "Le nombre d’anniversaires effectifs doit être un entier ≥ 0.",
    );
  }
  if (effectiveAnniversaryCount < 3) {
    return 0;
  }
  return effectiveAnniversaryCount + 2;
}

/** Parse ISO YYYY-MM-DD sans Date / fuseau. */
export function parseHireDateIso(raw: string | null | undefined): ParsedHireDate {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    throw new CompensationCalculationError(
      "MISSING_HIRE_DATE",
      "La date d’embauche est obligatoire pour calculer l’incidence d’ancienneté.",
    );
  }
  const trimmed = String(raw).trim();
  const match = ISO_DATE_RE.exec(trimmed);
  if (!match) {
    throw new CompensationCalculationError(
      "INVALID_HIRE_DATE",
      "La date d’embauche doit être au format ISO YYYY-MM-DD.",
    );
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    throw new CompensationCalculationError(
      "INVALID_HIRE_DATE",
      "La date d’embauche est invalide.",
    );
  }
  // Validation calendaire minimale (jours par mois, année bissextile).
  const daysInMonth = daysInCalendarMonth(year, month);
  if (day > daysInMonth) {
    throw new CompensationCalculationError(
      "INVALID_HIRE_DATE",
      "La date d’embauche est invalide (jour hors mois).",
    );
  }
  return { year, month, day, iso: trimmed };
}

function daysInCalendarMonth(year: number, month: number): number {
  if (month === 2) {
    const leap =
      (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  if ([4, 6, 9, 11].includes(month)) {
    return 30;
  }
  return 31;
}

/**
 * Date d’effet du taux lié à l’anniversaire k (k ≥ 1) :
 * 1er jour du mois précédant le mois d’anniversaire.
 * Embauche en janvier → décembre de l’année précédente.
 */
export function anniversaryEffectYearMonth(
  hire: ParsedHireDate,
  anniversaryCount: number,
): { year: number; month: number } {
  if (!Number.isInteger(anniversaryCount) || anniversaryCount < 1) {
    throw new CompensationCalculationError(
      "INVALID_SENIORITY_ANNIVERSARY_COUNT",
      "L’indice d’anniversaire doit être un entier ≥ 1.",
    );
  }
  if (hire.month === 1) {
    return {
      year: hire.year + anniversaryCount - 1,
      month: 12,
    };
  }
  return {
    year: hire.year + anniversaryCount,
    month: hire.month - 1,
  };
}

function yearMonthLessOrEqual(
  left: { year: number; month: number },
  right: { year: number; month: number },
): boolean {
  if (left.year < right.year) return true;
  if (left.year > right.year) return false;
  return left.month <= right.month;
}

/**
 * Nombre d’anniversaires devenus effectifs au 1er jour du mois donné.
 */
export function effectiveAnniversaryCountAt(
  hire: ParsedHireDate,
  campaignYear: number,
  month: number,
): number {
  const asOf = { year: campaignYear, month };
  let count = 0;
  // Borne large déterministe : au-delà de campaignYear - hire.year + 2 suffisant.
  const maxK = Math.max(0, campaignYear - hire.year + 2) + 2;
  for (let k = 1; k <= maxK; k += 1) {
    const effect = anniversaryEffectYearMonth(hire, k);
    if (yearMonthLessOrEqual(effect, asOf)) {
      count = k;
    } else {
      break;
    }
  }
  return count;
}

export function seniorityRatePercentAt(
  hire: ParsedHireDate,
  campaignYear: number,
  month: number,
): number {
  return seniorityRatePercentFromEffectiveAnniversaryCount(
    effectiveAnniversaryCountAt(hire, campaignYear, month),
  );
}

export function validateHireDateForCampaign(
  hire: ParsedHireDate,
  campaignYear: number,
): void {
  // Postérieure au 31 décembre de l’année de campagne
  if (hire.year > campaignYear) {
    throw new CompensationCalculationError(
      "HIRE_DATE_AFTER_CAMPAIGN_YEAR",
      `La date d’embauche (${hire.iso}) est postérieure à l’année de campagne ${campaignYear}.`,
    );
  }
}

/**
 * Calcule le calendrier mensuel et les totaux rappel / direct / annuel.
 */
export function computeSeniorityImpactBreakdown(input: {
  hireDate: string;
  campaignYear: number;
  technicalApplicationMonth: number;
  monthlyFinalIncreaseFcfa: bigint;
}): SeniorityImpactBreakdown {
  validateApplicationCalendar({
    campaignYear: input.campaignYear,
    technicalApplicationMonth: input.technicalApplicationMonth,
  });

  const hire = parseHireDateIso(input.hireDate);
  validateHireDateForCampaign(hire, input.campaignYear);

  const schedule: MonthlySeniorityImpactEntry[] = [];
  let seniorityReminderFcfa = 0n;
  let remainingYearDirectSeniorityImpactFcfa = 0n;

  for (let month = 1; month <= 12; month += 1) {
    const ratePercent = seniorityRatePercentAt(
      hire,
      input.campaignYear,
      month,
    );
    const monthlySeniorityImpactFcfa = ceilFcfaPercentOfAmount(
      input.monthlyFinalIncreaseFcfa,
      ratePercent,
    );
    const paymentTiming: SeniorityPaymentTiming =
      month < input.technicalApplicationMonth ? "reminder" : "direct";

    if (paymentTiming === "reminder") {
      seniorityReminderFcfa += monthlySeniorityImpactFcfa;
    } else {
      remainingYearDirectSeniorityImpactFcfa += monthlySeniorityImpactFcfa;
    }

    schedule.push({
      month,
      ratePercent,
      monthlySeniorityImpactFcfa,
      paymentTiming,
    });
  }

  const annualSeniorityImpactFcfa =
    seniorityReminderFcfa + remainingYearDirectSeniorityImpactFcfa;

  if (
    seniorityReminderFcfa + remainingYearDirectSeniorityImpactFcfa !==
    annualSeniorityImpactFcfa
  ) {
    throw new CompensationCalculationError(
      "SENIORITY_IMPACT_INVARIANT_FAILED",
      "Incohérence ancienneté : rappel + direct ≠ annuel.",
    );
  }

  const scheduleSum = schedule.reduce(
    (sum, entry) => sum + entry.monthlySeniorityImpactFcfa,
    0n,
  );
  if (scheduleSum !== annualSeniorityImpactFcfa) {
    throw new CompensationCalculationError(
      "SENIORITY_IMPACT_INVARIANT_FAILED",
      "Incohérence calendrier mensuel d’ancienneté.",
    );
  }

  const technicalApplicationMonthSeniorityRatePercent =
    seniorityRatePercentAt(
      hire,
      input.campaignYear,
      input.technicalApplicationMonth,
    );

  return {
    hireDate: hire.iso,
    technicalApplicationMonthSeniorityRatePercent,
    monthlySeniorityImpactSchedule: schedule,
    seniorityReminderFcfa,
    remainingYearDirectSeniorityImpactFcfa,
    annualSeniorityImpactFcfa,
  };
}
