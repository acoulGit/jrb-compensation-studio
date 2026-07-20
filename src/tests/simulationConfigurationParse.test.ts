import { describe, expect, it } from "vitest";
import {
  formatExactAmountAsFcfa,
  parseBudgetRatePercentToBps,
  parseNonNegativeFcfaAmount,
  parseRoundingStepFcfa,
} from "../application/campaignSimulation";
import { resolveBudgetTarget } from "../domain/compensationCalculation";

describe("Lot 2B-2 — parse montants FCFA", () => {
  const opts = {
    missingCode: "MISSING_MANUAL_BUDGET" as const,
    invalidCode: "INVALID_MANUAL_BUDGET" as const,
    fieldLabel: "Budget cible",
  };

  it("accepte un entier simple", () => {
    const result = parseNonNegativeFcfaAmount("25000003", opts);
    expect(result).toEqual({ ok: true, value: 25_000_003n });
  });

  it("accepte les espaces simples", () => {
    const result = parseNonNegativeFcfaAmount("25 000 003", opts);
    expect(result).toEqual({ ok: true, value: 25_000_003n });
  });

  it("accepte l’espace insécable", () => {
    const result = parseNonNegativeFcfaAmount("25\u00A0000\u00A0003", opts);
    expect(result).toEqual({ ok: true, value: 25_000_003n });
  });

  it("accepte zéro", () => {
    expect(parseNonNegativeFcfaAmount("0", opts)).toEqual({
      ok: true,
      value: 0n,
    });
  });

  it("rejette un négatif", () => {
    const result = parseNonNegativeFcfaAmount("-1", opts);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_MANUAL_BUDGET");
  });

  it("rejette une décimale", () => {
    const result = parseNonNegativeFcfaAmount("10,5", opts);
    expect(result.ok).toBe(false);
  });

  it("rejette du texte", () => {
    const result = parseNonNegativeFcfaAmount("abc", opts);
    expect(result.ok).toBe(false);
  });

  it("rejette une chaîne vide", () => {
    const result = parseNonNegativeFcfaAmount("  ", opts);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("MISSING_MANUAL_BUDGET");
  });

  it("conserve un montant supérieur à Number.MAX_SAFE_INTEGER", () => {
    const raw = "9007199254740993";
    const result = parseNonNegativeFcfaAmount(raw, opts);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(9007199254740993n);
      expect(result.value > BigInt(Number.MAX_SAFE_INTEGER)).toBe(true);
    }
  });

  it("n’utilise pas Number (aucune perte BigInt)", () => {
    const result = parseNonNegativeFcfaAmount("12345678901234567890", opts);
    expect(result).toEqual({ ok: true, value: 12345678901234567890n });
  });
});

describe("Lot 2B-2 — parse taux % → bps", () => {
  it("convertit 4 % → 400 bps", () => {
    expect(parseBudgetRatePercentToBps("4")).toEqual({
      ok: true,
      value: 400n,
    });
  });

  it("convertit 4,5 % → 450 bps", () => {
    expect(parseBudgetRatePercentToBps("4,5")).toEqual({
      ok: true,
      value: 450n,
    });
  });

  it("convertit 4.50 % → 450 bps", () => {
    expect(parseBudgetRatePercentToBps("4.50")).toEqual({
      ok: true,
      value: 450n,
    });
  });

  it("convertit 4,25 % → 425 bps", () => {
    expect(parseBudgetRatePercentToBps("4,25")).toEqual({
      ok: true,
      value: 425n,
    });
  });

  it("accepte zéro", () => {
    expect(parseBudgetRatePercentToBps("0")).toEqual({ ok: true, value: 0n });
  });

  it("rejette un négatif", () => {
    const result = parseBudgetRatePercentToBps("-1");
    expect(result.ok).toBe(false);
  });

  it("rejette plus de deux décimales", () => {
    const result = parseBudgetRatePercentToBps("4,257");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_BUDGET_RATE");
  });

  it("rejette des séparateurs multiples", () => {
    expect(parseBudgetRatePercentToBps("4,2.5").ok).toBe(false);
  });

  it("rejette du texte", () => {
    expect(parseBudgetRatePercentToBps("quatre").ok).toBe(false);
  });

  it("n’utilise pas de flottant", () => {
    const result = parseBudgetRatePercentToBps("1,10");
    expect(result).toEqual({ ok: true, value: 110n });
  });
});

describe("Lot 2B-2 — parse pas d’arrondi", () => {
  it.each(["1", "5", "100", "1 000"])("accepte %s", (raw) => {
    const result = parseRoundingStepFcfa(raw);
    expect(result.ok).toBe(true);
  });

  it("accepte un pas personnalisé positif", () => {
    expect(parseRoundingStepFcfa("250")).toEqual({ ok: true, value: 250n });
  });

  it("rejette zéro", () => {
    expect(parseRoundingStepFcfa("0").ok).toBe(false);
  });

  it("rejette un négatif", () => {
    expect(parseRoundingStepFcfa("-5").ok).toBe(false);
  });

  it("rejette une décimale", () => {
    expect(parseRoundingStepFcfa("5,5").ok).toBe(false);
  });
});

describe("Lot 2B-2 — budget exact sans arrondi", () => {
  it("conserve un montant manuel non divisible par le pas", () => {
    const resolved = resolveBudgetTarget({
      mode: "manual_amount",
      manualBudgetFcfa: 25_000_003n,
    });
    expect(formatExactAmountAsFcfa(resolved.exactAmount)).toBe(
      "25\u202F000\u202F003 FCFA",
    );
  });

  it("affiche un budget fractionnaire sans arrondi", () => {
    const resolved = resolveBudgetTarget({
      mode: "percentage_of_eligible_payroll",
      eligiblePayrollFcfa: 250_623n,
      budgetRateBasisPoints: 400n,
    });
    expect(formatExactAmountAsFcfa(resolved.exactAmount)).toBe(
      "10\u202F024,92 FCFA",
    );
  });
});
