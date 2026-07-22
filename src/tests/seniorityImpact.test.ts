/**
 * Lot 2A-H2B — incidence supplémentaire d’ancienneté.
 */

import { describe, expect, it } from "vitest";
import { buildConfigurationFingerprint } from "../application/campaignSimulation/formatExactBudgetDisplay";
import {
  DEFAULT_PERFORMANCE_FACTORS,
  DEFAULT_POTENTIAL_FACTORS,
  DEFAULT_SALARY_POSITIONS,
} from "../domain/compensationReference/defaults";
import {
  CALCULATION_CONTRACT_VERSION,
  CompensationCalculationError,
  RESULT_SCHEMA_VERSION,
  SENIORITY_IMPACT_CONTRACT_VERSION,
  anniversaryEffectYearMonth,
  calculatePreparedPopulationCompensation,
  ceilFcfaPercentOfAmount,
  computeSeniorityImpactBreakdown,
  effectiveAnniversaryCountAt,
  parseHireDateIso,
  seniorityRatePercentAt,
  seniorityRatePercentFromEffectiveAnniversaryCount,
  type PreparedEmployeeCalculationInput,
  type PreparedPopulationCalculationInput,
} from "../domain/compensationCalculation";

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
        hireDate: "2020-07-15",
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
    campaignYear: overrides.campaignYear ?? 2023,
    technicalApplicationMonth: overrides.technicalApplicationMonth ?? 7,
  };
}

describe("Lot 2A-H2B — barème et prise d’effet", () => {
  it("moins de trois anniversaires effectifs → 0 %", () => {
    expect(seniorityRatePercentFromEffectiveAnniversaryCount(0)).toBe(0);
    expect(seniorityRatePercentFromEffectiveAnniversaryCount(1)).toBe(0);
    expect(seniorityRatePercentFromEffectiveAnniversaryCount(2)).toBe(0);
  });

  it("entrée dans la 4e année → 5 %", () => {
    expect(seniorityRatePercentFromEffectiveAnniversaryCount(3)).toBe(5);
  });

  it("entrée dans la 5e année → 6 %", () => {
    expect(seniorityRatePercentFromEffectiveAnniversaryCount(4)).toBe(6);
  });

  it("progression annuelle sans plafond", () => {
    expect(seniorityRatePercentFromEffectiveAnniversaryCount(8)).toBe(10);
    expect(seniorityRatePercentFromEffectiveAnniversaryCount(28)).toBe(30);
  });

  it("embauche en juillet → effet en juin", () => {
    const hire = parseHireDateIso("2020-07-15");
    expect(anniversaryEffectYearMonth(hire, 3)).toEqual({
      year: 2023,
      month: 6,
    });
  });

  it("embauche en janvier → effet en décembre de l’année précédente", () => {
    const hire = parseHireDateIso("2020-01-15");
    expect(anniversaryEffectYearMonth(hire, 3)).toEqual({
      year: 2022,
      month: 12,
    });
    expect(seniorityRatePercentAt(hire, 2022, 11)).toBe(0);
    expect(seniorityRatePercentAt(hire, 2022, 12)).toBe(5);
  });

  it("embauche en décembre → effet en novembre", () => {
    const hire = parseHireDateIso("2020-12-20");
    expect(anniversaryEffectYearMonth(hire, 3)).toEqual({
      year: 2023,
      month: 11,
    });
  });

  it("aucun prorata selon le jour du mois", () => {
    const early = parseHireDateIso("2020-07-01");
    const late = parseHireDateIso("2020-07-31");
    expect(seniorityRatePercentAt(early, 2023, 6)).toBe(
      seniorityRatePercentAt(late, 2023, 6),
    );
    expect(effectiveAnniversaryCountAt(early, 2023, 6)).toBe(
      effectiveAnniversaryCountAt(late, 2023, 6),
    );
  });
});

describe("Lot 2A-H2B — arrondi plafond FCFA", () => {
  it("montant exact sans décimale : pas de FCFA supplémentaire", () => {
    expect(ceilFcfaPercentOfAmount(100_000n, 5)).toBe(5_000n);
  });

  it("montant fractionnaire : plafond au FCFA supérieur (31 110 × 5 % = 1 556)", () => {
    expect(ceilFcfaPercentOfAmount(31_110n, 5)).toBe(1_556n);
    expect(ceilFcfaPercentOfAmount(31_110n, 5)).not.toBe(1_555n);
  });

  it("augmentation mensuelle nulle → incidence nulle", () => {
    const result = computeSeniorityImpactBreakdown({
      hireDate: "2020-07-15",
      campaignYear: 2023,
      technicalApplicationMonth: 7,
      monthlyFinalIncreaseFcfa: 0n,
    });
    expect(result.annualSeniorityImpactFcfa).toBe(0n);
    expect(result.seniorityReminderFcfa).toBe(0n);
  });
});

describe("Lot 2A-H2B — cas numériques de référence", () => {
  it("cas 2023 / juillet / 31 110", () => {
    const result = computeSeniorityImpactBreakdown({
      hireDate: "2020-07-15",
      campaignYear: 2023,
      technicalApplicationMonth: 7,
      monthlyFinalIncreaseFcfa: 31_110n,
    });
    expect(result.monthlySeniorityImpactSchedule.slice(0, 5).every((e) => e.ratePercent === 0)).toBe(
      true,
    );
    expect(result.monthlySeniorityImpactSchedule[5]!.ratePercent).toBe(5);
    expect(result.monthlySeniorityImpactSchedule[5]!.monthlySeniorityImpactFcfa).toBe(
      1_556n,
    );
    expect(result.seniorityReminderFcfa).toBe(1_556n);
    expect(result.remainingYearDirectSeniorityImpactFcfa).toBe(9_336n);
    expect(result.annualSeniorityImpactFcfa).toBe(10_892n);
    expect(
      result.seniorityReminderFcfa +
        result.remainingYearDirectSeniorityImpactFcfa,
    ).toBe(result.annualSeniorityImpactFcfa);
    expect(result.technicalApplicationMonthSeniorityRatePercent).toBe(5);
  });

  it("cas 2024 / juillet / 31 110", () => {
    const result = computeSeniorityImpactBreakdown({
      hireDate: "2020-07-15",
      campaignYear: 2024,
      technicalApplicationMonth: 7,
      monthlyFinalIncreaseFcfa: 31_110n,
    });
    expect(ceilFcfaPercentOfAmount(31_110n, 6)).toBe(1_867n);
    expect(result.seniorityReminderFcfa).toBe(9_647n);
    expect(result.remainingYearDirectSeniorityImpactFcfa).toBe(11_202n);
    expect(result.annualSeniorityImpactFcfa).toBe(20_849n);
    expect(result.technicalApplicationMonthSeniorityRatePercent).toBe(6);
  });

  it("changement de taux pendant la période de rappel", () => {
    const result = computeSeniorityImpactBreakdown({
      hireDate: "2020-07-15",
      campaignYear: 2024,
      technicalApplicationMonth: 7,
      monthlyFinalIncreaseFcfa: 31_110n,
    });
    const reminder = result.monthlySeniorityImpactSchedule.filter(
      (e) => e.paymentTiming === "reminder",
    );
    expect(reminder.some((e) => e.ratePercent === 5)).toBe(true);
    expect(reminder.some((e) => e.ratePercent === 6)).toBe(true);
  });

  it("changement de taux pendant la période directe", () => {
    const result = computeSeniorityImpactBreakdown({
      hireDate: "2020-07-15",
      campaignYear: 2024,
      technicalApplicationMonth: 4,
      monthlyFinalIncreaseFcfa: 31_110n,
    });
    const direct = result.monthlySeniorityImpactSchedule.filter(
      (e) => e.paymentTiming === "direct",
    );
    expect(direct.some((e) => e.ratePercent === 5)).toBe(true);
    expect(direct.some((e) => e.ratePercent === 6)).toBe(true);
  });
});

describe("Lot 2A-H2B — validations date d’embauche", () => {
  it("date absente", () => {
    expect(() => parseHireDateIso(null)).toThrow(CompensationCalculationError);
    expect(() => parseHireDateIso("")).toThrow(CompensationCalculationError);
  });

  it("date invalide", () => {
    expect(() => parseHireDateIso("2020/07/15")).toThrow(
      CompensationCalculationError,
    );
    expect(() => parseHireDateIso("2020-02-30")).toThrow(
      CompensationCalculationError,
    );
  });

  it("date postérieure à l’année de campagne", () => {
    expect(() =>
      computeSeniorityImpactBreakdown({
        hireDate: "2025-03-01",
        campaignYear: 2024,
        technicalApplicationMonth: 7,
        monthlyFinalIncreaseFcfa: 31_110n,
      }),
    ).toThrow(CompensationCalculationError);
  });
});

describe("Lot 2A-H2B — orchestrateur", () => {
  it("sous-performant : incidence nulle", () => {
    const result = calculatePreparedPopulationCompensation(
      buildInput({
        employees: [
          {
            employeeId: "OK",
            familyCode: "F1",
            gradeCode: "G1",
            salaryFcfa: 1_000_000,
            hireDate: "2020-07-15",
            confirmedUnderperformer: false,
          },
          {
            employeeId: "UNDER",
            familyCode: "F1",
            gradeCode: "G1",
            salaryFcfa: 800_000,
            hireDate: "2020-07-15",
            confirmedUnderperformer: true,
          },
        ],
      }),
    );
    const under = result.employees.find((e) => e.employeeId === "UNDER")!;
    expect(under.monthlyFinalRoundedIncreaseFcfa).toBe(0n);
    expect(under.annualSeniorityImpactFcfa).toBe(0n);
  });

  it("invariants salarié et population + hors budget", () => {
    const result = calculatePreparedPopulationCompensation(
      buildInput({
        campaignYear: 2023,
        technicalApplicationMonth: 7,
        budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 1_200_000 },
        employees: [
          {
            employeeId: "A",
            familyCode: "F1",
            gradeCode: "G1",
            salaryFcfa: 500_000,
            hireDate: "2020-07-15",
            confirmedUnderperformer: false,
          },
          {
            employeeId: "B",
            familyCode: "F1",
            gradeCode: "G1",
            salaryFcfa: 700_000,
            hireDate: "2018-01-15",
            confirmedUnderperformer: false,
          },
        ],
      }),
    );

    for (const employee of result.employees) {
      expect(
        employee.seniorityReminderFcfa +
          employee.remainingYearDirectSeniorityImpactFcfa,
      ).toBe(employee.annualSeniorityImpactFcfa);
    }
    expect(
      result.totalSeniorityReminderFcfa +
        result.totalRemainingYearDirectSeniorityImpactFcfa,
    ).toBe(result.totalAnnualSeniorityImpactFcfa);

    // Hors budget : l’ancienneté ne modifie pas l’allocation / coût de base
    expect(result.annualActualOperationCostFcfa).toBe(
      result.totalAnnualActualBaseIncreaseCostFcfa,
    );
    expect(result.totalAnnualSeniorityImpactFcfa).not.toBe(
      result.annualActualOperationCostFcfa,
    );
  });

  it("n’altère pas l’allocation annuelle selon l’ancienneté", () => {
    const base = buildInput({ campaignYear: 2023 });
    const a = calculatePreparedPopulationCompensation(base);
    const b = calculatePreparedPopulationCompensation({
      ...base,
      employees: [
        {
          ...base.employees[0]!,
          hireDate: "2010-07-15",
        },
      ],
    });
    expect(a.annualTheoreticalAllocatedTotal).toEqual(
      b.annualTheoreticalAllocatedTotal,
    );
    expect(a.employees[0]!.monthlyFinalRoundedIncreaseFcfa).toBe(
      b.employees[0]!.monthlyFinalRoundedIncreaseFcfa,
    );
    expect(a.totalAnnualSeniorityImpactFcfa).not.toBe(
      b.totalAnnualSeniorityImpactFcfa,
    );
  });

  it("fingerprint intègre le contrat d’ancienneté ; schema inchangé", () => {
    expect(CALCULATION_CONTRACT_VERSION).toBe(5);
    expect(RESULT_SCHEMA_VERSION).toBe(4);
    expect(SENIORITY_IMPACT_CONTRACT_VERSION).toBe(1);
    const fp1 = buildConfigurationFingerprint({
      campaignId: 1,
      budgetMode: "manual_amount",
      manualBudget: 1n,
      roundingMode: "nearest_half_up",
      roundingStep: 1n,
      campaignYear: 2023,
      retroactivityStartMonth: 1,
      technicalApplicationMonth: 7,
      seniorityImpactContractVersion: 1,
    });
    const fp2 = buildConfigurationFingerprint({
      campaignId: 1,
      budgetMode: "manual_amount",
      manualBudget: 1n,
      roundingMode: "nearest_half_up",
      roundingStep: 1n,
      campaignYear: 2023,
      retroactivityStartMonth: 1,
      technicalApplicationMonth: 7,
      seniorityImpactContractVersion: 2,
    });
    expect(fp1).not.toBe(fp2);
    expect(fp1).toContain("seniority:v1");
  });

  it("résultat déterministe sans Date.now()", () => {
    const input = buildInput({ campaignYear: 2023 });
    const first = calculatePreparedPopulationCompensation(input);
    const second = calculatePreparedPopulationCompensation(input);
    expect(first).toEqual(second);
  });

  it("taux élevé démontrant l’absence de plafond", () => {
    const hire = parseHireDateIso("1990-07-15");
    const rate = seniorityRatePercentAt(hire, 2024, 7);
    expect(rate).toBeGreaterThan(20);
    expect(ceilFcfaPercentOfAmount(31_110n, rate)).toBeGreaterThan(0n);
  });
});
