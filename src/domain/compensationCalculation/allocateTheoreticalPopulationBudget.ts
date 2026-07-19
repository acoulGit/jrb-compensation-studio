/** Allocation théorique exacte du budget selon les poids (Lot 2A-3). */

import type { ResolvedBudgetTarget } from "./budgetTargetModels";
import { CompensationCalculationError } from "./errors";
import {
  addFractions,
  divideFractions,
  exactAmountFromInteger,
  formatExactAmount,
  fractionsEqual,
  isZeroFraction,
  multiplyFractions,
  reduceFraction,
  type ExactAmount,
} from "./exactFraction";
import type { CalculationExplanationStep } from "./models";
import type {
  PopulationAllocationEmployeeInput,
  TheoreticalEmployeeAllocation,
  TheoreticalPopulationAllocationInput,
  TheoreticalPopulationAllocationResult,
} from "./populationAllocationModels";

function isResolvedBudgetTarget(
  value: ResolvedBudgetTarget | ExactAmount,
): value is ResolvedBudgetTarget {
  return (
    typeof value === "object" &&
    value !== null &&
    "exactAmount" in value &&
    "mode" in value
  );
}

function parseWeightPart(
  value: number | bigint,
  code: "INVALID_WEIGHT" | "INVALID_WEIGHT_SCALE",
  allowZero: boolean,
  message: string,
): bigint {
  if (typeof value === "bigint") {
    if (value < 0n || (!allowZero && value === 0n)) {
      throw new CompensationCalculationError(code, message);
    }
    return value;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new CompensationCalculationError(code, message);
  }
  if (!allowZero && value === 0) {
    throw new CompensationCalculationError(code, message);
  }
  return BigInt(value);
}

function validateAndNormalizeEmployees(
  employees: readonly PopulationAllocationEmployeeInput[],
): Array<{ employeeId: string; weight: ExactAmount }> {
  if (employees.length === 0) {
    throw new CompensationCalculationError(
      "EMPTY_POPULATION",
      "La population d’allocation est vide.",
    );
  }

  const seen = new Set<string>();
  const normalized: Array<{ employeeId: string; weight: ExactAmount }> = [];

  for (const employee of employees) {
    if (typeof employee.employeeId !== "string" || employee.employeeId.trim() === "") {
      throw new CompensationCalculationError(
        "INVALID_EMPLOYEE_ID",
        "L’identifiant salarié doit être une chaîne non vide.",
      );
    }
    const employeeId = employee.employeeId;
    if (seen.has(employeeId)) {
      throw new CompensationCalculationError(
        "DUPLICATE_EMPLOYEE_ID",
        `Identifiant salarié dupliqué : ${employeeId}.`,
      );
    }
    seen.add(employeeId);

    const numerator = parseWeightPart(
      employee.effectiveWeightNumerator,
      "INVALID_WEIGHT",
      true,
      "Le numérateur de poids doit être un entier ≥ 0.",
    );
    const scale = parseWeightPart(
      employee.effectiveWeightScale,
      "INVALID_WEIGHT_SCALE",
      false,
      "L’échelle de poids doit être un entier strictement positif.",
    );

    normalized.push({
      employeeId,
      weight: reduceFraction(numerator, scale),
    });
  }

  return normalized;
}

function extractBudgetTarget(
  input: TheoreticalPopulationAllocationInput["budgetTarget"],
): ExactAmount {
  const amount = isResolvedBudgetTarget(input) ? input.exactAmount : input;
  if (
    typeof amount.numerator !== "bigint" ||
    typeof amount.denominator !== "bigint" ||
    amount.denominator <= 0n ||
    amount.numerator < 0n
  ) {
    throw new CompensationCalculationError(
      "INVALID_BUDGET_TARGET",
      "Le budget cible doit être une fraction rationnelle ≥ 0 à dénominateur > 0.",
    );
  }
  return reduceFraction(amount.numerator, amount.denominator);
}

/**
 * Répartit exactement le budget cible au prorata des poids effectifs.
 * Aucun arrondi ; somme des parts = budget cible (invariant rationnel).
 */
export function allocateTheoreticalPopulationBudget(
  input: TheoreticalPopulationAllocationInput,
): TheoreticalPopulationAllocationResult {
  const budgetTarget = extractBudgetTarget(input.budgetTarget);
  const employees = validateAndNormalizeEmployees(input.employees);

  let totalEffectiveWeight = exactAmountFromInteger(0n);
  for (const employee of employees) {
    totalEffectiveWeight = addFractions(totalEffectiveWeight, employee.weight);
  }

  const explanationSteps: CalculationExplanationStep[] = [
    {
      code: "TOTAL_EFFECTIVE_WEIGHT",
      label: "Poids effectif total",
      inputValues: {
        employeeCount: employees.length,
      },
      outputValue: formatExactAmount(totalEffectiveWeight),
      formula: "Σ (weightNumerator / weightScale) exact",
      reason: "Somme rationnelle des poids effectifs (échelles hétérogènes admises).",
    },
  ];

  const allocations: TheoreticalEmployeeAllocation[] = [];

  if (isZeroFraction(budgetTarget)) {
    for (const employee of employees) {
      const theoreticalAmount = exactAmountFromInteger(0n);
      const employeeSteps: CalculationExplanationStep[] = [
        {
          code: "THEORETICAL_EMPLOYEE_SHARE",
          label: "Part théorique individuelle",
          inputValues: {
            employeeId: employee.employeeId,
            weight: formatExactAmount(employee.weight),
            budgetTarget: formatExactAmount(budgetTarget),
          },
          outputValue: formatExactAmount(theoreticalAmount),
          formula: "0 (budget cible nul)",
          reason: "Budget cible exact = 0 → toutes les parts théoriques sont nulles.",
        },
      ];
      allocations.push({
        employeeId: employee.employeeId,
        weight: employee.weight,
        theoreticalAmount,
        explanationSteps: employeeSteps,
      });
    }
  } else if (isZeroFraction(totalEffectiveWeight)) {
    throw new CompensationCalculationError(
      "NO_POSITIVE_WEIGHT",
      "Budget cible positif mais somme des poids effectifs nulle.",
    );
  } else {
    for (const employee of employees) {
      let theoreticalAmount: ExactAmount;
      if (isZeroFraction(employee.weight)) {
        theoreticalAmount = exactAmountFromInteger(0n);
      } else {
        // share = budget × weight / total
        theoreticalAmount = divideFractions(
          multiplyFractions(budgetTarget, employee.weight),
          totalEffectiveWeight,
        );
      }

      const employeeSteps: CalculationExplanationStep[] = [
        {
          code: "THEORETICAL_EMPLOYEE_SHARE",
          label: "Part théorique individuelle",
          inputValues: {
            employeeId: employee.employeeId,
            weight: formatExactAmount(employee.weight),
            totalWeight: formatExactAmount(totalEffectiveWeight),
            budgetTarget: formatExactAmount(budgetTarget),
          },
          outputValue: formatExactAmount(theoreticalAmount),
          formula: "budgetTarget × weight / totalWeight",
          reason: isZeroFraction(employee.weight)
            ? "Poids effectif nul → part théorique nulle."
            : "Répartition exacte sans arrondi.",
        },
      ];
      allocations.push({
        employeeId: employee.employeeId,
        weight: employee.weight,
        theoreticalAmount,
        explanationSteps: employeeSteps,
      });
    }
  }

  let theoreticalAllocatedTotal = exactAmountFromInteger(0n);
  for (const allocation of allocations) {
    theoreticalAllocatedTotal = addFractions(
      theoreticalAllocatedTotal,
      allocation.theoreticalAmount,
    );
  }

  const isExactlyAllocated = fractionsEqual(
    theoreticalAllocatedTotal,
    budgetTarget,
  );

  if (!isExactlyAllocated) {
    throw new CompensationCalculationError(
      "THEORETICAL_ALLOCATION_RECONCILIATION_FAILED",
      "La somme des parts théoriques ne reproduit pas le budget cible exact.",
    );
  }

  explanationSteps.push({
    code: "THEORETICAL_BUDGET_EXACTLY_ALLOCATED",
    label: "Réconciliation théorique",
    inputValues: {
      theoreticalAllocatedTotal: formatExactAmount(theoreticalAllocatedTotal),
      budgetTarget: formatExactAmount(budgetTarget),
    },
    outputValue: true,
    formula: "Σ parts = budgetTarget (comparaison rationnelle)",
    reason: "Invariant vérifié sans conversion décimale ni arrondi.",
  });

  return {
    budgetTarget,
    totalEffectiveWeight,
    allocations,
    theoreticalAllocatedTotal,
    isExactlyAllocated,
    explanationSteps,
  };
}
