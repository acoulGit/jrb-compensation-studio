/** Construction des référentiels moteur à partir du Lot 1B (Lot 2B-1). */

import type {
  PopulationCalculationReferences,
  PreparedSalaryGridCell,
  SalaryPositionInputRow,
} from "../../domain/compensationCalculation";
import type { CompensationReferenceSet } from "../../domain/compensationReference/models";
import type { CampaignSimulationReadinessIssue } from "./campaignSimulationModels";

export interface ReferencesBuildResult {
  references: PopulationCalculationReferences | null;
  issues: CampaignSimulationReadinessIssue[];
}

export function buildPopulationCalculationReferences(
  set: CompensationReferenceSet,
): ReferencesBuildResult {
  const issues: CampaignSimulationReadinessIssue[] = [];

  const familyCodes = new Set<string>();
  for (const family of set.jobFamilies) {
    const code = family.code.trim().toUpperCase();
    if (familyCodes.has(code)) {
      issues.push({
        scope: "references",
        code: "INCOMPLETE_COMPENSATION_REFERENCES",
        field: "jobFamilies",
        severity: "blocking",
        message: `Code famille dupliqué : ${family.code}.`,
      });
    }
    familyCodes.add(code);
  }

  const gradeCodes = new Set<string>();
  for (const grade of set.grades) {
    const code = grade.code.trim().toUpperCase();
    if (gradeCodes.has(code)) {
      issues.push({
        scope: "references",
        code: "INCOMPLETE_COMPENSATION_REFERENCES",
        field: "grades",
        severity: "blocking",
        message: `Code grade dupliqué : ${grade.code}.`,
      });
    }
    gradeCodes.add(code);
  }

  const familiesById = new Map(set.jobFamilies.map((f) => [f.id, f]));
  const gradesById = new Map(set.grades.map((g) => [g.id, g]));
  const cellKeys = new Set<string>();
  const salaryGrid: PreparedSalaryGridCell[] = [];

  for (const cell of set.salaryGrid) {
    const family = familiesById.get(cell.jobFamilyId);
    const grade = gradesById.get(cell.gradeId);
    if (!family || !grade) {
      issues.push({
        scope: "references",
        code: "INCOMPLETE_COMPENSATION_REFERENCES",
        field: "salaryGrid",
        severity: "blocking",
        message: "Cellule S0 rattachée à une famille ou un grade inconnu.",
        details: {
          jobFamilyId: cell.jobFamilyId,
          gradeId: cell.gradeId,
        },
      });
      continue;
    }
    const key = `${family.code.trim().toUpperCase()}|${grade.code.trim().toUpperCase()}`;
    if (cellKeys.has(key)) {
      issues.push({
        scope: "references",
        code: "DUPLICATE_S0_REFERENCE",
        field: "salaryGrid",
        severity: "blocking",
        message: `Cellule S0 dupliquée pour ${family.code}/${grade.code}.`,
      });
    }
    cellKeys.add(key);
    salaryGrid.push({
      familyCode: family.code,
      gradeCode: grade.code,
      familyLabel: family.label,
      gradeLabel: grade.label,
      s0Fcfa: cell.s0Amount,
    });
  }

  if (set.salaryPositions.length === 0) {
    issues.push({
      scope: "references",
      code: "INCOMPLETE_COMPENSATION_REFERENCES",
      field: "salaryPositions",
      severity: "blocking",
      message: "Aucune position salariale configurée.",
    });
  }

  const salaryPositions: SalaryPositionInputRow[] = set.salaryPositions.map(
    (position) => ({
      code: position.code,
      label: position.label,
      referenceRatioBps: position.referenceRatioBps,
      positionFactorMilli: position.positionFactorMilli,
    }),
  );

  const mode = set.config.nineBoxMode;
  if (
    (mode === "performance_only" || mode === "performance_potential") &&
    set.performanceFactors.length === 0
  ) {
    issues.push({
      scope: "evaluation",
      code: "INCOMPLETE_COMPENSATION_REFERENCES",
      field: "performanceFactors",
      severity: "blocking",
      message: "Facteurs Performance absents pour le mode courant.",
    });
  }
  if (mode === "performance_potential" && set.potentialFactors.length === 0) {
    issues.push({
      scope: "evaluation",
      code: "INCOMPLETE_COMPENSATION_REFERENCES",
      field: "potentialFactors",
      severity: "blocking",
      message: "Facteurs Potentiel absents pour le mode courant.",
    });
  }
  if (mode === "full_nine_box") {
    if (set.nineBoxFactors.length === 0) {
      issues.push({
        scope: "evaluation",
        code: "INCOMPLETE_COMPENSATION_REFERENCES",
        field: "nineBoxFactors",
        severity: "blocking",
        message: "Facteurs 9-Box absents pour le mode full_nine_box.",
      });
    }
    const semantic = new Set<string>();
    const boxCodes = new Set<number>();
    for (const factor of set.nineBoxFactors) {
      const key = `${factor.performanceLevel}/${factor.potentialLevel}`;
      if (semantic.has(key)) {
        issues.push({
          scope: "evaluation",
          code: "INCOMPLETE_COMPENSATION_REFERENCES",
          field: "nineBoxFactors",
          severity: "blocking",
          message: `Couple 9-Box dupliqué : ${key}.`,
        });
      }
      semantic.add(key);
      if (boxCodes.has(factor.boxCode)) {
        issues.push({
          scope: "evaluation",
          code: "DUPLICATE_NINE_BOX_CODE",
          field: "nineBoxFactors",
          severity: "blocking",
          message: `boxCode dupliqué : ${factor.boxCode}.`,
        });
      }
      boxCodes.add(factor.boxCode);
    }
  }

  const blocking = issues.filter((issue) => issue.severity === "blocking");
  if (blocking.length > 0) {
    return { references: null, issues };
  }

  return {
    references: {
      evaluationMode: mode,
      salaryGrid,
      salaryPositions,
      performanceFactors: set.performanceFactors.map((factor) => ({
        level: factor.level,
        factorMilli: factor.factorMilli,
      })),
      potentialFactors: set.potentialFactors.map((factor) => ({
        level: factor.level,
        factorMilli: factor.factorMilli,
      })),
      nineBoxFactors: set.nineBoxFactors.map((factor) => ({
        performanceLevel: factor.performanceLevel,
        potentialLevel: factor.potentialLevel,
        factorMilli: factor.factorMilli,
        boxCode: factor.boxCode,
      })),
    },
    issues,
  };
}
