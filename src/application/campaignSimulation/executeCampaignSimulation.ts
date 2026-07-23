/**
 * Exécution en mémoire d’une simulation de campagne (Lot 2B-3).
 * Appelle exactement une fois calculatePreparedPopulationCompensation si OK.
 */

import {
  calculatePreparedPopulationCompensation,
  isCompensationCalculationError,
  MINIMUM_INCREASE_CONTRACT_VERSION,
  UNIVERSAL_FIXED_AMOUNT_CONTRACT_VERSION,
  type PreparedPopulationCalculationInput,
} from "../../domain/compensationCalculation";
import { buildCampaignSimulationReadiness } from "./buildCampaignSimulationReadiness";
import { buildSimulationSourceFingerprint } from "./buildSimulationSourceFingerprint";
import { buildSimulationResultView } from "./buildSimulationResultView";
import { buildConfigurationFingerprint } from "./formatExactBudgetDisplay";
import type { CampaignSimulationExecutionCode } from "./campaignSimulationExecutionCodes";
import type { CampaignSimulationReadinessIssue } from "./campaignSimulationModels";
import type {
  ExecuteCampaignSimulationInput,
  ExecuteCampaignSimulationOutcome,
  CampaignSimulationExecutionIssue,
} from "./campaignSimulationExecutionModels";

function failure(
  code: CampaignSimulationExecutionCode,
  message: string,
  issues: CampaignSimulationExecutionIssue[] = [],
  readinessIssues?: CampaignSimulationReadinessIssue[],
): ExecuteCampaignSimulationOutcome {
  return {
    ok: false,
    code,
    message,
    issues:
      issues.length > 0
        ? issues
        : [{ code, message, scope: "campaign" }],
    ...(readinessIssues ? { readinessIssues } : {}),
  };
}

async function loadEmployeeLabels(
  campaignId: number,
  ports: ExecuteCampaignSimulationInput["ports"],
): Promise<Map<string, string>> {
  const labels = new Map<string, string>();
  let offset = 0;
  const limit = 500;
  for (;;) {
    const page = await ports.listCurrentPopulation(campaignId, {
      limit,
      offset,
    });
    for (const item of page.items) {
      if (item.employeeNumber && item.employeeLabel) {
        labels.set(item.employeeNumber, item.employeeLabel);
      }
    }
    offset += page.items.length;
    if (page.items.length < limit || offset >= page.total) {
      break;
    }
  }
  return labels;
}

function collectFamilyGradeLabels(
  references: NonNullable<
    import("./campaignSimulationModels").CampaignSimulationReadinessReport["preparedReferences"]
  >,
): {
  familyLabels: Map<string, string>;
  gradeLabels: Map<string, string>;
} {
  const familyLabels = new Map<string, string>();
  const gradeLabels = new Map<string, string>();
  for (const cell of references.salaryGrid) {
    if (cell.familyLabel) {
      familyLabels.set(cell.familyCode, cell.familyLabel);
    }
    if (cell.gradeLabel) {
      gradeLabels.set(cell.gradeCode, cell.gradeLabel);
    }
  }
  return { familyLabels, gradeLabels };
}

/**
 * Exécute une simulation en mémoire pour une configuration validée.
 * Ne persiste rien. Ne présente jamais un résultat partiel comme valide.
 */
export async function executeCampaignSimulation(
  input: ExecuteCampaignSimulationInput,
): Promise<ExecuteCampaignSimulationOutcome> {
  const {
    campaignId,
    validatedConfiguration,
    expectedSourceFingerprint,
    ports,
    runSequence,
  } = input;

  if (validatedConfiguration.campaignId !== campaignId) {
    return failure(
      "SIMULATION_CONFIGURATION_NOT_VALIDATED",
      "La configuration validée n’appartient pas à la campagne sélectionnée.",
    );
  }

  if (!validatedConfiguration.budgetTarget || !validatedConfiguration.roundingPolicy) {
    return failure(
      "SIMULATION_CONFIGURATION_NOT_VALIDATED",
      "Aucune configuration validée n’est disponible pour cette campagne.",
    );
  }

  const campaign = await ports.getCampaign(campaignId);
  if (!campaign) {
    return failure(
      "CAMPAIGN_NOT_FOUND",
      "La campagne sélectionnée est introuvable.",
    );
  }

  if (campaign.status === "archived") {
    return failure(
      "CAMPAIGN_ARCHIVED",
      "Une campagne archivée ne peut pas lancer une nouvelle simulation.",
    );
  }

  const readinessReport = await buildCampaignSimulationReadiness(
    {
      campaignId,
      budgetTarget: validatedConfiguration.budgetTarget,
      roundingPolicy: validatedConfiguration.roundingPolicy,
    },
    ports,
  );

  if (!readinessReport.isReady) {
    return failure(
      "SIMULATION_NOT_READY",
      "La campagne n’est plus prête pour le calcul. Vérifiez la population et les référentiels.",
      readinessReport.issues.map((issue) => ({
        code: issue.code,
        message: issue.message,
        scope: issue.scope,
        employeeId: issue.employeeId,
        field: issue.field,
        details: issue.details,
      })),
      readinessReport.issues,
    );
  }

  const currentSourceFingerprint = buildSimulationSourceFingerprint({
    campaignId,
    campaignStatus: readinessReport.campaignStatus,
    evaluationMode: readinessReport.evaluationMode,
    currentImportBatchId: readinessReport.currentImportBatchId,
    preparedEmployees: readinessReport.preparedEmployees,
    preparedReferences: readinessReport.preparedReferences,
    budgetTarget: validatedConfiguration.budgetTarget,
    roundingPolicy: validatedConfiguration.roundingPolicy,
    campaignYear: validatedConfiguration.campaignYear,
    technicalApplicationMonth: validatedConfiguration.technicalApplicationMonth,
    retroactivityStartMonth: validatedConfiguration.retroactivityStartMonth,
    minimumGuaranteeEffectiveMonth:
      validatedConfiguration.minimumGuaranteeEffectiveMonth,
    minimumIncreasePolicy: validatedConfiguration.minimumIncreasePolicy,
    socialMechanismKind: validatedConfiguration.socialMechanismKind,
    universalFixedAmountPolicy: validatedConfiguration.universalFixedAmountPolicy,
  });

  const currentConfigFingerprint = buildConfigurationFingerprint({
    campaignId,
    budgetMode: validatedConfiguration.budgetTarget.mode,
    manualBudget:
      validatedConfiguration.budgetTarget.mode === "manual_amount"
        ? BigInt(validatedConfiguration.budgetTarget.manualBudgetFcfa ?? 0)
        : undefined,
    eligiblePayroll:
      validatedConfiguration.budgetTarget.mode === "percentage_of_eligible_payroll"
        ? BigInt(validatedConfiguration.budgetTarget.eligiblePayrollFcfa ?? 0)
        : undefined,
    budgetRateBps:
      validatedConfiguration.budgetTarget.mode === "percentage_of_eligible_payroll"
        ? BigInt(validatedConfiguration.budgetTarget.budgetRateBasisPoints ?? 0)
        : undefined,
    roundingMode: validatedConfiguration.roundingPolicy.mode,
    roundingStep: BigInt(validatedConfiguration.roundingPolicy.stepFcfa),
    campaignYear: validatedConfiguration.campaignYear,
    retroactivityStartMonth: validatedConfiguration.retroactivityStartMonth,
    technicalApplicationMonth: validatedConfiguration.technicalApplicationMonth,
    minimumGuaranteeEffectiveMonth:
      validatedConfiguration.minimumGuaranteeEffectiveMonth,
    minimumIncreaseMode: validatedConfiguration.minimumIncreasePolicy.mode,
    minimumMonthlyAmountFcfa:
      validatedConfiguration.minimumIncreasePolicy.minimumMonthlyAmountFcfa,
    minimumIncreaseRateNumerator:
      validatedConfiguration.minimumIncreasePolicy.minimumIncreaseRate
        ?.numerator ?? null,
    minimumIncreaseRateDenominator:
      validatedConfiguration.minimumIncreasePolicy.minimumIncreaseRate
        ?.denominator ?? null,
    minimumIncreaseContractVersion: MINIMUM_INCREASE_CONTRACT_VERSION,
    socialMechanismKind: validatedConfiguration.socialMechanismKind,
    universalFixedAmountMonthlyAmount:
      validatedConfiguration.socialMechanismKind === "universal_fixed_amount"
        ? validatedConfiguration.universalFixedAmountPolicy.monthlyAmountFcfa
        : null,
    universalFixedAmountEffectiveMonth:
      validatedConfiguration.socialMechanismKind === "universal_fixed_amount"
        ? validatedConfiguration.universalFixedAmountPolicy.effectiveMonth
        : null,
    universalFixedAmountMinimumSeniorityMonths:
      validatedConfiguration.socialMechanismKind === "universal_fixed_amount"
        ? validatedConfiguration.universalFixedAmountPolicy.minimumSeniorityMonths
        : null,
    universalFixedAmountSeniorityReferenceDate:
      validatedConfiguration.socialMechanismKind === "universal_fixed_amount"
        ? validatedConfiguration.universalFixedAmountPolicy.seniorityReferenceDate
        : null,
    universalFixedAmountContractVersion: UNIVERSAL_FIXED_AMOUNT_CONTRACT_VERSION,
  });

  if (
    currentSourceFingerprint !== expectedSourceFingerprint ||
    currentConfigFingerprint !== validatedConfiguration.configurationFingerprint
  ) {
    return failure(
      "SIMULATION_INPUTS_CHANGED_AFTER_VALIDATION",
      "Les données ont changé depuis la validation. Veuillez valider de nouveau la configuration.",
      [
        {
          code: "SIMULATION_INPUTS_CHANGED_AFTER_VALIDATION",
          message:
            "Les données ont changé depuis la validation. Veuillez valider de nouveau la configuration.",
          scope: "campaign",
        },
      ],
    );
  }

  if (!readinessReport.preparedReferences) {
    return failure(
      "SIMULATION_NOT_READY",
      "Les référentiels préparés sont indisponibles.",
    );
  }

  if (readinessReport.preparedEmployees.length === 0) {
    return failure(
      "SIMULATION_NOT_READY",
      "Aucun salarié préparé n’est disponible pour le calcul.",
    );
  }

  const engineInput: PreparedPopulationCalculationInput = {
    employees: readinessReport.preparedEmployees,
    references: readinessReport.preparedReferences,
    budgetTarget: validatedConfiguration.budgetTarget,
    roundingPolicy: validatedConfiguration.roundingPolicy,
    campaignYear: validatedConfiguration.campaignYear,
    technicalApplicationMonth: validatedConfiguration.technicalApplicationMonth,
    retroactivityStartMonth: validatedConfiguration.retroactivityStartMonth,
    minimumGuaranteeEffectiveMonth:
      validatedConfiguration.minimumGuaranteeEffectiveMonth,
    minimumIncreasePolicy: validatedConfiguration.minimumIncreasePolicy,
    socialMechanismKind: validatedConfiguration.socialMechanismKind,
    universalFixedAmountPolicy: validatedConfiguration.universalFixedAmountPolicy,
  };

  let engineResult;
  try {
    engineResult = calculatePreparedPopulationCompensation(engineInput);
  } catch (error) {
    if (isCompensationCalculationError(error)) {
      const issues: CampaignSimulationExecutionIssue[] = (
        error.issues ?? []
      ).map((issue) => ({
        code: issue.code,
        message: issue.message,
        scope: issue.employeeId ? "employee" : "engine",
        employeeId: issue.employeeId,
        field: issue.field,
        details: issue.details
          ? Object.fromEntries(
              Object.entries(issue.details).filter(
                ([, value]) =>
                  value === null ||
                  typeof value === "string" ||
                  typeof value === "number" ||
                  typeof value === "boolean",
              ),
            )
          : undefined,
      }));
      if (issues.length === 0) {
        issues.push({
          code: error.code,
          message: error.message,
          scope: "engine",
        });
      }
      return failure(
        "SIMULATION_ENGINE_FAILED",
        "La simulation n’a pas pu être calculée.",
        issues,
      );
    }
    return failure(
      "SIMULATION_EXECUTION_FAILED",
      "La simulation n’a pas pu être calculée.",
      [
        {
          code: "SIMULATION_EXECUTION_FAILED",
          message: "Une erreur inattendue a interrompu le calcul.",
          scope: "engine",
        },
      ],
    );
  }

  if (
    engineResult.employees.length !== readinessReport.preparedEmployees.length
  ) {
    return failure(
      "SIMULATION_RESULT_INCOMPLETE",
      "Le calcul n’a pas produit un résultat complet pour toute la population.",
      [
        {
          code: "SIMULATION_RESULT_INCOMPLETE",
          message:
            "Le calcul n’a pas produit un résultat complet pour toute la population.",
          scope: "population",
        },
      ],
    );
  }

  const employeeLabelsById =
    input.employeeLabelsById ?? (await loadEmployeeLabels(campaignId, ports));
  const { familyLabels, gradeLabels } = collectFamilyGradeLabels(
    readinessReport.preparedReferences,
  );

  const result = buildSimulationResultView({
    campaignId,
    campaignName: campaign.name,
    campaignYear: validatedConfiguration.campaignYear,
    campaignStatus: campaign.status,
    evaluationMode: readinessReport.evaluationMode!,
    currentImportBatchId: readinessReport.currentImportBatchId,
    runSequence,
    sourceFingerprint: currentSourceFingerprint,
    configurationFingerprint: currentConfigFingerprint,
    engineResult,
    employeeLabelsById,
    familyLabelsByCode: familyLabels,
    gradeLabelsByCode: gradeLabels,
  });

  return { ok: true, result };
}
