/**
 * Construction de la vue consultable à partir du résultat moteur (Lot 2B-3).
 * Ne recalcule aucun montant métier hors finalSalaryFcfa d’affichage (BigInt).
 */

import {
  formatExactAmount,
  type CalculationExplanationStep,
  type EmployeeCompensationCalculationResult,
  type PreparedPopulationCalculationResult,
} from "../../domain/compensationCalculation";
import type { CampaignStatus } from "../../domain/campaign/models";
import type { NineBoxMode } from "../../domain/compensationReference/models";
import {
  formatBasisPointsAsPercent,
  formatExactAmountAsFcfa,
  formatExactRateAsPercent,
  formatExactWeight,
  formatFactorMilli,
  formatFcfaInteger,
} from "./formatExactBudgetDisplay";
import type {
  CampaignSimulationExecutionResult,
  EmployeeSimulationResultView,
  SimulationBudgetSummaryView,
  SimulationPopulationSummaryView,
} from "./campaignSimulationExecutionModels";

function mapExplanationSteps(
  steps: readonly CalculationExplanationStep[],
): CampaignSimulationExecutionResult["explanationSteps"] {
  return steps.map((step) => ({
    step: step.code,
    formula: step.formula,
    outputValue:
      step.outputValue === null || step.outputValue === undefined
        ? undefined
        : String(step.outputValue),
  }));
}

function formatEvaluationFactor(
  employee: EmployeeCompensationCalculationResult,
): string {
  return formatExactWeight({
    numerator: BigInt(employee.evaluationFactorNumerator),
    denominator: BigInt(employee.evaluationFactorScale),
  });
}

function mapEmployee(
  employee: EmployeeCompensationCalculationResult,
  labels: ReadonlyMap<string, string>,
  familyLabels: ReadonlyMap<string, string>,
  gradeLabels: ReadonlyMap<string, string>,
): EmployeeSimulationResultView {
  const salary = BigInt(employee.salaryFcfa);
  const increase = BigInt(employee.finalRoundedIncreaseAmountFcfa);
  const displayName = labels.get(employee.employeeId) ?? null;
  return {
    employeeId: employee.employeeId,
    employeeDisplayName: displayName,
    familyCode: employee.familyCode,
    familyLabel: familyLabels.get(employee.familyCode) ?? null,
    gradeCode: employee.gradeCode,
    gradeLabel: gradeLabels.get(employee.gradeCode) ?? null,
    salaryFcfa: salary,
    s0Fcfa: BigInt(employee.s0Fcfa),
    salaryRatioBasisPoints: employee.salaryRatioBasisPoints,
    salaryPositionCode: employee.salaryPositionCode,
    salaryPositionLabel: employee.salaryPositionLabel,
    positionFactorMilli: employee.positionFactorMilli,
    evaluationMode: employee.evaluationMode,
    performanceLevel: employee.performanceLevel ?? null,
    potentialLevel: employee.potentialLevel ?? null,
    evaluationFactorLabel: formatEvaluationFactor(employee),
    theoreticalMatrixWeightLabel: formatExactWeight(
      employee.theoreticalMatrixWeight,
    ),
    effectiveMatrixWeightLabel: formatExactWeight(employee.effectiveMatrixWeight),
    allocationWeightLabel: formatExactWeight(employee.allocationWeight),
    blockingReason: employee.blockingReason ?? null,
    theoreticalIncreaseRateLabel: formatExactRateAsPercent(
      employee.theoreticalIncreaseRate,
    ),
    theoreticalIncreaseAmountLabel: formatExactAmountAsFcfa(
      employee.theoreticalIncreaseAmount,
    ),
    finalRoundedIncreaseAmountFcfa: increase,
    individualRoundingDeltaLabel: formatExactAmountAsFcfa(
      employee.individualRoundingDelta,
    ),
    finalSalaryFcfa: salary + increase,
    explanationSteps: mapExplanationSteps(employee.explanationSteps),
  };
}

export function buildSimulationResultView(input: {
  campaignId: number;
  campaignName: string | null;
  campaignYear: number | null;
  campaignStatus: CampaignStatus | "unknown";
  evaluationMode: NineBoxMode;
  currentImportBatchId: number | null;
  runSequence: number;
  sourceFingerprint: string;
  configurationFingerprint: string;
  engineResult: PreparedPopulationCalculationResult;
  employeeLabelsById: ReadonlyMap<string, string>;
  familyLabelsByCode?: ReadonlyMap<string, string>;
  gradeLabelsByCode?: ReadonlyMap<string, string>;
}): CampaignSimulationExecutionResult {
  const { engineResult } = input;
  const summary = engineResult.populationSummary;
  const budgetTarget = engineResult.budgetTargetResult;

  const budgetSummary: SimulationBudgetSummaryView = {
    budgetTargetMode: budgetTarget.mode,
    exactBudgetTarget: budgetTarget.exactAmount,
    exactBudgetTargetLabel: formatExactAmountAsFcfa(budgetTarget.exactAmount),
    manualBudgetFcfa:
      budgetTarget.mode === "manual_amount"
        ? BigInt(budgetTarget.manualBudgetFcfa ?? 0)
        : undefined,
    eligiblePayrollFcfa:
      budgetTarget.mode === "percentage_of_eligible_payroll"
        ? BigInt(budgetTarget.eligiblePayrollFcfa ?? 0)
        : undefined,
    budgetRateBasisPoints:
      budgetTarget.mode === "percentage_of_eligible_payroll"
        ? BigInt(budgetTarget.budgetRateBasisPoints ?? 0)
        : undefined,
    actualOperationAmountFcfa: engineResult.actualOperationAmountFcfa,
    actualOperationAmountLabel: formatFcfaInteger(
      engineResult.actualOperationAmountFcfa,
    ),
    totalRoundingDelta: engineResult.totalRoundingDelta,
    totalRoundingDeltaLabel: formatExactAmountAsFcfa(
      engineResult.totalRoundingDelta,
    ),
    theoreticalAllocatedTotal: summary.theoreticalAllocatedTotal,
    theoreticalAllocatedTotalLabel: formatExactAmountAsFcfa(
      summary.theoreticalAllocatedTotal,
    ),
    roundingMode: engineResult.roundingPolicy.mode,
    roundingStepFcfa: BigInt(engineResult.roundingPolicy.stepFcfa),
  };

  const populationSummary: SimulationPopulationSummaryView = {
    employeeCount: summary.employeeCount,
    positiveWeightEmployeeCount: summary.positiveWeightEmployeeCount,
    zeroWeightEmployeeCount: summary.zeroWeightEmployeeCount,
    confirmedUnderperformerCount: summary.confirmedUnderperformerCount,
    theoreticalAllocatedTotal: summary.theoreticalAllocatedTotal,
    actualOperationAmountFcfa: summary.actualOperationAmountFcfa,
    totalRoundingDelta: summary.totalRoundingDelta,
    isTheoreticalBudgetExactlyAllocated:
      summary.isTheoreticalBudgetExactlyAllocated,
  };

  const familyLabels = input.familyLabelsByCode ?? new Map<string, string>();
  const gradeLabels = input.gradeLabelsByCode ?? new Map<string, string>();

  const employees = engineResult.employees.map((employee) =>
    mapEmployee(
      employee,
      input.employeeLabelsById,
      familyLabels,
      gradeLabels,
    ),
  );

  return {
    campaignId: input.campaignId,
    campaignName: input.campaignName,
    campaignYear: input.campaignYear,
    campaignStatus: input.campaignStatus,
    evaluationMode: input.evaluationMode,
    currentImportBatchId: input.currentImportBatchId,
    runSequence: input.runSequence,
    sourceFingerprint: input.sourceFingerprint,
    configurationFingerprint: input.configurationFingerprint,
    budgetSummary,
    populationSummary,
    employees,
    explanationSteps: mapExplanationSteps(engineResult.explanationSteps),
  };
}

export {
  formatBasisPointsAsPercent,
  formatExactAmountAsFcfa,
  formatExactRateAsPercent,
  formatExactWeight,
  formatFactorMilli,
  formatFcfaInteger,
  formatExactAmount,
};
