/**
 * Fondation pure du coût employeur de période (Lot 2B-RC1-H6-A2).
 *
 * Module non branché : aucun orchestrateur, UI ni persistance ne l’appelle.
 * Le budget de production reste exprimé en augmentation salariale brute.
 */

import {
  exactAmountFromInteger,
  fractionsEqual,
  isNonNegativeFraction,
  multiplyFractions,
  roundFractionToStepHalfUp,
  type ExactAmount,
} from "./exactFraction";

/** Identifiant de catégorie de charge autorisé pour cette fondation. */
export type EmployerChargeCategoryId = "unspecified_bundle";

export const EMPLOYER_CHARGE_CATEGORY_UNSPECIFIED_BUNDLE =
  "unspecified_bundle" as const;

export type EmployerPeriodCostErrorCode =
  | "INVALID_PERIOD_GROSS_AMOUNT"
  | "INVALID_EMPLOYER_CHARGE_RATE"
  | "DUPLICATE_EMPLOYER_CHARGE_CATEGORY"
  | "INVALID_EMPLOYER_COST_BREAKDOWN"
  | "INCOMPATIBLE_EMPLOYER_CHARGE_COMPONENTS"
  | "UNSUPPORTED_EMPLOYER_COST_POLICY";

export class EmployerPeriodCostError extends Error {
  readonly code: EmployerPeriodCostErrorCode;

  constructor(code: EmployerPeriodCostErrorCode, message: string) {
    super(message);
    this.name = "EmployerPeriodCostError";
    this.code = code;
  }
}

export interface EmployerChargePolicyComponent {
  readonly categoryId: EmployerChargeCategoryId;
  readonly rate: ExactAmount;
}

export type EmployerCostPolicy =
  | {
      readonly kind: "neutral";
    }
  | {
      readonly kind: "rate_on_gross_period";
      readonly components: readonly EmployerChargePolicyComponent[];
    };

export interface PeriodGrossSalaryImpactInput {
  readonly monthlyGrossIncreaseFcfa: bigint;
  readonly periodGrossImpactFcfa: bigint;
  readonly fullYearGrossRunRateFcfa?: bigint;
}

export interface EmployerChargeComponent {
  readonly categoryId: EmployerChargeCategoryId;
  readonly baseAmountFcfa: bigint;
  readonly rate: ExactAmount;
  readonly amountFcfa: bigint;
}

export type AggregatedEmployerCostPolicyKind =
  | EmployerCostPolicy["kind"]
  | "mixed";

export interface PeriodEmployerCostBreakdown {
  readonly monthlyGrossIncreaseFcfa: bigint;
  readonly fullYearGrossRunRateFcfa: bigint | null;
  readonly periodGrossImpactFcfa: bigint;
  readonly periodEmployerChargesFcfa: bigint;
  readonly periodEmployerCompleteCostFcfa: bigint;
  readonly chargeComponents: readonly EmployerChargeComponent[];
  readonly policyKind: AggregatedEmployerCostPolicyKind;
}

function assertNonNegativeFcfa(value: bigint, field: string): void {
  if (typeof value !== "bigint") {
    throw new EmployerPeriodCostError(
      "INVALID_PERIOD_GROSS_AMOUNT",
      `${field} doit être un BigInt FCFA.`,
    );
  }
  if (value < 0n) {
    throw new EmployerPeriodCostError(
      "INVALID_PERIOD_GROSS_AMOUNT",
      `${field} ne peut pas être négatif.`,
    );
  }
}

function assertNonNegativeRate(rate: ExactAmount): void {
  if (
    typeof rate?.numerator !== "bigint" ||
    typeof rate?.denominator !== "bigint" ||
    rate.denominator <= 0n
  ) {
    throw new EmployerPeriodCostError(
      "INVALID_EMPLOYER_CHARGE_RATE",
      "Le taux de charge employeur doit être une fraction ExactAmount valide.",
    );
  }
  if (!isNonNegativeFraction(rate)) {
    throw new EmployerPeriodCostError(
      "INVALID_EMPLOYER_CHARGE_RATE",
      "Le taux de charge employeur ne peut pas être négatif.",
    );
  }
}

function assertCategoryId(categoryId: string): asserts categoryId is EmployerChargeCategoryId {
  if (categoryId !== EMPLOYER_CHARGE_CATEGORY_UNSPECIFIED_BUNDLE) {
    throw new EmployerPeriodCostError(
      "UNSUPPORTED_EMPLOYER_COST_POLICY",
      `Catégorie de charge non supportée : ${categoryId}.`,
    );
  }
}

function validateRateOnGrossComponents(
  components: readonly EmployerChargePolicyComponent[],
): void {
  const seen = new Set<EmployerChargeCategoryId>();
  for (const component of components) {
    assertCategoryId(component.categoryId);
    assertNonNegativeRate(component.rate);
    if (seen.has(component.categoryId)) {
      throw new EmployerPeriodCostError(
        "DUPLICATE_EMPLOYER_CHARGE_CATEGORY",
        `Identifiant de composante dupliqué dans la politique : ${component.categoryId}.`,
      );
    }
    seen.add(component.categoryId);
  }
}

function roundChargeAmountFcfa(
  baseAmountFcfa: bigint,
  rate: ExactAmount,
): bigint {
  const exact = multiplyFractions(
    exactAmountFromInteger(baseAmountFcfa),
    rate,
  );
  return roundFractionToStepHalfUp(exact, 1n);
}

/**
 * Valide un breakdown.
 * `strictComponentAmounts` : exige amountFcfa = half-up(assiette × taux).
 * Désactivé sur le résultat d’agrégation car Σ round ≠ round(Σ) en général.
 */
function assertBreakdownInvariants(
  breakdown: PeriodEmployerCostBreakdown,
  options?: { strictComponentAmounts?: boolean },
): void {
  const strictComponentAmounts = options?.strictComponentAmounts !== false;

  assertNonNegativeFcfa(
    breakdown.monthlyGrossIncreaseFcfa,
    "monthlyGrossIncreaseFcfa",
  );
  assertNonNegativeFcfa(
    breakdown.periodGrossImpactFcfa,
    "periodGrossImpactFcfa",
  );
  assertNonNegativeFcfa(
    breakdown.periodEmployerChargesFcfa,
    "periodEmployerChargesFcfa",
  );
  assertNonNegativeFcfa(
    breakdown.periodEmployerCompleteCostFcfa,
    "periodEmployerCompleteCostFcfa",
  );
  if (breakdown.fullYearGrossRunRateFcfa !== null) {
    assertNonNegativeFcfa(
      breakdown.fullYearGrossRunRateFcfa,
      "fullYearGrossRunRateFcfa",
    );
  }

  if (breakdown.policyKind === "neutral") {
    if (
      breakdown.periodEmployerChargesFcfa !== 0n ||
      breakdown.chargeComponents.length !== 0
    ) {
      throw new EmployerPeriodCostError(
        "INVALID_EMPLOYER_COST_BREAKDOWN",
        "Incohérence : politique neutre avec charges non nulles.",
      );
    }
  }

  for (const component of breakdown.chargeComponents) {
    assertCategoryId(component.categoryId);
    assertNonNegativeRate(component.rate);
    assertNonNegativeFcfa(component.baseAmountFcfa, "baseAmountFcfa");
    assertNonNegativeFcfa(component.amountFcfa, "amountFcfa");

    if (component.baseAmountFcfa !== breakdown.periodGrossImpactFcfa) {
      // Sur un agrégat, une composante peut ne provenir que d’un sous-ensemble
      // de lignes (ex. politique mixed) : la stricte égalité ne s’applique
      // qu’aux breakdowns sources.
      if (strictComponentAmounts) {
        throw new EmployerPeriodCostError(
          "INVALID_EMPLOYER_COST_BREAKDOWN",
          "Incohérence : baseAmountFcfa de la composante ≠ periodGrossImpactFcfa.",
        );
      }
    }

    if (strictComponentAmounts) {
      const expectedAmount = roundChargeAmountFcfa(
        breakdown.periodGrossImpactFcfa,
        component.rate,
      );
      if (component.amountFcfa !== expectedAmount) {
        throw new EmployerPeriodCostError(
          "INVALID_EMPLOYER_COST_BREAKDOWN",
          "Incohérence : amountFcfa ≠ arrondi half-up de (assiette × taux).",
        );
      }
    }
  }

  const componentsSum = breakdown.chargeComponents.reduce(
    (sum, component) => sum + component.amountFcfa,
    0n,
  );
  if (componentsSum !== breakdown.periodEmployerChargesFcfa) {
    throw new EmployerPeriodCostError(
      "INVALID_EMPLOYER_COST_BREAKDOWN",
      "Incohérence : la somme des composantes de charges ≠ charges totales.",
    );
  }
  if (
    breakdown.periodGrossImpactFcfa + breakdown.periodEmployerChargesFcfa !==
    breakdown.periodEmployerCompleteCostFcfa
  ) {
    throw new EmployerPeriodCostError(
      "INVALID_EMPLOYER_COST_BREAKDOWN",
      "Incohérence : coût complet ≠ brut période + charges.",
    );
  }
}

/**
 * Calcule le coût employeur de période à partir d’un impact brut déjà arrêté.
 * Ne recalcule pas le nombre de mois ni le prorata.
 */
export function calculatePeriodEmployerCost(
  input: PeriodGrossSalaryImpactInput,
  policy: EmployerCostPolicy,
): PeriodEmployerCostBreakdown {
  assertNonNegativeFcfa(input.monthlyGrossIncreaseFcfa, "monthlyGrossIncreaseFcfa");
  assertNonNegativeFcfa(input.periodGrossImpactFcfa, "periodGrossImpactFcfa");
  if (input.fullYearGrossRunRateFcfa !== undefined) {
    assertNonNegativeFcfa(
      input.fullYearGrossRunRateFcfa,
      "fullYearGrossRunRateFcfa",
    );
  }

  const fullYearGrossRunRateFcfa =
    input.fullYearGrossRunRateFcfa === undefined
      ? null
      : input.fullYearGrossRunRateFcfa;

  if (policy.kind === "neutral") {
    const breakdown: PeriodEmployerCostBreakdown = {
      monthlyGrossIncreaseFcfa: input.monthlyGrossIncreaseFcfa,
      fullYearGrossRunRateFcfa,
      periodGrossImpactFcfa: input.periodGrossImpactFcfa,
      periodEmployerChargesFcfa: 0n,
      periodEmployerCompleteCostFcfa: input.periodGrossImpactFcfa,
      chargeComponents: [],
      policyKind: "neutral",
    };
    assertBreakdownInvariants(breakdown);
    return breakdown;
  }

  if (policy.kind !== "rate_on_gross_period") {
    throw new EmployerPeriodCostError(
      "UNSUPPORTED_EMPLOYER_COST_POLICY",
      `Politique de coût employeur non supportée : ${String((policy as { kind: string }).kind)}.`,
    );
  }

  validateRateOnGrossComponents(policy.components);

  const baseAmountFcfa = input.periodGrossImpactFcfa;
  const chargeComponents: EmployerChargeComponent[] = policy.components.map(
    (component) => ({
      categoryId: component.categoryId,
      baseAmountFcfa,
      rate: {
        numerator: component.rate.numerator,
        denominator: component.rate.denominator,
      },
      amountFcfa: roundChargeAmountFcfa(baseAmountFcfa, component.rate),
    }),
  );

  let periodEmployerChargesFcfa = 0n;
  for (const component of chargeComponents) {
    periodEmployerChargesFcfa += component.amountFcfa;
  }

  const breakdown: PeriodEmployerCostBreakdown = {
    monthlyGrossIncreaseFcfa: input.monthlyGrossIncreaseFcfa,
    fullYearGrossRunRateFcfa,
    periodGrossImpactFcfa: input.periodGrossImpactFcfa,
    periodEmployerChargesFcfa,
    periodEmployerCompleteCostFcfa:
      input.periodGrossImpactFcfa + periodEmployerChargesFcfa,
    chargeComponents,
    policyKind: "rate_on_gross_period",
  };
  assertBreakdownInvariants(breakdown);
  return breakdown;
}

function componentKey(component: EmployerChargeComponent): string {
  return `${component.categoryId}|${component.rate.numerator}/${component.rate.denominator}`;
}

/**
 * Agrège des décompositions de coût employeur de période.
 * Fusionne les composantes uniquement si catégorie et taux sont identiques.
 */
export function aggregatePeriodEmployerCostBreakdowns(
  rows: readonly PeriodEmployerCostBreakdown[],
): PeriodEmployerCostBreakdown {
  if (rows.length === 0) {
    return {
      monthlyGrossIncreaseFcfa: 0n,
      fullYearGrossRunRateFcfa: null,
      periodGrossImpactFcfa: 0n,
      periodEmployerChargesFcfa: 0n,
      periodEmployerCompleteCostFcfa: 0n,
      chargeComponents: [],
      policyKind: "neutral",
    };
  }

  for (const row of rows) {
    assertBreakdownInvariants(row, { strictComponentAmounts: true });
  }

  let monthlyGrossIncreaseFcfa = 0n;
  let periodGrossImpactFcfa = 0n;
  let periodEmployerChargesFcfa = 0n;
  let periodEmployerCompleteCostFcfa = 0n;
  let fullYearSum = 0n;
  let fullYearAllPresent = true;
  const firstPolicyKind = rows[0]!.policyKind;
  let policyKind: AggregatedEmployerCostPolicyKind = firstPolicyKind;

  const merged = new Map<
    string,
    {
      categoryId: EmployerChargeCategoryId;
      rate: ExactAmount;
      amountFcfa: bigint;
      baseAmountFcfa: bigint;
    }
  >();

  for (const row of rows) {
    monthlyGrossIncreaseFcfa += row.monthlyGrossIncreaseFcfa;
    periodGrossImpactFcfa += row.periodGrossImpactFcfa;
    periodEmployerChargesFcfa += row.periodEmployerChargesFcfa;
    periodEmployerCompleteCostFcfa += row.periodEmployerCompleteCostFcfa;

    if (row.policyKind !== firstPolicyKind) {
      policyKind = "mixed";
    }

    if (row.fullYearGrossRunRateFcfa === null) {
      fullYearAllPresent = false;
    } else if (fullYearAllPresent) {
      fullYearSum += row.fullYearGrossRunRateFcfa;
    }

    for (const component of row.chargeComponents) {
      assertCategoryId(component.categoryId);
      assertNonNegativeRate(component.rate);
      const key = componentKey(component);
      const existing = merged.get(key);
      if (existing === undefined) {
        // Rechercher un conflit même catégorie / taux différent.
        for (const other of merged.values()) {
          if (
            other.categoryId === component.categoryId &&
            !fractionsEqual(other.rate, component.rate)
          ) {
            throw new EmployerPeriodCostError(
              "INCOMPATIBLE_EMPLOYER_CHARGE_COMPONENTS",
              `Composantes incompatibles pour ${component.categoryId} : taux distincts lors de l’agrégation.`,
            );
          }
        }
        merged.set(key, {
          categoryId: component.categoryId,
          rate: {
            numerator: component.rate.numerator,
            denominator: component.rate.denominator,
          },
          amountFcfa: component.amountFcfa,
          baseAmountFcfa: component.baseAmountFcfa,
        });
      } else {
        existing.amountFcfa += component.amountFcfa;
        existing.baseAmountFcfa += component.baseAmountFcfa;
      }
    }
  }

  const chargeComponents: EmployerChargeComponent[] = [...merged.values()]
    .sort((left, right) =>
      left.categoryId < right.categoryId
        ? -1
        : left.categoryId > right.categoryId
          ? 1
          : 0,
    )
    .map((entry) => ({
      categoryId: entry.categoryId,
      baseAmountFcfa: entry.baseAmountFcfa,
      rate: entry.rate,
      amountFcfa: entry.amountFcfa,
    }));

  const breakdown: PeriodEmployerCostBreakdown = {
    monthlyGrossIncreaseFcfa,
    fullYearGrossRunRateFcfa: fullYearAllPresent ? fullYearSum : null,
    periodGrossImpactFcfa,
    periodEmployerChargesFcfa,
    periodEmployerCompleteCostFcfa,
    chargeComponents,
    policyKind,
  };
  // Résultat agrégé : ne pas réimposer amount = round(Σbase × taux)
  // (Σ round ≠ round(Σ) avec half-up).
  assertBreakdownInvariants(breakdown, { strictComponentAmounts: false });
  return breakdown;
}
