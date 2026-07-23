/** Résolution exacte du budget cible de période (Lot 2A-3 / H1 / H2D-1). */

import { FULL_YEAR_MONTH_COUNT } from "./calculationContract";
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

export interface ResolveBudgetTargetOptions {
  /**
   * Nombre de mois couverts par la campagne (13 − retroactivityStartMonth).
   * Défaut = 12 pour parité contrat v2 / rétroactivité janvier.
   */
  campaignCoveredMonthCount?: number;
}

/**
 * Résout le budget cible exact de la période d’effet (fraction rationnelle).
 * Aucun arrondi. Mode toujours explicite.
 *
 * - `manual_amount` : montant saisi = enveloppe de la période d’effet
 *   (sans annualisation automatique).
 * - `percentage_of_eligible_payroll` :
 *   masse mensuelle × mois couverts × taux.
 */
export function resolveBudgetTarget(
  input: BudgetTargetInput,
  options?: ResolveBudgetTargetOptions,
): ResolvedBudgetTarget {
  const campaignCoveredMonthCount =
    options?.campaignCoveredMonthCount ?? FULL_YEAR_MONTH_COUNT;
  if (
    !Number.isInteger(campaignCoveredMonthCount) ||
    campaignCoveredMonthCount < 1 ||
    campaignCoveredMonthCount > FULL_YEAR_MONTH_COUNT
  ) {
    throw new CompensationCalculationError(
      "INVALID_BUDGET_TARGET",
      "Le nombre de mois couverts par la campagne doit être un entier entre 1 et 12.",
    );
  }
  const coveredMonths = BigInt(campaignCoveredMonthCount);

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
        code: "BUDGET_TARGET_MANUAL_PERIOD",
        label: "Budget cible de période — montant manuel",
        inputValues: {
          mode: "manual_amount",
          manualBudgetFcfa: manualBudgetFcfa.toString(),
          campaignCoveredMonthCount: campaignCoveredMonthCount.toString(),
          employerChargesIncluded: false,
          ignoredForeignFields: ignoredForeignFields.join(",") || null,
        },
        outputValue: formatExactAmount(exactAmount),
        formula: "campaignPeriodBudgetTarget = manualBudgetFcfa / 1",
        reason:
          "Le montant saisi est l’enveloppe de la période d’effet (sans annualisation), hors charges patronales.",
      },
      {
        code: "BUDGET_TARGET_EXACT",
        label: "Budget de période cible exact",
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
        campaignCoveredMonthCount: campaignCoveredMonthCount.toString(),
      },
      explanationSteps,
    };
  }

  // percentage_of_eligible_payroll — masse mensuelle × mois couverts
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

  const eligiblePeriodPayrollFcfa =
    eligibleMonthlyPayrollFcfa * coveredMonths;

  const exactAmount: ExactAmount = reduceFraction(
    eligiblePeriodPayrollFcfa * budgetRateBasisPoints,
    10_000n,
  );

  const explanationSteps: CalculationExplanationStep[] = [
    {
      code: "BUDGET_TARGET_PERCENTAGE_PERIOD_PAYROLL",
      label: "Assiette de période à partir de la masse mensuelle éligible",
      inputValues: {
        eligibleMonthlyPayrollFcfa: eligibleMonthlyPayrollFcfa.toString(),
        campaignCoveredMonthCount: campaignCoveredMonthCount.toString(),
      },
      outputValue: eligiblePeriodPayrollFcfa.toString(),
      formula:
        "eligiblePeriodPayroll = eligibleMonthlyPayroll × campaignCoveredMonthCount",
      reason:
        "L’assiette saisie est mensuelle (31/12 N-1) ; le budget cible couvre la période d’effet.",
    },
    {
      code: "BUDGET_TARGET_PERCENTAGE_PERIOD",
      label: "Budget cible de période — pourcentage de l’assiette",
      inputValues: {
        mode: "percentage_of_eligible_payroll",
        eligiblePeriodPayrollFcfa: eligiblePeriodPayrollFcfa.toString(),
        budgetRateBasisPoints: budgetRateBasisPoints.toString(),
        employerChargesIncluded: false,
      },
      outputValue: formatExactAmount(exactAmount),
      formula:
        "campaignPeriodBudgetTarget = reduce(eligiblePeriodPayroll × budgetRateBasisPoints, 10000)",
      reason: "400 bps = 4,00 % ; calcul exact sans arrondi.",
    },
    {
      code: "BUDGET_TARGET_EXACT",
      label: "Budget de période cible exact",
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
      eligiblePeriodPayrollFcfa: eligiblePeriodPayrollFcfa.toString(),
      campaignCoveredMonthCount: campaignCoveredMonthCount.toString(),
      budgetRateBasisPoints: budgetRateBasisPoints.toString(),
    },
    explanationSteps,
  };
}
