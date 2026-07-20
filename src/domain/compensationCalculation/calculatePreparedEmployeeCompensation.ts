/** Calcul matriciel individuel préparé (Lot 2A-4) — réutilise 2A-2. */

import { calculateIndividualMatrixWeight } from "./calculateIndividualMatrixWeight";
import { CompensationCalculationError } from "./errors";
import {
  formatExactAmount,
  isZeroFraction,
  reduceFraction,
  type ExactAmount,
} from "./exactFraction";
import type { CalculationExplanationStep } from "./models";
import type {
  PopulationCalculationReferences,
  PreparedEmployeeCalculationInput,
  PreparedEmployeeCalculationResult,
} from "./preparedPopulationModels";
import { resolveEmployeeS0 } from "./resolveEmployeeS0";

function toPositiveBigInt(
  value: number | bigint,
  code: "INVALID_SALARY",
  message: string,
): bigint {
  if (typeof value === "bigint") {
    if (value <= 0n) {
      throw new CompensationCalculationError(code, message);
    }
    return value;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new CompensationCalculationError(code, message);
  }
  return BigInt(value);
}

/**
 * Convention JRB option B :
 * allocationWeight = salaryFcfa × effectiveMatrixWeight
 */
export function buildAllocationWeight(
  salaryFcfa: bigint,
  effectiveWeightNumerator: bigint,
  effectiveWeightScale: bigint,
): ExactAmount {
  if (effectiveWeightScale <= 0n) {
    throw new CompensationCalculationError(
      "INVALID_ALLOCATION_WEIGHT",
      "L’échelle du poids matriciel effectif doit être strictement positive.",
    );
  }
  if (effectiveWeightNumerator < 0n || salaryFcfa < 0n) {
    throw new CompensationCalculationError(
      "INVALID_ALLOCATION_WEIGHT",
      "Le poids d’allocation ne peut pas être négatif.",
    );
  }
  return reduceFraction(
    salaryFcfa * effectiveWeightNumerator,
    effectiveWeightScale,
  );
}

/**
 * Calcule position, évaluation, poids matriciel et poids d’allocation
 * pour un salarié préparé.
 */
export function calculatePreparedEmployeeCompensation(
  employee: PreparedEmployeeCalculationInput,
  references: PopulationCalculationReferences,
): PreparedEmployeeCalculationResult {
  const salaryFcfa = toPositiveBigInt(
    employee.salaryFcfa,
    "INVALID_SALARY",
    "Le salaire doit être un entier FCFA strictement positif.",
  );

  const explanationSteps: CalculationExplanationStep[] = [
    {
      code: "EMPLOYEE_INPUT_VALIDATED",
      label: "Entrée salarié validée",
      inputValues: {
        employeeId: employee.employeeId,
        familyCode: employee.familyCode,
        gradeCode: employee.gradeCode,
        salaryFcfa: salaryFcfa.toString(),
        confirmedUnderperformer: employee.confirmedUnderperformer,
      },
      outputValue: employee.employeeId,
      formula: "PreparedEmployeeCalculationInput",
      reason: "Données minimales pour le calcul matriciel.",
    },
  ];

  const s0Resolution = resolveEmployeeS0({
    familyCode: employee.familyCode,
    gradeCode: employee.gradeCode,
    salaryGrid: references.salaryGrid,
  });
  explanationSteps.push(...s0Resolution.explanationSteps);

  const individualMatrixWeightResult = calculateIndividualMatrixWeight({
    salaryFcfa,
    s0Fcfa: s0Resolution.s0Fcfa,
    salaryPositions: references.salaryPositions,
    mode: references.evaluationMode,
    performanceLevel: employee.performanceLevel,
    potentialLevel: employee.potentialLevel,
    performanceFactors: references.performanceFactors,
    potentialFactors: references.potentialFactors,
    nineBoxFactors: references.nineBoxFactors,
    confirmedUnderperformer: employee.confirmedUnderperformer,
  });

  const salaryPositionResult = individualMatrixWeightResult.salaryPosition;
  const evaluationFactorResult = individualMatrixWeightResult.evaluationFactor;

  explanationSteps.push(
    {
      code: "SALARY_POSITION_RESOLVED",
      label: "Position salariale",
      inputValues: {
        salaryFcfa: salaryFcfa.toString(),
        s0Fcfa: s0Resolution.s0Fcfa.toString(),
        positionCode: salaryPositionResult.positionCode,
      },
      outputValue: salaryPositionResult.positionFactorMilli,
      formula: "resolveSalaryPosition → positionFactorMilli",
      reason: "Facteur de position reparamétrable.",
    },
    {
      code: "EVALUATION_FACTOR_RESOLVED",
      label: "Facteur d’évaluation",
      inputValues: {
        mode: evaluationFactorResult.mode,
        exactFactorNumerator: evaluationFactorResult.exactFactorNumerator,
      },
      outputValue: evaluationFactorResult.exactFactorNumerator,
      formula: "resolveEvaluationFactor",
      reason: "Indépendant de l’orientation 9-Box.",
    },
  );

  const theoreticalMatrixWeight = reduceFraction(
    individualMatrixWeightResult.theoreticalWeightNumerator,
    BigInt(individualMatrixWeightResult.exactWeightScale),
  );
  const effectiveMatrixWeight = reduceFraction(
    individualMatrixWeightResult.exactWeightNumerator,
    BigInt(individualMatrixWeightResult.exactWeightScale),
  );

  explanationSteps.push({
    code: "THEORETICAL_MATRIX_WEIGHT_CALCULATED",
    label: "Poids matriciel théorique",
    inputValues: {
      theoreticalWeightNumerator:
        individualMatrixWeightResult.theoreticalWeightNumerator.toString(),
      scale: individualMatrixWeightResult.exactWeightScale,
    },
    outputValue: formatExactAmount(theoreticalMatrixWeight),
    formula: "positionFactorMilli × evaluationFactorScaled",
    reason: "Avant application éventuelle du blocage sous-performant.",
  });

  explanationSteps.push({
    code: "EFFECTIVE_MATRIX_WEIGHT_CALCULATED",
    label: "Poids matriciel effectif",
    inputValues: {
      blockingReason: individualMatrixWeightResult.blockingReason ?? null,
    },
    outputValue: formatExactAmount(effectiveMatrixWeight),
    formula: individualMatrixWeightResult.blockingReason
      ? "0 (CONFIRMED_UNDERPERFORMER)"
      : "theoreticalMatrixWeight",
    reason: "Poids utilisé pour la répartition budgétaire après règles métier.",
  });

  const allocationWeight = buildAllocationWeight(
    salaryFcfa,
    individualMatrixWeightResult.exactWeightNumerator,
    BigInt(individualMatrixWeightResult.exactWeightScale),
  );

  explanationSteps.push({
    code: "ALLOCATION_WEIGHT_CALCULATED",
    label: "Poids d’allocation budgétaire",
    inputValues: {
      salaryFcfa: salaryFcfa.toString(),
      effectiveMatrixWeight: formatExactAmount(effectiveMatrixWeight),
      allocationBasis: "salary_times_effective_matrix_weight",
    },
    outputValue: formatExactAmount(allocationWeight),
    formula: "salaryFcfa × effectiveMatrixWeight",
    reason:
      "Convention JRB : même poids matriciel ⇒ même taux théorique d’augmentation.",
  });

  if (
    individualMatrixWeightResult.blockingReason === "CONFIRMED_UNDERPERFORMER" &&
    !isZeroFraction(allocationWeight)
  ) {
    throw new CompensationCalculationError(
      "INVALID_ALLOCATION_WEIGHT",
      "Un sous-performant confirmé doit avoir un poids d’allocation nul.",
    );
  }

  return {
    employeeId: employee.employeeId,
    familyCode: employee.familyCode,
    gradeCode: employee.gradeCode,
    salaryFcfa,
    hireDate: employee.hireDate,
    s0Resolution,
    salaryPositionResult,
    evaluationFactorResult,
    individualMatrixWeightResult,
    theoreticalMatrixWeight,
    effectiveMatrixWeight,
    allocationWeight,
    blockingReason: individualMatrixWeightResult.blockingReason,
    explanationSteps: [
      ...explanationSteps,
      ...individualMatrixWeightResult.explanationSteps,
    ],
  };
}
