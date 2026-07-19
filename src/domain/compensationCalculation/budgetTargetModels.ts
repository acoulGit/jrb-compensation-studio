/** Modèles de résolution du budget cible (Lot 2A-3). */

import type { CalculationExplanationStep } from "./models";
import type { ExactAmount } from "./exactFraction";

export type BudgetTargetMode =
  | "manual_amount"
  | "percentage_of_eligible_payroll";

export const BUDGET_TARGET_MODES: readonly BudgetTargetMode[] = [
  "manual_amount",
  "percentage_of_eligible_payroll",
] as const;

/**
 * Entrée de résolution du budget.
 * Convention mode `manual_amount` : les champs `eligiblePayrollFcfa` et
 * `budgetRateBasisPoints` sont **ignorés** s’ils sont présents (jamais utilisés).
 */
export interface BudgetTargetInput {
  mode: BudgetTargetMode;
  manualBudgetFcfa?: number | bigint;
  eligiblePayrollFcfa?: number | bigint;
  budgetRateBasisPoints?: number | bigint;
}

export interface ResolvedBudgetTarget {
  mode: BudgetTargetMode;
  exactAmount: ExactAmount;
  manualBudgetFcfa?: bigint;
  eligiblePayrollFcfa?: bigint;
  budgetRateBasisPoints?: bigint;
  /** Champs étrangers au mode explicitement ignorés. */
  ignoredForeignFields: readonly string[];
  sourceValues: Readonly<Record<string, string>>;
  explanationSteps: CalculationExplanationStep[];
}
