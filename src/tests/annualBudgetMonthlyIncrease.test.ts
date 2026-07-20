/**
 * Correctif Lot 2A-H1 — budget annuel / augmentation mensuelle.
 * Cas de régression proche de la recette Population Test 1.
 */

import { describe, expect, it } from "vitest";
import {
  ANNUAL_BUDGET_PERIOD_MONTHS,
  CALCULATION_CONTRACT_VERSION,
  RESULT_SCHEMA_VERSION,
  calculatePreparedPopulationCompensation,
  divideFractions,
  exactAmountFromInteger,
  fractionsEqual,
  multiplyFractions,
  reduceFraction,
  type PreparedEmployeeCalculationInput,
  type PreparedPopulationCalculationInput,
  type PopulationCalculationReferences,
} from "../domain/compensationCalculation";
import {
  DEFAULT_NINE_BOX_FACTORS,
  DEFAULT_PERFORMANCE_FACTORS,
  DEFAULT_POTENTIAL_FACTORS,
  DEFAULT_SALARY_POSITIONS,
} from "../domain/compensationReference/defaults";
import {
  isCurrentResultSchemaVersion,
  isLegacyResultSchemaVersion,
  LEGACY_RESULT_SCHEMA_MESSAGE,
} from "../application/campaignSimulation/resultSchemaCompatibility";

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
  "performanceFactors" | "potentialFactors" | "nineBoxFactors"
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
  };
}

function buildRecipeInput(): PreparedPopulationCalculationInput {
  const employees: PreparedEmployeeCalculationInput[] = [];
  // 14 salariés à poids positif + 1 sous-performant
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
      salaryGrid: [
        {
          familyCode: "F1",
          gradeCode: "G1",
          s0Fcfa: 500_000,
        },
      ],
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
  };
}

describe("Lot 2A-H1 — budget annuel / augmentation mensuelle", () => {
  it("expose les constantes de contrat v2", () => {
    expect(CALCULATION_CONTRACT_VERSION).toBe(2);
    expect(ANNUAL_BUDGET_PERIOD_MONTHS).toBe(12n);
    expect(RESULT_SCHEMA_VERSION).toBe(2);
    expect(isCurrentResultSchemaVersion(2)).toBe(true);
    expect(isLegacyResultSchemaVersion(1)).toBe(true);
    expect(LEGACY_RESULT_SCHEMA_MESSAGE).toMatch(/obsolète/i);
  });

  it("alloue le budget annuel puis divise par 12 avant arrondi mensuel", () => {
    const result = calculatePreparedPopulationCompensation(buildRecipeInput());

    expect(
      fractionsEqual(
        result.annualTheoreticalAllocatedTotal,
        exactAmountFromInteger(5_000_023n),
      ),
    ).toBe(true);
    expect(result.populationSummary.positiveWeightEmployeeCount).toBe(14);
    expect(result.populationSummary.confirmedUnderperformerCount).toBe(1);

    const under = result.employees.find((e) => e.employeeId === "EMP-UNDER")!;
    expect(under.monthlyFinalRoundedIncreaseFcfa).toBe(0n);
    expect(under.annualActualCostFcfa).toBe(0n);
    expect(under.monthlyFinalSalaryFcfa).toBe(450_000n);
    expect(under.blockingReason).toBe("CONFIRMED_UNDERPERFORMER");

    const emp2002 = result.employees.find((e) => e.employeeId === "EMP-2002")!;
    // Allocation annuelle exacte = part du budget ; mensuel = annuel / 12
    expect(
      fractionsEqual(
        emp2002.monthlyTheoreticalIncrease,
        divideFractions(
          emp2002.annualTheoreticalAllocation,
          exactAmountFromInteger(12n),
        ),
      ),
    ).toBe(true);

    // Taux mensuel = mensuel / salaire mensuel — PAS annuel / salaire mensuel
    const expectedRate = divideFractions(
      emp2002.monthlyTheoreticalIncrease,
      exactAmountFromInteger(536_000n),
    );
    expect(
      fractionsEqual(emp2002.monthlyTheoreticalIncreaseRate, expectedRate),
    ).toBe(true);

    // Le taux ne doit pas être ~12× trop grand (~69 %)
    // 5,80 % ≈ 580 bps → num/den < 0.10
    const rateTimes10000 = multiplyFractions(
      emp2002.monthlyTheoreticalIncreaseRate,
      exactAmountFromInteger(10_000n),
    );
    // rate * 10000 < 1000  (soit < 10 %)
    expect(
      rateTimes10000.numerator * 1n < rateTimes10000.denominator * 1000n,
    ).toBe(true);

    // Nouveau salaire mensuel = salaire + augmentation mensuelle arrondie
    expect(emp2002.monthlyFinalSalaryFcfa).toBe(
      536_000n + emp2002.monthlyFinalRoundedIncreaseFcfa,
    );
    // Ne jamais obtenir ~909 345 (salaire + allocation annuelle)
    expect(emp2002.monthlyFinalSalaryFcfa).toBeLessThan(600_000n);
    expect(emp2002.monthlyFinalSalaryFcfa).not.toBe(536_000n + 373_346n);

    // Coût annuel = mensuel arrondi × 12
    expect(emp2002.annualActualCostFcfa).toBe(
      emp2002.monthlyFinalRoundedIncreaseFcfa * 12n,
    );

    // Écart annuel = Σ écarts mensuels × 12
    expect(
      fractionsEqual(
        result.annualTotalRoundingDelta,
        multiplyFractions(
          result.employees.reduce(
            (acc, e) =>
              reduceFraction(
                acc.numerator * e.monthlyRoundingDelta.denominator +
                  e.monthlyRoundingDelta.numerator * acc.denominator,
                acc.denominator * e.monthlyRoundingDelta.denominator,
              ),
            exactAmountFromInteger(0n),
          ),
          exactAmountFromInteger(12n),
        ),
      ),
    ).toBe(true);

    expect(result.annualActualOperationCostFcfa).toBe(
      result.employees.reduce((sum, e) => sum + e.annualActualCostFcfa, 0n),
    );
  });

  it("annualise la masse salariale en mode pourcentage", () => {
    const result = calculatePreparedPopulationCompensation({
      employees: [
        {
          employeeId: "E1",
          familyCode: "F1",
          gradeCode: "G1",
          salaryFcfa: 1_000_000,
          hireDate: "2020-07-15",
          confirmedUnderperformer: false,
        },
      ],
      references: {
        evaluationMode: "none",
        salaryGrid: [{ familyCode: "F1", gradeCode: "G1", s0Fcfa: 1_000_000 }],
        salaryPositions: positions(),
        ...factors(),
      },
      budgetTarget: {
        mode: "percentage_of_eligible_payroll",
        // Masse MENSUELLE 10 000 000 → annuelle 120 000 000 → 4 % = 4 800 000
        eligiblePayrollFcfa: 10_000_000,
        budgetRateBasisPoints: 400,
      },
      roundingPolicy: { mode: "nearest_half_up", stepFcfa: 1 },
      campaignYear: 2026,
      technicalApplicationMonth: 1,
    });

    expect(result.budgetTargetResult.exactAmount).toEqual({
      numerator: 4_800_000n,
      denominator: 1n,
    });
    expect(result.annualTheoreticalAllocatedTotal).toEqual({
      numerator: 4_800_000n,
      denominator: 1n,
    });
    // Augmentation mensuelle théorique = 4 800 000 / 12 = 400 000
    expect(
      fractionsEqual(
        result.employees[0].monthlyTheoreticalIncrease,
        exactAmountFromInteger(400_000n),
      ),
    ).toBe(true);
    expect(result.employees[0].monthlyFinalRoundedIncreaseFcfa).toBe(400_000n);
    expect(result.employees[0].monthlyFinalSalaryFcfa).toBe(1_400_000n);
  });

  it("conserve positions et ratios mensuels inchangés", () => {
    const result = calculatePreparedPopulationCompensation({
      employees: [
        {
          employeeId: "E1",
          familyCode: "F1",
          gradeCode: "G1",
          salaryFcfa: 500_000,
          hireDate: "2020-07-15",
          confirmedUnderperformer: false,
        },
      ],
      references: {
        evaluationMode: "none",
        salaryGrid: [{ familyCode: "F1", gradeCode: "G1", s0Fcfa: 500_000 }],
        salaryPositions: positions(),
        ...factors(),
      },
      budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 12_000 },
      roundingPolicy: { mode: "nearest_half_up", stepFcfa: 1 },
      campaignYear: 2026,
      technicalApplicationMonth: 1,
    });
    expect(result.employees[0].salaryRatioBasisPoints).toBe(10_000);
    expect(result.employees[0].s0Fcfa).toBe(500_000n);
  });
});
