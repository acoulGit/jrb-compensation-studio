import { describe, expect, it } from "vitest";
import {
  allocateTheoreticalPopulationBudget,
  calculatePopulationBudgetAllocation,
  compareFractions,
  CompensationCalculationError,
  exactAmountFromInteger,
  fractionsEqual,
  reduceFraction,
  resolveBudgetTarget,
  roundFractionToStepHalfUp,
  roundPopulationAllocations,
  type PopulationAllocationEmployeeInput,
  type RoundingPolicy,
} from "../domain/compensationCalculation";

function expectErrorCode(run: () => void, code: string): void {
  try {
    run();
    expect.fail(`Expected error ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(CompensationCalculationError);
    expect((error as CompensationCalculationError).code).toBe(code);
  }
}

function freezeClone<T>(value: T): T {
  return structuredClone(value);
}

describe("Lot 2A-3 — resolveBudgetTarget", () => {
  it("accepte un montant manuel valide et zéro", () => {
    const amount = resolveBudgetTarget({
      mode: "manual_amount",
      manualBudgetFcfa: 25_000_000,
    });
    expect(amount.exactAmount).toEqual({ numerator: 25_000_000n, denominator: 1n });
    expect(amount.mode).toBe("manual_amount");

    const zero = resolveBudgetTarget({
      mode: "manual_amount",
      manualBudgetFcfa: 0,
    });
    expect(zero.exactAmount).toEqual({ numerator: 0n, denominator: 1n });
  });

  it("rejette montant manuel manquant, négatif ou non entier", () => {
    expectErrorCode(
      () => resolveBudgetTarget({ mode: "manual_amount" }),
      "MISSING_MANUAL_BUDGET",
    );
    expectErrorCode(
      () =>
        resolveBudgetTarget({ mode: "manual_amount", manualBudgetFcfa: -1 }),
      "INVALID_MANUAL_BUDGET",
    );
    expectErrorCode(
      () =>
        resolveBudgetTarget({
          mode: "manual_amount",
          manualBudgetFcfa: 10.5,
        }),
      "INVALID_MANUAL_BUDGET",
    );
  });

  it("accepte un montant manuel non divisible par 5 ou 100 sans arrondi", () => {
    const by5 = resolveBudgetTarget({
      mode: "manual_amount",
      manualBudgetFcfa: 25_000_003,
    });
    expect(by5.exactAmount).toEqual({
      numerator: 25_000_003n,
      denominator: 1n,
    });
    const by100 = resolveBudgetTarget({
      mode: "manual_amount",
      manualBudgetFcfa: 1_000_050,
    });
    expect(by100.exactAmount.numerator).toBe(1_000_050n);
  });

  it("ignore assiette et taux en mode manuel", () => {
    const result = resolveBudgetTarget({
      mode: "manual_amount",
      manualBudgetFcfa: 1000,
      eligiblePayrollFcfa: 999_999_999,
      budgetRateBasisPoints: 400,
    });
    expect(result.exactAmount).toEqual({ numerator: 1000n, denominator: 1n });
    expect(result.ignoredForeignFields).toEqual([
      "eligiblePayrollFcfa",
      "budgetRateBasisPoints",
    ]);
    expect(
      result.explanationSteps.some(
        (step) => step.code === "BUDGET_TARGET_FOREIGN_FIELDS_IGNORED",
      ),
    ).toBe(true);
  });

  it("calcule le pourcentage exact, y compris fractionnaire", () => {
    const exact = resolveBudgetTarget({
      mode: "percentage_of_eligible_payroll",
      eligiblePayrollFcfa: 1_000_000_000,
      budgetRateBasisPoints: 400,
    });
    expect(exact.exactAmount).toEqual({
      numerator: 480_000_000n,
      denominator: 1n,
    });

    const fractional = resolveBudgetTarget({
      mode: "percentage_of_eligible_payroll",
      eligiblePayrollFcfa: 250_623,
      budgetRateBasisPoints: 400,
    });
    // monthly 250623 × 12 × 400 / 10000 (budget annuel)
    expect(fractional.exactAmount).toEqual(
      reduceFraction(250_623n * 12n * 400n, 10_000n),
    );
    // Pas arrondi à un entier
    expect(fractional.exactAmount.denominator).not.toBe(1n);
  });

  it("gère assiette/taux nuls et rejette absents / négatifs / non entiers", () => {
    expect(
      resolveBudgetTarget({
        mode: "percentage_of_eligible_payroll",
        eligiblePayrollFcfa: 0,
        budgetRateBasisPoints: 400,
      }).exactAmount,
    ).toEqual({ numerator: 0n, denominator: 1n });
    expect(
      resolveBudgetTarget({
        mode: "percentage_of_eligible_payroll",
        eligiblePayrollFcfa: 1000,
        budgetRateBasisPoints: 0,
      }).exactAmount,
    ).toEqual({ numerator: 0n, denominator: 1n });

    expectErrorCode(
      () =>
        resolveBudgetTarget({
          mode: "percentage_of_eligible_payroll",
          budgetRateBasisPoints: 400,
        }),
      "MISSING_ELIGIBLE_PAYROLL",
    );
    expectErrorCode(
      () =>
        resolveBudgetTarget({
          mode: "percentage_of_eligible_payroll",
          eligiblePayrollFcfa: 1000,
        }),
      "MISSING_BUDGET_RATE",
    );
    expectErrorCode(
      () =>
        resolveBudgetTarget({
          mode: "percentage_of_eligible_payroll",
          eligiblePayrollFcfa: -1,
          budgetRateBasisPoints: 400,
        }),
      "INVALID_ELIGIBLE_PAYROLL",
    );
    expectErrorCode(
      () =>
        resolveBudgetTarget({
          mode: "percentage_of_eligible_payroll",
          eligiblePayrollFcfa: 1000,
          budgetRateBasisPoints: -1,
        }),
      "INVALID_BUDGET_RATE",
    );
    expectErrorCode(
      () =>
        resolveBudgetTarget({
          mode: "percentage_of_eligible_payroll",
          eligiblePayrollFcfa: 10.5,
          budgetRateBasisPoints: 400,
        }),
      "INVALID_ELIGIBLE_PAYROLL",
    );
    expectErrorCode(
      () =>
        resolveBudgetTarget({
          mode: "percentage_of_eligible_payroll",
          eligiblePayrollFcfa: 1000,
          budgetRateBasisPoints: 4.5,
        }),
      "INVALID_BUDGET_RATE",
    );
  });

  it("supporte les gros montants BigInt et rejette un mode inconnu", () => {
    const huge = 10n ** 30n;
    const result = resolveBudgetTarget({
      mode: "manual_amount",
      manualBudgetFcfa: huge,
    });
    expect(result.exactAmount.numerator).toBe(huge);

    const pct = resolveBudgetTarget({
      mode: "percentage_of_eligible_payroll",
      eligiblePayrollFcfa: huge,
      budgetRateBasisPoints: 400n,
    });
    expect(pct.exactAmount).toEqual(reduceFraction(huge * 12n * 400n, 10_000n));

    expectErrorCode(
      () =>
        resolveBudgetTarget({
          mode: "unknown" as "manual_amount",
          manualBudgetFcfa: 1,
        }),
      "UNSUPPORTED_BUDGET_TARGET_MODE",
    );
  });

  it("est déterministe, trace complet et n’altère pas l’entrée", () => {
    const input = {
      mode: "percentage_of_eligible_payroll" as const,
      eligiblePayrollFcfa: 250_623,
      budgetRateBasisPoints: 400,
    };
    const snapshot = freezeClone(input);
    const first = resolveBudgetTarget(input);
    const second = resolveBudgetTarget(input);
    expect(first).toEqual(second);
    expect(input).toEqual(snapshot);
    const codes = first.explanationSteps.map((step) => step.code);
    expect(codes).toContain("BUDGET_TARGET_PERCENTAGE_PERIOD");
    expect(codes).toContain("BUDGET_TARGET_EXACT");
  });
});

describe("Lot 2A-3 — allocateTheoreticalPopulationBudget", () => {
  const budget = exactAmountFromInteger(1000n);

  it("répartit budget nul, un salarié, poids égaux et différents", () => {
    const zero = allocateTheoreticalPopulationBudget({
      budgetTarget: exactAmountFromInteger(0n),
      employees: [
        { employeeId: "A", effectiveWeightNumerator: 10, effectiveWeightScale: 1 },
        { employeeId: "B", effectiveWeightNumerator: 20, effectiveWeightScale: 1 },
      ],
    });
    expect(zero.allocations.every((a) => a.theoreticalAmount.numerator === 0n)).toBe(
      true,
    );

    const single = allocateTheoreticalPopulationBudget({
      budgetTarget: budget,
      employees: [
        { employeeId: "A", effectiveWeightNumerator: 5, effectiveWeightScale: 1 },
      ],
    });
    expect(single.allocations[0].theoreticalAmount).toEqual(budget);

    const equal = allocateTheoreticalPopulationBudget({
      budgetTarget: budget,
      employees: [
        { employeeId: "A", effectiveWeightNumerator: 1, effectiveWeightScale: 1 },
        { employeeId: "B", effectiveWeightNumerator: 1, effectiveWeightScale: 1 },
      ],
    });
    expect(equal.allocations[0].theoreticalAmount).toEqual(
      exactAmountFromInteger(500n),
    );
    expect(equal.allocations[1].theoreticalAmount).toEqual(
      exactAmountFromInteger(500n),
    );

    const mixed = allocateTheoreticalPopulationBudget({
      budgetTarget: budget,
      employees: [
        { employeeId: "A", effectiveWeightNumerator: 1, effectiveWeightScale: 1 },
        { employeeId: "B", effectiveWeightNumerator: 3, effectiveWeightScale: 1 },
      ],
    });
    expect(mixed.allocations[0].theoreticalAmount).toEqual(
      exactAmountFromInteger(250n),
    );
    expect(mixed.allocations[1].theoreticalAmount).toEqual(
      exactAmountFromInteger(750n),
    );
  });

  it("gère échelles différentes et poids nuls", () => {
    const result = allocateTheoreticalPopulationBudget({
      budgetTarget: budget,
      employees: [
        { employeeId: "A", effectiveWeightNumerator: 1, effectiveWeightScale: 2 },
        { employeeId: "B", effectiveWeightNumerator: 1, effectiveWeightScale: 4 },
        {
          employeeId: "U",
          effectiveWeightNumerator: 0,
          effectiveWeightScale: 1_000_000_000,
        },
      ],
    });
    // weights 1/2 + 1/4 + 0 = 3/4 ; A = 1000*(1/2)/(3/4)=1000*2/3 ; B=1000*(1/4)/(3/4)=1000/3
    expect(result.allocations.find((a) => a.employeeId === "A")!.theoreticalAmount).toEqual(
      reduceFraction(2000n, 3n),
    );
    expect(result.allocations.find((a) => a.employeeId === "B")!.theoreticalAmount).toEqual(
      reduceFraction(1000n, 3n),
    );
    expect(result.allocations.find((a) => a.employeeId === "U")!.theoreticalAmount).toEqual(
      exactAmountFromInteger(0n),
    );
    expect(result.isExactlyAllocated).toBe(true);
    expect(
      fractionsEqual(result.theoreticalAllocatedTotal, result.budgetTarget),
    ).toBe(true);
  });

  it("rejette population vide, ids invalides, poids invalides, aucun poids positif", () => {
    expectErrorCode(
      () =>
        allocateTheoreticalPopulationBudget({
          budgetTarget: budget,
          employees: [],
        }),
      "EMPTY_POPULATION",
    );
    expectErrorCode(
      () =>
        allocateTheoreticalPopulationBudget({
          budgetTarget: exactAmountFromInteger(0n),
          employees: [],
        }),
      "EMPTY_POPULATION",
    );
    expectErrorCode(
      () =>
        allocateTheoreticalPopulationBudget({
          budgetTarget: budget,
          employees: [
            { employeeId: " ", effectiveWeightNumerator: 1, effectiveWeightScale: 1 },
          ],
        }),
      "INVALID_EMPLOYEE_ID",
    );
    expectErrorCode(
      () =>
        allocateTheoreticalPopulationBudget({
          budgetTarget: budget,
          employees: [
            { employeeId: "A", effectiveWeightNumerator: 1, effectiveWeightScale: 1 },
            { employeeId: "A", effectiveWeightNumerator: 2, effectiveWeightScale: 1 },
          ],
        }),
      "DUPLICATE_EMPLOYEE_ID",
    );
    expectErrorCode(
      () =>
        allocateTheoreticalPopulationBudget({
          budgetTarget: budget,
          employees: [
            { employeeId: "A", effectiveWeightNumerator: -1, effectiveWeightScale: 1 },
          ],
        }),
      "INVALID_WEIGHT",
    );
    expectErrorCode(
      () =>
        allocateTheoreticalPopulationBudget({
          budgetTarget: budget,
          employees: [
            { employeeId: "A", effectiveWeightNumerator: 1, effectiveWeightScale: 0 },
          ],
        }),
      "INVALID_WEIGHT_SCALE",
    );
    expectErrorCode(
      () =>
        allocateTheoreticalPopulationBudget({
          budgetTarget: budget,
          employees: [
            { employeeId: "A", effectiveWeightNumerator: 1, effectiveWeightScale: -2 },
          ],
        }),
      "INVALID_WEIGHT_SCALE",
    );
    expectErrorCode(
      () =>
        allocateTheoreticalPopulationBudget({
          budgetTarget: budget,
          employees: [
            { employeeId: "A", effectiveWeightNumerator: 0, effectiveWeightScale: 1 },
            { employeeId: "B", effectiveWeightNumerator: 0, effectiveWeightScale: 5 },
          ],
        }),
      "NO_POSITIVE_WEIGHT",
    );
  });

  it("reste exact avec gros BigInt, budget fractionnaire et ordre indépendant", () => {
    const fractionalBudget = reduceFraction(250_623n * 12n * 400n, 10_000n);
    const employees: PopulationAllocationEmployeeInput[] = [
      {
        employeeId: "A",
        effectiveWeightNumerator: 10n ** 20n,
        effectiveWeightScale: 10n ** 5n,
      },
      {
        employeeId: "B",
        effectiveWeightNumerator: 3n * 10n ** 20n,
        effectiveWeightScale: 10n ** 5n,
      },
    ];
    const forward = allocateTheoreticalPopulationBudget({
      budgetTarget: fractionalBudget,
      employees,
    });
    const reverse = allocateTheoreticalPopulationBudget({
      budgetTarget: fractionalBudget,
      employees: [...employees].reverse(),
    });
    expect(
      fractionsEqual(forward.theoreticalAllocatedTotal, fractionalBudget),
    ).toBe(true);
    expect(
      forward.allocations.find((a) => a.employeeId === "A")!.theoreticalAmount,
    ).toEqual(
      reverse.allocations.find((a) => a.employeeId === "A")!.theoreticalAmount,
    );
    expect(forward.isExactlyAllocated).toBe(true);
  });

  it("est déterministe, indépendant de l’orientation 9-Box et sans mutation", () => {
    const input = {
      budgetTarget: budget,
      employees: [
        { employeeId: "A", effectiveWeightNumerator: 2, effectiveWeightScale: 3 },
        { employeeId: "B", effectiveWeightNumerator: 4, effectiveWeightScale: 5 },
      ],
    };
    const snapshot = freezeClone(input);
    const first = allocateTheoreticalPopulationBudget(input);
    const second = allocateTheoreticalPopulationBudget(input);
    expect(first).toEqual(second);
    expect(input).toEqual(snapshot);
    // Orientation 9-Box hors entrée : même résultat trivialement.
    expect(first.explanationSteps.map((s) => s.code)).toContain(
      "THEORETICAL_BUDGET_EXACTLY_ALLOCATED",
    );
  });
});

describe("Lot 2A-3 — roundPopulationAllocations", () => {
  it("arrondit half-up pour plusieurs pas", () => {
    // 1002.49 → 1000 avec pas 5 ; 1002.50 → 1005
    expect(
      roundFractionToStepHalfUp(reduceFraction(100249n, 100n), 5n),
    ).toBe(1000n);
    expect(
      roundFractionToStepHalfUp(reduceFraction(100250n, 100n), 5n),
    ).toBe(1005n);
    expect(
      roundFractionToStepHalfUp(reduceFraction(100251n, 100n), 5n),
    ).toBe(1005n);

    expect(
      roundFractionToStepHalfUp(reduceFraction(104999n, 100n), 100n),
    ).toBe(1000n);
    expect(
      roundFractionToStepHalfUp(reduceFraction(105000n, 100n), 100n),
    ).toBe(1100n);
    expect(
      roundFractionToStepHalfUp(reduceFraction(105001n, 100n), 100n),
    ).toBe(1100n);
  });

  it("rejette pas / mode invalides", () => {
    const theoretical = allocateTheoreticalPopulationBudget({
      budgetTarget: exactAmountFromInteger(100n),
      employees: [
        { employeeId: "A", effectiveWeightNumerator: 1, effectiveWeightScale: 1 },
      ],
    });
    expectErrorCode(
      () =>
        roundPopulationAllocations({
          theoretical,
          roundingPolicy: { mode: "nearest_half_up", stepFcfa: 0 },
        }),
      "INVALID_ROUNDING_STEP",
    );
    expectErrorCode(
      () =>
        roundPopulationAllocations({
          theoretical,
          roundingPolicy: { mode: "nearest_half_up", stepFcfa: -5 },
        }),
      "INVALID_ROUNDING_STEP",
    );
    expectErrorCode(
      () =>
        roundPopulationAllocations({
          theoretical,
          roundingPolicy: { mode: "nearest_half_up", stepFcfa: 1.5 },
        }),
      "INVALID_ROUNDING_STEP",
    );
    expectErrorCode(
      () =>
        roundPopulationAllocations({
          theoretical,
          roundingPolicy: {
            mode: "bankers" as "nearest_half_up",
            stepFcfa: 5,
          },
        }),
      "UNSUPPORTED_ROUNDING_MODE",
    );
  });

  it("expose écarts individuels et totaux sans réconciliation forcée", () => {
    // Budget 1000, deux parts 500.4 et 499.6 → avec pas 1 : 500 et 500 ; total = budget
    // Avec parts 333.4 + 333.3 + 333.3 = 1000, pas 5 → arrondis 335+335+335=1005 > budget
    const theoretical = allocateTheoreticalPopulationBudget({
      budgetTarget: exactAmountFromInteger(1000n),
      employees: [
        { employeeId: "A", effectiveWeightNumerator: 1, effectiveWeightScale: 3 },
        { employeeId: "B", effectiveWeightNumerator: 1, effectiveWeightScale: 3 },
        { employeeId: "C", effectiveWeightNumerator: 1, effectiveWeightScale: 3 },
      ],
    });
    const rounded = roundPopulationAllocations({
      theoretical,
      roundingPolicy: { mode: "nearest_half_up", stepFcfa: 5 },
    });
    expect(rounded.allocations.every((a) => a.finalRoundedAmountFcfa % 5n === 0n)).toBe(
      true,
    );
    expect(rounded.actualOperationAmountFcfa).toBe(
      rounded.allocations.reduce((sum, a) => sum + a.finalRoundedAmountFcfa, 0n),
    );
    // 1000/3 ≈ 333.333… → half-up step 5 → 335 chacun → 1005
    expect(rounded.actualOperationAmountFcfa).toBe(1005n);
    expect(compareFractions(rounded.totalRoundingDelta, exactAmountFromInteger(0n))).toBe(
      1,
    );
    expect(
      rounded.explanationSteps.some(
        (step) => step.code === "NO_FORCED_BUDGET_RECONCILIATION",
      ),
    ).toBe(true);
    // Preuve : aucun salarié n’a un montant différent d’un simple half-up de sa part
    for (const allocation of rounded.allocations) {
      expect(allocation.finalRoundedAmountFcfa).toBe(
        roundFractionToStepHalfUp(allocation.theoreticalAmount, 5n),
      );
    }
  });

  it("couvre totaux inférieur / égal / supérieur et écart fractionnaire", () => {
    const fractionalBudget = reduceFraction(250_623n * 12n * 400n, 10_000n); // annualized
    const one = allocateTheoreticalPopulationBudget({
      budgetTarget: fractionalBudget,
      employees: [
        { employeeId: "A", effectiveWeightNumerator: 1, effectiveWeightScale: 1 },
      ],
    });
    const rounded1 = roundPopulationAllocations({
      theoretical: one,
      roundingPolicy: { mode: "nearest_half_up", stepFcfa: 1 },
    });
    // 120299,04 → 120299 ; delta = 120299 - 120299,04 = -0,04 = -4/100 = -1/25
    expect(rounded1.actualOperationAmountFcfa).toBe(120_299n);
    expect(
      fractionsEqual(rounded1.totalRoundingDelta, reduceFraction(-4n, 100n)),
    ).toBe(true);

    const equal = roundPopulationAllocations({
      theoretical: allocateTheoreticalPopulationBudget({
        budgetTarget: exactAmountFromInteger(100n),
        employees: [
          { employeeId: "A", effectiveWeightNumerator: 1, effectiveWeightScale: 1 },
        ],
      }),
      roundingPolicy: { mode: "nearest_half_up", stepFcfa: 5 },
    });
    expect(equal.actualOperationAmountFcfa).toBe(100n);
    expect(equal.totalRoundingDelta).toEqual(exactAmountFromInteger(0n));
  });

  it("boucle déterministe multi-populations / multi-pas", () => {
    const populations: PopulationAllocationEmployeeInput[][] = [
      [
        { employeeId: "A", effectiveWeightNumerator: 1, effectiveWeightScale: 1 },
        { employeeId: "B", effectiveWeightNumerator: 1, effectiveWeightScale: 1 },
      ],
      [
        { employeeId: "A", effectiveWeightNumerator: 1, effectiveWeightScale: 2 },
        { employeeId: "B", effectiveWeightNumerator: 3, effectiveWeightScale: 4 },
        { employeeId: "C", effectiveWeightNumerator: 0, effectiveWeightScale: 7 },
      ],
      [
        { employeeId: "X", effectiveWeightNumerator: 9, effectiveWeightScale: 2 },
        { employeeId: "Y", effectiveWeightNumerator: 1, effectiveWeightScale: 2 },
      ],
    ];
    const budgets = [
      exactAmountFromInteger(0n),
      exactAmountFromInteger(10_000n),
      reduceFraction(250_623n * 12n * 400n, 10_000n),
    ];
    const policies: RoundingPolicy[] = [
      { mode: "nearest_half_up", stepFcfa: 1 },
      { mode: "nearest_half_up", stepFcfa: 5 },
      { mode: "nearest_half_up", stepFcfa: 10 },
      { mode: "nearest_half_up", stepFcfa: 100 },
      { mode: "nearest_half_up", stepFcfa: 1000 },
    ];

    for (const budget of budgets) {
      for (const employees of populations) {
        const theoretical = allocateTheoreticalPopulationBudget({
          budgetTarget: budget,
          employees,
        });
        expect(
          fractionsEqual(theoretical.theoreticalAllocatedTotal, budget),
        ).toBe(true);

        for (const policy of policies) {
          const forward = roundPopulationAllocations({
            theoretical,
            roundingPolicy: policy,
          });
          const reverse = roundPopulationAllocations({
            theoretical: allocateTheoreticalPopulationBudget({
              budgetTarget: budget,
              employees: [...employees].reverse(),
            }),
            roundingPolicy: policy,
          });

          const step = BigInt(policy.stepFcfa as number);
          let sum = 0n;
          for (const allocation of forward.allocations) {
            expect(allocation.finalRoundedAmountFcfa >= 0n).toBe(true);
            expect(allocation.finalRoundedAmountFcfa % step).toBe(0n);
            sum += allocation.finalRoundedAmountFcfa;
            expect(
              reverse.allocations.find((a) => a.employeeId === allocation.employeeId)!
                .finalRoundedAmountFcfa,
            ).toBe(allocation.finalRoundedAmountFcfa);
          }
          expect(forward.actualOperationAmountFcfa).toBe(sum);
          expect(
            fractionsEqual(
              forward.totalRoundingDelta,
              reduceFraction(
                sum * budget.denominator - budget.numerator,
                budget.denominator,
              ),
            ),
          ).toBe(true);
        }
      }
    }
  });

  it("orchestre le pipeline complet sans mutation", () => {
    const input = {
      budget: {
        mode: "manual_amount" as const,
        manualBudgetFcfa: 25_000_003,
        eligiblePayrollFcfa: 1,
        budgetRateBasisPoints: 9999,
      },
      employees: [
        { employeeId: "A", effectiveWeightNumerator: 1, effectiveWeightScale: 1 },
        { employeeId: "B", effectiveWeightNumerator: 1, effectiveWeightScale: 1 },
      ],
      roundingPolicy: { mode: "nearest_half_up" as const, stepFcfa: 5 },
    };
    const snapshot = freezeClone(input);
    const result = calculatePopulationBudgetAllocation(input);
    expect(input).toEqual(snapshot);
    expect(result.budgetTarget).toEqual({
      numerator: 25_000_003n,
      denominator: 1n,
    });
    expect(result.explanationSteps.map((s) => s.code)).toContain(
      "NO_FORCED_BUDGET_RECONCILIATION",
    );
    expect(result.explanationSteps.map((s) => s.code)).toContain(
      "BUDGET_TARGET_MANUAL_PERIOD",
    );
  });
});
