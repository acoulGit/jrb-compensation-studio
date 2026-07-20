/**
 * Construction et validation des référentiels moteur (Lots 2B-1 / 2B-2).
 * S’aligne sur computeReferenceCompleteness (page Référentiels) puis ajoute
 * les contrôles structuraux du moteur (positions, facteurs par mode).
 */

import { resolveSalaryPosition } from "../../domain/compensationCalculation";
import { CompensationCalculationError } from "../../domain/compensationCalculation/errors";
import type {
  PopulationCalculationReferences,
  PreparedSalaryGridCell,
  SalaryPositionInputRow,
} from "../../domain/compensationCalculation";
import { computeReferenceCompleteness } from "../../domain/compensationReference/completeness";
import type { CompensationReferenceSet } from "../../domain/compensationReference/models";
import {
  PERFORMANCE_FACTOR_COUNT,
  POTENTIAL_FACTOR_COUNT,
} from "../../domain/compensationReference/models";
import type { CampaignSimulationReadinessIssue } from "./campaignSimulationModels";

export interface ReferencesBuildResult {
  references: PopulationCalculationReferences | null;
  issues: CampaignSimulationReadinessIssue[];
  /** Complétude éditoriale (même fonction que ReferencesPage). */
  editorialReady: boolean;
}

function mapCompletenessIssue(
  code: string,
  section: string,
  message: string,
): CampaignSimulationReadinessIssue {
  const scope =
    section === "performance" ||
    section === "potential" ||
    section === "nine_box" ||
    section === "mode"
      ? "evaluation"
      : "references";

  let readinessCode = "INCOMPLETE_COMPENSATION_REFERENCES";
  if (code === "SALARY_GRID") {
    readinessCode = "S0_REFERENCE_NOT_FOUND";
  } else if (code === "POSITIONS") {
    readinessCode = "EMPTY_POSITION_REFERENCE";
  } else if (code === "PERFORMANCE" || code === "POTENTIAL") {
    readinessCode = "FACTOR_NOT_FOUND";
  } else if (code === "NINE_BOX") {
    readinessCode = "FACTOR_NOT_FOUND";
  }

  return {
    scope,
    code: readinessCode,
    field: section,
    severity: "blocking",
    message,
    details: { editorialCode: code },
  };
}

function pushUniqueIssue(
  issues: CampaignSimulationReadinessIssue[],
  issue: CampaignSimulationReadinessIssue,
): void {
  const exists = issues.some(
    (item) =>
      item.code === issue.code &&
      item.field === issue.field &&
      item.message === issue.message,
  );
  if (!exists) {
    issues.push(issue);
  }
}

function validatePositionCatalog(
  salaryPositions: readonly SalaryPositionInputRow[],
  issues: CampaignSimulationReadinessIssue[],
): void {
  try {
    // Déclenche la validation de catalogue (Sout±, ancres, unicité).
    resolveSalaryPosition({
      salaryFcfa: 100_000,
      s0Fcfa: 100_000,
      salaryPositions,
    });
  } catch (error) {
    if (error instanceof CompensationCalculationError) {
      pushUniqueIssue(issues, {
        scope: "references",
        code: error.code,
        field: "salaryPositions",
        severity: "blocking",
        message: error.message,
      });
      return;
    }
    pushUniqueIssue(issues, {
      scope: "references",
      code: "INCOMPLETE_COMPENSATION_REFERENCES",
      field: "salaryPositions",
      severity: "blocking",
      message: "Le catalogue de positions salariales est invalide pour le moteur.",
    });
  }
}

function requireLevelFactors(
  label: "Performance" | "Potentiel",
  factors: readonly { level: string; factorMilli: number }[],
  expectedCount: number,
  issues: CampaignSimulationReadinessIssue[],
): void {
  const levels = new Set(factors.map((factor) => factor.level));
  for (const level of ["low", "medium", "high"] as const) {
    if (!levels.has(level)) {
      pushUniqueIssue(issues, {
        scope: "evaluation",
        code: "FACTOR_NOT_FOUND",
        field: label === "Performance" ? "performanceFactors" : "potentialFactors",
        severity: "blocking",
        message: `Facteur ${label} manquant pour le niveau « ${level} ».`,
      });
    }
  }
  if (factors.length !== expectedCount) {
    pushUniqueIssue(issues, {
      scope: "evaluation",
      code: "FACTOR_NOT_FOUND",
      field: label === "Performance" ? "performanceFactors" : "potentialFactors",
      severity: "blocking",
      message: `Le mode courant exige ${expectedCount} facteurs ${label}.`,
    });
  }
  const seen = new Set<string>();
  for (const factor of factors) {
    if (seen.has(factor.level)) {
      pushUniqueIssue(issues, {
        scope: "evaluation",
        code: "DUPLICATE_FACTOR",
        field: label === "Performance" ? "performanceFactors" : "potentialFactors",
        severity: "blocking",
        message: `Facteur ${label} dupliqué pour le niveau « ${factor.level} ».`,
      });
    }
    seen.add(factor.level);
  }
}

/**
 * Évalue les référentiels pour le calcul : même complétude que Référentiels,
 * plus contrôles moteur. Ne force jamais isReady.
 */
export function buildPopulationCalculationReferences(
  set: CompensationReferenceSet,
): ReferencesBuildResult {
  const issues: CampaignSimulationReadinessIssue[] = [];
  const completeness = computeReferenceCompleteness(set);

  for (const issue of completeness.issues) {
    pushUniqueIssue(
      issues,
      mapCompletenessIssue(issue.code, issue.section, issue.message),
    );
  }

  const familyCodes = new Set<string>();
  for (const family of set.jobFamilies) {
    const code = family.code.trim().toUpperCase();
    if (familyCodes.has(code)) {
      pushUniqueIssue(issues, {
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
      pushUniqueIssue(issues, {
        scope: "references",
        code: "INCOMPLETE_COMPENSATION_REFERENCES",
        field: "grades",
        severity: "blocking",
        message: `Code grade dupliqué : ${grade.code}.`,
      });
    }
    gradeCodes.add(code);
  }

  const familiesById = new Map(
    set.jobFamilies.map((family) => [Number(family.id), family]),
  );
  const gradesById = new Map(
    set.grades.map((grade) => [Number(grade.id), grade]),
  );
  const cellKeys = new Set<string>();
  const salaryGrid: PreparedSalaryGridCell[] = [];

  for (const cell of set.salaryGrid) {
    const family = familiesById.get(Number(cell.jobFamilyId));
    const grade = gradesById.get(Number(cell.gradeId));
    if (!family || !grade) {
      pushUniqueIssue(issues, {
        scope: "references",
        code: "S0_REFERENCE_NOT_FOUND",
        field: "salaryGrid",
        severity: "blocking",
        message: "Cellule S0 rattachée à une famille ou un grade inconnu.",
        details: {
          jobFamilyId: Number(cell.jobFamilyId),
          gradeId: Number(cell.gradeId),
        },
      });
      continue;
    }
    const key = `${family.code.trim().toUpperCase()}|${grade.code.trim().toUpperCase()}`;
    if (cellKeys.has(key)) {
      pushUniqueIssue(issues, {
        scope: "references",
        code: "DUPLICATE_S0_REFERENCE",
        field: "salaryGrid",
        severity: "blocking",
        message: `Cellule S0 dupliquée pour ${family.code}/${grade.code}.`,
      });
    }
    cellKeys.add(key);

    const rawS0 = cell.s0Amount;
    const s0Fcfa =
      rawS0 === null || rawS0 === undefined
        ? null
        : typeof rawS0 === "bigint"
          ? rawS0
          : Number(rawS0);
    // Évite 30 issues redondantes si la complétude éditoriale a déjà signalé
    // la grille incomplète ; conserve un détail cellule uniquement si la grille
    // est considérée complète éditorialement (cas pathologique).
    if (
      completeness.salaryGridComplete &&
      (s0Fcfa === null ||
        (typeof s0Fcfa === "number" &&
          (!Number.isInteger(s0Fcfa) || s0Fcfa <= 0)) ||
        (typeof s0Fcfa === "bigint" && s0Fcfa <= 0n))
    ) {
      pushUniqueIssue(issues, {
        scope: "references",
        code: "S0_REFERENCE_NOT_FOUND",
        field: "salaryGrid",
        severity: "blocking",
        message: `S0 absent ou invalide pour ${family.code}/${grade.code}.`,
      });
    }

    salaryGrid.push({
      familyCode: family.code,
      gradeCode: grade.code,
      familyLabel: family.label,
      gradeLabel: grade.label,
      s0Fcfa,
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

  if (salaryPositions.length === 0) {
    pushUniqueIssue(issues, {
      scope: "references",
      code: "EMPTY_POSITION_REFERENCE",
      field: "salaryPositions",
      severity: "blocking",
      message: "Aucune position salariale configurée.",
    });
  } else {
    validatePositionCatalog(salaryPositions, issues);
  }

  const mode = set.config.nineBoxMode;
  if (mode === "performance_only" || mode === "performance_potential") {
    requireLevelFactors(
      "Performance",
      set.performanceFactors,
      PERFORMANCE_FACTOR_COUNT,
      issues,
    );
  }
  if (mode === "performance_potential") {
    requireLevelFactors(
      "Potentiel",
      set.potentialFactors,
      POTENTIAL_FACTOR_COUNT,
      issues,
    );
  }
  // Mode performance_only / none : Potentiel et 9-Box non exigés.
  if (mode === "full_nine_box") {
    if (set.nineBoxFactors.length === 0) {
      pushUniqueIssue(issues, {
        scope: "evaluation",
        code: "FACTOR_NOT_FOUND",
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
        pushUniqueIssue(issues, {
          scope: "evaluation",
          code: "DUPLICATE_FACTOR",
          field: "nineBoxFactors",
          severity: "blocking",
          message: `Couple 9-Box dupliqué : ${key}.`,
        });
      }
      semantic.add(key);
      if (boxCodes.has(factor.boxCode)) {
        pushUniqueIssue(issues, {
          scope: "evaluation",
          code: "DUPLICATE_NINE_BOX_CODE",
          field: "nineBoxFactors",
          severity: "blocking",
          message: `boxCode dupliqué : ${factor.boxCode}.`,
        });
      }
      boxCodes.add(factor.boxCode);
    }
    for (const perf of ["low", "medium", "high"] as const) {
      for (const pot of ["low", "medium", "high"] as const) {
        const key = `${perf}/${pot}`;
        if (!semantic.has(key)) {
          pushUniqueIssue(issues, {
            scope: "evaluation",
            code: "FACTOR_NOT_FOUND",
            field: "nineBoxFactors",
            severity: "blocking",
            message: `Couple 9-Box manquant : ${key}.`,
          });
        }
      }
    }
  }

  const blocking = issues.filter((issue) => issue.severity === "blocking");
  const engineOk = blocking.length === 0;
  // Alignement strict : pas de références moteur si la page Référentiels
  // n’est pas « Prêt », même si le build structurel passait.
  if (!completeness.ready || !engineOk) {
    return {
      references: null,
      issues,
      editorialReady: completeness.ready,
    };
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
    editorialReady: completeness.ready,
  };
}

/** Journalisation DEV sanitisée (aucun salaire salarié). */
export function logSimulationReferenceReadinessFailure(input: {
  campaignId: number;
  evaluationMode: string;
  set: CompensationReferenceSet;
  build: ReferencesBuildResult;
}): void {
  if (!import.meta.env.DEV) {
    return;
  }
  console.error("[SIMULATION_REFERENCE_READINESS_FAILED]", {
    campaignId: input.campaignId,
    evaluationMode: input.evaluationMode,
    familyCount: input.set.jobFamilies.length,
    gradeCount: input.set.grades.length,
    salaryGridCellCount: input.set.salaryGrid.length,
    salaryPositionCount: input.set.salaryPositions.length,
    performanceFactorCount: input.set.performanceFactors.length,
    potentialFactorCount: input.set.potentialFactors.length,
    nineBoxFactorCount: input.set.nineBoxFactors.length,
    editorialReady: input.build.editorialReady,
    buildIssues: input.build.issues.map((issue) => ({
      code: issue.code,
      field: issue.field ?? null,
      message: issue.message,
      scope: issue.scope,
    })),
  });
}
