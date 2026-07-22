/** Poids individuel matriciel composite (Lot 2A-2). */

import { CompensationCalculationError } from "./errors";
import {
  INDIVIDUAL_WEIGHT_SCALE,
  type CalculationExplanationStep,
  type IndividualWeightInput,
  type IndividualWeightResult,
} from "./models";
import { resolveEvaluationFactor } from "./resolveEvaluationFactor";
import { resolveSalaryPosition } from "./resolveSalaryPosition";

/**
 * Poids individuel = facteur de position × facteur d’évaluation.
 * Échelle uniforme 1 000 000 000 ; aucun arrondi prématuré.
 * Ne calcule pas de montant d’augmentation.
 */
export function calculateIndividualMatrixWeight(
  input: IndividualWeightInput,
): IndividualWeightResult {
  const salaryPosition = resolveSalaryPosition({
    salaryFcfa: input.salaryFcfa,
    s0Fcfa: input.s0Fcfa,
    salaryPositions: input.salaryPositions,
  });

  const evaluationFactor = resolveEvaluationFactor({
    mode: input.mode,
    performanceLevel: input.performanceLevel,
    potentialLevel: input.potentialLevel,
    performanceFactors: input.performanceFactors,
    potentialFactors: input.potentialFactors,
    nineBoxFactors: input.nineBoxFactors,
    neutralizeNineBoxEffect: input.neutralizeNineBoxEffect,
  });

  if (!Number.isInteger(salaryPosition.positionFactorMilli)) {
    throw new CompensationCalculationError(
      "INVALID_FACTOR",
      "Le facteur de position doit être un entier.",
    );
  }

  // Échelle uniforme 1e9 : positionFactorMilli × evaluationFactorScaled.
  const theoreticalWeightNumerator =
    BigInt(salaryPosition.positionFactorMilli) *
    BigInt(evaluationFactor.exactFactorNumerator);

  const confirmed = input.confirmedUnderperformer === true;
  const exactWeightNumerator = confirmed ? 0n : theoreticalWeightNumerator;

  const explanationSteps: CalculationExplanationStep[] = [
    ...salaryPosition.explanation,
    ...evaluationFactor.explanation,
    {
      code: "INDIVIDUAL_WEIGHT_THEORETICAL",
      label: "Poids individuel théorique",
      inputValues: {
        positionFactorMilli: salaryPosition.positionFactorMilli,
        evaluationFactorNumerator: evaluationFactor.exactFactorNumerator,
        evaluationFactorScale: evaluationFactor.exactFactorScale,
      },
      outputValue: theoreticalWeightNumerator.toString(),
      formula:
        "positionFactorMilli * exactFactorNumerator (échelle 1_000_000_000)",
      reason:
        "Produit exact sans arrondi ; pas encore un montant d’augmentation.",
    },
  ];

  if (confirmed) {
    explanationSteps.push({
      code: "CONFIRMED_UNDERPERFORMER_BLOCK",
      label: "Blocage sous-performant confirmé",
      inputValues: {
        confirmedUnderperformer: true,
        theoreticalWeightNumerator: theoreticalWeightNumerator.toString(),
      },
      outputValue: 0,
      formula: "exactWeightNumerator = 0",
      reason:
        "Sous-performant confirmé : 0 % matriciel (poids effectif nul).",
    });
  }

  explanationSteps.push({
    code: "INDIVIDUAL_WEIGHT_EFFECTIVE",
    label: "Poids individuel effectif",
    inputValues: {
      blockingReason: confirmed ? "CONFIRMED_UNDERPERFORMER" : null,
    },
    outputValue: exactWeightNumerator.toString(),
    formula: confirmed
      ? "0 (blockingReason = CONFIRMED_UNDERPERFORMER)"
      : "theoreticalWeightNumerator",
    reason: confirmed
      ? "Poids théorique conservé dans la trace ; poids effectif nul."
      : "Aucun blocage matriciel.",
  });

  return {
    salaryPosition,
    evaluationFactor,
    theoreticalWeightNumerator,
    exactWeightNumerator,
    exactWeightScale: INDIVIDUAL_WEIGHT_SCALE,
    isZero: exactWeightNumerator === 0n,
    blockingReason: confirmed ? "CONFIRMED_UNDERPERFORMER" : undefined,
    explanationSteps,
  };
}
