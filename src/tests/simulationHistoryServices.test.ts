import { describe, expect, it, vi } from "vitest";
import { getPersistedSimulationRun } from "../application/campaignSimulation/getPersistedSimulationRun";
import { listCampaignSimulationHistory } from "../application/campaignSimulation/listCampaignSimulationHistory";
import { mapPersistedDetailToViewModel } from "../application/campaignSimulation/mapToSimulationViewModel";
import type { SimulationHistoryRepository } from "../infrastructure/database/repositories/simulationHistoryRepository";
import { MemorySimulationHistoryRepository } from "../infrastructure/database/repositories/memorySimulationHistoryRepository";

const sampleDto = {
  campaignId: 1,
  expectedCampaignStatus: "active" as const,
  expectedCurrentImportBatchId: 10,
  campaignName: "Sim 2027",
  campaignYear: 2027,
  campaignStatusAtRun: "active" as const,
  evaluationMode: "none" as const,
  sourceImportBatchId: 10,
  sourceImportFileName: "pop.xlsx",
  sourceFingerprint: "fp-source",
  configurationFingerprint: "fp-config",
  budgetTargetMode: "manual_amount",
  manualBudgetFcfaText: "25000003",
  eligiblePayrollFcfaText: null,
  budgetRateBasisPoints: null,
  budgetTargetNumeratorText: "25000003",
  budgetTargetDenominatorText: "1",
  roundingMode: "nearest_half_up",
  roundingStepFcfaText: "100",
  employeeCount: 1,
  positiveWeightEmployeeCount: 1,
  zeroWeightEmployeeCount: 0,
  confirmedUnderperformerCount: 0,
  theoreticalTotalNumeratorText: "25000003",
  theoreticalTotalDenominatorText: "1",
  actualOperationAmountFcfaText: "25000000",
  totalRoundingDeltaNumeratorText: "-3",
  totalRoundingDeltaDenominatorText: "1",
  employees: [
    {
      employeeId: "E1",
      employeeDisplayName: "Alice",
      familyCode: "F1",
      familyLabel: "Fam",
      gradeCode: "G1",
      gradeLabel: "Gr",
      salaryFcfaText: "1000000",
      s0FcfaText: "1000000",
      salaryRatioBasisPoints: 10000,
      salaryPositionCode: "EQ",
      salaryPositionLabel: "Égal",
      positionFactorMilli: 1000,
      evaluationMode: "none",
      performanceLevel: null,
      potentialLevel: null,
      evaluationFactorNumeratorText: "1",
      evaluationFactorDenominatorText: "1",
      theoreticalMatrixWeightNumeratorText: "1",
      theoreticalMatrixWeightDenominatorText: "1",
      effectiveMatrixWeightNumeratorText: "1",
      effectiveMatrixWeightDenominatorText: "1",
      allocationWeightNumeratorText: "1000000",
      allocationWeightDenominatorText: "1",
      blockingReason: null,
      theoreticalIncreaseRateNumeratorText: "1",
      theoreticalIncreaseRateDenominatorText: "40",
      theoreticalIncreaseAmountNumeratorText: "25000003",
      theoreticalIncreaseAmountDenominatorText: "1",
      finalRoundedIncreaseFcfaText: "25000000",
      individualRoundingDeltaNumeratorText: "-3",
      individualRoundingDeltaDenominatorText: "1",
      finalSalaryFcfaText: "1025000000",
      explanationStepsJson: JSON.stringify([
        { step: "alloc", formula: "a/b", outputValue: "1" },
      ]),
    },
  ],
};

describe("listCampaignSimulationHistory", () => {
  it("retourne une page paginée", async () => {
    const repository = new MemorySimulationHistoryRepository();
    await repository.saveSimulationRun(sampleDto);
    const outcome = await listCampaignSimulationHistory(repository, 1, {
      limit: 20,
      offset: 0,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.page.total).toBe(1);
      expect(outcome.page.items[0]?.runNumber).toBe(1);
    }
  });

  it("sanitise une erreur repository", async () => {
    const repository: SimulationHistoryRepository = {
      saveSimulationRun: vi.fn(),
      listSimulationRuns: vi.fn().mockRejectedValue(new Error("SQLITE")),
      getSimulationRun: vi.fn(),
      listSimulationEmployeeResults: vi.fn(),
      listSimulationEmployeeMonthResults: vi.fn(),
      getSimulationRunSummary: vi.fn(),
    };
    const outcome = await listCampaignSimulationHistory(repository, 1);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("SIMULATION_HISTORY_READ_FAILED");
      expect(outcome.message).not.toMatch(/SQLITE/i);
    }
  });
});

describe("getPersistedSimulationRun", () => {
  it("mappe un détail lisible", async () => {
    const repository = new MemorySimulationHistoryRepository();
    const saved = await repository.saveSimulationRun(sampleDto);
    const outcome = await getPersistedSimulationRun(
      repository,
      saved.simulationRunId,
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.view.summary.mode).toBe("persisted-readonly");
      expect(outcome.view.employees).toHaveLength(1);
    }
  });

  it("signale un run introuvable", async () => {
    const repository = new MemorySimulationHistoryRepository();
    const outcome = await getPersistedSimulationRun(repository, 999);
    expect(outcome.ok).toBe(false);
  });

  it("tolère un JSON d’explication corrompu en mémoire", async () => {
    const repository = new MemorySimulationHistoryRepository();
    const saved = await repository.saveSimulationRun({
      ...sampleDto,
      employees: [
        {
          ...sampleDto.employees[0],
          explanationStepsJson: "{invalid",
        },
      ],
    });
    const outcome = await getPersistedSimulationRun(
      repository,
      saved.simulationRunId,
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.view.employees[0]?.explanationSteps).toEqual([]);
    }
  });
});

describe("getPersistedSimulationRun — compatibilité de schéma", () => {
  it("présente un snapshot v3 comme courant et complet", async () => {
    const repository = new MemorySimulationHistoryRepository();
    const saved = await repository.saveSimulationRun({
      ...sampleDto,
      resultSchemaVersion: 3,
    });
    const outcome = await getPersistedSimulationRun(
      repository,
      saved.simulationRunId,
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.compatibility).toBe("current");
      expect(outcome.compatibilityMessage).toBeNull();
      expect(outcome.view.summary.schemaCompatibility).toBe("current");
    }
  });

  it("présente un snapshot v2 comme incomplet sans faux zéro ni mois inventés", async () => {
    const repository = new MemorySimulationHistoryRepository();
    const saved = await repository.saveSimulationRun({
      ...sampleDto,
      resultSchemaVersion: 2,
    });
    const outcome = await getPersistedSimulationRun(
      repository,
      saved.simulationRunId,
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.compatibility).toBe("incomplete");
      expect(outcome.compatibilityMessage).toBeTruthy();
      expect(outcome.view.summary.retroactivityStartMonth).toBeNull();
      expect(outcome.view.summary.periodCombinedActualCostLabel).toBeNull();
      expect(outcome.view.employees[0]?.months ?? null).toBeNull();
    }
  });

  it("présente un snapshot v1 comme incompatible", async () => {
    const repository = new MemorySimulationHistoryRepository();
    const saved = await repository.saveSimulationRun({
      ...sampleDto,
      resultSchemaVersion: 1,
    });
    const outcome = await getPersistedSimulationRun(
      repository,
      saved.simulationRunId,
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.compatibility).toBe("incompatible");
      expect(outcome.compatibilityMessage).toBeTruthy();
    }
  });

  it("refuse explicitement un schéma inconnu", async () => {
    const repository = new MemorySimulationHistoryRepository();
    const saved = await repository.saveSimulationRun({
      ...sampleDto,
      resultSchemaVersion: 99,
    });
    const outcome = await getPersistedSimulationRun(
      repository,
      saved.simulationRunId,
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.message).toMatch(/schéma non reconnu/i);
    }
  });
});

describe("mapPersistedDetailToViewModel", () => {
  it("préserve les montants exacts sans Number", async () => {
    const repository = new MemorySimulationHistoryRepository();
    const saved = await repository.saveSimulationRun(sampleDto);
    const detail = await repository.getSimulationRun(saved.simulationRunId);
    expect(detail).not.toBeNull();
    const view = mapPersistedDetailToViewModel(detail!);
    expect(view.summary.budgetTargetLabel).toMatch(/25[\s\u202F]?000[\s\u202F]?003/);
    expect(view.employees[0]?.salaryFcfa).toBe(1000000n);
  });
});
