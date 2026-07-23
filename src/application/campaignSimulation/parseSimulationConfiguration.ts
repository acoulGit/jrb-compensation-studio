/**
 * Parsing exact des saisies de configuration de simulation (Lot 2B-2).
 * Aucun Number / parseFloat pour les montants métier.
 */

import type { BudgetTargetInput } from "../../domain/compensationCalculation";
import type {
  MinimumIncreaseMode,
  MinimumIncreasePolicy,
  RoundingPolicy,
} from "../../domain/compensationCalculation";
import {
  MINIMUM_INCREASE_MODES,
  NO_MINIMUM_INCREASE_POLICY,
  minimumIncreaseRateFromPercentParts,
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
  const value = BigInt(compact);
  if (value <= 0n) {
    return {
      ok: false,
      code: "INVALID_MINIMUM_MONTHLY_AMOUNT",
      message: "Le montant forfaitaire du minimum garanti doit être strictement positif.",
    };
  }
  return { ok: true, value };
}

export type BudgetTargetModeChoice =
  | "manual_amount"
  | "percentage_of_eligible_payroll";

export type MinimumIncreaseModeChoice = MinimumIncreaseMode;

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
   * Défaut = mois technique (Lot 2B-RC1-H4).
   */
  minimumGuaranteeEffectiveMonthInput: string;
  /** Mode de minimum garanti (Lot 2A-H2D-2). */
  minimumIncreaseMode: MinimumIncreaseModeChoice;
  /** Montant forfaitaire mensuel (texte UI). */
  minimumMonthlyAmountInput: string;
  /** Taux % du minimum (texte UI). */
  minimumIncreaseRatePercentInput: string;
}

export interface ParsedSimulationConfiguration {
  budgetTarget: BudgetTargetInput | null;
  roundingPolicy: RoundingPolicy | null;
  campaignYear: number | null;
  retroactivityStartMonth: number | null;
  technicalApplicationMonth: number | null;
  minimumGuaranteeEffectiveMonth: number | null;
  minimumIncreasePolicy: MinimumIncreasePolicy | null;
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
      | "minimumIncreaseMode"
      | "minimumMonthlyAmountInput"
      | "minimumIncreaseRatePercentInput",
      ParseFailure
    >
  >;
  isBudgetComplete: boolean;
  isRoundingComplete: boolean;
  isApplicationCalendarComplete: boolean;
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

  let minimumIncreasePolicy: MinimumIncreasePolicy | null = null;
  let isMinimumIncreaseComplete = false;

  const modeRaw = draft.minimumIncreaseMode;
  if (
    modeRaw === null ||
    modeRaw === undefined ||
    !(MINIMUM_INCREASE_MODES as readonly string[]).includes(modeRaw)
  ) {
    fieldErrors.minimumIncreaseMode = {
      ok: false,
      code:
        modeRaw === null || modeRaw === undefined
          ? "MISSING_MINIMUM_INCREASE_MODE"
          : "UNSUPPORTED_MINIMUM_INCREASE_MODE",
      message:
        modeRaw === null || modeRaw === undefined
          ? "Le mode de minimum garanti est obligatoire."
          : `Mode de minimum garanti non supporté : ${String(modeRaw)}.`,
    };
  } else if (modeRaw === "none") {
    if (draft.minimumMonthlyAmountInput.trim() !== "") {
      fieldErrors.minimumMonthlyAmountInput = {
        ok: false,
        code: "INVALID_MINIMUM_INCREASE_CONFIGURATION",
        message:
          "En mode « aucun minimum », le montant forfaitaire doit être vide.",
      };
    }
    if (draft.minimumIncreaseRatePercentInput.trim() !== "") {
      fieldErrors.minimumIncreaseRatePercentInput = {
        ok: false,
        code: "INVALID_MINIMUM_INCREASE_CONFIGURATION",
        message: "En mode « aucun minimum », le taux doit être vide.",
      };
    }
    if (
      !fieldErrors.minimumMonthlyAmountInput &&
      !fieldErrors.minimumIncreaseRatePercentInput
    ) {
      minimumIncreasePolicy = NO_MINIMUM_INCREASE_POLICY;
      isMinimumIncreaseComplete = true;
    }
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
      isMinimumIncreaseComplete = true;
    }
  } else {
    // percentage_of_base_salary
    if (draft.minimumMonthlyAmountInput.trim() !== "") {
      fieldErrors.minimumMonthlyAmountInput = {
        ok: false,
        code: "INVALID_MINIMUM_INCREASE_CONFIGURATION",
        message: "En mode pourcentage, le montant forfaitaire doit être vide.",
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
      isMinimumIncreaseComplete = true;
    }
  }

  return {
    budgetTarget,
    roundingPolicy,
    campaignYear,
    retroactivityStartMonth,
    technicalApplicationMonth,
    minimumGuaranteeEffectiveMonth,
    minimumIncreasePolicy,
    fieldErrors,
    isBudgetComplete,
    isRoundingComplete,
    isApplicationCalendarComplete,
    isMinimumIncreaseComplete,
    isConfigurationComplete:
      isBudgetComplete &&
      isRoundingComplete &&
      isApplicationCalendarComplete &&
      isMinimumIncreaseComplete,
  };
}
