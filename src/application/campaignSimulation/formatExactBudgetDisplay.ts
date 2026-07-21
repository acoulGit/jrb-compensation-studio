/**
 * Formatage d’affichage des montants et taux (Lots 2B-2 / correctif 2A-H1).
 * Arrondi d’affichage uniquement (max 2 décimales) — aucune mutation métier.
 * Aucune conversion via Number pour les calculs de fraction.
 */

import {
  reduceFraction,
  type ExactAmount,
} from "../../domain/compensationCalculation";

const DISPLAY_DECIMAL_SCALE = 100n;

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
 * Arrondi half-up d’affichage : round(numerator/denominator × scale) en BigInt.
 * Ne mute pas la fraction source.
 */
function roundHalfUpScaled(
  numerator: bigint,
  denominator: bigint,
  scale: bigint,
): bigint {
  if (denominator <= 0n) {
    throw new Error("Dénominateur d’affichage invalide.");
  }
  const negative = numerator < 0n;
  const absNum = negative ? -numerator : numerator;
  const product = absNum * scale;
  const quot = product / denominator;
  const rem = product % denominator;
  const rounded = rem * 2n >= denominator ? quot + 1n : quot;
  return negative ? -rounded : rounded;
}

/**
 * Affiche un montant exact en FCFA pour l’UI (max 2 décimales).
 * Ex. 25000003/1 → « 25 000 003 FCFA » ;
 *     373346306779… → « 373 346,31 FCFA ».
 * La fraction source n’est pas mutée.
 */
export function formatExactAmountAsFcfa(amount: ExactAmount): string {
  const reduced = reduceFraction(amount.numerator, amount.denominator);
  const scaled = roundHalfUpScaled(
    reduced.numerator,
    reduced.denominator,
    DISPLAY_DECIMAL_SCALE,
  );
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const integerPart = abs / DISPLAY_DECIMAL_SCALE;
  const fracPart = abs % DISPLAY_DECIMAL_SCALE;
  const sign = negative ? "-" : "";

  if (fracPart === 0n) {
    return `${sign}${groupIntegerDigits(integerPart)} FCFA`;
  }

  return `${sign}${groupIntegerDigits(integerPart)},${fracPart
    .toString()
    .padStart(2, "0")} FCFA`;
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
 * @param fractionDigits 2 (défaut, promotions) ou 4 (taux cible / complémentaire).
 * Ex. 5,8045… % → « 5,80 % » ; 0,024375 → « 2,4375 % ».
 * La fraction source n’est pas mutée.
 */
export function formatExactRateAsPercent(
  rate: ExactAmount,
  fractionDigits: 2 | 4 = 2,
): string {
  const reduced = reduceFraction(rate.numerator, rate.denominator);
  // scale = 100 × 10^fractionDigits
  const scale = fractionDigits === 2 ? 10_000n : 1_000_000n;
  const percentScaled = roundHalfUpScaled(
    reduced.numerator,
    reduced.denominator,
    scale,
  );
  const negative = percentScaled < 0n;
  const abs = negative ? -percentScaled : percentScaled;
  const divisor = fractionDigits === 2 ? 100n : 10_000n;
  const whole = abs / divisor;
  const frac = abs % divisor;
  const sign = negative ? "-" : "";
  return `${sign}${whole.toString()},${frac
    .toString()
    .padStart(fractionDigits, "0")} %`;
}

/** Taux d’ancienneté entier suivi de % (jamais de fraction interne). */
export function formatSeniorityRatePercent(ratePercent: number): string {
  return `${Math.trunc(ratePercent)} %`;
}

/**
 * Écart signé en FCFA entiers (signe Unicode − pour les négatifs).
 * Ex. −163 FCFA ; +50 FCFA ; 0 FCFA.
 */
export function formatSignedFcfaInteger(value: bigint): string {
  if (value === 0n) {
    return formatFcfaInteger(0n);
  }
  if (value > 0n) {
    return `+${formatFcfaInteger(value)}`;
  }
  return `\u2212${formatFcfaInteger(-value)}`;
}

/**
 * Écart d’arrondi exact signé (max 2 décimales), signe Unicode − si négatif.
 */
export function formatSignedExactAmountAsFcfa(amount: ExactAmount): string {
  const label = formatExactAmountAsFcfa(amount);
  const reduced = reduceFraction(amount.numerator, amount.denominator);
  if (reduced.numerator === 0n) {
    return label;
  }
  if (reduced.numerator > 0n) {
    return label.startsWith("+") ? label : `+${label}`;
  }
  return label.replace(/^-/, "\u2212");
}

/** Facteur en millièmes : 1000 → « 1,000 » ; 850 → « 0,850 ». */
export function formatFactorMilli(factorMilli: number): string {
  const negative = factorMilli < 0;
  const abs = Math.abs(Math.trunc(factorMilli));
  const whole = Math.floor(abs / 1000);
  const frac = abs % 1000;
  return `${negative ? "-" : ""}${whole},${frac.toString().padStart(3, "0")}`;
}

/** Poids exact (fraction) — détail technique, sans conversion Number. */
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
  /** Version du contrat de calcul (H1 = 2). */
  calculationContractVersion?: number;
  annualBudgetPeriodMonths?: bigint;
  employerChargesIncluded?: boolean;
  /** Année de campagne explicite (Lot 2A-H2A). */
  campaignYear?: number;
  /** Mois d’application technique 1–12 (Lot 2A-H2A). */
  technicalApplicationMonth?: number;
  /** Version du contrat d’incidence d’ancienneté (Lot 2A-H2B). */
  seniorityImpactContractVersion?: number;
  /** Version du contrat trajectoire promotion (Lot 2A-H2C-1). */
  promotionTrajectoryContractVersion?: number;
  /** Version du contrat de calibrage compensatoire (Lot 2A-H2C-2). */
  promotionCompensatoryCalibrationContractVersion?: number;
  /** Version du contrat de trajectoire mensuelle promotion-aware (Lot 2A-H2C-2). */
  promotionAwareCompensationContractVersion?: number;
}): string {
  return [
    `contract:v${parts.calculationContractVersion ?? 2}`,
    `months:${(parts.annualBudgetPeriodMonths ?? 12n).toString()}`,
    `charges:${parts.employerChargesIncluded === true ? "1" : "0"}`,
    String(parts.campaignId),
    parts.budgetMode,
    parts.manualBudget?.toString() ?? "",
    parts.eligiblePayroll?.toString() ?? "",
    parts.budgetRateBps?.toString() ?? "",
    parts.roundingMode,
    parts.roundingStep.toString(),
    `year:${parts.campaignYear ?? ""}`,
    `appMonth:${parts.technicalApplicationMonth ?? ""}`,
    `seniority:v${parts.seniorityImpactContractVersion ?? 1}`,
    `promotion:v${parts.promotionTrajectoryContractVersion ?? 1}`,
    `calibration:v${parts.promotionCompensatoryCalibrationContractVersion ?? 1}`,
    `promoAware:v${parts.promotionAwareCompensationContractVersion ?? 1}`,
  ].join("|");
}
