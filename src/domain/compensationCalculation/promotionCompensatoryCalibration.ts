/**
 * Calibrage compensatoire conscient des promotions et du minimum garanti
 * (Lot 2A-H2C-2 / Lot 2A-H2D-2).
 *
 * Équation (mode none — parité H2D-1) :
 *   Σ salaire × max(0, taux×facteur − décalage) = budgetDisponible
 *
 * Équation (avec planchers) :
 *   Σ max(plancher_i, salaire × max(0, taux×facteur − décalage))
 *     = budgetDisponible
 * équivalent à :
 *   Σ max(0, weighted_i(taux) − plancher_i)
 *     = budgetDisponible − Σ plancher_i
 *
 * Algorithme piecewise exact (BigInt) sur les seuils :
 * - activation pondérée : décalage / facteur ;
 * - franchissement du plancher : (décalage + plancher/salaire) / facteur.
 */

import { CompensationCalculationError } from "./errors";
import {
  addFractions,
  compareFractions,
  divideFractions,
  exactAmountFromInteger,
  fractionsEqual,
  isZeroFraction,
  multiplyFractions,
  subtractFractions,
  type ExactAmount,
} from "./exactFraction";
import type { PromotionCampaignCostPreview } from "./promotionTrajectory";

export const PROMOTION_COMPENSATORY_CALIBRATION_CONTRACT_VERSION = 1 as const;

export interface PromotionCompensatoryExposure {
  employeeId?: string;
  month?: number;
  salary: bigint;
  factor: ExactAmount;
  promotionRateOffset: ExactAmount;
  /**
   * Plancher de complément payable (multiple du pas). Défaut 0 = H2D-1.
   */
  minimumComplementFloorFcfa?: bigint;
}

function salaryAsExact(salary: bigint): ExactAmount {
  return exactAmountFromInteger(salary);
}

function floorOf(exposure: PromotionCompensatoryExposure): bigint {
  return exposure.minimumComplementFloorFcfa ?? 0n;
}

/**
 * Résout le taux mensuel de calibrage compensatoire.
 * N'effectue aucune conversion `Number` — arithmétique BigInt exclusivement.
 */
export function solvePromotionAwareCompensatoryCalibrationRate(input: {
  availableBudget: ExactAmount;
  exposures: readonly PromotionCompensatoryExposure[];
}): ExactAmount {
  if (isZeroFraction(input.availableBudget)) {
    const anyPositiveFloor = input.exposures.some((e) => floorOf(e) > 0n);
    if (anyPositiveFloor) {
      throw new CompensationCalculationError(
        "MINIMUM_GUARANTEE_EXCEEDS_BUDGET",
        "L’enveloppe ne permet pas de financer les promotions et le minimum garanti.",
      );
    }
    return exactAmountFromInteger(0n);
  }

  let totalFloor = 0n;
  for (const exposure of input.exposures) {
    totalFloor += floorOf(exposure);
  }
  const totalFloorExact = exactAmountFromInteger(totalFloor);

  if (compareFractions(totalFloorExact, input.availableBudget) > 0) {
    throw new CompensationCalculationError(
      "MINIMUM_GUARANTEE_EXCEEDS_BUDGET",
      "L’enveloppe ne permet pas de financer les promotions et le minimum garanti.",
    );
  }

  const residualBudget = subtractFractions(input.availableBudget, totalFloorExact);

  // Budget exact = planchers uniquement → taux nul, simulation valide.
  if (isZeroFraction(residualBudget)) {
    return exactAmountFromInteger(0n);
  }

  // Capacité au-dessus du plancher : facteur > 0 uniquement.
  const active = input.exposures.filter((exposure) => !isZeroFraction(exposure.factor));

  if (active.length === 0) {
    throw new CompensationCalculationError(
      "NO_COMPENSATORY_ALLOCATION_CAPACITY",
      "Un budget reste disponible après promotions et minimum garanti, mais aucune exposition ne présente de capacité d’allocation positive au-dessus du plancher. Réduisez l’enveloppe disponible ou revoyez la population et les règles d’éligibilité.",
    );
  }

  type ExposureWithThresholds = PromotionCompensatoryExposure & {
    weightedActivationThreshold: ExactAmount;
    floorCrossingThreshold: ExactAmount;
  };

  const withThresholds: ExposureWithThresholds[] = active.map((exposure) => {
    const floor = floorOf(exposure);
    const weightedActivationThreshold = divideFractions(
      exposure.promotionRateOffset,
      exposure.factor,
    );
    // rate = (offset + floor/salary) / factor
    const floorOverSalary =
      floor === 0n || exposure.salary === 0n
        ? exactAmountFromInteger(0n)
        : reduceSafe(floor, exposure.salary);
    const floorCrossingThreshold = divideFractions(
      addFractions(exposure.promotionRateOffset, floorOverSalary),
      exposure.factor,
    );
    return {
      ...exposure,
      weightedActivationThreshold,
      floorCrossingThreshold,
    };
  });

  const boundaries: ExactAmount[] = [exactAmountFromInteger(0n)];
  for (const exposure of withThresholds) {
    for (const threshold of [
      exposure.weightedActivationThreshold,
      exposure.floorCrossingThreshold,
    ]) {
      if (!boundaries.some((existing) => fractionsEqual(existing, threshold))) {
        boundaries.push(threshold);
      }
    }
  }
  boundaries.sort((left, right) => compareFractions(left, right));

  for (let index = 0; index < boundaries.length; index += 1) {
    const lowerBound = boundaries[index]!;
    const upperBound = index + 1 < boundaries.length ? boundaries[index + 1]! : null;

    // Sur (lower, upper], expositions au-dessus du plancher :
    // floorCrossingThreshold ≤ lowerBound (taux du segment > seuil plancher).
    let sumSalaryFactor: ExactAmount = exactAmountFromInteger(0n);
    let sumSalaryOffset: ExactAmount = exactAmountFromInteger(0n);
    let sumFloorsAbove: ExactAmount = exactAmountFromInteger(0n);

    for (const exposure of withThresholds) {
      if (compareFractions(exposure.floorCrossingThreshold, lowerBound) <= 0) {
        const salaryExact = salaryAsExact(exposure.salary);
        sumSalaryFactor = addFractions(
          sumSalaryFactor,
          multiplyFractions(salaryExact, exposure.factor),
        );
        sumSalaryOffset = addFractions(
          sumSalaryOffset,
          multiplyFractions(salaryExact, exposure.promotionRateOffset),
        );
        sumFloorsAbove = addFractions(
          sumFloorsAbove,
          exactAmountFromInteger(floorOf(exposure)),
        );
      }
    }

    if (isZeroFraction(sumSalaryFactor)) {
      continue;
    }

    // residual = Σ (salary×rate×f − salary×o − floor) sur actifs above floor
    // residual + Σ(salary×o) + Σ floor = rate × Σ(salary×f)
    const candidateRate = divideFractions(
      addFractions(addFractions(residualBudget, sumSalaryOffset), sumFloorsAbove),
      sumSalaryFactor,
    );

    const strictlyAboveLowerBound = compareFractions(candidateRate, lowerBound) > 0;
    const withinUpperBound =
      upperBound === null || compareFractions(candidateRate, upperBound) <= 0;

    if (strictlyAboveLowerBound && withinUpperBound) {
      return candidateRate;
    }
  }

  throw new CompensationCalculationError(
    "NO_COMPENSATORY_ALLOCATION_CAPACITY",
    "Aucun taux de calibrage compensatoire ne satisfait l’équation exacte de répartition du reliquat au-dessus du minimum garanti. Réduisez l’enveloppe disponible ou revoyez la population et les règles d’éligibilité.",
  );
}

function reduceSafe(numerator: bigint, denominator: bigint): ExactAmount {
  return divideFractions(
    exactAmountFromInteger(numerator),
    exactAmountFromInteger(denominator),
  );
}

export function promotionAnnualBudgetCostFcfa(input: {
  costPreview: PromotionCampaignCostPreview;
  isPromotionBudgetPopulationEmployee: boolean;
}): bigint {
  if (!input.isPromotionBudgetPopulationEmployee) {
    return 0n;
  }
  return input.costPreview.includedInSimulation
    ? input.costPreview.promotionCampaignCostFcfa
    : 0n;
}

export function sumPromotionAnnualBudgetCostFcfa(
  entries: readonly {
    costPreview: PromotionCampaignCostPreview;
    isPromotionBudgetPopulationEmployee: boolean;
  }[],
): bigint {
  let total = 0n;
  for (const entry of entries) {
    total += promotionAnnualBudgetCostFcfa(entry);
  }
  return total;
}
