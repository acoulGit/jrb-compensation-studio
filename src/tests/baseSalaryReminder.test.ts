import { technicalApplicationMonthLabelFr } from "../domain/compensationCalculation/baseSalaryReminder";

/**
 * Lot 2A-H2A — calendrier d’application et rappel de salaire de base.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERFORMANCE_FACTORS,
  DEFAULT_POTENTIAL_FACTORS,
  DEFAULT_SALARY_POSITIONS,
} from "../domain/compensationReference/defaults";
import {
  calculatePreparedPopulationCompensation,
  computeBaseSalaryReminderBreakdown,
  CompensationCalculationError,
  RESULT_SCHEMA_VERSION,
  type PreparedEmployeeCalculationInput,
  type PreparedPopulationCalculationInput,
} from "../domain/compensationCalculation";
import { buildConfigurationFingerprint } from "../application/campaignSimulation/formatExactBudgetDisplay";

function defaultPositions() {
  return DEFAULT_SALARY_POSITIONS.map((p) => ({
    code: p.code,
    label: p.label,
    referenceRatioBps: p.referenceRatioBps,
    positionFactorMilli: p.positionFactorMilli,
  }));
}

function defaultFactors() {
  return {
    performanceFactors: DEFAULT_PERFORMANCE_FACTORS.map((f) => ({
      level: f.level,
      factorMilli: f.factorMilli,
    })),
    potentialFactors: DEFAULT_POTENTIAL_FACTORS.map((f) => ({
      level: f.level,
      factorMilli: f.factorMilli,
    })),
    nineBoxFactors: [],
  };
}

function buildInput(
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
        salaryFcfa: 1_000_000,
        confirmedUnderperformer: false,
      },
    ],
    references: overrides.references ?? {
      evaluationMode: "none",
      salaryGrid: [{ familyCode: "F1", gradeCode: "G1", s0Fcfa: 1_000_000 }],
      salaryPositions: defaultPositions(),
      ...defaultFactors(),
    },
    budgetTarget: overrides.budgetTarget ?? {
      mode: "manual_amount",
      manualBudgetFcfa: 373_320,
    },
    roundingPolicy: overrides.roundingPolicy ?? {
      mode: "nearest_half_up",
      stepFcfa: 10,
    },
    campaignYear: overrides.campaignYear ?? 2026,
    technicalApplicationMonth: overrides.technicalApplicationMonth ?? 7,
  };
}

describe("Lot 2A-H2A — computeBaseSalaryReminderBreakdown", () => {
  it("application en janvier : rappel 0, direct 12", () => {
    const result = computeBaseSalaryReminderBreakdown({
      campaignYear: 2026,
      technicalApplicationMonth: 1,
      monthlyFinalIncreaseFcfa: 31_110n,
    });
    expect(result.retroactiveMonths).toBe(0);
    expect(result.remainingDirectPaymentMonths).toBe(12);
    expect(result.baseSalaryReminderFcfa).toBe(0n);
    expect(result.remainingYearDirectIncreaseCostFcfa).toBe(373_320n);
    expect(result.annualActualBaseIncreaseCostFcfa).toBe(373_320n);
  });

  it("application en juillet — cas de référence 31 110", () => {
    const result = computeBaseSalaryReminderBreakdown({
      campaignYear: 2026,
      technicalApplicationMonth: 7,
      monthlyFinalIncreaseFcfa: 31_110n,
    });
    expect(result.retroactiveMonths).toBe(6);
    expect(result.remainingDirectPaymentMonths).toBe(6);
    expect(result.baseSalaryReminderFcfa).toBe(186_660n);
    expect(result.remainingYearDirectIncreaseCostFcfa).toBe(186_660n);
    expect(result.annualActualBaseIncreaseCostFcfa).toBe(373_320n);
    expect(
      result.baseSalaryReminderFcfa + result.remainingYearDirectIncreaseCostFcfa,
    ).toBe(result.annualActualBaseIncreaseCostFcfa);
  });

  it("application en décembre : rappel 11, direct 1", () => {
    const result = computeBaseSalaryReminderBreakdown({
      campaignYear: 2026,
      technicalApplicationMonth: 12,
      monthlyFinalIncreaseFcfa: 31_110n,
    });
    expect(result.retroactiveMonths).toBe(11);
    expect(result.remainingDirectPaymentMonths).toBe(1);
    expect(result.baseSalaryReminderFcfa).toBe(342_210n);
    expect(result.remainingYearDirectIncreaseCostFcfa).toBe(31_110n);
    expect(result.annualActualBaseIncreaseCostFcfa).toBe(373_320n);
  });

  it("augmentation mensuelle nulle → rappel et direct nuls", () => {
    const result = computeBaseSalaryReminderBreakdown({
      campaignYear: 2026,
      technicalApplicationMonth: 7,
      monthlyFinalIncreaseFcfa: 0n,
    });
    expect(result.baseSalaryReminderFcfa).toBe(0n);
    expect(result.remainingYearDirectIncreaseCostFcfa).toBe(0n);
    expect(result.annualActualBaseIncreaseCostFcfa).toBe(0n);
  });

  it("refuse le mois 0", () => {
    expect(() =>
      computeBaseSalaryReminderBreakdown({
        campaignYear: 2026,
        technicalApplicationMonth: 0,
        monthlyFinalIncreaseFcfa: 100n,
      }),
    ).toThrow(CompensationCalculationError);
    try {
      computeBaseSalaryReminderBreakdown({
        campaignYear: 2026,
        technicalApplicationMonth: 0,
        monthlyFinalIncreaseFcfa: 100n,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(CompensationCalculationError);
      expect((error as CompensationCalculationError).code).toBe(
        "INVALID_TECHNICAL_APPLICATION_MONTH",
      );
    }
  });

  it("refuse le mois 13", () => {
    expect(() =>
      computeBaseSalaryReminderBreakdown({
        campaignYear: 2026,
        technicalApplicationMonth: 13,
        monthlyFinalIncreaseFcfa: 100n,
      }),
    ).toThrow(CompensationCalculationError);
  });

  it("refuse une année invalide", () => {
    expect(() =>
      computeBaseSalaryReminderBreakdown({
        campaignYear: 1999,
        technicalApplicationMonth: 7,
        monthlyFinalIncreaseFcfa: 100n,
      }),
    ).toThrow(CompensationCalculationError);
    expect(() =>
      computeBaseSalaryReminderBreakdown({
        campaignYear: 2026.5,
        technicalApplicationMonth: 7,
        monthlyFinalIncreaseFcfa: 100n,
      }),
    ).toThrow(CompensationCalculationError);
  });

  it("invariant salarié : rappel + direct = annuel", () => {
    for (const month of [1, 7, 12] as const) {
      const result = computeBaseSalaryReminderBreakdown({
        campaignYear: 2026,
        technicalApplicationMonth: month,
        monthlyFinalIncreaseFcfa: 31_110n,
      });
      expect(
        result.baseSalaryReminderFcfa +
          result.remainingYearDirectIncreaseCostFcfa,
      ).toBe(result.annualActualBaseIncreaseCostFcfa);
      expect(result.annualActualBaseIncreaseCostFcfa).toBe(31_110n * 12n);
    }
  });
});

describe("Lot 2A-H2A — orchestrateur population", () => {
  it("sous-performant : augmentation finale nulle et rappel nul", () => {
    const result = calculatePreparedPopulationCompensation(
      buildInput({
        technicalApplicationMonth: 7,
        employees: [
          {
            employeeId: "E-OK",
            familyCode: "F1",
            gradeCode: "G1",
            salaryFcfa: 1_000_000,
            confirmedUnderperformer: false,
          },
          {
            employeeId: "E-UNDER",
            familyCode: "F1",
            gradeCode: "G1",
            salaryFcfa: 800_000,
            confirmedUnderperformer: true,
          },
        ],
      }),
    );
    const under = result.employees.find((e) => e.employeeId === "E-UNDER")!;
    expect(under.monthlyFinalRoundedIncreaseFcfa).toBe(0n);
    expect(under.baseSalaryReminderFcfa).toBe(0n);
    expect(under.remainingYearDirectIncreaseCostFcfa).toBe(0n);
    expect(under.annualActualBaseIncreaseCostFcfa).toBe(0n);
    expect(under.retroactiveMonths).toBe(6);
    expect(under.remainingDirectPaymentMonths).toBe(6);
  });

  it("population multi-salariés : invariant population et pas de double comptage", () => {
    const result = calculatePreparedPopulationCompensation(
      buildInput({
        technicalApplicationMonth: 7,
        budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 1_200_000 },
        employees: [
          {
            employeeId: "A",
            familyCode: "F1",
            gradeCode: "G1",
            salaryFcfa: 500_000,
            confirmedUnderperformer: false,
          },
          {
            employeeId: "B",
            familyCode: "F1",
            gradeCode: "G1",
            salaryFcfa: 700_000,
            confirmedUnderperformer: false,
          },
          {
            employeeId: "C",
            familyCode: "F1",
            gradeCode: "G1",
            salaryFcfa: 400_000,
            confirmedUnderperformer: false,
          },
        ],
      }),
    );

    expect(
      result.totalBaseSalaryReminderFcfa +
        result.totalRemainingYearDirectIncreaseCostFcfa,
    ).toBe(result.totalAnnualActualBaseIncreaseCostFcfa);
    expect(result.totalAnnualActualBaseIncreaseCostFcfa).toBe(
      result.annualActualOperationCostFcfa,
    );

    // Le rappel ne s’ajoute pas au coût annuel (pas de double comptage).
    expect(result.totalAnnualActualBaseIncreaseCostFcfa).toBe(
      result.employees.reduce(
        (sum, employee) => sum + employee.monthlyFinalRoundedIncreaseFcfa * 12n,
        0n,
      ),
    );
  });

  it("n’altère pas l’allocation annuelle théorique selon le mois", () => {
    const january = calculatePreparedPopulationCompensation(
      buildInput({ technicalApplicationMonth: 1 }),
    );
    const july = calculatePreparedPopulationCompensation(
      buildInput({ technicalApplicationMonth: 7 }),
    );
    expect(january.annualTheoreticalAllocatedTotal).toEqual(
      july.annualTheoreticalAllocatedTotal,
    );
    expect(january.employees[0]!.annualTheoreticalAllocation).toEqual(
      july.employees[0]!.annualTheoreticalAllocation,
    );
    expect(january.employees[0]!.monthlyFinalRoundedIncreaseFcfa).toBe(
      july.employees[0]!.monthlyFinalRoundedIncreaseFcfa,
    );
    expect(january.totalBaseSalaryReminderFcfa).toBe(0n);
    expect(july.totalBaseSalaryReminderFcfa).toBeGreaterThan(0n);
  });

  it("ne change pas result_schema_version", () => {
    expect(RESULT_SCHEMA_VERSION).toBe(2);
  });
});

describe("Lot 2A-H2A — fingerprint", () => {
  it("différencie deux mois d’application", () => {
    const base = {
      campaignId: 1,
      budgetMode: "manual_amount",
      manualBudget: 100_000n,
      roundingMode: "nearest_half_up",
      roundingStep: 100n,
      campaignYear: 2026,
    };
    const january = buildConfigurationFingerprint({
      ...base,
      technicalApplicationMonth: 1,
    });
    const july = buildConfigurationFingerprint({
      ...base,
      technicalApplicationMonth: 7,
    });
    expect(january).not.toBe(july);
  });
});

describe("technicalApplicationMonthLabelFr", () => {
  it("returns the raw value for a non-integer month", () => {
    expect(technicalApplicationMonthLabelFr(1.5)).toBe("1.5");
  });
});
