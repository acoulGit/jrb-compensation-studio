/**
 * Normalisation des niveaux Performance / Potentiel (Lot 2B-1).
 * Table explicite ; aucune invention silencieuse.
 */

import type {
  PerformanceLevel,
  PotentialLevel,
} from "../../domain/compensationReference/models";

const CANONICAL_LEVELS = ["low", "medium", "high"] as const;

const LEVEL_ALIASES: Readonly<Record<string, "low" | "medium" | "high">> = {
  low: "low",
  medium: "medium",
  high: "high",
  faible: "low",
  basse: "low",
  bas: "low",
  moyenne: "medium",
  moyen: "medium",
  elevee: "high",
  élevée: "high",
  eleve: "high",
  élevé: "high",
  haute: "high",
  haut: "high",
};

function normalizeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

/**
 * Normalise un libellé ou code vers un niveau canonique.
 * Retourne `null` si la valeur est inconnue (pas de fallback).
 */
export function normalizeFactorLevel(
  raw: string | null | undefined,
): "low" | "medium" | "high" | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const direct = CANONICAL_LEVELS.find((level) => level === trimmed);
  if (direct) {
    return direct;
  }
  const alias = LEVEL_ALIASES[normalizeKey(trimmed)];
  return alias ?? null;
}

export function normalizePerformanceLevel(
  raw: string | null | undefined,
): PerformanceLevel | null {
  return normalizeFactorLevel(raw);
}

export function normalizePotentialLevel(
  raw: string | null | undefined,
): PotentialLevel | null {
  return normalizeFactorLevel(raw);
}
