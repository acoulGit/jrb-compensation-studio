/**
 * Parsing exact des saisies de configuration de simulation (Lot 2B-2).
 * Aucun Number / parseFloat pour les montants métier.
 */

import type { BudgetTargetInput } from "../../domain/compensationCalculation";
import type { RoundingPolicy } from "../../domain/compensationCalculation";
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

export type BudgetTargetModeChoice =
  | "manual_amount"
  | "percentage_of_eligible_payroll";

export interface SimulationConfigurationDraftFields {
  budgetTargetMode: BudgetTargetModeChoice | null;
  manualBudgetInput: string;
  eligiblePayrollInput: string;
  budgetRatePercentInput: string;
  roundingMode: "nearest_half_up" | null;
  roundingStepInput: string;
}

export interface ParsedSimulationConfiguration {
  budgetTarget: BudgetTargetInput | null;
  roundingPolicy: RoundingPolicy | null;
  fieldErrors: Partial<
    Record<
      | "budgetTargetMode"
      | "manualBudgetInput"
      | "eligiblePayrollInput"
      | "budgetRatePercentInput"
      | "roundingMode"
      | "roundingStepInput",
      ParseFailure
    >
  >;
  isBudgetComplete: boolean;
  isRoundingComplete: boolean;
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

  return {
    budgetTarget,
    roundingPolicy,
    fieldErrors,
    isBudgetComplete,
    isRoundingComplete,
    isConfigurationComplete: isBudgetComplete && isRoundingComplete,
  };
}
