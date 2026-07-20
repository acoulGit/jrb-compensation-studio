/**
 * Tests de formatage d’affichage H1 (max 2 décimales) — sans mutation métier.
 */

import { describe, expect, it } from "vitest";
import {
  formatExactAmountAsFcfa,
  formatExactRateAsPercent,
  formatFcfaInteger,
} from "../application/campaignSimulation/formatExactBudgetDisplay";
import { reduceFraction } from "../domain/compensationCalculation";

describe("formatExactRateAsPercent — affichage 2 décimales", () => {
  it("arrondit 5,8045… % en 5,80 %", () => {
    // 5,8045 % du salaire = fraction 0,058045 = 58045/1_000_000
    const rate = reduceFraction(58_045n, 1_000_000n);
    expect(formatExactRateAsPercent(rate)).toBe("5,80 %");
  });

  it("affiche toujours 2 décimales pour un taux exact", () => {
    expect(formatExactRateAsPercent({ numerator: 1n, denominator: 20n })).toBe(
      "5,00 %",
    );
  });

  it("conserve le signe négatif", () => {
    expect(
      formatExactRateAsPercent({ numerator: -58n, denominator: 1000n }),
    ).toBe("-5,80 %");
  });

  it("ne mute pas la fraction source", () => {
    const rate = { numerator: 31112192n, denominator: 5360000000n };
    const before = structuredClone(rate);
    formatExactRateAsPercent(rate);
    expect(rate).toEqual(before);
  });
});

describe("formatExactAmountAsFcfa — affichage max 2 décimales", () => {
  it("arrondit 373346,306… en 373 346,31 FCFA", () => {
    // Approximation d’une allocation annuelle non entière
    const amount = reduceFraction(373_346_306_779n, 1_000_000n);
    expect(formatExactAmountAsFcfa(amount)).toBe("373\u202F346,31 FCFA");
  });

  it("arrondit 31112,192… en 31 112,19 FCFA", () => {
    const amount = reduceFraction(31_112_192n, 1_000n);
    expect(formatExactAmountAsFcfa(amount)).toBe("31\u202F112,19 FCFA");
  });

  it("affiche un entier sans décimales inutiles", () => {
    expect(
      formatExactAmountAsFcfa({ numerator: 25_000_003n, denominator: 1n }),
    ).toBe("25\u202F000\u202F003 FCFA");
    expect(
      formatExactAmountAsFcfa({ numerator: 100n, denominator: 1n }),
    ).toBe("100 FCFA");
  });

  it("conserve exactement 2 décimales déjà exactes", () => {
    expect(
      formatExactAmountAsFcfa(reduceFraction(12_029_904n, 100n)),
    ).toBe("120\u202F299,04 FCFA");
  });

  it("affiche un écart négatif correctement", () => {
    expect(
      formatExactAmountAsFcfa({ numerator: -403n, denominator: 1n }),
    ).toBe("-403 FCFA");
    expect(
      formatExactAmountAsFcfa(reduceFraction(-412n, 100n)),
    ).toBe("-4,12 FCFA");
  });

  it("ne mute pas la fraction source", () => {
    const amount = { numerator: 373_346_306_779n, denominator: 1_000_000n };
    const before = structuredClone(amount);
    formatExactAmountAsFcfa(amount);
    expect(amount).toEqual(before);
  });

  it("n’utilise pas Number pour les grands montants", () => {
    const huge = {
      numerator: 9_000_000_000_000n,
      denominator: 1n,
    };
    expect(formatExactAmountAsFcfa(huge)).toBe("9\u202F000\u202F000\u202F000\u202F000 FCFA");
    expect(typeof huge.numerator).toBe("bigint");
  });
});

describe("formatFcfaInteger — montants finaux et salaires", () => {
  it("affiche 31 110 FCFA", () => {
    expect(formatFcfaInteger(31_110n)).toBe("31\u202F110 FCFA");
  });

  it("affiche 567 110 FCFA", () => {
    expect(formatFcfaInteger(567_110n)).toBe("567\u202F110 FCFA");
  });

  it("affiche un négatif", () => {
    expect(formatFcfaInteger(-5n)).toBe("-5 FCFA");
  });
});
