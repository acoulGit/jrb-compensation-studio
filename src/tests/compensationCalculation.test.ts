import { describe, expect, it } from "vitest";
import {
  DEFAULT_NINE_BOX_FACTORS,
  DEFAULT_PERFORMANCE_FACTORS,
  DEFAULT_POTENTIAL_FACTORS,
  DEFAULT_SALARY_POSITIONS,
} from "../domain/compensationReference/defaults";
import type { NineBoxOrientation } from "../domain/compensationReference/models";
import {
  calculateIndividualMatrixWeight,
  CompensationCalculationError,
  computeDisplayRatioBasisPoints,
  EVALUATION_FACTOR_SCALE,
  formatRatioBpsForDisplay,
  INDIVIDUAL_WEIGHT_SCALE,
  resolveEvaluationFactor,
  resolveSalaryPosition,
  type LevelFactorRef,
  type NineBoxFactorRef,
  type SalaryPositionInputRow,
} from "../domain/compensationCalculation";

const S0 = 1_000_000;

function defaultPositions(): SalaryPositionInputRow[] {
  return DEFAULT_SALARY_POSITIONS.map((position) => ({
    code: position.code,
    label: position.label,
    referenceRatioBps: position.referenceRatioBps,
    positionFactorMilli: position.positionFactorMilli,
  }));
}

function shuffledPositions(): SalaryPositionInputRow[] {
  const positions = defaultPositions();
  // Mélange déterministe (Fisher-Yates avec seed fixe).
  let seed = 42;
  for (let index = positions.length - 1; index > 0; index -= 1) {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    const j = seed % (index + 1);
    const tmp = positions[index];
    positions[index] = positions[j];
    positions[j] = tmp;
  }
  return positions;
}

function defaultPerformance(): LevelFactorRef[] {
  return DEFAULT_PERFORMANCE_FACTORS.map((factor) => ({
    level: factor.level,
    factorMilli: factor.factorMilli,
  }));
}

function defaultPotential(): LevelFactorRef[] {
  return DEFAULT_POTENTIAL_FACTORS.map((factor) => ({
    level: factor.level,
    factorMilli: factor.factorMilli,
  }));
}

function defaultNineBox(): NineBoxFactorRef[] {
  return DEFAULT_NINE_BOX_FACTORS.map((factor) => ({
    performanceLevel: factor.performanceLevel,
    potentialLevel: factor.potentialLevel,
    factorMilli: factor.factorMilli,
    boxCode: factor.boxCode,
  }));
}

function expectErrorCode(run: () => void, code: string): void {
  try {
    run();
    expect.fail(`Expected error ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(CompensationCalculationError);
    expect((error as CompensationCalculationError).code).toBe(code);
  }
}

/** Salaire exact pour un ratio en bps donné (S0 fixe). */
function salaryAtBps(ratioBps: number, s0 = S0): number {
  return Math.round((s0 * ratioBps) / 10_000);
}

describe("Lot 2A-2 — position salariale", () => {
  it("résout les 17 positions aux ancres exactes", () => {
    const positions = defaultPositions();
    const expected: Array<{ code: string; salary: number }> = [
      { code: "Sout-", salary: salaryAtBps(6499) },
      { code: "S7-", salary: salaryAtBps(6500) },
      { code: "S6-", salary: salaryAtBps(7000) },
      { code: "S5-", salary: salaryAtBps(7500) },
      { code: "S4-", salary: salaryAtBps(8000) },
      { code: "S3-", salary: salaryAtBps(8500) },
      { code: "S2-", salary: salaryAtBps(9000) },
      { code: "S1-", salary: salaryAtBps(9500) },
      { code: "S0", salary: salaryAtBps(10_000) },
      { code: "S1+", salary: salaryAtBps(10_500) },
      { code: "S2+", salary: salaryAtBps(11_000) },
      { code: "S3+", salary: salaryAtBps(11_500) },
      { code: "S4+", salary: salaryAtBps(12_000) },
      { code: "S5+", salary: salaryAtBps(12_500) },
      { code: "S6+", salary: salaryAtBps(13_000) },
      { code: "S7+", salary: salaryAtBps(13_500) },
      { code: "Sout+", salary: salaryAtBps(13_501) },
    ];

    for (const item of expected) {
      const result = resolveSalaryPosition({
        salaryFcfa: item.salary,
        s0Fcfa: S0,
        salaryPositions: positions,
      });
      expect(result.positionCode).toBe(item.code);
    }
  });

  it("teste chaque mi-chemin et les voisinages juste en dessous / au-dessus", () => {
    const positions = defaultPositions();
    const anchors = [6500, 7000, 7500, 8000, 8500, 9000, 9500, 10_000, 10_500, 11_000, 11_500, 12_000, 12_500, 13_000, 13_500];

    for (let index = 0; index < anchors.length - 1; index += 1) {
      const low = anchors[index];
      const high = anchors[index + 1];
      const mid = (low + high) / 2;
      expect(Number.isInteger(mid)).toBe(true);

      const lowCode = positions.find((p) => p.referenceRatioBps === low)!.code;
      const highCode = positions.find((p) => p.referenceRatioBps === high)!.code;

      // Mi-chemin → ratio supérieur.
      expect(
        resolveSalaryPosition({
          salaryFcfa: salaryAtBps(mid),
          s0Fcfa: S0,
          salaryPositions: positions,
        }).positionCode,
      ).toBe(highCode);

      // Juste en dessous du mi-chemin → ancre basse.
      expect(
        resolveSalaryPosition({
          salaryFcfa: salaryAtBps(mid - 1),
          s0Fcfa: S0,
          salaryPositions: positions,
        }).positionCode,
      ).toBe(lowCode);

      // Juste au-dessus du mi-chemin → ancre haute.
      expect(
        resolveSalaryPosition({
          salaryFcfa: salaryAtBps(mid + 1),
          s0Fcfa: S0,
          salaryPositions: positions,
        }).positionCode,
      ).toBe(highCode);
    }
  });

  it("applique Sout- et Sout+ aux bornes strictes 65 % / 135 %", () => {
    const positions = defaultPositions();
    expect(
      resolveSalaryPosition({
        salaryFcfa: salaryAtBps(6499),
        s0Fcfa: S0,
        salaryPositions: positions,
      }).positionCode,
    ).toBe("Sout-");
    expect(
      resolveSalaryPosition({
        salaryFcfa: salaryAtBps(6500),
        s0Fcfa: S0,
        salaryPositions: positions,
      }).positionCode,
    ).toBe("S7-");
    expect(
      resolveSalaryPosition({
        salaryFcfa: salaryAtBps(13_500),
        s0Fcfa: S0,
        salaryPositions: positions,
      }).positionCode,
    ).toBe("S7+");
    expect(
      resolveSalaryPosition({
        salaryFcfa: salaryAtBps(13_501),
        s0Fcfa: S0,
        salaryPositions: positions,
      }).positionCode,
    ).toBe("Sout+");
  });

  it("classe 132,5 % à 135 % inclus en S7+", () => {
    const positions = defaultPositions();
    // 132,5 % = mi-chemin S6+ (130) / S7+ (135) → supérieur = S7+
    expect(
      resolveSalaryPosition({
        salaryFcfa: salaryAtBps(13_250),
        s0Fcfa: S0,
        salaryPositions: positions,
      }).positionCode,
    ).toBe("S7+");
    expect(
      resolveSalaryPosition({
        salaryFcfa: salaryAtBps(13_500),
        s0Fcfa: S0,
        salaryPositions: positions,
      }).positionCode,
    ).toBe("S7+");
  });

  it("est indépendant de l’ordre du référentiel", () => {
    const result = resolveSalaryPosition({
      salaryFcfa: salaryAtBps(10_000),
      s0Fcfa: S0,
      salaryPositions: shuffledPositions(),
    });
    expect(result.positionCode).toBe("S0");
    expect(result.positionFactorMilli).toBe(900);
  });

  it("rejette les doublons et seuils incohérents", () => {
    const positions = defaultPositions();
    expectErrorCode(
      () =>
        resolveSalaryPosition({
          salaryFcfa: S0,
          s0Fcfa: S0,
          salaryPositions: [...positions, { ...positions[1] }],
        }),
      "DUPLICATE_POSITION",
    );

    const broken = defaultPositions().map((position) =>
      position.code === "S6-"
        ? { ...position, referenceRatioBps: 6500 }
        : position,
    );
    expectErrorCode(
      () =>
        resolveSalaryPosition({
          salaryFcfa: S0,
          s0Fcfa: S0,
          salaryPositions: broken,
        }),
      "DUPLICATE_POSITION",
    );

    expectErrorCode(
      () =>
        resolveSalaryPosition({
          salaryFcfa: S0,
          s0Fcfa: S0,
          salaryPositions: [],
        }),
      "EMPTY_POSITION_REFERENCE",
    );
  });

  it("rejette salaire et S0 invalides", () => {
    const positions = defaultPositions();
    expectErrorCode(
      () =>
        resolveSalaryPosition({
          salaryFcfa: 0,
          s0Fcfa: S0,
          salaryPositions: positions,
        }),
      "INVALID_SALARY",
    );
    expectErrorCode(
      () =>
        resolveSalaryPosition({
          salaryFcfa: -1,
          s0Fcfa: S0,
          salaryPositions: positions,
        }),
      "INVALID_SALARY",
    );
    expectErrorCode(
      () =>
        resolveSalaryPosition({
          salaryFcfa: S0,
          s0Fcfa: 0,
          salaryPositions: positions,
        }),
      "INVALID_S0",
    );
  });

  it("calcule le ratio affiché en bps half-up sans l’utiliser pour classer", () => {
    // 1/3 ≈ 3333,333… → half-up 3333 ; 1/6 ≈ 1666,666… → 1667
    expect(computeDisplayRatioBasisPoints(1, 3)).toBe(3333);
    expect(computeDisplayRatioBasisPoints(1, 6)).toBe(1667);
    expect(formatRatioBpsForDisplay(6500)).toBe("65,00 %");
    expect(formatRatioBpsForDisplay(13_250)).toBe("132,50 %");

    // Gros montants : pas de perte Number
    const bigS0 = 9_000_000_000_000;
    const bigSalary = 5_850_000_000_000; // 65 %
    const result = resolveSalaryPosition({
      salaryFcfa: bigSalary,
      s0Fcfa: bigS0,
      salaryPositions: defaultPositions(),
    });
    expect(result.positionCode).toBe("S7-");
    expect(result.ratioBasisPoints).toBe(6500);
  });
});

describe("Lot 2A-2 — facteur d’évaluation", () => {
  it("applique les quatre modes avec l’échelle 1 000 000", () => {
    const none = resolveEvaluationFactor({
      mode: "none",
      performanceFactors: defaultPerformance(),
      potentialFactors: defaultPotential(),
      nineBoxFactors: defaultNineBox(),
    });
    expect(none.exactFactorNumerator).toBe(1_000_000);
    expect(none.exactFactorScale).toBe(EVALUATION_FACTOR_SCALE);

    const perf = resolveEvaluationFactor({
      mode: "performance_only",
      performanceLevel: "high",
      performanceFactors: defaultPerformance(),
      potentialFactors: defaultPotential(),
      nineBoxFactors: defaultNineBox(),
    });
    expect(perf.exactFactorNumerator).toBe(1250 * 1000);

    const nine = resolveEvaluationFactor({
      mode: "full_nine_box",
      performanceLevel: "high",
      potentialLevel: "medium",
      performanceFactors: defaultPerformance(),
      potentialFactors: defaultPotential(),
      nineBoxFactors: defaultNineBox(),
    });
    expect(nine.exactFactorNumerator).toBe(1250 * 1000);
    expect(nine.selectedFactors.nineBoxCode).toBe(6);

    const product = resolveEvaluationFactor({
      mode: "performance_potential",
      performanceLevel: "high",
      potentialLevel: "high",
      performanceFactors: defaultPerformance(),
      potentialFactors: defaultPotential(),
      nineBoxFactors: defaultNineBox(),
    });
    expect(product.exactFactorNumerator).toBe(1250 * 1050);
  });

  it("couvre les neuf couples 9-Box et ignore boxCode / orientation", () => {
    const factors = defaultNineBox();
    for (const factor of factors) {
      const result = resolveEvaluationFactor({
        mode: "full_nine_box",
        performanceLevel: factor.performanceLevel,
        potentialLevel: factor.potentialLevel,
        performanceFactors: defaultPerformance(),
        potentialFactors: defaultPotential(),
        nineBoxFactors: factors.map((item) => ({
          ...item,
          boxCode: (item.boxCode ?? 0) + 100,
        })),
      });
      expect(result.exactFactorNumerator).toBe(factor.factorMilli * 1000);
    }

    const orientations: NineBoxOrientation[] = [
      "performance_rows_potential_columns",
      "performance_columns_potential_rows",
    ];
    for (const _orientation of orientations) {
      const result = resolveEvaluationFactor({
        mode: "full_nine_box",
        performanceLevel: "low",
        potentialLevel: "low",
        performanceFactors: defaultPerformance(),
        potentialFactors: defaultPotential(),
        nineBoxFactors: factors,
      });
      expect(result.exactFactorNumerator).toBe(200 * 1000);
    }
  });

  it("signale niveaux manquants, facteurs absents et doublons", () => {
    expectErrorCode(
      () =>
        resolveEvaluationFactor({
          mode: "performance_only",
          performanceFactors: defaultPerformance(),
          potentialFactors: defaultPotential(),
          nineBoxFactors: defaultNineBox(),
        }),
      "MISSING_PERFORMANCE_LEVEL",
    );
    expectErrorCode(
      () =>
        resolveEvaluationFactor({
          mode: "full_nine_box",
          performanceLevel: "high",
          performanceFactors: defaultPerformance(),
          potentialFactors: defaultPotential(),
          nineBoxFactors: defaultNineBox(),
        }),
      "MISSING_POTENTIAL_LEVEL",
    );
    expectErrorCode(
      () =>
        resolveEvaluationFactor({
          mode: "performance_only",
          performanceLevel: "high",
          performanceFactors: [{ level: "low", factorMilli: 250 }],
          potentialFactors: defaultPotential(),
          nineBoxFactors: defaultNineBox(),
        }),
      "FACTOR_NOT_FOUND",
    );
    expectErrorCode(
      () =>
        resolveEvaluationFactor({
          mode: "performance_only",
          performanceLevel: "low",
          performanceFactors: [
            { level: "low", factorMilli: 250 },
            { level: "low", factorMilli: 300 },
          ],
          potentialFactors: defaultPotential(),
          nineBoxFactors: defaultNineBox(),
        }),
      "DUPLICATE_FACTOR",
    );
  });

  it("accepte des référentiels personnalisés différents des défauts", () => {
    const result = resolveEvaluationFactor({
      mode: "performance_potential",
      performanceLevel: "medium",
      potentialLevel: "low",
      performanceFactors: [
        { level: "low", factorMilli: 100 },
        { level: "medium", factorMilli: 2000 },
        { level: "high", factorMilli: 3000 },
      ],
      potentialFactors: [
        { level: "low", factorMilli: 500 },
        { level: "medium", factorMilli: 700 },
        { level: "high", factorMilli: 900 },
      ],
      nineBoxFactors: defaultNineBox(),
    });
    expect(result.exactFactorNumerator).toBe(2000 * 500);
  });
});

describe("Lot 2A-2 — poids individuel", () => {
  it("calcule le poids composite exact sans arrondi prématuré", () => {
    const result = calculateIndividualMatrixWeight({
      salaryFcfa: salaryAtBps(6500),
      s0Fcfa: S0,
      salaryPositions: defaultPositions(),
      mode: "performance_only",
      performanceLevel: "high",
      performanceFactors: defaultPerformance(),
      potentialFactors: defaultPotential(),
      nineBoxFactors: defaultNineBox(),
    });
    // Sout-? 65% = S7- factor 1250 ; eval = 1250*1000
    expect(result.salaryPosition.positionCode).toBe("S7-");
    expect(result.salaryPosition.positionFactorMilli).toBe(1250);
    expect(result.evaluationFactor.exactFactorNumerator).toBe(1_250_000);
    expect(result.exactWeightNumerator).toBe(1250n * 1_250_000n);
    expect(result.exactWeightScale).toBe(INDIVIDUAL_WEIGHT_SCALE);
    expect(result.isZero).toBe(false);
  });

  it("produit le même résultat pour les mêmes entrées (déterminisme)", () => {
    const input = {
      salaryFcfa: 1_234_567,
      s0Fcfa: S0,
      salaryPositions: shuffledPositions(),
      mode: "performance_potential" as const,
      performanceLevel: "medium" as const,
      potentialLevel: "high" as const,
      performanceFactors: defaultPerformance(),
      potentialFactors: defaultPotential(),
      nineBoxFactors: defaultNineBox(),
    };
    const first = calculateIndividualMatrixWeight(input);
    const second = calculateIndividualMatrixWeight(input);
    expect(first).toEqual(second);
  });

  it("applique le blocage sous-performant confirmé", () => {
    const result = calculateIndividualMatrixWeight({
      salaryFcfa: salaryAtBps(10_000),
      s0Fcfa: S0,
      salaryPositions: defaultPositions(),
      mode: "full_nine_box",
      performanceLevel: "high",
      potentialLevel: "high",
      performanceFactors: defaultPerformance(),
      potentialFactors: defaultPotential(),
      nineBoxFactors: defaultNineBox(),
      confirmedUnderperformer: true,
    });
    expect(result.theoreticalWeightNumerator).toBe(900n * 1_400_000n);
    expect(result.exactWeightNumerator).toBe(0n);
    expect(result.isZero).toBe(true);
    expect(result.blockingReason).toBe("CONFIRMED_UNDERPERFORMER");
    expect(
      result.explanationSteps.some(
        (step) => step.code === "CONFIRMED_UNDERPERFORMER_BLOCK",
      ),
    ).toBe(true);
  });

  it("exige encore les données du mode pour un sous-performant", () => {
    expectErrorCode(
      () =>
        calculateIndividualMatrixWeight({
          salaryFcfa: salaryAtBps(10_000),
          s0Fcfa: S0,
          salaryPositions: defaultPositions(),
          mode: "performance_only",
          performanceFactors: defaultPerformance(),
          potentialFactors: defaultPotential(),
          nineBoxFactors: defaultNineBox(),
          confirmedUnderperformer: true,
        }),
      "MISSING_PERFORMANCE_LEVEL",
    );
  });

  it("fournit une trace explicative complète", () => {
    const result = calculateIndividualMatrixWeight({
      salaryFcfa: salaryAtBps(10_000),
      s0Fcfa: S0,
      salaryPositions: defaultPositions(),
      mode: "none",
      performanceFactors: defaultPerformance(),
      potentialFactors: defaultPotential(),
      nineBoxFactors: defaultNineBox(),
    });
    const codes = result.explanationSteps.map((step) => step.code);
    expect(codes).toContain("INPUT_SALARY_S0");
    expect(codes).toContain("DISPLAY_RATIO_BPS");
    expect(codes).toContain("POSITION_FACTOR");
    expect(codes).toContain("EVALUATION_NEUTRAL");
    expect(codes).toContain("INDIVIDUAL_WEIGHT_THEORETICAL");
    expect(codes).toContain("INDIVIDUAL_WEIGHT_EFFECTIVE");
  });

  it("reste exact avec de très gros montants", () => {
    const s0 = 8_000_000_000_000;
    const salary = 8_000_000_000_000; // 100 %
    const result = calculateIndividualMatrixWeight({
      salaryFcfa: salary,
      s0Fcfa: s0,
      salaryPositions: defaultPositions().map((position) =>
        position.code === "S0"
          ? { ...position, positionFactorMilli: 9999 }
          : position,
      ),
      mode: "performance_potential",
      performanceLevel: "high",
      potentialLevel: "high",
      performanceFactors: [
        { level: "low", factorMilli: 1 },
        { level: "medium", factorMilli: 1 },
        { level: "high", factorMilli: 9999 },
      ],
      potentialFactors: [
        { level: "low", factorMilli: 1 },
        { level: "medium", factorMilli: 1 },
        { level: "high", factorMilli: 9999 },
      ],
      nineBoxFactors: defaultNineBox(),
    });
    expect(result.salaryPosition.positionCode).toBe("S0");
    expect(result.exactWeightNumerator).toBe(9999n * (9999n * 9999n));
  });
});
