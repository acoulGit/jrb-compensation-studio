-- Lot 2B-4A — persistance immuable des simulations de campagne réussies.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS compensation_simulation_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
  run_number INTEGER NOT NULL CHECK (run_number > 0),
  result_schema_version INTEGER NOT NULL DEFAULT 1 CHECK (result_schema_version > 0),

  campaign_name TEXT NOT NULL CHECK (length(trim(campaign_name)) > 0),
  campaign_year INTEGER NOT NULL,
  campaign_status_at_run TEXT NOT NULL CHECK (
    campaign_status_at_run IN ('draft', 'active', 'archived')
  ),
  evaluation_mode TEXT NOT NULL CHECK (
    evaluation_mode IN (
      'none',
      'performance_only',
      'performance_potential',
      'full_nine_box'
    )
  ),

  source_import_batch_id INTEGER REFERENCES hr_import_batches(id) ON DELETE SET NULL,
  source_import_file_name TEXT,
  source_fingerprint TEXT NOT NULL CHECK (length(trim(source_fingerprint)) > 0),
  configuration_fingerprint TEXT NOT NULL CHECK (length(trim(configuration_fingerprint)) > 0),

  budget_target_mode TEXT NOT NULL CHECK (
    budget_target_mode IN ('manual_amount', 'percentage_of_eligible_payroll')
  ),
  manual_budget_fcfa_text TEXT,
  eligible_payroll_fcfa_text TEXT,
  budget_rate_basis_points INTEGER,
  budget_target_numerator_text TEXT NOT NULL CHECK (length(trim(budget_target_numerator_text)) > 0),
  budget_target_denominator_text TEXT NOT NULL CHECK (length(trim(budget_target_denominator_text)) > 0),

  rounding_mode TEXT NOT NULL CHECK (rounding_mode IN ('nearest_half_up')),
  rounding_step_fcfa_text TEXT NOT NULL CHECK (length(trim(rounding_step_fcfa_text)) > 0),

  employee_count INTEGER NOT NULL CHECK (employee_count >= 0),
  positive_weight_employee_count INTEGER NOT NULL CHECK (positive_weight_employee_count >= 0),
  zero_weight_employee_count INTEGER NOT NULL CHECK (zero_weight_employee_count >= 0),
  confirmed_underperformer_count INTEGER NOT NULL CHECK (confirmed_underperformer_count >= 0),
  theoretical_total_numerator_text TEXT NOT NULL CHECK (length(trim(theoretical_total_numerator_text)) > 0),
  theoretical_total_denominator_text TEXT NOT NULL CHECK (length(trim(theoretical_total_denominator_text)) > 0),
  actual_operation_amount_fcfa_text TEXT NOT NULL CHECK (length(trim(actual_operation_amount_fcfa_text)) > 0),
  total_rounding_delta_numerator_text TEXT NOT NULL CHECK (length(trim(total_rounding_delta_numerator_text)) > 0),
  total_rounding_delta_denominator_text TEXT NOT NULL CHECK (length(trim(total_rounding_delta_denominator_text)) > 0),

  created_at TEXT NOT NULL,

  UNIQUE (campaign_id, run_number)
);

CREATE INDEX IF NOT EXISTS ix_compensation_simulation_runs_campaign
  ON compensation_simulation_runs (campaign_id);

CREATE INDEX IF NOT EXISTS ix_compensation_simulation_runs_campaign_created
  ON compensation_simulation_runs (campaign_id, created_at);

CREATE INDEX IF NOT EXISTS ix_compensation_simulation_runs_source_batch
  ON compensation_simulation_runs (source_import_batch_id);

CREATE TABLE IF NOT EXISTS compensation_simulation_employee_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  simulation_run_id INTEGER NOT NULL REFERENCES compensation_simulation_runs(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL CHECK (length(trim(employee_id)) > 0),
  employee_display_name TEXT,
  family_code TEXT NOT NULL CHECK (length(trim(family_code)) > 0),
  family_label TEXT,
  grade_code TEXT NOT NULL CHECK (length(trim(grade_code)) > 0),
  grade_label TEXT,

  salary_fcfa_text TEXT NOT NULL CHECK (length(trim(salary_fcfa_text)) > 0),
  s0_fcfa_text TEXT NOT NULL CHECK (length(trim(s0_fcfa_text)) > 0),
  salary_ratio_basis_points INTEGER NOT NULL,
  salary_position_code TEXT NOT NULL CHECK (length(trim(salary_position_code)) > 0),
  salary_position_label TEXT NOT NULL CHECK (length(trim(salary_position_label)) > 0),
  position_factor_milli INTEGER NOT NULL CHECK (position_factor_milli >= 0),

  evaluation_mode TEXT NOT NULL CHECK (
    evaluation_mode IN (
      'none',
      'performance_only',
      'performance_potential',
      'full_nine_box'
    )
  ),
  performance_level TEXT,
  potential_level TEXT,
  evaluation_factor_numerator_text TEXT NOT NULL CHECK (length(trim(evaluation_factor_numerator_text)) > 0),
  evaluation_factor_denominator_text TEXT NOT NULL CHECK (length(trim(evaluation_factor_denominator_text)) > 0),

  theoretical_matrix_weight_numerator_text TEXT NOT NULL CHECK (length(trim(theoretical_matrix_weight_numerator_text)) > 0),
  theoretical_matrix_weight_denominator_text TEXT NOT NULL CHECK (length(trim(theoretical_matrix_weight_denominator_text)) > 0),
  effective_matrix_weight_numerator_text TEXT NOT NULL CHECK (length(trim(effective_matrix_weight_numerator_text)) > 0),
  effective_matrix_weight_denominator_text TEXT NOT NULL CHECK (length(trim(effective_matrix_weight_denominator_text)) > 0),
  allocation_weight_numerator_text TEXT NOT NULL CHECK (length(trim(allocation_weight_numerator_text)) > 0),
  allocation_weight_denominator_text TEXT NOT NULL CHECK (length(trim(allocation_weight_denominator_text)) > 0),
  blocking_reason TEXT,

  theoretical_increase_rate_numerator_text TEXT NOT NULL CHECK (length(trim(theoretical_increase_rate_numerator_text)) > 0),
  theoretical_increase_rate_denominator_text TEXT NOT NULL CHECK (length(trim(theoretical_increase_rate_denominator_text)) > 0),
  theoretical_increase_amount_numerator_text TEXT NOT NULL CHECK (length(trim(theoretical_increase_amount_numerator_text)) > 0),
  theoretical_increase_amount_denominator_text TEXT NOT NULL CHECK (length(trim(theoretical_increase_amount_denominator_text)) > 0),
  final_rounded_increase_fcfa_text TEXT NOT NULL CHECK (length(trim(final_rounded_increase_fcfa_text)) > 0),
  individual_rounding_delta_numerator_text TEXT NOT NULL CHECK (length(trim(individual_rounding_delta_numerator_text)) > 0),
  individual_rounding_delta_denominator_text TEXT NOT NULL CHECK (length(trim(individual_rounding_delta_denominator_text)) > 0),
  final_salary_fcfa_text TEXT NOT NULL CHECK (length(trim(final_salary_fcfa_text)) > 0),

  explanation_steps_json TEXT NOT NULL DEFAULT '[]',

  UNIQUE (simulation_run_id, employee_id)
);

CREATE INDEX IF NOT EXISTS ix_compensation_simulation_employee_results_run
  ON compensation_simulation_employee_results (simulation_run_id);

CREATE INDEX IF NOT EXISTS ix_compensation_simulation_employee_results_employee
  ON compensation_simulation_employee_results (employee_id);
