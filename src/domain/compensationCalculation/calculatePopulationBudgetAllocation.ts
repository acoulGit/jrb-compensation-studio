/** Orchestrateur budget → allocation théorique → arrondi (Lot 2A-3). */

import { allocateTheoreticalPopulationBudget } from "./allocateTheoreticalPopulationBudget";
import { formatExactAmount } from "./exactFraction";
import type { CalculationExplanationStep } from "./models";
import type {
  CalculatePopulationBudgetAllocationInput,
  PopulationBudgetAllocationResult,
} from "./populationAllocationModels";
import { resolveBudgetTarget } from "./resolveBudgetTarget";
import { roundPopulationAllocations } from "./roundPopulationAllocations";

/**
 * Enchaîne les trois responsabilités isolées :
 * 1. resolveBudgetTarget
 * 2. allocateTheoreticalPopulationBudget
 * 3. roundPopulationAllocations
 */
export function calculatePopulationBudgetAllocation(
  input: CalculatePopulationBudgetAllocationInput,
): PopulationBudgetAllocationResult {
  const budgetTarget = resolveBudgetTarget(input.budget);
  const theoretical = allocateTheoreticalPopulationBudget({
    budgetTarget,
    employees: input.employees,
  });
  const rounded = roundPopulationAllocations({
    theoretical,
    roundingPolicy: input.roundingPolicy,
  });

  const pipelineStep: CalculationExplanationStep = {
    code: "POPULATION_BUDGET_PIPELINE",
    label: "Enchaînement résolution / allocation / arrondi",
    inputValues: {
      budgetMode: budgetTarget.mode,
      employeeCount: input.employees.length,
      roundingMode: rounded.roundingPolicy.mode,
      stepFcfa: rounded.roundingPolicy.stepFcfa.toString(),
    },
    outputValue: formatExactAmount(rounded.totalRoundingDelta),
    formula: "round(allocate(resolve(budget), weights), roundingPolicy)",
    reason:
      "Arrondi uniquement au montant individuel final ; total réel peut différer du budget.",
  };

  return {
    ...rounded,
    explanationSteps: [
      ...budgetTarget.explanationSteps,
      pipelineStep,
      ...rounded.explanationSteps,
    ],
  };
}
