/** Orchestrateur end-to-end population préparée (Lot 2A-4 / correctif 2A-H1). */

import { allocateTheoreticalPopulationBudget } from "./allocateTheoreticalPopulationBudget";
import {
  computeBaseSalaryReminderBreakdown,
  technicalApplicationMonthLabelFr,
  validateApplicationCalendar,
} from "./baseSalaryReminder";
import { calculatePreparedEmployeeCompensation } from "./calculatePreparedEmployeeCompensation";
import { ANNUAL_BUDGET_PERIOD_MONTHS } from "./calculationContract";
import { CompensationCalculationError } from "./errors";
import {
  addFractions,
  divideFractions,
  exactAmountFromInteger,
  formatExactAmount,
  fractionsEqual,
  isZeroFraction,
  multiplyFractions,
  subtractFractions,
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
 *
 * Pipeline H1 :
 * 1. résoudre le budget ANNUEL ;
 * 2. allouer les parts ANNUELLES exactes ;
 * 3. convertir chaque part en augmentation MENSUELLE (/ 12) ;
 * 4. arrondir uniquement l’augmentation mensuelle ;
 * 5. coût annuel réel = Σ (mensuel arrondi × 12).
 *
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

  try {
    validateApplicationCalendar({
      campaignYear: input.campaignYear,
      technicalApplicationMonth: input.technicalApplicationMonth,
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
            step: "application_calendar",
          },
        ]),
      );
    }
    throw error;
  }

  const annualBudgetTarget = budgetTargetResult.exactAmount;

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

  let theoreticalAnnual;
  try {
    theoreticalAnnual = allocateTheoreticalPopulationBudget({
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

  // Conversion annuelle → mensuelle exacte (÷ 12), sans arrondi préalable.
  const monthlyBudgetTarget = divideFractions(
    annualBudgetTarget,
    exactAmountFromInteger(ANNUAL_BUDGET_PERIOD_MONTHS),
  );
  const monthlyTheoretical = {
    ...theoreticalAnnual,
    budgetTarget: monthlyBudgetTarget,
    theoreticalAllocatedTotal: divideFractions(
      theoreticalAnnual.theoreticalAllocatedTotal,
      exactAmountFromInteger(ANNUAL_BUDGET_PERIOD_MONTHS),
    ),
    allocations: theoreticalAnnual.allocations.map((allocation) => ({
      ...allocation,
      theoreticalAmount: divideFractions(
        allocation.theoreticalAmount,
        exactAmountFromInteger(ANNUAL_BUDGET_PERIOD_MONTHS),
      ),
    })),
  };

  const roundedMonthly = roundPopulationAllocations({
    theoretical: monthlyTheoretical,
    roundingPolicy: input.roundingPolicy,
  });

  // Coût annuel réel = Σ (mensuel arrondi × 12) — ne pas comparer la somme
  // des mensuels arrondis au budget annuel directement.
  const annualActualOperationCostFcfa =
    roundedMonthly.actualOperationAmountFcfa * ANNUAL_BUDGET_PERIOD_MONTHS;
  const annualTotalRoundingDelta = subtractFractions(
    exactAmountFromInteger(annualActualOperationCostFcfa),
    annualBudgetTarget,
  );

  const calibrationCoefficient: ExactAmount = isZeroFraction(
    totalAllocationWeight,
  )
    ? exactAmountFromInteger(0n)
    : divideFractions(annualBudgetTarget, totalAllocationWeight);

  const roundedById = new Map(
    roundedMonthly.allocations.map((item) => [item.employeeId, item]),
  );
  const annualTheoById = new Map(
    theoreticalAnnual.allocations.map((item) => [item.employeeId, item]),
  );

  const employees: EmployeeCompensationCalculationResult[] = sortedPrepared.map(
    (prepared) => {
      const annualTheo = annualTheoById.get(prepared.employeeId)!;
      const monthlyRound = roundedById.get(prepared.employeeId)!;
      const annualTheoreticalAllocation = annualTheo.theoreticalAmount;
      const monthlyTheoreticalIncrease = monthlyRound.theoreticalAmount;
      const monthlyFinalRoundedIncreaseFcfa =
        monthlyRound.finalRoundedAmountFcfa;
      const monthlyRoundingDelta = monthlyRound.individualRoundingDelta;
      const annualActualCostFcfa =
        monthlyFinalRoundedIncreaseFcfa * ANNUAL_BUDGET_PERIOD_MONTHS;
      const annualRoundingDelta = subtractFractions(
        exactAmountFromInteger(annualActualCostFcfa),
        annualTheoreticalAllocation,
      );

      // Taux mensuel = monthlyIncrease / monthlySalary
      // (= annualAllocation / (monthlySalary × 12)).
      const monthlyTheoreticalIncreaseRate =
        prepared.salaryFcfa === 0n || isZeroFraction(monthlyTheoreticalIncrease)
          ? exactAmountFromInteger(0n)
          : divideFractions(
              monthlyTheoreticalIncrease,
              exactAmountFromInteger(prepared.salaryFcfa),
            );

      const monthlyFinalSalaryFcfa =
        prepared.salaryFcfa + monthlyFinalRoundedIncreaseFcfa;

      const reminder = computeBaseSalaryReminderBreakdown({
        campaignYear: input.campaignYear,
        technicalApplicationMonth: input.technicalApplicationMonth,
        monthlyFinalIncreaseFcfa: monthlyFinalRoundedIncreaseFcfa,
      });

      if (reminder.annualActualBaseIncreaseCostFcfa !== annualActualCostFcfa) {
        throw new CompensationCalculationError(
          "BASE_SALARY_REMINDER_INVARIANT_FAILED",
          `Incohérence coût annuel pour ${prepared.employeeId}.`,
        );
      }

      const employeeSteps: CalculationExplanationStep[] = [
        ...prepared.explanationSteps,
        {
          code: "EMPLOYEE_ANNUAL_THEORETICAL_ALLOCATION",
          label: "Allocation théorique annuelle",
          inputValues: {
            allocationWeight: formatExactAmount(prepared.allocationWeight),
            totalAllocationWeight: formatExactAmount(totalAllocationWeight),
            annualBudgetTarget: formatExactAmount(annualBudgetTarget),
            calibrationCoefficient: formatExactAmount(calibrationCoefficient),
          },
          outputValue: formatExactAmount(annualTheoreticalAllocation),
          formula:
            "annualBudget × (monthlySalary × effectiveMatrixWeight) / Σ(monthlySalary × effectiveMatrixWeight)",
          reason:
            "Part annuelle exacte ; aucun arrondi. Le facteur 12 du poids s’annule.",
        },
        {
          code: "EMPLOYEE_MONTHLY_THEORETICAL_INCREASE",
          label: "Augmentation mensuelle théorique",
          inputValues: {
            annualTheoreticalAllocation: formatExactAmount(
              annualTheoreticalAllocation,
            ),
            annualBudgetPeriodMonths: ANNUAL_BUDGET_PERIOD_MONTHS.toString(),
          },
          outputValue: formatExactAmount(monthlyTheoreticalIncrease),
          formula: "monthlyTheoreticalIncrease = annualTheoreticalAllocation / 12",
          reason: "Division rationnelle exacte ; pas d’arrondi avant le pas mensuel.",
        },
        {
          code: "EMPLOYEE_MONTHLY_INCREASE_RATE",
          label: "Taux d’augmentation mensuel",
          inputValues: {
            monthlyTheoreticalIncrease: formatExactAmount(
              monthlyTheoreticalIncrease,
            ),
            monthlyBaseSalary: prepared.salaryFcfa.toString(),
          },
          outputValue: formatExactAmount(monthlyTheoreticalIncreaseRate),
          formula:
            "monthlyRate = monthlyTheoreticalIncrease / monthlyBaseSalary",
          reason:
            "Équivaut à annualAllocation / (monthlySalary × 12). Ne jamais diviser l’annuel par le mensuel sans ÷12.",
        },
        ...monthlyRound.explanationSteps,
        {
          code: "EMPLOYEE_MONTHLY_FINAL_ROUNDED",
          label: "Augmentation mensuelle finale arrondie",
          inputValues: {
            monthlyTheoreticalIncrease: formatExactAmount(
              monthlyTheoreticalIncrease,
            ),
            stepFcfa: roundedMonthly.roundingPolicy.stepFcfa.toString(),
          },
          outputValue: monthlyFinalRoundedIncreaseFcfa.toString(),
          formula: "round(monthlyTheoreticalIncrease, roundingPolicy)",
          reason: "Seul stade d’arrondi du pipeline (pas mensuel).",
        },
        {
          code: "EMPLOYEE_ANNUAL_ACTUAL_COST",
          label: "Coût annuel réel",
          inputValues: {
            monthlyFinalRoundedIncreaseFcfa:
              monthlyFinalRoundedIncreaseFcfa.toString(),
            annualBudgetPeriodMonths: ANNUAL_BUDGET_PERIOD_MONTHS.toString(),
          },
          outputValue: annualActualCostFcfa.toString(),
          formula: "annualActualCost = monthlyFinalRoundedIncrease × 12",
          reason: "Annualisation exacte de l’augmentation mensuelle arrondie.",
        },
        {
          code: "EMPLOYEE_BASE_SALARY_REMINDER",
          label: "Rappel de salaire de base",
          inputValues: {
            campaignYear: reminder.campaignYear,
            technicalApplicationMonth: reminder.technicalApplicationMonth,
            technicalApplicationMonthLabel: technicalApplicationMonthLabelFr(
              reminder.technicalApplicationMonth,
            ),
            retroactiveMonths: reminder.retroactiveMonths,
            remainingDirectPaymentMonths: reminder.remainingDirectPaymentMonths,
            monthlyFinalIncreaseFcfa: monthlyFinalRoundedIncreaseFcfa.toString(),
          },
          outputValue: reminder.baseSalaryReminderFcfa.toString(),
          formula:
            "rappel = monthlyFinal × (moisApplication - 1) ; direct = monthlyFinal × (13 - moisApplication)",
          reason:
            "Décalage de paiement depuis le 1er janvier — pas de coût additionnel au budget annuel.",
        },
        {
          code: "EMPLOYEE_MONTHLY_FINAL_SALARY",
          label: "Nouveau salaire mensuel",
          inputValues: {
            monthlyBaseSalary: prepared.salaryFcfa.toString(),
            monthlyFinalRoundedIncreaseFcfa:
              monthlyFinalRoundedIncreaseFcfa.toString(),
          },
          outputValue: monthlyFinalSalaryFcfa.toString(),
          formula:
            "monthlyFinalSalary = monthlyBaseSalary + monthlyFinalRoundedIncrease",
          reason: "Le nouveau salaire reste mensuel.",
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
        annualTheoreticalAllocation,
        monthlyTheoreticalIncrease,
        monthlyTheoreticalIncreaseRate,
        monthlyFinalRoundedIncreaseFcfa,
        monthlyRoundingDelta,
        annualActualCostFcfa,
        annualRoundingDelta,
        monthlyFinalSalaryFcfa,
        campaignYear: reminder.campaignYear,
        technicalApplicationMonth: reminder.technicalApplicationMonth,
        retroactiveMonths: reminder.retroactiveMonths,
        remainingDirectPaymentMonths: reminder.remainingDirectPaymentMonths,
        baseSalaryReminderFcfa: reminder.baseSalaryReminderFcfa,
        remainingYearDirectIncreaseCostFcfa:
          reminder.remainingYearDirectIncreaseCostFcfa,
        annualActualBaseIncreaseCostFcfa:
          reminder.annualActualBaseIncreaseCostFcfa,
        blockingReason: prepared.blockingReason,
        explanationSteps: employeeSteps,
      };
    },
  );

  let populationSalarySumFcfa = 0n;
  let positiveWeightEmployeeCount = 0;
  let zeroWeightEmployeeCount = 0;
  let confirmedUnderperformerCount = 0;
  let totalBaseSalaryReminderFcfa = 0n;
  let totalRemainingYearDirectIncreaseCostFcfa = 0n;
  let totalAnnualActualBaseIncreaseCostFcfa = 0n;
  for (const employee of employees) {
    populationSalarySumFcfa += employee.salaryFcfa;
    totalBaseSalaryReminderFcfa += employee.baseSalaryReminderFcfa;
    totalRemainingYearDirectIncreaseCostFcfa +=
      employee.remainingYearDirectIncreaseCostFcfa;
    totalAnnualActualBaseIncreaseCostFcfa +=
      employee.annualActualBaseIncreaseCostFcfa;
    if (isZeroFraction(employee.allocationWeight)) {
      zeroWeightEmployeeCount += 1;
    } else {
      positiveWeightEmployeeCount += 1;
    }
    if (employee.blockingReason === "CONFIRMED_UNDERPERFORMER") {
      confirmedUnderperformerCount += 1;
    }
  }

  if (
    totalBaseSalaryReminderFcfa + totalRemainingYearDirectIncreaseCostFcfa !==
    totalAnnualActualBaseIncreaseCostFcfa
  ) {
    throw new CompensationCalculationError(
      "BASE_SALARY_REMINDER_INVARIANT_FAILED",
      "Incohérence population : rappel + paiement direct ≠ coût annuel.",
    );
  }
  if (totalAnnualActualBaseIncreaseCostFcfa !== annualActualOperationCostFcfa) {
    throw new CompensationCalculationError(
      "BASE_SALARY_REMINDER_INVARIANT_FAILED",
      "Incohérence population : coût annuel base ≠ coût annuel opération.",
    );
  }

  const annualTheoreticalAllocatedTotal =
    theoreticalAnnual.theoreticalAllocatedTotal;
  const monthlyTheoreticalIncreaseTotal = monthlyTheoretical.theoreticalAllocatedTotal;

  const populationSummary: PopulationCalculationSummary = {
    employeeCount: employees.length,
    positiveWeightEmployeeCount,
    zeroWeightEmployeeCount,
    confirmedUnderperformerCount,
    annualBudgetTarget,
    totalAllocationWeight,
    calibrationCoefficient,
    annualTheoreticalAllocatedTotal,
    monthlyTheoreticalIncreaseTotal,
    annualActualOperationCostFcfa,
    annualTotalRoundingDelta,
    roundingStepFcfa: roundedMonthly.roundingPolicy.stepFcfa,
    evaluationMode: input.references.evaluationMode,
    allocationBasis: ALLOCATION_BASIS_SALARY_TIMES_MATRIX_WEIGHT,
    isTheoreticalBudgetExactlyAllocated: theoreticalAnnual.isExactlyAllocated,
    populationSalarySumFcfa,
    campaignYear: input.campaignYear,
    technicalApplicationMonth: input.technicalApplicationMonth,
    totalBaseSalaryReminderFcfa,
    totalRemainingYearDirectIncreaseCostFcfa,
    totalAnnualActualBaseIncreaseCostFcfa,
  };

  const explanationSteps: CalculationExplanationStep[] = [
    ...budgetTargetResult.explanationSteps,
    {
      code: "POPULATION_ALLOCATION_BASIS",
      label: "Convention de répartition",
      inputValues: {
        allocationBasis: ALLOCATION_BASIS_SALARY_TIMES_MATRIX_WEIGHT,
        employeeCount: employees.length,
        annualBudgetPeriodMonths: ANNUAL_BUDGET_PERIOD_MONTHS.toString(),
      },
      outputValue: ALLOCATION_BASIS_SALARY_TIMES_MATRIX_WEIGHT,
      formula:
        "allocationWeight = monthlySalaryFcfa × effectiveMatrixWeight (facteur 12 s’annule)",
      reason:
        "Convention JRB : même poids matriciel ⇒ même taux théorique d’augmentation mensuel.",
    },
    {
      code: "POPULATION_ANNUAL_THEORETICAL_TOTAL",
      label: "Total théorique annuel alloué",
      inputValues: {
        totalAllocationWeight: formatExactAmount(totalAllocationWeight),
        calibrationCoefficient: formatExactAmount(calibrationCoefficient),
        populationMonthlySalarySumFcfa: populationSalarySumFcfa.toString(),
      },
      outputValue: formatExactAmount(annualTheoreticalAllocatedTotal),
      formula: "Σ annualTheoreticalAllocation = annualBudgetTarget",
      reason: "Invariant rationnel ; allocation sur l’enveloppe annuelle complète.",
    },
    {
      code: "POPULATION_MONTHLY_THEORETICAL_TOTAL",
      label: "Total théorique mensuel",
      inputValues: {
        annualTheoreticalAllocatedTotal: formatExactAmount(
          annualTheoreticalAllocatedTotal,
        ),
      },
      outputValue: formatExactAmount(monthlyTheoreticalIncreaseTotal),
      formula: "monthlyTheoreticalIncreaseTotal = annualTheoreticalAllocatedTotal / 12",
      reason: "Division exacte avant arrondi individuel.",
    },
    {
      code: "POPULATION_ANNUAL_ACTUAL_OPERATION_COST",
      label: "Coût annuel réel de l’opération",
      inputValues: {
        roundingMode: roundedMonthly.roundingPolicy.mode,
        stepFcfa: roundedMonthly.roundingPolicy.stepFcfa.toString(),
        monthlyRoundedTotal: roundedMonthly.actualOperationAmountFcfa.toString(),
      },
      outputValue: annualActualOperationCostFcfa.toString(),
      formula: "Σ (monthlyFinalRoundedIncrease × 12)",
      reason:
        "Ne pas comparer la somme des augmentations mensuelles arrondies au budget annuel.",
    },
    {
      code: "POPULATION_ANNUAL_TOTAL_ROUNDING_DELTA",
      label: "Écart annuel total d’arrondi",
      inputValues: {
        annualActualOperationCostFcfa: annualActualOperationCostFcfa.toString(),
        annualBudgetTarget: formatExactAmount(annualBudgetTarget),
      },
      outputValue: formatExactAmount(annualTotalRoundingDelta),
      formula: "annualActualOperationCost − annualBudgetTarget",
      reason: "Équivaut à Σ monthlyRoundingDelta × 12 ; peut être négatif, nul ou positif.",
    },
    {
      code: "POPULATION_BASE_SALARY_REMINDER",
      label: "Rappel de salaire de base (population)",
      inputValues: {
        campaignYear: input.campaignYear,
        technicalApplicationMonth: input.technicalApplicationMonth,
        technicalApplicationMonthLabel: technicalApplicationMonthLabelFr(
          input.technicalApplicationMonth,
        ),
        totalBaseSalaryReminderFcfa: totalBaseSalaryReminderFcfa.toString(),
        totalRemainingYearDirectIncreaseCostFcfa:
          totalRemainingYearDirectIncreaseCostFcfa.toString(),
      },
      outputValue: totalAnnualActualBaseIncreaseCostFcfa.toString(),
      formula:
        "Σrappel + Σdirect = Σ(monthlyFinal × 12) — décalage de paiement, pas de coût additionnel",
      reason:
        "Le rappel ne double pas le budget annuel ; il ventile uniquement le calendrier de versement.",
    },
    {
      code: "NO_FORCED_RECONCILIATION",
      label: "Absence de réconciliation forcée",
      inputValues: { method: "none" },
      outputValue: false,
      formula: "no largest-remainder",
      reason: "Le coût annuel réel n’est pas forcé au budget cible.",
    },
  ];

  if (
    !fractionsEqual(annualTheoreticalAllocatedTotal, annualBudgetTarget)
  ) {
    throw new CompensationCalculationError(
      "THEORETICAL_ALLOCATION_RECONCILIATION_FAILED",
      "La somme théorique annuelle ne reproduit pas le budget annuel cible.",
    );
  }

  // Vérification d’équivalence : écart annuel = Σ écarts mensuels × 12
  let sumMonthlyDeltas = exactAmountFromInteger(0n);
  for (const employee of employees) {
    sumMonthlyDeltas = addFractions(
      sumMonthlyDeltas,
      employee.monthlyRoundingDelta,
    );
  }
  const expectedAnnualDelta = multiplyFractions(
    sumMonthlyDeltas,
    exactAmountFromInteger(ANNUAL_BUDGET_PERIOD_MONTHS),
  );
  if (!fractionsEqual(expectedAnnualDelta, annualTotalRoundingDelta)) {
    throw new CompensationCalculationError(
      "POPULATION_CALCULATION_FAILED",
      "Incohérence écart annuel / écarts mensuels × 12.",
    );
  }

  return {
    budgetTargetResult,
    evaluationMode: input.references.evaluationMode,
    roundingPolicy: roundedMonthly.roundingPolicy,
    allocationBasis: ALLOCATION_BASIS_SALARY_TIMES_MATRIX_WEIGHT,
    totalAllocationWeight,
    calibrationCoefficient,
    employees,
    annualTheoreticalAllocatedTotal,
    annualActualOperationCostFcfa,
    annualTotalRoundingDelta,
    campaignYear: input.campaignYear,
    technicalApplicationMonth: input.technicalApplicationMonth,
    totalBaseSalaryReminderFcfa,
    totalRemainingYearDirectIncreaseCostFcfa,
    totalAnnualActualBaseIncreaseCostFcfa,
    populationSummary,
    explanationSteps,
  };
}
