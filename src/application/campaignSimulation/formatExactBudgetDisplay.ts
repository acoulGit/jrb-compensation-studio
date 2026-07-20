/**
 * Formatage exact d’un ExactAmount en libellé FCFA (Lot 2B-2).
 * Aucune conversion via Number.
 */

import {
  reduceFraction,
  type ExactAmount,
} from "../../domain/compensationCalculation";

function groupIntegerDigits(value: bigint): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const raw = abs.toString();
  const parts: string[] = [];
  for (let i = raw.length; i > 0; i -= 3) {
    parts.unshift(raw.slice(Math.max(0, i - 3), i));
  }
  return `${negative ? "-" : ""}${parts.join("\u202F")}`;
}

/**
 * Affiche un montant exact (fraction) en FCFA sans arrondi ni Number.
 * Ex. 25000003/1 → « 25 000 003 FCFA » ; 1002492/100 → « 10 024,92 FCFA ».
 */
export function formatExactAmountAsFcfa(amount: ExactAmount): string {
  const reduced = reduceFraction(amount.numerator, amount.denominator);
  let numerator = reduced.numerator;
  const denominator = reduced.denominator;
  const negative = numerator < 0n;
  if (negative) {
    numerator = -numerator;
  }

  const integerPart = numerator / denominator;
  let remainder = numerator % denominator;
  const sign = negative ? "-" : "";

  if (remainder === 0n) {
    return `${sign}${groupIntegerDigits(integerPart)} FCFA`;
  }

  const digits: string[] = [];
  const seen = new Map<bigint, number>();
  while (remainder !== 0n && digits.length < 24) {
    if (seen.has(remainder)) {
      break;
    }
    seen.set(remainder, digits.length);
    remainder *= 10n;
    digits.push((remainder / denominator).toString());
    remainder = remainder % denominator;
  }

  while (digits.length > 0 && digits[digits.length - 1] === "0") {
    digits.pop();
  }

  if (digits.length === 0) {
    return `${sign}${groupIntegerDigits(integerPart)} FCFA`;
  }

  return `${sign}${groupIntegerDigits(integerPart)},${digits.join("")} FCFA`;
}

/** Affiche un pourcentage exact depuis des basis points (ex. 400 → « 4,00 % »). */
export function formatBasisPointsAsPercent(bps: bigint): string {
  const negative = bps < 0n;
  const abs = negative ? -bps : bps;
  const whole = abs / 100n;
  const frac = abs % 100n;
  const fracStr = frac.toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole.toString()},${fracStr} %`;
}

/** Entier FCFA avec séparateur de milliers (espace fine), sans Number. */
export function formatFcfaInteger(value: bigint): string {
  return `${groupIntegerDigits(value)} FCFA`;
}

/**
 * Affiche un taux exact (fraction) en pourcentage.
 * Ex. 1/25 → « 4 % » ; 425/10000 → « 4,25 % ».
 */
export function formatExactRateAsPercent(rate: ExactAmount): string {
  const reduced = reduceFraction(rate.numerator, rate.denominator);
  let numerator = reduced.numerator * 100n;
  const denominator = reduced.denominator;
  const negative = numerator < 0n;
  if (negative) {
    numerator = -numerator;
  }

  const integerPart = numerator / denominator;
  let remainder = numerator % denominator;
  const sign = negative ? "-" : "";

  if (remainder === 0n) {
    return `${sign}${integerPart.toString()} %`;
  }

  const digits: string[] = [];
  const seen = new Map<bigint, number>();
  while (remainder !== 0n && digits.length < 12) {
    if (seen.has(remainder)) {
      break;
    }
    seen.set(remainder, digits.length);
    remainder *= 10n;
    digits.push((remainder / denominator).toString());
    remainder = remainder % denominator;
  }

  while (digits.length > 0 && digits[digits.length - 1] === "0") {
    digits.pop();
  }

  if (digits.length === 0) {
    return `${sign}${integerPart.toString()} %`;
  }

  return `${sign}${integerPart.toString()},${digits.join("")} %`;
}

/** Facteur en millièmes : 1000 → « 1,000 » ; 850 → « 0,850 ». */
export function formatFactorMilli(factorMilli: number): string {
  const negative = factorMilli < 0;
  const abs = Math.abs(Math.trunc(factorMilli));
  const whole = Math.floor(abs / 1000);
  const frac = abs % 1000;
  return `${negative ? "-" : ""}${whole},${frac.toString().padStart(3, "0")}`;
}

/** Poids exact (fraction) sans conversion Number. */
export function formatExactWeight(weight: ExactAmount): string {
  const reduced = reduceFraction(weight.numerator, weight.denominator);
  let numerator = reduced.numerator;
  const denominator = reduced.denominator;
  const negative = numerator < 0n;
  if (negative) {
    numerator = -numerator;
  }
  const sign = negative ? "-" : "";
  if (denominator === 1n) {
    return `${sign}${numerator.toString()}`;
  }
  const integerPart = numerator / denominator;
  let remainder = numerator % denominator;
  if (remainder === 0n) {
    return `${sign}${integerPart.toString()}`;
  }
  const digits: string[] = [];
  const seen = new Map<bigint, number>();
  while (remainder !== 0n && digits.length < 12) {
    if (seen.has(remainder)) {
      break;
    }
    seen.set(remainder, digits.length);
    remainder *= 10n;
    digits.push((remainder / denominator).toString());
    remainder = remainder % denominator;
  }
  while (digits.length > 0 && digits[digits.length - 1] === "0") {
    digits.pop();
  }
  if (digits.length === 0) {
    return `${sign}${integerPart.toString()}`;
  }
  return `${sign}${integerPart.toString()},${digits.join("")}`;
}

/** Empreinte stable de configuration (session mémoire uniquement). */
export function buildConfigurationFingerprint(parts: {
  campaignId: number;
  budgetMode: string;
  manualBudget?: bigint;
  eligiblePayroll?: bigint;
  budgetRateBps?: bigint;
  roundingMode: string;
  roundingStep: bigint;
}): string {
  return [
    String(parts.campaignId),
    parts.budgetMode,
    parts.manualBudget?.toString() ?? "",
    parts.eligiblePayroll?.toString() ?? "",
    parts.budgetRateBps?.toString() ?? "",
    parts.roundingMode,
    parts.roundingStep.toString(),
  ].join("|");
}
