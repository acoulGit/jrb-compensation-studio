import { describe, expect, it } from "vitest";
import {
  DEFAULT_NINE_BOX_CONFIRMATION_FACTOR_MILLI,
  DEFAULT_NINE_BOX_FACTORS,
  DEFAULT_PERFORMANCE_FACTORS,
  DEFAULT_POTENTIAL_FACTORS,
  DEFAULT_SALARY_POSITIONS,
} from "../domain/compensationReference/defaults";
import {
  ALLOCATION_BASIS_SALARY_TIMES_MATRIX_WEIGHT,
  calculatePreparedPopulationCompensation,
  CompensationCalculationError,
  fractionsEqual,
  NEUTRAL_EMPLOYER_COST_POLICY,
  reduceFraction,
  resolveEmployeeS0,
  type PreparedEmployeeCalculationInput,
  type PreparedPopulationCalculationInput,
  type PreparedSalaryGridCell,
  type PopulationCalculationReferences,
} from "../domain/compensationCalculation";

function freezeClone<T>(value: T): T {
  return structuredClone(value);
}

function expectPopulationFailure(run: () => void, code = "POPULATION_CALCULATION_FAILED"): void {
  try {
    run();
    expect.fail(`Expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(CompensationCalculationError);
    expect((error as CompensationCalculationError).code).toBe(code);
  }
}

function defaultPositions() {
  return DEFAULT_SALARY_POSITIONS.map((p) => ({
    code: p.code,
    label: p.label,
    referenceRatioBps: p.referenceRatioBps,
    positionFactorMilli: p.positionFactorMilli,
  }));
}

function defaultFactors(): Pick<
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

function gridCell(
  familyCode: string,
  gradeCode: string,
  s0Fcfa: number | bigint,
): PreparedSalaryGridCell {
  return {
    familyCode,
    gradeCode,
    familyLabel: `Famille ${familyCode}`,
    gradeLabel: `Grade ${gradeCode}`,
    s0Fcfa,
  };
}

function baseReferences(
  overrides: Partial<PopulationCalculationReferences> = {},
): PopulationCalculationReferences {
  return {
    evaluationMode: "performance_potential",
    salaryGrid: [
      gridCell("F1", "G1", 1_000_000),
      gridCell("F1", "G2", 1_200_000),
      gridCell("F2", "G1", 900_000),
      gridCell("F2", "G3", 1_500_000),
    ],
    salaryPositions: defaultPositions(),
    ...defaultFactors(),
    ...overrides,
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
        performanceLevel: "high",
        potentialLevel: "medium",
        hireDate: "2020-07-15",
        confirmedUnderperformer: false,
      },
    ],
    references: overrides.references ?? baseReferences(),
    budgetTarget: overrides.budgetTarget ?? {
      mode: "manual_amount",
      manualBudgetFcfa: 100_000,
    },
    roundingPolicy: overrides.roundingPolicy ?? {
      mode: "nearest_half_up",
      stepFcfa: 100,
    },
    campaignYear: overrides.campaignYear ?? 2026,
    technicalApplicationMonth: overrides.technicalApplicationMonth ?? 1,
    employerCostPolicy:
      overrides.employerCostPolicy ?? NEUTRAL_EMPLOYER_COST_POLICY,
  };
}

describe("Lot 2A-4 — resolveEmployeeS0", () => {
  it("résout famille/grade, plusieurs cellules, ordre aléatoire", () => {
    const grid = [
      gridCell("F2", "G3", 1_500_000),
      gridCell("F1", "G1", 1_000_000),
      gridCell("F1", "G2", 1_200_000),
    ];
    const snapshot = freezeClone(grid);
    const result = resolveEmployeeS0({
      familyCode: "f1",
      gradeCode: "g1",
      salaryGrid: grid,
    });
    expect(result.s0Fcfa).toBe(1_000_000n);
    expect(result.familyCode).toBe("F1");
    expect(grid).toEqual(snapshot);
  });

  it("rejette cellule absente, dupliquée, S0 invalide, codes vides", () => {
    const expectCode = (run: () => void, code: string) => {
      try {
        run();
        expect.fail(`Expected ${code}`);
      } catch (error) {
        expect(error).toBeInstanceOf(CompensationCalculationError);
        expect((error as CompensationCalculationError).code).toBe(code);
      }
    };

    expectCode(
      () =>
        resolveEmployeeS0({
          familyCode: "F9",
          gradeCode: "G1",
          salaryGrid: [gridCell("F1", "G1", 100)],
        }),
      "S0_REFERENCE_NOT_FOUND",
    );

    expectCode(
      () =>
        resolveEmployeeS0({
          familyCode: "F1",
          gradeCode: "G1",
          salaryGrid: [gridCell("F1", "G1", 100), gridCell("F1", "G1", 200)],
        }),
      "DUPLICATE_S0_REFERENCE",
    );

    expectCode(
      () =>
        resolveEmployeeS0({
          familyCode: "F1",
          gradeCode: "G1",
          salaryGrid: [gridCell("F1", "G1", 0)],
        }),
      "INVALID_S0",
    );

    expectCode(
      () =>
        resolveEmployeeS0({
          familyCode: "F1",
          gradeCode: "G1",
          salaryGrid: [gridCell("F1", "G1", -10)],
        }),
      "INVALID_S0",
    );

    expectCode(
      () =>
        resolveEmployeeS0({
          familyCode: " ",
          gradeCode: "G1",
          salaryGrid: [gridCell("F1", "G1", 100)],
        }),
      "INVALID_FAMILY_CODE",
    );

    expectCode(
      () =>
        resolveEmployeeS0({
          familyCode: "F1",
          gradeCode: "",
          salaryGrid: [gridCell("F1", "G1", 100)],
        }),
      "INVALID_GRADE_CODE",
    );
  });
});

describe("Lot 2A-4 — orchestrateur population", () => {
  it("calcule une population multi-salariés avec convention salaire × poids", () => {
    // Même position S0 et mêmes niveaux → même poids matriciel ;
    // salaires 2:1 ⇒ montants théoriques 2:1.
    const input = buildInput({
      employees: [
        {
          employeeId: "B",
          familyCode: "F1",
          gradeCode: "G1",
          salaryFcfa: 1_000_000,
          performanceLevel: "medium",
          potentialLevel: "medium",
          hireDate: "2020-07-15",
          confirmedUnderperformer: false,
        },
        {
          employeeId: "A",
          familyCode: "F2",
          gradeCode: "G1",
          salaryFcfa: 2_000_000,
          performanceLevel: "medium",
          potentialLevel: "medium",
          hireDate: "2020-07-15",
          confirmedUnderperformer: false,
        },
      ],
      budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 300_000 },
      roundingPolicy: { mode: "nearest_half_up", stepFcfa: 1 },
      references: baseReferences({
        evaluationMode: "performance_potential",
        salaryGrid: [
          gridCell("F1", "G1", 1_000_000),
          gridCell("F2", "G1", 2_000_000),
        ],
      }),
    });

    const snapshot = freezeClone(input);
    const result = calculatePreparedPopulationCompensation(input);
    expect(input).toEqual(snapshot);
    expect(result.allocationBasis).toBe(
      ALLOCATION_BASIS_SALARY_TIMES_MATRIX_WEIGHT,
    );
    expect(result.employees.map((e) => e.employeeId)).toEqual(["A", "B"]);

    const a = result.employees.find((e) => e.employeeId === "A")!;
    const b = result.employees.find((e) => e.employeeId === "B")!;
    expect(a.salaryPositionCode).toBe("S0");
    expect(b.salaryPositionCode).toBe("S0");
    expect(a.effectiveMatrixWeight).toEqual(b.effectiveMatrixWeight);
    expect(a.monthlyFinalRoundedIncreaseFcfa).toBe(16_667n);
    expect(b.monthlyFinalRoundedIncreaseFcfa).toBe(8_333n);
    expect(a.annualActualCostFcfa).toBe(200_004n);
    expect(b.annualActualCostFcfa).toBe(99_996n);
    expect(result.annualActualOperationCostFcfa).toBe(300_000n);
    expect(a.monthlyFinalSalaryFcfa).toBe(2_000_000n + 16_667n);
    expect(b.monthlyFinalSalaryFcfa).toBe(1_000_000n + 8_333n);
    expect(
      fractionsEqual(
        result.annualTheoreticalAllocatedTotal,
        result.budgetTargetResult.exactAmount,
      ),
    ).toBe(true);
  });

  it("couvre les quatre modes d’évaluation et l’indépendance d’orientation", () => {
    for (const mode of [
      "none",
      "performance_only",
      "full_nine_box",
      "performance_potential",
    ] as const) {
      const employees: PreparedEmployeeCalculationInput[] = [
        {
          employeeId: "E1",
          familyCode: "F1",
          gradeCode: "G1",
          salaryFcfa: 1_000_000,
          performanceLevel:
            mode === "none" ? undefined : "high",
          potentialLevel:
            mode === "none" || mode === "performance_only"
              ? undefined
              : "low",
          hireDate: "2020-07-15",
          confirmedUnderperformer: false,
        },
      ];
      const result = calculatePreparedPopulationCompensation(
        buildInput({
          employees,
          references: baseReferences({ evaluationMode: mode }),
          budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 10_000 },
          roundingPolicy: { mode: "nearest_half_up", stepFcfa: 1 },
        }),
      );
      expect(result.employees).toHaveLength(1);
      expect(result.evaluationMode).toBe(mode);
    }

    const nineBoxInput = buildInput({
      references: baseReferences({ evaluationMode: "full_nine_box" }),
      employees: [
        {
          employeeId: "E1",
          familyCode: "F1",
          gradeCode: "G1",
          salaryFcfa: 1_000_000,
          performanceLevel: "high",
          potentialLevel: "low",
          hireDate: "2020-07-15",
          confirmedUnderperformer: false,
        },
      ],
      roundingPolicy: { mode: "nearest_half_up", stepFcfa: 1 },
    });
    const orange = calculatePreparedPopulationCompensation(nineBoxInput);
    // Orientation n’est pas une entrée du calcul : même résultat répété.
    const again = calculatePreparedPopulationCompensation(nineBoxInput);
    expect(orange).toEqual(again);
  });

  it("gère budgets manuel/pourcentage, fractionnaire et plusieurs pas d’arrondi", () => {
    const manual = calculatePreparedPopulationCompensation(
      buildInput({
        budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 25_003 },
        roundingPolicy: { mode: "nearest_half_up", stepFcfa: 1000 },
      }),
    );
    expect(manual.budgetTargetResult.exactAmount).toEqual({
      numerator: 25_003n,
      denominator: 1n,
    });

    const fractional = calculatePreparedPopulationCompensation(
      buildInput({
        budgetTarget: {
          mode: "percentage_of_eligible_payroll",
          eligiblePayrollFcfa: 250_623,
          budgetRateBasisPoints: 400,
        },
        roundingPolicy: { mode: "nearest_half_up", stepFcfa: 5 },
      }),
    );
    expect(
      fractionsEqual(
        fractional.budgetTargetResult.exactAmount,
        reduceFraction(250_623n * 12n * 400n, 10_000n),
      ),
    ).toBe(true);

    for (const step of [1, 5, 100, 1000]) {
      const result = calculatePreparedPopulationCompensation(
        buildInput({
          roundingPolicy: { mode: "nearest_half_up", stepFcfa: step },
          budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 10_000 },
        }),
      );
      for (const employee of result.employees) {
        expect(employee.monthlyFinalRoundedIncreaseFcfa % BigInt(step)).toBe(0n);
      }
    }
  });

  it("applique sous-performant et poids nuls ; échoue si tous nuls avec budget > 0", () => {
    const withUnder = calculatePreparedPopulationCompensation(
      buildInput({
        employees: [
          {
            employeeId: "U",
            familyCode: "F1",
            gradeCode: "G1",
            salaryFcfa: 1_000_000,
            performanceLevel: "high",
            potentialLevel: "high",
            hireDate: "2020-07-15",
            confirmedUnderperformer: true,
          },
          {
            employeeId: "OK",
            familyCode: "F1",
            gradeCode: "G1",
            salaryFcfa: 1_000_000,
            performanceLevel: "medium",
            potentialLevel: "medium",
            hireDate: "2020-07-15",
            confirmedUnderperformer: false,
          },
        ],
        budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 50_000 },
        roundingPolicy: { mode: "nearest_half_up", stepFcfa: 1 },
      }),
    );
    const under = withUnder.employees.find((e) => e.employeeId === "U")!;
    expect(under.blockingReason).toBe("CONFIRMED_UNDERPERFORMER");
    expect(under.allocationWeight.numerator).toBe(0n);
    expect(under.annualTheoreticalAllocation.numerator).toBe(0n);
    expect(under.monthlyFinalRoundedIncreaseFcfa).toBe(0n);
    expect(withUnder.populationSummary.confirmedUnderperformerCount).toBe(1);
    expect(withUnder.populationSummary.zeroWeightEmployeeCount).toBe(1);

    expectPopulationFailure(
      () =>
        calculatePreparedPopulationCompensation(
          buildInput({
            employees: [
              {
                employeeId: "U1",
                familyCode: "F1",
                gradeCode: "G1",
                salaryFcfa: 1_000_000,
                performanceLevel: "high",
                potentialLevel: "high",
                hireDate: "2020-07-15",
                confirmedUnderperformer: true,
              },
            ],
            budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 10_000 },
          }),
        ),
      "NO_COMPENSATORY_ALLOCATION_CAPACITY",
    );
  });

  it("budget nul et erreurs structurées atomiques", () => {
    const zero = calculatePreparedPopulationCompensation(
      buildInput({
        budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 0 },
        roundingPolicy: { mode: "nearest_half_up", stepFcfa: 5 },
      }),
    );
    expect(zero.annualActualOperationCostFcfa).toBe(0n);

    try {
      calculatePreparedPopulationCompensation(
        buildInput({
          employees: [
            {
              employeeId: "DUP",
              familyCode: "F1",
              gradeCode: "G1",
              salaryFcfa: 1000,
              performanceLevel: "high",
              potentialLevel: "high",
              hireDate: "2020-07-15",
              confirmedUnderperformer: false,
            },
            {
              employeeId: "DUP",
              familyCode: "F1",
              gradeCode: "G1",
              salaryFcfa: 2000,
              performanceLevel: "high",
              potentialLevel: "high",
              hireDate: "2020-07-15",
              confirmedUnderperformer: false,
            },
          ],
        }),
      );
      expect.fail("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(CompensationCalculationError);
      const typed = error as CompensationCalculationError;
      expect(typed.code).toBe("POPULATION_CALCULATION_FAILED");
      expect(typed.issues?.some((i) => i.code === "DUPLICATE_EMPLOYEE_ID")).toBe(
        true,
      );
    }

    try {
      calculatePreparedPopulationCompensation(
        buildInput({
          employees: [
            {
              employeeId: "X",
              familyCode: "F9",
              gradeCode: "G1",
              salaryFcfa: 1000,
              performanceLevel: "high",
              potentialLevel: "high",
              hireDate: "2020-07-15",
              confirmedUnderperformer: false,
            },
          ],
        }),
      );
      expect.fail("expected failure");
    } catch (error) {
      const typed = error as CompensationCalculationError;
      expect(typed.code).toBe("POPULATION_CALCULATION_FAILED");
      expect(typed.issues?.[0]?.employeeId).toBe("X");
      expect(typed.issues?.[0]?.code).toBe("S0_REFERENCE_NOT_FOUND");
    }

    expectPopulationFailure(() =>
      calculatePreparedPopulationCompensation(
        buildInput({
          references: baseReferences({ evaluationMode: "performance_only" }),
          employees: [
            {
              employeeId: "E1",
              familyCode: "F1",
              gradeCode: "G1",
              salaryFcfa: 1000,
              hireDate: "2020-07-15",
              confirmedUnderperformer: false,
            },
          ],
        }),
      ),
    );
  });

  it("scénario métier complet (3 salariés, pas ≠ 5)", () => {
    const input = buildInput({
      employees: [
        {
          employeeId: "S-ALPHA",
          familyCode: "F1",
          gradeCode: "G1",
          salaryFcfa: 650_000, // ~65% → S7-
          performanceLevel: "high",
          potentialLevel: "high",
          hireDate: "2020-07-15",
          confirmedUnderperformer: false,
        },
        {
          employeeId: "S-BETA",
          familyCode: "F2",
          gradeCode: "G3",
          salaryFcfa: 1_500_000, // 100% → S0
          performanceLevel: "medium",
          potentialLevel: "low",
          hireDate: "2020-07-15",
          confirmedUnderperformer: false,
        },
        {
          employeeId: "S-GAMMA",
          familyCode: "F1",
          gradeCode: "G2",
          salaryFcfa: 1_620_000, // 135% → S7+
          performanceLevel: "low",
          potentialLevel: "low",
          hireDate: "2020-07-15",
          confirmedUnderperformer: true,
        },
      ],
      references: baseReferences({ evaluationMode: "full_nine_box" }),
      budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 200_000 },
      roundingPolicy: { mode: "nearest_half_up", stepFcfa: 100 },
    });

    const result = calculatePreparedPopulationCompensation(input);
    expect(result.employees.map((e) => e.employeeId)).toEqual([
      "S-ALPHA",
      "S-BETA",
      "S-GAMMA",
    ]);

    const alpha = result.employees[0];
    const beta = result.employees[1];
    const gamma = result.employees[2];

    expect(alpha.s0Fcfa).toBe(1_000_000n);
    expect(alpha.salaryPositionCode).toBe("S7-");
    expect(alpha.blockingReason).toBeUndefined();
    expect(alpha.allocationWeight.numerator > 0n).toBe(true);

    expect(beta.s0Fcfa).toBe(1_500_000n);
    expect(beta.salaryPositionCode).toBe("S0");

    expect(gamma.blockingReason).toBe("CONFIRMED_UNDERPERFORMER");
    expect(gamma.monthlyFinalRoundedIncreaseFcfa).toBe(0n);
    expect(gamma.annualTheoreticalAllocation.numerator).toBe(0n);

    expect(
      fractionsEqual(
        result.annualTheoreticalAllocatedTotal,
        result.budgetTargetResult.exactAmount,
      ),
    ).toBe(true);
    expect(result.annualActualOperationCostFcfa).toBe(
      result.employees.reduce(
        (sum, e) => sum + e.annualActualCostFcfa,
        0n,
      ),
    );
    expect(result.populationSummary.zeroWeightEmployeeCount).toBe(1);
    expect(
      result.explanationSteps.some((s) => s.code === "NO_FORCED_RECONCILIATION"),
    ).toBe(true);
  });

  it("second scénario : budget % fractionnaire", () => {
    const result = calculatePreparedPopulationCompensation(
      buildInput({
        employees: [
          {
            employeeId: "P1",
            familyCode: "F1",
            gradeCode: "G1",
            salaryFcfa: 800_000,
            performanceLevel: "high",
            potentialLevel: "medium",
            hireDate: "2020-07-15",
            confirmedUnderperformer: false,
          },
          {
            employeeId: "P2",
            familyCode: "F2",
            gradeCode: "G1",
            salaryFcfa: 1_200_000,
            performanceLevel: "medium",
            potentialLevel: "high",
            hireDate: "2020-07-15",
            confirmedUnderperformer: false,
          },
        ],
        budgetTarget: {
          mode: "percentage_of_eligible_payroll",
          eligiblePayrollFcfa: 250_623,
          budgetRateBasisPoints: 400,
        },
        roundingPolicy: { mode: "nearest_half_up", stepFcfa: 10 },
      }),
    );
    expect(result.budgetTargetResult.exactAmount.denominator).not.toBe(1n);
    expect(result.populationSummary.isTheoreticalBudgetExactlyAllocated).toBe(
      true,
    );
  });

  it("boucle déterministe multi-populations", () => {
    const populations: PreparedEmployeeCalculationInput[][] = [
      [
        {
          employeeId: "Z",
          familyCode: "F1",
          gradeCode: "G1",
          salaryFcfa: 500_000,
          performanceLevel: "low",
          potentialLevel: "low",
          hireDate: "2020-07-15",
          confirmedUnderperformer: false,
        },
        {
          employeeId: "A",
          familyCode: "F2",
          gradeCode: "G1",
          salaryFcfa: 1_500_000,
          performanceLevel: "high",
          potentialLevel: "high",
          hireDate: "2020-07-15",
          confirmedUnderperformer: false,
        },
      ],
      [
        {
          employeeId: "M1",
          familyCode: "F1",
          gradeCode: "G2",
          salaryFcfa: 1_200_000,
          performanceLevel: "medium",
          potentialLevel: "medium",
          hireDate: "2020-07-15",
          confirmedUnderperformer: false,
        },
        {
          employeeId: "M0",
          familyCode: "F1",
          gradeCode: "G2",
          salaryFcfa: 1_200_000,
          performanceLevel: "medium",
          potentialLevel: "medium",
          hireDate: "2020-07-15",
          confirmedUnderperformer: true,
        },
      ],
    ];
    const budgets = [
      { mode: "manual_amount" as const, manualBudgetFcfa: 0 },
      { mode: "manual_amount" as const, manualBudgetFcfa: 77_777 },
      {
        mode: "percentage_of_eligible_payroll" as const,
        eligiblePayrollFcfa: 250_623,
        budgetRateBasisPoints: 400,
      },
    ];
    const steps = [1, 5, 100];

    for (const employees of populations) {
      for (const budgetTarget of budgets) {
        for (const stepFcfa of steps) {
          const forwardInput = buildInput({
            employees,
            budgetTarget,
            roundingPolicy: { mode: "nearest_half_up", stepFcfa },
            references: baseReferences({ evaluationMode: "full_nine_box" }),
          });
          const reverseInput = buildInput({
            employees: [...employees].reverse(),
            budgetTarget,
            roundingPolicy: { mode: "nearest_half_up", stepFcfa },
            references: baseReferences({ evaluationMode: "full_nine_box" }),
          });
          const snap = freezeClone(forwardInput);
          const forward = calculatePreparedPopulationCompensation(forwardInput);
          const reverse = calculatePreparedPopulationCompensation(reverseInput);
          expect(forwardInput).toEqual(snap);

          expect(forward.employees.map((e) => e.employeeId)).toEqual(
            [...forward.employees.map((e) => e.employeeId)].sort(),
          );
          expect(forward.annualActualOperationCostFcfa).toBe(
            forward.employees.reduce(
              (sum, e) => sum + e.annualActualCostFcfa,
              0n,
            ),
          );
          expect(
            fractionsEqual(
              forward.annualTheoreticalAllocatedTotal,
              forward.budgetTargetResult.exactAmount,
            ),
          ).toBe(true);

          for (const employee of forward.employees) {
            const twin = reverse.employees.find(
              (e) => e.employeeId === employee.employeeId,
            )!;
            expect(twin.monthlyFinalRoundedIncreaseFcfa).toBe(
              employee.monthlyFinalRoundedIncreaseFcfa,
            );
            expect(employee.monthlyFinalRoundedIncreaseFcfa % BigInt(stepFcfa)).toBe(
              0n,
            );
            if (employee.allocationWeight.numerator === 0n) {
              expect(employee.monthlyFinalRoundedIncreaseFcfa).toBe(0n);
            }
          }
        }
      }
    }
  });

  it("supporte gros montants BigInt et refuse un résultat global si erreur", () => {
    const bigSalary = 10n ** 18n;
    const result = calculatePreparedPopulationCompensation(
      buildInput({
        employees: [
          {
            employeeId: "BIG",
            familyCode: "F1",
            gradeCode: "G1",
            salaryFcfa: bigSalary,
            performanceLevel: "medium",
            potentialLevel: "medium",
            hireDate: "2020-07-15",
            confirmedUnderperformer: false,
          },
        ],
        references: baseReferences({
          evaluationMode: "none",
          salaryGrid: [gridCell("F1", "G1", bigSalary)],
        }),
        budgetTarget: {
          mode: "manual_amount",
          manualBudgetFcfa: 10n ** 16n,
        },
        roundingPolicy: { mode: "nearest_half_up", stepFcfa: 1 },
      }),
    );
    expect(result.employees[0].salaryFcfa).toBe(bigSalary);
    // annualActual = round(budget/12) × 12 — peut différer du budget cible
    expect(result.annualActualOperationCostFcfa).toBe(
      result.employees[0].monthlyFinalRoundedIncreaseFcfa * 12n,
    );
    expect(result.annualActualOperationCostFcfa).toBe(9_999_999_999_999_996n);
  });
});
