/**
 * Parsing exact des saisies de configuration de simulation (Lot 2B-2).
 * Aucun Number / parseFloat pour les montants métier.
 */

import type { BudgetTargetInput } from "../../domain/compensationCalculation";
import type {
  EmployerCostPolicy,
  ExactAmount,
  MinimumIncreaseMode,
  MinimumIncreasePolicy,
  RoundingPolicy,
  SocialMechanismKind,
  UniversalFixedAmountPolicy,
} from "../../domain/compensationCalculation";
import {
  DEFAULT_EMPLOYER_COST_COMPONENT_LIABILITY,
  EMPLOYER_CHARGE_CATEGORY_UNSPECIFIED_BUNDLE,
  MINIMUM_INCREASE_MODES,
  NO_MINIMUM_INCREASE_POLICY,
  NO_UNIVERSAL_FIXED_AMOUNT_POLICY,
  SOCIAL_MECHANISM_KINDS,
  defaultUniversalFixedAmountSeniorityReferenceDate,
  deriveSocialMechanismKindFromMinimumIncreaseMode,
  isSocialMechanismKind,
  minimumIncreaseRateFromPercentParts,
  parseSeniorityReferenceDateIso,
  reduceFraction,
} from "../../domain/compensationCalculation";
import type { SimulationConfigurationCode } from "./simulationConfigurationCodes";

export interface ParseSuccess<T> {
  ok: true;
  value: T;
}

export interface ParseFailure {
  ok: false;
  code: SimulationConfigurationCode;
  message: string;
}

export type ParseResult<T> = ParseSuccess<T> | ParseFailure;

/** Espaces autorisés comme séparateurs visuels (simples ou insécables). */
const ALLOWED_SPACES = /[\u0020\u00A0\u202F]/g;

function stripAllowedSpaces(raw: string): string {
  return raw.replace(ALLOWED_SPACES, "");
}

/**
 * Parse un montant FCFA entier ≥ 0 en bigint.
 * Accepte espaces / NBSP ; refuse décimales et texte.
 */
export function parseNonNegativeFcfaAmount(
  raw: string | null | undefined,
  options: {
    missingCode: SimulationConfigurationCode;
    invalidCode: SimulationConfigurationCode;
    fieldLabel: string;
    required?: boolean;
  },
): ParseResult<bigint> {
  const required = options.required !== false;
  if (raw === null || raw === undefined) {
    return {
      ok: false,
      code: options.missingCode,
      message: `${options.fieldLabel} est obligatoire.`,
    };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      ok: false,
      code: required ? options.missingCode : options.invalidCode,
      message: required
        ? `${options.fieldLabel} est obligatoire.`
        : `${options.fieldLabel} est vide.`,
    };
  }

  const compact = stripAllowedSpaces(trimmed);
  if (compact.includes(".") || compact.includes(",")) {
    return {
      ok: false,
      code: options.invalidCode,
      message: `${options.fieldLabel} doit être un entier FCFA (sans décimale).`,
    };
  }
  if (!/^\d+$/.test(compact)) {
    if (compact.startsWith("-")) {
      return {
        ok: false,
        code: options.invalidCode,
        message: `${options.fieldLabel} ne peut pas être négatif.`,
      };
    }
    return {
      ok: false,
      code: options.invalidCode,
      message: `${options.fieldLabel} doit être un entier FCFA ≥ 0.`,
    };
  }

  try {
    const value = BigInt(compact);
    if (value < 0n) {
      return {
        ok: false,
        code: options.invalidCode,
        message: `${options.fieldLabel} ne peut pas être négatif.`,
      };
    }
    return { ok: true, value };
  } catch {
    return {
      ok: false,
      code: options.invalidCode,
      message: `${options.fieldLabel} est invalide.`,
    };
  }
}

/**
 * Parse un taux % (max 2 décimales) → basis points entiers.
 * Ex. 4 → 400 ; 4,5 → 450 ; 4.25 → 425. Aucun flottant.
 */
export function parseBudgetRatePercentToBps(
  raw: string | null | undefined,
): ParseResult<bigint> {
  if (raw === null || raw === undefined) {
    return {
      ok: false,
      code: "MISSING_BUDGET_RATE",
      message: "Le taux du budget est obligatoire.",
    };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      ok: false,
      code: "MISSING_BUDGET_RATE",
      message: "Le taux du budget est obligatoire.",
    };
  }

  const compact = stripAllowedSpaces(trimmed);
  if (compact.startsWith("-")) {
    return {
      ok: false,
      code: "INVALID_BUDGET_RATE",
      message: "Le taux du budget ne peut pas être négatif.",
    };
  }

  const separators = compact.match(/[.,]/g) ?? [];
  if (separators.length > 1) {
    return {
      ok: false,
      code: "INVALID_BUDGET_RATE",
      message: "Le taux du budget ne doit contenir qu’un seul séparateur décimal.",
    };
  }

  const match = /^(\d+)(?:[.,](\d+))?$/.exec(compact);
  if (!match) {
    return {
      ok: false,
      code: "INVALID_BUDGET_RATE",
      message: "Le taux du budget doit être un nombre (ex. 4 ou 4,25).",
    };
  }

  const intPart = match[1] ?? "0";
  const fracPart = match[2] ?? "";
  if (fracPart.length > 2) {
    return {
      ok: false,
      code: "INVALID_BUDGET_RATE",
      message:
        "Le taux du budget accepte au maximum deux décimales (aucun arrondi).",
    };
  }

  const paddedFrac = fracPart.padEnd(2, "0");
  const bps = BigInt(intPart) * 100n + BigInt(paddedFrac || "0");
  return { ok: true, value: bps };
}

/**
 * Parse le pas d’arrondi : entier strictement > 0.
 */
export function parseRoundingStepFcfa(
  raw: string | null | undefined,
): ParseResult<bigint> {
  if (raw === null || raw === undefined || !raw.trim()) {
    return {
      ok: false,
      code: "MISSING_ROUNDING_STEP",
      message: "Le pas d’arrondi est obligatoire.",
    };
  }
  const compact = stripAllowedSpaces(raw.trim());
  if (compact.includes(".") || compact.includes(",")) {
    return {
      ok: false,
      code: "INVALID_ROUNDING_STEP",
      message: "Le pas d’arrondi doit être un entier FCFA (sans décimale).",
    };
  }
  if (!/^\d+$/.test(compact)) {
    return {
      ok: false,
      code: "INVALID_ROUNDING_STEP",
      message: "Le pas d’arrondi doit être un entier strictement positif.",
    };
  }
  const value = BigInt(compact);
  if (value <= 0n) {
    return {
      ok: false,
      code: "INVALID_ROUNDING_STEP",
      message: "Le pas d’arrondi doit être strictement supérieur à zéro.",
    };
  }
  return { ok: true, value };
}

/**
 * Parse une année de campagne (entier 4 chiffres, plage raisonnable).
 * Déterministe : aucune dépendance à Date.now().
 */
export function parseCampaignYearInput(
  raw: string | null | undefined,
): ParseResult<number> {
  if (raw === null || raw === undefined || raw.trim() === "") {
    return {
      ok: false,
      code: "MISSING_CAMPAIGN_YEAR",
      message: "L’année de campagne est obligatoire.",
    };
  }
  const compact = stripAllowedSpaces(raw.trim());
  if (!/^\d{4}$/.test(compact)) {
    return {
      ok: false,
      code: "INVALID_CAMPAIGN_YEAR",
      message: "L’année de campagne doit être un entier sur 4 chiffres.",
    };
  }
  const value = Number(compact);
  if (!Number.isInteger(value) || value < 2000 || value > 2100) {
    return {
      ok: false,
      code: "INVALID_CAMPAIGN_YEAR",
      message: "L’année de campagne doit être comprise entre 2000 et 2100.",
    };
  }
  return { ok: true, value };
}

/** Parse le mois d’application technique (1 = janvier … 12 = décembre). */
export function parseTechnicalApplicationMonthInput(
  raw: string | null | undefined,
): ParseResult<number> {
  if (raw === null || raw === undefined || raw.trim() === "") {
    return {
      ok: false,
      code: "MISSING_TECHNICAL_APPLICATION_MONTH",
      message: "Le mois d’application technique est obligatoire.",
    };
  }
  const compact = stripAllowedSpaces(raw.trim());
  if (!/^\d{1,2}$/.test(compact)) {
    return {
      ok: false,
      code: "INVALID_TECHNICAL_APPLICATION_MONTH",
      message:
        "Le mois d’application technique doit être un entier entre 1 et 12.",
    };
  }
  const value = Number(compact);
  if (!Number.isInteger(value) || value < 1 || value > 12) {
    return {
      ok: false,
      code: "INVALID_TECHNICAL_APPLICATION_MONTH",
      message:
        "Le mois d’application technique doit être un entier entre 1 et 12.",
    };
  }
  return { ok: true, value };
}

/** Parse le mois d’effet du minimum garanti (1 = janvier … 12 = décembre). */
export function parseMinimumGuaranteeEffectiveMonthInput(
  raw: string | null | undefined,
): ParseResult<number> {
  if (raw === null || raw === undefined || raw.trim() === "") {
    return {
      ok: false,
      code: "MISSING_MINIMUM_GUARANTEE_EFFECTIVE_MONTH",
      message: "Le mois d’effet du minimum garanti est obligatoire.",
    };
  }
  const compact = stripAllowedSpaces(raw.trim());
  if (!/^\d{1,2}$/.test(compact)) {
    return {
      ok: false,
      code: "INVALID_MINIMUM_GUARANTEE_EFFECTIVE_MONTH",
      message:
        "Le mois d’effet du minimum garanti doit être compris entre janvier et décembre.",
    };
  }
  const value = Number(compact);
  if (!Number.isInteger(value) || value < 1 || value > 12) {
    return {
      ok: false,
      code: "INVALID_MINIMUM_GUARANTEE_EFFECTIVE_MONTH",
      message:
        "Le mois d’effet du minimum garanti doit être compris entre janvier et décembre.",
    };
  }
  return { ok: true, value };
}

/** Parse le mois de début de rétroactivité (1 = janvier … 12 = décembre). */
export function parseRetroactivityStartMonthInput(
  raw: string | null | undefined,
): ParseResult<number> {
  if (raw === null || raw === undefined || raw.trim() === "") {
    return {
      ok: false,
      code: "MISSING_RETROACTIVITY_START_MONTH",
      message: "Le mois de début de rétroactivité est obligatoire.",
    };
  }
  const compact = stripAllowedSpaces(raw.trim());
  if (!/^\d{1,2}$/.test(compact)) {
    return {
      ok: false,
      code: "INVALID_RETROACTIVITY_START_MONTH",
      message:
        "Le mois de début de rétroactivité doit être un entier entre 1 et 12.",
    };
  }
  const value = Number(compact);
  if (!Number.isInteger(value) || value < 1 || value > 12) {
    return {
      ok: false,
      code: "INVALID_RETROACTIVITY_START_MONTH",
      message:
        "Le mois de début de rétroactivité doit être un entier entre 1 et 12.",
    };
  }
  return { ok: true, value };
}

/**
 * Parse un taux % de minimum garanti → fraction exacte.
 * 3 → 3/100 ; 2,5 → 25/1000 = 1/40. Refuse scientifique / zéro / négatif.
 */
export function parseMinimumIncreaseRatePercentInput(
  raw: string | null | undefined,
): ParseResult<ReturnType<typeof reduceFraction>> {
  if (raw === null || raw === undefined || raw.trim() === "") {
    return {
      ok: false,
      code: "MISSING_MINIMUM_INCREASE_RATE",
      message: "Le taux du minimum garanti est obligatoire.",
    };
  }
  const trimmed = raw.trim();
  const compact = stripAllowedSpaces(trimmed);
  if (/[eE]/.test(compact)) {
    return {
      ok: false,
      code: "INVALID_MINIMUM_INCREASE_RATE",
      message:
        "Le taux du minimum garanti ne doit pas utiliser la notation scientifique.",
    };
  }
  if (compact.startsWith("-")) {
    return {
      ok: false,
      code: "INVALID_MINIMUM_INCREASE_RATE",
      message: "Le taux du minimum garanti ne peut pas être négatif.",
    };
  }
  const separators = compact.match(/[.,]/g) ?? [];
  if (separators.length > 1) {
    return {
      ok: false,
      code: "INVALID_MINIMUM_INCREASE_RATE",
      message:
        "Le taux du minimum garanti ne doit contenir qu’un seul séparateur décimal.",
    };
  }
  const match = /^(\d+)(?:[.,](\d+))?$/.exec(compact);
  if (!match) {
    return {
      ok: false,
      code: "INVALID_MINIMUM_INCREASE_RATE",
      message: "Le taux du minimum garanti doit être un nombre (ex. 3 ou 2,5).",
    };
  }
  const intPart = BigInt(match[1] ?? "0");
  const fracPart = match[2] ?? "";
  const rate = minimumIncreaseRateFromPercentParts(intPart, fracPart);
  if (rate.numerator <= 0n) {
    return {
      ok: false,
      code: "INVALID_MINIMUM_INCREASE_RATE",
      message: "Le taux du minimum garanti doit être strictement positif.",
    };
  }
  return { ok: true, value: rate };
}

/**
 * Parse un taux % de charge employeur → fraction exacte (≥ 0).
 * Au plus deux décimales (comme le taux budget). Aucun plafond métier.
 * 0 → 0/1 ; 3 → 3/100 ; 4,25 → 17/400.
 */
export function parseEmployerCostRatePercentInput(
  raw: string | null | undefined,
): ParseResult<ExactAmount> {
  if (raw === null || raw === undefined || raw.trim() === "") {
    return {
      ok: false,
      code: "MISSING_EMPLOYER_COST_RATE",
      message: "Le taux de charge employeur est obligatoire.",
    };
  }
  const trimmed = raw.trim();
  const compact = stripAllowedSpaces(trimmed);
  if (/[eE]/.test(compact)) {
    return {
      ok: false,
      code: "INVALID_EMPLOYER_COST_RATE",
      message:
        "Le taux de charge employeur ne doit pas utiliser la notation scientifique.",
    };
  }
  if (compact.startsWith("-")) {
    return {
      ok: false,
      code: "INVALID_EMPLOYER_COST_RATE",
      message: "Le taux de charge employeur ne peut pas être négatif.",
    };
  }
  const separators = compact.match(/[.,]/g) ?? [];
  if (separators.length > 1) {
    return {
      ok: false,
      code: "INVALID_EMPLOYER_COST_RATE",
      message:
        "Le taux de charge employeur ne doit contenir qu’un seul séparateur décimal.",
    };
  }
  const match = /^(\d+)(?:[.,](\d+))?$/.exec(compact);
  if (!match) {
    return {
      ok: false,
      code: "INVALID_EMPLOYER_COST_RATE",
      message: "Le taux de charge employeur doit être un nombre (ex. 10 ou 12,5).",
    };
  }
  const fracPart = match[2] ?? "";
  if (fracPart.length > 2) {
    return {
      ok: false,
      code: "INVALID_EMPLOYER_COST_RATE",
      message:
        "Le taux de charge employeur accepte au maximum deux décimales (aucun arrondi).",
    };
  }
  const intPart = BigInt(match[1] ?? "0");
  const rate = minimumIncreaseRateFromPercentParts(intPart, fracPart);
  if (rate.numerator < 0n) {
    return {
      ok: false,
      code: "INVALID_EMPLOYER_COST_RATE",
      message: "Le taux de charge employeur ne peut pas être négatif.",
    };
  }
  return { ok: true, value: rate };
}

/** Parse le montant forfaitaire du minimum (entier FCFA strictement > 0). */
export function parseMinimumMonthlyAmountInput(
  raw: string | null | undefined,
): ParseResult<bigint> {
  if (raw === null || raw === undefined || !raw.trim()) {
    return {
      ok: false,
      code: "MISSING_MINIMUM_MONTHLY_AMOUNT",
      message: "Le montant forfaitaire du minimum garanti est obligatoire.",
    };
  }
  const compact = stripAllowedSpaces(raw.trim());
  if (/[eE]/.test(compact)) {
    return {
      ok: false,
      code: "INVALID_MINIMUM_MONTHLY_AMOUNT",
      message:
        "Le montant forfaitaire ne doit pas utiliser la notation scientifique.",
    };
  }
  if (compact.includes(".") || compact.includes(",")) {
    return {
      ok: false,
      code: "INVALID_MINIMUM_MONTHLY_AMOUNT",
      message: "Le montant forfaitaire doit être un entier FCFA (sans décimale).",
    };
  }
  if (compact.startsWith("-")) {
    return {
      ok: false,
      code: "INVALID_MINIMUM_MONTHLY_AMOUNT",
      message: "Le montant forfaitaire ne peut pas être négatif.",
    };
  }
  if (!/^\d+$/.test(compact)) {
    return {
      ok: false,
      code: "INVALID_MINIMUM_MONTHLY_AMOUNT",
      message: "Le montant forfaitaire doit être un entier FCFA strictement positif.",
    };
  }
  try {
    const value = BigInt(compact);
    if (value <= 0n) {
      return {
        ok: false,
        code: "INVALID_MINIMUM_MONTHLY_AMOUNT",
        message:
          "Le montant forfaitaire du minimum garanti doit être strictement positif.",
      };
    }
    return { ok: true, value };
  } catch {
    return {
      ok: false,
      code: "INVALID_MINIMUM_MONTHLY_AMOUNT",
      message: "Le montant forfaitaire est invalide.",
    };
  }
}

/**
 * Parse le montant du forfait social universel (entier FCFA ≥ 0).
 * Zéro accepté (forfait nul, sans effet caché).
 */
export function parseUniversalFixedAmountMonthlyAmountInput(
  raw: string | null | undefined,
): ParseResult<bigint> {
  return parseNonNegativeFcfaAmount(raw, {
    missingCode: "MISSING_UNIVERSAL_FIXED_AMOUNT",
    invalidCode: "INVALID_UNIVERSAL_FIXED_AMOUNT",
    fieldLabel: "Le montant du forfait social universel",
  });
}

/** Parse le mois d’effet du forfait social universel (1–12). */
export function parseUniversalFixedAmountEffectiveMonthInput(
  raw: string | null | undefined,
): ParseResult<number> {
  if (raw === null || raw === undefined || raw.trim() === "") {
    return {
      ok: false,
      code: "MISSING_UNIVERSAL_FIXED_AMOUNT_EFFECTIVE_MONTH",
      message: "Le mois d’effet du forfait social universel est obligatoire.",
    };
  }
  const compact = stripAllowedSpaces(raw.trim());
  if (!/^\d{1,2}$/.test(compact)) {
    return {
      ok: false,
      code: "INVALID_UNIVERSAL_FIXED_AMOUNT_EFFECTIVE_MONTH",
      message:
        "Le mois d’effet du forfait social universel doit être compris entre janvier et décembre.",
    };
  }
  const value = Number(compact);
  if (!Number.isInteger(value) || value < 1 || value > 12) {
    return {
      ok: false,
      code: "INVALID_UNIVERSAL_FIXED_AMOUNT_EFFECTIVE_MONTH",
      message:
        "Le mois d’effet du forfait social universel doit être compris entre janvier et décembre.",
    };
  }
  return { ok: true, value };
}

/** Parse l’ancienneté minimale du forfait (entier ≥ 0 mois). */
export function parseUniversalFixedAmountMinimumSeniorityMonthsInput(
  raw: string | null | undefined,
): ParseResult<number> {
  if (raw === null || raw === undefined || raw.trim() === "") {
    return {
      ok: false,
      code: "MISSING_UNIVERSAL_FIXED_AMOUNT_MINIMUM_SENIORITY",
      message:
        "L’ancienneté minimale pour bénéficier du forfait est obligatoire.",
    };
  }
  const compact = stripAllowedSpaces(raw.trim());
  if (compact.startsWith("-")) {
    return {
      ok: false,
      code: "INVALID_UNIVERSAL_FIXED_AMOUNT_MINIMUM_SENIORITY",
      message: "L’ancienneté minimale du forfait ne peut pas être négative.",
    };
  }
  if (!/^\d+$/.test(compact)) {
    return {
      ok: false,
      code: "INVALID_UNIVERSAL_FIXED_AMOUNT_MINIMUM_SENIORITY",
      message:
        "L’ancienneté minimale du forfait doit être un entier ≥ 0 (en mois).",
    };
  }
  const value = Number(compact);
  if (!Number.isInteger(value) || value < 0) {
    return {
      ok: false,
      code: "INVALID_UNIVERSAL_FIXED_AMOUNT_MINIMUM_SENIORITY",
      message:
        "L’ancienneté minimale du forfait doit être un entier ≥ 0 (en mois).",
    };
  }
  return { ok: true, value };
}

/** Parse la date de référence d’ancienneté du forfait (ISO YYYY-MM-DD). */
export function parseUniversalFixedAmountSeniorityReferenceDateInput(
  raw: string | null | undefined,
  campaignYear: number | null,
): ParseResult<string> {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) {
    if (campaignYear !== null) {
      return {
        ok: true,
        value: defaultUniversalFixedAmountSeniorityReferenceDate(campaignYear),
      };
    }
    return {
      ok: false,
      code: "MISSING_UNIVERSAL_FIXED_AMOUNT_SENIORITY_REFERENCE_DATE",
      message:
        "La date de référence de l’ancienneté du forfait social universel est obligatoire.",
    };
  }
  try {
    parseSeniorityReferenceDateIso(trimmed);
    return { ok: true, value: trimmed };
  } catch {
    return {
      ok: false,
      code: "INVALID_UNIVERSAL_FIXED_AMOUNT_SENIORITY_REFERENCE_DATE",
      message:
        "La date de référence de l’ancienneté du forfait doit être au format ISO YYYY-MM-DD.",
    };
  }
}

function resolveInactiveUniversalFixedAmountSeniorityReferenceDate(
  campaignYear: number | null,
  draftDate: string,
): string {
  const parsed = parseUniversalFixedAmountSeniorityReferenceDateInput(
    draftDate,
    campaignYear,
  );
  if (parsed.ok) {
    return parsed.value;
  }
  if (campaignYear !== null) {
    return defaultUniversalFixedAmountSeniorityReferenceDate(campaignYear);
  }
  return NO_UNIVERSAL_FIXED_AMOUNT_POLICY.seniorityReferenceDate;
}

/**
 * Résout le mécanisme social du brouillon.
 * Brouillons H4 sans champ : dérivation depuis minimumIncreaseMode.
 */
export function resolveDraftSocialMechanismKind(
  draft: Pick<
    SimulationConfigurationDraftFields,
    "socialMechanismKind" | "minimumIncreaseMode"
  >,
): SocialMechanismKind {
  if (isSocialMechanismKind(draft.socialMechanismKind)) {
    return draft.socialMechanismKind;
  }
  return deriveSocialMechanismKindFromMinimumIncreaseMode(
    draft.minimumIncreaseMode,
  );
}

export type BudgetTargetModeChoice =
  | "manual_amount"
  | "percentage_of_eligible_payroll";

export type MinimumIncreaseModeChoice = MinimumIncreaseMode;

export type SocialMechanismKindChoice = SocialMechanismKind;

/** Politiques de coût employeur configurables en campagne (pas `mixed`). */
export const EMPLOYER_COST_POLICY_KIND_CHOICES = [
  "neutral",
  "rate_on_gross_period",
] as const;

export type EmployerCostPolicyKindChoice =
  (typeof EMPLOYER_COST_POLICY_KIND_CHOICES)[number];

export const NO_EMPLOYER_COST_POLICY: EmployerCostPolicy = {
  kind: "neutral",
  componentLiability: DEFAULT_EMPLOYER_COST_COMPONENT_LIABILITY,
};

export function isEmployerCostPolicyKindChoice(
  value: unknown,
): value is EmployerCostPolicyKindChoice {
  return (
    typeof value === "string" &&
    (EMPLOYER_COST_POLICY_KIND_CHOICES as readonly string[]).includes(value)
  );
}

export interface SimulationConfigurationDraftFields {
  budgetTargetMode: BudgetTargetModeChoice | null;
  manualBudgetInput: string;
  eligiblePayrollInput: string;
  budgetRatePercentInput: string;
  roundingMode: "nearest_half_up" | null;
  roundingStepInput: string;
  /** Année de campagne (saisie UI — jamais Date.now() côté moteur). */
  campaignYearInput: string;
  /** Début de rétroactivité 1–12 (saisie UI). Défaut = 1. */
  retroactivityStartMonthInput: string;
  /** Mois d’application technique 1–12 (saisie UI). */
  technicalApplicationMonthInput: string;
  /**
   * Mois d’effet du minimum garanti 1–12 (saisie UI).
   * Conservé même si le mécanisme social actif n’est pas le minimum.
   */
  minimumGuaranteeEffectiveMonthInput: string;
  /**
   * Mécanisme social exclusif (Lot 2B-RC1-H5).
   * Valeurs mémorisées des mécanismes non sélectionnés restent dans le brouillon.
   */
  socialMechanismKind: SocialMechanismKindChoice;
  /** Mode de minimum garanti (actif seulement si mécanisme = minimum). */
  minimumIncreaseMode: MinimumIncreaseModeChoice;
  /** Montant forfaitaire mensuel du minimum (texte UI). */
  minimumMonthlyAmountInput: string;
  /** Taux % du minimum (texte UI). */
  minimumIncreaseRatePercentInput: string;
  /** Montant du forfait social universel (texte UI). */
  universalFixedAmountMonthlyAmountInput: string;
  /** Mois d’effet du forfait (1–12), indépendant du minimum. */
  universalFixedAmountEffectiveMonthInput: string;
  /** Ancienneté minimale du forfait en mois (défaut 0). */
  universalFixedAmountMinimumSeniorityMonthsInput: string;
  /** Date de référence d’ancienneté du forfait (ISO YYYY-MM-DD). */
  universalFixedAmountSeniorityReferenceDateInput: string;
  /**
   * Politique de coût employeur (Lot 2B-RC1-H6-A3).
   * `mixed` n’est pas une valeur de configuration de campagne.
   */
  employerCostPolicyKind: EmployerCostPolicyKindChoice;
  /** Taux % unique (texte UI), actif seulement en mode rate_on_gross_period. */
  employerCostRatePercentInput: string;
}

export interface ParsedSimulationConfiguration {
  budgetTarget: BudgetTargetInput | null;
  roundingPolicy: RoundingPolicy | null;
  campaignYear: number | null;
  retroactivityStartMonth: number | null;
  technicalApplicationMonth: number | null;
  minimumGuaranteeEffectiveMonth: number | null;
  socialMechanismKind: SocialMechanismKind | null;
  minimumIncreasePolicy: MinimumIncreasePolicy | null;
  universalFixedAmountPolicy: UniversalFixedAmountPolicy | null;
  employerCostPolicy: EmployerCostPolicy | null;
  fieldErrors: Partial<
    Record<
      | "budgetTargetMode"
      | "manualBudgetInput"
      | "eligiblePayrollInput"
      | "budgetRatePercentInput"
      | "roundingMode"
      | "roundingStepInput"
      | "campaignYearInput"
      | "retroactivityStartMonthInput"
      | "technicalApplicationMonthInput"
      | "minimumGuaranteeEffectiveMonthInput"
      | "socialMechanismKind"
      | "minimumIncreaseMode"
      | "minimumMonthlyAmountInput"
      | "minimumIncreaseRatePercentInput"
      | "universalFixedAmountMonthlyAmountInput"
      | "universalFixedAmountEffectiveMonthInput"
      | "universalFixedAmountMinimumSeniorityMonthsInput"
      | "universalFixedAmountSeniorityReferenceDateInput"
      | "employerCostPolicyKind"
      | "employerCostRatePercentInput",
      ParseFailure
    >
  >;
  isBudgetComplete: boolean;
  isRoundingComplete: boolean;
  isApplicationCalendarComplete: boolean;
  isSocialMechanismComplete: boolean;
  /** Politique de coût employeur parsée sans erreur. */
  isEmployerCostComplete: boolean;
  /** @deprecated Alias de isSocialMechanismComplete (compat H4). */
  isMinimumIncreaseComplete: boolean;
  isConfigurationComplete: boolean;
}

/**
 * Parse le brouillon UI vers BudgetTargetInput / RoundingPolicy.
 * Ne lance aucun calcul d’allocation.
 */
export function parseSimulationConfigurationDraft(
  draft: SimulationConfigurationDraftFields,
): ParsedSimulationConfiguration {
  const fieldErrors: ParsedSimulationConfiguration["fieldErrors"] = {};

  let budgetTarget: BudgetTargetInput | null = null;
  let isBudgetComplete = false;

  if (draft.budgetTargetMode === null) {
    fieldErrors.budgetTargetMode = {
      ok: false,
      code: "MISSING_BUDGET_TARGET_MODE",
      message: "Choisissez un mode de budget cible.",
    };
  } else if (draft.budgetTargetMode === "manual_amount") {
    const manual = parseNonNegativeFcfaAmount(draft.manualBudgetInput, {
      missingCode: "MISSING_MANUAL_BUDGET",
      invalidCode: "INVALID_MANUAL_BUDGET",
      fieldLabel: "Budget cible",
    });
    if (!manual.ok) {
      fieldErrors.manualBudgetInput = manual;
    } else {
      budgetTarget = {
        mode: "manual_amount",
        manualBudgetFcfa: manual.value,
      };
      isBudgetComplete = true;
    }
  } else {
    const payroll = parseNonNegativeFcfaAmount(draft.eligiblePayrollInput, {
      missingCode: "MISSING_ELIGIBLE_PAYROLL",
      invalidCode: "INVALID_ELIGIBLE_PAYROLL",
      fieldLabel: "Masse salariale éligible",
    });
    const rate = parseBudgetRatePercentToBps(draft.budgetRatePercentInput);
    if (!payroll.ok) {
      fieldErrors.eligiblePayrollInput = payroll;
    }
    if (!rate.ok) {
      fieldErrors.budgetRatePercentInput = rate;
    }
    if (payroll.ok && rate.ok) {
      budgetTarget = {
        mode: "percentage_of_eligible_payroll",
        eligiblePayrollFcfa: payroll.value,
        budgetRateBasisPoints: rate.value,
      };
      isBudgetComplete = true;
    }
  }

  let roundingPolicy: RoundingPolicy | null = null;
  let isRoundingComplete = false;

  if (draft.roundingMode === null) {
    fieldErrors.roundingMode = {
      ok: false,
      code: "MISSING_ROUNDING_MODE",
      message: "Le mode d’arrondi est obligatoire.",
    };
  } else if (draft.roundingMode !== "nearest_half_up") {
    fieldErrors.roundingMode = {
      ok: false,
      code: "MISSING_ROUNDING_MODE",
      message: "Seul le mode nearest_half_up est supporté.",
    };
  }

  const step = parseRoundingStepFcfa(draft.roundingStepInput);
  if (!step.ok) {
    fieldErrors.roundingStepInput = step;
  } else if (draft.roundingMode === "nearest_half_up") {
    roundingPolicy = {
      mode: "nearest_half_up",
      stepFcfa: step.value,
    };
    isRoundingComplete = true;
  }

  let campaignYear: number | null = null;
  let retroactivityStartMonth: number | null = null;
  let technicalApplicationMonth: number | null = null;
  let minimumGuaranteeEffectiveMonth: number | null = null;
  let isApplicationCalendarComplete = false;

  const year = parseCampaignYearInput(draft.campaignYearInput);
  if (!year.ok) {
    fieldErrors.campaignYearInput = year;
  } else {
    campaignYear = year.value;
  }

  const retro = parseRetroactivityStartMonthInput(
    draft.retroactivityStartMonthInput,
  );
  if (!retro.ok) {
    fieldErrors.retroactivityStartMonthInput = retro;
  } else {
    retroactivityStartMonth = retro.value;
  }

  const month = parseTechnicalApplicationMonthInput(
    draft.technicalApplicationMonthInput,
  );
  if (!month.ok) {
    fieldErrors.technicalApplicationMonthInput = month;
  } else {
    technicalApplicationMonth = month.value;
  }

  const minEffective = parseMinimumGuaranteeEffectiveMonthInput(
    draft.minimumGuaranteeEffectiveMonthInput,
  );
  if (!minEffective.ok) {
    fieldErrors.minimumGuaranteeEffectiveMonthInput = minEffective;
  } else {
    minimumGuaranteeEffectiveMonth = minEffective.value;
  }

  if (
    retroactivityStartMonth !== null &&
    technicalApplicationMonth !== null &&
    retroactivityStartMonth > technicalApplicationMonth
  ) {
    fieldErrors.retroactivityStartMonthInput = {
      ok: false,
      code: "RETROACTIVITY_MONTH_AFTER_APPLICATION_MONTH",
      message:
        "Le début de rétroactivité ne peut pas être postérieur au mois d’application technique.",
    };
    retroactivityStartMonth = null;
  }

  if (
    campaignYear !== null &&
    retroactivityStartMonth !== null &&
    technicalApplicationMonth !== null &&
    minimumGuaranteeEffectiveMonth !== null
  ) {
    isApplicationCalendarComplete = true;
  }

  let socialMechanismKind: SocialMechanismKind | null = null;
  let minimumIncreasePolicy: MinimumIncreasePolicy | null = null;
  let universalFixedAmountPolicy: UniversalFixedAmountPolicy | null = null;
  let isSocialMechanismComplete = false;

  const kindRaw = resolveDraftSocialMechanismKind(draft);
  if (!(SOCIAL_MECHANISM_KINDS as readonly string[]).includes(kindRaw)) {
    fieldErrors.socialMechanismKind = {
      ok: false,
      code: "UNSUPPORTED_SOCIAL_MECHANISM_KIND",
      message: `Mécanisme social non supporté : ${String(kindRaw)}.`,
    };
  } else {
    socialMechanismKind = kindRaw;
  }

  if (socialMechanismKind === "none") {
    minimumIncreasePolicy = NO_MINIMUM_INCREASE_POLICY;
    universalFixedAmountPolicy = {
      ...NO_UNIVERSAL_FIXED_AMOUNT_POLICY,
      effectiveMonth: technicalApplicationMonth ?? 1,
      seniorityReferenceDate: resolveInactiveUniversalFixedAmountSeniorityReferenceDate(
        campaignYear,
        draft.universalFixedAmountSeniorityReferenceDateInput,
      ),
    };
    isSocialMechanismComplete = true;
  } else if (socialMechanismKind === "minimum_guaranteed") {
    universalFixedAmountPolicy = {
      ...NO_UNIVERSAL_FIXED_AMOUNT_POLICY,
      effectiveMonth: technicalApplicationMonth ?? 1,
      seniorityReferenceDate: resolveInactiveUniversalFixedAmountSeniorityReferenceDate(
        campaignYear,
        draft.universalFixedAmountSeniorityReferenceDateInput,
      ),
    };
    const modeRaw = draft.minimumIncreaseMode;
    if (
      modeRaw === null ||
      modeRaw === undefined ||
      !(MINIMUM_INCREASE_MODES as readonly string[]).includes(modeRaw) ||
      modeRaw === "none"
    ) {
      fieldErrors.minimumIncreaseMode = {
        ok: false,
        code:
          modeRaw === "none"
            ? "INVALID_SOCIAL_MECHANISM_CONFIGURATION"
            : modeRaw === null || modeRaw === undefined
              ? "MISSING_MINIMUM_INCREASE_MODE"
              : "UNSUPPORTED_MINIMUM_INCREASE_MODE",
        message:
          modeRaw === "none"
            ? "Choisissez un mode de minimum garanti (forfaitaire ou pourcentage)."
            : modeRaw === null || modeRaw === undefined
              ? "Le mode de minimum garanti est obligatoire."
              : `Mode de minimum garanti non supporté : ${String(modeRaw)}.`,
      };
    } else if (modeRaw === "fixed_monthly_amount") {
      if (draft.minimumIncreaseRatePercentInput.trim() !== "") {
        fieldErrors.minimumIncreaseRatePercentInput = {
          ok: false,
          code: "INVALID_MINIMUM_INCREASE_CONFIGURATION",
          message: "En mode forfaitaire, le taux minimum doit être vide.",
        };
      }
      const amount = parseMinimumMonthlyAmountInput(
        draft.minimumMonthlyAmountInput,
      );
      if (!amount.ok) {
        fieldErrors.minimumMonthlyAmountInput = amount;
      } else if (!fieldErrors.minimumIncreaseRatePercentInput) {
        minimumIncreasePolicy = {
          mode: "fixed_monthly_amount",
          minimumMonthlyAmountFcfa: amount.value,
          minimumIncreaseRate: null,
        };
        isSocialMechanismComplete = true;
      }
    } else {
      if (draft.minimumMonthlyAmountInput.trim() !== "") {
        fieldErrors.minimumMonthlyAmountInput = {
          ok: false,
          code: "INVALID_MINIMUM_INCREASE_CONFIGURATION",
          message:
            "En mode pourcentage, le montant forfaitaire doit être vide.",
        };
      }
      const rate = parseMinimumIncreaseRatePercentInput(
        draft.minimumIncreaseRatePercentInput,
      );
      if (!rate.ok) {
        fieldErrors.minimumIncreaseRatePercentInput = rate;
      } else if (!fieldErrors.minimumMonthlyAmountInput) {
        minimumIncreasePolicy = {
          mode: "percentage_of_base_salary",
          minimumMonthlyAmountFcfa: null,
          minimumIncreaseRate: rate.value,
        };
        isSocialMechanismComplete = true;
      }
    }
  } else if (socialMechanismKind === "universal_fixed_amount") {
    minimumIncreasePolicy = NO_MINIMUM_INCREASE_POLICY;
    const amount = parseUniversalFixedAmountMonthlyAmountInput(
      draft.universalFixedAmountMonthlyAmountInput,
    );
    const effective = parseUniversalFixedAmountEffectiveMonthInput(
      draft.universalFixedAmountEffectiveMonthInput,
    );
    const seniority = parseUniversalFixedAmountMinimumSeniorityMonthsInput(
      draft.universalFixedAmountMinimumSeniorityMonthsInput,
    );
    const seniorityReferenceDate =
      parseUniversalFixedAmountSeniorityReferenceDateInput(
        draft.universalFixedAmountSeniorityReferenceDateInput,
        campaignYear,
      );
    if (!amount.ok) {
      fieldErrors.universalFixedAmountMonthlyAmountInput = amount;
    }
    if (!effective.ok) {
      fieldErrors.universalFixedAmountEffectiveMonthInput = effective;
    }
    if (!seniority.ok) {
      fieldErrors.universalFixedAmountMinimumSeniorityMonthsInput = seniority;
    }
    if (!seniorityReferenceDate.ok) {
      fieldErrors.universalFixedAmountSeniorityReferenceDateInput =
        seniorityReferenceDate;
    }
    if (amount.ok && effective.ok && seniority.ok && seniorityReferenceDate.ok) {
      universalFixedAmountPolicy = {
        monthlyAmountFcfa: amount.value,
        effectiveMonth: effective.value,
        minimumSeniorityMonths: seniority.value,
        seniorityReferenceDate: seniorityReferenceDate.value,
      };
      isSocialMechanismComplete = true;
    }
  }

  let employerCostPolicy: EmployerCostPolicy | null = null;
  let isEmployerCostComplete = false;
  const employerKindRaw = draft.employerCostPolicyKind as string;
  if (!isEmployerCostPolicyKindChoice(employerKindRaw)) {
    fieldErrors.employerCostPolicyKind = {
      ok: false,
      code: "UNSUPPORTED_EMPLOYER_COST_POLICY_KIND",
      message:
        employerKindRaw === "mixed"
          ? "La politique « mixed » est réservée aux résultats agrégés et ne peut pas être configurée pour une campagne."
          : `Politique de coût employeur non supportée : ${String(employerKindRaw)}.`,
    };
  } else if (employerKindRaw === "neutral") {
    // Le taux résiduel du brouillon est ignoré (aucun effet caché).
    employerCostPolicy = NO_EMPLOYER_COST_POLICY;
    isEmployerCostComplete = true;
  } else {
    const rate = parseEmployerCostRatePercentInput(
      draft.employerCostRatePercentInput,
    );
    if (!rate.ok) {
      fieldErrors.employerCostRatePercentInput = rate;
    } else {
      employerCostPolicy = {
        kind: "rate_on_gross_period",
        components: [
          {
            categoryId: EMPLOYER_CHARGE_CATEGORY_UNSPECIFIED_BUNDLE,
            rate: rate.value,
          },
        ],
        componentLiability: DEFAULT_EMPLOYER_COST_COMPONENT_LIABILITY,
      };
      isEmployerCostComplete = true;
    }
  }

  return {
    budgetTarget,
    roundingPolicy,
    campaignYear,
    retroactivityStartMonth,
    technicalApplicationMonth,
    minimumGuaranteeEffectiveMonth,
    socialMechanismKind,
    minimumIncreasePolicy,
    universalFixedAmountPolicy,
    employerCostPolicy,
    fieldErrors,
    isBudgetComplete,
    isRoundingComplete,
    isApplicationCalendarComplete,
    isSocialMechanismComplete,
    isEmployerCostComplete,
    isMinimumIncreaseComplete: isSocialMechanismComplete,
    isConfigurationComplete:
      isBudgetComplete &&
      isRoundingComplete &&
      isApplicationCalendarComplete &&
      isSocialMechanismComplete &&
      isEmployerCostComplete,
  };
}
