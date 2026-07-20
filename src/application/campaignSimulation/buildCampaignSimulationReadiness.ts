/**
 * Rapport de préparation d’une simulation de campagne (Lot 2B-1).
 * Ne lance aucun calcul d’allocation ni de montants.
 */

import { MAX_POPULATION_PAGE_SIZE } from "../../infrastructure/imports/importLimits";
import type { EmployeeSnapshot } from "../../domain/hrImport/models";
import {
  buildPopulationCalculationReferences,
  logSimulationReferenceReadinessFailure,
} from "./buildPopulationCalculationReferences";
import type {
  CampaignSimulationReadinessInput,
  CampaignSimulationReadinessIssue,
  CampaignSimulationReadinessPorts,
  CampaignSimulationReadinessReport,
  CampaignSimulationReadinessSummary,
  SimulationConfigurationReadiness,
} from "./campaignSimulationModels";
import {
  mapImportedEmployeeToPreparedInput,
  sortPreparedEmployees,
  type EmployeeMappingContext,
} from "./mapImportedEmployeeToPreparedInput";

function compareIssues(
  left: CampaignSimulationReadinessIssue,
  right: CampaignSimulationReadinessIssue,
): number {
  const severityRank = (value: string) => (value === "blocking" ? 0 : 1);
  const bySeverity = severityRank(left.severity) - severityRank(right.severity);
  if (bySeverity !== 0) return bySeverity;
  if (left.scope < right.scope) return -1;
  if (left.scope > right.scope) return 1;
  const leftId = left.employeeId ?? "";
  const rightId = right.employeeId ?? "";
  if (leftId < rightId) return -1;
  if (leftId > rightId) return 1;
  if (left.code < right.code) return -1;
  if (left.code > right.code) return 1;
  return (left.field ?? "").localeCompare(right.field ?? "");
}

function buildConfigurationReadiness(
  input: CampaignSimulationReadinessInput,
): {
  readiness: SimulationConfigurationReadiness;
  issues: CampaignSimulationReadinessIssue[];
} {
  const budget = input.budgetTarget;
  const rounding = input.roundingPolicy;
  const missingFields: string[] = [];
  const issues: CampaignSimulationReadinessIssue[] = [];

  const budgetTargetModeSelected = Boolean(budget?.mode);
  const manualBudgetProvided =
    budget?.mode === "manual_amount" && budget.manualBudgetFcfa !== undefined;
  const eligiblePayrollProvided =
    budget?.mode === "percentage_of_eligible_payroll" &&
    budget.eligiblePayrollFcfa !== undefined;
  const budgetRateProvided =
    budget?.mode === "percentage_of_eligible_payroll" &&
    budget.budgetRateBasisPoints !== undefined;

  let budgetComplete = false;
  if (!budget) {
    missingFields.push("budgetTarget");
    issues.push({
      scope: "budget",
      code: "MISSING_BUDGET_CONFIGURATION",
      field: "budgetTarget",
      severity: "blocking",
      message: "Configuration de budget absente pour la simulation.",
    });
  } else if (budget.mode === "manual_amount") {
    if (budget.manualBudgetFcfa === undefined) {
      missingFields.push("manualBudgetFcfa");
      issues.push({
        scope: "budget",
        code: "MISSING_BUDGET_CONFIGURATION",
        field: "manualBudgetFcfa",
        severity: "blocking",
        message: "Montant manuel de budget manquant.",
      });
    } else {
      budgetComplete = true;
    }
  } else if (budget.mode === "percentage_of_eligible_payroll") {
    if (budget.eligiblePayrollFcfa === undefined) {
      missingFields.push("eligiblePayrollFcfa");
    }
    if (budget.budgetRateBasisPoints === undefined) {
      missingFields.push("budgetRateBasisPoints");
    }
    if (
      budget.eligiblePayrollFcfa === undefined ||
      budget.budgetRateBasisPoints === undefined
    ) {
      issues.push({
        scope: "budget",
        code: "MISSING_BUDGET_CONFIGURATION",
        field: "budgetTarget",
        severity: "blocking",
        message: "Assiette et/ou taux de budget manquants.",
      });
    } else {
      budgetComplete = true;
    }
  } else {
    missingFields.push("budgetTarget.mode");
    issues.push({
      scope: "budget",
      code: "MISSING_BUDGET_CONFIGURATION",
      field: "budgetTarget.mode",
      severity: "blocking",
      message: `Mode de budget non supporté : ${String(budget.mode)}.`,
    });
  }

  let roundingComplete = false;
  if (!rounding) {
    missingFields.push("roundingPolicy");
    issues.push({
      scope: "rounding",
      code: "MISSING_ROUNDING_POLICY",
      field: "roundingPolicy",
      severity: "blocking",
      message: "Politique d’arrondi absente pour la simulation.",
    });
  } else {
    roundingComplete = true;
  }

  return {
    readiness: {
      budgetTargetModeSelected,
      manualBudgetProvided,
      eligiblePayrollProvided,
      budgetRateProvided,
      roundingPolicyProvided: Boolean(rounding),
      isComplete: budgetComplete && roundingComplete,
      missingFields,
    },
    issues,
  };
}

async function loadAllCurrentEmployees(
  ports: CampaignSimulationReadinessPorts,
  campaignId: number,
): Promise<EmployeeSnapshot[]> {
  const employees: EmployeeSnapshot[] = [];
  let offset = 0;
  let total = Infinity;
  while (offset < total) {
    const page = await ports.listCurrentPopulation(campaignId, {
      limit: MAX_POPULATION_PAGE_SIZE,
      offset,
    });
    total = page.total;
    employees.push(...page.items);
    offset += page.items.length;
    if (page.items.length === 0) {
      break;
    }
  }
  return employees;
}

/**
 * Construit le rapport de readiness sans exécuter le moteur d’allocation.
 */
export async function buildCampaignSimulationReadiness(
  input: CampaignSimulationReadinessInput,
  ports: CampaignSimulationReadinessPorts,
): Promise<CampaignSimulationReadinessReport> {
  const issues: CampaignSimulationReadinessIssue[] = [];

  const campaign = await ports.getCampaign(input.campaignId);
  if (!campaign) {
    issues.push({
      scope: "campaign",
      code: "CAMPAIGN_NOT_FOUND",
      severity: "blocking",
      message: `Campagne ${input.campaignId} introuvable.`,
    });
    return emptyReport(input.campaignId, issues, buildConfigurationReadiness(input));
  }

  if (campaign.status === "archived") {
    issues.push({
      scope: "campaign",
      code: "CAMPAIGN_ARCHIVED",
      severity: "blocking",
      message:
        "Campagne archivée : nouvelle simulation interdite (consultation seule).",
    });
  }

  const currentBatch = await ports.getCurrentBatch(input.campaignId);
  if (!currentBatch) {
    issues.push({
      scope: "import",
      code: "CURRENT_IMPORT_BATCH_NOT_FOUND",
      severity: "blocking",
      message: "Aucun lot RH courant pour cette campagne.",
    });
  }

  const employees = currentBatch
    ? await loadAllCurrentEmployees(ports, input.campaignId)
    : [];

  if (currentBatch && employees.length === 0) {
    issues.push({
      scope: "import",
      code: "EMPTY_CURRENT_POPULATION",
      severity: "blocking",
      message: "La population RH courante est vide.",
    });
  }

  const referenceSet = await ports.getReferenceSet(input.campaignId);
  const completeness = await ports.getCompleteness(input.campaignId);
  const referencesBuild = buildPopulationCalculationReferences(referenceSet);
  issues.push(...referencesBuild.issues);

  if (!referencesBuild.references) {
    logSimulationReferenceReadinessFailure({
      campaignId: input.campaignId,
      evaluationMode: referenceSet.config.nineBoxMode,
      set: referenceSet,
      build: referencesBuild,
    });
  }

  // Évite le doublon générique si buildPopulationCalculationReferences
  // a déjà traduit la complétude éditoriale.
  if (
    !completeness.ready &&
    !referencesBuild.issues.some(
      (issue) =>
        issue.code === "INCOMPLETE_COMPENSATION_REFERENCES" ||
        issue.code === "S0_REFERENCE_NOT_FOUND" ||
        issue.code === "FACTOR_NOT_FOUND" ||
        issue.code === "EMPTY_POSITION_REFERENCE",
    )
  ) {
    issues.push({
      scope: "references",
      code: "INCOMPLETE_COMPENSATION_REFERENCES",
      severity: "blocking",
      message: "Les référentiels de rémunération sont incomplets.",
      details: {
        badge: completeness.badge,
        percent: completeness.percent,
      },
    });
  }

  const configBuild = buildConfigurationReadiness(input);
  issues.push(...configBuild.issues);

  const familiesById = new Map(
    referenceSet.jobFamilies.map((family) => [Number(family.id), family]),
  );
  const gradesById = new Map(
    referenceSet.grades.map((grade) => [Number(grade.id), grade]),
  );
  const nineBoxFactorsByCode = new Map<number, (typeof referenceSet.nineBoxFactors)[0]>();
  for (const factor of referenceSet.nineBoxFactors) {
    if (nineBoxFactorsByCode.has(factor.boxCode)) {
      issues.push({
        scope: "evaluation",
        code: "DUPLICATE_NINE_BOX_CODE",
        field: "nineBoxFactors",
        severity: "blocking",
        message: `boxCode dupliqué dans le référentiel : ${factor.boxCode}.`,
      });
    }
    nineBoxFactorsByCode.set(factor.boxCode, factor);
  }

  const mappingContext: EmployeeMappingContext = {
    evaluationMode: referenceSet.config.nineBoxMode,
    familiesById,
    gradesById,
    nineBoxFactorsByCode,
  };

  const seenIds = new Set<string>();
  const preparedEmployees = [];
  const employeeBlockingIds = new Set<string>();
  const employeeWarningIds = new Set<string>();
  let missingS0Count = 0;
  let missingPerformanceCount = 0;
  let missingPotentialCount = 0;
  let missingUnderperformerStatusCount = 0;

  for (const employee of employees) {
    const id = employee.employeeNumber?.trim() ?? "";
    if (id && seenIds.has(id)) {
      issues.push({
        scope: "employee",
        employeeId: id,
        code: "DUPLICATE_EMPLOYEE_ID",
        field: "employeeId",
        severity: "blocking",
        message: `Matricule dupliqué dans la population courante : ${id}.`,
      });
      employeeBlockingIds.add(id);
      continue;
    }
    if (id) {
      seenIds.add(id);
    }

    const mapped = mapImportedEmployeeToPreparedInput(employee, mappingContext);
    if (!mapped.ok) {
      issues.push(...mapped.issues);
      const anyId = id || `row:${employee.sourceRowNumber}`;
      employeeBlockingIds.add(anyId);
      for (const issue of mapped.issues) {
        if (issue.code === "MISSING_EMPLOYEE_PERFORMANCE") {
          missingPerformanceCount += 1;
        }
        if (issue.code === "MISSING_EMPLOYEE_POTENTIAL") {
          missingPotentialCount += 1;
        }
        if (issue.code === "MISSING_CONFIRMED_UNDERPERFORMER") {
          missingUnderperformerStatusCount += 1;
        }
      }
      continue;
    }

    issues.push(...mapped.warnings);
    if (mapped.warnings.length > 0) {
      employeeWarningIds.add(mapped.prepared.employeeId);
    }

    // S0 lookup readiness (sans lancer le moteur)
    const family = familiesById.get(Number(employee.jobFamilyId));
    const grade = gradesById.get(Number(employee.gradeId));
    if (family && grade && referencesBuild.references) {
      const cell = referencesBuild.references.salaryGrid.find(
        (item) =>
          item.familyCode.trim().toUpperCase() ===
            family.code.trim().toUpperCase() &&
          item.gradeCode.trim().toUpperCase() ===
            grade.code.trim().toUpperCase(),
      );
      if (!cell || cell.s0Fcfa === null || cell.s0Fcfa === undefined) {
        issues.push({
          scope: "employee",
          employeeId: mapped.prepared.employeeId,
          code: "S0_REFERENCE_NOT_FOUND",
          field: "s0Fcfa",
          severity: "blocking",
          message: `S0 absent pour ${family.code}/${grade.code}.`,
        });
        employeeBlockingIds.add(mapped.prepared.employeeId);
        missingS0Count += 1;
        continue;
      }
      const s0 = cell.s0Fcfa;
      const s0Ok =
        (typeof s0 === "bigint" && s0 > 0n) ||
        (typeof s0 === "number" && Number.isInteger(s0) && s0 > 0);
      if (!s0Ok) {
        issues.push({
          scope: "employee",
          employeeId: mapped.prepared.employeeId,
          code: "S0_REFERENCE_NOT_FOUND",
          field: "s0Fcfa",
          severity: "blocking",
          message: `S0 invalide pour ${family.code}/${grade.code}.`,
        });
        employeeBlockingIds.add(mapped.prepared.employeeId);
        missingS0Count += 1;
        continue;
      }
    }

    preparedEmployees.push(mapped.prepared);
  }

  const sortedPrepared = sortPreparedEmployees(preparedEmployees);
  const sortedIssues = [...issues].sort(compareIssues);
  const blockingIssues = sortedIssues.filter(
    (issue) => issue.severity === "blocking",
  );
  const warningIssues = sortedIssues.filter(
    (issue) => issue.severity === "warning",
  );

  const referenceBlockingIssueCount = blockingIssues.filter(
    (issue) =>
      issue.scope === "references" || issue.scope === "evaluation",
  ).length;
  const configurationBlockingIssueCount = blockingIssues.filter(
    (issue) => issue.scope === "budget" || issue.scope === "rounding",
  ).length;
  const populationBlocking = blockingIssues.filter(
    (issue) =>
      issue.scope === "employee" ||
      issue.scope === "import" ||
      issue.scope === "campaign",
  );

  const populationReadiness = {
    isReady:
      Boolean(currentBatch) &&
      employees.length > 0 &&
      populationBlocking.length === 0 &&
      sortedPrepared.length === employees.length,
    blockingIssueCount: populationBlocking.length,
    warningIssueCount: warningIssues.filter(
      (issue) => issue.scope === "employee" || issue.scope === "import",
    ).length,
  };

  const referenceReadiness = {
    isReady:
      completeness.ready &&
      referencesBuild.references !== null &&
      referenceBlockingIssueCount === 0,
    blockingIssueCount: referenceBlockingIssueCount,
    warningIssueCount: warningIssues.filter(
      (issue) =>
        issue.scope === "references" || issue.scope === "evaluation",
    ).length,
  };

  const isReady =
    populationReadiness.isReady &&
    referenceReadiness.isReady &&
    configBuild.readiness.isComplete &&
    campaign.status !== "archived";

  if (!isReady) {
    const already = sortedIssues.some((issue) => issue.code === "SIMULATION_NOT_READY");
    if (!already) {
      sortedIssues.push({
        scope: "campaign",
        code: "SIMULATION_NOT_READY",
        severity: "blocking",
        message: "La simulation n’est pas prête : voir les issues bloquantes.",
      });
      sortedIssues.sort(compareIssues);
    }
  }

  const finalBlocking = sortedIssues.filter((i) => i.severity === "blocking");
  const finalWarnings = sortedIssues.filter((i) => i.severity === "warning");

  const summary: CampaignSimulationReadinessSummary = {
    campaignStatus: campaign.status,
    employeeCount: employees.length,
    mappedEmployeeCount: sortedPrepared.length,
    blockingEmployeeCount: employeeBlockingIds.size,
    warningEmployeeCount: employeeWarningIds.size,
    missingS0Count,
    missingPerformanceCount,
    missingPotentialCount,
    missingUnderperformerStatusCount,
    referenceBlockingIssueCount,
    configurationBlockingIssueCount,
    isReadyForCalculation: isReady,
  };

  return {
    campaignId: campaign.id,
    campaignName: campaign.name,
    campaignStatus: campaign.status,
    isReady,
    currentImportBatchId: currentBatch?.id ?? null,
    importedEmployeeCount: employees.length,
    validEmployeeCount: sortedPrepared.length,
    blockedEmployeeCount: employeeBlockingIds.size,
    evaluationMode: referenceSet.config.nineBoxMode,
    nineBoxOrientation: referenceSet.config.nineBoxOrientation,
    referenceReadiness,
    populationReadiness,
    configurationReadiness: configBuild.readiness,
    issues: finalBlocking,
    warnings: finalWarnings,
    summary,
    preparedEmployees: isReady ? sortedPrepared : sortedPrepared,
    preparedReferences: referenceReadiness.isReady
      ? referencesBuild.references
      : null,
    budgetTarget: input.budgetTarget ?? null,
    roundingPolicy: input.roundingPolicy ?? null,
  };
}

function emptyReport(
  campaignId: number,
  issues: CampaignSimulationReadinessIssue[],
  configBuild: ReturnType<typeof buildConfigurationReadiness>,
): CampaignSimulationReadinessReport {
  const sorted = [...issues, ...configBuild.issues].sort(compareIssues);
  const blocking = sorted.filter((i) => i.severity === "blocking");
  const warnings = sorted.filter((i) => i.severity === "warning");
  return {
    campaignId,
    campaignName: null,
    campaignStatus: "unknown",
    isReady: false,
    currentImportBatchId: null,
    importedEmployeeCount: 0,
    validEmployeeCount: 0,
    blockedEmployeeCount: 0,
    evaluationMode: null,
    nineBoxOrientation: null,
    referenceReadiness: {
      isReady: false,
      blockingIssueCount: blocking.filter(
        (i) => i.scope === "references" || i.scope === "evaluation",
      ).length,
      warningIssueCount: 0,
    },
    populationReadiness: {
      isReady: false,
      blockingIssueCount: blocking.filter(
        (i) => i.scope === "import" || i.scope === "employee" || i.scope === "campaign",
      ).length,
      warningIssueCount: 0,
    },
    configurationReadiness: configBuild.readiness,
    issues: blocking,
    warnings,
    summary: {
      campaignStatus: "unknown",
      employeeCount: 0,
      mappedEmployeeCount: 0,
      blockingEmployeeCount: 0,
      warningEmployeeCount: 0,
      missingS0Count: 0,
      missingPerformanceCount: 0,
      missingPotentialCount: 0,
      missingUnderperformerStatusCount: 0,
      referenceBlockingIssueCount: 0,
      configurationBlockingIssueCount: blocking.filter(
        (i) => i.scope === "budget" || i.scope === "rounding",
      ).length,
      isReadyForCalculation: false,
    },
    preparedEmployees: [],
    preparedReferences: null,
    budgetTarget: null,
    roundingPolicy: null,
  };
}

/**
 * Adapte les AppServices existants vers les ports de readiness.
 */
export function createCampaignSimulationReadinessPortsFromServices(services: {
  campaign: {
    getCampaign(
      id: number,
    ): Promise<import("../../domain/campaign/models").Campaign | null>;
  };
  compensationReference: {
    getReferenceSet(
      campaignId: number,
    ): Promise<
      import("../../domain/compensationReference/models").CompensationReferenceSet
    >;
    getCompleteness(
      campaignId: number,
    ): Promise<
      import("../../domain/compensationReference/models").ReferenceCompleteness
    >;
  };
  hrImport: {
    getCurrentBatch(
      campaignId: number,
    ): Promise<import("../../domain/hrImport/models").HrImportBatch | null>;
    listCurrentPopulation(
      campaignId: number,
      query: import("../../domain/hrImport/models").PopulationQuery,
    ): Promise<import("../../domain/hrImport/models").PaginatedPopulation>;
  };
}): CampaignSimulationReadinessPorts {
  return {
    getCampaign: (campaignId) => services.campaign.getCampaign(campaignId),
    getReferenceSet: (campaignId) =>
      services.compensationReference.getReferenceSet(campaignId),
    getCompleteness: (campaignId) =>
      services.compensationReference.getCompleteness(campaignId),
    getCurrentBatch: (campaignId) => services.hrImport.getCurrentBatch(campaignId),
    listCurrentPopulation: (campaignId, query) =>
      services.hrImport.listCurrentPopulation(campaignId, query),
  };
}
