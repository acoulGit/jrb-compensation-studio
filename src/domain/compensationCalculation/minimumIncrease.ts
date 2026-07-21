/**
 * Minimum garanti d’augmentation (Lot 2A-H2D-2).
 *
 * Modes exclusifs : none | fixed_monthly_amount | percentage_of_base_salary.
 * Le minimum porte sur l’augmentation mensuelle totale de base
 * (promotion applicable + complément compensatoire).
 */

import { CompensationCalculationError } from "./errors";
import {
  compareFractions,
  exactAmountFromInteger,
  multiplyFractions,
  reduceFraction,
  subtractFractions,
  type ExactAmount,
} from "./exactFraction";
import { MINIMUM_INCREASE_CONTRACT_VERSION } from "./minimumIncreasePopulation";

export { MINIMUM_INCREASE_CONTRACT_VERSION };

export const MINIMUM_INCREASE_MODES = [
  "none",
  "fixed_monthly_amount",
  "percentage_of_base_salary",
] as const;

export type MinimumIncreaseMode = (typeof MINIMUM_INCREASE_MODES)[number];

export interface MinimumIncreasePolicy {
  mode: MinimumIncreaseMode;
  /** Montant forfaitaire mensuel FCFA (mode fixed uniquement). */
  minimumMonthlyAmountFcfa: bigint | null;
  /** Taux exact (mode percentage uniquement), ex. 3 % = 3/100. */
  minimumIncreaseRate: ExactAmount | null;
}

export const NO_MINIMUM_INCREASE_POLICY: MinimumIncreasePolicy = {
  mode: "none",
  minimumMonthlyAmountFcfa: null,
  minimumIncreaseRate: null,
};

export function validateMinimumIncreasePolicy(
  policy: MinimumIncreasePolicy,
): void {
  if (!(MINIMUM_INCREASE_MODES as readonly string[]).includes(policy.mode)) {
    throw new CompensationCalculationError(
      "UNSUPPORTED_MINIMUM_INCREASE_MODE",
      `Mode de minimum garanti non supporté : ${String(policy.mode)}.`,
    );
  }

  if (policy.mode === "none") {
    if (
      policy.minimumMonthlyAmountFcfa !== null &&
      policy.minimumMonthlyAmountFcfa !== undefined
    ) {
      throw new CompensationCalculationError(
        "INVALID_MINIMUM_INCREASE_CONFIGURATION",
        "En mode « aucun minimum », aucun montant forfaitaire ne doit être fourni.",
      );
    }
    if (policy.minimumIncreaseRate !== null && policy.minimumIncreaseRate !== undefined) {
      throw new CompensationCalculationError(
        "INVALID_MINIMUM_INCREASE_CONFIGURATION",
        "En mode « aucun minimum », aucun taux ne doit être fourni.",
      );
    }
    return;
  }

  if (policy.mode === "fixed_monthly_amount") {
    if (policy.minimumIncreaseRate !== null && policy.minimumIncreaseRate !== undefined) {
      throw new CompensationCalculationError(
        "INVALID_MINIMUM_INCREASE_CONFIGURATION",
        "En mode forfaitaire, le taux minimum doit être absent.",
      );
    }
    if (
      policy.minimumMonthlyAmountFcfa === null ||
      policy.minimumMonthlyAmountFcfa === undefined
    ) {
      throw new CompensationCalculationError(
        "MISSING_MINIMUM_MONTHLY_AMOUNT",
        "Le montant forfaitaire du minimum garanti est obligatoire.",
      );
    }
    if (typeof policy.minimumMonthlyAmountFcfa !== "bigint") {
      throw new CompensationCalculationError(
        "INVALID_MINIMUM_MONTHLY_AMOUNT",
        "Le montant forfaitaire du minimum garanti doit être un BigInt FCFA.",
      );
    }
    if (policy.minimumMonthlyAmountFcfa <= 0n) {
      throw new CompensationCalculationError(
        "INVALID_MINIMUM_MONTHLY_AMOUNT",
        "Le montant forfaitaire du minimum garanti doit être strictement positif.",
      );
    }
    return;
  }

  // percentage_of_base_salary
  if (
    policy.minimumMonthlyAmountFcfa !== null &&
    policy.minimumMonthlyAmountFcfa !== undefined
  ) {
    throw new CompensationCalculationError(
      "INVALID_MINIMUM_INCREASE_CONFIGURATION",
      "En mode pourcentage, le montant forfaitaire doit être absent.",
    );
  }
  if (policy.minimumIncreaseRate === null || policy.minimumIncreaseRate === undefined) {
    throw new CompensationCalculationError(
      "MISSING_MINIMUM_INCREASE_RATE",
      "Le taux du minimum garanti est obligatoire.",
    );
  }
  if (
    policy.minimumIncreaseRate.denominator <= 0n ||
    policy.minimumIncreaseRate.numerator <= 0n
  ) {
    throw new CompensationCalculationError(
      "INVALID_MINIMUM_INCREASE_RATE",
      "Le taux du minimum garanti doit être une fraction strictement positive.",
    );
  }
}

/**
 * Plafond au pas d’arrondi (garantie payable) :
 * ceil exact vers le multiple supérieur du pas.
 */
export function ceilFractionToConfiguredRoundingStep(
  amount: ExactAmount,
  stepFcfa: bigint,
): bigint {
  if (stepFcfa <= 0n) {
    throw new RangeError("Le pas d’arrondi doit être strictement positif.");
  }
  if (amount.denominator <= 0n) {
    throw new RangeError("Dénominateur invalide.");
  }
  if (amount.numerator < 0n) {
    throw new RangeError("Ceil non supporté pour un montant négatif.");
  }
  if (amount.numerator === 0n) {
    return 0n;
  }
  const unitDenominator = amount.denominator * stepFcfa;
  const floorUnits = amount.numerator / unitDenominator;
  const remainder = amount.numerator % unitDenominator;
  const units = remainder === 0n ? floorUnits : floorUnits + 1n;
  return units * stepFcfa;
}

/** Montant total garanti exact (avant déduction promotion / ceil). */
export function computeGuaranteedTotalIncreaseExact(input: {
  policy: MinimumIncreasePolicy;
  applicableMonthlyBaseSalaryFcfa: bigint;
}): ExactAmount {
  validateMinimumIncreasePolicy(input.policy);
  if (input.policy.mode === "none") {
    return exactAmountFromInteger(0n);
  }
  if (input.policy.mode === "fixed_monthly_amount") {
    return exactAmountFromInteger(input.policy.minimumMonthlyAmountFcfa!);
  }
  return multiplyFractions(
    exactAmountFromInteger(input.applicableMonthlyBaseSalaryFcfa),
    input.policy.minimumIncreaseRate!,
  );
}

/**
 * Complément minimum exact requis après contribution de la promotion.
 * max(0, guaranteed − promotionIncrement).
 */
export function computeRequiredMinimumComplementExact(input: {
  guaranteedTotalIncreaseExact: ExactAmount;
  applicablePromotionIncrementFcfa: bigint;
}): ExactAmount {
  const afterPromo = subtractFractions(
    input.guaranteedTotalIncreaseExact,
    exactAmountFromInteger(input.applicablePromotionIncrementFcfa),
  );
  if (compareFractions(afterPromo, exactAmountFromInteger(0n)) <= 0) {
    return exactAmountFromInteger(0n);
  }
  return afterPromo;
}

/** Plancher payable (multiple du pas) pour un mois couvert. */
export function computeMinimumComplementFloorFcfa(input: {
  policy: MinimumIncreasePolicy;
  applicableMonthlyBaseSalaryFcfa: bigint;
  applicablePromotionIncrementFcfa: bigint;
  roundingStepFcfa: bigint;
  isCampaignCoveredMonth: boolean;
  isMinimumIncreasePopulationEmployee: boolean;
}): bigint {
  if (
    !input.isCampaignCoveredMonth ||
    !input.isMinimumIncreasePopulationEmployee ||
    input.policy.mode === "none"
  ) {
    return 0n;
  }
  const guaranteed = computeGuaranteedTotalIncreaseExact({
    policy: input.policy,
    applicableMonthlyBaseSalaryFcfa: input.applicableMonthlyBaseSalaryFcfa,
  });
  const required = computeRequiredMinimumComplementExact({
    guaranteedTotalIncreaseExact: guaranteed,
    applicablePromotionIncrementFcfa: input.applicablePromotionIncrementFcfa,
  });
  return ceilFractionToConfiguredRoundingStep(required, input.roundingStepFcfa);
}

/** Helper test / parse : construit un taux exact depuis pourcent décimal textuel. */
export function minimumIncreaseRateFromPercentParts(
  integerPart: bigint,
  fractionalDigits: string,
): ExactAmount {
  const digits = fractionalDigits.replace(/\D/g, "");
  const scale = 10n ** BigInt(digits.length);
  const numerator = integerPart * scale + BigInt(digits || "0");
  return reduceFraction(numerator, 100n * scale);
}
