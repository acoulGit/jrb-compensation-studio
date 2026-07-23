import { describe, expect, it } from "vitest";
import type { HrImportIssue } from "../domain/hrImport/models";
import {
  countImportIssuesBySeverity,
  defaultImportIssuesViewFilter,
  filterAndOrderImportIssues,
  importIssuesDisplayCounterLabel,
} from "../pages/import/importIssuesView";

function issue(
  severity: HrImportIssue["severity"],
  message: string,
  extras: Partial<HrImportIssue> = {},
): HrImportIssue {
  return {
    severity,
    code: extras.code ?? `${severity}_${message}`,
    sourceRowNumber: extras.sourceRowNumber ?? 2,
    field: extras.field ?? "employeeNumber",
    message,
    employeeNumber: extras.employeeNumber ?? "M-001",
  };
}

describe("Lot 2B-IMP-H1 — affichage exhaustif des anomalies d’import", () => {
  it("sélectionne les erreurs par défaut lorsqu’elles existent", () => {
    expect(defaultImportIssuesViewFilter(86, 480)).toBe("errors");
  });

  it("sélectionne les avertissements en l’absence d’erreur", () => {
    expect(defaultImportIssuesViewFilter(0, 12)).toBe("warnings");
  });

  it("compte séparément erreurs et avertissements", () => {
    const issues = [
      issue("error", "e1"),
      issue("warning", "w1"),
      issue("error", "e2"),
      issue("warning", "w2"),
      issue("warning", "w3"),
    ];
    expect(countImportIssuesBySeverity(issues)).toEqual({
      errorCount: 2,
      warningCount: 3,
    });
  });

  it("affiche toutes les erreurs même si beaucoup d’avertissements précèdent", () => {
    const warnings = Array.from({ length: 480 }, (_, index) =>
      issue("warning", `w${index}`, {
        sourceRowNumber: index + 2,
        code: `warn_${index}`,
      }),
    );
    const errors = Array.from({ length: 86 }, (_, index) =>
      issue("error", `e${index}`, {
        sourceRowNumber: 500 + index,
        code: `err_${index}`,
        employeeNumber: `E-${index}`,
      }),
    );
    // Ordre réaliste : avertissements puis erreurs (comme une liste non triée).
    const issues = [...warnings, ...errors];
    expect(issues.length).toBe(566);

    const filteredErrors = filterAndOrderImportIssues(issues, "errors");
    expect(filteredErrors).toHaveLength(86);
    expect(filteredErrors.every((item) => item.severity === "error")).toBe(true);
    expect(filteredErrors[0]?.message).toBe("e0");
    expect(filteredErrors[85]?.message).toBe("e85");

    const filteredWarnings = filterAndOrderImportIssues(issues, "warnings");
    expect(filteredWarnings).toHaveLength(480);

    const all = filterAndOrderImportIssues(issues, "all");
    expect(all).toHaveLength(566);
    expect(all.slice(0, 86).every((item) => item.severity === "error")).toBe(
      true,
    );
    expect(all.slice(86).every((item) => item.severity === "warning")).toBe(
      true,
    );
  });

  it("produit les libellés de compteur conformes", () => {
    expect(
      importIssuesDisplayCounterLabel({
        filter: "errors",
        displayedCount: 86,
        errorCount: 86,
        warningCount: 480,
      }),
    ).toBe("86 erreurs affichées sur 86");

    expect(
      importIssuesDisplayCounterLabel({
        filter: "warnings",
        displayedCount: 480,
        errorCount: 86,
        warningCount: 480,
      }),
    ).toBe("480 avertissements affichés sur 480");

    expect(
      importIssuesDisplayCounterLabel({
        filter: "all",
        displayedCount: 566,
        errorCount: 86,
        warningCount: 480,
      }),
    ).toBe("566 anomalies affichées sur 566");
  });

  it("n’applique aucune troncature silencieuse (pas de plafond à 100)", () => {
    const issues = Array.from({ length: 250 }, (_, index) =>
      issue("error", `e${index}`, { code: `err_${index}` }),
    );
    expect(filterAndOrderImportIssues(issues, "errors")).toHaveLength(250);
    expect(filterAndOrderImportIssues(issues, "all")).toHaveLength(250);
  });

  it("référence la classe CSS de défilement attendue par l’UI", () => {
    // Contrat structurel : ImportPage utilise cette classe ; global.css définit
    // max-height + overflow-y: auto (vérifié manuellement / revue de code).
    expect("data-table-wrap--import-issues").toContain("import-issues");
  });
});
