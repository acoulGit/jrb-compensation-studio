/** Calcul déterministe de la complétude du référentiel. */

import {
  GRADE_COUNT,
  JOB_FAMILY_COUNT,
  NINE_BOX_FACTOR_COUNT,
  PERFORMANCE_FACTOR_COUNT,
  POTENTIAL_FACTOR_COUNT,
  SALARY_GRID_CELL_COUNT,
  SALARY_POSITION_COUNT,
  type CompensationReferenceSet,
  type CompletenessSectionStatus,
  type ReferenceCompleteness,
  type ReferenceValidationIssue,
} from "./models";
import { isValidFactorMilli } from "./validationHelpers";

function isNonEmptyTrimmed(value: string): boolean {
  return value.trim().length > 0;
}

function uniqueCodes(codes: string[]): boolean {
  const normalized = codes.map((code) => code.trim().toUpperCase());
  return new Set(normalized).size === normalized.length;
}

export function computeReferenceCompleteness(
  set: CompensationReferenceSet,
): ReferenceCompleteness {
  const issues: ReferenceValidationIssue[] = [];

  const structureFamiliesOk =
    set.jobFamilies.length === JOB_FAMILY_COUNT &&
    set.jobFamilies.every(
      (family) =>
        isNonEmptyTrimmed(family.code) && isNonEmptyTrimmed(family.label),
    ) &&
    uniqueCodes(set.jobFamilies.map((family) => family.code));

  const structureGradesOk =
    set.grades.length === GRADE_COUNT &&
    set.grades.every(
      (grade) =>
        isNonEmptyTrimmed(grade.code) && isNonEmptyTrimmed(grade.label),
    ) &&
    uniqueCodes(set.grades.map((grade) => grade.code));

  const structureComplete = structureFamiliesOk && structureGradesOk;

  if (!structureFamiliesOk) {
    issues.push({
      code: "STRUCTURE_FAMILIES",
      section: "structure",
      message:
        "Compléter les 5 familles (codes et libellés valides et uniques).",
    });
  }
  if (!structureGradesOk) {
    issues.push({
      code: "STRUCTURE_GRADES",
      section: "structure",
      message:
        "Compléter les 6 grades (codes et libellés valides et uniques).",
    });
  }

  const salaryGridFilledCount = set.salaryGrid.filter(
    (cell) => cell.s0Amount !== null && cell.s0Amount > 0,
  ).length;
  const salaryGridComplete =
    set.salaryGrid.length === SALARY_GRID_CELL_COUNT &&
    salaryGridFilledCount === SALARY_GRID_CELL_COUNT;

  if (!salaryGridComplete) {
    issues.push({
      code: "SALARY_GRID",
      section: "salary_grid",
      message: `Renseigner les médianes S0 manquantes (${salaryGridFilledCount}/${SALARY_GRID_CELL_COUNT}).`,
    });
  }

  const positionsComplete =
    set.salaryPositions.length === SALARY_POSITION_COUNT &&
    set.salaryPositions.every((position) =>
      isValidFactorMilli(position.positionFactorMilli),
    );

  if (!positionsComplete) {
    issues.push({
      code: "POSITIONS",
      section: "positions",
      message: "Vérifier les 17 coefficients de position salariale.",
    });
  }

  const performanceValid =
    set.performanceFactors.length === PERFORMANCE_FACTOR_COUNT &&
    set.performanceFactors.every((factor) =>
      isValidFactorMilli(factor.factorMilli),
    );
  const potentialValid =
    set.potentialFactors.length === POTENTIAL_FACTOR_COUNT &&
    set.potentialFactors.every((factor) =>
      isValidFactorMilli(factor.factorMilli),
    );
  const nineBoxValid =
    set.nineBoxFactors.length === NINE_BOX_FACTOR_COUNT &&
    set.nineBoxFactors.every((factor) =>
      isValidFactorMilli(factor.factorMilli),
    );

  let performanceStatus: CompletenessSectionStatus = "not_required";
  let potentialStatus: CompletenessSectionStatus = "not_required";
  let nineBoxStatus: CompletenessSectionStatus = "not_required";

  switch (set.config.nineBoxMode) {
    case "none":
      break;
    case "performance_only":
      performanceStatus = performanceValid ? "complete" : "incomplete";
      if (!performanceValid) {
        issues.push({
          code: "PERFORMANCE",
          section: "performance",
          message: "Compléter les 3 coefficients Performance.",
        });
      }
      break;
    case "full_nine_box":
      nineBoxStatus = nineBoxValid ? "complete" : "incomplete";
      if (!nineBoxValid) {
        issues.push({
          code: "NINE_BOX",
          section: "nine_box",
          message: "Compléter les 9 coefficients de la matrice 9-Box.",
        });
      }
      break;
    case "performance_potential":
      performanceStatus = performanceValid ? "complete" : "incomplete";
      potentialStatus = potentialValid ? "complete" : "incomplete";
      if (!performanceValid) {
        issues.push({
          code: "PERFORMANCE",
          section: "performance",
          message: "Compléter les 3 coefficients Performance.",
        });
      }
      if (!potentialValid) {
        issues.push({
          code: "POTENTIAL",
          section: "potential",
          message: "Compléter les 3 coefficients Potentiel.",
        });
      }
      break;
  }

  const modeSectionComplete =
    performanceStatus !== "incomplete" &&
    potentialStatus !== "incomplete" &&
    nineBoxStatus !== "incomplete";

  const sectionFlags = [
    structureComplete,
    salaryGridComplete,
    positionsComplete,
    modeSectionComplete,
  ];
  const completedSections = sectionFlags.filter(Boolean).length;
  const totalSections = sectionFlags.length;
  const ready = completedSections === totalSections;

  return {
    ready,
    badge: ready ? "Prêt" : "À compléter",
    completedSections,
    totalSections,
    percent: Math.round((completedSections / totalSections) * 100),
    structureComplete,
    salaryGridComplete,
    salaryGridFilledCount,
    salaryGridTotal: SALARY_GRID_CELL_COUNT,
    positionsComplete,
    performanceStatus,
    potentialStatus,
    nineBoxStatus,
    nineBoxMode: set.config.nineBoxMode,
    issues,
  };
}
