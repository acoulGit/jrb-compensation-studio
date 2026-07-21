/**
 * Mapping CampaignSimulationExecutionResult → SaveSimulationRunDto
 * (Lot 2B-4A / sémantique schema v2 — correctif 2A-H1).
 *
 * Mapping colonnes persistées (result_schema_version = 2) :
 * - budget_target = annuel (contrat 2 / rétro janvier implicite)
 * - theoretical_total = allocation annuelle totale
 * - actual_operation_amount = coût annuel réel
 * - total_rounding_delta = écart annuel
 * - theoretical_increase_rate = taux mensuel
 * - theoretical_increase_amount = augmentation mensuelle théorique
 * - final_rounded_increase = augmentation mensuelle finale
 * - individual_rounding_delta = écart mensuel
 * - final_salary = salaire mensuel final
 *
 * Contrat 3 (période configurable) : sauvegarde refusée tant que le schema v3
 * n’est pas consolidé — voir `assertSimulationResultPersistable`.
 */

import {
  CALCULATION_CONTRACT_VERSION,
  RESULT_SCHEMA_VERSION,
} from "../../domain/compensationCalculation";
import { CompensationCalculationError } from "../../domain/compensationCalculation";
import type { CampaignSimulationExecutionResult } from "./campaignSimulationExecutionModels";
import {
  bigintToCanonicalText,
  exactAmountToCanonicalTexts,
} from "./canonicalDecimalText";
import type {
  SaveSimulationEmployeeDto,
  SaveSimulationRunDto,
} from "./simulationPersistenceModels";

/**
 * Interdit la sauvegarde silencieuse d’un résultat contrat 3 dans un snapshot
 * schema v2 incomplet. N’affecte pas le calcul ni l’affichage.
 */
export function assertSimulationResultPersistable(input: {
  calculationContractVersion: number;
  resultSchemaVersion?: number;
}): void {
  const schemaVersion = input.resultSchemaVersion ?? RESULT_SCHEMA_VERSION;
  if (
    input.calculationContractVersion >= 3 &&
    schemaVersion < 3
  ) {
    throw new CompensationCalculationError(
      "SIMULATION_SNAPSHOT_SCHEMA_REQUIRES_CONSOLIDATION",
      "Cette simulation utilise le contrat de période configurable et ne peut pas encore être enregistrée dans l’ancien format d’historique. Finalisez la consolidation de persistance avant l’enregistrement.",
    );
  }
}

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
  const theoRate = exactAmountToCanonicalTexts(
    employee.monthlyTheoreticalIncreaseRate,
  );
  const theoAmount = exactAmountToCanonicalTexts(
    employee.monthlyTheoreticalIncrease,
  );
  const roundingDelta = exactAmountToCanonicalTexts(
    employee.monthlyRoundingDelta,
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
      employee.monthlyFinalRoundedIncreaseFcfa,
    ),
    individualRoundingDeltaNumeratorText: roundingDelta.numeratorText,
    individualRoundingDeltaDenominatorText: roundingDelta.denominatorText,
    finalSalaryFcfaText: bigintToCanonicalText(employee.monthlyFinalSalaryFcfa),
    explanationStepsJson: JSON.stringify(employee.explanationSteps),
  };
}

export function mapExecutionResultToSaveDto(input: {
  result: CampaignSimulationExecutionResult;
  expectedCampaignStatus: "draft" | "active";
  sourceImportFileName: string | null;
}): SaveSimulationRunDto {
  const { result } = input;

  assertSimulationResultPersistable({
    calculationContractVersion:
      result.calculationContractVersion ?? CALCULATION_CONTRACT_VERSION,
    resultSchemaVersion: RESULT_SCHEMA_VERSION,
  });

  const budget = result.budgetSummary;
  const population = result.populationSummary;
  const budgetTarget = exactAmountToCanonicalTexts(budget.exactBudgetTarget);
  const theoretical = exactAmountToCanonicalTexts(
    budget.annualTheoreticalAllocatedTotal,
  );
  const roundingDelta = exactAmountToCanonicalTexts(
    budget.annualTotalRoundingDelta,
  );

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
      budget.annualActualOperationCostFcfa,
    ),
    totalRoundingDeltaNumeratorText: roundingDelta.numeratorText,
    totalRoundingDeltaDenominatorText: roundingDelta.denominatorText,
    employees: result.employees.map(mapEmployee),
  };
}

export { RESULT_SCHEMA_VERSION };
