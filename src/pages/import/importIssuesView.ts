/**
 * Présentation filtrée des anomalies d’import RH (Lot 2B-IMP-H1).
 * Aucune troncature : le filtre ne fait que sélectionner / ordonner.
 */

import type { HrImportIssue } from "../../domain/hrImport/models";

export type ImportIssuesViewFilter = "errors" | "warnings" | "all";

export function countImportIssuesBySeverity(issues: readonly HrImportIssue[]): {
  errorCount: number;
  warningCount: number;
} {
  let errorCount = 0;
  let warningCount = 0;
  for (const issue of issues) {
    if (issue.severity === "error") {
      errorCount += 1;
    } else {
      warningCount += 1;
    }
  }
  return { errorCount, warningCount };
}

/** Filtre par défaut : erreurs si présentes, sinon avertissements, sinon toutes. */
export function defaultImportIssuesViewFilter(
  errorCount: number,
  warningCount: number,
): ImportIssuesViewFilter {
  if (errorCount > 0) {
    return "errors";
  }
  if (warningCount > 0) {
    return "warnings";
  }
  return "all";
}

/**
 * Filtre et ordonne sans plafonnement.
 * Vue « toutes » : erreurs bloquantes puis avertissements (ordre relatif conservé).
 */
export function filterAndOrderImportIssues(
  issues: readonly HrImportIssue[],
  filter: ImportIssuesViewFilter,
): HrImportIssue[] {
  if (filter === "errors") {
    return issues.filter((issue) => issue.severity === "error");
  }
  if (filter === "warnings") {
    return issues.filter((issue) => issue.severity === "warning");
  }
  const errors: HrImportIssue[] = [];
  const warnings: HrImportIssue[] = [];
  for (const issue of issues) {
    if (issue.severity === "error") {
      errors.push(issue);
    } else {
      warnings.push(issue);
    }
  }
  return [...errors, ...warnings];
}

export function importIssuesDisplayCounterLabel(input: {
  filter: ImportIssuesViewFilter;
  displayedCount: number;
  errorCount: number;
  warningCount: number;
}): string {
  const { filter, displayedCount, errorCount, warningCount } = input;
  if (filter === "errors") {
    return `${displayedCount} erreur${displayedCount === 1 ? "" : "s"} affichée${displayedCount === 1 ? "" : "s"} sur ${errorCount}`;
  }
  if (filter === "warnings") {
    return `${displayedCount} avertissement${displayedCount === 1 ? "" : "s"} affiché${displayedCount === 1 ? "" : "s"} sur ${warningCount}`;
  }
  const total = errorCount + warningCount;
  return `${displayedCount} anomalie${displayedCount === 1 ? "" : "s"} affichée${displayedCount === 1 ? "" : "s"} sur ${total}`;
}

export function importIssueFieldLabel(field: string | null): string {
  return field && field.trim() !== "" ? field : "—";
}
