/** Conversions d’affichage ↔ stockage pour le référentiel. */

import { MAX_FACTOR_MILLI, MIN_FACTOR_MILLI } from "./models";

export class ConversionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversionError";
  }
}

/** factor_milli (1000 = 1) → nombre décimal affiché. */
export function factorMilliToDisplay(factorMilli: number): number {
  return factorMilli / 1000;
}

/** Nombre décimal saisi → factor_milli (max 3 décimales). */
export function displayToFactorMilli(displayValue: number): number {
  if (!Number.isFinite(displayValue) || Number.isNaN(displayValue)) {
    throw new ConversionError("Le coefficient doit être un nombre fini.");
  }
  if (displayValue < 0 || displayValue > 10) {
    throw new ConversionError(
      "Le coefficient doit être compris entre 0 et 10 inclus.",
    );
  }

  const scaled = Math.round(displayValue * 1000);
  const truncated = Math.trunc(displayValue * 1000) / 1000;
  if (Math.abs(displayValue - truncated) > 1e-9) {
    throw new ConversionError(
      "Le coefficient accepte au maximum trois décimales.",
    );
  }

  if (scaled < MIN_FACTOR_MILLI || scaled > MAX_FACTOR_MILLI) {
    throw new ConversionError(
      "Le coefficient doit être compris entre 0 et 10 inclus.",
    );
  }

  return scaled;
}

/** Parse une saisie utilisateur (virgule ou point) vers factor_milli. */
export function parseFactorDisplayInput(raw: string): number {
  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) {
    throw new ConversionError("Le coefficient est obligatoire.");
  }
  const value = Number(normalized);
  return displayToFactorMilli(value);
}

/**
 * Affiche un coefficient avec exactement trois décimales et une virgule
 * française (ex. 1,300 ; 0,950). Indépendant de la locale runtime.
 */
export function formatFactorDisplay(factorMilli: number): string {
  const value = factorMilliToDisplay(factorMilli);
  return value.toFixed(3).replace(".", ",");
}

/** ratio_bps (10000 = 100 %) → pourcentage numérique. */
export function ratioBpsToPercent(ratioBps: number): number {
  return ratioBps / 100;
}

/** Affiche un ratio de référence (ou libellé pour les bornes). */
export function formatRatioBpsDisplay(
  code: string,
  ratioBps: number | null,
): string {
  if (code === "Sout-") {
    return "< 65 %";
  }
  if (code === "Sout+") {
    return "> 135 %";
  }
  if (ratioBps === null) {
    return "—";
  }
  const percent = ratioBpsToPercent(ratioBps);
  return `${percent.toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} %`;
}

/** Interprétation textuelle d’une position. */
export function salaryPositionInterpretation(
  code: string,
  ratioBps: number | null,
): string {
  if (code === "Sout-") {
    return "Inférieur à 65 % de S0";
  }
  if (code === "Sout+") {
    return "Supérieur à 135 % de S0";
  }
  if (ratioBps === null) {
    return "—";
  }
  return `${formatRatioBpsDisplay(code, ratioBps)} de S0`;
}

/** Montant FCFA entier → affichage local avec séparateurs. */
export function formatFcfaAmount(amount: number | null): string {
  if (amount === null) {
    return "Non configuré";
  }
  return `${amount.toLocaleString("fr-FR")} FCFA`;
}

/** Parse une saisie de montant FCFA (entier strictement positif ou vide → null). */
export function parseFcfaAmountInput(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s/g, "").replace(/FCFA/gi, "");
  if (!trimmed) {
    return null;
  }
  if (!/^\d+$/.test(trimmed)) {
    if (trimmed.includes(".") || trimmed.includes(",")) {
      throw new ConversionError(
        "Le montant S0 doit être un entier en FCFA (sans décimale).",
      );
    }
    throw new ConversionError(
      "Le montant S0 doit être un entier positif en FCFA.",
    );
  }
  const amount = Number(trimmed);
  if (!Number.isInteger(amount) || amount <= 0) {
    if (amount === 0) {
      throw new ConversionError(
        "Le montant S0 ne peut pas être égal à zéro. Laissez vide pour « Non configuré ».",
      );
    }
    throw new ConversionError(
      "Le montant S0 doit être un entier strictement positif.",
    );
  }
  return amount;
}

export function nineBoxModeLabel(mode: string): string {
  switch (mode) {
    case "none":
      return "Aucun effet";
    case "performance_only":
      return "Performance uniquement";
    case "full_nine_box":
      return "9-Box complète";
    case "performance_potential":
      return "Performance × Potentiel";
    default:
      return mode;
  }
}
