/** Résolution exacte du budget cible ANNUEL (Lot 2A-3 / correctif 2A-H1). */

import { ANNUAL_BUDGET_PERIOD_MONTHS } from "./calculationContract";
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
 * Résout le budget cible ANNUEL exact (fraction rationnelle).
 * Aucun arrondi. Mode toujours explicite.
 *
 * - `manual_amount` : montant saisi = budget annuel cible.
 * - `percentage_of_eligible_payroll` : `eligiblePayrollFcfa` = masse MENSUELLE
 *   éligible ; annualisée × 12 avant application du taux.
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
        code: "BUDGET_TARGET_MANUAL_ANNUAL",
        label: "Budget cible annuel — montant manuel",
        inputValues: {
          mode: "manual_amount",
          manualBudgetFcfa: manualBudgetFcfa.toString(),
          annualBudgetPeriodMonths: ANNUAL_BUDGET_PERIOD_MONTHS.toString(),
          employerChargesIncluded: false,
          ignoredForeignFields: ignoredForeignFields.join(",") || null,
        },
        outputValue: formatExactAmount(exactAmount),
        formula: "annualBudgetTarget = manualBudgetFcfa / 1",
        reason:
          "Le montant saisi est le coût annuel des augmentations (12 mois), hors charges patronales.",
      },
      {
        code: "BUDGET_TARGET_EXACT",
        label: "Budget annuel cible exact",
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

  // percentage_of_eligible_payroll — assiette mensuelle annualisée × 12
  const eligibleMonthlyPayrollFcfa = parseNonNegativeInteger(
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

  const eligibleAnnualPayrollFcfa =
    eligibleMonthlyPayrollFcfa * ANNUAL_BUDGET_PERIOD_MONTHS;

  const exactAmount: ExactAmount = reduceFraction(
    eligibleAnnualPayrollFcfa * budgetRateBasisPoints,
    10_000n,
  );

  const explanationSteps: CalculationExplanationStep[] = [
    {
      code: "BUDGET_TARGET_PERCENTAGE_ANNUALIZE_PAYROLL",
      label: "Annualisation de la masse salariale éligible",
      inputValues: {
        eligibleMonthlyPayrollFcfa: eligibleMonthlyPayrollFcfa.toString(),
        annualBudgetPeriodMonths: ANNUAL_BUDGET_PERIOD_MONTHS.toString(),
      },
      outputValue: eligibleAnnualPayrollFcfa.toString(),
      formula: "eligibleAnnualPayroll = eligibleMonthlyPayroll × 12",
      reason:
        "L’assiette saisie est mensuelle ; le budget cible est un coût annuel.",
    },
    {
      code: "BUDGET_TARGET_PERCENTAGE_ANNUAL",
      label: "Budget cible annuel — pourcentage de l’assiette annuelle",
      inputValues: {
        mode: "percentage_of_eligible_payroll",
        eligibleAnnualPayrollFcfa: eligibleAnnualPayrollFcfa.toString(),
        budgetRateBasisPoints: budgetRateBasisPoints.toString(),
        employerChargesIncluded: false,
      },
      outputValue: formatExactAmount(exactAmount),
      formula:
        "annualBudgetTarget = reduce(eligibleAnnualPayroll × budgetRateBasisPoints, 10000)",
      reason: "400 bps = 4,00 % ; calcul exact sans arrondi.",
    },
    {
      code: "BUDGET_TARGET_EXACT",
      label: "Budget annuel cible exact",
      inputValues: {
        numerator: exactAmount.numerator.toString(),
        denominator: exactAmount.denominator.toString(),
      },
      outputValue: formatExactAmount(exactAmount),
      formula: "fraction rationnelle réduite",
      reason:
        "Le budget peut rester fractionnaire ; aucun arrondi avant allocation.",
    },
  ];

  return {
    mode: "percentage_of_eligible_payroll",
    exactAmount,
    /** Masse mensuelle saisie (source). */
    eligiblePayrollFcfa: eligibleMonthlyPayrollFcfa,
    budgetRateBasisPoints,
    ignoredForeignFields: [],
    sourceValues: {
      mode: "percentage_of_eligible_payroll",
      eligibleMonthlyPayrollFcfa: eligibleMonthlyPayrollFcfa.toString(),
      eligibleAnnualPayrollFcfa: eligibleAnnualPayrollFcfa.toString(),
      budgetRateBasisPoints: budgetRateBasisPoints.toString(),
    },
    explanationSteps,
  };
}
