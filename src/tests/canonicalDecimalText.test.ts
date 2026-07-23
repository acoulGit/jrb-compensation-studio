import { describe, expect, it } from "vitest";
import {
  bigintToCanonicalText,
  exactAmountToCanonicalTexts,
  isCanonicalIntegerText,
  isCanonicalPositiveDenominatorText,
  parseCanonicalExactAmount,
  parseCanonicalIntegerText,
} from "../application/campaignSimulation/canonicalDecimalText";

describe("canonicalDecimalText", () => {
  describe("isCanonicalIntegerText", () => {
    it("rejects +, leading zeros, -0, and empty", () => {
      expect(isCanonicalIntegerText("+1")).toBe(false);
      expect(isCanonicalIntegerText("+0")).toBe(false);
      expect(isCanonicalIntegerText("01")).toBe(false);
      expect(isCanonicalIntegerText("00")).toBe(false);
      expect(isCanonicalIntegerText("-0", { allowNegative: true })).toBe(false);
      expect(isCanonicalIntegerText("")).toBe(false);
      expect(isCanonicalIntegerText("-", { allowNegative: true })).toBe(false);
    });

    it("accepts 0, 25000003, and -3 when negatives allowed", () => {
      expect(isCanonicalIntegerText("0")).toBe(true);
      expect(isCanonicalIntegerText("25000003")).toBe(true);
      expect(isCanonicalIntegerText("-3", { allowNegative: true })).toBe(true);
      expect(isCanonicalIntegerText("-3")).toBe(false);
    });
  });

  describe("isCanonicalPositiveDenominatorText", () => {
    it("rejects 0 and negatives", () => {
      expect(isCanonicalPositiveDenominatorText("0")).toBe(false);
      expect(isCanonicalPositiveDenominatorText("-1")).toBe(false);
      expect(isCanonicalPositiveDenominatorText("1")).toBe(true);
      expect(isCanonicalPositiveDenominatorText("40")).toBe(true);
    });
  });

  describe("bigintToCanonicalText / parseCanonicalIntegerText", () => {
    it("round-trips large BigInt values", () => {
      const large = 9000000000000n;
      const text = bigintToCanonicalText(large);
      expect(text).toBe("9000000000000");
      expect(parseCanonicalIntegerText(text)).toBe(large);

      const negative = -25000003n;
      const negativeText = bigintToCanonicalText(negative);
      expect(negativeText).toBe("-25000003");
      expect(
        parseCanonicalIntegerText(negativeText, { allowNegative: true }),
      ).toBe(negative);
    });
  });

  describe("exactAmountToCanonicalTexts / parseCanonicalExactAmount", () => {
    it("round-trips exact amounts including negative numerators", () => {
      const amount = { numerator: 25000003n, denominator: 40n };
      const texts = exactAmountToCanonicalTexts(amount);
      expect(texts).toEqual({
        numeratorText: "25000003",
        denominatorText: "40",
      });
      expect(parseCanonicalExactAmount(texts)).toEqual(amount);

      const delta = { numerator: -3n, denominator: 1n };
      const deltaTexts = exactAmountToCanonicalTexts(delta);
      expect(deltaTexts).toEqual({
        numeratorText: "-3",
        denominatorText: "1",
      });
      expect(
        parseCanonicalExactAmount({
          ...deltaTexts,
          allowNegativeNumerator: true,
        }),
      ).toEqual(delta);
    });
  });
});
