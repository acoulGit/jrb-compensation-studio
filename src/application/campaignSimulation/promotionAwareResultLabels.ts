/**
 * Libellés de restitution H2C-2B (purs, sans recalcul métier).
 * Distingue promotion / complément / ancienneté — jamais « rappel de promotion ».
 */

import {
  hasMinimumSeniorityAtDecemberNMinus1,
  technicalApplicationMonthLabelFr,
  type EmployeeCompensationCalculationResult,
  type MonthlyCompensationTrajectoryEntry,
  type PromotionBudgetEmploymentStatus,
  type PromotionCampaignCostPreview,
  type PromotionEvent,
} from "../../domain/compensationCalculation";

export type PromotionDisplayStatusKind =
  | "none"
  | "prior_year"
  | "included"
  | "excluded_after_application"
  | "outside_budget_population";

export type CompensatoryEligibilityDisplayKind =
  | "eligible"
  | "not_eligible"
  | "confirmed_underperformer";

export type CompensatoryIneligibilityReasonKind =
  | "ineligible_contract_type"
  | "insufficient_seniority"
  | "external_availability"
  | "confirmed_underperformer"
  | "explicit_exclusion"
  | "outside_population"
  | null;

const COMPENSATORY_ELIGIBLE_CONTRACTS = new Set(["cdi", "cdd"]);

/** Libellé court du statut de promotion (colonne tableau). */
export function formatPromotionStatusLabel(input: {
  promotion: PromotionEvent | null;
  promotionYear: number | null;
  promotionMonth: number | null;
  campaignYear: number;
  promotionInclusion: PromotionCampaignCostPreview;
  isPromotionBudgetPopulationEmployee: boolean;
}): string {
  if (input.promotion === null) {
    return "Aucune";
  }
  if (input.promotionInclusion.exclusionReason === "EXCLUDED_AFTER_TECHNICAL_APPLICATION_MONTH") {
    return "Exclue après application";
  }
  if (
    input.promotionInclusion.includedInSimulation &&
    !input.isPromotionBudgetPopulationEmployee
  ) {
    return "Hors population budgétaire";
  }
  if (
    !input.promotionInclusion.includedInSimulation &&
    input.promotionInclusion.exclusionReason === null
  ) {
    return "Aucune";
  }
  if (
    input.promotionYear !== null &&
    input.promotionYear === input.campaignYear - 1
  ) {
    return "N-1";
  }
  if (input.promotionMonth !== null && input.promotionYear !== null) {
    return `${technicalApplicationMonthLabelFr(input.promotionMonth)} ${input.promotionYear}`;
  }
  return "Incluse";
}

export function promotionStatusKind(input: {
  promotion: PromotionEvent | null;
  promotionYear: number | null;
  promotionInclusion: PromotionCampaignCostPreview;
  isPromotionBudgetPopulationEmployee: boolean;
  campaignYear: number;
}): PromotionDisplayStatusKind {
  if (input.promotion === null) return "none";
  if (input.promotionInclusion.exclusionReason === "EXCLUDED_AFTER_TECHNICAL_APPLICATION_MONTH") {
    return "excluded_after_application";
  }
  if (
    input.promotionInclusion.includedInSimulation &&
    !input.isPromotionBudgetPopulationEmployee
  ) {
    return "outside_budget_population";
  }
  if (!input.promotionInclusion.includedInSimulation) return "none";
  if (
    input.promotionYear !== null &&
    input.promotionYear === input.campaignYear - 1
  ) {
    return "prior_year";
  }
  return "included";
}

export function formatCompensatoryEligibilityLabel(input: {
  compensatoryMeasureEligible: boolean;
  blockingReason: string | null | undefined;
}): string {
  if (input.blockingReason === "CONFIRMED_UNDERPERFORMER") {
    return "Sous-performant confirmé";
  }
  return input.compensatoryMeasureEligible ? "Éligible" : "Non éligible";
}

export function compensatoryEligibilityKind(input: {
  compensatoryMeasureEligible: boolean;
  blockingReason: string | null | undefined;
}): CompensatoryEligibilityDisplayKind {
  if (input.blockingReason === "CONFIRMED_UNDERPERFORMER") {
    return "confirmed_underperformer";
  }
  return input.compensatoryMeasureEligible ? "eligible" : "not_eligible";
}

/**
 * Motif d’inéligibilité lisible — dérivé des mêmes prédicats documentés,
 * sans modifier les montants moteur.
 */
export function resolveCompensatoryIneligibilityReason(input: {
  compensatoryMeasureEligible: boolean;
  blockingReason: string | null | undefined;
  contractType: string | null | undefined;
  hireDate: string;
  campaignYear: number;
  employmentStatus: PromotionBudgetEmploymentStatus | string | null | undefined;
  explicitExclusion?: boolean;
}): CompensatoryIneligibilityReasonKind {
  if (input.compensatoryMeasureEligible) {
    return null;
  }
  if (input.blockingReason === "CONFIRMED_UNDERPERFORMER") {
    return "confirmed_underperformer";
  }
  if (input.explicitExclusion === true) {
    return "explicit_exclusion";
  }
  if (input.employmentStatus === "external_availability") {
    return "external_availability";
  }
  if (
    input.contractType !== undefined &&
    input.contractType !== null &&
    input.contractType !== ""
  ) {
    const contract = input.contractType.trim().toLowerCase();
    if (!COMPENSATORY_ELIGIBLE_CONTRACTS.has(contract)) {
      return "ineligible_contract_type";
    }
  }
  if (!hasMinimumSeniorityAtDecemberNMinus1(input.hireDate, input.campaignYear)) {
    return "insufficient_seniority";
  }
  return "outside_population";
}

export function formatCompensatoryIneligibilityReasonLabel(
  reason: CompensatoryIneligibilityReasonKind,
): string | null {
  switch (reason) {
    case "ineligible_contract_type":
      return "Type de contrat non éligible";
    case "insufficient_seniority":
      return "Ancienneté inférieure à 12 mois au 31 décembre N-1";
    case "external_availability":
      return "Disponibilité externe";
    case "confirmed_underperformer":
      return "Sous-performant confirmé";
    case "explicit_exclusion":
      return "Exclusion explicite de la mesure";
    case "outside_population":
      return "Salarié hors population";
    case null:
      return null;
  }
}

export function formatPromotionPaymentStatusLabel(
  entry: Pick<
    MonthlyCompensationTrajectoryEntry,
    | "promotionActive"
    | "promotionBudgetCostFcfa"
    | "month"
    | "paymentTiming"
    | "coveredByCampaignPeriod"
  >,
  technicalApplicationMonth: number,
): string {
  if (
    entry.paymentTiming === "outside_campaign" ||
    entry.coveredByCampaignPeriod === false
  ) {
    return "Hors période";
  }
  if (!entry.promotionActive || entry.promotionBudgetCostFcfa === 0n) {
    return "Non applicable";
  }
  if (entry.month < technicalApplicationMonth) {
    return "Déjà payée";
  }
  return "Période courante";
}

export function formatCompensatoryPaymentStatusLabel(
  paymentTiming: "outside_campaign" | "reminder" | "direct",
): string {
  if (paymentTiming === "outside_campaign") {
    return "Hors période";
  }
  return paymentTiming === "reminder" ? "Rappel" : "Paiement direct";
}

export function formatPromotionInclusionStatusLabel(
  inclusion: PromotionCampaignCostPreview,
): string {
  if (inclusion.exclusionReason === "EXCLUDED_AFTER_TECHNICAL_APPLICATION_MONTH") {
    return "Exclue après le mois d’application";
  }
  return inclusion.includedInSimulation ? "Incluse dans la simulation" : "Non incluse";
}

export function readTechnicalMonthTrajectoryEntry(
  employee: EmployeeCompensationCalculationResult,
): MonthlyCompensationTrajectoryEntry | null {
  const month = employee.technicalApplicationMonth;
  return (
    employee.monthlyCompensationTrajectory.find((entry) => entry.month === month) ??
    null
  );
}
