-- Lot 2B-P1 — consolidation du snapshot de simulation en schema v3.
--
-- Objectif : persister fidèlement le résultat du contrat de calcul v4
-- (rétroactivité configurable, incidence d'ancienneté, minimum garanti,
-- trajectoire mensuelle) SANS recalcul et en append-only.
--
-- Compatibilité : bases déjà migrées 0001–0006. Les colonnes ajoutées sont
-- NULL pour les anciens snapshots (schema v1/v2) — aucun faux zéro.
--
-- RÉUTILISATION des colonnes 0005 (sémantique période déjà correcte pour les
-- écritures schema v2, noms historiquement ambigus) :
--   - budget_target_*                    -> enveloppe de la période d'effet
--   - theoretical_total_*                -> allocation théorique de la période
--   - actual_operation_amount_fcfa_text  -> coût effectif de campagne (période)
--   - total_rounding_delta_*             -> delta de période (combiné)
--   - campaign_year                      -> déjà présent
--   - result_schema_version              -> déjà présent (passe à 3 en écriture)
-- Ces colonnes ne sont PAS réinterprétées : elles conservent leur sémantique
-- « période ». Les alias annual* côté TS restent transitionnels.
--
-- Aucun type flottant metier : tous les montants et fractions sont en TEXT canonique.

PRAGMA foreign_keys = ON;

-- =========================================================================
-- 1) compensation_simulation_runs — configuration contrat v4
-- =========================================================================
ALTER TABLE compensation_simulation_runs ADD COLUMN retroactivity_start_month INTEGER
  CHECK (retroactivity_start_month IS NULL OR (retroactivity_start_month BETWEEN 1 AND 12));
ALTER TABLE compensation_simulation_runs ADD COLUMN technical_application_month INTEGER
  CHECK (technical_application_month IS NULL OR (technical_application_month BETWEEN 1 AND 12));
ALTER TABLE compensation_simulation_runs ADD COLUMN campaign_covered_month_count INTEGER
  CHECK (campaign_covered_month_count IS NULL OR (campaign_covered_month_count BETWEEN 0 AND 12));
ALTER TABLE compensation_simulation_runs ADD COLUMN reminder_month_count INTEGER
  CHECK (reminder_month_count IS NULL OR (reminder_month_count BETWEEN 0 AND 12));
ALTER TABLE compensation_simulation_runs ADD COLUMN direct_payment_month_count INTEGER
  CHECK (direct_payment_month_count IS NULL OR (direct_payment_month_count BETWEEN 0 AND 12));
ALTER TABLE compensation_simulation_runs ADD COLUMN calculation_contract_version INTEGER
  CHECK (calculation_contract_version IS NULL OR calculation_contract_version > 0);
ALTER TABLE compensation_simulation_runs ADD COLUMN seniority_impact_contract_version INTEGER
  CHECK (seniority_impact_contract_version IS NULL OR seniority_impact_contract_version > 0);
ALTER TABLE compensation_simulation_runs ADD COLUMN minimum_increase_contract_version INTEGER
  CHECK (minimum_increase_contract_version IS NULL OR minimum_increase_contract_version > 0);
ALTER TABLE compensation_simulation_runs ADD COLUMN minimum_increase_mode TEXT
  CHECK (minimum_increase_mode IS NULL OR minimum_increase_mode IN (
    'none', 'fixed_monthly_amount', 'percentage_of_base_salary'
  ));
ALTER TABLE compensation_simulation_runs ADD COLUMN minimum_monthly_amount_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN minimum_rate_num_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN minimum_rate_den_text TEXT
  CHECK (minimum_rate_den_text IS NULL OR length(trim(minimum_rate_den_text)) > 0);

-- Enveloppe promotion-aware (nouveaux — distincts de budget_target_*)
ALTER TABLE compensation_simulation_runs ADD COLUMN promotion_campaign_period_budget_cost_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN total_minimum_complement_floor_cost_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN available_budget_after_promotions_num_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN available_budget_after_promotions_den_text TEXT
  CHECK (available_budget_after_promotions_den_text IS NULL
    OR length(trim(available_budget_after_promotions_den_text)) > 0);
ALTER TABLE compensation_simulation_runs ADD COLUMN available_budget_after_promotions_and_minimum_num_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN available_budget_after_promotions_and_minimum_den_text TEXT
  CHECK (available_budget_after_promotions_and_minimum_den_text IS NULL
    OR length(trim(available_budget_after_promotions_and_minimum_den_text)) > 0);
ALTER TABLE compensation_simulation_runs ADD COLUMN theoretical_compensatory_campaign_period_cost_num_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN theoretical_compensatory_campaign_period_cost_den_text TEXT
  CHECK (theoretical_compensatory_campaign_period_cost_den_text IS NULL
    OR length(trim(theoretical_compensatory_campaign_period_cost_den_text)) > 0);
ALTER TABLE compensation_simulation_runs ADD COLUMN actual_compensatory_campaign_period_cost_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN actual_minimum_complement_paid_cost_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN actual_compensation_above_minimum_cost_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN actual_combined_campaign_period_cost_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN compensatory_calibration_rate_num_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN compensatory_calibration_rate_den_text TEXT
  CHECK (compensatory_calibration_rate_den_text IS NULL
    OR length(trim(compensatory_calibration_rate_den_text)) > 0);
ALTER TABLE compensation_simulation_runs ADD COLUMN minimum_increase_population_employee_count INTEGER
  CHECK (minimum_increase_population_employee_count IS NULL
    OR minimum_increase_population_employee_count >= 0);
ALTER TABLE compensation_simulation_runs ADD COLUMN promoted_included_employee_count INTEGER
  CHECK (promoted_included_employee_count IS NULL OR promoted_included_employee_count >= 0);

-- Rappels / paiements directs + incidence d'ancienneté + plein effet (population)
ALTER TABLE compensation_simulation_runs ADD COLUMN total_base_salary_reminder_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN total_remaining_year_direct_increase_cost_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN total_annual_actual_base_increase_cost_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN total_seniority_reminder_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN total_remaining_year_direct_seniority_impact_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN total_annual_seniority_impact_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN total_annual_promotion_seniority_impact_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN total_annual_promotion_budget_cost_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN total_combined_annual_actual_cost_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN total_combined_annual_seniority_impact_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN full_year_run_rate_promotion_cost_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN full_year_run_rate_compensatory_cost_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN full_year_run_rate_combined_base_measure_cost_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN full_year_run_rate_seniority_impact_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN full_year_run_rate_minimum_complement_cost_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN full_year_run_rate_compensation_above_minimum_cost_text TEXT;

-- Calendrier de paiement (agrégats run — distincts des alias annual* 0005)
ALTER TABLE compensation_simulation_runs ADD COLUMN promotion_cost_paid_before_technical_month_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN promotion_cost_from_technical_month_to_december_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN minimum_compensatory_reminder_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN above_minimum_compensatory_reminder_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN total_compensatory_reminder_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN minimum_remaining_year_direct_cost_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN above_minimum_remaining_year_direct_cost_text TEXT;
ALTER TABLE compensation_simulation_runs ADD COLUMN total_remaining_year_direct_compensatory_cost_text TEXT;

-- =========================================================================
-- 2) compensation_simulation_employee_results — champs contrat v4
-- =========================================================================
-- Enveloppe / allocation individuelle
ALTER TABLE compensation_simulation_employee_results ADD COLUMN annual_theoretical_allocation_num_text TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN annual_theoretical_allocation_den_text TEXT
  CHECK (annual_theoretical_allocation_den_text IS NULL
    OR length(trim(annual_theoretical_allocation_den_text)) > 0);
ALTER TABLE compensation_simulation_employee_results ADD COLUMN annual_actual_cost_text TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN annual_rounding_delta_num_text TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN annual_rounding_delta_den_text TEXT
  CHECK (annual_rounding_delta_den_text IS NULL
    OR length(trim(annual_rounding_delta_den_text)) > 0);

-- Calendrier
ALTER TABLE compensation_simulation_employee_results ADD COLUMN campaign_year INTEGER;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN retroactivity_start_month INTEGER
  CHECK (retroactivity_start_month IS NULL OR (retroactivity_start_month BETWEEN 1 AND 12));
ALTER TABLE compensation_simulation_employee_results ADD COLUMN technical_application_month INTEGER
  CHECK (technical_application_month IS NULL OR (technical_application_month BETWEEN 1 AND 12));
ALTER TABLE compensation_simulation_employee_results ADD COLUMN campaign_covered_month_count INTEGER
  CHECK (campaign_covered_month_count IS NULL OR (campaign_covered_month_count BETWEEN 0 AND 12));
ALTER TABLE compensation_simulation_employee_results ADD COLUMN retroactive_months INTEGER
  CHECK (retroactive_months IS NULL OR (retroactive_months BETWEEN 0 AND 12));
ALTER TABLE compensation_simulation_employee_results ADD COLUMN remaining_direct_payment_months INTEGER
  CHECK (remaining_direct_payment_months IS NULL OR (remaining_direct_payment_months BETWEEN 0 AND 12));
ALTER TABLE compensation_simulation_employee_results ADD COLUMN base_salary_reminder_text TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN remaining_year_direct_increase_cost_text TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN annual_actual_base_increase_cost_text TEXT;

-- Ancienneté
ALTER TABLE compensation_simulation_employee_results ADD COLUMN hire_date TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN technical_application_month_seniority_rate_percent INTEGER;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN seniority_reminder_text TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN remaining_year_direct_seniority_impact_text TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN annual_seniority_impact_text TEXT;

-- Plein effet (décembre × 12) — indicatifs
ALTER TABLE compensation_simulation_employee_results ADD COLUMN full_year_run_rate_promotion_cost_text TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN full_year_run_rate_compensatory_cost_text TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN full_year_run_rate_combined_base_measure_cost_text TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN full_year_run_rate_seniority_impact_text TEXT;

-- Éligibilité / promotion structurée
ALTER TABLE compensation_simulation_employee_results ADD COLUMN compensatory_measure_eligible INTEGER
  CHECK (compensatory_measure_eligible IS NULL OR compensatory_measure_eligible IN (0, 1));
ALTER TABLE compensation_simulation_employee_results ADD COLUMN is_promotion_budget_population_employee INTEGER
  CHECK (is_promotion_budget_population_employee IS NULL OR is_promotion_budget_population_employee IN (0, 1));
ALTER TABLE compensation_simulation_employee_results ADD COLUMN employment_status TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN contract_type TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN promotion_status_kind TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN compensatory_eligibility_kind TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN compensatory_ineligibility_reason_code TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN has_structured_promotion INTEGER
  CHECK (has_structured_promotion IS NULL OR has_structured_promotion IN (0, 1));
ALTER TABLE compensation_simulation_employee_results ADD COLUMN promotion_date TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN promotion_year INTEGER;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN promotion_month INTEGER
  CHECK (promotion_month IS NULL OR (promotion_month BETWEEN 1 AND 12));
ALTER TABLE compensation_simulation_employee_results ADD COLUMN previous_grade_code TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN promoted_grade_code TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN previous_job_family_code TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN promoted_job_family_code TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN salary_before_promotion_text TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN salary_after_promotion_text TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN promotion_amount_text TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN promotion_rate_num_text TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN promotion_rate_den_text TEXT
  CHECK (promotion_rate_den_text IS NULL OR length(trim(promotion_rate_den_text)) > 0);

-- Coûts promotion imputables / combinés
ALTER TABLE compensation_simulation_employee_results ADD COLUMN promotion_campaign_cost_informative_text TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN annual_promotion_budget_cost_text TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN promotion_cost_already_paid_before_technical_month_text TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN promotion_cost_from_technical_month_to_december_text TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN annual_promotion_seniority_impact_text TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN combined_annual_seniority_impact_text TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN combined_annual_actual_cost_text TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN technical_month_compensatory_complement_text TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN technical_month_final_salary_text TEXT;

-- Minimum garanti
ALTER TABLE compensation_simulation_employee_results ADD COLUMN is_minimum_increase_population_employee INTEGER
  CHECK (is_minimum_increase_population_employee IS NULL OR is_minimum_increase_population_employee IN (0, 1));
ALTER TABLE compensation_simulation_employee_results ADD COLUMN minimum_increase_exclusion_reason TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN campaign_period_minimum_complement_floor_cost_text TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN campaign_period_compensation_above_minimum_cost_text TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN minimum_compensatory_reminder_text TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN above_minimum_compensatory_reminder_text TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN minimum_remaining_year_direct_cost_text TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN above_minimum_remaining_year_direct_cost_text TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN full_year_run_rate_minimum_complement_cost_text TEXT;
ALTER TABLE compensation_simulation_employee_results ADD COLUMN full_year_run_rate_compensation_above_minimum_cost_text TEXT;

-- =========================================================================
-- 3) compensation_simulation_employee_month_results — trajectoire mensuelle
-- =========================================================================
-- Une ligne par (résultat salarié, mois 1..12). Append-only, cascade sur
-- suppression du salarié parent. Codes de calendrier stables (pas de recalcul).
CREATE TABLE IF NOT EXISTS compensation_simulation_employee_month_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_result_id INTEGER NOT NULL
    REFERENCES compensation_simulation_employee_results(id) ON DELETE CASCADE,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),

  base_salary_fcfa_text TEXT NOT NULL CHECK (length(trim(base_salary_fcfa_text)) > 0),
  grade_code TEXT NOT NULL CHECK (length(trim(grade_code)) > 0),
  job_family_code TEXT NOT NULL CHECK (length(trim(job_family_code)) > 0),
  salary_position_label TEXT,

  target_compensatory_rate_num_text TEXT NOT NULL,
  target_compensatory_rate_den_text TEXT NOT NULL
    CHECK (length(trim(target_compensatory_rate_den_text)) > 0),
  promotion_rate_offset_num_text TEXT NOT NULL,
  promotion_rate_offset_den_text TEXT NOT NULL
    CHECK (length(trim(promotion_rate_offset_den_text)) > 0),
  compensatory_complement_rate_num_text TEXT NOT NULL,
  compensatory_complement_rate_den_text TEXT NOT NULL
    CHECK (length(trim(compensatory_complement_rate_den_text)) > 0),
  theoretical_compensatory_complement_num_text TEXT NOT NULL,
  theoretical_compensatory_complement_den_text TEXT NOT NULL
    CHECK (length(trim(theoretical_compensatory_complement_den_text)) > 0),
  rounded_compensatory_complement_fcfa_text TEXT NOT NULL
    CHECK (length(trim(rounded_compensatory_complement_fcfa_text)) > 0),
  promotion_budget_cost_fcfa_text TEXT NOT NULL
    CHECK (length(trim(promotion_budget_cost_fcfa_text)) > 0),
  final_salary_fcfa_text TEXT NOT NULL CHECK (length(trim(final_salary_fcfa_text)) > 0),

  seniority_rate_percent INTEGER NOT NULL,
  promotion_seniority_impact_fcfa_text TEXT NOT NULL,
  compensatory_seniority_impact_fcfa_text TEXT NOT NULL,
  total_seniority_impact_fcfa_text TEXT NOT NULL,

  payment_timing TEXT NOT NULL CHECK (
    payment_timing IN ('outside_campaign', 'reminder', 'direct')
  ),
  promotion_payment_timing TEXT NOT NULL CHECK (
    promotion_payment_timing IN ('outside_campaign', 'reminder', 'direct', 'not_applicable')
  ),
  covered_by_campaign_period INTEGER NOT NULL CHECK (covered_by_campaign_period IN (0, 1)),
  included_in_campaign_envelope INTEGER NOT NULL CHECK (included_in_campaign_envelope IN (0, 1)),
  promotion_active INTEGER NOT NULL CHECK (promotion_active IN (0, 1)),
  promotion_status TEXT NOT NULL CHECK (length(trim(promotion_status)) > 0),

  is_minimum_increase_population_employee INTEGER NOT NULL
    CHECK (is_minimum_increase_population_employee IN (0, 1)),
  guaranteed_total_increase_num_text TEXT NOT NULL,
  guaranteed_total_increase_den_text TEXT NOT NULL
    CHECK (length(trim(guaranteed_total_increase_den_text)) > 0),
  applicable_promotion_increment_fcfa_text TEXT NOT NULL,
  required_minimum_complement_num_text TEXT NOT NULL,
  required_minimum_complement_den_text TEXT NOT NULL
    CHECK (length(trim(required_minimum_complement_den_text)) > 0),
  minimum_complement_floor_fcfa_text TEXT NOT NULL,
  weighted_complement_num_text TEXT NOT NULL,
  weighted_complement_den_text TEXT NOT NULL
    CHECK (length(trim(weighted_complement_den_text)) > 0),
  theoretical_complement_num_text TEXT NOT NULL,
  theoretical_complement_den_text TEXT NOT NULL
    CHECK (length(trim(theoretical_complement_den_text)) > 0),
  actual_complement_above_minimum_fcfa_text TEXT NOT NULL,

  UNIQUE (employee_result_id, month)
);

CREATE INDEX IF NOT EXISTS ix_compensation_simulation_employee_month_results_employee
  ON compensation_simulation_employee_month_results (employee_result_id);

CREATE INDEX IF NOT EXISTS ix_compensation_simulation_employee_month_results_employee_month
  ON compensation_simulation_employee_month_results (employee_result_id, month);
