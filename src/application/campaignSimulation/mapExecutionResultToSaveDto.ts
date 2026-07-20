/**
 * Mapping CampaignSimulationExecutionResult → SaveSimulationRunDto (Lot 2B-4A).
 * Ne mute pas le résultat source.
 */

import type { CampaignSimulationExecutionResult } from "./campaignSimulationExecutionModels";
import {
  bigintToCanonicalText,
  exactAmountToCanonicalTexts,
} from "./canonicalDecimalText";
import type {
  SaveSimulationEmployeeDto,
  SaveSimulationRunDto,
} from "./simulationPersistenceModels";

function mapEmployee(
  employee: CampaignSimulationExecutionResult["employees"][number],
): SaveSimulationEmployeeDto {
  const evaluationFactor = exactAmountToCanonicalTexts(employee.evaluationFactor);
  const theoreticalWeight = exactAmountToCanonicalTexts(
    employee.theoreticalMatrixWeight,
  );
  const effectiveWeight = exactAmountToCanonicalTexts(
    employee.effectiveMatrixWeight,
  );
  const allocationWeight = exactAmountToCanonicalTexts(employee.allocationWeight);
  const theoRate = exactAmountToCanonicalTexts(employee.theoreticalIncreaseRate);
  const theoAmount = exactAmountToCanonicalTexts(
    employee.theoreticalIncreaseAmount,
  );
  const roundingDelta = exactAmountToCanonicalTexts(
    employee.individualRoundingDelta,
  );

  return {
    employeeId: employee.employeeId,
    employeeDisplayName: employee.employeeDisplayName,
    familyCode: employee.familyCode,
    familyLabel: employee.familyLabel,
    gradeCode: employee.gradeCode,
    gradeLabel: employee.gradeLabel,
    salaryFcfaText: bigintToCanonicalText(employee.salaryFcfa),
    s0FcfaText: bigintToCanonicalText(employee.s0Fcfa),
    salaryRatioBasisPoints: employee.salaryRatioBasisPoints,
    salaryPositionCode: employee.salaryPositionCode,
    salaryPositionLabel: employee.salaryPositionLabel,
    positionFactorMilli: employee.positionFactorMilli,
    evaluationMode: employee.evaluationMode,
    performanceLevel: employee.performanceLevel,
    potentialLevel: employee.potentialLevel,
    evaluationFactorNumeratorText: evaluationFactor.numeratorText,
    evaluationFactorDenominatorText: evaluationFactor.denominatorText,
    theoreticalMatrixWeightNumeratorText: theoreticalWeight.numeratorText,
    theoreticalMatrixWeightDenominatorText: theoreticalWeight.denominatorText,
    effectiveMatrixWeightNumeratorText: effectiveWeight.numeratorText,
    effectiveMatrixWeightDenominatorText: effectiveWeight.denominatorText,
    allocationWeightNumeratorText: allocationWeight.numeratorText,
    allocationWeightDenominatorText: allocationWeight.denominatorText,
    blockingReason: employee.blockingReason,
    theoreticalIncreaseRateNumeratorText: theoRate.numeratorText,
    theoreticalIncreaseRateDenominatorText: theoRate.denominatorText,
    theoreticalIncreaseAmountNumeratorText: theoAmount.numeratorText,
    theoreticalIncreaseAmountDenominatorText: theoAmount.denominatorText,
    finalRoundedIncreaseFcfaText: bigintToCanonicalText(
      employee.finalRoundedIncreaseAmountFcfa,
    ),
    individualRoundingDeltaNumeratorText: roundingDelta.numeratorText,
    individualRoundingDeltaDenominatorText: roundingDelta.denominatorText,
    finalSalaryFcfaText: bigintToCanonicalText(employee.finalSalaryFcfa),
    explanationStepsJson: JSON.stringify(employee.explanationSteps),
  };
}

export function mapExecutionResultToSaveDto(input: {
  result: CampaignSimulationExecutionResult;
  expectedCampaignStatus: "draft" | "active";
  sourceImportFileName: string | null;
}): SaveSimulationRunDto {
  const { result } = input;
  const budget = result.budgetSummary;
  const population = result.populationSummary;
  const budgetTarget = exactAmountToCanonicalTexts(budget.exactBudgetTarget);
  const theoretical = exactAmountToCanonicalTexts(
    budget.theoreticalAllocatedTotal,
  );
  const roundingDelta = exactAmountToCanonicalTexts(budget.totalRoundingDelta);

  if (result.campaignStatus === "unknown" || result.campaignStatus === "archived") {
    throw new Error(
      "Le statut de campagne du résultat n’est pas enregistrable.",
    );
  }

  return {
    campaignId: result.campaignId,
    expectedCampaignStatus: input.expectedCampaignStatus,
    expectedCurrentImportBatchId: result.currentImportBatchId,
    campaignName: result.campaignName ?? `Campagne #${result.campaignId}`,
    campaignYear: result.campaignYear ?? 0,
    campaignStatusAtRun: result.campaignStatus,
    evaluationMode: result.evaluationMode,
    sourceImportBatchId: result.currentImportBatchId,
    sourceImportFileName: input.sourceImportFileName,
    sourceFingerprint: result.sourceFingerprint,
    configurationFingerprint: result.configurationFingerprint,
    budgetTargetMode: budget.budgetTargetMode,
    manualBudgetFcfaText:
      budget.manualBudgetFcfa !== undefined
        ? bigintToCanonicalText(budget.manualBudgetFcfa)
        : null,
    eligiblePayrollFcfaText:
      budget.eligiblePayrollFcfa !== undefined
        ? bigintToCanonicalText(budget.eligiblePayrollFcfa)
        : null,
    budgetRateBasisPoints:
      budget.budgetRateBasisPoints !== undefined
        ? Number(budget.budgetRateBasisPoints)
        : null,
    budgetTargetNumeratorText: budgetTarget.numeratorText,
    budgetTargetDenominatorText: budgetTarget.denominatorText,
    roundingMode: budget.roundingMode,
    roundingStepFcfaText: bigintToCanonicalText(budget.roundingStepFcfa),
    employeeCount: population.employeeCount,
    positiveWeightEmployeeCount: population.positiveWeightEmployeeCount,
    zeroWeightEmployeeCount: population.zeroWeightEmployeeCount,
    confirmedUnderperformerCount: population.confirmedUnderperformerCount,
    theoreticalTotalNumeratorText: theoretical.numeratorText,
    theoreticalTotalDenominatorText: theoretical.denominatorText,
    actualOperationAmountFcfaText: bigintToCanonicalText(
      budget.actualOperationAmountFcfa,
    ),
    totalRoundingDeltaNumeratorText: roundingDelta.numeratorText,
    totalRoundingDeltaDenominatorText: roundingDelta.denominatorText,
    employees: result.employees.map(mapEmployee),
  };
}
