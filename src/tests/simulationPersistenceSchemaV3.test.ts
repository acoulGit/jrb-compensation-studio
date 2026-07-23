import { describe, expect, it } from "vitest";
import {
  CALCULATION_CONTRACT_VERSION,
  MINIMUM_INCREASE_CONTRACT_VERSION,
  RESULT_SCHEMA_VERSION,
  RESULT_SCHEMA_VERSION_LEGACY,
  RESULT_SCHEMA_VERSION_V2,
  RESULT_SCHEMA_VERSION_V3,
  SENIORITY_IMPACT_CONTRACT_VERSION,
} from "../domain/compensationCalculation";
import {
  assertSimulationResultPersistable,
  mapExecutionResultToSaveDto,
} from "../application/campaignSimulation/mapExecutionResultToSaveDto";
import {
  canPresentResultSchemaVersion,
  classifyResultSchemaVersion,
  resultSchemaCompatibilityMessage,
} from "../application/campaignSimulation/resultSchemaCompatibility";
import { MemorySimulationHistoryRepository } from "../infrastructure/database/repositories/memorySimulationHistoryRepository";
import type {
  CampaignSimulationExecutionResult,
  MonthlyCompensationTrajectoryView,
} from "../application/campaignSimulation/campaignSimulationExecutionModels";
import {
  withPromotionAwareBudgetSummary,
  withPromotionAwareEmployeeDefaults,
  emptyPopulationSocialMechanismDefaults,
} from "./simulationResultViewFixtures";
import { DEFAULT_NINE_BOX_CONFIRMATION_FACTOR_MILLI } from "../domain/compensationReference/defaults";

function monthEntry(month: number): MonthlyCompensationTrajectoryView {
  return {
    month,
    monthLabel: `M${month}`,
    baseSalaryFcfa: 1_000_000n,
    baseSalaryLabel: "x",
    gradeCode: "G1",
    jobFamilyCode: "F1",
    salaryPositionLabel: "Égal",
    targetCompensatoryRate: { numerator: 1n, denominator: 40n },
    targetCompensatoryRateLabel: "x",
    promotionRateOffset: { numerator: 0n, denominator: 1n },
    promotionRateOffsetLabel: "x",
    compensatoryComplementRate: { numerator: 1n, denominator: 40n },
    compensatoryComplementRateLabel: "x",
    theoreticalCompensatoryComplement: { numerator: 25000n, denominator: 1n },
    theoreticalCompensatoryComplementLabel: "x",
    roundedCompensatoryComplementFcfa: 25_000n,
    roundedCompensatoryComplementLabel: "x",
    promotionBudgetCostFcfa: 0n,
    promotionBudgetCostLabel: "x",
    finalSalaryFcfa: 1_025_000n,
    finalSalaryLabel: "x",
    seniorityRatePercent: 0,
    seniorityRateLabel: "0 %",
    promotionSeniorityImpactFcfa: 0n,
    promotionSeniorityImpactLabel: "x",
    compensatorySeniorityImpactFcfa: 0n,
    compensatorySeniorityImpactLabel: "x",
    totalSeniorityImpactFcfa: 0n,
    totalSeniorityImpactLabel: "x",
    promotionPaymentStatusLabel: "N/A",
    compensatoryPaymentStatusLabel: "Direct",
    paymentTiming: "direct",
    coveredByCampaignPeriod: true,
    includedInCampaignEnvelope: true,
    promotionActive: false,
    promotionStatus: "none",
    isMinimumIncreasePopulationEmployee: true,
    guaranteedTotalIncreaseExact: { numerator: 0n, denominator: 1n },
    guaranteedTotalIncreaseLabel: "x",
    applicablePromotionIncrementFcfa: 0n,
    applicablePromotionIncrementLabel: "x",
    requiredMinimumComplementExact: { numerator: 0n, denominator: 1n },
    requiredMinimumComplementLabel: "x",
    minimumComplementFloorFcfa: 0n,
    minimumComplementFloorLabel: "x",
    weightedComplementExact: { numerator: 25000n, denominator: 1n },
    weightedComplementLabel: "x",
    theoreticalComplementExact: { numerator: 25000n, denominator: 1n },
    theoreticalComplementLabel: "x",
    actualComplementAboveMinimumFcfa: 25_000n,
    actualComplementAboveMinimumLabel: "x",
    universalFixedAmountFcfa: 0n,
    universalFixedAmountLabel: "0 FCFA",
  };
}

function sampleResult(): CampaignSimulationExecutionResult {
  const trajectory = Array.from({ length: 12 }, (_, i) => monthEntry(i + 1));
  return {
    campaignId: 1,
    campaignName: "Sim 2027",
    campaignYear: 2027,
    technicalApplicationMonth: 4,
    minimumGuaranteeEffectiveMonth: 4,
    campaignStatus: "active",
    evaluationMode: "none",
    currentImportBatchId: 10,
    runSequence: 1,
    sourceFingerprint: "fp-source",
    configurationFingerprint: "fp-config",
    calculationContractVersion: CALCULATION_CONTRACT_VERSION,
    budgetSummary: withPromotionAwareBudgetSummary({
      budgetTargetMode: "manual_amount",
      exactBudgetTarget: { numerator: 300000n, denominator: 1n },
      exactBudgetTargetLabel: "x",
      manualBudgetFcfa: 300000n,
      annualActualOperationCostFcfa: 300000n,
      annualActualOperationCostLabel: "x",
      annualTotalRoundingDelta: { numerator: 0n, denominator: 1n },
      annualTotalRoundingDeltaLabel: "x",
      annualTheoreticalAllocatedTotal: { numerator: 300000n, denominator: 1n },
      annualTheoreticalAllocatedTotalLabel: "x",
      monthlyTheoreticalIncreaseTotal: { numerator: 25000n, denominator: 1n },
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
      annualTheoreticalAllocatedTotal: { numerator: 300000n, denominator: 1n },
      annualActualOperationCostFcfa: 300000n,
      annualTotalRoundingDelta: { numerator: 0n, denominator: 1n },
      isTheoreticalBudgetExactlyAllocated: true,
      campaignYear: 2027,
      retroactivityStartMonth: 1,
      technicalApplicationMonth: 4,
      minimumGuaranteeEffectiveMonth: 4,
      campaignCoveredMonthCount: 12,
      totalBaseSalaryReminderFcfa: 75000n,
      totalRemainingYearDirectIncreaseCostFcfa: 225000n,
      totalAnnualActualBaseIncreaseCostFcfa: 300000n,
      totalSeniorityReminderFcfa: 0n,
      totalRemainingYearDirectSeniorityImpactFcfa: 0n,
      totalAnnualSeniorityImpactFcfa: 0n,
      fullYearRunRatePromotionCostFcfa: 0n,
      fullYearRunRatePromotionCostLabel: "0 FCFA",
      fullYearRunRateCompensatoryCostFcfa: 300000n,
      fullYearRunRateCompensatoryCostLabel: "x",
      fullYearRunRateCombinedBaseMeasureCostFcfa: 300000n,
      fullYearRunRateCombinedBaseMeasureCostLabel: "x",
      fullYearRunRateSeniorityImpactFcfa: 0n,
      fullYearRunRateSeniorityImpactLabel: "0 FCFA",
      promotedIncludedEmployeeCount: 0,
      totalAnnualPromotionBudgetCostFcfa: 0n,
      availableAnnualCompensatoryBudget: { numerator: 300000n, denominator: 1n },
      totalCombinedAnnualActualCostFcfa: 300000n,
      totalAnnualPromotionSeniorityImpactFcfa: 0n,
      totalCombinedAnnualSeniorityImpactFcfa: 0n,
      compensatoryCalibrationRate: { numerator: 1n, denominator: 40n },
      minimumIncreaseMode: "none",
      minimumIncreasePopulationEmployeeCount: 1,
      totalMinimumComplementFloorCostFcfa: 0n,
      actualMinimumComplementPaidCostFcfa: 0n,
      actualCompensationAboveMinimumCostFcfa: 300000n,
      ...emptyPopulationSocialMechanismDefaults(),
    },
    employees: [
      withPromotionAwareEmployeeDefaults({
        employeeId: "E1",
        employeeDisplayName: "Alice",
        familyCode: "F1",
        familyLabel: "Fam",
        gradeCode: "G1",
        gradeLabel: "Gr",
        salaryFcfa: 1_000_000n,
        s0Fcfa: 1_000_000n,
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
        allocationWeight: { numerator: 1_000_000n, denominator: 1n },
        evaluationFactorLabel: "1",
        theoreticalMatrixWeightLabel: "1",
        effectiveMatrixWeightLabel: "1",
        allocationWeightLabel: "1000000",
        neutralizeNineBoxEffect: false,
        sourceNineBoxCode: null,
        nineBoxTreatmentKind: 'nine_box_code_applied',
        blockingReason: null,
        annualTheoreticalAllocation: { numerator: 300000n, denominator: 1n },
        annualTheoreticalAllocationLabel: "x",
        monthlyTheoreticalIncrease: { numerator: 25000n, denominator: 1n },
        monthlyTheoreticalIncreaseLabel: "x",
        monthlyTheoreticalIncreaseRate: { numerator: 1n, denominator: 40n },
        monthlyTheoreticalIncreaseRateLabel: "x",
        monthlyFinalRoundedIncreaseFcfa: 25_000n,
        monthlyRoundingDelta: { numerator: 0n, denominator: 1n },
        monthlyRoundingDeltaLabel: "x",
        annualActualCostFcfa: 300000n,
        annualRoundingDelta: { numerator: 0n, denominator: 1n },
        annualRoundingDeltaLabel: "x",
        monthlyFinalSalaryFcfa: 1_025_000n,
        campaignYear: 2027,
        technicalApplicationMonth: 4,
        retroactiveMonths: 3,
        remainingDirectPaymentMonths: 9,
        baseSalaryReminderFcfa: 75000n,
        remainingYearDirectIncreaseCostFcfa: 225000n,
        annualActualBaseIncreaseCostFcfa: 300000n,
        hireDate: "2020-07-15",
        technicalApplicationMonthSeniorityRatePercent: 0,
        monthlySeniorityImpactSchedule: [],
        seniorityReminderFcfa: 0n,
        remainingYearDirectSeniorityImpactFcfa: 0n,
        annualSeniorityImpactFcfa: 0n,
        monthlyCompensationTrajectory: trajectory,
        explanationSteps: [],
      }),
    ],
    explanationSteps: [],
  };
}

describe("Lot 2B-P1 / 2B-RC1-H1 — persistance schema v3/v4", () => {
  it("expose les versions de contrat/schema attendues", () => {
    expect(RESULT_SCHEMA_VERSION).toBeGreaterThanOrEqual(4);
    expect(RESULT_SCHEMA_VERSION_V3).toBe(3);
    expect(RESULT_SCHEMA_VERSION_V2).toBe(2);
    expect(RESULT_SCHEMA_VERSION_LEGACY).toBe(1);
    expect(CALCULATION_CONTRACT_VERSION).toBeGreaterThanOrEqual(5);
    expect(SENIORITY_IMPACT_CONTRACT_VERSION).toBe(1);
    expect(MINIMUM_INCREASE_CONTRACT_VERSION).toBe(2);
  });

  it("classe la compatibilité des schémas", () => {
    expect(classifyResultSchemaVersion(4)).toBe("current");
    expect(classifyResultSchemaVersion(3)).toBe("current");
    expect(classifyResultSchemaVersion(2)).toBe("incomplete");
    expect(classifyResultSchemaVersion(1)).toBe("incompatible");
    expect(classifyResultSchemaVersion(99)).toBe("unknown");
    expect(canPresentResultSchemaVersion(4)).toBe(true);
    expect(canPresentResultSchemaVersion(3)).toBe(true);
    expect(canPresentResultSchemaVersion(2)).toBe(false);
    expect(resultSchemaCompatibilityMessage(4)).toBeNull();
    expect(resultSchemaCompatibilityMessage(3)).toBeNull();
    expect(resultSchemaCompatibilityMessage(2)).toMatch(
      /période configurable.*historique complet/is,
    );
    expect(resultSchemaCompatibilityMessage(1)).toMatch(
      /ancien contrat de calcul.*résultat actuel/is,
    );
    expect(resultSchemaCompatibilityMessage(42)).toMatch(/non reconnu/i);
  });

  it("autorise contrat 5 + schema 4, contrat 4 + schema 3, et refuse les schemas trop anciens", () => {
    expect(() =>
      assertSimulationResultPersistable({
        calculationContractVersion: 5,
        resultSchemaVersion: 4,
      }),
    ).not.toThrow();
    expect(() =>
      assertSimulationResultPersistable({
        calculationContractVersion: 4,
        resultSchemaVersion: 3,
      }),
    ).not.toThrow();
    expect(() =>
      assertSimulationResultPersistable({
        calculationContractVersion: 5,
        resultSchemaVersion: 3,
      }),
    ).toThrow(/schema/i);
    expect(() =>
      assertSimulationResultPersistable({
        calculationContractVersion: 3,
        resultSchemaVersion: 2,
      }),
    ).toThrow(/schema/i);
  });

  it("mappe le résultat en DTO schema v4 avec 12 mois (aucun recalcul)", () => {
    const dto = mapExecutionResultToSaveDto({
      result: sampleResult(),
      expectedCampaignStatus: "active",
      sourceImportFileName: "pop.xlsx",
    });
    expect(dto.resultSchemaVersion).toBe(RESULT_SCHEMA_VERSION);
    expect(dto.calculationContractVersion).toBe(CALCULATION_CONTRACT_VERSION);
    expect(dto.seniorityImpactContractVersion).toBe(1);
    expect(dto.minimumIncreaseContractVersion).toBe(2);
    expect(dto.retroactivityStartMonth).toBe(1);
    expect(dto.technicalApplicationMonth).toBe(4);
    expect(dto.minimumGuaranteeEffectiveMonth).toBe(4);
    expect(dto.reminderMonthCount).toBe(3);
    expect(dto.directPaymentMonthCount).toBe(9);
    expect(dto.minimumIncreaseMode).toBe("none");
    expect(dto.actualCombinedCampaignPeriodCostText).toBe("300000");
    expect(dto.totalBaseSalaryReminderText).toBe("75000");
    expect(dto.neutralizeNineBoxEffectEmployeeCount).toBe(0);

    const employee = dto.employees[0];
    expect(employee.months).toHaveLength(12);
    expect(employee.months!.map((m) => m.month)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(employee.months![0].paymentTiming).toBe("direct");
    expect(employee.months![0].promotionPaymentTiming).toBe("not_applicable");
    expect(employee.months![0].finalSalaryFcfaText).toBe("1025000");
    expect(employee.annualActualCostFcfaText).toBe("300000");
    expect(employee.hireDate).toBe("2020-07-15");
    expect(employee.neutralizeNineBoxEffect).toBe(false);
  });

  it("dérive promotion_payment_timing depuis le domaine sans recalcul", () => {
    const result = sampleResult();
    const traj = result.employees[0].monthlyCompensationTrajectory.map((m, i) =>
      i >= 3
        ? { ...m, promotionActive: true, paymentTiming: "reminder" as const }
        : m,
    );
    result.employees[0] = {
      ...result.employees[0],
      monthlyCompensationTrajectory: traj,
    };
    const dto = mapExecutionResultToSaveDto({
      result,
      expectedCampaignStatus: "active",
      sourceImportFileName: null,
    });
    expect(dto.employees[0].months![0].promotionPaymentTiming).toBe(
      "not_applicable",
    );
    expect(dto.employees[0].months![3].promotionPaymentTiming).toBe("reminder");
  });

  it("persiste et relit les 12 mois via le repository mémoire (jan→déc, copie défensive)", async () => {
    const repo = new MemorySimulationHistoryRepository();
    const dto = mapExecutionResultToSaveDto({
      result: sampleResult(),
      expectedCampaignStatus: "active",
      sourceImportFileName: "pop.xlsx",
    });
    const saved = await repo.saveSimulationRun(dto);

    const detail = await repo.getSimulationRun(saved.simulationRunId);
    expect(detail).not.toBeNull();
    expect(detail!.summary.resultSchemaVersion).toBe(RESULT_SCHEMA_VERSION);
    const months = detail!.employees[0].months!;
    expect(months).toHaveLength(12);
    expect(months.map((m) => m.month)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(months[0].finalSalaryFcfa).toBe(1_025_000n);

    // Copie défensive : muter le résultat lu ne modifie pas le store.
    months[0].finalSalaryFcfa = 1n;
    const again = await repo.getSimulationRun(saved.simulationRunId);
    expect(again!.employees[0].months![0].finalSalaryFcfa).toBe(1_025_000n);

    const byEmployee = await repo.listSimulationEmployeeMonthResults(
      detail!.employees[0].id,
    );
    expect(byEmployee).toHaveLength(12);
  });

  it("persiste le calendrier de paiement et la politique minimum (cas 7/15/38)", () => {
    const dto = mapExecutionResultToSaveDto({
      result: sampleResult(),
      expectedCampaignStatus: "active",
      sourceImportFileName: null,
      minimumIncreasePolicy: {
        mode: "fixed_monthly_amount",
        minimumMonthlyAmountFcfa: 15000n,
        minimumIncreaseRate: null,
      },
    });
    expect(dto.minimumMonthlyAmountText).toBe("15000");
    expect(dto.minimumRateNumeratorText).toBeNull();
    expect(dto.totalCompensatoryReminderText).toBeDefined();
    expect(dto.totalRemainingYearDirectCompensatoryCostText).toBeDefined();
    expect(dto.promotionCostPaidBeforeTechnicalMonthText).toBeDefined();
  });

  it("marque les mois hors période avant rétroactivité (cas 26)", () => {
    const result = sampleResult();
    result.populationSummary = {
      ...result.populationSummary,
      retroactivityStartMonth: 3,
      technicalApplicationMonth: 7,
      campaignCoveredMonthCount: 10,
    };
    result.employees[0] = {
      ...result.employees[0],
      retroactivityStartMonth: 3,
      technicalApplicationMonth: 7,
      campaignCoveredMonthCount: 10,
      monthlyCompensationTrajectory: result.employees[0].monthlyCompensationTrajectory.map(
        (m) => ({
          ...m,
          coveredByCampaignPeriod: m.month >= 3,
          paymentTiming:
            m.month < 3
              ? ("outside_campaign" as const)
              : m.month < 7
                ? ("reminder" as const)
                : ("direct" as const),
          roundedCompensatoryComplementFcfa: m.month < 3 ? 0n : m.roundedCompensatoryComplementFcfa,
          minimumComplementFloorFcfa: m.month < 3 ? 0n : m.minimumComplementFloorFcfa,
          actualComplementAboveMinimumFcfa:
            m.month < 3 ? 0n : m.actualComplementAboveMinimumFcfa,
        }),
      ),
    };
    const dto = mapExecutionResultToSaveDto({
      result,
      expectedCampaignStatus: "active",
      sourceImportFileName: null,
    });
    expect(dto.retroactivityStartMonth).toBe(3);
    expect(dto.reminderMonthCount).toBe(4);
    expect(dto.directPaymentMonthCount).toBe(6);
    expect(dto.employees[0].months![0].coveredByCampaignPeriod).toBe(false);
    expect(dto.employees[0].months![0].paymentTiming).toBe("outside_campaign");
    expect(dto.employees[0].months![0].roundedCompensatoryComplementFcfaText).toBe(
      "0",
    );
    expect(dto.employees[0].months![2].paymentTiming).toBe("reminder");
    expect(dto.employees[0].months![6].paymentTiming).toBe("direct");
  });

  it("mappe un BigInt très élevé sans perte (cas 54)", () => {
    const huge = 9007199254740993n; // > Number.MAX_SAFE_INTEGER
    const result = sampleResult();
    result.budgetSummary = {
      ...result.budgetSummary,
      annualActualOperationCostFcfa: huge,
      annualActualOperationCostLabel: "x",
    };
    result.populationSummary = {
      ...result.populationSummary,
      annualActualOperationCostFcfa: huge,
    };
    const dto = mapExecutionResultToSaveDto({
      result,
      expectedCampaignStatus: "active",
      sourceImportFileName: null,
    });
    expect(dto.actualOperationAmountFcfaText).toBe("9007199254740993");
  });
});
