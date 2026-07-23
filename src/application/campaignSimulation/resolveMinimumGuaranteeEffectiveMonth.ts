/**
 * Résolution affichage / export du mois d’effet du minimum garanti
 * (Lot 2B-RC1-H4).
 *
 * Schema ≥ 6 : valeur explicite du snapshot.
 * Schema ≤ 5 (ou mois NULL) : comportement historique =
 * `retroactivityStartMonth` (jamais le mois technique).
 */

import {
  RESULT_SCHEMA_VERSION_V5,
  technicalApplicationMonthLabelFr,
} from "../../domain/compensationCalculation";

export type MinimumGuaranteeEffectiveMonthOrigin =
  | "explicit"
  | "legacy_retroactivity";

export interface ResolvedMinimumGuaranteeEffectiveMonth {
  month: number | null;
  origin: MinimumGuaranteeEffectiveMonthOrigin;
  /** Libellé court du mois (ex. « Juillet »), ou null si inconnu. */
  monthLabel: string | null;
  /** Mention historique pour UI / export, ou null si explicite. */
  historicalNote: string | null;
}

export function resolveMinimumGuaranteeEffectiveMonth(input: {
  resultSchemaVersion: number | null | undefined;
  storedMonth: number | null | undefined;
  retroactivityStartMonth: number | null | undefined;
}): ResolvedMinimumGuaranteeEffectiveMonth {
  const schema = input.resultSchemaVersion ?? 0;
  const isExplicitSchema = schema > RESULT_SCHEMA_VERSION_V5;
  const stored =
    typeof input.storedMonth === "number" &&
    Number.isInteger(input.storedMonth) &&
    input.storedMonth >= 1 &&
    input.storedMonth <= 12
      ? input.storedMonth
      : null;
  const retro =
    typeof input.retroactivityStartMonth === "number" &&
    Number.isInteger(input.retroactivityStartMonth) &&
    input.retroactivityStartMonth >= 1 &&
    input.retroactivityStartMonth <= 12
      ? input.retroactivityStartMonth
      : null;

  if (isExplicitSchema && stored !== null) {
    return {
      month: stored,
      origin: "explicit",
      monthLabel: technicalApplicationMonthLabelFr(stored),
      historicalNote: null,
    };
  }

  // Historique schema ≤ 5 : aligné sur la rétroactivité (comportement réel).
  if (retro !== null) {
    return {
      month: retro,
      origin: "legacy_retroactivity",
      monthLabel: technicalApplicationMonthLabelFr(retro),
      historicalNote: "Aligné historiquement sur le mois de rétroactivité",
    };
  }

  return {
    month: null,
    origin: "legacy_retroactivity",
    monthLabel: null,
    historicalNote: "Aligné historiquement sur le mois de rétroactivité",
  };
}

/** Résumé informatif UI (ne remplace pas le calcul). */
export function minimumGuaranteeReminderSummaryFr(input: {
  minimumGuaranteeEffectiveMonth: number | null;
  technicalApplicationMonth: number | null;
}): string | null {
  if (
    input.minimumGuaranteeEffectiveMonth === null ||
    input.technicalApplicationMonth === null
  ) {
    return null;
  }
  if (
    input.minimumGuaranteeEffectiveMonth >= input.technicalApplicationMonth
  ) {
    return "Aucun rappel du minimum garanti";
  }
  return "Rappel du minimum garanti possible";
}
