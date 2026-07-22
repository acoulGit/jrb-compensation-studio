import { describe, expect, it } from "vitest";
import { MemorySimulationHistoryRepository } from "../infrastructure/database/repositories/memorySimulationHistoryRepository";
import type { SaveSimulationRunDto } from "../application/campaignSimulation/simulationPersistenceModels";

function sampleDto(
  overrides: Partial<SaveSimulationRunDto> = {},
): SaveSimulationRunDto {
  return {
    campaignId: 1,
    expectedCampaignStatus: "active",
    expectedCurrentImportBatchId: 10,
    campaignName: "Sim 2027",
    campaignYear: 2027,
    campaignStatusAtRun: "active",
    evaluationMode: "none",
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
      neutralizeNineBoxEffectEmployeeCount: 0,
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
        neutralizeNineBoxEffect: false,
        sourceNineBoxCode: null,
        nineBoxTreatmentKind: 'nine_box_code_applied',
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
    ...overrides,
  };
}

describe("MemorySimulationHistoryRepository", () => {
  it("increments run_number 1, then 2 for the same campaign", async () => {
    const repo = new MemorySimulationHistoryRepository();
    const first = await repo.saveSimulationRun(sampleDto());
    const second = await repo.saveSimulationRun(sampleDto());
    expect(first.runNumber).toBe(1);
    expect(second.runNumber).toBe(2);
  });

  it("isolates run numbers by campaign", async () => {
    const repo = new MemorySimulationHistoryRepository();
    const a1 = await repo.saveSimulationRun(sampleDto({ campaignId: 1 }));
    const b1 = await repo.saveSimulationRun(sampleDto({ campaignId: 2 }));
    const a2 = await repo.saveSimulationRun(sampleDto({ campaignId: 1 }));
    expect(a1.runNumber).toBe(1);
    expect(b1.runNumber).toBe(1);
    expect(a2.runNumber).toBe(2);

    const listA = await repo.listSimulationRuns(1);
    const listB = await repo.listSimulationRuns(2);
    expect(listA.total).toBe(2);
    expect(listB.total).toBe(1);
    expect(listA.items.every((item) => item.campaignId === 1)).toBe(true);
    expect(listB.items.every((item) => item.campaignId === 2)).toBe(true);
  });

  it("lists runs descending by runNumber", async () => {
    const repo = new MemorySimulationHistoryRepository();
    await repo.saveSimulationRun(sampleDto());
    await repo.saveSimulationRun(sampleDto());
    await repo.saveSimulationRun(sampleDto());
    const listed = await repo.listSimulationRuns(1);
    expect(listed.items.map((item) => item.runNumber)).toEqual([3, 2, 1]);
  });

  it("supports pagination with limit and offset", async () => {
    const repo = new MemorySimulationHistoryRepository();
    await repo.saveSimulationRun(sampleDto());
    await repo.saveSimulationRun(sampleDto());
    await repo.saveSimulationRun(sampleDto());
    await repo.saveSimulationRun(sampleDto());

    const page = await repo.listSimulationRuns(1, { limit: 2, offset: 1 });
    expect(page.total).toBe(4);
    expect(page.limit).toBe(2);
    expect(page.offset).toBe(1);
    expect(page.items.map((item) => item.runNumber)).toEqual([3, 2]);
  });

  it("returns detail with employees sorted by employeeId", async () => {
    const repo = new MemorySimulationHistoryRepository();
    const saved = await repo.saveSimulationRun(
      sampleDto({
        employeeCount: 2,
        employees: [
          {
            ...sampleDto().employees[0],
            employeeId: "E2",
            employeeDisplayName: "Bob",
          },
          {
            ...sampleDto().employees[0],
            employeeId: "E1",
            employeeDisplayName: "Alice",
          },
        ],
      }),
    );

    const detail = await repo.getSimulationRun(saved.simulationRunId);
    expect(detail).not.toBeNull();
    expect(detail!.employees.map((e) => e.employeeId)).toEqual(["E1", "E2"]);
    expect(detail!.summary.runNumber).toBe(1);
    expect(detail!.summary.manualBudgetFcfa).toBe(25000003n);
    expect(detail!.summary.totalRoundingDelta).toEqual({
      numerator: -3n,
      denominator: 1n,
    });
  });

  it("is immutable: mutating returned objects does not change the store", async () => {
    const repo = new MemorySimulationHistoryRepository();
    const saved = await repo.saveSimulationRun(sampleDto());

    const detail = await repo.getSimulationRun(saved.simulationRunId);
    expect(detail).not.toBeNull();
    detail!.summary.campaignName = "mutated";
    detail!.employees[0].employeeDisplayName = "Mutated";
    detail!.employees[0].salaryFcfa = 1n;

    const listed = await repo.listSimulationRuns(1);
    listed.items[0].campaignName = "list-mutated";

    const again = await repo.getSimulationRun(saved.simulationRunId);
    expect(again!.summary.campaignName).toBe("Sim 2027");
    expect(again!.employees[0].employeeDisplayName).toBe("Alice");
    expect(again!.employees[0].salaryFcfa).toBe(1000000n);

    const listedAgain = await repo.listSimulationRuns(1);
    expect(listedAgain.items[0].campaignName).toBe("Sim 2027");
  });
});
