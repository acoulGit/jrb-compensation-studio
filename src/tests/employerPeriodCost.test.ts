/**
 * Lot 2B-RC1-H6-A2 — fondation pure du coût employeur de période.
 */

import { describe, expect, it } from "vitest";
import {
  aggregatePeriodEmployerCostBreakdowns,
  calculatePeriodEmployerCost,
  EmployerPeriodCostError,
  type EmployerCostPolicy,
  type PeriodEmployerCostBreakdown,
  type PeriodGrossSalaryImpactInput,
} from "../domain/compensationCalculation/employerPeriodCost";
import {
  exactAmountFromInteger,
  reduceFraction,
} from "../domain/compensationCalculation/exactFraction";

function grossInput(
  overrides: Partial<PeriodGrossSalaryImpactInput> = {},
): PeriodGrossSalaryImpactInput {
  return {
    monthlyGrossIncreaseFcfa: 20_000n,
    periodGrossImpactFcfa: 180_000n,
    fullYearGrossRunRateFcfa: 240_000n,
    ...overrides,
  };
}

function ratePolicy(
  ...rates: ExactAmountLike[]
): EmployerCostPolicy {
  return {
    kind: "rate_on_gross_period",
    components: rates.map((rate) => ({
      categoryId: "unspecified_bundle" as const,
      rate: toExact(rate),
    })),
  };
}

type ExactAmountLike = { numerator: bigint; denominator: bigint } | bigint;

function toExact(rate: ExactAmountLike) {
  if (typeof rate === "bigint") {
    return exactAmountFromInteger(rate);
  }
  return reduceFraction(rate.numerator, rate.denominator);
}

describe("Lot 2B-RC1-H6-A2 — calculatePeriodEmployerCost", () => {
  it("1. politique neutre : charges 0, complet = brut", () => {
    const result = calculatePeriodEmployerCost(grossInput(), { kind: "neutral" });
    expect(result.periodEmployerChargesFcfa).toBe(0n);
    expect(result.periodEmployerCompleteCostFcfa).toBe(180_000n);
    expect(result.chargeComponents).toEqual([]);
    expect(result.policyKind).toBe("neutral");
    expect(result.monthlyGrossIncreaseFcfa).toBe(20_000n);
    expect(result.fullYearGrossRunRateFcfa).toBe(240_000n);
  });

  it("2. politique à taux nul", () => {
    const result = calculatePeriodEmployerCost(
      grossInput(),
      ratePolicy(0n),
    );
    expect(result.periodEmployerChargesFcfa).toBe(0n);
    expect(result.periodEmployerCompleteCostFcfa).toBe(180_000n);
    expect(result.chargeComponents).toHaveLength(1);
    expect(result.chargeComponents[0]!.amountFcfa).toBe(0n);
    expect(result.policyKind).toBe("rate_on_gross_period");
  });

  it("3. taux positif exact (10 %)", () => {
    const result = calculatePeriodEmployerCost(
      grossInput({ periodGrossImpactFcfa: 100_000n }),
      ratePolicy(reduceFraction(10n, 100n)),
    );
    expect(result.periodEmployerChargesFcfa).toBe(10_000n);
    expect(result.periodEmployerCompleteCostFcfa).toBe(110_000n);
  });

  it("4. arrondi inférieur à 0,5 FCFA (reste < demi-unité)", () => {
    // 1000 × 1/3 = 333 + 1/3 → half-up → 333
    const result = calculatePeriodEmployerCost(
      grossInput({
        monthlyGrossIncreaseFcfa: 0n,
        periodGrossImpactFcfa: 1_000n,
        fullYearGrossRunRateFcfa: undefined,
      }),
      ratePolicy(reduceFraction(1n, 3n)),
    );
    expect(result.periodEmployerChargesFcfa).toBe(333n);
  });

  it("5. arrondi exactement à 0,5 FCFA", () => {
    // 1 × 1/2 = 0,5 → half-up → 1
    const result = calculatePeriodEmployerCost(
      grossInput({
        monthlyGrossIncreaseFcfa: 0n,
        periodGrossImpactFcfa: 1n,
        fullYearGrossRunRateFcfa: undefined,
      }),
      ratePolicy(reduceFraction(1n, 2n)),
    );
    expect(result.periodEmployerChargesFcfa).toBe(1n);
  });

  it("6. arrondi supérieur à 0,5 FCFA", () => {
    // 2 × 2/3 = 4/3 ≈ 1,333 → half-up → 1
    // 5 × 1/3 ≈ 1,666 → half-up → 2
    const result = calculatePeriodEmployerCost(
      grossInput({
        monthlyGrossIncreaseFcfa: 0n,
        periodGrossImpactFcfa: 2n,
        fullYearGrossRunRateFcfa: undefined,
      }),
      ratePolicy(reduceFraction(2n, 3n)),
    );
    expect(result.periodEmployerChargesFcfa).toBe(1n);
    // 2*(2/3)=4/3=1.333... → half-up to 1 (reste 0.333 < 0.5)
    // Better case: 5 * 1/3 = 1.666... → 2
    const resultUp = calculatePeriodEmployerCost(
      grossInput({
        monthlyGrossIncreaseFcfa: 0n,
        periodGrossImpactFcfa: 5n,
        fullYearGrossRunRateFcfa: undefined,
      }),
      ratePolicy(reduceFraction(1n, 3n)),
    );
    expect(resultUp.periodEmployerChargesFcfa).toBe(2n);
  });

  it("7. montant nul", () => {
    const result = calculatePeriodEmployerCost(
      grossInput({
        monthlyGrossIncreaseFcfa: 0n,
        periodGrossImpactFcfa: 0n,
        fullYearGrossRunRateFcfa: 0n,
      }),
      ratePolicy(reduceFraction(17n, 100n)),
    );
    expect(result.periodGrossImpactFcfa).toBe(0n);
    expect(result.periodEmployerChargesFcfa).toBe(0n);
    expect(result.periodEmployerCompleteCostFcfa).toBe(0n);
  });

  it("8. coût complet = brut + charges", () => {
    const result = calculatePeriodEmployerCost(
      grossInput({ periodGrossImpactFcfa: 99_999n }),
      ratePolicy(reduceFraction(7n, 100n)),
    );
    expect(result.periodEmployerCompleteCostFcfa).toBe(
      result.periodGrossImpactFcfa + result.periodEmployerChargesFcfa,
    );
  });

  it("9. somme des composantes = charges", () => {
    // Une seule catégorie autorisée : vérifier via agrégat multi-lignes plus bas ;
    // ici une composante unique.
    const result = calculatePeriodEmployerCost(
      grossInput({ periodGrossImpactFcfa: 50_000n }),
      ratePolicy(reduceFraction(1n, 10n)),
    );
    const sum = result.chargeComponents.reduce(
      (acc, c) => acc + c.amountFcfa,
      0n,
    );
    expect(sum).toBe(result.periodEmployerChargesFcfa);
  });

  it("10. plusieurs composantes : A2 n’autorise qu’un id — une composante produit charges = montant", () => {
    const result = calculatePeriodEmployerCost(
      grossInput({ periodGrossImpactFcfa: 80_000n }),
      ratePolicy(reduceFraction(15n, 100n)),
    );
    expect(result.chargeComponents).toHaveLength(1);
    expect(result.periodEmployerChargesFcfa).toBe(12_000n);
    expect(result.chargeComponents[0]!.categoryId).toBe("unspecified_bundle");
  });

  it("11. entrée négative refusée", () => {
    expect(() =>
      calculatePeriodEmployerCost(
        grossInput({ periodGrossImpactFcfa: -1n }),
        { kind: "neutral" },
      ),
    ).toThrowError(/négatif/);
  });

  it("12. taux négatif refusé", () => {
    expect(() =>
      calculatePeriodEmployerCost(
        grossInput(),
        ratePolicy(reduceFraction(-1n, 10n)),
      ),
    ).toThrow(EmployerPeriodCostError);
  });

  it("13. identifiant dupliqué refusé", () => {
    try {
      calculatePeriodEmployerCost(grossInput(), {
        kind: "rate_on_gross_period",
        components: [
          { categoryId: "unspecified_bundle", rate: reduceFraction(1n, 10n) },
          { categoryId: "unspecified_bundle", rate: reduceFraction(1n, 20n) },
        ],
      });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EmployerPeriodCostError);
      expect((error as EmployerPeriodCostError).code).toBe(
        "DUPLICATE_EMPLOYER_CHARGE_CATEGORY",
      );
    }
  });

  it("19. absence de mutation des entrées", () => {
    const input = grossInput();
    const policy: EmployerCostPolicy = {
      kind: "rate_on_gross_period",
      components: [
        {
          categoryId: "unspecified_bundle",
          rate: reduceFraction(1n, 10n),
        },
      ],
    };
    const inputSnapshot = structuredClone({
      monthlyGrossIncreaseFcfa: input.monthlyGrossIncreaseFcfa.toString(),
      periodGrossImpactFcfa: input.periodGrossImpactFcfa.toString(),
      fullYearGrossRunRateFcfa: input.fullYearGrossRunRateFcfa?.toString(),
    });
    const policySnapshot = structuredClone({
      kind: policy.kind,
      rateNum: policy.kind === "rate_on_gross_period"
        ? policy.components[0]!.rate.numerator.toString()
        : null,
    });
    calculatePeriodEmployerCost(input, policy);
    expect(input.monthlyGrossIncreaseFcfa.toString()).toBe(
      inputSnapshot.monthlyGrossIncreaseFcfa,
    );
    expect(input.periodGrossImpactFcfa.toString()).toBe(
      inputSnapshot.periodGrossImpactFcfa,
    );
    expect(input.fullYearGrossRunRateFcfa?.toString()).toBe(
      inputSnapshot.fullYearGrossRunRateFcfa,
    );
    if (policy.kind === "rate_on_gross_period") {
      expect(policy.components[0]!.rate.numerator.toString()).toBe(
        policySnapshot.rateNum,
      );
    }
  });

  it("20. politique neutre sans composant", () => {
    const result = calculatePeriodEmployerCost(grossInput(), { kind: "neutral" });
    expect(result.chargeComponents).toEqual([]);
  });

  it("21. gros montants sans perte de précision", () => {
    const big = 10n ** 18n;
    const result = calculatePeriodEmployerCost(
      grossInput({
        monthlyGrossIncreaseFcfa: big,
        periodGrossImpactFcfa: big,
        fullYearGrossRunRateFcfa: big,
      }),
      ratePolicy(reduceFraction(1n, 10n)),
    );
    expect(result.periodEmployerChargesFcfa).toBe(big / 10n);
    expect(result.periodEmployerCompleteCostFcfa).toBe(big + big / 10n);
  });

  it("22. assiette fournie consommée telle quelle, sans recalcul du prorata", () => {
    // Mensuel 20 000 et période 50 000 incohérents volontairement :
    // le module doit utiliser 50 000 comme assiette.
    const result = calculatePeriodEmployerCost(
      grossInput({
        monthlyGrossIncreaseFcfa: 20_000n,
        periodGrossImpactFcfa: 50_000n,
      }),
      ratePolicy(reduceFraction(1n, 10n)),
    );
    expect(result.chargeComponents[0]!.baseAmountFcfa).toBe(50_000n);
    expect(result.periodEmployerChargesFcfa).toBe(5_000n);
    expect(result.periodGrossImpactFcfa).toBe(50_000n);
  });
});

describe("Lot 2B-RC1-H6-A2 — aggregatePeriodEmployerCostBreakdowns", () => {
  it("14. agrégation vide", () => {
    const result = aggregatePeriodEmployerCostBreakdowns([]);
    expect(result.periodGrossImpactFcfa).toBe(0n);
    expect(result.periodEmployerChargesFcfa).toBe(0n);
    expect(result.periodEmployerCompleteCostFcfa).toBe(0n);
    expect(result.fullYearGrossRunRateFcfa).toBeNull();
    expect(result.chargeComponents).toEqual([]);
    expect(result.policyKind).toBe("neutral");
  });

  it("15. agrégation de plusieurs salariés", () => {
    const a = calculatePeriodEmployerCost(
      grossInput({
        monthlyGrossIncreaseFcfa: 10_000n,
        periodGrossImpactFcfa: 100_000n,
        fullYearGrossRunRateFcfa: 120_000n,
      }),
      ratePolicy(reduceFraction(1n, 10n)),
    );
    const b = calculatePeriodEmployerCost(
      grossInput({
        monthlyGrossIncreaseFcfa: 20_000n,
        periodGrossImpactFcfa: 200_000n,
        fullYearGrossRunRateFcfa: 240_000n,
      }),
      ratePolicy(reduceFraction(1n, 10n)),
    );
    const agg = aggregatePeriodEmployerCostBreakdowns([a, b]);
    expect(agg.monthlyGrossIncreaseFcfa).toBe(30_000n);
    expect(agg.periodGrossImpactFcfa).toBe(300_000n);
    expect(agg.periodEmployerChargesFcfa).toBe(30_000n);
    expect(agg.periodEmployerCompleteCostFcfa).toBe(330_000n);
    expect(agg.fullYearGrossRunRateFcfa).toBe(360_000n);
    expect(agg.policyKind).toBe("rate_on_gross_period");
  });

  it("16. fusion des composants compatibles", () => {
    const a = calculatePeriodEmployerCost(
      grossInput({ periodGrossImpactFcfa: 100_000n }),
      ratePolicy(reduceFraction(1n, 10n)),
    );
    const b = calculatePeriodEmployerCost(
      grossInput({ periodGrossImpactFcfa: 50_000n }),
      ratePolicy(reduceFraction(1n, 10n)),
    );
    const agg = aggregatePeriodEmployerCostBreakdowns([a, b]);
    expect(agg.chargeComponents).toHaveLength(1);
    expect(agg.chargeComponents[0]!.amountFcfa).toBe(15_000n);
    expect(agg.chargeComponents[0]!.baseAmountFcfa).toBe(150_000n);
  });

  it("17. composants de même identifiant et taux différents refusés", () => {
    const a = calculatePeriodEmployerCost(
      grossInput({ periodGrossImpactFcfa: 100_000n }),
      ratePolicy(reduceFraction(1n, 10n)),
    );
    const b = calculatePeriodEmployerCost(
      grossInput({ periodGrossImpactFcfa: 100_000n }),
      ratePolicy(reduceFraction(2n, 10n)),
    );
    expect(() => aggregatePeriodEmployerCostBreakdowns([a, b])).toThrow(
      EmployerPeriodCostError,
    );
  });

  it("18. gestion déterministe du plein effet", () => {
    const withFull = calculatePeriodEmployerCost(
      grossInput({ fullYearGrossRunRateFcfa: 100n }),
      { kind: "neutral" },
    );
    const withoutFull = calculatePeriodEmployerCost(
      {
        monthlyGrossIncreaseFcfa: 1n,
        periodGrossImpactFcfa: 1n,
      },
      { kind: "neutral" },
    );
    expect(withoutFull.fullYearGrossRunRateFcfa).toBeNull();
    const mixed = aggregatePeriodEmployerCostBreakdowns([withFull, withoutFull]);
    expect(mixed.fullYearGrossRunRateFcfa).toBeNull();

    const both = aggregatePeriodEmployerCostBreakdowns([withFull, withFull]);
    expect(both.fullYearGrossRunRateFcfa).toBe(200n);
  });

  it("politiques hétérogènes → policyKind mixed", () => {
    const neutral = calculatePeriodEmployerCost(grossInput(), { kind: "neutral" });
    const rated = calculatePeriodEmployerCost(
      grossInput({ periodGrossImpactFcfa: 10_000n }),
      ratePolicy(reduceFraction(1n, 10n)),
    );
    const agg = aggregatePeriodEmployerCostBreakdowns([neutral, rated]);
    expect(agg.policyKind).toBe("mixed");
    expect(agg.periodEmployerCompleteCostFcfa).toBe(
      agg.periodGrossImpactFcfa + agg.periodEmployerChargesFcfa,
    );
  });

  it("refuse un breakdown incohérent présenté à l’agrégateur", () => {
    const broken: PeriodEmployerCostBreakdown = {
      monthlyGrossIncreaseFcfa: 0n,
      fullYearGrossRunRateFcfa: null,
      periodGrossImpactFcfa: 100n,
      periodEmployerChargesFcfa: 10n,
      periodEmployerCompleteCostFcfa: 999n,
      chargeComponents: [],
      policyKind: "neutral",
    };
    expect(() => aggregatePeriodEmployerCostBreakdowns([broken])).toThrow(
      EmployerPeriodCostError,
    );
  });

  it("accepte sans modification un breakdown valide issu de calculatePeriodEmployerCost", () => {
    const valid = calculatePeriodEmployerCost(
      grossInput({ periodGrossImpactFcfa: 77_777n }),
      ratePolicy(reduceFraction(1n, 7n)),
    );
    const agg = aggregatePeriodEmployerCostBreakdowns([valid]);
    expect(agg.periodGrossImpactFcfa).toBe(valid.periodGrossImpactFcfa);
    expect(agg.periodEmployerChargesFcfa).toBe(valid.periodEmployerChargesFcfa);
    expect(agg.periodEmployerCompleteCostFcfa).toBe(
      valid.periodEmployerCompleteCostFcfa,
    );
    expect(agg.chargeComponents).toEqual(valid.chargeComponents);
  });

  describe("durcissement — refus des breakdowns manuels incohérents", () => {
    const rate = reduceFraction(1n, 10n);
    const validRated = (): PeriodEmployerCostBreakdown =>
      calculatePeriodEmployerCost(
        {
          monthlyGrossIncreaseFcfa: 1_000n,
          periodGrossImpactFcfa: 10_000n,
          fullYearGrossRunRateFcfa: 12_000n,
        },
        ratePolicy(rate),
      );

    function expectInvalid(broken: PeriodEmployerCostBreakdown): void {
      expect(() => aggregatePeriodEmployerCostBreakdowns([broken])).toThrow(
        EmployerPeriodCostError,
      );
    }

    it("1. periodGrossImpactFcfa négatif", () => {
      expectInvalid({
        ...validRated(),
        periodGrossImpactFcfa: -1n,
        periodEmployerCompleteCostFcfa: -1n + 1_000n,
        chargeComponents: [
          {
            categoryId: "unspecified_bundle",
            baseAmountFcfa: -1n,
            rate,
            amountFcfa: 0n,
          },
        ],
        periodEmployerChargesFcfa: 0n,
      });
    });

    it("2. periodEmployerChargesFcfa négatif", () => {
      const base = validRated();
      expectInvalid({
        ...base,
        periodEmployerChargesFcfa: -1n,
        periodEmployerCompleteCostFcfa: base.periodGrossImpactFcfa - 1n,
        chargeComponents: [
          {
            categoryId: "unspecified_bundle",
            baseAmountFcfa: base.periodGrossImpactFcfa,
            rate,
            amountFcfa: -1n,
          },
        ],
      });
    });

    it("3. periodEmployerCompleteCostFcfa négatif", () => {
      expectInvalid({
        monthlyGrossIncreaseFcfa: 0n,
        fullYearGrossRunRateFcfa: null,
        periodGrossImpactFcfa: 0n,
        periodEmployerChargesFcfa: 0n,
        periodEmployerCompleteCostFcfa: -1n,
        chargeComponents: [],
        policyKind: "neutral",
      });
    });

    it("4. monthlyGrossIncreaseFcfa négatif", () => {
      expectInvalid({
        ...validRated(),
        monthlyGrossIncreaseFcfa: -5n,
      });
    });

    it("5. fullYearGrossRunRateFcfa négatif lorsqu’il est présent", () => {
      expectInvalid({
        ...validRated(),
        fullYearGrossRunRateFcfa: -1n,
      });
    });

    it("6. baseAmountFcfa négatif", () => {
      const base = validRated();
      expectInvalid({
        ...base,
        chargeComponents: [
          {
            categoryId: "unspecified_bundle",
            baseAmountFcfa: -10n,
            rate,
            amountFcfa: base.periodEmployerChargesFcfa,
          },
        ],
      });
    });

    it("7. amountFcfa négatif", () => {
      const base = validRated();
      expectInvalid({
        ...base,
        periodEmployerChargesFcfa: -1n,
        periodEmployerCompleteCostFcfa: base.periodGrossImpactFcfa - 1n,
        chargeComponents: [
          {
            categoryId: "unspecified_bundle",
            baseAmountFcfa: base.periodGrossImpactFcfa,
            rate,
            amountFcfa: -1n,
          },
        ],
      });
    });

    it("8. baseAmountFcfa différent du brut de période", () => {
      const base = validRated();
      expectInvalid({
        ...base,
        chargeComponents: [
          {
            categoryId: "unspecified_bundle",
            baseAmountFcfa: base.periodGrossImpactFcfa + 1n,
            rate,
            amountFcfa: base.periodEmployerChargesFcfa,
          },
        ],
      });
    });

    it("9. amountFcfa incompatible avec assiette, taux et arrondi", () => {
      const base = validRated();
      expectInvalid({
        ...base,
        periodEmployerChargesFcfa: base.periodEmployerChargesFcfa + 1n,
        periodEmployerCompleteCostFcfa:
          base.periodGrossImpactFcfa + base.periodEmployerChargesFcfa + 1n,
        chargeComponents: [
          {
            categoryId: "unspecified_bundle",
            baseAmountFcfa: base.periodGrossImpactFcfa,
            rate,
            amountFcfa: base.periodEmployerChargesFcfa + 1n,
          },
        ],
      });
    });

    it("10. taux de composante négatif dans un breakdown manuel", () => {
      const base = validRated();
      expectInvalid({
        ...base,
        chargeComponents: [
          {
            categoryId: "unspecified_bundle",
            baseAmountFcfa: base.periodGrossImpactFcfa,
            rate: reduceFraction(-1n, 10n),
            amountFcfa: base.periodEmployerChargesFcfa,
          },
        ],
      });
    });

    it("11. catégorie runtime inconnue (cast de défense en profondeur)", () => {
      const base = validRated();
      expectInvalid({
        ...base,
        chargeComponents: [
          {
            categoryId: "cnss_invented" as PeriodEmployerCostBreakdown["chargeComponents"][number]["categoryId"],
            baseAmountFcfa: base.periodGrossImpactFcfa,
            rate,
            amountFcfa: base.periodEmployerChargesFcfa,
          },
        ],
      });
    });

    it("agrégation half-up : Σ round ≠ round(Σ) reste acceptée en sortie", () => {
      // Chaque ligne : 1 × 1/2 → 1 ; agrégat base 2, amounts 2 (≠ round(1)=1)
      const row = (full: bigint | null): PeriodEmployerCostBreakdown =>
        calculatePeriodEmployerCost(
          {
            monthlyGrossIncreaseFcfa: 0n,
            periodGrossImpactFcfa: 1n,
            ...(full === null
              ? {}
              : { fullYearGrossRunRateFcfa: full }),
          },
          ratePolicy(reduceFraction(1n, 2n)),
        );
      const a = row(null);
      const b = row(null);
      expect(a.periodEmployerChargesFcfa).toBe(1n);
      const agg = aggregatePeriodEmployerCostBreakdowns([a, b]);
      expect(agg.periodGrossImpactFcfa).toBe(2n);
      expect(agg.periodEmployerChargesFcfa).toBe(2n);
      expect(agg.chargeComponents[0]!.amountFcfa).toBe(2n);
    });
  });

  describe("validation runtime de policyKind", () => {
    it("refuse une ligne dont policyKind est inconnu (cast)", () => {
      const valid = calculatePeriodEmployerCost(grossInput(), { kind: "neutral" });
      const broken: PeriodEmployerCostBreakdown = {
        ...valid,
        policyKind: "unknown_kind" as PeriodEmployerCostBreakdown["policyKind"],
      };
      try {
        aggregatePeriodEmployerCostBreakdowns([broken]);
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(EmployerPeriodCostError);
        expect((error as EmployerPeriodCostError).code).toBe(
          "UNSUPPORTED_EMPLOYER_COST_POLICY",
        );
        expect((error as EmployerPeriodCostError).message).toMatch(
          /policyKind/,
        );
      }
    });

    it("accepte un breakdown agrégé mixed comme ligne d’une nouvelle agrégation", () => {
      // mixed « naturel » (neutral + rated) ne satisfait pas baseAmount === brut
      // en mode strict ; on utilise un mixed synthétique cohérent avec tous
      // les invariants de ligne source.
      const rate = reduceFraction(1n, 10n);
      const mixedSource: PeriodEmployerCostBreakdown = {
        monthlyGrossIncreaseFcfa: 1_000n,
        fullYearGrossRunRateFcfa: null,
        periodGrossImpactFcfa: 10_000n,
        periodEmployerChargesFcfa: 1_000n,
        periodEmployerCompleteCostFcfa: 11_000n,
        chargeComponents: [
          {
            categoryId: "unspecified_bundle",
            baseAmountFcfa: 10_000n,
            rate,
            amountFcfa: 1_000n,
          },
        ],
        policyKind: "mixed",
      };
      const again = aggregatePeriodEmployerCostBreakdowns([mixedSource]);
      expect(again.policyKind).toBe("mixed");
      expect(again.periodGrossImpactFcfa).toBe(10_000n);
      expect(again.periodEmployerChargesFcfa).toBe(1_000n);
      expect(again.periodEmployerCompleteCostFcfa).toBe(11_000n);
    });

    it("conserve policyKind homogène neutral et rate_on_gross_period", () => {
      const neutral = calculatePeriodEmployerCost(grossInput(), {
        kind: "neutral",
      });
      const rated = calculatePeriodEmployerCost(
        grossInput({ periodGrossImpactFcfa: 50_000n }),
        ratePolicy(reduceFraction(1n, 10n)),
      );
      expect(
        aggregatePeriodEmployerCostBreakdowns([neutral, neutral]).policyKind,
      ).toBe("neutral");
      expect(
        aggregatePeriodEmployerCostBreakdowns([rated, rated]).policyKind,
      ).toBe("rate_on_gross_period");
    });
  });
});
