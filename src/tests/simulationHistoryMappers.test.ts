import { describe, expect, it } from "vitest";
import {
  mapSimulationEmployeeResult,
  mapSimulationRunSummary,
  type SimulationEmployeeResultRow,
  type SimulationRunRow,
} from "../infrastructure/database/simulationHistoryMappers";

function sampleRunRow(
  overrides: Partial<SimulationRunRow> = {},
): SimulationRunRow {
  return {
    id: 1,
    campaign_id: 1,
    run_number: 2,
    result_schema_version: 1,
    campaign_name: "Sim 2027",
    campaign_year: 2027,
    campaign_status_at_run: "active",
    evaluation_mode: "none",
    source_import_batch_id: 10,
    source_import_file_name: "pop.xlsx",
    source_fingerprint: "fp-source",
    configuration_fingerprint: "fp-config",
    budget_target_mode: "manual_amount",
    manual_budget_fcfa_text: "25000003",
    eligible_payroll_fcfa_text: null,
    budget_rate_basis_points: null,
    budget_target_numerator_text: "25000003",
    budget_target_denominator_text: "1",
    rounding_mode: "nearest_half_up",
    rounding_step_fcfa_text: "100",
    employee_count: 1,
    positive_weight_employee_count: 1,
    zero_weight_employee_count: 0,
    confirmed_underperformer_count: 0,
    theoretical_total_numerator_text: "25000003",
    theoretical_total_denominator_text: "40",
    actual_operation_amount_fcfa_text: "9000000000000",
    total_rounding_delta_numerator_text: "-3",
    total_rounding_delta_denominator_text: "1",
    created_at: "2026-07-20T00:00:00.000Z",
    ...overrides,
  };
}

function sampleEmployeeRow(
  overrides: Partial<SimulationEmployeeResultRow> = {},
): SimulationEmployeeResultRow {
  return {
    id: 10,
    simulation_run_id: 1,
    employee_id: "E1",
    employee_display_name: "Alice",
    family_code: "F1",
    family_label: "Fam",
    grade_code: "G1",
    grade_label: "Gr",
    salary_fcfa_text: "1000000",
    s0_fcfa_text: "1000000",
    salary_ratio_basis_points: 10000,
    salary_position_code: "EQ",
    salary_position_label: "Égal",
    position_factor_milli: 1000,
    evaluation_mode: "none",
    performance_level: null,
    potential_level: null,
    evaluation_factor_numerator_text: "1",
    evaluation_factor_denominator_text: "1",
    theoretical_matrix_weight_numerator_text: "1",
    theoretical_matrix_weight_denominator_text: "1",
    effective_matrix_weight_numerator_text: "1",
    effective_matrix_weight_denominator_text: "1",
    allocation_weight_numerator_text: "1000000",
    allocation_weight_denominator_text: "1",
    blocking_reason: null,
    theoretical_increase_rate_numerator_text: "1",
    theoretical_increase_rate_denominator_text: "40",
    theoretical_increase_amount_numerator_text: "25000003",
    theoretical_increase_amount_denominator_text: "1",
    final_rounded_increase_fcfa_text: "25000000",
    individual_rounding_delta_numerator_text: "-3",
    individual_rounding_delta_denominator_text: "1",
    final_salary_fcfa_text: "1025000000",
    explanation_steps_json: JSON.stringify([
      { step: "alloc", formula: "a/b", outputValue: "1" },
    ]),
    ...overrides,
  };
}

describe("simulationHistoryMappers", () => {
  it("maps TEXT bigints without Number for amounts", () => {
    const summary = mapSimulationRunSummary(sampleRunRow());
    expect(summary.manualBudgetFcfa).toBe(25000003n);
    expect(typeof summary.manualBudgetFcfa).toBe("bigint");
    expect(summary.actualOperationAmountFcfa).toBe(9000000000000n);
    expect(typeof summary.actualOperationAmountFcfa).toBe("bigint");
    expect(summary.roundingStepFcfa).toBe(100n);
    expect(summary.exactBudgetTarget).toEqual({
      numerator: 25000003n,
      denominator: 1n,
    });

    const employee = mapSimulationEmployeeResult(sampleEmployeeRow());
    expect(employee.salaryFcfa).toBe(1000000n);
    expect(typeof employee.salaryFcfa).toBe("bigint");
    expect(employee.finalSalaryFcfa).toBe(1025000000n);
  });

  it("remaps fractions as ExactAmount", () => {
    const summary = mapSimulationRunSummary(sampleRunRow());
    expect(summary.theoreticalAllocatedTotal).toEqual({
      numerator: 25000003n,
      denominator: 40n,
    });

    const employee = mapSimulationEmployeeResult(sampleEmployeeRow());
    expect(employee.theoreticalIncreaseRate).toEqual({
      numerator: 1n,
      denominator: 40n,
    });
    expect(employee.allocationWeight).toEqual({
      numerator: 1000000n,
      denominator: 1n,
    });
  });

  it("returns empty explanation array for invalid JSON", () => {
    const employee = mapSimulationEmployeeResult(
      sampleEmployeeRow({ explanation_steps_json: "{not-json" }),
    );
    expect(employee.explanationSteps).toEqual([]);

    const notArray = mapSimulationEmployeeResult(
      sampleEmployeeRow({ explanation_steps_json: '{"step":"x"}' }),
    );
    expect(notArray.explanationSteps).toEqual([]);
  });

  it("maps negative rounding delta", () => {
    const summary = mapSimulationRunSummary(sampleRunRow());
    expect(summary.totalRoundingDelta).toEqual({
      numerator: -3n,
      denominator: 1n,
    });

    const employee = mapSimulationEmployeeResult(sampleEmployeeRow());
    expect(employee.individualRoundingDelta).toEqual({
      numerator: -3n,
      denominator: 1n,
    });
  });
});
