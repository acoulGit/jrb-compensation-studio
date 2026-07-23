-- Lot 2B-RC1-H5 : mécanisme social exclusif + forfait social universel.
-- Additive only. NULL autorisé pour les snapshots historiques (schema ≤ 6).
-- Les nouveaux runs schema 7 écrivent une valeur explicite côté applicatif.
-- Aucune valeur implicite, aucun backfill artificiel.

PRAGMA foreign_keys = ON;

ALTER TABLE compensation_simulation_runs
ADD COLUMN social_mechanism_kind TEXT
CHECK (
  social_mechanism_kind IS NULL
  OR social_mechanism_kind IN (
    'none',
    'minimum_guaranteed',
    'universal_fixed_amount'
  )
);

ALTER TABLE compensation_simulation_runs
ADD COLUMN universal_fixed_amount_monthly_fcfa INTEGER
CHECK (
  universal_fixed_amount_monthly_fcfa IS NULL
  OR universal_fixed_amount_monthly_fcfa >= 0
);

ALTER TABLE compensation_simulation_runs
ADD COLUMN universal_fixed_amount_effective_month INTEGER
CHECK (
  universal_fixed_amount_effective_month IS NULL
  OR (
    universal_fixed_amount_effective_month BETWEEN 1 AND 12
  )
);

ALTER TABLE compensation_simulation_runs
ADD COLUMN universal_fixed_amount_minimum_seniority_months INTEGER
CHECK (
  universal_fixed_amount_minimum_seniority_months IS NULL
  OR universal_fixed_amount_minimum_seniority_months >= 0
);

ALTER TABLE compensation_simulation_runs
ADD COLUMN universal_fixed_amount_eligible_employee_count INTEGER;

ALTER TABLE compensation_simulation_runs
ADD COLUMN universal_fixed_amount_exposure_count INTEGER;

ALTER TABLE compensation_simulation_runs
ADD COLUMN total_universal_fixed_amount_cost_text TEXT;

ALTER TABLE compensation_simulation_runs
ADD COLUMN available_budget_after_promotions_and_social_mechanism_num_text TEXT;

ALTER TABLE compensation_simulation_runs
ADD COLUMN available_budget_after_promotions_and_social_mechanism_den_text TEXT;

ALTER TABLE compensation_simulation_runs
ADD COLUMN total_universal_fixed_amount_reminder_text TEXT;

ALTER TABLE compensation_simulation_runs
ADD COLUMN total_universal_fixed_amount_remaining_year_direct_cost_text TEXT;

ALTER TABLE compensation_simulation_runs
ADD COLUMN full_year_run_rate_universal_fixed_amount_cost_text TEXT;

ALTER TABLE compensation_simulation_employee_results
ADD COLUMN is_universal_fixed_amount_eligible INTEGER
CHECK (
  is_universal_fixed_amount_eligible IS NULL
  OR is_universal_fixed_amount_eligible IN (0, 1)
);

ALTER TABLE compensation_simulation_employee_results
ADD COLUMN universal_fixed_amount_exclusion_reason TEXT;

ALTER TABLE compensation_simulation_employee_results
ADD COLUMN universal_fixed_amount_monthly_amount_text TEXT;

ALTER TABLE compensation_simulation_employee_results
ADD COLUMN universal_fixed_amount_effective_month INTEGER
CHECK (
  universal_fixed_amount_effective_month IS NULL
  OR (
    universal_fixed_amount_effective_month BETWEEN 1 AND 12
  )
);

ALTER TABLE compensation_simulation_employee_results
ADD COLUMN universal_fixed_amount_minimum_seniority_months INTEGER
CHECK (
  universal_fixed_amount_minimum_seniority_months IS NULL
  OR universal_fixed_amount_minimum_seniority_months >= 0
);

ALTER TABLE compensation_simulation_employee_results
ADD COLUMN campaign_period_universal_fixed_amount_cost_text TEXT;

ALTER TABLE compensation_simulation_employee_results
ADD COLUMN universal_fixed_amount_reminder_text TEXT;

ALTER TABLE compensation_simulation_employee_results
ADD COLUMN universal_fixed_amount_remaining_year_direct_cost_text TEXT;

ALTER TABLE compensation_simulation_employee_results
ADD COLUMN full_year_run_rate_universal_fixed_amount_cost_text TEXT;

ALTER TABLE compensation_simulation_employee_month_results
ADD COLUMN universal_fixed_amount_fcfa_text TEXT;

ALTER TABLE compensation_simulation_runs
ADD COLUMN universal_fixed_amount_seniority_reference_date TEXT;

ALTER TABLE compensation_simulation_employee_results
ADD COLUMN universal_fixed_amount_seniority_reference_date TEXT;
