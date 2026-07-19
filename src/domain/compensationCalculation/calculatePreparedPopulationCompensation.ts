/** Orchestrateur end-to-end population préparée (Lot 2A-4). */

import { allocateTheoreticalPopulationBudget } from "./allocateTheoreticalPopulationBudget";
import { calculatePreparedEmployeeCompensation } from "./calculatePreparedEmployeeCompensation";
import { CompensationCalculationError } from "./errors";
import {
  addFractions,
  divideFractions,
  exactAmountFromInteger,
  formatExactAmount,
  fractionsEqual,
  isZeroFraction,
  multiplyFractions,
  type ExactAmount,
} from "./exactFraction";
import type { CalculationExplanationStep } from "./models";
import type {
  EmployeeCompensationCalculationResult,
  PopulationCalculationIssue,
  PreparedEmployeeCalculationResult,
  PreparedPopulationCalculationInput,
  PreparedPopulationCalculationResult,
  PopulationCalculationSummary,
} from "./preparedPopulationModels";
import {
  ALLOCATION_BASIS_SALARY_TIMES_MATRIX_WEIGHT,
  compareEmployeeIdAsc,
} from "./preparedPopulationModels";
import { resolveBudgetTarget } from "./resolveBudgetTarget";
import { roundPopulationAllocations } from "./roundPopulationAllocations";
import {
  toIssueLikes,
  validatePreparedPopulationCalculationInput,
} from "./validatePreparedPopulationCalculationInput";

function wrapEmployeeError(
  employeeId: string,
  error: unknown,
  step: string,
): PopulationCalculationIssue {
  if (error instanceof CompensationCalculationError) {
    return {
      employeeId,
      code: error.code,
      message: error.message,
      step,
      details: { sourceCode: error.code },
    };
  }
  return {
    employeeId,
    code: "EMPLOYEE_CALCULATION_FAILED",
    message: error instanceof Error ? error.message : "Erreur salarié inconnue.",
    step,
  };
}

/**
 * Calcule le calibrage et le montant matriciel d’une population préparée.
 * Atomicité fonctionnelle : aucune simulation partielle réussie si une erreur.
 */
export function calculatePreparedPopulationCompensation(
  input: PreparedPopulationCalculationInput,
): PreparedPopulationCalculationResult {
  const validation = validatePreparedPopulationCalculationInput(input);
  const issues: PopulationCalculationIssue[] = [...validation.issues];

  let budgetTargetResult;
  try {
    if (validation.isValid) {
      budgetTargetResult = resolveBudgetTarget(input.budgetTarget);
    }
  } catch (error) {
    if (error instanceof CompensationCalculationError) {
      issues.push({
        code: error.code,
        message: error.message,
        step: "resolve_budget_target",
      });
    } else {
      issues.push({
        code: "INVALID_BUDGET_TARGET",
        message: "Échec de résolution du budget cible.",
        step: "resolve_budget_target",
      });
    }
  }

  const preparedEmployees: PreparedEmployeeCalculationResult[] = [];
  if (issues.length === 0) {
    for (const employee of input.employees) {
      try {
        preparedEmployees.push(
          calculatePreparedEmployeeCompensation(employee, input.references),
        );
      } catch (error) {
        issues.push(
          wrapEmployeeError(employee.employeeId, error, "employee_calculation"),
        );
      }
    }
  }

  if (issues.length > 0) {
    throw new CompensationCalculationError(
      "POPULATION_CALCULATION_FAILED",
      "Le calcul de population a échoué ; aucun résultat global valide.",
      toIssueLikes(issues),
    );
  }

  if (!budgetTargetResult) {
    throw new CompensationCalculationError(
      "POPULATION_CALCULATION_FAILED",
      "Budget cible introuvable après validation.",
    );
  }

  // Tri déterministe non mutable
  const sortedPrepared = [...preparedEmployees].sort((left, right) =>
    compareEmployeeIdAsc(left.employeeId, right.employeeId),
  );

  let totalAllocationWeight = exactAmountFromInteger(0n);
  for (const employee of sortedPrepared) {
    totalAllocationWeight = addFractions(
      totalAllocationWeight,
      employee.allocationWeight,
    );
  }

  const allocationEmployees = sortedPrepared.map((employee) => ({
    employeeId: employee.employeeId,
    effectiveWeightNumerator: employee.allocationWeight.numerator,
    effectiveWeightScale: employee.allocationWeight.denominator,
  }));

  let theoretical;
  try {
    theoretical = allocateTheoreticalPopulationBudget({
      budgetTarget: budgetTargetResult,
      employees: allocationEmployees,
    });
  } catch (error) {
    if (error instanceof CompensationCalculationError) {
      throw new CompensationCalculationError(
        "POPULATION_CALCULATION_FAILED",
        error.message,
        toIssueLikes([
          {
            code: error.code,
            message: error.message,
            step: "theoretical_allocation",
          },
        ]),
      );
    }
    throw error;
  }

  const rounded = roundPopulationAllocations({
    theoretical,
    roundingPolicy: input.roundingPolicy,
  });

  const calibrationCoefficient: ExactAmount = isZeroFraction(
    totalAllocationWeight,
  )
    ? exactAmountFromInteger(0n)
    : divideFractions(budgetTargetResult.exactAmount, totalAllocationWeight);

  const roundedById = new Map(
    rounded.allocations.map((item) => [item.employeeId, item]),
  );
  const theoreticalById = new Map(
    theoretical.allocations.map((item) => [item.employeeId, item]),
  );

  const employees: EmployeeCompensationCalculationResult[] = sortedPrepared.map(
    (prepared) => {
      const theo = theoreticalById.get(prepared.employeeId)!;
      const round = roundedById.get(prepared.employeeId)!;

      const theoreticalIncreaseRate = isZeroFraction(
        prepared.effectiveMatrixWeight,
      )
        ? exactAmountFromInteger(0n)
        : multiplyFractions(
            calibrationCoefficient,
            prepared.effectiveMatrixWeight,
          );

      const employeeSteps: CalculationExplanationStep[] = [
        ...prepared.explanationSteps,
        {
          code: "EMPLOYEE_THEORETICAL_ALLOCATION",
          label: "Part théorique du budget",
          inputValues: {
            allocationWeight: formatExactAmount(prepared.allocationWeight),
            totalAllocationWeight: formatExactAmount(totalAllocationWeight),
            budgetTarget: formatExactAmount(budgetTargetResult.exactAmount),
            calibrationCoefficient: formatExactAmount(calibrationCoefficient),
            theoreticalIncreaseRate: formatExactAmount(theoreticalIncreaseRate),
          },
          outputValue: formatExactAmount(theo.theoreticalAmount),
          formula:
            "budget × (salary × effectiveMatrixWeight) / Σ(salary × effectiveMatrixWeight)",
          reason: "Montant théorique exact ; aucun arrondi.",
        },
        ...round.explanationSteps,
        {
          code: "EMPLOYEE_FINAL_AMOUNT_ROUNDED",
          label: "Montant matriciel final arrondi",
          inputValues: {
            theoreticalIncreaseAmount: formatExactAmount(theo.theoreticalAmount),
            stepFcfa: rounded.roundingPolicy.stepFcfa.toString(),
          },
          outputValue: round.finalRoundedAmountFcfa.toString(),
          formula: "roundPopulationAllocations (nearest_half_up)",
          reason: "Seul stade d’arrondi du pipeline.",
        },
      ];

      return {
        employeeId: prepared.employeeId,
        familyCode: prepared.familyCode,
        gradeCode: prepared.gradeCode,
        salaryFcfa: prepared.salaryFcfa,
        s0Fcfa: prepared.s0Resolution.s0Fcfa,
        salaryRatioBasisPoints: prepared.salaryPositionResult.ratioBasisPoints,
        salaryPositionCode: prepared.salaryPositionResult.positionCode,
        salaryPositionLabel: prepared.salaryPositionResult.positionLabel,
        positionFactorMilli: prepared.salaryPositionResult.positionFactorMilli,
        evaluationMode: prepared.evaluationFactorResult.mode,
        performanceLevel: prepared.evaluationFactorResult.performanceLevel,
        potentialLevel: prepared.evaluationFactorResult.potentialLevel,
        evaluationFactorNumerator:
          prepared.evaluationFactorResult.exactFactorNumerator,
        evaluationFactorScale: prepared.evaluationFactorResult.exactFactorScale,
        theoreticalMatrixWeight: prepared.theoreticalMatrixWeight,
        effectiveMatrixWeight: prepared.effectiveMatrixWeight,
        allocationWeight: prepared.allocationWeight,
        calibrationCoefficient,
        theoreticalIncreaseRate,
        theoreticalIncreaseAmount: theo.theoreticalAmount,
        finalRoundedIncreaseAmountFcfa: round.finalRoundedAmountFcfa,
        individualRoundingDelta: round.individualRoundingDelta,
        blockingReason: prepared.blockingReason,
        explanationSteps: employeeSteps,
      };
    },
  );

  let populationSalarySumFcfa = 0n;
  let positiveWeightEmployeeCount = 0;
  let zeroWeightEmployeeCount = 0;
  let confirmedUnderperformerCount = 0;
  for (const employee of employees) {
    populationSalarySumFcfa += employee.salaryFcfa;
    if (isZeroFraction(employee.allocationWeight)) {
      zeroWeightEmployeeCount += 1;
    } else {
      positiveWeightEmployeeCount += 1;
    }
    if (employee.blockingReason === "CONFIRMED_UNDERPERFORMER") {
      confirmedUnderperformerCount += 1;
    }
  }

  const populationSummary: PopulationCalculationSummary = {
    employeeCount: employees.length,
    positiveWeightEmployeeCount,
    zeroWeightEmployeeCount,
    confirmedUnderperformerCount,
    budgetTargetExact: budgetTargetResult.exactAmount,
    totalAllocationWeight,
    calibrationCoefficient,
    theoreticalAllocatedTotal: theoretical.theoreticalAllocatedTotal,
    actualOperationAmountFcfa: rounded.actualOperationAmountFcfa,
    totalRoundingDelta: rounded.totalRoundingDelta,
    roundingStepFcfa: rounded.roundingPolicy.stepFcfa,
    evaluationMode: input.references.evaluationMode,
    allocationBasis: ALLOCATION_BASIS_SALARY_TIMES_MATRIX_WEIGHT,
    isTheoreticalBudgetExactlyAllocated: theoretical.isExactlyAllocated,
    populationSalarySumFcfa,
  };

  const explanationSteps: CalculationExplanationStep[] = [
    ...budgetTargetResult.explanationSteps,
    {
      code: "POPULATION_ALLOCATION_BASIS",
      label: "Convention de répartition",
      inputValues: {
        allocationBasis: ALLOCATION_BASIS_SALARY_TIMES_MATRIX_WEIGHT,
        employeeCount: employees.length,
      },
      outputValue: ALLOCATION_BASIS_SALARY_TIMES_MATRIX_WEIGHT,
      formula: "allocationWeight = salaryFcfa × effectiveMatrixWeight",
      reason:
        "Convention JRB : même poids matriciel ⇒ même taux théorique d’augmentation.",
    },
    {
      code: "POPULATION_THEORETICAL_TOTAL",
      label: "Total théorique alloué",
      inputValues: {
        totalAllocationWeight: formatExactAmount(totalAllocationWeight),
        calibrationCoefficient: formatExactAmount(calibrationCoefficient),
        populationSalarySumFcfa: populationSalarySumFcfa.toString(),
        eligiblePayrollReceived:
          budgetTargetResult.eligiblePayrollFcfa?.toString() ?? null,
      },
      outputValue: formatExactAmount(theoretical.theoreticalAllocatedTotal),
      formula: "Σ theoreticalIncreaseAmount = budgetTargetExact",
      reason: "Invariant rationnel ; pas d’égalité imposée avec l’assiette reçue.",
    },
    {
      code: "POPULATION_ACTUAL_OPERATION_TOTAL",
      label: "Montant réel de l’opération",
      inputValues: {
        roundingMode: rounded.roundingPolicy.mode,
        stepFcfa: rounded.roundingPolicy.stepFcfa.toString(),
      },
      outputValue: rounded.actualOperationAmountFcfa.toString(),
      formula: "Σ finalRoundedIncreaseAmountFcfa",
      reason: "Somme des montants matriciels individuels arrondis.",
    },
    {
      code: "POPULATION_TOTAL_ROUNDING_DELTA",
      label: "Écart total d’arrondi",
      inputValues: {
        actualOperationAmountFcfa: rounded.actualOperationAmountFcfa.toString(),
        budgetTargetExact: formatExactAmount(budgetTargetResult.exactAmount),
      },
      outputValue: formatExactAmount(rounded.totalRoundingDelta),
      formula: "actualOperationAmountFcfa - budgetTargetExact",
      reason: "Peut être négatif, nul ou positif.",
    },
    {
      code: "NO_FORCED_RECONCILIATION",
      label: "Absence de réconciliation forcée",
      inputValues: { method: "none" },
      outputValue: false,
      formula: "no largest-remainder",
      reason: "Le total réel n’est pas forcé au budget cible.",
    },
  ];

  if (
    !fractionsEqual(
      theoretical.theoreticalAllocatedTotal,
      budgetTargetResult.exactAmount,
    )
  ) {
    throw new CompensationCalculationError(
      "THEORETICAL_ALLOCATION_RECONCILIATION_FAILED",
      "La somme théorique ne reproduit pas le budget cible.",
    );
  }

  return {
    budgetTargetResult,
    evaluationMode: input.references.evaluationMode,
    roundingPolicy: rounded.roundingPolicy,
    allocationBasis: ALLOCATION_BASIS_SALARY_TIMES_MATRIX_WEIGHT,
    totalAllocationWeight,
    calibrationCoefficient,
    employees,
    totalTheoreticalAllocation: theoretical.theoreticalAllocatedTotal,
    actualOperationAmountFcfa: rounded.actualOperationAmountFcfa,
    totalRoundingDelta: rounded.totalRoundingDelta,
    populationSummary,
    explanationSteps,
  };
}
