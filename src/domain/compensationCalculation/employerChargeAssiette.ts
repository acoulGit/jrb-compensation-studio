/**
 * Assiette typée des charges employeur de période (Lot 2B-RC1-H6-A4-I1).
 *
 * Sommation exclusive (sans double comptage) :
 * promo + (floor + aboveMin + forfait) + surcoût marginal d’ancienneté.
 * Les rappels, l’ancienneté historique, le 13e mois et les charges elles-mêmes
 * sont exclus.
 */

import {
  DEFAULT_EMPLOYER_COST_COMPONENT_LIABILITY,
  type EmployerCostComponentLiability,
  type EmployerCostPolicy,
} from "./employerPeriodCost";

export type EmployerChargeAssietteAvailability =
  | "available"
  | "unavailable";

export interface EmployerChargeAssietteComponentLine {
  /** Montant FCFA calculé pour la composante (0n si inactive / nulle). */
  readonly amountFcfa: bigint;
  /** Assujettissement configuré. */
  readonly liable: boolean;
  /**
   * Contribution à l’assiette assujettie (= amountFcfa si liable et available,
   * sinon 0n).
   */
  readonly liableAmountFcfa: bigint;
  /**
   * `unavailable` = composante non calculable dans le modèle actuel
   * (distinct d’un zéro réellement calculé).
   */
  readonly availability: EmployerChargeAssietteAvailability;
}

/**
 * Breakdown d’assiette pour un salarié (période de campagne).
 * Les cinq lignes sont toujours présentes.
 */
export interface EmployerChargeAssietteBreakdown {
  readonly matrixIncrease: EmployerChargeAssietteComponentLine;
  readonly minimumGuaranteeComplement: EmployerChargeAssietteComponentLine;
  readonly universalFixedAmount: EmployerChargeAssietteComponentLine;
  readonly promotionIncrease: EmployerChargeAssietteComponentLine;
  readonly additionalSeniorityImpact: EmployerChargeAssietteComponentLine;
  /**
   * Somme des contributions assujetties (= periodGrossImpactFcfa passé au helper).
   */
  readonly periodGrossImpactFcfa: bigint;
  readonly componentLiability: EmployerCostComponentLiability;
}

export interface EmployerChargeAssietteSourceAmounts {
  readonly campaignPeriodCompensationAboveMinimumCostFcfa: bigint;
  readonly campaignPeriodMinimumComplementFloorCostFcfa: bigint;
  readonly campaignPeriodUniversalFixedAmountCostFcfa: bigint;
  readonly annualPromotionBudgetCostFcfa: bigint;
  /**
   * Surcoût marginal d’ancienneté déjà calculé par le moteur
   * (`combinedAnnualSeniorityImpactFcfa`) — incidence sur l’augmentation,
   * pas l’ancienneté historique.
   */
  readonly combinedAnnualSeniorityImpactFcfa: bigint;
}

function line(
  amountFcfa: bigint,
  liable: boolean,
  availability: EmployerChargeAssietteAvailability = "available",
): EmployerChargeAssietteComponentLine {
  if (typeof amountFcfa !== "bigint" || amountFcfa < 0n) {
    throw new Error(
      "EmployerChargeAssiette: montant de composante invalide (BigInt ≥ 0 requis).",
    );
  }
  const liableAmountFcfa =
    availability === "available" && liable ? amountFcfa : 0n;
  return { amountFcfa, liable, liableAmountFcfa, availability };
}

/**
 * Construit le breakdown exclusif et l’assiette assujettie.
 * N’additionne jamais un agrégat et ses sous-parties simultanément.
 */
export function buildEmployerChargeAssietteBreakdown(
  sources: EmployerChargeAssietteSourceAmounts,
  liability: EmployerCostComponentLiability = DEFAULT_EMPLOYER_COST_COMPONENT_LIABILITY,
): EmployerChargeAssietteBreakdown {
  const matrixIncrease = line(
    sources.campaignPeriodCompensationAboveMinimumCostFcfa,
    liability.matrixIncrease,
  );
  const minimumGuaranteeComplement = line(
    sources.campaignPeriodMinimumComplementFloorCostFcfa,
    liability.minimumGuaranteeComplement,
  );
  const universalFixedAmount = line(
    sources.campaignPeriodUniversalFixedAmountCostFcfa,
    liability.universalFixedAmount,
  );
  const promotionIncrease = line(
    sources.annualPromotionBudgetCostFcfa,
    liability.promotionIncrease,
  );
  const additionalSeniorityImpact = line(
    sources.combinedAnnualSeniorityImpactFcfa,
    liability.additionalSeniorityImpact,
  );

  const periodGrossImpactFcfa =
    matrixIncrease.liableAmountFcfa +
    minimumGuaranteeComplement.liableAmountFcfa +
    universalFixedAmount.liableAmountFcfa +
    promotionIncrease.liableAmountFcfa +
    additionalSeniorityImpact.liableAmountFcfa;

  return {
    matrixIncrease,
    minimumGuaranteeComplement,
    universalFixedAmount,
    promotionIncrease,
    additionalSeniorityImpact,
    periodGrossImpactFcfa,
    componentLiability: { ...liability },
  };
}

/**
 * Vérifie l’invariant de partition compensatoire déjà enforce par le moteur :
 * floor + above + forfait = coût compensatoire période.
 */
export function assertCompensatoryAssiettePartition(input: {
  floorFcfa: bigint;
  aboveMinimumFcfa: bigint;
  universalFixedFcfa: bigint;
  annualActualCompensatoryCostFcfa: bigint;
}): void {
  const sum =
    input.floorFcfa + input.aboveMinimumFcfa + input.universalFixedFcfa;
  if (sum !== input.annualActualCompensatoryCostFcfa) {
    throw new Error(
      "EmployerChargeAssiette: partition compensatoire incohérente (floor+above+forfait ≠ actual).",
    );
  }
}

export function resolveLiabilityFromPolicy(
  policy: EmployerCostPolicy,
): EmployerCostComponentLiability {
  return policy.componentLiability;
}
