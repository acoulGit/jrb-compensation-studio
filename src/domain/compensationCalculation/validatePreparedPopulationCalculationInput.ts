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
import { isSocialMechanismKind } from "./socialMechanism";
import { parseSeniorityReferenceDateIso } from "./universalFixedAmountPopulation";
import {
  type EmployerCostComponentLiability,
  type EmployerCostPolicy,
} from "./employerPeriodCost";

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

  const retroactivityStartMonth = input.retroactivityStartMonth ?? 1;
  if (
    !Number.isInteger(retroactivityStartMonth) ||
    retroactivityStartMonth < 1 ||
    retroactivityStartMonth > 12
  ) {
    issues.push(
      issue({
        code: "INVALID_RETROACTIVITY_START_MONTH",
        message:
          "Le mois de début de rétroactivité doit être un entier entre 1 et 12.",
        field: "retroactivityStartMonth",
        step: "validate_input",
      }),
    );
  } else if (
    Number.isInteger(input.technicalApplicationMonth) &&
    input.technicalApplicationMonth >= 1 &&
    input.technicalApplicationMonth <= 12 &&
    retroactivityStartMonth > input.technicalApplicationMonth
  ) {
    issues.push(
      issue({
        code: "RETROACTIVITY_MONTH_AFTER_APPLICATION_MONTH",
        message:
          "Le début de rétroactivité ne peut pas être postérieur au mois d’application technique.",
        field: "retroactivityStartMonth",
        step: "validate_input",
      }),
    );
  }

  const minimumGuaranteeEffectiveMonth =
    input.minimumGuaranteeEffectiveMonth ?? input.technicalApplicationMonth;
  if (
    input.minimumGuaranteeEffectiveMonth !== undefined &&
    (!Number.isInteger(minimumGuaranteeEffectiveMonth) ||
      minimumGuaranteeEffectiveMonth < 1 ||
      minimumGuaranteeEffectiveMonth > 12)
  ) {
    issues.push(
      issue({
        code: "INVALID_MINIMUM_GUARANTEE_EFFECTIVE_MONTH",
        message:
          "Le mois d’effet du minimum garanti doit être compris entre janvier et décembre.",
        field: "minimumGuaranteeEffectiveMonth",
        step: "validate_input",
      }),
    );
  }

  if (
    input.socialMechanismKind !== undefined &&
    !isSocialMechanismKind(input.socialMechanismKind)
  ) {
    issues.push(
      issue({
        code: "UNSUPPORTED_SOCIAL_MECHANISM_KIND",
        message: `Mécanisme social non supporté : ${String(input.socialMechanismKind)}.`,
        field: "socialMechanismKind",
        step: "validate_input",
      }),
    );
  }

  if (input.universalFixedAmountPolicy !== undefined) {
    const policy = input.universalFixedAmountPolicy;
    if (typeof policy.monthlyAmountFcfa !== "bigint" || policy.monthlyAmountFcfa < 0n) {
      issues.push(
        issue({
          code: "INVALID_UNIVERSAL_FIXED_AMOUNT",
          message:
            "Le montant du forfait social universel doit être un BigInt FCFA ≥ 0.",
          field: "universalFixedAmountPolicy.monthlyAmountFcfa",
          step: "validate_input",
        }),
      );
    }
    if (
      !Number.isInteger(policy.effectiveMonth) ||
      policy.effectiveMonth < 1 ||
      policy.effectiveMonth > 12
    ) {
      issues.push(
        issue({
          code: "INVALID_UNIVERSAL_FIXED_AMOUNT_EFFECTIVE_MONTH",
          message:
            "Le mois d’effet du forfait social universel doit être compris entre janvier et décembre.",
          field: "universalFixedAmountPolicy.effectiveMonth",
          step: "validate_input",
        }),
      );
    }
    if (
      !Number.isInteger(policy.minimumSeniorityMonths) ||
      policy.minimumSeniorityMonths < 0
    ) {
      issues.push(
        issue({
          code: "INVALID_UNIVERSAL_FIXED_AMOUNT_MINIMUM_SENIORITY",
          message:
            "L’ancienneté minimale du forfait social universel doit être un entier ≥ 0.",
          field: "universalFixedAmountPolicy.minimumSeniorityMonths",
          step: "validate_input",
        }),
      );
    }
    if (
      typeof policy.seniorityReferenceDate !== "string" ||
      policy.seniorityReferenceDate.trim() === ""
    ) {
      issues.push(
        issue({
          code: "MISSING_UNIVERSAL_FIXED_AMOUNT_SENIORITY_REFERENCE_DATE",
          message:
            "La date de référence de l’ancienneté du forfait social universel est obligatoire.",
          field: "universalFixedAmountPolicy.seniorityReferenceDate",
          step: "validate_input",
        }),
      );
    } else {
      try {
        parseSeniorityReferenceDateIso(policy.seniorityReferenceDate.trim());
      } catch {
        issues.push(
          issue({
            code: "INVALID_UNIVERSAL_FIXED_AMOUNT_SENIORITY_REFERENCE_DATE",
            message:
              "La date de référence de l’ancienneté du forfait doit être au format ISO YYYY-MM-DD.",
            field: "universalFixedAmountPolicy.seniorityReferenceDate",
            step: "validate_input",
          }),
        );
      }
    }
  }

  validateEmployerCostPolicyInput(input.employerCostPolicy, issues);

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

function isLiabilityBoolean(value: unknown): value is boolean {
  return value === true || value === false;
}

function validateEmployerCostComponentLiability(
  liability: unknown,
  issues: PopulationCalculationIssue[],
): liability is EmployerCostComponentLiability {
  if (liability === null || liability === undefined || typeof liability !== "object") {
    issues.push(
      issue({
        code: "MISSING_EMPLOYER_COST_COMPONENT_LIABILITY",
        message:
          "L’assujettissement par composante (componentLiability) est obligatoire.",
        field: "employerCostPolicy.componentLiability",
        step: "validate_input",
      }),
    );
    return false;
  }
  const record = liability as Record<string, unknown>;
  const keys: (keyof EmployerCostComponentLiability)[] = [
    "matrixIncrease",
    "minimumGuaranteeComplement",
    "universalFixedAmount",
    "promotionIncrease",
    "additionalSeniorityImpact",
  ];
  let ok = true;
  for (const key of keys) {
    if (!isLiabilityBoolean(record[key])) {
      issues.push(
        issue({
          code: "INVALID_EMPLOYER_COST_COMPONENT_LIABILITY",
          message: `L’indicateur d’assujettissement « ${key} » doit être un booléen.`,
          field: `employerCostPolicy.componentLiability.${key}`,
          step: "validate_input",
        }),
      );
      ok = false;
    }
  }
  return ok;
}

function validateEmployerCostPolicyInput(
  policy: EmployerCostPolicy | undefined | null,
  issues: PopulationCalculationIssue[],
): void {
  if (policy === null || policy === undefined) {
    issues.push(
      issue({
        code: "MISSING_EMPLOYER_COST_POLICY",
        message:
          "La politique de coût employeur est obligatoire (aucun défaut silencieux).",
        field: "employerCostPolicy",
        step: "validate_input",
      }),
    );
    return;
  }
  if (policy.kind !== "neutral" && policy.kind !== "rate_on_gross_period") {
    issues.push(
      issue({
        code: "UNSUPPORTED_EMPLOYER_COST_POLICY",
        message: `Politique de coût employeur non supportée : ${String((policy as { kind: string }).kind)}.`,
        field: "employerCostPolicy.kind",
        step: "validate_input",
      }),
    );
    return;
  }
  validateEmployerCostComponentLiability(policy.componentLiability, issues);
  if (policy.kind === "rate_on_gross_period") {
    if (!Array.isArray(policy.components) || policy.components.length === 0) {
      issues.push(
        issue({
          code: "INVALID_EMPLOYER_COST_POLICY_COMPONENTS",
          message:
            "La politique rate_on_gross_period exige au moins une composante de taux.",
          field: "employerCostPolicy.components",
          step: "validate_input",
        }),
      );
    }
  }
}

export function toIssueLikes(
  issues: readonly PopulationCalculationIssue[],
): PopulationCalculationIssueLike[] {
  return issues.map((item) => ({ ...item }));
}
