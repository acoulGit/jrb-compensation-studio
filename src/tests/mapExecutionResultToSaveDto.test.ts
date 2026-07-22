import { describe, expect, it } from "vitest";
import { mapExecutionResultToSaveDto } from "../application/campaignSimulation/mapExecutionResultToSaveDto";
import type { CampaignSimulationExecutionResult } from "../application/campaignSimulation/campaignSimulationExecutionModels";
import {
  withPromotionAwareBudgetSummary,
  withPromotionAwareEmployeeDefaults,
} from "./simulationResultViewFixtures";
import { DEFAULT_NINE_BOX_CONFIRMATION_FACTOR_MILLI } from "../domain/compensationReference/defaults";

function sampleResult(
  overrides: Partial<CampaignSimulationExecutionResult> = {},
): CampaignSimulationExecutionResult {
  return {
    campaignId: 1,
    campaignName: "Sim 2027",
    campaignYear: 2027,
    technicalApplicationMonth: 1,
    campaignStatus: "active",
    evaluationMode: "none",
    currentImportBatchId: 10,
    runSequence: 1,
    sourceFingerprint: "fp-source",
    configurationFingerprint: "fp-config",
    calculationContractVersion: 2,
    budgetSummary: withPromotionAwareBudgetSummary({
      budgetTargetMode: "manual_amount",
      exactBudgetTarget: { numerator: 25000003n, denominator: 1n },
      exactBudgetTargetLabel: "x",
      manualBudgetFcfa: 25000003n,
      annualActualOperationCostFcfa: 25000000n,
      annualActualOperationCostLabel: "x",
      annualTotalRoundingDelta: { numerator: -3n, denominator: 1n },
      annualTotalRoundingDeltaLabel: "x",
      annualTheoreticalAllocatedTotal: { numerator: 25000003n, denominator: 1n },
      annualTheoreticalAllocatedTotalLabel: "x",
      monthlyTheoreticalIncreaseTotal: {
        numerator: 25000003n,
        denominator: 12n,
      },
      monthlyTheoreticalIncreaseTotalLabel: "x",
      roundingMode: "nearest_half_up",
      roundingStepFcfa: 100n,
    }),
    populationSummary: {
      employeeCount: 1,
      positiveWeightEmployeeCount: 1,
      zeroWeightEmployeeCount: 0,
      confirmedUnderperformerCount: 0,
      neutralizeNineBoxEffectEmployeeCount: 0,
      nineBoxConfirmationFactorMilli: DEFAULT_NINE_BOX_CONFIRMATION_FACTOR_MILLI,
      annualTheoreticalAllocatedTotal: { numerator: 25000003n, denominator: 1n },
      annualActualOperationCostFcfa: 25000000n,
      annualTotalRoundingDelta: { numerator: -3n, denominator: 1n },
      isTheoreticalBudgetExactlyAllocated: true,
      campaignYear: 2027,
      retroactivityStartMonth: 1,
      technicalApplicationMonth: 1,
      campaignCoveredMonthCount: 12,
      totalBaseSalaryReminderFcfa: 0n,
      totalRemainingYearDirectIncreaseCostFcfa: 24999600n,
      totalAnnualActualBaseIncreaseCostFcfa: 24999600n,
      totalSeniorityReminderFcfa: 0n,
      totalRemainingYearDirectSeniorityImpactFcfa: 0n,
      totalAnnualSeniorityImpactFcfa: 0n,
      fullYearRunRatePromotionCostFcfa: 0n,
      fullYearRunRatePromotionCostLabel: "0 FCFA",
      fullYearRunRateCompensatoryCostFcfa: 24999600n,
      fullYearRunRateCompensatoryCostLabel: "x",
      fullYearRunRateCombinedBaseMeasureCostFcfa: 24999600n,
      fullYearRunRateCombinedBaseMeasureCostLabel: "x",
      fullYearRunRateSeniorityImpactFcfa: 0n,
      fullYearRunRateSeniorityImpactLabel: "0 FCFA",
      promotedIncludedEmployeeCount: 0,
      totalAnnualPromotionBudgetCostFcfa: 0n,
      availableAnnualCompensatoryBudget: { numerator: 25000003n, denominator: 1n },
      totalCombinedAnnualActualCostFcfa: 25000000n,
      totalAnnualPromotionSeniorityImpactFcfa: 0n,
      totalCombinedAnnualSeniorityImpactFcfa: 0n,
      compensatoryCalibrationRate: { numerator: 0n, denominator: 1n },
      minimumIncreaseMode: "none",
      minimumIncreasePopulationEmployeeCount: 0,
      totalMinimumComplementFloorCostFcfa: 0n,
      actualMinimumComplementPaidCostFcfa: 0n,
      actualCompensationAboveMinimumCostFcfa: 0n,
    },
    employees: [
      withPromotionAwareEmployeeDefaults({
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
        neutralizeNineBoxEffect: false,
        sourceNineBoxCode: null,
        nineBoxTreatmentKind: 'nine_box_code_applied',
        blockingReason: null,
        annualTheoreticalAllocation: { numerator: 25000003n, denominator: 1n },
        annualTheoreticalAllocationLabel: "x",
        monthlyTheoreticalIncrease: {
          numerator: 25000003n,
          denominator: 12n,
        },
        monthlyTheoreticalIncreaseLabel: "x",
        monthlyTheoreticalIncreaseRate: { numerator: 1n, denominator: 40n },
        monthlyTheoreticalIncreaseRateLabel: "x",
        monthlyFinalRoundedIncreaseFcfa: 2083300n,
        monthlyRoundingDelta: { numerator: -3n, denominator: 1n },
        monthlyRoundingDeltaLabel: "x",
        annualActualCostFcfa: 24999600n,
        annualRoundingDelta: { numerator: -403n, denominator: 1n },
        annualRoundingDeltaLabel: "x",
        monthlyFinalSalaryFcfa: 30283300n,
        campaignYear: 2027,
        technicalApplicationMonth: 1,
        retroactiveMonths: 0,
        remainingDirectPaymentMonths: 12,
        baseSalaryReminderFcfa: 0n,
        remainingYearDirectIncreaseCostFcfa: 24999600n,
        annualActualBaseIncreaseCostFcfa: 24999600n,
        hireDate: "2020-07-15",
        technicalApplicationMonthSeniorityRatePercent: 0,
        monthlySeniorityImpactSchedule: Array.from({ length: 12 }, (_, i) => ({
          month: i + 1,
          ratePercent: 0,
          monthlySeniorityImpactFcfa: 0n,
          paymentTiming: "direct" as const,
        })),
        seniorityReminderFcfa: 0n,
        remainingYearDirectSeniorityImpactFcfa: 0n,
        annualSeniorityImpactFcfa: 0n,
        explanationSteps: [
          { step: "alloc", formula: "a/b", outputValue: "1" },
        ],
      }),
    ],
    explanationSteps: [],
    ...overrides,
  };
}

describe("mapExecutionResultToSaveDto", () => {
  it("maps BigInts to canonical strings and preserves fractions", () => {
    const result = sampleResult();
    const dto = mapExecutionResultToSaveDto({
      result,
      expectedCampaignStatus: "active",
      sourceImportFileName: "pop.xlsx",
    });

    expect(dto.manualBudgetFcfaText).toBe("25000003");
    expect(dto.budgetTargetNumeratorText).toBe("25000003");
    expect(dto.budgetTargetDenominatorText).toBe("1");
    expect(dto.theoreticalTotalNumeratorText).toBe("25000003");
    expect(dto.theoreticalTotalDenominatorText).toBe("1");
    expect(dto.actualOperationAmountFcfaText).toBe("25000000");
    expect(dto.roundingStepFcfaText).toBe("100");
    expect(dto.sourceImportFileName).toBe("pop.xlsx");

    const employee = dto.employees[0];
    expect(employee.salaryFcfaText).toBe("1000000");
    expect(employee.theoreticalIncreaseRateNumeratorText).toBe("1");
    expect(employee.theoreticalIncreaseRateDenominatorText).toBe("40");
    // Schema v2 : theoretical_increase_amount = augmentation mensuelle théorique
    expect(employee.theoreticalIncreaseAmountNumeratorText).toBe("25000003");
    expect(employee.theoreticalIncreaseAmountDenominatorText).toBe("12");
    expect(employee.allocationWeightNumeratorText).toBe("1000000");
    expect(employee.finalRoundedIncreaseFcfaText).toBe("2083300");
    expect(employee.finalSalaryFcfaText).toBe("30283300");
  });

  it("serializes explanation steps as JSON", () => {
    const dto = mapExecutionResultToSaveDto({
      result: sampleResult(),
      expectedCampaignStatus: "active",
      sourceImportFileName: null,
    });
    expect(dto.employees[0].explanationStepsJson).toBe(
      JSON.stringify([{ step: "alloc", formula: "a/b", outputValue: "1" }]),
    );
  });

  it("allows negative rounding delta as negative numerator text", () => {
    const dto = mapExecutionResultToSaveDto({
      result: sampleResult(),
      expectedCampaignStatus: "draft",
      sourceImportFileName: null,
    });
    expect(dto.totalRoundingDeltaNumeratorText).toBe("-3");
    expect(dto.totalRoundingDeltaDenominatorText).toBe("1");
    expect(dto.employees[0].individualRoundingDeltaNumeratorText).toBe("-3");
    expect(dto.employees[0].individualRoundingDeltaDenominatorText).toBe("1");
  });

  it("does not mutate the source result (structuredClone snapshot)", () => {
    const result = sampleResult();
    const before = structuredClone(result);
    mapExecutionResultToSaveDto({
      result,
      expectedCampaignStatus: "active",
      sourceImportFileName: "pop.xlsx",
    });
    expect(result).toEqual(before);
    expect(result.budgetSummary.manualBudgetFcfa).toBe(25000003n);
    expect(result.employees[0].salaryFcfa).toBe(1000000n);
  });

  it('maps large BigInt 9000000000000n to "9000000000000"', () => {
    const result = sampleResult({
      budgetSummary: {
        ...sampleResult().budgetSummary,
        annualActualOperationCostFcfa: 9000000000000n,
      },
      employees: [
        {
          ...sampleResult().employees[0],
          monthlyFinalSalaryFcfa: 9000000000000n,
        },
      ],
    });
    const dto = mapExecutionResultToSaveDto({
      result,
      expectedCampaignStatus: "active",
      sourceImportFileName: null,
    });
    expect(dto.actualOperationAmountFcfaText).toBe("9000000000000");
    expect(dto.employees[0].finalSalaryFcfaText).toBe("9000000000000");
  });
});
