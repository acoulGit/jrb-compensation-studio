import { MAX_FACTOR_MILLI, MIN_FACTOR_MILLI } from "./models";
import {
  MAX_NINE_BOX_CONFIRMATION_FACTOR_MILLI,
  MIN_NINE_BOX_CONFIRMATION_FACTOR_MILLI,
} from "./models";

export function isValidFactorMilli(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= MIN_FACTOR_MILLI &&
    value <= MAX_FACTOR_MILLI
  );
}

/** Valide le coefficient provisoire 9-Box (500–1000 millièmes). */
export function isValidNineBoxConfirmationFactorMilli(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= MIN_NINE_BOX_CONFIRMATION_FACTOR_MILLI &&
    value <= MAX_NINE_BOX_CONFIRMATION_FACTOR_MILLI
  );
}
