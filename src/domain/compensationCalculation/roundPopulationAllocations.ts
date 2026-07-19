/** Arrondi final individuel paramétrable (Lot 2A-3). */

import { CompensationCalculationError } from "./errors";
import {
  exactAmountFromInteger,
  formatExactAmount,
  roundFractionToStepHalfUp,
  subtractFractions,
  type ExactAmount,
} from "./exactFraction";
import type { CalculationExplanationStep } from "./models";
import type {
  PopulationBudgetAllocationResult,
  RoundedEmployeeAllocation,
  RoundingMode,
  RoundingPolicy,
  RoundPopulationAllocationsInput,
} from "./populationAllocationModels";
import { ROUNDING_MODES } from "./populationAllocationModels";

function parseStepFcfa(policy: RoundingPolicy | undefined): {
  mode: RoundingMode;
  stepFcfa: bigint;
} {
  if (policy === undefined) {
    throw new CompensationCalculationError(
      "MISSING_ROUNDING_POLICY",
      "La politique d’arrondi est obligatoire.",
    );
  }
  if (!(ROUNDING_MODES as readonly string[]).includes(policy.mode)) {
    throw new CompensationCalculationError(
      "UNSUPPORTED_ROUNDING_MODE",
      `Mode d’arrondi non supporté : ${String(policy.mode)}.`,
    );
  }

  const raw = policy.stepFcfa;
  if (typeof raw === "bigint") {
    if (raw <= 0n) {
      throw new CompensationCalculationError(
        "INVALID_ROUNDING_STEP",
        "Le pas d’arrondi doit être un entier FCFA strictement positif.",
      );
    }
    return { mode: policy.mode, stepFcfa: raw };
  }
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) {
    throw new CompensationCalculationError(
      "INVALID_ROUNDING_STEP",
      "Le pas d’arrondi doit être un entier FCFA strictement positif.",
    );
  }
  return { mode: policy.mode, stepFcfa: BigInt(raw) };
}

function roundOne(
  employeeId: string,
  theoreticalAmount: ExactAmount,
  mode: RoundingMode,
  stepFcfa: bigint,
): RoundedEmployeeAllocation {
  const unitDenominator = theoreticalAmount.denominator * stepFcfa;
  const floorUnits =
    theoreticalAmount.numerator === 0n
      ? 0n
      : theoreticalAmount.numerator / unitDenominator;
  const remainder =
    theoreticalAmount.numerator === 0n
      ? 0n
      : theoreticalAmount.numerator % unitDenominator;
  const roundsUp = remainder * 2n >= unitDenominator;
  const finalRoundedAmountFcfa = roundFractionToStepHalfUp(
    theoreticalAmount,
    stepFcfa,
  );

  const individualRoundingDelta = subtractFractions(
    exactAmountFromInteger(finalRoundedAmountFcfa),
    theoreticalAmount,
  );

  const explanationSteps: CalculationExplanationStep[] = [
    {
      code: "INDIVIDUAL_ROUNDING_POLICY",
      label: "Politique d’arrondi individuelle",
      inputValues: {
        employeeId,
        mode,
        stepFcfa: stepFcfa.toString(),
      },
      outputValue: `${mode}@${stepFcfa.toString()}`,
      formula: "RoundingPolicy fournie explicitement",
      reason: "Aucun pas par défaut ; pas figé à 5 FCFA.",
    },
    {
      code: "INDIVIDUAL_AMOUNT_ROUNDED",
      label: "Montant individuel arrondi",
      inputValues: {
        theoreticalAmount: formatExactAmount(theoreticalAmount),
        floorUnits: floorUnits.toString(),
        remainder: remainder.toString(),
        unitDenominator: unitDenominator.toString(),
        halfUp: roundsUp,
      },
      outputValue: finalRoundedAmountFcfa.toString(),
      formula:
        "units = num/(den×step) ; si 2×reste ≥ den×step → +1 ; final = units×step",
      reason: "Arrondi nearest_half_up au pas paramétré.",
    },
    {
      code: "INDIVIDUAL_ROUNDING_DELTA",
      label: "Écart individuel d’arrondi",
      inputValues: {
        finalRoundedAmountFcfa: finalRoundedAmountFcfa.toString(),
        theoreticalAmount: formatExactAmount(theoreticalAmount),
      },
      outputValue: formatExactAmount(individualRoundingDelta),
      formula: "finalRounded - theoreticalAmount",
      reason: "Écart rationnel exact (peut être négatif, nul ou positif).",
    },
  ];

  return {
    employeeId,
    theoreticalAmount,
    roundingPolicy: { mode, stepFcfa },
    finalRoundedAmountFcfa,
    individualRoundingDelta,
    explanationSteps,
  };
}

/**
 * Applique l’arrondi final individuel uniquement.
 * Aucune réconciliation forcée au budget ; pas de plus forts restes.
 */
export function roundPopulationAllocations(
  input: RoundPopulationAllocationsInput,
): PopulationBudgetAllocationResult {
  const { mode, stepFcfa } = parseStepFcfa(input.roundingPolicy);
  const theoretical = input.theoretical;

  const allocations = theoretical.allocations.map((allocation) =>
    roundOne(
      allocation.employeeId,
      allocation.theoreticalAmount,
      mode,
      stepFcfa,
    ),
  );

  let actualOperationAmountFcfa = 0n;
  for (const allocation of allocations) {
    actualOperationAmountFcfa += allocation.finalRoundedAmountFcfa;
  }

  const totalRoundingDelta = subtractFractions(
    exactAmountFromInteger(actualOperationAmountFcfa),
    theoretical.budgetTarget,
  );

  const explanationSteps: CalculationExplanationStep[] = [
    {
      code: "ACTUAL_OPERATION_TOTAL",
      label: "Montant réel de l’opération",
      inputValues: {
        employeeCount: allocations.length,
        stepFcfa: stepFcfa.toString(),
      },
      outputValue: actualOperationAmountFcfa.toString(),
      formula: "Σ finalRoundedAmountFcfa",
      reason: "Somme des montants individuels finaux arrondis (entier FCFA).",
    },
    {
      code: "TOTAL_ROUNDING_DELTA",
      label: "Écart total d’arrondi",
      inputValues: {
        actualOperationAmountFcfa: actualOperationAmountFcfa.toString(),
        budgetTarget: formatExactAmount(theoretical.budgetTarget),
      },
      outputValue: formatExactAmount(totalRoundingDelta),
      formula: "actualOperationAmountFcfa - budgetTargetExact",
      reason:
        "Peut être négatif, nul ou positif ; éventuellement fractionnaire.",
    },
    {
      code: "NO_FORCED_BUDGET_RECONCILIATION",
      label: "Absence de réconciliation forcée",
      inputValues: {
        method: "none",
      },
      outputValue: false,
      formula: "no largest-remainder / no last-employee adjustment",
      reason:
        "Aucune méthode des plus forts restes ni ajustement silencieux n’est appliquée.",
    },
  ];

  return {
    budgetTarget: theoretical.budgetTarget,
    theoreticalAllocatedTotal: theoretical.theoreticalAllocatedTotal,
    roundingPolicy: { mode, stepFcfa },
    allocations,
    actualOperationAmountFcfa,
    totalRoundingDelta,
    isTheoreticalBudgetExactlyAllocated: theoretical.isExactlyAllocated,
    explanationSteps: [
      ...theoretical.explanationSteps,
      ...explanationSteps,
    ],
  };
}
