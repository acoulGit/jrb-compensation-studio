/**
 * Lot 2B-RC1-H2 — coefficient provisoire 9-Box « Performance à confirmer ».
 * Couvre : défaut 900, résolution du facteur d’évaluation (900 / 800),
 * priorité du blocage sous-performant confirmé, traitement 9-Box retenu,
 * compatibilité de schéma v4/v5 et validation de plage (500–1000).
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_NINE_BOX_CONFIRMATION_FACTOR_MILLI,
  DEFAULT_NINE_BOX_FACTORS,
  DEFAULT_PERFORMANCE_FACTORS,
  DEFAULT_POTENTIAL_FACTORS,
  DEFAULT_SALARY_POSITIONS,
} from "../domain/compensationReference/defaults";
import { isValidNineBoxConfirmationFactorMilli } from "../domain/compensationReference/validationHelpers";
import {
  MAX_NINE_BOX_CONFIRMATION_FACTOR_MILLI,
  MIN_NINE_BOX_CONFIRMATION_FACTOR_MILLI,
} from "../domain/compensationReference/models";
import {
  calculateIndividualMatrixWeight,
  CompensationCalculationError,
  RESULT_SCHEMA_VERSION,
  RESULT_SCHEMA_VERSION_V3,
  RESULT_SCHEMA_VERSION_V4,
  RESULT_SCHEMA_VERSION_V5,
  resolveEvaluationFactor,
  resolveNineBoxTreatmentKind,
} from "../domain/compensationCalculation";
import {
  canPresentResultSchemaVersion,
  classifyResultSchemaVersion,
} from "../application/campaignSimulation/resultSchemaCompatibility";

function nineBoxFactorRefs() {
  return DEFAULT_NINE_BOX_FACTORS.map((f) => ({
    performanceLevel: f.performanceLevel,
    potentialLevel: f.potentialLevel,
    factorMilli: f.factorMilli,
    boxCode: f.boxCode,
  }));
}

function performanceFactorRefs() {
  return DEFAULT_PERFORMANCE_FACTORS.map((f) => ({
    level: f.level,
    factorMilli: f.factorMilli,
  }));
}

function potentialFactorRefs() {
  return DEFAULT_POTENTIAL_FACTORS.map((f) => ({
    level: f.level,
    factorMilli: f.factorMilli,
  }));
}

describe("nineBoxConfirmationFactor — Lot 2B-RC1-H2", () => {
  it("le coefficient provisoire par défaut est 900 (0,900)", () => {
    expect(DEFAULT_NINE_BOX_CONFIRMATION_FACTOR_MILLI).toBe(900);
  });

  describe("resolveEvaluationFactor — coefficient provisoire", () => {
    it("applique le coefficient 900 quand neutralizeNineBoxEffect est actif", () => {
      const result = resolveEvaluationFactor({
        mode: "full_nine_box",
        performanceLevel: "high",
        potentialLevel: "high",
        performanceFactors: performanceFactorRefs(),
        potentialFactors: potentialFactorRefs(),
        nineBoxFactors: nineBoxFactorRefs(),
        neutralizeNineBoxEffect: true,
        nineBoxConfirmationFactorMilli: 900,
      });
      expect(result.exactFactorNumerator).toBe(900_000);
      expect(result.exactFactorScale).toBe(1_000_000);
      expect(result.selectedFactors).toEqual({
        kind: "pending_confirmation",
        nineBoxConfirmationFactorMilli: 900,
      });
    });

    it("applique un coefficient personnalisé 800 (différent du défaut)", () => {
      const result = resolveEvaluationFactor({
        mode: "full_nine_box",
        performanceLevel: "high",
        potentialLevel: "high",
        performanceFactors: performanceFactorRefs(),
        potentialFactors: potentialFactorRefs(),
        nineBoxFactors: nineBoxFactorRefs(),
        neutralizeNineBoxEffect: true,
        nineBoxConfirmationFactorMilli: 800,
      });
      expect(result.exactFactorNumerator).toBe(800_000);
    });

    it("ignore le code 9-Box source : le coefficient provisoire prime toujours", () => {
      const withHighBox = resolveEvaluationFactor({
        mode: "full_nine_box",
        performanceLevel: "low",
        potentialLevel: "low",
        performanceFactors: performanceFactorRefs(),
        potentialFactors: potentialFactorRefs(),
        nineBoxFactors: nineBoxFactorRefs(),
        neutralizeNineBoxEffect: true,
        nineBoxConfirmationFactorMilli: 900,
      });
      // Box (low, low) vaut normalement 200 milli, mais neutralisé → 900.
      expect(withHighBox.exactFactorNumerator).toBe(900_000);
    });

    it("refuse un coefficient provisoire hors plage (INVALID_NINE_BOX_CONFIRMATION_FACTOR)", () => {
      expect(() =>
        resolveEvaluationFactor({
          mode: "full_nine_box",
          performanceLevel: "high",
          potentialLevel: "high",
          performanceFactors: performanceFactorRefs(),
          potentialFactors: potentialFactorRefs(),
          nineBoxFactors: nineBoxFactorRefs(),
          neutralizeNineBoxEffect: true,
          nineBoxConfirmationFactorMilli: 499,
        }),
      ).toThrowError(
        expect.objectContaining({ code: "INVALID_NINE_BOX_CONFIRMATION_FACTOR" }),
      );
    });

    it("refuse un coefficient provisoire manquant quand neutralizeNineBoxEffect est actif", () => {
      expect(() =>
        resolveEvaluationFactor({
          mode: "full_nine_box",
          performanceLevel: "high",
          potentialLevel: "high",
          performanceFactors: performanceFactorRefs(),
          potentialFactors: potentialFactorRefs(),
          nineBoxFactors: nineBoxFactorRefs(),
          neutralizeNineBoxEffect: true,
          nineBoxConfirmationFactorMilli: undefined,
        }),
      ).toThrowError(CompensationCalculationError);
    });
  });

  describe("priorité du sous-performant confirmé", () => {
    it("le poids effectif reste nul même avec le coefficient provisoire appliqué", () => {
      const result = calculateIndividualMatrixWeight({
        salaryFcfa: 1_000_000,
        s0Fcfa: 1_000_000,
        salaryPositions: DEFAULT_SALARY_POSITIONS.map((p) => ({
          code: p.code,
          label: p.label,
          referenceRatioBps: p.referenceRatioBps,
          positionFactorMilli: p.positionFactorMilli,
        })),
        mode: "full_nine_box",
        performanceLevel: "high",
        potentialLevel: "high",
        performanceFactors: performanceFactorRefs(),
        potentialFactors: potentialFactorRefs(),
        nineBoxFactors: nineBoxFactorRefs(),
        neutralizeNineBoxEffect: true,
        nineBoxConfirmationFactorMilli: 900,
        confirmedUnderperformer: true,
      });
      // Le facteur d’évaluation reste le coefficient provisoire (tracé)…
      expect(result.evaluationFactor.exactFactorNumerator).toBe(900_000);
      // …mais le poids effectif est bloqué à 0 par la sous-performance confirmée.
      expect(result.exactWeightNumerator).toBe(0n);
      expect(result.isZero).toBe(true);
      expect(result.blockingReason).toBe("CONFIRMED_UNDERPERFORMER");
    });
  });

  describe("resolveNineBoxTreatmentKind", () => {
    it("retient « performance_pending_confirmation » par défaut (contrat 6)", () => {
      expect(
        resolveNineBoxTreatmentKind({
          neutralizeNineBoxEffect: true,
          sourceNineBoxCode: 5,
        }),
      ).toBe("performance_pending_confirmation");
    });

    it("retient « nine_box_effect_neutralized » si la sémantique v4 est forcée", () => {
      expect(
        resolveNineBoxTreatmentKind({
          neutralizeNineBoxEffect: true,
          sourceNineBoxCode: 5,
          usePendingConfirmationSemantics: false,
        }),
      ).toBe("nine_box_effect_neutralized");
    });

    it("retient « nine_box_code_applied » quand la neutralisation est inactive", () => {
      expect(
        resolveNineBoxTreatmentKind({
          neutralizeNineBoxEffect: false,
          sourceNineBoxCode: 5,
        }),
      ).toBe("nine_box_code_applied");
    });

    it("retient « missing_nine_box_data_treatment » si aucun code source", () => {
      expect(
        resolveNineBoxTreatmentKind({
          neutralizeNineBoxEffect: false,
          sourceNineBoxCode: null,
        }),
      ).toBe("missing_nine_box_data_treatment");
    });
  });

  describe("compatibilité de schéma v3/v4/v5", () => {
    it("classe v3, v4, v5 et v6 comme « current » (présentables)", () => {
      expect(classifyResultSchemaVersion(RESULT_SCHEMA_VERSION_V3)).toBe("current");
      expect(classifyResultSchemaVersion(RESULT_SCHEMA_VERSION_V4)).toBe("current");
      expect(classifyResultSchemaVersion(RESULT_SCHEMA_VERSION_V5)).toBe("current");
      expect(classifyResultSchemaVersion(RESULT_SCHEMA_VERSION)).toBe("current");
    });

    it("canPresentResultSchemaVersion accepte v3 à v6", () => {
      expect(canPresentResultSchemaVersion(RESULT_SCHEMA_VERSION_V3)).toBe(true);
      expect(canPresentResultSchemaVersion(RESULT_SCHEMA_VERSION_V4)).toBe(true);
      expect(canPresentResultSchemaVersion(RESULT_SCHEMA_VERSION_V5)).toBe(true);
      expect(canPresentResultSchemaVersion(RESULT_SCHEMA_VERSION)).toBe(true);
      expect(RESULT_SCHEMA_VERSION).toBe(6);
      expect(RESULT_SCHEMA_VERSION_V5).toBe(5);
      expect(RESULT_SCHEMA_VERSION_V4).toBe(4);
    });
  });

  describe("validation de plage 500–1000", () => {
    it("accepte les bornes 500 et 1000", () => {
      expect(isValidNineBoxConfirmationFactorMilli(MIN_NINE_BOX_CONFIRMATION_FACTOR_MILLI)).toBe(
        true,
      );
      expect(isValidNineBoxConfirmationFactorMilli(MAX_NINE_BOX_CONFIRMATION_FACTOR_MILLI)).toBe(
        true,
      );
      expect(isValidNineBoxConfirmationFactorMilli(900)).toBe(true);
    });

    it("refuse 499 (sous la borne minimale)", () => {
      expect(isValidNineBoxConfirmationFactorMilli(499)).toBe(false);
    });

    it("refuse 1001 (au-dessus de la borne maximale)", () => {
      expect(isValidNineBoxConfirmationFactorMilli(1001)).toBe(false);
    });

    it("refuse une valeur non entière", () => {
      expect(isValidNineBoxConfirmationFactorMilli(900.5)).toBe(false);
    });
  });
});
