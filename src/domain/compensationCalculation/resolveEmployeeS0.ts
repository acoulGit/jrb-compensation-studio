/** Résolution exacte du S0 par famille + grade (Lot 2A-4). */

import { CompensationCalculationError } from "./errors";
import type { CalculationExplanationStep } from "./models";
import type {
  EmployeeS0Resolution,
  PreparedSalaryGridCell,
} from "./preparedPopulationModels";

export interface ResolveEmployeeS0Input {
  familyCode: string;
  gradeCode: string;
  salaryGrid: readonly PreparedSalaryGridCell[];
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

/**
 * Retrouve le S0 unique pour (familyCode, gradeCode).
 * Aucun fallback ; indépendant de l’ordre de la grille.
 */
export function resolveEmployeeS0(
  input: ResolveEmployeeS0Input,
): EmployeeS0Resolution {
  if (typeof input.familyCode !== "string" || input.familyCode.trim() === "") {
    throw new CompensationCalculationError(
      "INVALID_FAMILY_CODE",
      "Le code famille est obligatoire.",
    );
  }
  if (typeof input.gradeCode !== "string" || input.gradeCode.trim() === "") {
    throw new CompensationCalculationError(
      "INVALID_GRADE_CODE",
      "Le code grade est obligatoire.",
    );
  }

  const familyKey = normalizeCode(input.familyCode);
  const gradeKey = normalizeCode(input.gradeCode);

  const matches = input.salaryGrid.filter(
    (cell) =>
      normalizeCode(cell.familyCode) === familyKey &&
      normalizeCode(cell.gradeCode) === gradeKey,
  );

  if (matches.length === 0) {
    throw new CompensationCalculationError(
      "S0_REFERENCE_NOT_FOUND",
      `Aucune médiane S0 pour famille=${input.familyCode} / grade=${input.gradeCode}.`,
    );
  }
  if (matches.length > 1) {
    throw new CompensationCalculationError(
      "DUPLICATE_S0_REFERENCE",
      `Plusieurs médianes S0 pour famille=${input.familyCode} / grade=${input.gradeCode}.`,
    );
  }

  const cell = matches[0];
  const raw = cell.s0Fcfa;
  let s0Fcfa: bigint;
  if (typeof raw === "bigint") {
    if (raw <= 0n) {
      throw new CompensationCalculationError(
        "INVALID_S0",
        "Le S0 doit être un entier FCFA strictement positif.",
      );
    }
    s0Fcfa = raw;
  } else if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) {
    s0Fcfa = BigInt(raw);
  } else {
    throw new CompensationCalculationError(
      "INVALID_S0",
      "Le S0 doit être un entier FCFA strictement positif.",
    );
  }

  const explanationSteps: CalculationExplanationStep[] = [
    {
      code: "S0_REFERENCE_RESOLVED",
      label: "Résolution de la médiane S0",
      inputValues: {
        familyCode: input.familyCode,
        gradeCode: input.gradeCode,
        matchedFamilyCode: cell.familyCode,
        matchedGradeCode: cell.gradeCode,
      },
      outputValue: s0Fcfa.toString(),
      formula: "lookup exact (familyCode, gradeCode) → s0Fcfa",
      reason: "Correspondance unique ; aucun fallback silencieux.",
    },
  ];

  return {
    familyCode: cell.familyCode,
    gradeCode: cell.gradeCode,
    familyLabel: cell.familyLabel,
    gradeLabel: cell.gradeLabel,
    s0Fcfa,
    explanationSteps,
  };
}
