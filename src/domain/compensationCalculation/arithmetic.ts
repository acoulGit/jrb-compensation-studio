/** Arithmétique entière / BigInt pour le moteur (Lot 2A-2). */

/** Arrondi half-up d’une division entière positive : floor(num/den + 1/2). */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new RangeError("Dénominateur invalide pour divRoundHalfUp.");
  }
  if (numerator < 0n) {
    throw new RangeError("Numérateur négatif non supporté pour divRoundHalfUp.");
  }
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder * 2n >= denominator) {
    return quotient + 1n;
  }
  return quotient;
}

/** |a - b| en BigInt. */
export function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

/**
 * Ratio Salaire/S0 en basis points entiers (half-up).
 * Ne sert qu’à l’affichage ; le classement utilise le ratio rationnel exact.
 */
export function computeDisplayRatioBasisPoints(
  salaryFcfa: number,
  s0Fcfa: number,
): number {
  const bps = divRoundHalfUp(
    BigInt(salaryFcfa) * 10_000n,
    BigInt(s0Fcfa),
  );
  return Number(bps);
}

/**
 * Affiche un ratio en basis points sous forme « 65,00 % »
 * (deux décimales, virgule française, indépendant de la locale runtime).
 */
export function formatRatioBpsForDisplay(ratioBasisPoints: number): string {
  const negative = ratioBasisPoints < 0;
  const absolute = Math.abs(ratioBasisPoints);
  const whole = Math.trunc(absolute / 100);
  const fraction = absolute % 100;
  const body = `${whole},${String(fraction).padStart(2, "0")} %`;
  return negative ? `-${body}` : body;
}
