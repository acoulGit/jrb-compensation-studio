/**
 * Messages d’erreur métier dédiés (Lot 2A-H2C-2B).
 * Préserve les codes PROMOTION_COST_EXCEEDS_BUDGET /
 * NO_COMPENSATORY_ALLOCATION_CAPACITY sans message technique générique.
 * Reconnaissance uniquement par `issue.code` — jamais par texte de message.
 */

import type { CampaignSimulationExecutionIssue } from "./campaignSimulationExecutionModels";
import {
  formatExactAmountAsFcfa,
  formatFcfaInteger,
  formatSignedExactAmountAsFcfa,
} from "./formatExactBudgetDisplay";

export interface DedicatedSimulationBusinessError {
  code: "PROMOTION_COST_EXCEEDS_BUDGET" | "NO_COMPENSATORY_ALLOCATION_CAPACITY";
  title: string;
  message: string;
  details: readonly { label: string; value: string }[];
}

function detailString(
  details: CampaignSimulationExecutionIssue["details"],
  key: string,
): string | null {
  if (!details) return null;
  const value = details[key];
  if (value === null || value === undefined) return null;
  return String(value);
}

function formatBudgetish(raw: string | null): string {
  if (raw === null || raw === "") return "—";
  if (/^-?\d+$/.test(raw)) {
    try {
      return formatFcfaInteger(BigInt(raw));
    } catch {
      return raw;
    }
  }
  // Fraction canonique "num/den"
  const match = /^(-?\d+)\/(\d+)$/.exec(raw);
  if (match) {
    return formatExactAmountAsFcfa({
      numerator: BigInt(match[1]!),
      denominator: BigInt(match[2]!),
    });
  }
  return raw;
}

const NO_CAPACITY_USER_MESSAGE =
  "Un budget reste disponible après prise en compte des promotions, mais aucun salarié éligible ne présente une capacité d’allocation positive. Réduisez l’enveloppe disponible ou revoyez la population et les règles d’éligibilité au complément compensatoire.";

export function findDedicatedSimulationBusinessError(
  issues: readonly CampaignSimulationExecutionIssue[],
): DedicatedSimulationBusinessError | null {
  const promotion = issues.find(
    (issue) => issue.code === "PROMOTION_COST_EXCEEDS_BUDGET",
  );
  if (promotion) {
    const budget = formatBudgetish(
      detailString(promotion.details, "annualBudgetTargetFcfa"),
    );
    const cost = formatBudgetish(
      detailString(promotion.details, "totalAnnualPromotionBudgetCostFcfa"),
    );
    const overrunRaw = detailString(promotion.details, "overrunFcfa");
    let overrun = overrunRaw ? formatBudgetish(overrunRaw) : "—";
    if (overrunRaw && /^(-?\d+)\/(\d+)$/.exec(overrunRaw)) {
      const match = /^(-?\d+)\/(\d+)$/.exec(overrunRaw)!;
      overrun = formatSignedExactAmountAsFcfa({
        numerator: BigInt(match[1]!),
        denominator: BigInt(match[2]!),
      });
    }
    return {
      code: "PROMOTION_COST_EXCEEDS_BUDGET",
      title: "Le coût des promotions dépasse l’enveloppe",
      message:
        "Augmentez le budget ou revoyez la population des promotions incluse dans cette campagne.",
      details: [
        { label: "Budget cible", value: budget },
        { label: "Coût des promotions", value: cost },
        { label: "Dépassement exact", value: overrun },
      ],
    };
  }

  const capacity = issues.find(
    (issue) => issue.code === "NO_COMPENSATORY_ALLOCATION_CAPACITY",
  );
  if (capacity) {
    const budgetTarget = formatBudgetish(
      detailString(capacity.details, "annualBudgetTargetFcfa"),
    );
    const promotionCost = formatBudgetish(
      detailString(capacity.details, "totalAnnualPromotionBudgetCostFcfa"),
    );
    const available = formatBudgetish(
      detailString(capacity.details, "availableAnnualCompensatoryBudgetFcfa"),
    );
    const exposureCount =
      detailString(capacity.details, "eligibleExposureCount") ?? "—";

    return {
      code: "NO_COMPENSATORY_ALLOCATION_CAPACITY",
      title: "Aucun salarié ne peut recevoir le reliquat du budget",
      message: NO_CAPACITY_USER_MESSAGE,
      details: [
        { label: "Budget cible", value: budgetTarget },
        { label: "Coût des promotions", value: promotionCost },
        { label: "Budget disponible pour le complément", value: available },
        { label: "Expositions éligibles", value: exposureCount },
      ],
    };
  }

  return null;
}
