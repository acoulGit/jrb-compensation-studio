import { afterEach, describe, expect, it, vi } from "vitest";
import { saveCurrentCampaignSimulation } from "../application/campaignSimulation/saveCurrentCampaignSimulation";
import { buildSimulationSourceFingerprint } from "../application/campaignSimulation/buildSimulationSourceFingerprint";
import { buildConfigurationFingerprint } from "../application/campaignSimulation/formatExactBudgetDisplay";
import type { CampaignSimulationExecutionResult } from "../application/campaignSimulation/campaignSimulationExecutionModels";
import type { CampaignSimulationReadinessPorts } from "../application/campaignSimulation/campaignSimulationModels";
import type { ValidatedCampaignSimulationConfiguration } from "../application/campaignSimulation/simulationConfigurationModels";
import type { SimulationHistoryRepository } from "../infrastructure/database/repositories/simulationHistoryRepository";
import type { Campaign } from "../domain/campaign/models";
import type {
  PreparedEmployeeCalculationInput,
  PopulationCalculationReferences,
} from "../domain/compensationCalculation";
import {
  DEFAULT_NINE_BOX_FACTORS,
  DEFAULT_PERFORMANCE_FACTORS,
  DEFAULT_POTENTIAL_FACTORS,
  DEFAULT_SALARY_POSITIONS,
} from "../domain/compensationReference/defaults";

function sampleResult(
  overrides: Partial<CampaignSimulationExecutionResult> = {},
): CampaignSimulationExecutionResult {
  return {
    campaignId: 1,
    campaignName: "Sim 2027",
    campaignYear: 2027,
    campaignStatus: "active",
    evaluationMode: "none",
    currentImportBatchId: 10,
    runSequence: 1,
    sourceFingerprint: "fp-source",
    configurationFingerprint: "fp-config",
    budgetSummary: {
      budgetTargetMode: "manual_amount",
      exactBudgetTarget: { numerator: 25000003n, denominator: 1n },
      exactBudgetTargetLabel: "x",
      manualBudgetFcfa: 25000003n,
      actualOperationAmountFcfa: 25000000n,
      actualOperationAmountLabel: "x",
      totalRoundingDelta: { numerator: -3n, denominator: 1n },
      totalRoundingDeltaLabel: "x",
      theoreticalAllocatedTotal: { numerator: 25000003n, denominator: 1n },
      theoreticalAllocatedTotalLabel: "x",
      roundingMode: "nearest_half_up",
      roundingStepFcfa: 100n,
    },
    populationSummary: {
      employeeCount: 1,
      positiveWeightEmployeeCount: 1,
      zeroWeightEmployeeCount: 0,
      confirmedUnderperformerCount: 0,
      theoreticalAllocatedTotal: { numerator: 25000003n, denominator: 1n },
      actualOperationAmountFcfa: 25000000n,
      totalRoundingDelta: { numerator: -3n, denominator: 1n },
      isTheoreticalBudgetExactlyAllocated: true,
    },
    employees: [
      {
        employeeId: "E1",
        employeeDisplayName: "Alice",
        familyCode: "F1",
        familyLabel: "Fam",
        gradeCode: "G1",
        gradeLabel: "Gr",
        salaryFcfa: 1000000n,
        s0Fcfa: 1000000n,
        salaryRatioBasisPoints: 10000,
        salaryPositionCode: "EQ",
        salaryPositionLabel: "Égal",
        positionFactorMilli: 1000,
        evaluationMode: "none",
        performanceLevel: null,
        potentialLevel: null,
        evaluationFactor: { numerator: 1n, denominator: 1n },
        theoreticalMatrixWeight: { numerator: 1n, denominator: 1n },
        effectiveMatrixWeight: { numerator: 1n, denominator: 1n },
        allocationWeight: { numerator: 1000000n, denominator: 1n },
        evaluationFactorLabel: "1",
        theoreticalMatrixWeightLabel: "1",
        effectiveMatrixWeightLabel: "1",
        allocationWeightLabel: "1000000",
        blockingReason: null,
        theoreticalIncreaseRate: { numerator: 1n, denominator: 40n },
        theoreticalIncreaseAmount: { numerator: 25000003n, denominator: 1n },
        theoreticalIncreaseRateLabel: "x",
        theoreticalIncreaseAmountLabel: "x",
        finalRoundedIncreaseAmountFcfa: 25000000n,
        individualRoundingDelta: { numerator: -3n, denominator: 1n },
        individualRoundingDeltaLabel: "x",
        finalSalaryFcfa: 1025000000n,
        explanationSteps: [
          { step: "alloc", formula: "a/b", outputValue: "1" },
        ],
      },
    ],
    explanationSteps: [],
    ...overrides,
  };
}

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 1,
    name: "Sim 2027",
    referenceYear: 2027,
    status: "active",
    notes: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}

function baseReferences(): PopulationCalculationReferences {
  return {
    evaluationMode: "none",
    salaryGrid: [
      {
        familyCode: "F1",
        gradeCode: "G1",
        familyLabel: "Fam",
        gradeLabel: "Gr",
        s0Fcfa: 1_000_000,
      },
    ],
    salaryPositions: DEFAULT_SALARY_POSITIONS.map((p) => ({
      code: p.code,
      label: p.label,
      referenceRatioBps: p.referenceRatioBps,
      positionFactorMilli: p.positionFactorMilli,
    })),
    performanceFactors: DEFAULT_PERFORMANCE_FACTORS.map((f) => ({
      level: f.level,
      factorMilli: f.factorMilli,
    })),
    potentialFactors: DEFAULT_POTENTIAL_FACTORS.map((f) => ({
      level: f.level,
      factorMilli: f.factorMilli,
    })),
    nineBoxFactors: DEFAULT_NINE_BOX_FACTORS.map((f) => ({
      performanceLevel: f.performanceLevel,
      potentialLevel: f.potentialLevel,
      factorMilli: f.factorMilli,
      boxCode: f.boxCode,
    })),
  };
}

function sampleEmployee(): PreparedEmployeeCalculationInput {
  return {
    employeeId: "E1",
    familyCode: "F1",
    gradeCode: "G1",
    salaryFcfa: 1_000_000,
    confirmedUnderperformer: false,
  };
}

function makePorts(options: {
  campaign?: Campaign | null;
  batchId?: number | null;
}): CampaignSimulationReadinessPorts {
  const campaign =
    options.campaign === undefined ? makeCampaign() : options.campaign;
  const batchId = options.batchId === undefined ? 10 : options.batchId;

  return {
    getCampaign: vi.fn(async () => campaign),
    getReferenceSet: vi.fn(async () => {
      throw new Error("unused");
    }),
    getCompleteness: vi.fn(async () => {
      throw new Error("unused");
    }),
    getCurrentBatch: vi.fn(async () =>
      campaign && batchId !== null
        ? {
            id: batchId,
            campaignId: campaign.id,
            status: "current" as const,
            sourceFileName: "pop.xlsx",
            sourceFormat: "xlsx" as const,
            sourceSheetName: "Population",
            fileSizeBytes: 100,
            sourceRowCount: 1,
            importedRowCount: 1,
            warningCount: 0,
            importedAt: "2026-01-01T00:00:00.000Z",
            createdAt: "2026-01-01T00:00:00.000Z",
          }
        : null,
    ),
    listCurrentPopulation: vi.fn(async () => ({
      items: [],
      total: 0,
      limit: 50,
      offset: 0,
    })),
  };
}

function makeRepository(
  overrides: Partial<SimulationHistoryRepository> = {},
): SimulationHistoryRepository {
  return {
    saveSimulationRun: vi.fn(async () => ({
      simulationRunId: 1,
      runNumber: 1,
      createdAt: "2026-07-20T00:00:00.000Z",
      employeeCount: 1,
    })),
    listSimulationRuns: vi.fn(async () => ({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    })),
    getSimulationRun: vi.fn(async () => null),
    listSimulationEmployeeResults: vi.fn(async () => []),
    getSimulationRunSummary: vi.fn(async () => null),
    ...overrides,
  };
}

async function setupSuccessContext(options?: {
  campaign?: Campaign;
  employees?: PreparedEmployeeCalculationInput[];
  batchId?: number;
  mutateFingerprintEmployees?: PreparedEmployeeCalculationInput[];
}) {
  const campaign = options?.campaign ?? makeCampaign();
  const employees = options?.employees ?? [sampleEmployee()];
  const references = baseReferences();
  const batchId = options?.batchId ?? 10;
  const budgetTarget = {
    mode: "manual_amount" as const,
    manualBudgetFcfa: 25_000_003n,
  };
  const roundingPolicy = {
    mode: "nearest_half_up" as const,
    stepFcfa: 100n,
  };

  const sourceFingerprint = buildSimulationSourceFingerprint({
    campaignId: campaign.id,
    campaignStatus: campaign.status,
    evaluationMode: references.evaluationMode,
    currentImportBatchId: batchId,
    preparedEmployees: employees,
    preparedReferences: references,
    budgetTarget,
    roundingPolicy,
  });
  const configurationFingerprint = buildConfigurationFingerprint({
    campaignId: campaign.id,
    budgetMode: budgetTarget.mode,
    manualBudget: budgetTarget.manualBudgetFcfa,
    roundingMode: roundingPolicy.mode,
    roundingStep: roundingPolicy.stepFcfa,
  });

  const readinessModule = await import(
    "../application/campaignSimulation/buildCampaignSimulationReadiness"
  );
  const fingerprintEmployees =
    options?.mutateFingerprintEmployees ?? employees;
  const readinessSpy = vi
    .spyOn(readinessModule, "buildCampaignSimulationReadiness")
    .mockImplementation(async () => ({
      campaignId: campaign.id,
      campaignName: campaign.name,
      campaignStatus: campaign.status,
      isReady: true,
      currentImportBatchId: batchId,
      importedEmployeeCount: fingerprintEmployees.length,
      validEmployeeCount: fingerprintEmployees.length,
      blockedEmployeeCount: 0,
      evaluationMode: references.evaluationMode,
      nineBoxOrientation: null,
      referenceReadiness: {
        isReady: true,
        blockingIssueCount: 0,
        warningIssueCount: 0,
      },
      populationReadiness: {
        isReady: true,
        blockingIssueCount: 0,
        warningIssueCount: 0,
      },
      configurationReadiness: {
        budgetTargetModeSelected: true,
        manualBudgetProvided: true,
        eligiblePayrollProvided: false,
        budgetRateProvided: false,
        roundingPolicyProvided: true,
        isComplete: true,
        missingFields: [],
      },
      issues: [],
      warnings: [],
      summary: {
        campaignStatus: campaign.status,
        employeeCount: fingerprintEmployees.length,
        mappedEmployeeCount: fingerprintEmployees.length,
        blockingEmployeeCount: 0,
        warningEmployeeCount: 0,
        missingS0Count: 0,
        missingPerformanceCount: 0,
        missingPotentialCount: 0,
        missingUnderperformerStatusCount: 0,
        referenceBlockingIssueCount: 0,
        configurationBlockingIssueCount: 0,
        isReadyForCalculation: true,
      },
      preparedEmployees: fingerprintEmployees,
      preparedReferences: references,
      budgetTarget,
      roundingPolicy,
    }));

  const validated: ValidatedCampaignSimulationConfiguration = {
    campaignId: campaign.id,
    budgetTarget,
    roundingPolicy,
    readinessReport: {
      campaignId: campaign.id,
      campaignName: campaign.name,
      campaignStatus: campaign.status,
      isReady: true,
      currentImportBatchId: batchId,
      importedEmployeeCount: employees.length,
      validEmployeeCount: employees.length,
      blockedEmployeeCount: 0,
      evaluationMode: references.evaluationMode,
      nineBoxOrientation: null,
      referenceReadiness: {
        isReady: true,
        blockingIssueCount: 0,
        warningIssueCount: 0,
      },
      populationReadiness: {
        isReady: true,
        blockingIssueCount: 0,
        warningIssueCount: 0,
      },
      configurationReadiness: {
        budgetTargetModeSelected: true,
        manualBudgetProvided: true,
        eligiblePayrollProvided: false,
        budgetRateProvided: false,
        roundingPolicyProvided: true,
        isComplete: true,
        missingFields: [],
      },
      issues: [],
      warnings: [],
      summary: {
        campaignStatus: campaign.status,
        employeeCount: employees.length,
        mappedEmployeeCount: employees.length,
        blockingEmployeeCount: 0,
        warningEmployeeCount: 0,
        missingS0Count: 0,
        missingPerformanceCount: 0,
        missingPotentialCount: 0,
        missingUnderperformerStatusCount: 0,
        referenceBlockingIssueCount: 0,
        configurationBlockingIssueCount: 0,
        isReadyForCalculation: true,
      },
      preparedEmployees: employees,
      preparedReferences: references,
      budgetTarget,
      roundingPolicy,
    },
    validatedAtSessionSequence: 1,
    configurationFingerprint,
    sourceFingerprint,
  };

  const result = sampleResult({
    campaignId: campaign.id,
    campaignStatus: campaign.status,
    currentImportBatchId: batchId,
    sourceFingerprint,
    configurationFingerprint,
    evaluationMode: references.evaluationMode,
  });

  return {
    campaign,
    ports: makePorts({ campaign, batchId }),
    validated,
    result,
    readinessSpy,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("saveCurrentCampaignSimulation", () => {
  it("returns SIMULATION_RESULT_NOT_AVAILABLE when idle / no result", async () => {
    const repository = makeRepository();
    const outcome = await saveCurrentCampaignSimulation({
      campaignId: 1,
      executionStatus: "idle",
      isStale: false,
      result: null,
      validatedConfiguration: null,
      ports: makePorts({}),
      repository,
    });
    expect(outcome).toEqual({
      ok: false,
      code: "SIMULATION_RESULT_NOT_AVAILABLE",
      message: expect.any(String),
    });
    expect(repository.saveSimulationRun).not.toHaveBeenCalled();
  });

  it("returns SIMULATION_RESULT_STALE when result is stale", async () => {
    const repository = makeRepository();
    const outcome = await saveCurrentCampaignSimulation({
      campaignId: 1,
      executionStatus: "success",
      isStale: true,
      result: sampleResult(),
      validatedConfiguration: null,
      ports: makePorts({}),
      repository,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("SIMULATION_RESULT_STALE");
    }
    expect(repository.saveSimulationRun).not.toHaveBeenCalled();
  });

  it("returns SIMULATION_RESULT_CAMPAIGN_MISMATCH on campaign id mismatch", async () => {
    const repository = makeRepository();
    const outcome = await saveCurrentCampaignSimulation({
      campaignId: 2,
      executionStatus: "success",
      isStale: false,
      result: sampleResult({ campaignId: 1 }),
      validatedConfiguration: null,
      ports: makePorts({}),
      repository,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("SIMULATION_RESULT_CAMPAIGN_MISMATCH");
    }
    expect(repository.saveSimulationRun).not.toHaveBeenCalled();
  });

  it("returns SIMULATION_CONFIGURATION_MISMATCH when config fingerprints differ", async () => {
    const ctx = await setupSuccessContext();
    const repository = makeRepository();
    const outcome = await saveCurrentCampaignSimulation({
      campaignId: 1,
      executionStatus: "success",
      isStale: false,
      result: ctx.result,
      validatedConfiguration: {
        ...ctx.validated,
        configurationFingerprint: "other-config",
      },
      ports: ctx.ports,
      repository,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("SIMULATION_CONFIGURATION_MISMATCH");
    }
    expect(repository.saveSimulationRun).not.toHaveBeenCalled();
  });

  it("returns CAMPAIGN_ARCHIVED for archived campaigns", async () => {
    const campaign = makeCampaign({ status: "archived" });
    const ctx = await setupSuccessContext({ campaign });
    const repository = makeRepository();
    const outcome = await saveCurrentCampaignSimulation({
      campaignId: 1,
      executionStatus: "success",
      isStale: false,
      result: ctx.result,
      validatedConfiguration: ctx.validated,
      ports: makePorts({ campaign, batchId: 10 }),
      repository,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("CAMPAIGN_ARCHIVED");
    }
    expect(repository.saveSimulationRun).not.toHaveBeenCalled();
  });

  it("returns CURRENT_IMPORT_BATCH_CHANGED when batch id differs", async () => {
    const ctx = await setupSuccessContext();
    const repository = makeRepository();
    const outcome = await saveCurrentCampaignSimulation({
      campaignId: 1,
      executionStatus: "success",
      isStale: false,
      result: ctx.result,
      validatedConfiguration: ctx.validated,
      ports: makePorts({ campaign: ctx.campaign, batchId: 99 }),
      repository,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("CURRENT_IMPORT_BATCH_CHANGED");
    }
    expect(repository.saveSimulationRun).not.toHaveBeenCalled();
  });

  it("returns SIMULATION_INPUTS_CHANGED_BEFORE_SAVE when fingerprint changed", async () => {
    const ctx = await setupSuccessContext({
      mutateFingerprintEmployees: [
        {
          ...sampleEmployee(),
          salaryFcfa: 2_000_000,
        },
      ],
    });
    const repository = makeRepository();
    const outcome = await saveCurrentCampaignSimulation({
      campaignId: 1,
      executionStatus: "success",
      isStale: false,
      result: ctx.result,
      validatedConfiguration: ctx.validated,
      ports: ctx.ports,
      repository,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("SIMULATION_INPUTS_CHANGED_BEFORE_SAVE");
    }
    expect(repository.saveSimulationRun).not.toHaveBeenCalled();
  });

  it("saves successfully and returns saved result", async () => {
    const ctx = await setupSuccessContext();
    const repository = makeRepository();
    const outcome = await saveCurrentCampaignSimulation({
      campaignId: 1,
      executionStatus: "success",
      isStale: false,
      result: ctx.result,
      validatedConfiguration: ctx.validated,
      ports: ctx.ports,
      repository,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.saved).toEqual({
        simulationRunId: 1,
        runNumber: 1,
        createdAt: "2026-07-20T00:00:00.000Z",
        employeeCount: 1,
      });
    }
    expect(repository.saveSimulationRun).toHaveBeenCalledTimes(1);
  });

  it("returns sanitized SIMULATION_SAVE_FAILED when repository throws", async () => {
    const ctx = await setupSuccessContext();
    const repository = makeRepository({
      saveSimulationRun: vi.fn(async () => {
        throw new Error("sqlite boom with secrets");
      }),
    });
    const outcome = await saveCurrentCampaignSimulation({
      campaignId: 1,
      executionStatus: "success",
      isStale: false,
      result: ctx.result,
      validatedConfiguration: ctx.validated,
      ports: ctx.ports,
      repository,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("SIMULATION_SAVE_FAILED");
      expect(outcome.message).not.toContain("sqlite boom");
      expect(outcome.message).not.toContain("secrets");
    }
  });
});
