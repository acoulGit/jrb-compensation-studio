/**
 * Mapping EmployeeSnapshot → PreparedEmployeeCalculationInput (Lot 2B-1).
 *
 * Contrat source → moteur :
 * | Cible              | Source                         | Transformation                          |
 * |--------------------|--------------------------------|-----------------------------------------|
 * | employeeId         | employeeNumber                 | trim ; non vide                         |
 * | familyCode         | jobFamilyId → référentiel      | code famille                            |
 * | gradeCode          | gradeId → référentiel          | code grade                              |
 * | salaryFcfa         | decemberBaseSalary             | entier > 0                              |
 * | performanceLevel   | nineBoxCode → facteurs 9-Box   | si mode l’exige ; sinon omis            |
 * | potentialLevel     | nineBoxCode → facteurs 9-Box   | si mode l’exige ; sinon omis            |
 * | confirmedUnderperformer | confirmedUnderperformer   | booléen explicite (Lot 1C post-import)  |
 * | neutralizeNineBoxEffect | neutralizeNineBoxEffect | booléen ; défaut false (Lot 2B-RC1-H1) |
 * | sourceNineBoxCode  | nineBoxCode                    | conservé pour traçabilité               |
 * | hireDate           | hireDate                   | ISO YYYY-MM-DD (Lot 2A-H2B)             |
 * | employmentStatus   | employmentStatus           | propagé (Lot 2A-H2C-2)                  |
 * | contractType       | contractType               | propagé ; éligibilité mesure (H2C-2A)   |
 * | compensatoryMeasureEligible | règles métier documentées | `isCompensatoryMeasureEligible` |
 *
 * Aucune valeur par défaut silencieuse dans ce mapper.
 */

import { compareEmployeeIdAsc } from "../../domain/compensationCalculation";
import type { PreparedEmployeeCalculationInput } from "../../domain/compensationCalculation";
import {
  PromotionValidationError,
  buildPromotionEvent,
  isCompensatoryMeasureEligible,
  validatePromotionAgainstDecemberSnapshot,
} from "../../domain/compensationCalculation";
import type {
  Grade,
  JobFamily,
  NineBoxFactor,
  NineBoxMode,
} from "../../domain/compensationReference/models";
import type { EmployeeSnapshot } from "../../domain/hrImport/models";
import type { CampaignSimulationReadinessIssue } from "./campaignSimulationModels";
import { normalizePerformanceLevel, normalizePotentialLevel } from "./normalizeFactorLevel";

export interface EmployeeMappingContext {
  evaluationMode: NineBoxMode;
  campaignYear: number;
  familiesById: ReadonlyMap<number, JobFamily>;
  gradesById: ReadonlyMap<number, Grade>;
  nineBoxFactorsByCode: ReadonlyMap<number, NineBoxFactor>;
}

export interface EmployeeMappingSuccess {
  ok: true;
  prepared: PreparedEmployeeCalculationInput;
  warnings: CampaignSimulationReadinessIssue[];
}

export interface EmployeeMappingFailure {
  ok: false;
  issues: CampaignSimulationReadinessIssue[];
}

export type EmployeeMappingResult =
  | EmployeeMappingSuccess
  | EmployeeMappingFailure;

function modeRequiresPerformance(mode: NineBoxMode): boolean {
  return (
    mode === "performance_only" ||
    mode === "full_nine_box" ||
    mode === "performance_potential"
  );
}

function modeRequiresPotential(mode: NineBoxMode): boolean {
  return mode === "full_nine_box" || mode === "performance_potential";
}

/**
 * Convertit un snapshot importé vers l’entrée moteur.
 * Ne mute pas `employee`.
 */
export function mapImportedEmployeeToPreparedInput(
  employee: EmployeeSnapshot,
  context: EmployeeMappingContext,
): EmployeeMappingResult {
  const issues: CampaignSimulationReadinessIssue[] = [];
  const warnings: CampaignSimulationReadinessIssue[] = [];
  const employeeId = employee.employeeNumber?.trim() ?? "";

  if (!employeeId) {
    issues.push({
      scope: "employee",
      employeeId: employee.employeeNumber,
      code: "EMPLOYEE_MAPPING_FAILED",
      field: "employeeId",
      severity: "blocking",
      message: "Le matricule (employeeId) est vide.",
    });
  }

  const family = context.familiesById.get(Number(employee.jobFamilyId));
  if (!family) {
    issues.push({
      scope: "employee",
      employeeId: employeeId || undefined,
      code: "UNKNOWN_FAMILY",
      field: "familyCode",
      severity: "blocking",
      message: `Famille introuvable pour jobFamilyId=${employee.jobFamilyId}.`,
      details: { jobFamilyId: Number(employee.jobFamilyId) },
    });
  } else if (!family.code.trim()) {
    issues.push({
      scope: "employee",
      employeeId: employeeId || undefined,
      code: "MISSING_EMPLOYEE_FAMILY",
      field: "familyCode",
      severity: "blocking",
      message: "Le code famille du référentiel est vide.",
    });
  }

  const grade = context.gradesById.get(Number(employee.gradeId));
  if (!grade) {
    issues.push({
      scope: "employee",
      employeeId: employeeId || undefined,
      code: "UNKNOWN_GRADE",
      field: "gradeCode",
      severity: "blocking",
      message: `Grade introuvable pour gradeId=${employee.gradeId}.`,
      details: { gradeId: Number(employee.gradeId) },
    });
  } else if (!grade.code.trim()) {
    issues.push({
      scope: "employee",
      employeeId: employeeId || undefined,
      code: "MISSING_EMPLOYEE_GRADE",
      field: "gradeCode",
      severity: "blocking",
      message: "Le code grade du référentiel est vide.",
    });
  }

  const salary = employee.decemberBaseSalary;
  if (
    typeof salary !== "number" ||
    !Number.isInteger(salary) ||
    salary <= 0
  ) {
    issues.push({
      scope: "employee",
      employeeId: employeeId || undefined,
      code: "INVALID_EMPLOYEE_SALARY",
      field: "salaryFcfa",
      severity: "blocking",
      message: "Le salaire de base décembre N-1 doit être un entier FCFA > 0.",
      details: { decemberBaseSalary: salary ?? null },
    });
  }

  if (
    employee.confirmedUnderperformer !== true &&
    employee.confirmedUnderperformer !== false
  ) {
    issues.push({
      scope: "employee",
      employeeId: employeeId || undefined,
      code: "MISSING_CONFIRMED_UNDERPERFORMER",
      field: "confirmedUnderperformer",
      severity: "blocking",
      message:
        "Le statut sous-performant confirmé est indéterminé (booléen requis).",
    });
  }

  const hireDateRaw = employee.hireDate?.trim() ?? "";
  if (!hireDateRaw) {
    issues.push({
      scope: "employee",
      employeeId: employeeId || undefined,
      code: "MISSING_HIRE_DATE",
      field: "hireDate",
      severity: "blocking",
      message:
        "La date d’embauche est obligatoire pour l’incidence d’ancienneté.",
    });
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(hireDateRaw)) {
    issues.push({
      scope: "employee",
      employeeId: employeeId || undefined,
      code: "INVALID_HIRE_DATE",
      field: "hireDate",
      severity: "blocking",
      message: "La date d’embauche doit être au format ISO YYYY-MM-DD.",
      details: { hireDate: hireDateRaw },
    });
  }

  let performanceLevel: PreparedEmployeeCalculationInput["performanceLevel"];
  let potentialLevel: PreparedEmployeeCalculationInput["potentialLevel"];

  const neutralizeNineBoxEffect = employee.neutralizeNineBoxEffect === true;
  const sourceNineBoxCode =
    employee.nineBoxCode === undefined ? null : employee.nineBoxCode;

  const needsPerformance = modeRequiresPerformance(context.evaluationMode);
  const needsPotential = modeRequiresPotential(context.evaluationMode);

  if (needsPerformance || needsPotential) {
    if (employee.nineBoxCode === null || employee.nineBoxCode === undefined) {
      if (!neutralizeNineBoxEffect) {
        if (needsPerformance) {
          issues.push({
            scope: "employee",
            employeeId: employeeId || undefined,
            code: "MISSING_EMPLOYEE_PERFORMANCE",
            field: "performanceLevel",
            severity: "blocking",
            message:
              "Niveau Performance requis : nineBoxCode absent sur le salarié importé.",
          });
        }
        if (needsPotential) {
          issues.push({
            scope: "employee",
            employeeId: employeeId || undefined,
            code: "MISSING_EMPLOYEE_POTENTIAL",
            field: "potentialLevel",
            severity: "blocking",
            message:
              "Niveau Potentiel requis : nineBoxCode absent sur le salarié importé.",
          });
        }
      }
    } else {
      const nineBox = context.nineBoxFactorsByCode.get(employee.nineBoxCode);
      if (!nineBox) {
        if (!neutralizeNineBoxEffect) {
          issues.push({
            scope: "employee",
            employeeId: employeeId || undefined,
            code: "INVALID_NINE_BOX_CODE",
            field: "nineBoxCode",
            severity: "blocking",
            message: `Code 9-Box ${employee.nineBoxCode} absent du référentiel campagne.`,
            details: { nineBoxCode: employee.nineBoxCode },
          });
        }
      } else {
        const perf = normalizePerformanceLevel(nineBox.performanceLevel);
        const pot = normalizePotentialLevel(nineBox.potentialLevel);
        if (needsPerformance) {
          if (!perf) {
            if (!neutralizeNineBoxEffect) {
              issues.push({
                scope: "employee",
                employeeId: employeeId || undefined,
                code: "UNKNOWN_FACTOR_LEVEL",
                field: "performanceLevel",
                severity: "blocking",
                message: `Niveau Performance non canonique : ${nineBox.performanceLevel}.`,
              });
            }
          } else {
            performanceLevel = perf;
          }
        }
        if (needsPotential) {
          if (!pot) {
            if (!neutralizeNineBoxEffect) {
              issues.push({
                scope: "employee",
                employeeId: employeeId || undefined,
                code: "UNKNOWN_FACTOR_LEVEL",
                field: "potentialLevel",
                severity: "blocking",
                message: `Niveau Potentiel non canonique : ${nineBox.potentialLevel}.`,
              });
            }
          } else {
            potentialLevel = pot;
          }
        }
      }
      if (neutralizeNineBoxEffect) {
        warnings.push({
          scope: "employee",
          employeeId: employeeId || undefined,
          code: "NINE_BOX_CODE_IGNORED_NEUTRALIZED",
          field: "nineBoxCode",
          severity: "warning",
          message:
            "Le code 9-Box source a été conservé mais n’a pas été appliqué, car la performance est indiquée comme étant en cours de confirmation.",
          details: { nineBoxCode: employee.nineBoxCode },
        });
      }
    }
  } else if (
    neutralizeNineBoxEffect &&
    employee.nineBoxCode !== null &&
    employee.nineBoxCode !== undefined
  ) {
    warnings.push({
      scope: "employee",
      employeeId: employeeId || undefined,
      code: "NINE_BOX_CODE_IGNORED_NEUTRALIZED",
      field: "nineBoxCode",
      severity: "warning",
      message:
        "Le code 9-Box source a été conservé mais n’a pas été appliqué, car la performance est indiquée comme étant en cours de confirmation.",
      details: { nineBoxCode: employee.nineBoxCode },
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  let promotion: PreparedEmployeeCalculationInput["promotion"] = null;
  if (employee.promotionDate) {
    const previousGrade =
      context.gradesById.get(Number(employee.previousGradeId)) ??
      // Fallback défensif : grade courant du salarié si ancien grade absent.
      grade ??
      null;
    const promotedGrade =
      context.gradesById.get(Number(employee.promotedGradeId)) ??
      // Lot 2B-RC1-H3 : grade après vide → conserver le grade d’origine.
      previousGrade ??
      null;
    const previousFamily =
      context.familiesById.get(Number(employee.previousJobFamilyId)) ??
      family ??
      null;
    const promotedFamily =
      context.familiesById.get(Number(employee.promotedJobFamilyId)) ??
      previousFamily ??
      family ??
      null;
    if (
      !previousGrade ||
      !promotedGrade ||
      !previousFamily ||
      !promotedFamily ||
      employee.salaryBeforePromotion === null ||
      employee.salaryAfterPromotion === null
    ) {
      issues.push({
        scope: "employee",
        employeeId: employeeId || undefined,
        code: "INCOMPLETE_PROMOTION_SNAPSHOT",
        field: "promotion",
        severity: "blocking",
        message: "Données de promotion incomplètes sur le snapshot importé.",
      });
      return { ok: false, issues };
    }
    try {
      const event = buildPromotionEvent({
        promotionDate: employee.promotionDate,
        salaryBeforePromotionFcfa: BigInt(employee.salaryBeforePromotion),
        salaryAfterPromotionFcfa: BigInt(employee.salaryAfterPromotion),
        previousGradeCode: previousGrade.code,
        promotedGradeCode: promotedGrade.code,
        previousJobFamilyCode: previousFamily.code,
        promotedJobFamilyCode: promotedFamily.code,
      });
      validatePromotionAgainstDecemberSnapshot({
        event,
        campaignYear: context.campaignYear,
        decemberBaseSalaryFcfa: BigInt(salary),
        currentGradeCode: grade!.code,
        currentJobFamilyCode: family!.code,
      });
      promotion = event;
    } catch (error) {
      const message =
        error instanceof PromotionValidationError
          ? error.message
          : "Validation promotion impossible.";
      const code =
        error instanceof PromotionValidationError
          ? error.code
          : "PROMOTION_MAPPING_FAILED";
      issues.push({
        scope: "employee",
        employeeId: employeeId || undefined,
        code,
        field: "promotion",
        severity: "blocking",
        message,
      });
      return { ok: false, issues };
    }
  }

  const prepared: PreparedEmployeeCalculationInput = {
    employeeId,
    familyCode: family!.code,
    gradeCode: grade!.code,
    salaryFcfa: salary,
    hireDate: hireDateRaw,
    confirmedUnderperformer: employee.confirmedUnderperformer,
    neutralizeNineBoxEffect,
    sourceNineBoxCode,
    promotion,
    contractType: employee.contractType,
    employmentStatus: employee.employmentStatus ?? null,
    compensatoryMeasureEligible: isCompensatoryMeasureEligible({
      contractType: employee.contractType,
      hireDate: hireDateRaw,
      campaignYear: context.campaignYear,
      employmentStatus: employee.employmentStatus,
    }),
    ...(performanceLevel !== undefined ? { performanceLevel } : {}),
    ...(potentialLevel !== undefined ? { potentialLevel } : {}),
  };

  return { ok: true, prepared, warnings };
}

export function sortPreparedEmployees(
  employees: readonly PreparedEmployeeCalculationInput[],
): PreparedEmployeeCalculationInput[] {
  return [...employees].sort((left, right) =>
    compareEmployeeIdAsc(left.employeeId, right.employeeId),
  );
}
