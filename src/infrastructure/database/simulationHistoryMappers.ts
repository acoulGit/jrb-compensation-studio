/**
 * Mappers SQLite → modèles persistés de simulation (Lot 2B-4A).
 * Aucune conversion Number des montants exacts.
 */

import type { CampaignStatus } from "../../domain/campaign/models";
import type { NineBoxMode } from "../../domain/compensationReference/models";
import {
  parseCanonicalExactAmount,
  parseCanonicalIntegerText,
} from "../../application/campaignSimulation/canonicalDecimalText";
import type {
  PersistedSimulationEmployeeResult,
  PersistedSimulationRunSummary,
} from "../../application/campaignSimulation/simulationPersistenceModels";

export interface SimulationRunRow {
  id: number;
  campaign_id: number;
  run_number: number;
  result_schema_version: number;
  campaign_name: string;
  campaign_year: number;
  campaign_status_at_run: string;
  evaluation_mode: string;
  source_import_batch_id: number | null;
  source_import_file_name: string | null;
  source_fingerprint: string;
  configuration_fingerprint: string;
  budget_target_mode: string;
  manual_budget_fcfa_text: string | null;
  eligible_payroll_fcfa_text: string | null;
  budget_rate_basis_points: number | null;
  budget_target_numerator_text: string;
  budget_target_denominator_text: string;
  rounding_mode: string;
  rounding_step_fcfa_text: string;
  employee_count: number;
  positive_weight_employee_count: number;
  zero_weight_employee_count: number;
  confirmed_underperformer_count: number;
  theoretical_total_numerator_text: string;
  theoretical_total_denominator_text: string;
  actual_operation_amount_fcfa_text: string;
  total_rounding_delta_numerator_text: string;
  total_rounding_delta_denominator_text: string;
  created_at: string;
}

export interface SimulationEmployeeResultRow {
  id: number;
  simulation_run_id: number;
  employee_id: string;
  employee_display_name: string | null;
  family_code: string;
  family_label: string | null;
  grade_code: string;
  grade_label: string | null;
  salary_fcfa_text: string;
  s0_fcfa_text: string;
  salary_ratio_basis_points: number;
  salary_position_code: string;
  salary_position_label: string;
  position_factor_milli: number;
  evaluation_mode: string;
  performance_level: string | null;
  potential_level: string | null;
  evaluation_factor_numerator_text: string;
  evaluation_factor_denominator_text: string;
  theoretical_matrix_weight_numerator_text: string;
  theoretical_matrix_weight_denominator_text: string;
  effective_matrix_weight_numerator_text: string;
  effective_matrix_weight_denominator_text: string;
  allocation_weight_numerator_text: string;
  allocation_weight_denominator_text: string;
  blocking_reason: string | null;
  theoretical_increase_rate_numerator_text: string;
  theoretical_increase_rate_denominator_text: string;
  theoretical_increase_amount_numerator_text: string;
  theoretical_increase_amount_denominator_text: string;
  final_rounded_increase_fcfa_text: string;
  individual_rounding_delta_numerator_text: string;
  individual_rounding_delta_denominator_text: string;
  final_salary_fcfa_text: string;
  explanation_steps_json: string;
}

function asCampaignStatus(value: string): CampaignStatus {
  if (value === "draft" || value === "active" || value === "archived") {
    return value;
  }
  throw new Error(`Statut de campagne persisté invalide: ${value}`);
}

function asNineBoxMode(value: string): NineBoxMode {
  if (
    value === "none" ||
    value === "performance_only" ||
    value === "performance_potential" ||
    value === "full_nine_box"
  ) {
    return value;
  }
  throw new Error(`Mode d’évaluation persisté invalide: ${value}`);
}

function parseExplanationSteps(
  raw: string,
): PersistedSimulationEmployeeResult["explanationSteps"] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((item) => {
      if (!item || typeof item !== "object") {
        return { step: "unknown" };
      }
      const record = item as Record<string, unknown>;
      return {
        step: typeof record.step === "string" ? record.step : "unknown",
        formula:
          typeof record.formula === "string" ? record.formula : undefined,
        outputValue:
          typeof record.outputValue === "string"
            ? record.outputValue
            : undefined,
      };
    });
  } catch {
    return [];
  }
}

export function mapSimulationRunSummary(
  row: SimulationRunRow,
): PersistedSimulationRunSummary {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    runNumber: row.run_number,
    resultSchemaVersion: row.result_schema_version,
    campaignName: row.campaign_name,
    campaignYear: row.campaign_year,
    campaignStatusAtRun: asCampaignStatus(row.campaign_status_at_run),
    evaluationMode: asNineBoxMode(row.evaluation_mode),
    sourceImportBatchId: row.source_import_batch_id,
    sourceImportFileName: row.source_import_file_name,
    sourceFingerprint: row.source_fingerprint,
    configurationFingerprint: row.configuration_fingerprint,
    budgetTargetMode: row.budget_target_mode,
    manualBudgetFcfa: row.manual_budget_fcfa_text
      ? parseCanonicalIntegerText(row.manual_budget_fcfa_text, {
          allowNegative: false,
        })
      : null,
    eligiblePayrollFcfa: row.eligible_payroll_fcfa_text
      ? parseCanonicalIntegerText(row.eligible_payroll_fcfa_text, {
          allowNegative: false,
        })
      : null,
    budgetRateBasisPoints:
      row.budget_rate_basis_points === null ||
      row.budget_rate_basis_points === undefined
        ? null
        : BigInt(row.budget_rate_basis_points),
    exactBudgetTarget: parseCanonicalExactAmount({
      numeratorText: row.budget_target_numerator_text,
      denominatorText: row.budget_target_denominator_text,
      allowNegativeNumerator: false,
    }),
    roundingMode: row.rounding_mode,
    roundingStepFcfa: parseCanonicalIntegerText(row.rounding_step_fcfa_text, {
      allowNegative: false,
    }),
    employeeCount: row.employee_count,
    positiveWeightEmployeeCount: row.positive_weight_employee_count,
    zeroWeightEmployeeCount: row.zero_weight_employee_count,
    confirmedUnderperformerCount: row.confirmed_underperformer_count,
    theoreticalAllocatedTotal: parseCanonicalExactAmount({
      numeratorText: row.theoretical_total_numerator_text,
      denominatorText: row.theoretical_total_denominator_text,
      allowNegativeNumerator: false,
    }),
    actualOperationAmountFcfa: parseCanonicalIntegerText(
      row.actual_operation_amount_fcfa_text,
      { allowNegative: false },
    ),
    totalRoundingDelta: parseCanonicalExactAmount({
      numeratorText: row.total_rounding_delta_numerator_text,
      denominatorText: row.total_rounding_delta_denominator_text,
      allowNegativeNumerator: true,
    }),
    createdAt: row.created_at,
  };
}

export function mapSimulationEmployeeResult(
  row: SimulationEmployeeResultRow,
): PersistedSimulationEmployeeResult {
  return {
    id: row.id,
    simulationRunId: row.simulation_run_id,
    employeeId: row.employee_id,
    employeeDisplayName: row.employee_display_name,
    familyCode: row.family_code,
    familyLabel: row.family_label,
    gradeCode: row.grade_code,
    gradeLabel: row.grade_label,
    salaryFcfa: parseCanonicalIntegerText(row.salary_fcfa_text, {
      allowNegative: false,
    }),
    s0Fcfa: parseCanonicalIntegerText(row.s0_fcfa_text, { allowNegative: false }),
    salaryRatioBasisPoints: row.salary_ratio_basis_points,
    salaryPositionCode: row.salary_position_code,
    salaryPositionLabel: row.salary_position_label,
    positionFactorMilli: row.position_factor_milli,
    evaluationMode: asNineBoxMode(row.evaluation_mode),
    performanceLevel: row.performance_level,
    potentialLevel: row.potential_level,
    evaluationFactor: parseCanonicalExactAmount({
      numeratorText: row.evaluation_factor_numerator_text,
      denominatorText: row.evaluation_factor_denominator_text,
    }),
    theoreticalMatrixWeight: parseCanonicalExactAmount({
      numeratorText: row.theoretical_matrix_weight_numerator_text,
      denominatorText: row.theoretical_matrix_weight_denominator_text,
    }),
    effectiveMatrixWeight: parseCanonicalExactAmount({
      numeratorText: row.effective_matrix_weight_numerator_text,
      denominatorText: row.effective_matrix_weight_denominator_text,
    }),
    allocationWeight: parseCanonicalExactAmount({
      numeratorText: row.allocation_weight_numerator_text,
      denominatorText: row.allocation_weight_denominator_text,
    }),
    blockingReason: row.blocking_reason,
    theoreticalIncreaseRate: parseCanonicalExactAmount({
      numeratorText: row.theoretical_increase_rate_numerator_text,
      denominatorText: row.theoretical_increase_rate_denominator_text,
    }),
    theoreticalIncreaseAmount: parseCanonicalExactAmount({
      numeratorText: row.theoretical_increase_amount_numerator_text,
      denominatorText: row.theoretical_increase_amount_denominator_text,
    }),
    finalRoundedIncreaseAmountFcfa: parseCanonicalIntegerText(
      row.final_rounded_increase_fcfa_text,
      { allowNegative: false },
    ),
    individualRoundingDelta: parseCanonicalExactAmount({
      numeratorText: row.individual_rounding_delta_numerator_text,
      denominatorText: row.individual_rounding_delta_denominator_text,
      allowNegativeNumerator: true,
    }),
    finalSalaryFcfa: parseCanonicalIntegerText(row.final_salary_fcfa_text, {
      allowNegative: false,
    }),
    explanationSteps: parseExplanationSteps(row.explanation_steps_json),
  };
}
