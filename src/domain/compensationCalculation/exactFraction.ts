/** Fractions rationnelles exactes (BigInt) — Lot 2A-3. */

export interface ExactAmount {
  numerator: bigint;
  denominator: bigint;
}

export function gcdBigInt(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a;
}

export function lcmBigInt(left: bigint, right: bigint): bigint {
  if (left === 0n || right === 0n) {
    return 0n;
  }
  const a = left < 0n ? -left : left;
  const b = right < 0n ? -right : right;
  return (a / gcdBigInt(a, b)) * b;
}

/** Réduit une fraction ; dénominateur toujours strictement positif. */
export function reduceFraction(
  numerator: bigint,
  denominator: bigint,
): ExactAmount {
  if (denominator === 0n) {
    throw new RangeError("Dénominateur nul interdit.");
  }
  let num = numerator;
  let den = denominator;
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  const divisor = gcdBigInt(num, den);
  return {
    numerator: num / divisor,
    denominator: den / divisor,
  };
}

export function exactAmountFromInteger(value: bigint): ExactAmount {
  return reduceFraction(value, 1n);
}

export function addFractions(left: ExactAmount, right: ExactAmount): ExactAmount {
  return reduceFraction(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

export function subtractFractions(
  left: ExactAmount,
  right: ExactAmount,
): ExactAmount {
  return reduceFraction(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

export function multiplyFractions(
  left: ExactAmount,
  right: ExactAmount,
): ExactAmount {
  return reduceFraction(
    left.numerator * right.numerator,
    left.denominator * right.denominator,
  );
}

export function divideFractions(
  left: ExactAmount,
  right: ExactAmount,
): ExactAmount {
  if (right.numerator === 0n) {
    throw new RangeError("Division par zéro interdite.");
  }
  return reduceFraction(
    left.numerator * right.denominator,
    left.denominator * right.numerator,
  );
}

/** Comparaison exacte : -1, 0, 1. */
export function compareFractions(left: ExactAmount, right: ExactAmount): -1 | 0 | 1 {
  const delta =
    left.numerator * right.denominator - right.numerator * left.denominator;
  if (delta < 0n) return -1;
  if (delta > 0n) return 1;
  return 0;
}

export function fractionsEqual(left: ExactAmount, right: ExactAmount): boolean {
  return compareFractions(left, right) === 0;
}

export function isNonNegativeFraction(amount: ExactAmount): boolean {
  // dénominateur toujours > 0 après reduce
  return amount.numerator >= 0n && amount.denominator > 0n;
}

export function isZeroFraction(amount: ExactAmount): boolean {
  return amount.numerator === 0n;
}

/**
 * Arrondi half-up d’une fraction monétaire ≥ 0 au multiple de `stepFcfa`.
 * units = numerator / (denominator × step) ; si 2×reste ≥ den×step → +1 unité.
 */
export function roundFractionToStepHalfUp(
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
    throw new RangeError("Arrondi half-up non supporté pour un montant négatif.");
  }
  if (amount.numerator === 0n) {
    return 0n;
  }

  const unitDenominator = amount.denominator * stepFcfa;
  const floorUnits = amount.numerator / unitDenominator;
  const remainder = amount.numerator % unitDenominator;
  const roundedUnits =
    remainder * 2n >= unitDenominator ? floorUnits + 1n : floorUnits;
  return roundedUnits * stepFcfa;
}

/** Sérialisation stable pour traces (chaîne "num/den"). */
export function formatExactAmount(amount: ExactAmount): string {
  return `${amount.numerator.toString()}/${amount.denominator.toString()}`;
}
