/** Détection automatique de la ligne d’en-tête d’un fichier importé. */

import { MAX_HEADER_SCAN_ROWS } from "./importLimits";
import { resolveColumnAlias } from "./columnAliases";
import { cellToText } from "./cellReaders";

/**
 * Retourne l’index (0-based) de la ligne comportant le plus d’alias de
 * colonnes reconnus, parmi les `maxScan` premières lignes. En cas d’égalité
 * ou d’absence de correspondance, retourne 0.
 */
export function detectHeaderRow(
  rows: unknown[][],
  maxScan: number = MAX_HEADER_SCAN_ROWS,
): number {
  const limit = Math.min(rows.length, Math.max(maxScan, 0));
  let bestIndex = 0;
  let bestScore = 0;

  for (let index = 0; index < limit; index += 1) {
    const row = rows[index] ?? [];
    let score = 0;
    for (const cell of row) {
      if (resolveColumnAlias(cellToText(cell))) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return bestScore > 0 ? bestIndex : 0;
}
