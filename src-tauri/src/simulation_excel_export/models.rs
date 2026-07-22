//! Structures du snapshot de simulation chargé pour l’export (Lot 2B-E1 / R1).
//!
//! Les champs miroir des colonnes SQL (mêmes noms) pour un mapping `FromRow`
//! direct. Aucun recalcul métier : on relit fidèlement le snapshot append-only.
//! L’enrichissement de lecture (colonnes supplémentaires) reste confiné à
//! l’export : aucun changement de DTO de sauvegarde ni de migration.

use sqlx::FromRow;

/// Ligne `compensation_simulation_runs` (champs 0005 + v3 majeurs).
#[allow(dead_code)]
#[derive(Debug, Clone, FromRow)]
pub struct RunRow {
    pub id: i64,
    pub campaign_id: i64,
    pub run_number: i64,
    pub result_schema_version: i64,
    pub campaign_name: String,
    pub campaign_year: i64,
    pub campaign_status_at_run: String,
    pub evaluation_mode: String,
    pub source_import_file_name: Option<String>,
    pub source_fingerprint: String,
    pub configuration_fingerprint: String,
    pub budget_target_mode: String,
    pub manual_budget_fcfa_text: Option<String>,
    pub eligible_payroll_fcfa_text: Option<String>,
    pub budget_rate_basis_points: Option<i64>,
    pub budget_target_numerator_text: String,
    pub budget_target_denominator_text: String,
    pub rounding_mode: String,
    pub rounding_step_fcfa_text: String,
    pub employee_count: i64,
    pub positive_weight_employee_count: i64,
    pub zero_weight_employee_count: i64,
    pub confirmed_underperformer_count: i64,
    pub theoretical_total_numerator_text: String,
    pub theoretical_total_denominator_text: String,
    pub actual_operation_amount_fcfa_text: String,
    pub total_rounding_delta_numerator_text: String,
    pub total_rounding_delta_denominator_text: String,
    pub created_at: String,

    // ---- Champs schema v3 (nullable pour anciens snapshots) ----
    pub retroactivity_start_month: Option<i64>,
    pub technical_application_month: Option<i64>,
    pub campaign_covered_month_count: Option<i64>,
    pub reminder_month_count: Option<i64>,
    pub direct_payment_month_count: Option<i64>,
    pub calculation_contract_version: Option<i64>,
    pub seniority_impact_contract_version: Option<i64>,
    pub minimum_increase_contract_version: Option<i64>,
    pub minimum_increase_mode: Option<String>,
    pub minimum_monthly_amount_text: Option<String>,
    pub minimum_rate_num_text: Option<String>,
    pub minimum_rate_den_text: Option<String>,
    pub promotion_campaign_period_budget_cost_text: Option<String>,
    pub total_minimum_complement_floor_cost_text: Option<String>,
    pub actual_compensatory_campaign_period_cost_text: Option<String>,
    pub actual_minimum_complement_paid_cost_text: Option<String>,
    pub actual_compensation_above_minimum_cost_text: Option<String>,
    pub actual_combined_campaign_period_cost_text: Option<String>,
    pub minimum_increase_population_employee_count: Option<i64>,
    pub promoted_included_employee_count: Option<i64>,
    pub total_annual_promotion_budget_cost_text: Option<String>,
    pub total_combined_annual_actual_cost_text: Option<String>,
    pub full_year_run_rate_combined_base_measure_cost_text: Option<String>,
    pub full_year_run_rate_promotion_cost_text: Option<String>,
    pub full_year_run_rate_compensatory_cost_text: Option<String>,
    pub full_year_run_rate_seniority_impact_text: Option<String>,
    pub total_base_salary_reminder_text: Option<String>,
    pub total_compensatory_reminder_text: Option<String>,
}

/// Ligne `compensation_simulation_employee_results` (champs majeurs + v3 RH).
#[allow(dead_code)]
#[derive(Debug, Clone, FromRow)]
pub struct EmployeeRow {
    pub id: i64,
    pub employee_id: String,
    pub employee_display_name: Option<String>,
    pub family_code: String,
    pub family_label: Option<String>,
    pub grade_code: String,
    pub grade_label: Option<String>,
    pub salary_fcfa_text: String,
    pub s0_fcfa_text: String,
    pub salary_ratio_basis_points: i64,
    pub salary_position_code: String,
    pub salary_position_label: String,
    pub position_factor_milli: i64,
    pub evaluation_mode: String,
    pub performance_level: Option<String>,
    pub potential_level: Option<String>,
    pub blocking_reason: Option<String>,
    pub theoretical_increase_rate_numerator_text: String,
    pub theoretical_increase_rate_denominator_text: String,
    pub final_rounded_increase_fcfa_text: String,
    pub final_salary_fcfa_text: String,

    // ---- Champs schema v3 (nullable) ----
    pub employment_status: Option<String>,
    pub contract_type: Option<String>,
    pub hire_date: Option<String>,
    pub is_minimum_increase_population_employee: Option<bool>,
    pub has_structured_promotion: Option<bool>,
    pub compensatory_measure_eligible: Option<bool>,
    pub promotion_date: Option<String>,
    pub previous_grade_code: Option<String>,
    pub promoted_grade_code: Option<String>,
    pub promotion_amount_text: Option<String>,
    pub annual_actual_cost_text: Option<String>,
    pub combined_annual_actual_cost_text: Option<String>,
    pub annual_seniority_impact_text: Option<String>,
    pub technical_month_final_salary_text: Option<String>,
    pub campaign_year: Option<i64>,
    pub technical_application_month: Option<i64>,

    // ---- Champs v3 supplémentaires pour présentation RH ----
    pub salary_before_promotion_text: Option<String>,
    pub salary_after_promotion_text: Option<String>,
    pub promotion_rate_num_text: Option<String>,
    pub promotion_rate_den_text: Option<String>,
    pub is_promotion_budget_population_employee: Option<bool>,
    pub compensatory_ineligibility_reason_code: Option<String>,
    pub compensatory_eligibility_kind: Option<String>,
    pub promotion_status_kind: Option<String>,
    pub technical_month_compensatory_complement_text: Option<String>,
    pub campaign_period_minimum_complement_floor_cost_text: Option<String>,
    pub campaign_period_compensation_above_minimum_cost_text: Option<String>,
    pub annual_promotion_budget_cost_text: Option<String>,
    pub annual_promotion_seniority_impact_text: Option<String>,
    pub combined_annual_seniority_impact_text: Option<String>,
    pub base_salary_reminder_text: Option<String>,
    pub remaining_year_direct_increase_cost_text: Option<String>,
    pub full_year_run_rate_promotion_cost_text: Option<String>,
    pub full_year_run_rate_compensatory_cost_text: Option<String>,
    pub full_year_run_rate_combined_base_measure_cost_text: Option<String>,
    pub full_year_run_rate_seniority_impact_text: Option<String>,
    pub technical_application_month_seniority_rate_percent: Option<i64>,
    pub minimum_compensatory_reminder_text: Option<String>,
    pub above_minimum_compensatory_reminder_text: Option<String>,
}

/// Ligne `compensation_simulation_employee_month_results` (champs majeurs).
#[allow(dead_code)]
#[derive(Debug, Clone, FromRow)]
pub struct MonthRow {
    pub month: i64,
    pub base_salary_fcfa_text: String,
    pub grade_code: String,
    pub job_family_code: String,
    pub salary_position_label: Option<String>,
    pub target_compensatory_rate_num_text: String,
    pub target_compensatory_rate_den_text: String,
    pub compensatory_complement_rate_num_text: String,
    pub compensatory_complement_rate_den_text: String,
    pub rounded_compensatory_complement_fcfa_text: String,
    pub promotion_budget_cost_fcfa_text: String,
    pub final_salary_fcfa_text: String,
    pub seniority_rate_percent: i64,
    pub total_seniority_impact_fcfa_text: String,
    pub payment_timing: String,
    pub promotion_payment_timing: String,
    pub covered_by_campaign_period: bool,
    pub included_in_campaign_envelope: bool,
    pub promotion_active: bool,
    pub promotion_status: String,
    pub promotion_seniority_impact_fcfa_text: String,
    pub compensatory_seniority_impact_fcfa_text: String,
    pub minimum_complement_floor_fcfa_text: String,
    pub actual_complement_above_minimum_fcfa_text: String,
}

/// Profil d’organisation (id = 1). Optionnel : « Non disponible » si absent.
#[allow(dead_code)]
#[derive(Debug, Clone, FromRow)]
pub struct OrgProfileRow {
    pub product_name: String,
    pub organization_name: String,
    pub organization_short_name: String,
    pub application_subtitle: String,
    pub report_footer: String,
}

/// Salarié + sa trajectoire mensuelle (12 lignes ordonnées 1..12).
#[derive(Debug, Clone)]
pub struct EmployeeSnapshot {
    pub employee: EmployeeRow,
    pub months: Vec<MonthRow>,
}

/// Snapshot complet consolidé pour l’export.
#[derive(Debug, Clone)]
pub struct SimulationSnapshot {
    pub run: RunRow,
    pub employees: Vec<EmployeeSnapshot>,
    pub organization: Option<OrgProfileRow>,
}

impl SimulationSnapshot {
    pub fn employee_count(&self) -> i64 {
        self.employees.len() as i64
    }

    pub fn month_row_count(&self) -> i64 {
        self.employees.iter().map(|e| e.months.len() as i64).sum()
    }
}
