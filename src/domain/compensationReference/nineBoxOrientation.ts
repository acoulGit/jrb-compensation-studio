/** Orientation et lookup sémantique 9-Box (Lot 2A-1). */

import type { NineBoxFactor } from "./models";
import {
  type FactorLevel,
  type NineBoxOrientation,
  type PerformanceLevel,
  type PotentialLevel,
} from "./models";

/**
 * Ordre d’affichage centralisé (non paramétrable au Lot 2A-1).
 * Lignes : haut → bas. Colonnes : gauche → droite.
 */
export const NINE_BOX_ROW_LEVEL_ORDER: readonly FactorLevel[] = [
  "high",
  "medium",
  "low",
] as const;

export const NINE_BOX_COLUMN_LEVEL_ORDER: readonly FactorLevel[] = [
  "low",
  "medium",
  "high",
] as const;

export const DEFAULT_NINE_BOX_ORIENTATION: NineBoxOrientation =
  "performance_rows_potential_columns";

export const NINE_BOX_ORIENTATIONS: readonly NineBoxOrientation[] = [
  "performance_rows_potential_columns",
  "performance_columns_potential_rows",
] as const;

export type NineBoxAxisDimension = "performance" | "potential";

export interface NineBoxMatrixAxes {
  orientation: NineBoxOrientation;
  rowDimension: NineBoxAxisDimension;
  columnDimension: NineBoxAxisDimension;
  rowLevels: readonly FactorLevel[];
  columnLevels: readonly FactorLevel[];
  rowAxisLabel: string;
  columnAxisLabel: string;
  cornerLabel: string;
}

export class NineBoxLookupError extends Error {
  readonly code: "MISSING" | "DUPLICATE";

  constructor(code: "MISSING" | "DUPLICATE", message: string) {
    super(message);
    this.name = "NineBoxLookupError";
    this.code = code;
  }
}

/**
 * Axes de présentation selon l’orientation.
 * Ne modifie jamais les données métier (couples Performance/Potentiel).
 */
export function getNineBoxMatrixAxes(
  orientation: NineBoxOrientation,
): NineBoxMatrixAxes {
  if (orientation === "performance_rows_potential_columns") {
    return {
      orientation,
      rowDimension: "performance",
      columnDimension: "potential",
      rowLevels: NINE_BOX_ROW_LEVEL_ORDER,
      columnLevels: NINE_BOX_COLUMN_LEVEL_ORDER,
      rowAxisLabel: "Performance",
      columnAxisLabel: "Potentiel",
      cornerLabel: "Performance \\ Potentiel",
    };
  }

  return {
    orientation,
    rowDimension: "potential",
    columnDimension: "performance",
    rowLevels: NINE_BOX_ROW_LEVEL_ORDER,
    columnLevels: NINE_BOX_COLUMN_LEVEL_ORDER,
    rowAxisLabel: "Potentiel",
    columnAxisLabel: "Performance",
    cornerLabel: "Potentiel \\ Performance",
  };
}

export function nineBoxOrientationLabel(
  orientation: NineBoxOrientation,
): string {
  if (orientation === "performance_rows_potential_columns") {
    return "Performance en lignes / Potentiel en colonnes (Orange)";
  }
  return "Performance en colonnes / Potentiel en lignes";
}

/**
 * Retrouve le facteur 9-Box par couple sémantique.
 * Indépendant de l’orientation et du numéro de case.
 */
export function getNineBoxFactor(
  factors: readonly NineBoxFactor[],
  performanceLevel: PerformanceLevel,
  potentialLevel: PotentialLevel,
): NineBoxFactor {
  const matches = factors.filter(
    (factor) =>
      factor.performanceLevel === performanceLevel &&
      factor.potentialLevel === potentialLevel,
  );

  if (matches.length === 0) {
    throw new NineBoxLookupError(
      "MISSING",
      `Aucun facteur 9-Box pour le couple performance=${performanceLevel} / potentiel=${potentialLevel}.`,
    );
  }

  if (matches.length > 1) {
    throw new NineBoxLookupError(
      "DUPLICATE",
      `Plusieurs facteurs 9-Box pour le couple performance=${performanceLevel} / potentiel=${potentialLevel}.`,
    );
  }

  return matches[0];
}

/** Résout une cellule visuelle (ligne × colonne) vers le facteur métier. */
export function getNineBoxFactorAtCell(
  factors: readonly NineBoxFactor[],
  orientation: NineBoxOrientation,
  rowLevel: FactorLevel,
  columnLevel: FactorLevel,
): NineBoxFactor {
  if (orientation === "performance_rows_potential_columns") {
    return getNineBoxFactor(factors, rowLevel, columnLevel);
  }
  return getNineBoxFactor(factors, columnLevel, rowLevel);
}
