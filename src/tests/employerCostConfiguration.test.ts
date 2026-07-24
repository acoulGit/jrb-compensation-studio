/**
 * Configuration session de la politique de coût employeur (Lot 2B-RC1-H6-A3).
 */

import { describe, expect, it } from "vitest";
import { buildConfigurationFingerprint } from "../application/campaignSimulation/formatExactBudgetDisplay";
import {
  NO_EMPLOYER_COST_POLICY,
  parseEmployerCostRatePercentInput,
  parseSimulationConfigurationDraft,
  type SimulationConfigurationDraftFields,
} from "../application/campaignSimulation/parseSimulationConfiguration";
import { createEmptyConfigurationDraft } from "../application/campaignSimulation/simulationConfigurationModels";
import {
  EMPLOYER_CHARGE_CATEGORY_UNSPECIFIED_BUNDLE,
  EMPLOYER_CHARGES_INCLUDED,
  fractionsEqual,
  reduceFraction,
} from "../domain/compensationCalculation";

function baseCompleteDraft(): SimulationConfigurationDraftFields {
  const draft = createEmptyConfigurationDraft(1, { campaignYear: 2026 });
  draft.budgetTargetMode = "manual_amount";
  draft.manualBudgetInput = "1000000";
  draft.roundingStepInput = "5";
  draft.socialMechanismKind = "none";
  return draft;
}

function fingerprintForPolicy(parts: {
  kind: string;
  numerator?: bigint | null;
  denominator?: bigint | null;
}): string {
  return buildConfigurationFingerprint({
    campaignId: 1,
    budgetMode: "manual_amount",
    manualBudget: 1_000_000n,
    roundingMode: "nearest_half_up",
    roundingStep: 5n,
    campaignYear: 2026,
    retroactivityStartMonth: 1,
    technicalApplicationMonth: 1,
    minimumGuaranteeEffectiveMonth: 1,
    socialMechanismKind: "none",
    employerCostPolicyKind: parts.kind,
    employerCostRateNumerator: parts.numerator ?? null,
    employerCostRateDenominator: parts.denominator ?? null,
  });
}

describe("H6-A3 — configuration coût employeur", () => {
  describe("valeurs par défaut", () => {
    it("draft par défaut = neutral avec taux vide", () => {
      const draft = createEmptyConfigurationDraft(42);
      expect(draft.employerCostPolicyKind).toBe("neutral");
      expect(draft.employerCostRatePercentInput).toBe("");
      expect(draft.campaignId).toBe(42);
    });

    it("snapshot parsée = { kind: neutral }", () => {
      const parsed = parseSimulationConfigurationDraft(baseCompleteDraft());
      expect(parsed.employerCostPolicy).toEqual(NO_EMPLOYER_COST_POLICY);
      expect(parsed.isEmployerCostComplete).toBe(true);
      expect(parsed.isConfigurationComplete).toBe(true);
    });
  });

  describe("parsing neutral", () => {
    it("accepte neutral et ignore un taux résiduel", () => {
      const draft = baseCompleteDraft();
      draft.employerCostPolicyKind = "neutral";
      draft.employerCostRatePercentInput = "42,5";
      const parsed = parseSimulationConfigurationDraft(draft);
      expect(parsed.employerCostPolicy).toEqual({ kind: "neutral" });
      expect(parsed.fieldErrors.employerCostRatePercentInput).toBeUndefined();
    });

    it("fingerprint identique avec ou sans taux résiduel en mode neutral", () => {
      const withoutRate = fingerprintForPolicy({ kind: "neutral" });
      const withResidual = fingerprintForPolicy({
        kind: "neutral",
        numerator: 425n,
        denominator: 1000n,
      });
      expect(withoutRate).toBe(withResidual);
      expect(withoutRate).toContain("employerCost:neutral");
      expect(withoutRate).toContain("employerCostRate:");
    });
  });

  describe("parsing actif", () => {
    it("exige un taux", () => {
      const draft = baseCompleteDraft();
      draft.employerCostPolicyKind = "rate_on_gross_period";
      draft.employerCostRatePercentInput = "";
      const parsed = parseSimulationConfigurationDraft(draft);
      expect(parsed.isEmployerCostComplete).toBe(false);
      expect(parsed.isConfigurationComplete).toBe(false);
      expect(parsed.fieldErrors.employerCostRatePercentInput?.code).toBe(
        "MISSING_EMPLOYER_COST_RATE",
      );
    });

    it("accepte 0 et convertit sans flottant", () => {
      const zero = parseEmployerCostRatePercentInput("0");
      expect(zero).toEqual({
        ok: true,
        value: reduceFraction(0n, 100n),
      });
      expect(zero.ok && fractionsEqual(zero.value, { numerator: 0n, denominator: 1n })).toBe(
        true,
      );

      const draft = baseCompleteDraft();
      draft.employerCostPolicyKind = "rate_on_gross_period";
      draft.employerCostRatePercentInput = "0";
      const parsed = parseSimulationConfigurationDraft(draft);
      expect(parsed.employerCostPolicy).toEqual({
        kind: "rate_on_gross_period",
        components: [
          {
            categoryId: EMPLOYER_CHARGE_CATEGORY_UNSPECIFIED_BUNDLE,
            rate: reduceFraction(0n, 100n),
          },
        ],
      });
    });

    it("convertit un pourcentage entier et à deux décimales", () => {
      expect(parseEmployerCostRatePercentInput("10")).toEqual({
        ok: true,
        value: reduceFraction(10n, 100n),
      });
      expect(parseEmployerCostRatePercentInput("4,25")).toEqual({
        ok: true,
        value: reduceFraction(425n, 10000n),
      });
      expect(parseEmployerCostRatePercentInput("12.5")).toEqual({
        ok: true,
        value: reduceFraction(125n, 1000n),
      });

      const draft = baseCompleteDraft();
      draft.employerCostPolicyKind = "rate_on_gross_period";
      draft.employerCostRatePercentInput = "4,25";
      const parsed = parseSimulationConfigurationDraft(draft);
      expect(parsed.employerCostPolicy?.kind).toBe("rate_on_gross_period");
      if (parsed.employerCostPolicy?.kind === "rate_on_gross_period") {
        expect(parsed.employerCostPolicy.components).toHaveLength(1);
        expect(parsed.employerCostPolicy.components[0]?.categoryId).toBe(
          EMPLOYER_CHARGE_CATEGORY_UNSPECIFIED_BUNDLE,
        );
        expect(
          fractionsEqual(
            parsed.employerCostPolicy.components[0]!.rate,
            reduceFraction(17n, 400n),
          ),
        ).toBe(true);
      }
    });
  });

  describe("rejets", () => {
    it("refuse non numérique, négatif, trop de décimales", () => {
      expect(parseEmployerCostRatePercentInput("abc").ok).toBe(false);
      const negative = parseEmployerCostRatePercentInput("-1");
      expect(negative.ok).toBe(false);
      if (!negative.ok) {
        expect(negative.code).toBe("INVALID_EMPLOYER_COST_RATE");
      }
      const tooManyDecimals = parseEmployerCostRatePercentInput("1,234");
      expect(tooManyDecimals.ok).toBe(false);
      if (!tooManyDecimals.ok) {
        expect(tooManyDecimals.code).toBe("INVALID_EMPLOYER_COST_RATE");
      }
      const scientific = parseEmployerCostRatePercentInput("1e2");
      expect(scientific.ok).toBe(false);
      if (!scientific.ok) {
        expect(scientific.code).toBe("INVALID_EMPLOYER_COST_RATE");
      }
    });

    it("refuse mixed et politiques inconnues", () => {
      const mixedDraft = {
        ...baseCompleteDraft(),
        employerCostPolicyKind: "mixed",
      } as unknown as SimulationConfigurationDraftFields;
      const mixedParsed = parseSimulationConfigurationDraft(mixedDraft);
      expect(mixedParsed.fieldErrors.employerCostPolicyKind?.code).toBe(
        "UNSUPPORTED_EMPLOYER_COST_POLICY_KIND",
      );
      expect(mixedParsed.fieldErrors.employerCostPolicyKind?.message).toMatch(
        /mixed/i,
      );

      const unknownDraft = {
        ...baseCompleteDraft(),
        employerCostPolicyKind: "other",
      } as unknown as SimulationConfigurationDraftFields;
      const unknownParsed = parseSimulationConfigurationDraft(unknownDraft);
      expect(unknownParsed.fieldErrors.employerCostPolicyKind?.code).toBe(
        "UNSUPPORTED_EMPLOYER_COST_POLICY_KIND",
      );
    });
  });

  describe("fingerprint", () => {
    it("distingue neutral, taux actifs différents, et fractions équivalentes", () => {
      const neutral = fingerprintForPolicy({ kind: "neutral" });
      const rate10 = fingerprintForPolicy({
        kind: "rate_on_gross_period",
        numerator: 10n,
        denominator: 100n,
      });
      const rate10Reduced = fingerprintForPolicy({
        kind: "rate_on_gross_period",
        numerator: 1n,
        denominator: 10n,
      });
      const rate12 = fingerprintForPolicy({
        kind: "rate_on_gross_period",
        numerator: 12n,
        denominator: 100n,
      });

      expect(neutral).not.toBe(rate10);
      expect(rate10).not.toBe(rate12);
      // La représentation fingerprint utilise num/den tels que fournis ;
      // le parseur réduit avant snapshot — 10/100 et 1/10 diffèrent en tokens bruts.
      expect(rate10).not.toBe(rate10Reduced);
      expect(fractionsEqual({ numerator: 10n, denominator: 100n }, { numerator: 1n, denominator: 10n })).toBe(
        true,
      );

      const parsedA = parseEmployerCostRatePercentInput("10");
      const parsedB = parseEmployerCostRatePercentInput("10,0");
      expect(parsedA.ok && parsedB.ok).toBe(true);
      if (parsedA.ok && parsedB.ok) {
        expect(fractionsEqual(parsedA.value, parsedB.value)).toBe(true);
        const fpA = fingerprintForPolicy({
          kind: "rate_on_gross_period",
          numerator: parsedA.value.numerator,
          denominator: parsedA.value.denominator,
        });
        const fpB = fingerprintForPolicy({
          kind: "rate_on_gross_period",
          numerator: parsedB.value.numerator,
          denominator: parsedB.value.denominator,
        });
        expect(fpA).toBe(fpB);
      }
    });

    it("omettre la politique équivaut à neutral (compat fingerprint)", () => {
      const explicit = fingerprintForPolicy({ kind: "neutral" });
      const omitted = buildConfigurationFingerprint({
        campaignId: 1,
        budgetMode: "manual_amount",
        manualBudget: 1_000_000n,
        roundingMode: "nearest_half_up",
        roundingStep: 5n,
        campaignYear: 2026,
        retroactivityStartMonth: 1,
        technicalApplicationMonth: 1,
        minimumGuaranteeEffectiveMonth: 1,
        socialMechanismKind: "none",
      });
      expect(omitted).toBe(explicit);
    });
  });

  describe("régressions", () => {
    it("conserve budget, calendrier, mécanisme social et charges=false", () => {
      expect(EMPLOYER_CHARGES_INCLUDED).toBe(false);

      const draft = baseCompleteDraft();
      draft.employerCostPolicyKind = "rate_on_gross_period";
      draft.employerCostRatePercentInput = "15";
      const parsed = parseSimulationConfigurationDraft(draft);
      expect(parsed.budgetTarget?.mode).toBe("manual_amount");
      expect(parsed.campaignYear).toBe(2026);
      expect(parsed.retroactivityStartMonth).toBe(1);
      expect(parsed.technicalApplicationMonth).toBe(1);
      expect(parsed.roundingPolicy?.stepFcfa).toBe(5n);
      expect(parsed.socialMechanismKind).toBe("none");
      expect(parsed.minimumIncreasePolicy?.mode).toBe("none");
      expect(parsed.universalFixedAmountPolicy?.monthlyAmountFcfa).toBe(0n);

      const fp = fingerprintForPolicy({
        kind: "rate_on_gross_period",
        numerator: 15n,
        denominator: 100n,
      });
      expect(fp).toContain("charges:0");
      expect(fp).not.toContain("charges:1");
    });

    it("minimum garanti et forfait restent indépendants", () => {
      const minDraft = baseCompleteDraft();
      minDraft.socialMechanismKind = "minimum_guaranteed";
      minDraft.minimumIncreaseMode = "percentage_of_base_salary";
      minDraft.minimumIncreaseRatePercentInput = "3";
      minDraft.employerCostPolicyKind = "rate_on_gross_period";
      minDraft.employerCostRatePercentInput = "10";
      const minParsed = parseSimulationConfigurationDraft(minDraft);
      expect(minParsed.socialMechanismKind).toBe("minimum_guaranteed");
      expect(minParsed.minimumIncreasePolicy?.mode).toBe(
        "percentage_of_base_salary",
      );
      expect(minParsed.employerCostPolicy?.kind).toBe("rate_on_gross_period");

      const forfaitDraft = baseCompleteDraft();
      forfaitDraft.socialMechanismKind = "universal_fixed_amount";
      forfaitDraft.universalFixedAmountMonthlyAmountInput = "10000";
      forfaitDraft.employerCostPolicyKind = "neutral";
      const forfaitParsed = parseSimulationConfigurationDraft(forfaitDraft);
      expect(forfaitParsed.socialMechanismKind).toBe("universal_fixed_amount");
      expect(forfaitParsed.employerCostPolicy).toEqual({ kind: "neutral" });
    });
  });
});
