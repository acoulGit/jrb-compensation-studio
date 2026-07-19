/** Modèles d’allocation théorique et d’arrondi population (Lot 2A-3). */

import type { ResolvedBudgetTarget } from "./budgetTargetModels";
import type { ExactAmount } from "./exactFraction";
import type { CalculationExplanationStep } from "./models";

export interface PopulationAllocationEmployeeInput {
  employeeId: string;
  effectiveWeightNumerator: number | bigint;
  effectiveWeightScale: number | bigint;
}

export interface TheoreticalPopulationAllocationInput {
  budgetTarget: ResolvedBudgetTarget | ExactAmount;
  employees: readonly PopulationAllocationEmployeeInput[];
}

export interface TheoreticalEmployeeAllocation {
  employeeId: string;
  weight: ExactAmount;
  theoreticalAmount: ExactAmount;
  explanationSteps: CalculationExplanationStep[];
}

export interface TheoreticalPopulationAllocationResult {
  budgetTarget: ExactAmount;
  totalEffectiveWeight: ExactAmount;
  allocations: TheoreticalEmployeeAllocation[];
  theoreticalAllocatedTotal: ExactAmount;
  isExactlyAllocated: boolean;
  explanationSteps: CalculationExplanationStep[];
}

export type RoundingMode = "nearest_half_up";

export const ROUNDING_MODES: readonly RoundingMode[] = [
  "nearest_half_up",
] as const;

export interface RoundingPolicy {
  mode: RoundingMode;
  stepFcfa: number | bigint;
}

export interface RoundPopulationAllocationsInput {
  theoretical: TheoreticalPopulationAllocationResult;
  roundingPolicy: RoundingPolicy;
}

export interface RoundedEmployeeAllocation {
  employeeId: string;
  theoreticalAmount: ExactAmount;
  roundingPolicy: {
    mode: RoundingMode;
    stepFcfa: bigint;
  };
  finalRoundedAmountFcfa: bigint;
  individualRoundingDelta: ExactAmount;
  explanationSteps: CalculationExplanationStep[];
}

export interface PopulationBudgetAllocationResult {
  budgetTarget: ExactAmount;
  theoreticalAllocatedTotal: ExactAmount;
  roundingPolicy: {
    mode: RoundingMode;
    stepFcfa: bigint;
  };
  allocations: RoundedEmployeeAllocation[];
  actualOperationAmountFcfa: bigint;
  totalRoundingDelta: ExactAmount;
  isTheoreticalBudgetExactlyAllocated: boolean;
  explanationSteps: CalculationExplanationStep[];
}

export interface CalculatePopulationBudgetAllocationInput {
  budget: import("./budgetTargetModels").BudgetTargetInput;
  employees: readonly PopulationAllocationEmployeeInput[];
  roundingPolicy: RoundingPolicy;
}
