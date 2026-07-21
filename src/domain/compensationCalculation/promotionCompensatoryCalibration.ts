/**
 * Calibrage compensatoire conscient des promotions (Lot 2A-H2C-2).
 *
 * Résout, en arithmétique rationnelle exacte (BigInt), le taux mensuel
 * unique tel que :
 *   Σ salaire_i × max(0, taux×facteur_i − décalagePromotion_i) = budgetDisponible
 *
 * `décalagePromotion_i` neutralise, mois par mois, la part de taux déjà
 * consommée par une promotion structurée incluse — un salarié promu ne
 * cumule pas intégralement l'augmentation matricielle standard et sa
 * promotion : seul le complément (éventuellement nul) est versé.
 *
 * Algorithme (piecewise linéaire croissant, convexe) :
 * 1. budget nul → taux nul (aucune résolution nécessaire) ;
 * 2. exclusion des expositions à facteur nul (aucune capacité) ;
 * 3. aucune exposition restante + budget positif → erreur ;
 * 4. seuils = décalage / facteur (fraction exacte) ; liste triée distincte ;
 * 5. segments (t_i, t_{i+1}] avec t_0 = 0 (virtuel) ;
 * 6. sur un segment, l'exposition est active ssi seuil ≤ t_i (le taux du
 *    segment est strictement supérieur au seuil ; égalité ⇒ complément nul) ;
 * 7. A = Σ salaire×facteur (actifs) ; B = Σ salaire×décalage (actifs) ;
 * 8. taux candidat = (budgetDisponible + B) / A ; retenu si dans le segment ;
 * 9. résultat renvoyé sous forme de fraction canonique réduite.
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
  type ExactAmount,
} from "./exactFraction";
import type { PromotionCampaignCostPreview } from "./promotionTrajectory";

export const PROMOTION_COMPENSATORY_CALIBRATION_CONTRACT_VERSION = 1 as const;

export interface PromotionCompensatoryExposure {
  /** Identifiant de traçabilité — n'affecte pas le calcul. */
  employeeId?: string;
  month?: number;
  salary: bigint;
  factor: ExactAmount;
  promotionRateOffset: ExactAmount;
}

function salaryAsExact(salary: bigint): ExactAmount {
  return exactAmountFromInteger(salary);
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
    return exactAmountFromInteger(0n);
  }

  const active = input.exposures.filter((exposure) => !isZeroFraction(exposure.factor));

  if (active.length === 0) {
    throw new CompensationCalculationError(
      "NO_COMPENSATORY_ALLOCATION_CAPACITY",
      "Aucune capacité d'allocation compensatoire disponible : tous les facteurs matriciels effectifs sont nuls alors qu'un budget compensatoire positif reste à répartir. Réduisez l'enveloppe disponible ou revoyez la population et les règles d'éligibilité au complément compensatoire.",
    );
  }

  const withThreshold = active.map((exposure) => ({
    ...exposure,
    threshold: divideFractions(exposure.promotionRateOffset, exposure.factor),
  }));

  const boundaries: ExactAmount[] = [exactAmountFromInteger(0n)];
  for (const exposure of withThreshold) {
    if (!boundaries.some((existing) => fractionsEqual(existing, exposure.threshold))) {
      boundaries.push(exposure.threshold);
    }
  }
  boundaries.sort((left, right) => compareFractions(left, right));

  for (let index = 0; index < boundaries.length; index += 1) {
    const lowerBound = boundaries[index]!;
    const upperBound = index + 1 < boundaries.length ? boundaries[index + 1]! : null;

    let sumSalaryFactor: ExactAmount = exactAmountFromInteger(0n);
    let sumSalaryOffset: ExactAmount = exactAmountFromInteger(0n);
    for (const exposure of withThreshold) {
      if (compareFractions(exposure.threshold, lowerBound) <= 0) {
        const salaryExact = salaryAsExact(exposure.salary);
        sumSalaryFactor = addFractions(
          sumSalaryFactor,
          multiplyFractions(salaryExact, exposure.factor),
        );
        sumSalaryOffset = addFractions(
          sumSalaryOffset,
          multiplyFractions(salaryExact, exposure.promotionRateOffset),
        );
      }
    }

    if (isZeroFraction(sumSalaryFactor)) {
      continue;
    }

    const candidateRate = divideFractions(
      addFractions(input.availableBudget, sumSalaryOffset),
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
    "Aucun taux de calibrage compensatoire ne satisfait l'équation exacte de répartition du budget disponible sur les expositions fournies. Réduisez l'enveloppe disponible ou revoyez la population et les règles d'éligibilité au complément compensatoire.",
  );
}

/**
 * Coût budgétaire annuel de promotion imputable pour un salarié, filtré par
 * appartenance à la population de consommation du budget promotion.
 * Renvoie 0 si le salarié est hors population ou si la promotion est exclue.
 */
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

/** Somme des coûts annuels de promotion imputables sur une population. */
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
