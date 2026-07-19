/** Résolution exacte du budget cible (Lot 2A-3) — aucun arrondi. */

import { CompensationCalculationError } from "./errors";
import {
  exactAmountFromInteger,
  formatExactAmount,
  reduceFraction,
  type ExactAmount,
} from "./exactFraction";
import type { CalculationExplanationStep } from "./models";
import {
  BUDGET_TARGET_MODES,
  type BudgetTargetInput,
  type BudgetTargetMode,
  type ResolvedBudgetTarget,
} from "./budgetTargetModels";

function parseNonNegativeInteger(
  value: number | bigint | undefined,
  missingCode:
    | "MISSING_MANUAL_BUDGET"
    | "MISSING_ELIGIBLE_PAYROLL"
    | "MISSING_BUDGET_RATE",
  invalidCode:
    | "INVALID_MANUAL_BUDGET"
    | "INVALID_ELIGIBLE_PAYROLL"
    | "INVALID_BUDGET_RATE",
  missingMessage: string,
  invalidMessage: string,
): bigint {
  if (value === undefined) {
    throw new CompensationCalculationError(missingCode, missingMessage);
  }
  if (typeof value === "bigint") {
    if (value < 0n) {
      throw new CompensationCalculationError(invalidCode, invalidMessage);
    }
    return value;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new CompensationCalculationError(invalidCode, invalidMessage);
  }
  return BigInt(value);
}

function isKnownMode(mode: string): mode is BudgetTargetMode {
  return (BUDGET_TARGET_MODES as readonly string[]).includes(mode);
}

/**
 * Résout le budget cible exact (fraction rationnelle).
 * Aucun arrondi. Mode toujours explicite.
 */
export function resolveBudgetTarget(
  input: BudgetTargetInput,
): ResolvedBudgetTarget {
  if (!isKnownMode(input.mode)) {
    throw new CompensationCalculationError(
      "UNSUPPORTED_BUDGET_TARGET_MODE",
      `Mode de budget non supporté : ${String(input.mode)}.`,
    );
  }

  if (input.mode === "manual_amount") {
    const manualBudgetFcfa = parseNonNegativeInteger(
      input.manualBudgetFcfa,
      "MISSING_MANUAL_BUDGET",
      "INVALID_MANUAL_BUDGET",
      "Le montant manuel de budget est obligatoire.",
      "Le montant manuel de budget doit être un entier FCFA ≥ 0.",
    );

    const ignoredForeignFields: string[] = [];
    if (input.eligiblePayrollFcfa !== undefined) {
      ignoredForeignFields.push("eligiblePayrollFcfa");
    }
    if (input.budgetRateBasisPoints !== undefined) {
      ignoredForeignFields.push("budgetRateBasisPoints");
    }

    const exactAmount = exactAmountFromInteger(manualBudgetFcfa);
    const explanationSteps: CalculationExplanationStep[] = [
      {
        code: "BUDGET_TARGET_MANUAL",
        label: "Budget cible — montant manuel",
        inputValues: {
          mode: "manual_amount",
          manualBudgetFcfa: manualBudgetFcfa.toString(),
          ignoredForeignFields: ignoredForeignFields.join(",") || null,
        },
        outputValue: formatExactAmount(exactAmount),
        formula: "exactAmount = manualBudgetFcfa / 1",
        reason:
          "Le montant saisi constitue directement le budget ; aucun calcul ni arrondi.",
      },
      {
        code: "BUDGET_TARGET_EXACT",
        label: "Budget cible exact",
        inputValues: {
          numerator: exactAmount.numerator.toString(),
          denominator: exactAmount.denominator.toString(),
        },
        outputValue: formatExactAmount(exactAmount),
        formula: "reduce(manualBudgetFcfa, 1)",
        reason:
          "Aucun arrondi appliqué ; divisibilité par le pas d’arrondi non exigée.",
      },
    ];

    if (ignoredForeignFields.length > 0) {
      explanationSteps.push({
        code: "BUDGET_TARGET_FOREIGN_FIELDS_IGNORED",
        label: "Champs étrangers au mode manuel ignorés",
        inputValues: {
          ignoredForeignFields: ignoredForeignFields.join(","),
        },
        outputValue: null,
        formula: "ignore(eligiblePayrollFcfa, budgetRateBasisPoints)",
        reason:
          "Convention JRB : en mode manual_amount, assiette et taux n’influencent jamais le résultat.",
      });
    }

    return {
      mode: "manual_amount",
      exactAmount,
      manualBudgetFcfa,
      ignoredForeignFields,
      sourceValues: {
        mode: "manual_amount",
        manualBudgetFcfa: manualBudgetFcfa.toString(),
      },
      explanationSteps,
    };
  }

  // percentage_of_eligible_payroll
  const eligiblePayrollFcfa = parseNonNegativeInteger(
    input.eligiblePayrollFcfa,
    "MISSING_ELIGIBLE_PAYROLL",
    "INVALID_ELIGIBLE_PAYROLL",
    "La masse salariale éligible est obligatoire.",
    "La masse salariale éligible doit être un entier FCFA ≥ 0.",
  );
  const budgetRateBasisPoints = parseNonNegativeInteger(
    input.budgetRateBasisPoints,
    "MISSING_BUDGET_RATE",
    "INVALID_BUDGET_RATE",
    "Le taux de budget (basis points) est obligatoire.",
    "Le taux de budget doit être un entier ≥ 0 (basis points).",
  );

  const exactAmount: ExactAmount = reduceFraction(
    eligiblePayrollFcfa * budgetRateBasisPoints,
    10_000n,
  );

  const explanationSteps: CalculationExplanationStep[] = [
    {
      code: "BUDGET_TARGET_PERCENTAGE",
      label: "Budget cible — pourcentage de l’assiette",
      inputValues: {
        mode: "percentage_of_eligible_payroll",
        eligiblePayrollFcfa: eligiblePayrollFcfa.toString(),
        budgetRateBasisPoints: budgetRateBasisPoints.toString(),
      },
      outputValue: formatExactAmount(exactAmount),
      formula:
        "exactAmount = reduce(eligiblePayrollFcfa × budgetRateBasisPoints, 10000)",
      reason: "400 bps = 4,00 % ; calcul exact sans arrondi.",
    },
    {
      code: "BUDGET_TARGET_EXACT",
      label: "Budget cible exact",
      inputValues: {
        numerator: exactAmount.numerator.toString(),
        denominator: exactAmount.denominator.toString(),
      },
      outputValue: formatExactAmount(exactAmount),
      formula: "fraction rationnelle réduite",
      reason:
        "Le budget peut rester fractionnaire (ex. 1002492/100) ; aucun arrondi.",
    },
  ];

  return {
    mode: "percentage_of_eligible_payroll",
    exactAmount,
    eligiblePayrollFcfa,
    budgetRateBasisPoints,
    ignoredForeignFields: [],
    sourceValues: {
      mode: "percentage_of_eligible_payroll",
      eligiblePayrollFcfa: eligiblePayrollFcfa.toString(),
      budgetRateBasisPoints: budgetRateBasisPoints.toString(),
    },
    explanationSteps,
  };
}
