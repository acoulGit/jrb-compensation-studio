/**
 * Lot 2A-H2D-1 — rétroactivité configurable (contrat de calcul v3).
 */

import { describe, expect, it } from "vitest";
import {
  CALCULATION_CONTRACT_VERSION,
  CompensationCalculationError,
  RESULT_SCHEMA_VERSION,
  buildPromotionEvent,
  calculatePreparedPopulationCompensation,
  exactAmountFromInteger,
  formatExactAmount,
  fractionsEqual,
  NEUTRAL_EMPLOYER_COST_POLICY,
  type PreparedEmployeeCalculationInput,
  type PreparedPopulationCalculationInput,
  type PopulationCalculationReferences,
} from "../domain/compensationCalculation";
import {
  DEFAULT_NINE_BOX_CONFIRMATION_FACTOR_MILLI,
  DEFAULT_NINE_BOX_FACTORS,
  DEFAULT_PERFORMANCE_FACTORS,
  DEFAULT_POTENTIAL_FACTORS,
  DEFAULT_SALARY_POSITIONS,
} from "../domain/compensationReference/defaults";
import { buildConfigurationFingerprint } from "../application/campaignSimulation/formatExactBudgetDisplay";
import {
  assertSimulationResultPersistable,
  mapExecutionResultToSaveDto,
} from "../application/campaignSimulation/mapExecutionResultToSaveDto";
import { buildSimulationResultView } from "../application/campaignSimulation/buildSimulationResultView";
import type { CampaignSimulationExecutionResult } from "../application/campaignSimulation/campaignSimulationExecutionModels";
import {
  withPromotionAwareBudgetSummary,
  withPromotionAwareEmployeeDefaults,
  emptyPopulationSocialMechanismDefaults,
} from "./simulationResultViewFixtures";

function positions() {
  return DEFAULT_SALARY_POSITIONS.map((p) => ({
    code: p.code,
    label: p.label,
    referenceRatioBps: p.referenceRatioBps,
    positionFactorMilli: p.positionFactorMilli,
  }));
}

function factors(): Pick<
  PopulationCalculationReferences,
  "performanceFactors" | "potentialFactors" | "nineBoxFactors" | "nineBoxConfirmationFactorMilli"
> {
  return {
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
    nineBoxConfirmationFactorMilli: DEFAULT_NINE_BOX_CONFIRMATION_FACTOR_MILLI,
  };
}

function expectCode(run: () => void, code: string): void {
  try {
    run();
    expect.fail(`Attendu code ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(CompensationCalculationError);
    const typed = error as CompensationCalculationError;
    if (typed.code === code) {
      return;
    }
    // Validation calendrier / rétro encapsulée dans POPULATION_CALCULATION_FAILED.
    expect(typed.code).toBe("POPULATION_CALCULATION_FAILED");
    expect(typed.issues?.[0]?.code).toBe(code);
  }
}

function baseInput(
  overrides: Partial<PreparedPopulationCalculationInput> & {
    employees?: PreparedEmployeeCalculationInput[];
  } = {},
): PreparedPopulationCalculationInput {
  return {
    employees: overrides.employees ?? [
      {
        employeeId: "E1",
        familyCode: "F1",
        gradeCode: "G1",
        salaryFcfa: 500_000,
        hireDate: "2020-07-15",
        confirmedUnderperformer: false,
      },
    ],
    references: overrides.references ?? {
      evaluationMode: "none",
      salaryGrid: [
        { familyCode: "F1", gradeCode: "G1", s0Fcfa: 500_000 },
        { familyCode: "F1", gradeCode: "G2", s0Fcfa: 600_000 },
      ],
      salaryPositions: positions(),
      ...factors(),
    },
    budgetTarget: overrides.budgetTarget ?? {
      mode: "manual_amount",
      manualBudgetFcfa: 120_000,
    },
    roundingPolicy: overrides.roundingPolicy ?? {
      mode: "nearest_half_up",
      stepFcfa: 5,
    },
    campaignYear: overrides.campaignYear ?? 2026,
    retroactivityStartMonth: overrides.retroactivityStartMonth ?? 1,
    technicalApplicationMonth: overrides.technicalApplicationMonth ?? 7,
    employerCostPolicy:
      overrides.employerCostPolicy ?? NEUTRAL_EMPLOYER_COST_POLICY,
  };
}

/** Recette Population Test 1 (annualBudgetMonthlyIncrease) — sans promo. */
function buildRecipeInput(
  overrides: Partial<PreparedPopulationCalculationInput> = {},
): PreparedPopulationCalculationInput {
  const employees: PreparedEmployeeCalculationInput[] = [];
  for (let i = 1; i <= 14; i += 1) {
    employees.push({
      employeeId: `EMP-${2000 + i}`,
      familyCode: "F1",
      gradeCode: "G1",
      salaryFcfa: i === 2 ? 536_000 : 400_000 + i * 10_000,
      hireDate: "2020-07-15",
      confirmedUnderperformer: false,
    });
  }
  employees.push({
    employeeId: "EMP-UNDER",
    familyCode: "F1",
    gradeCode: "G1",
    salaryFcfa: 450_000,
    hireDate: "2020-07-15",
    confirmedUnderperformer: true,
  });

  return {
    employees,
    references: {
      evaluationMode: "none",
      salaryGrid: [{ familyCode: "F1", gradeCode: "G1", s0Fcfa: 500_000 }],
      salaryPositions: positions(),
      ...factors(),
    },
    budgetTarget: {
      mode: "manual_amount",
      manualBudgetFcfa: 5_000_023,
    },
    roundingPolicy: {
      mode: "nearest_half_up",
      stepFcfa: 5,
    },
    campaignYear: 2026,
    technicalApplicationMonth: 1,
    ...overrides,
    employerCostPolicy:
      overrides.employerCostPolicy ?? NEUTRAL_EMPLOYER_COST_POLICY,
  };
}

function samplePersistableResult(
  overrides: Partial<CampaignSimulationExecutionResult> = {},
): CampaignSimulationExecutionResult {
  return {
    campaignId: 1,
    campaignName: "Sim",
    campaignYear: 2026,
    technicalApplicationMonth: 7,
    minimumGuaranteeEffectiveMonth: 7,
    campaignStatus: "active",
    evaluationMode: "none",
    currentImportBatchId: 1,
    runSequence: 1,
    sourceFingerprint: "fp-s",
    configurationFingerprint: "fp-c",
    calculationContractVersion: CALCULATION_CONTRACT_VERSION,
    budgetSummary: withPromotionAwareBudgetSummary({
      budgetTargetMode: "manual_amount",
      exactBudgetTarget: { numerator: 100n, denominator: 1n },
      exactBudgetTargetLabel: "x",
      annualActualOperationCostFcfa: 100n,
      annualActualOperationCostLabel: "x",
      annualTotalRoundingDelta: { numerator: 0n, denominator: 1n },
      annualTotalRoundingDeltaLabel: "x",
      annualTheoreticalAllocatedTotal: { numerator: 100n, denominator: 1n },
      annualTheoreticalAllocatedTotalLabel: "x",
      monthlyTheoreticalIncreaseTotal: { numerator: 100n, denominator: 10n },
      monthlyTheoreticalIncreaseTotalLabel: "x",
      roundingMode: "nearest_half_up",
      roundingStepFcfa: 5n,
    }),
    populationSummary: {
      employeeCount: 1,
      positiveWeightEmployeeCount: 1,
      zeroWeightEmployeeCount: 0,
      confirmedUnderperformerCount: 0,
      neutralizeNineBoxEffectEmployeeCount: 0,
      nineBoxConfirmationFactorMilli: DEFAULT_NINE_BOX_CONFIRMATION_FACTOR_MILLI,
      annualTheoreticalAllocatedTotal: { numerator: 100n, denominator: 1n },
      annualActualOperationCostFcfa: 100n,
      annualTotalRoundingDelta: { numerator: 0n, denominator: 1n },
      isTheoreticalBudgetExactlyAllocated: true,
      campaignYear: 2026,
      retroactivityStartMonth: 1,
      technicalApplicationMonth: 7,
      minimumGuaranteeEffectiveMonth: 7,
      campaignCoveredMonthCount: 12,
      totalBaseSalaryReminderFcfa: 0n,
      totalRemainingYearDirectIncreaseCostFcfa: 100n,
      totalAnnualActualBaseIncreaseCostFcfa: 100n,
      totalSeniorityReminderFcfa: 0n,
      totalRemainingYearDirectSeniorityImpactFcfa: 0n,
      totalAnnualSeniorityImpactFcfa: 0n,
      fullYearRunRatePromotionCostFcfa: 0n,
      fullYearRunRatePromotionCostLabel: "0 FCFA",
      fullYearRunRateCompensatoryCostFcfa: 100n,
      fullYearRunRateCompensatoryCostLabel: "x",
      fullYearRunRateCombinedBaseMeasureCostFcfa: 100n,
      fullYearRunRateCombinedBaseMeasureCostLabel: "x",
      fullYearRunRateSeniorityImpactFcfa: 0n,
      fullYearRunRateSeniorityImpactLabel: "0 FCFA",
      promotedIncludedEmployeeCount: 0,
      totalAnnualPromotionBudgetCostFcfa: 0n,
      availableAnnualCompensatoryBudget: { numerator: 100n, denominator: 1n },
      totalCombinedAnnualActualCostFcfa: 100n,
      totalAnnualPromotionSeniorityImpactFcfa: 0n,
      totalCombinedAnnualSeniorityImpactFcfa: 0n,
      compensatoryCalibrationRate: { numerator: 0n, denominator: 1n },
      minimumIncreaseMode: "none",
      minimumIncreasePopulationEmployeeCount: 0,
      totalMinimumComplementFloorCostFcfa: 0n,
      actualMinimumComplementPaidCostFcfa: 0n,
      actualCompensationAboveMinimumCostFcfa: 0n,
      ...emptyPopulationSocialMechanismDefaults(),
    },
    employees: [
      withPromotionAwareEmployeeDefaults({
        employeeId: "E1",
        employeeDisplayName: null,
        familyCode: "F1",
        familyLabel: null,
        gradeCode: "G1",
        gradeLabel: null,
        salaryFcfa: 500_000n,
        s0Fcfa: 500_000n,
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
        allocationWeight: { numerator: 500_000n, denominator: 1n },
        evaluationFactorLabel: "1",
        theoreticalMatrixWeightLabel: "1",
        effectiveMatrixWeightLabel: "1",
        allocationWeightLabel: "500000",
        neutralizeNineBoxEffect: false,
        sourceNineBoxCode: null,
        nineBoxTreatmentKind: 'nine_box_code_applied',
        blockingReason: null,
        annualTheoreticalAllocation: { numerator: 100n, denominator: 1n },
        annualTheoreticalAllocationLabel: "x",
        monthlyTheoreticalIncrease: { numerator: 10n, denominator: 1n },
        monthlyTheoreticalIncreaseLabel: "x",
        monthlyTheoreticalIncreaseRate: { numerator: 1n, denominator: 50_000n },
        monthlyTheoreticalIncreaseRateLabel: "x",
        monthlyFinalRoundedIncreaseFcfa: 10n,
        monthlyRoundingDelta: { numerator: 0n, denominator: 1n },
        monthlyRoundingDeltaLabel: "x",
        annualActualCostFcfa: 100n,
        annualRoundingDelta: { numerator: 0n, denominator: 1n },
        annualRoundingDeltaLabel: "x",
        monthlyFinalSalaryFcfa: 500_010n,
        campaignYear: 2026,
        technicalApplicationMonth: 7,
        retroactiveMonths: 6,
        remainingDirectPaymentMonths: 6,
        baseSalaryReminderFcfa: 0n,
        remainingYearDirectIncreaseCostFcfa: 100n,
        annualActualBaseIncreaseCostFcfa: 100n,
        hireDate: "2020-07-15",
        technicalApplicationMonthSeniorityRatePercent: 0,
        monthlySeniorityImpactSchedule: [],
        seniorityReminderFcfa: 0n,
        remainingYearDirectSeniorityImpactFcfa: 0n,
        annualSeniorityImpactFcfa: 0n,
        explanationSteps: [],
      }),
    ],
    explanationSteps: [],
    ...overrides,
  };
}

describe("Lot 2A-H2D-1 — rétroactivité configurable", () => {
  it("1. défaut janvier (rétro = 1) si omis", () => {
    const result = calculatePreparedPopulationCompensation(baseInput());
    expect(result.retroactivityStartMonth).toBe(1);
    expect(result.campaignCoveredMonthCount).toBe(12);
    expect(result.employees[0]!.retroactivityStartMonth).toBe(1);
    expect(CALCULATION_CONTRACT_VERSION).toBeGreaterThanOrEqual(5);
  });

  it("2a. recette Population Test 1 mesurée (5 000 023 / pas 5 → 5 000 040 / +17)", () => {
    const result = calculatePreparedPopulationCompensation(
      buildRecipeInput({ retroactivityStartMonth: 1 }),
    );
    expect(result.retroactivityStartMonth).toBe(1);
    expect(result.campaignCoveredMonthCount).toBe(12);
    expect(result.totalAnnualPromotionBudgetCostFcfa).toBe(0n);
    expect(
      fractionsEqual(
        result.annualTheoreticalAllocatedTotal,
        exactAmountFromInteger(5_000_023n),
      ),
    ).toBe(true);
    // Valeurs mesurées bit-à-bit sur 21dbbb6, e985548 (H1) et H2D-1.
    // Le brief H2D-1 citait 4 999 860 / −163 : non reproductible avec cette
    // fixture (jamais asserté en dur avant H2D-1 ; 31 110 FCFA reste un
    // montant illustratif des tests H2A/H2B, pas EMP-2002 de cette population).
    expect(result.annualActualOperationCostFcfa).toBe(5_000_040n);
    expect(
      fractionsEqual(
        result.annualTotalRoundingDelta,
        exactAmountFromInteger(17n),
      ),
    ).toBe(true);
    const emp2002 = result.employees.find((e) => e.employeeId === "EMP-2002")!;
    expect(emp2002.monthlyFinalRoundedIncreaseFcfa).toBe(30_205n);
    expect(emp2002.annualActualCostFcfa).toBe(362_460n);
  });

  it("2b. brief 4 999 860 / −163 non produit par la fixture Population Test 1", () => {
    const result = calculatePreparedPopulationCompensation(
      buildRecipeInput({ retroactivityStartMonth: 1 }),
    );
    expect(result.annualActualOperationCostFcfa).not.toBe(4_999_860n);
    expect(
      fractionsEqual(
        result.annualTotalRoundingDelta,
        exactAmountFromInteger(-163n),
      ),
    ).toBe(false);
    const emp2002 = result.employees.find((e) => e.employeeId === "EMP-2002")!;
    expect(emp2002.monthlyFinalRoundedIncreaseFcfa).not.toBe(31_110n);
  });

  it("2c. rétro=1 et rétro omise : parité agrégats, taux, salariés, trajectoires", () => {
    const withJan = calculatePreparedPopulationCompensation(
      buildRecipeInput({ retroactivityStartMonth: 1 }),
    );
    const omitInput = buildRecipeInput();
    delete (omitInput as { retroactivityStartMonth?: number })
      .retroactivityStartMonth;
    const omitted = calculatePreparedPopulationCompensation(omitInput);

    expect(omitted.retroactivityStartMonth).toBe(1);
    expect(formatExactAmount(withJan.compensatoryCalibrationRate)).toBe(
      formatExactAmount(omitted.compensatoryCalibrationRate),
    );
    expect(withJan.annualActualOperationCostFcfa).toBe(
      omitted.annualActualOperationCostFcfa,
    );
    expect(withJan.totalBaseSalaryReminderFcfa).toBe(
      omitted.totalBaseSalaryReminderFcfa,
    );
    expect(withJan.totalAnnualPromotionBudgetCostFcfa).toBe(
      omitted.totalAnnualPromotionBudgetCostFcfa,
    );

    expect(withJan.employees).toHaveLength(omitted.employees.length);
    for (let i = 0; i < withJan.employees.length; i += 1) {
      const left = withJan.employees[i]!;
      const right = omitted.employees[i]!;
      expect(left.employeeId).toBe(right.employeeId);
      expect(left.monthlyFinalRoundedIncreaseFcfa).toBe(
        right.monthlyFinalRoundedIncreaseFcfa,
      );
      expect(left.annualActualCostFcfa).toBe(right.annualActualCostFcfa);
      expect(left.baseSalaryReminderFcfa).toBe(right.baseSalaryReminderFcfa);
      expect(left.annualPromotionBudgetCostFcfa).toBe(
        right.annualPromotionBudgetCostFcfa,
      );
      expect(left.monthlyCompensationTrajectory).toHaveLength(
        right.monthlyCompensationTrajectory.length,
      );
      for (let m = 0; m < left.monthlyCompensationTrajectory.length; m += 1) {
        const lm = left.monthlyCompensationTrajectory[m]!;
        const rm = right.monthlyCompensationTrajectory[m]!;
        expect(lm.roundedCompensatoryComplementFcfa).toBe(
          rm.roundedCompensatoryComplementFcfa,
        );
        expect(lm.promotionBudgetCostFcfa).toBe(rm.promotionBudgetCostFcfa);
        expect(lm.paymentTiming).toBe(rm.paymentTiming);
      }
    }
  });

  it("3. mois 0 refusé", () => {
    expectCode(
      () =>
        calculatePreparedPopulationCompensation(
          baseInput({ retroactivityStartMonth: 0 }),
        ),
      "INVALID_RETROACTIVITY_START_MONTH",
    );
  });

  it("4. mois 13 refusé", () => {
    expectCode(
      () =>
        calculatePreparedPopulationCompensation(
          baseInput({ retroactivityStartMonth: 13 }),
        ),
      "INVALID_RETROACTIVITY_START_MONTH",
    );
  });

  it("5. rétro après mois d’application refusée", () => {
    expectCode(
      () =>
        calculatePreparedPopulationCompensation(
          baseInput({
            retroactivityStartMonth: 8,
            technicalApplicationMonth: 7,
          }),
        ),
      "RETROACTIVITY_MONTH_AFTER_APPLICATION_MONTH",
    );
  });

  it("6. rétro === application acceptée → rappel 0", () => {
    const result = calculatePreparedPopulationCompensation(
      baseInput({
        retroactivityStartMonth: 7,
        technicalApplicationMonth: 7,
        budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 60_000 },
      }),
    );
    expect(result.retroactivityStartMonth).toBe(7);
    expect(result.campaignCoveredMonthCount).toBe(6);
    expect(result.totalBaseSalaryReminderFcfa).toBe(0n);
    expect(result.employees[0]!.retroactiveMonths).toBe(0);
    expect(result.employees[0]!.baseSalaryReminderFcfa).toBe(0n);
  });

  it("7. fingerprint change avec le mois de rétroactivité", () => {
    const base = {
      campaignId: 1,
      budgetMode: "manual_amount",
      manualBudget: 100_000n,
      roundingMode: "nearest_half_up" as const,
      roundingStep: 5n,
      campaignYear: 2026,
      technicalApplicationMonth: 7,
    };
    const january = buildConfigurationFingerprint({
      ...base,
      retroactivityStartMonth: 1,
    });
    const march = buildConfigurationFingerprint({
      ...base,
      retroactivityStartMonth: 3,
    });
    expect(january).not.toBe(march);
    expect(january).toContain("retroStart:1");
    expect(march).toContain("retroStart:3");
    expect(january).toContain("contract:v4");
  });

  it("8. mars / juillet → 10 mois couverts, 4 rappel, 6 direct", () => {
    const result = calculatePreparedPopulationCompensation(
      baseInput({
        retroactivityStartMonth: 3,
        technicalApplicationMonth: 7,
        budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 100_000 },
      }),
    );
    expect(result.campaignCoveredMonthCount).toBe(10);
    expect(result.employees[0]!.retroactiveMonths).toBe(4);
    expect(result.employees[0]!.remainingDirectPaymentMonths).toBe(6);
    expect(
      result.employees[0]!.baseSalaryReminderFcfa +
        result.employees[0]!.remainingYearDirectIncreaseCostFcfa,
    ).toBe(result.employees[0]!.annualActualCostFcfa);
  });

  it("9. aucun complément compensatoire avant mars", () => {
    const result = calculatePreparedPopulationCompensation(
      baseInput({
        retroactivityStartMonth: 3,
        technicalApplicationMonth: 7,
        budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 100_000 },
      }),
    );
    const trajectory = result.employees[0]!.monthlyCompensationTrajectory;
    for (const month of trajectory.filter((m) => m.month < 3)) {
      expect(month.coveredByCampaignPeriod).toBe(false);
      expect(month.paymentTiming).toBe("outside_campaign");
      expect(month.roundedCompensatoryComplementFcfa).toBe(0n);
      expect(month.includedInCampaignEnvelope).toBe(false);
    }
    for (const month of trajectory.filter((m) => m.month >= 3)) {
      expect(month.coveredByCampaignPeriod).toBe(true);
    }
  });

  it("10. promo N-1 limitée à la période couverte", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2025-03-01",
      salaryBeforePromotionFcfa: 400_000n,
      salaryAfterPromotionFcfa: 500_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const result = calculatePreparedPopulationCompensation(
      baseInput({
        employees: [
          {
            employeeId: "PROMO-N1",
            familyCode: "F1",
            gradeCode: "G2",
            salaryFcfa: 500_000,
            hireDate: "2015-03-01",
            confirmedUnderperformer: false,
            promotion,
          },
        ],
        retroactivityStartMonth: 3,
        technicalApplicationMonth: 7,
        budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 1_200_000 },
      }),
    );
    const employee = result.employees[0]!;
    expect(employee.promotionInclusion.includedInSimulation).toBe(true);
    // max(rétro 3, effet janv N-1) … déc = 10 mois × 100_000
    expect(employee.annualPromotionBudgetCostFcfa).toBe(100_000n * 10n);
    const jan = employee.monthlyCompensationTrajectory.find((m) => m.month === 1)!;
    const feb = employee.monthlyCompensationTrajectory.find((m) => m.month === 2)!;
    const mar = employee.monthlyCompensationTrajectory.find((m) => m.month === 3)!;
    expect(jan.promotionBudgetCostFcfa).toBe(0n);
    expect(feb.promotionBudgetCostFcfa).toBe(0n);
    expect(mar.promotionBudgetCostFcfa).toBe(100_000n);
  });

  it("11. promo février avec rétro mars — budgets dès mars", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2026-02-10",
      salaryBeforePromotionFcfa: 500_000n,
      salaryAfterPromotionFcfa: 550_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const result = calculatePreparedPopulationCompensation(
      baseInput({
        employees: [
          {
            employeeId: "PROMO-FEB",
            familyCode: "F1",
            gradeCode: "G1",
            salaryFcfa: 500_000,
            hireDate: "2015-03-01",
            confirmedUnderperformer: false,
            promotion,
          },
        ],
        retroactivityStartMonth: 3,
        technicalApplicationMonth: 7,
        budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 700_000 },
      }),
    );
    const employee = result.employees[0]!;
    expect(employee.annualPromotionBudgetCostFcfa).toBe(50_000n * 10n);
    expect(
      employee.monthlyCompensationTrajectory.find((m) => m.month === 2)!
        .promotionBudgetCostFcfa,
    ).toBe(0n);
    expect(
      employee.monthlyCompensationTrajectory.find((m) => m.month === 3)!
        .promotionBudgetCostFcfa,
    ).toBe(50_000n);
  });

  it("12. promo avril — coûts avr–déc", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2026-04-15",
      salaryBeforePromotionFcfa: 500_000n,
      salaryAfterPromotionFcfa: 550_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const result = calculatePreparedPopulationCompensation(
      baseInput({
        employees: [
          {
            employeeId: "PROMO-APR",
            familyCode: "F1",
            gradeCode: "G1",
            salaryFcfa: 500_000,
            hireDate: "2015-03-01",
            confirmedUnderperformer: false,
            promotion,
          },
        ],
        retroactivityStartMonth: 1,
        technicalApplicationMonth: 7,
        budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 700_000 },
      }),
    );
    const employee = result.employees[0]!;
    expect(employee.annualPromotionBudgetCostFcfa).toBe(50_000n * 9n);
    expect(
      employee.monthlyCompensationTrajectory
        .filter((m) => m.month >= 4)
        .every((m) => m.promotionBudgetCostFcfa === 50_000n),
    ).toBe(true);
  });

  it("13. promo juillet — coûts jul–déc", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2026-07-20",
      salaryBeforePromotionFcfa: 500_000n,
      salaryAfterPromotionFcfa: 550_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const result = calculatePreparedPopulationCompensation(
      baseInput({
        employees: [
          {
            employeeId: "PROMO-JUL",
            familyCode: "F1",
            gradeCode: "G1",
            salaryFcfa: 500_000,
            hireDate: "2015-03-01",
            confirmedUnderperformer: false,
            promotion,
          },
        ],
        technicalApplicationMonth: 7,
        budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 700_000 },
      }),
    );
    expect(result.employees[0]!.annualPromotionBudgetCostFcfa).toBe(50_000n * 6n);
  });

  it("14. promo août exclue si application juillet", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2026-08-01",
      salaryBeforePromotionFcfa: 500_000n,
      salaryAfterPromotionFcfa: 560_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const result = calculatePreparedPopulationCompensation(
      baseInput({
        employees: [
          {
            employeeId: "EXCLUDED",
            familyCode: "F1",
            gradeCode: "G1",
            salaryFcfa: 500_000,
            hireDate: "2015-03-01",
            confirmedUnderperformer: false,
            promotion,
          },
        ],
        technicalApplicationMonth: 7,
      }),
    );
    expect(result.employees[0]!.promotionInclusion.includedInSimulation).toBe(false);
    expect(result.employees[0]!.annualPromotionBudgetCostFcfa).toBe(0n);
  });

  it("15. promo déjà payée + reste = coût promo de période", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2026-04-15",
      salaryBeforePromotionFcfa: 500_000n,
      salaryAfterPromotionFcfa: 550_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const result = calculatePreparedPopulationCompensation(
      baseInput({
        employees: [
          {
            employeeId: "PROMO-N",
            familyCode: "F1",
            gradeCode: "G1",
            salaryFcfa: 500_000,
            hireDate: "2015-03-01",
            confirmedUnderperformer: false,
            promotion,
          },
        ],
        retroactivityStartMonth: 3,
        technicalApplicationMonth: 7,
        budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 700_000 },
      }),
    );
    const employee = result.employees[0]!;
    expect(
      employee.promotionCostAlreadyPaidBeforeTechnicalMonthFcfa +
        employee.promotionCostFromTechnicalMonthToDecemberFcfa,
    ).toBe(employee.annualPromotionBudgetCostFcfa);
  });

  it("16. rappel + direct = coût compensatoire de période", () => {
    const result = calculatePreparedPopulationCompensation(
      baseInput({
        retroactivityStartMonth: 3,
        technicalApplicationMonth: 7,
        budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 100_000 },
      }),
    );
    expect(
      result.totalBaseSalaryReminderFcfa +
        result.totalRemainingYearDirectIncreaseCostFcfa,
    ).toBe(result.annualActualOperationCostFcfa);
    expect(
      result.employees[0]!.baseSalaryReminderFcfa +
        result.employees[0]!.remainingYearDirectIncreaseCostFcfa,
    ).toBe(result.employees[0]!.annualActualCostFcfa);
  });

  it("17. plein effet = décembre × 12 et hors calibrage budget", () => {
    const result = calculatePreparedPopulationCompensation(
      baseInput({
        retroactivityStartMonth: 3,
        technicalApplicationMonth: 7,
        budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 100_000 },
      }),
    );
    const december = result.employees[0]!.monthlyCompensationTrajectory.find(
      (m) => m.month === 12,
    )!;
    expect(result.employees[0]!.fullYearRunRateCompensatoryCostFcfa).toBe(
      december.roundedCompensatoryComplementFcfa * 12n,
    );
    expect(result.fullYearRunRateCompensatoryCostFcfa).toBe(
      result.employees[0]!.fullYearRunRateCompensatoryCostFcfa,
    );
    // Calibrage sur la période, pas sur le run-rate 12 mois.
    expect(result.annualActualOperationCostFcfa).not.toBe(
      result.fullYearRunRateCompensatoryCostFcfa,
    );
    expect(
      fractionsEqual(
        result.budgetTargetResult.exactAmount,
        exactAmountFromInteger(100_000n),
      ),
    ).toBe(true);
  });

  it("18. trajectoire 12 mois ; mois avant rétro hors période", () => {
    const result = calculatePreparedPopulationCompensation(
      baseInput({
        retroactivityStartMonth: 4,
        technicalApplicationMonth: 7,
        budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 90_000 },
      }),
    );
    const view = buildSimulationResultView({
      campaignId: 1,
      campaignName: "T",
      campaignYear: 2026,
      campaignStatus: "draft",
      evaluationMode: "none",
      currentImportBatchId: 1,
      runSequence: 1,
      sourceFingerprint: "s",
      configurationFingerprint: "c",
      engineResult: result,
      employeeLabelsById: new Map(),
    });
    expect(view.employees[0]!.monthlyCompensationTrajectory).toHaveLength(12);
    const outside = view.employees[0]!.monthlyCompensationTrajectory.filter(
      (m) => m.month < 4,
    );
    expect(outside).toHaveLength(3);
    for (const month of outside) {
      expect(month.paymentTiming).toBe("outside_campaign");
      expect(month.coveredByCampaignPeriod).toBe(false);
      expect(month.compensatoryPaymentStatusLabel).toBe("Hors période");
      expect(month.promotionPaymentStatusLabel).toBe("Hors période");
    }
    expect(view.populationSummary.retroactivityStartMonth).toBe(4);
    expect(view.populationSummary.campaignCoveredMonthCount).toBe(9);
  });

  it("19. mapExecutionResultToSaveDto / schema courant consolidé (contrat courant persistable)", () => {
    expect(CALCULATION_CONTRACT_VERSION).toBeGreaterThanOrEqual(5);
    expect(RESULT_SCHEMA_VERSION).toBeGreaterThanOrEqual(4);
    // Contrat ≥ 3 exige schema ≥ 3 : refus explicite si schema 2.
    expect(() =>
      assertSimulationResultPersistable({
        calculationContractVersion: 4,
        resultSchemaVersion: 2,
      }),
    ).toThrow(/schema/i);
    // Schema courant : le contrat courant est désormais persistable, sans recalcul.
    const dto = mapExecutionResultToSaveDto({
      result: samplePersistableResult({
        calculationContractVersion: CALCULATION_CONTRACT_VERSION,
      }),
      expectedCampaignStatus: "active",
      sourceImportFileName: null,
    });
    expect(dto.resultSchemaVersion).toBe(RESULT_SCHEMA_VERSION);
    expect(dto.calculationContractVersion).toBe(CALCULATION_CONTRACT_VERSION);
    expect(dto.retroactivityStartMonth).toBe(1);
    // Schema legacy v2 + contrat 2 toujours accepté pour snapshots historiques.
    expect(() =>
      assertSimulationResultPersistable({
        calculationContractVersion: 2,
        resultSchemaVersion: 2,
      }),
    ).not.toThrow();
  });
});
