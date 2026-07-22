/** Résolution du facteur d’évaluation selon le mode de campagne (Lot 2A-2). */

import type { NineBoxFactor, NineBoxMode } from "../compensationReference/models";
import {
  getNineBoxFactor,
  NineBoxLookupError,
} from "../compensationReference/nineBoxOrientation";
import { isValidFactorMilli } from "../compensationReference/validationHelpers";
import { CompensationCalculationError } from "./errors";
import {
  EVALUATION_FACTOR_SCALE,
  NEUTRAL_EVALUATION_FACTOR_SCALED,
  type CalculationExplanationStep,
  type EvaluationFactorInput,
  type EvaluationFactorResult,
  type EvaluationFactorSelection,
  type LevelFactorRef,
  type NineBoxFactorRef,
} from "./models";

function findUniqueLevelFactor(
  factors: readonly LevelFactorRef[],
  level: string,
  label: string,
): LevelFactorRef {
  const matches = factors.filter((factor) => factor.level === level);
  if (matches.length === 0) {
    throw new CompensationCalculationError(
      "FACTOR_NOT_FOUND",
      `Facteur ${label} introuvable pour le niveau ${level}.`,
    );
  }
  if (matches.length > 1) {
    throw new CompensationCalculationError(
      "DUPLICATE_FACTOR",
      `Plusieurs facteurs ${label} pour le niveau ${level}.`,
    );
  }
  const factor = matches[0];
  if (!isValidFactorMilli(factor.factorMilli)) {
    throw new CompensationCalculationError(
      "INVALID_FACTOR",
      `Facteur ${label} invalide pour le niveau ${level}.`,
    );
  }
  return factor;
}

function assertNoDuplicateLevels(
  factors: readonly { level: string }[],
  label: string,
): void {
  const seen = new Set<string>();
  for (const factor of factors) {
    if (seen.has(factor.level)) {
      throw new CompensationCalculationError(
        "DUPLICATE_FACTOR",
        `Niveau ${label} dupliqué : ${factor.level}.`,
      );
    }
    seen.add(factor.level);
  }
}

function requirePerformance(input: EvaluationFactorInput): LevelFactorRef {
  if (input.performanceLevel === undefined) {
    throw new CompensationCalculationError(
      "MISSING_PERFORMANCE_LEVEL",
      "Le niveau de performance est obligatoire pour ce mode.",
    );
  }
  assertNoDuplicateLevels(input.performanceFactors, "Performance");
  return findUniqueLevelFactor(
    input.performanceFactors,
    input.performanceLevel,
    "Performance",
  );
}

function requirePotential(input: EvaluationFactorInput): LevelFactorRef {
  if (input.potentialLevel === undefined) {
    throw new CompensationCalculationError(
      "MISSING_POTENTIAL_LEVEL",
      "Le niveau de potentiel est obligatoire pour ce mode.",
    );
  }
  assertNoDuplicateLevels(input.potentialFactors, "Potentiel");
  return findUniqueLevelFactor(
    input.potentialFactors,
    input.potentialLevel,
    "Potentiel",
  );
}

function toNineBoxFactors(
  factors: readonly NineBoxFactorRef[],
): NineBoxFactor[] {
  const now = "1970-01-01T00:00:00.000Z";
  return factors.map((factor, index) => ({
    campaignId: 0,
    boxCode: factor.boxCode ?? index + 1,
    performanceLevel: factor.performanceLevel,
    potentialLevel: factor.potentialLevel,
    factorMilli: factor.factorMilli,
    createdAt: now,
    updatedAt: now,
  }));
}

/**
 * Facteur d’évaluation exact, échelle uniforme 1 000 000.
 * Indépendant de l’orientation 9-Box et du boxCode.
 */
export function resolveEvaluationFactor(
  input: EvaluationFactorInput,
): EvaluationFactorResult {
  const mode: NineBoxMode = input.mode;
  const explanation: CalculationExplanationStep[] = [
    {
      code: "EVALUATION_MODE",
      label: "Mode d’évaluation",
      inputValues: { mode },
      outputValue: mode,
      formula: "nineBoxMode (paramètre campagne)",
      reason: "Sélection du facteur selon le mode de campagne.",
    },
  ];

  let selectedFactors: EvaluationFactorSelection;
  let exactFactorNumerator: number;
  let performanceLevel = input.performanceLevel;
  let potentialLevel = input.potentialLevel;

  if (input.neutralizeNineBoxEffect === true) {
    exactFactorNumerator = NEUTRAL_EVALUATION_FACTOR_SCALED;
    selectedFactors = { kind: "neutral" };
    explanation.push({
      code: "EVALUATION_NINE_BOX_NEUTRALIZED",
      label: "Effet 9-Box neutralisé",
      inputValues: {
        neutralizeNineBoxEffect: true,
        mode,
        performanceLevel: performanceLevel ?? null,
        potentialLevel: potentialLevel ?? null,
      },
      outputValue: exactFactorNumerator,
      formula: "1_000_000 (= 1,000)",
      reason:
        "Neutralisation individuelle : facteur d’évaluation effectif = 1, indépendamment du mode et du code 9-Box.",
    });
  } else {
    switch (mode) {
    case "none": {
      exactFactorNumerator = NEUTRAL_EVALUATION_FACTOR_SCALED;
      selectedFactors = { kind: "neutral" };
      explanation.push({
        code: "EVALUATION_NEUTRAL",
        label: "Facteur neutre",
        inputValues: { mode: "none" },
        outputValue: exactFactorNumerator,
        formula: "1_000_000 (= 1,000)",
        reason: "Mode none : aucun effet d’évaluation.",
      });
      performanceLevel = undefined;
      potentialLevel = undefined;
      break;
    }
    case "performance_only": {
      const performance = requirePerformance(input);
      exactFactorNumerator = performance.factorMilli * 1_000;
      selectedFactors = {
        kind: "performance",
        performanceLevel: performance.level,
        performanceFactorMilli: performance.factorMilli,
      };
      explanation.push({
        code: "EVALUATION_PERFORMANCE_ONLY",
        label: "Facteur Performance",
        inputValues: {
          performanceLevel: performance.level,
          performanceFactorMilli: performance.factorMilli,
        },
        outputValue: exactFactorNumerator,
        formula: "performanceMilli * 1000",
        reason: "Mode performance_only.",
      });
      potentialLevel = undefined;
      break;
    }
    case "full_nine_box": {
      if (input.performanceLevel === undefined) {
        throw new CompensationCalculationError(
          "MISSING_PERFORMANCE_LEVEL",
          "Le niveau de performance est obligatoire pour le mode 9-Box.",
        );
      }
      if (input.potentialLevel === undefined) {
        throw new CompensationCalculationError(
          "MISSING_POTENTIAL_LEVEL",
          "Le niveau de potentiel est obligatoire pour le mode 9-Box.",
        );
      }
      let nineBox;
      try {
        nineBox = getNineBoxFactor(
          toNineBoxFactors(input.nineBoxFactors),
          input.performanceLevel,
          input.potentialLevel,
        );
      } catch (error) {
        if (error instanceof NineBoxLookupError) {
          if (error.code === "DUPLICATE") {
            throw new CompensationCalculationError(
              "DUPLICATE_FACTOR",
              error.message,
            );
          }
          throw new CompensationCalculationError(
            "FACTOR_NOT_FOUND",
            error.message,
          );
        }
        throw error;
      }
      if (!isValidFactorMilli(nineBox.factorMilli)) {
        throw new CompensationCalculationError(
          "INVALID_FACTOR",
          "Facteur 9-Box invalide.",
        );
      }
      exactFactorNumerator = nineBox.factorMilli * 1_000;
      selectedFactors = {
        kind: "nine_box",
        performanceLevel: input.performanceLevel,
        potentialLevel: input.potentialLevel,
        nineBoxFactorMilli: nineBox.factorMilli,
        nineBoxCode: nineBox.boxCode,
      };
      explanation.push({
        code: "EVALUATION_FULL_NINE_BOX",
        label: "Facteur 9-Box (couple sémantique)",
        inputValues: {
          performanceLevel: input.performanceLevel,
          potentialLevel: input.potentialLevel,
          nineBoxFactorMilli: nineBox.factorMilli,
          boxCode: nineBox.boxCode,
        },
        outputValue: exactFactorNumerator,
        formula: "nineBoxMilli * 1000 (lookup Performance×Potentiel)",
        reason:
          "Clé métier Performance/Potentiel ; boxCode informatif uniquement.",
      });
      break;
    }
    case "performance_potential": {
      const performance = requirePerformance(input);
      const potential = requirePotential(input);
      exactFactorNumerator =
        performance.factorMilli * potential.factorMilli;
      selectedFactors = {
        kind: "performance_potential",
        performanceLevel: performance.level,
        potentialLevel: potential.level,
        performanceFactorMilli: performance.factorMilli,
        potentialFactorMilli: potential.factorMilli,
      };
      explanation.push({
        code: "EVALUATION_PERFORMANCE_POTENTIAL",
        label: "Facteur Performance × Potentiel",
        inputValues: {
          performanceLevel: performance.level,
          performanceFactorMilli: performance.factorMilli,
          potentialLevel: potential.level,
          potentialFactorMilli: potential.factorMilli,
        },
        outputValue: exactFactorNumerator,
        formula: "performanceMilli * potentialMilli",
        reason: "Mode performance_potential (produit des facteurs).",
      });
      break;
    }
    default: {
      throw new CompensationCalculationError(
        "UNSUPPORTED_EVALUATION_MODE",
        `Mode d’évaluation non supporté : ${String(mode)}.`,
      );
    }
  }
  }

  if (
    !Number.isInteger(exactFactorNumerator) ||
    exactFactorNumerator < 0 ||
    exactFactorNumerator > EVALUATION_FACTOR_SCALE * 100
  ) {
    // Garde-fou : milli max 10000 → produit max 10000*10000 = 1e8 < 1e6*100
    throw new CompensationCalculationError(
      "INVALID_FACTOR",
      "Facteur d’évaluation hors plage entière attendue.",
    );
  }

  return {
    mode,
    performanceLevel,
    potentialLevel,
    selectedFactors,
    exactFactorNumerator,
    exactFactorScale: EVALUATION_FACTOR_SCALE,
    explanation,
  };
}
