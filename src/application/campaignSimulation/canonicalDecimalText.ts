/**
 * Sérialisation / validation de chaînes décimales canoniques (Lot 2B-4A).
 * Aucune conversion via Number pour les grands entiers.
 */

/** Entier décimal ASCII canonique (signé optionnel). */
export function isCanonicalIntegerText(
  value: string,
  options: { allowNegative?: boolean } = {},
): boolean {
  const allowNegative = options.allowNegative ?? false;
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  let index = 0;
  let negative = false;
  if (value[0] === "+") {
    return false;
  }
  if (value[0] === "-") {
    if (!allowNegative) {
      return false;
    }
    negative = true;
    index = 1;
    if (index >= value.length) {
      return false;
    }
  }
  const digits = value.slice(index);
  if (!/^\d+$/.test(digits)) {
    return false;
  }
  if (digits.length > 1 && digits[0] === "0") {
    return false;
  }
  if (negative && digits === "0") {
    return false;
  }
  return true;
}

/** Dénominateur strictement positif, forme canonique non signée. */
export function isCanonicalPositiveDenominatorText(value: string): boolean {
  return isCanonicalIntegerText(value, { allowNegative: false }) && value !== "0";
}

/** bigint → chaîne décimale canonique. */
export function bigintToCanonicalText(value: bigint): string {
  return value.toString();
}

/** ExactAmount → paires de chaînes canoniques. */
export function exactAmountToCanonicalTexts(amount: {
  numerator: bigint;
  denominator: bigint;
}): { numeratorText: string; denominatorText: string } {
  return {
    numeratorText: bigintToCanonicalText(amount.numerator),
    denominatorText: bigintToCanonicalText(amount.denominator),
  };
}

/** Parse une chaîne canonique en bigint (rejette le non-canonique). */
export function parseCanonicalIntegerText(
  value: string,
  options: { allowNegative?: boolean } = {},
): bigint {
  if (!isCanonicalIntegerText(value, options)) {
    throw new Error(`Chaîne entière non canonique: ${value}`);
  }
  return BigInt(value);
}

export function parseCanonicalExactAmount(parts: {
  numeratorText: string;
  denominatorText: string;
  allowNegativeNumerator?: boolean;
}): { numerator: bigint; denominator: bigint } {
  const numerator = parseCanonicalIntegerText(parts.numeratorText, {
    allowNegative: parts.allowNegativeNumerator ?? true,
  });
  if (!isCanonicalPositiveDenominatorText(parts.denominatorText)) {
    throw new Error(
      `Dénominateur non canonique ou non positif: ${parts.denominatorText}`,
    );
  }
  return {
    numerator,
    denominator: BigInt(parts.denominatorText),
  };
}
