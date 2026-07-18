import { MAX_FACTOR_MILLI, MIN_FACTOR_MILLI } from "./models";

export function isValidFactorMilli(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= MIN_FACTOR_MILLI &&
    value <= MAX_FACTOR_MILLI
  );
}
