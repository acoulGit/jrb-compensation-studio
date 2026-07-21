/** Validation structurelle d’une population préparée (Lot 2A-4). */

import type { PopulationCalculationIssueLike } from "./errors";
import type {
  PopulationCalculationIssue,
  PopulationCalculationValidationResult,
  PreparedPopulationCalculationInput,
} from "./preparedPopulationModels";
import { ROUNDING_MODES } from "./populationAllocationModels";
import { BUDGET_TARGET_MODES } from "./budgetTargetModels";
import { NINE_BOX_MODES } from "../compensationReference/models";
import { PROMOTION_BUDGET_EMPLOYMENT_STATUSES } from "./promotionBudgetPopulation";

function issue(
  partial: PopulationCalculationIssue,
): PopulationCalculationIssue {
  return partial;
}

/**
 * Valide la forme de l’entrée population sans exécuter les moteurs.
 * Collecte toutes les issues détectables.
 */
export function validatePreparedPopulationCalculationInput(
  input: PreparedPopulationCalculationInput,
): PopulationCalculationValidationResult {
  const issues: PopulationCalculationIssue[] = [];

  if (!input.employees || input.employees.length === 0) {
    issues.push(
      issue({
        code: "EMPTY_POPULATION",
        message: "La population préparée est vide.",
        step: "validate_input",
      }),
    );
  }

  if (!input.references) {
    issues.push(
      issue({
        code: "INCOMPLETE_CALCULATION_REFERENCES",
        message: "Les référentiels de calcul sont absents.",
        step: "validate_input",
      }),
    );
  } else {
    if (
      !(NINE_BOX_MODES as readonly string[]).includes(
        input.references.evaluationMode,
      )
    ) {
      issues.push(
        issue({
          code: "UNSUPPORTED_EVALUATION_MODE",
          message: `Mode d’évaluation non supporté : ${String(input.references.evaluationMode)}.`,
          field: "evaluationMode",
          step: "validate_input",
        }),
      );
    }
    if (
      !Array.isArray(input.references.salaryPositions) ||
      input.references.salaryPositions.length === 0
    ) {
      issues.push(
        issue({
          code: "INCOMPLETE_CALCULATION_REFERENCES",
          message: "Le référentiel de positions salariales est incomplet.",
          field: "salaryPositions",
          step: "validate_input",
        }),
      );
    }
    if (!Array.isArray(input.references.salaryGrid)) {
      issues.push(
        issue({
          code: "INCOMPLETE_CALCULATION_REFERENCES",
          message: "La grille S0 est absente.",
          field: "salaryGrid",
          step: "validate_input",
        }),
      );
    }
  }

  if (!input.budgetTarget || typeof input.budgetTarget.mode !== "string") {
    issues.push(
      issue({
        code: "UNSUPPORTED_BUDGET_TARGET_MODE",
        message: "Le mode de budget cible est obligatoire.",
        field: "budgetTarget.mode",
        step: "validate_input",
      }),
    );
  } else if (
    !(BUDGET_TARGET_MODES as readonly string[]).includes(input.budgetTarget.mode)
  ) {
    issues.push(
      issue({
        code: "UNSUPPORTED_BUDGET_TARGET_MODE",
        message: `Mode de budget non supporté : ${input.budgetTarget.mode}.`,
        field: "budgetTarget.mode",
        step: "validate_input",
      }),
    );
  }

  if (!input.roundingPolicy) {
    issues.push(
      issue({
        code: "MISSING_ROUNDING_POLICY",
        message: "La politique d’arrondi est obligatoire.",
        field: "roundingPolicy",
        step: "validate_input",
      }),
    );
  } else if (
    !(ROUNDING_MODES as readonly string[]).includes(input.roundingPolicy.mode)
  ) {
    issues.push(
      issue({
        code: "UNSUPPORTED_ROUNDING_MODE",
        message: `Mode d’arrondi non supporté : ${String(input.roundingPolicy.mode)}.`,
        field: "roundingPolicy.mode",
        step: "validate_input",
      }),
    );
  }

  if (
    !Number.isInteger(input.campaignYear) ||
    input.campaignYear < 2000 ||
    input.campaignYear > 2100
  ) {
    issues.push(
      issue({
        code: "INVALID_CAMPAIGN_YEAR",
        message:
          "L’année de campagne doit être un entier entre 2000 et 2100.",
        field: "campaignYear",
        step: "validate_input",
      }),
    );
  }

  if (
    !Number.isInteger(input.technicalApplicationMonth) ||
    input.technicalApplicationMonth < 1 ||
    input.technicalApplicationMonth > 12
  ) {
    issues.push(
      issue({
        code: "INVALID_TECHNICAL_APPLICATION_MONTH",
        message:
          "Le mois d’application technique doit être un entier entre 1 et 12.",
        field: "technicalApplicationMonth",
        step: "validate_input",
      }),
    );
  }

  const seenIds = new Set<string>();
  for (const employee of input.employees ?? []) {
    if (
      typeof employee.employeeId !== "string" ||
      employee.employeeId.trim() === ""
    ) {
      issues.push(
        issue({
          employeeId: employee.employeeId,
          code: "INVALID_EMPLOYEE_ID",
          field: "employeeId",
          message: "L’identifiant salarié doit être une chaîne non vide.",
          step: "validate_input",
        }),
      );
      continue;
    }
    if (seenIds.has(employee.employeeId)) {
      issues.push(
        issue({
          employeeId: employee.employeeId,
          code: "DUPLICATE_EMPLOYEE_ID",
          field: "employeeId",
          message: `Identifiant salarié dupliqué : ${employee.employeeId}.`,
          step: "validate_input",
        }),
      );
    }
    seenIds.add(employee.employeeId);

    if (
      typeof employee.familyCode !== "string" ||
      employee.familyCode.trim() === ""
    ) {
      issues.push(
        issue({
          employeeId: employee.employeeId,
          code: "INVALID_FAMILY_CODE",
          field: "familyCode",
          message: "Le code famille est obligatoire.",
          step: "validate_input",
        }),
      );
    }
    if (
      typeof employee.gradeCode !== "string" ||
      employee.gradeCode.trim() === ""
    ) {
      issues.push(
        issue({
          employeeId: employee.employeeId,
          code: "INVALID_GRADE_CODE",
          field: "gradeCode",
          message: "Le code grade est obligatoire.",
          step: "validate_input",
        }),
      );
    }

    const salary = employee.salaryFcfa;
    const salaryOk =
      (typeof salary === "bigint" && salary > 0n) ||
      (typeof salary === "number" && Number.isInteger(salary) && salary > 0);
    if (!salaryOk) {
      issues.push(
        issue({
          employeeId: employee.employeeId,
          code: "INVALID_SALARY",
          field: "salaryFcfa",
          message: "Le salaire doit être un entier FCFA strictement positif.",
          step: "validate_input",
        }),
      );
    }

  if (
    typeof employee.confirmedUnderperformer !== "boolean"
  ) {
    issues.push(
      issue({
        employeeId: employee.employeeId,
        code: "EMPLOYEE_CALCULATION_FAILED",
        field: "confirmedUnderperformer",
        message: "confirmedUnderperformer doit être un booléen explicite.",
        step: "validate_input",
      }),
    );
  }

  if (
    typeof employee.hireDate !== "string" ||
    employee.hireDate.trim() === ""
  ) {
    issues.push(
      issue({
        employeeId: employee.employeeId,
        code: "MISSING_HIRE_DATE",
        field: "hireDate",
        message:
          "La date d’embauche est obligatoire pour l’incidence d’ancienneté.",
        step: "validate_input",
      }),
    );
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(employee.hireDate.trim())) {
    issues.push(
      issue({
        employeeId: employee.employeeId,
        code: "INVALID_HIRE_DATE",
        field: "hireDate",
        message: "La date d’embauche doit être au format ISO YYYY-MM-DD.",
        step: "validate_input",
      }),
    );
  }

  if (
    employee.employmentStatus !== undefined &&
    employee.employmentStatus !== null &&
    !(PROMOTION_BUDGET_EMPLOYMENT_STATUSES as readonly string[]).includes(
      employee.employmentStatus,
    )
  ) {
    issues.push(
      issue({
        employeeId: employee.employeeId,
        code: "INVALID_EMPLOYMENT_STATUS",
        field: "employmentStatus",
        message: `Statut d’emploi non supporté : ${String(employee.employmentStatus)}.`,
        step: "validate_input",
      }),
    );
  }

  if (
    employee.compensatoryMeasureEligible !== undefined &&
    typeof employee.compensatoryMeasureEligible !== "boolean"
  ) {
    issues.push(
      issue({
        employeeId: employee.employeeId,
        code: "INVALID_COMPENSATORY_MEASURE_ELIGIBLE",
        field: "compensatoryMeasureEligible",
        message: "compensatoryMeasureEligible doit être un booléen si renseigné.",
        step: "validate_input",
      }),
    );
  }
}

  return { isValid: issues.length === 0, issues };
}

export function toIssueLikes(
  issues: readonly PopulationCalculationIssue[],
): PopulationCalculationIssueLike[] {
  return issues.map((item) => ({ ...item }));
}
