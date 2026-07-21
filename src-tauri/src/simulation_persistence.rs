//! Persistance atomique d’une simulation de campagne réussie (Lot 2B-4A).

use crate::sqlite_local::{
    close_connection, open_connection, resolve_app_database_path, sqlite_url_from_path,
    SqliteLocalError,
};
use serde::{Deserialize, Serialize};
use sqlx::{Connection, Sqlite, Transaction};
use std::collections::HashSet;
use tauri::AppHandle;

const ALLOWED_EVALUATION_MODES: &[&str] = &[
    "none",
    "performance_only",
    "performance_potential",
    "full_nine_box",
];
const ALLOWED_BUDGET_TARGET_MODES: &[&str] = &["manual_amount", "percentage_of_eligible_payroll"];
const ALLOWED_CAMPAIGN_STATUSES_FOR_RUN: &[&str] = &["draft", "active"];
const ROUNDING_MODE: &str = "nearest_half_up";

/// Point d’échec injecté uniquement dans les tests Rust.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InjectedFault {
    AfterRunInsert,
    AfterEmployeeIndex(usize),
    AfterMonth(usize, i64),
}

const ALLOWED_MINIMUM_INCREASE_MODES: &[&str] =
    &["none", "fixed_monthly_amount", "percentage_of_base_salary"];
const ALLOWED_MONTH_PAYMENT_TIMINGS: &[&str] = &["outside_campaign", "reminder", "direct"];
const ALLOWED_MONTH_PROMOTION_TIMINGS: &[&str] =
    &["outside_campaign", "reminder", "direct", "not_applicable"];

/// Ligne mensuelle persistée (schema v3, Lot 2B-P1). Miroir camelCase du DTO TS.
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SaveSimulationEmployeeMonthDto {
    pub month: i64,
    pub base_salary_fcfa_text: String,
    pub grade_code: String,
    pub job_family_code: String,
    pub salary_position_label: Option<String>,
    pub target_compensatory_rate_numerator_text: String,
    pub target_compensatory_rate_denominator_text: String,
    pub promotion_rate_offset_numerator_text: String,
    pub promotion_rate_offset_denominator_text: String,
    pub compensatory_complement_rate_numerator_text: String,
    pub compensatory_complement_rate_denominator_text: String,
    pub theoretical_compensatory_complement_numerator_text: String,
    pub theoretical_compensatory_complement_denominator_text: String,
    pub rounded_compensatory_complement_fcfa_text: String,
    pub promotion_budget_cost_fcfa_text: String,
    pub final_salary_fcfa_text: String,
    pub seniority_rate_percent: i64,
    pub promotion_seniority_impact_fcfa_text: String,
    pub compensatory_seniority_impact_fcfa_text: String,
    pub total_seniority_impact_fcfa_text: String,
    pub payment_timing: String,
    pub promotion_payment_timing: String,
    pub covered_by_campaign_period: bool,
    pub included_in_campaign_envelope: bool,
    pub promotion_active: bool,
    pub promotion_status: String,
    pub is_minimum_increase_population_employee: bool,
    pub guaranteed_total_increase_numerator_text: String,
    pub guaranteed_total_increase_denominator_text: String,
    pub applicable_promotion_increment_fcfa_text: String,
    pub required_minimum_complement_numerator_text: String,
    pub required_minimum_complement_denominator_text: String,
    pub minimum_complement_floor_fcfa_text: String,
    pub weighted_complement_numerator_text: String,
    pub weighted_complement_denominator_text: String,
    pub theoretical_complement_numerator_text: String,
    pub theoretical_complement_denominator_text: String,
    pub actual_complement_above_minimum_fcfa_text: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SaveSimulationEmployeeDto {
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
    pub evaluation_factor_numerator_text: String,
    pub evaluation_factor_denominator_text: String,
    pub theoretical_matrix_weight_numerator_text: String,
    pub theoretical_matrix_weight_denominator_text: String,
    pub effective_matrix_weight_numerator_text: String,
    pub effective_matrix_weight_denominator_text: String,
    pub allocation_weight_numerator_text: String,
    pub allocation_weight_denominator_text: String,
    pub blocking_reason: Option<String>,
    pub theoretical_increase_rate_numerator_text: String,
    pub theoretical_increase_rate_denominator_text: String,
    pub theoretical_increase_amount_numerator_text: String,
    pub theoretical_increase_amount_denominator_text: String,
    pub final_rounded_increase_fcfa_text: String,
    pub individual_rounding_delta_numerator_text: String,
    pub individual_rounding_delta_denominator_text: String,
    pub final_salary_fcfa_text: String,
    pub explanation_steps_json: String,

    // ---- Champs schema v3 (Lot 2B-P1) — optionnels (NULL pour DTO v2) ----
    #[serde(default)]
    pub annual_theoretical_allocation_numerator_text: Option<String>,
    #[serde(default)]
    pub annual_theoretical_allocation_denominator_text: Option<String>,
    #[serde(default)]
    pub annual_actual_cost_fcfa_text: Option<String>,
    #[serde(default)]
    pub annual_rounding_delta_numerator_text: Option<String>,
    #[serde(default)]
    pub annual_rounding_delta_denominator_text: Option<String>,
    #[serde(default)]
    pub campaign_year: Option<i64>,
    #[serde(default)]
    pub retroactivity_start_month: Option<i64>,
    #[serde(default)]
    pub technical_application_month: Option<i64>,
    #[serde(default)]
    pub campaign_covered_month_count: Option<i64>,
    #[serde(default)]
    pub retroactive_months: Option<i64>,
    #[serde(default)]
    pub remaining_direct_payment_months: Option<i64>,
    #[serde(default)]
    pub base_salary_reminder_fcfa_text: Option<String>,
    #[serde(default)]
    pub remaining_year_direct_increase_cost_fcfa_text: Option<String>,
    #[serde(default)]
    pub annual_actual_base_increase_cost_fcfa_text: Option<String>,
    #[serde(default)]
    pub hire_date: Option<String>,
    #[serde(default)]
    pub technical_application_month_seniority_rate_percent: Option<i64>,
    #[serde(default)]
    pub seniority_reminder_fcfa_text: Option<String>,
    #[serde(default)]
    pub remaining_year_direct_seniority_impact_fcfa_text: Option<String>,
    #[serde(default)]
    pub annual_seniority_impact_fcfa_text: Option<String>,
    #[serde(default)]
    pub full_year_run_rate_promotion_cost_fcfa_text: Option<String>,
    #[serde(default)]
    pub full_year_run_rate_compensatory_cost_fcfa_text: Option<String>,
    #[serde(default)]
    pub full_year_run_rate_combined_base_measure_cost_fcfa_text: Option<String>,
    #[serde(default)]
    pub full_year_run_rate_seniority_impact_fcfa_text: Option<String>,
    #[serde(default)]
    pub compensatory_measure_eligible: Option<bool>,
    #[serde(default)]
    pub is_promotion_budget_population_employee: Option<bool>,
    #[serde(default)]
    pub employment_status: Option<String>,
    #[serde(default)]
    pub contract_type: Option<String>,
    #[serde(default)]
    pub promotion_status_kind: Option<String>,
    #[serde(default)]
    pub compensatory_eligibility_kind: Option<String>,
    #[serde(default)]
    pub compensatory_ineligibility_reason_code: Option<String>,
    #[serde(default)]
    pub has_structured_promotion: Option<bool>,
    #[serde(default)]
    pub promotion_date: Option<String>,
    #[serde(default)]
    pub promotion_year: Option<i64>,
    #[serde(default)]
    pub promotion_month: Option<i64>,
    #[serde(default)]
    pub previous_grade_code: Option<String>,
    #[serde(default)]
    pub promoted_grade_code: Option<String>,
    #[serde(default)]
    pub previous_job_family_code: Option<String>,
    #[serde(default)]
    pub promoted_job_family_code: Option<String>,
    #[serde(default)]
    pub salary_before_promotion_fcfa_text: Option<String>,
    #[serde(default)]
    pub salary_after_promotion_fcfa_text: Option<String>,
    #[serde(default)]
    pub promotion_amount_fcfa_text: Option<String>,
    #[serde(default)]
    pub promotion_rate_numerator_text: Option<String>,
    #[serde(default)]
    pub promotion_rate_denominator_text: Option<String>,
    #[serde(default)]
    pub promotion_campaign_cost_informative_fcfa_text: Option<String>,
    #[serde(default)]
    pub annual_promotion_budget_cost_fcfa_text: Option<String>,
    #[serde(default)]
    pub promotion_cost_already_paid_before_technical_month_fcfa_text: Option<String>,
    #[serde(default)]
    pub promotion_cost_from_technical_month_to_december_fcfa_text: Option<String>,
    #[serde(default)]
    pub annual_promotion_seniority_impact_fcfa_text: Option<String>,
    #[serde(default)]
    pub combined_annual_seniority_impact_fcfa_text: Option<String>,
    #[serde(default)]
    pub combined_annual_actual_cost_fcfa_text: Option<String>,
    #[serde(default)]
    pub technical_month_compensatory_complement_fcfa_text: Option<String>,
    #[serde(default)]
    pub technical_month_final_salary_fcfa_text: Option<String>,
    #[serde(default)]
    pub is_minimum_increase_population_employee: Option<bool>,
    #[serde(default)]
    pub minimum_increase_exclusion_reason: Option<String>,
    #[serde(default)]
    pub campaign_period_minimum_complement_floor_cost_fcfa_text: Option<String>,
    #[serde(default)]
    pub campaign_period_compensation_above_minimum_cost_fcfa_text: Option<String>,
    #[serde(default)]
    pub minimum_compensatory_reminder_fcfa_text: Option<String>,
    #[serde(default)]
    pub above_minimum_compensatory_reminder_fcfa_text: Option<String>,
    #[serde(default)]
    pub minimum_remaining_year_direct_cost_fcfa_text: Option<String>,
    #[serde(default)]
    pub above_minimum_remaining_year_direct_cost_fcfa_text: Option<String>,
    #[serde(default)]
    pub full_year_run_rate_minimum_complement_cost_fcfa_text: Option<String>,
    #[serde(default)]
    pub full_year_run_rate_compensation_above_minimum_cost_fcfa_text: Option<String>,
    #[serde(default)]
    pub months: Option<Vec<SaveSimulationEmployeeMonthDto>>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SaveSimulationRunInput {
    pub campaign_id: i64,
    pub expected_campaign_status: String,
    pub expected_current_import_batch_id: Option<i64>,
    pub campaign_name: String,
    pub campaign_year: i64,
    pub campaign_status_at_run: String,
    pub evaluation_mode: String,
    pub source_import_batch_id: Option<i64>,
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

    // ---- Champs schema v3 (Lot 2B-P1) ----
    #[serde(default)]
    pub result_schema_version: Option<i64>,
    #[serde(default)]
    pub retroactivity_start_month: Option<i64>,
    #[serde(default)]
    pub technical_application_month: Option<i64>,
    #[serde(default)]
    pub campaign_covered_month_count: Option<i64>,
    #[serde(default)]
    pub reminder_month_count: Option<i64>,
    #[serde(default)]
    pub direct_payment_month_count: Option<i64>,
    #[serde(default)]
    pub calculation_contract_version: Option<i64>,
    #[serde(default)]
    pub seniority_impact_contract_version: Option<i64>,
    #[serde(default)]
    pub minimum_increase_contract_version: Option<i64>,
    #[serde(default)]
    pub minimum_increase_mode: Option<String>,
    #[serde(default)]
    pub minimum_monthly_amount_text: Option<String>,
    #[serde(default)]
    pub minimum_rate_numerator_text: Option<String>,
    #[serde(default)]
    pub minimum_rate_denominator_text: Option<String>,
    #[serde(default)]
    pub promotion_campaign_period_budget_cost_text: Option<String>,
    #[serde(default)]
    pub total_minimum_complement_floor_cost_text: Option<String>,
    #[serde(default)]
    pub available_budget_after_promotions_numerator_text: Option<String>,
    #[serde(default)]
    pub available_budget_after_promotions_denominator_text: Option<String>,
    #[serde(default)]
    pub available_budget_after_promotions_and_minimum_numerator_text: Option<String>,
    #[serde(default)]
    pub available_budget_after_promotions_and_minimum_denominator_text: Option<String>,
    #[serde(default)]
    pub theoretical_compensatory_campaign_period_cost_numerator_text: Option<String>,
    #[serde(default)]
    pub theoretical_compensatory_campaign_period_cost_denominator_text: Option<String>,
    #[serde(default)]
    pub actual_compensatory_campaign_period_cost_text: Option<String>,
    #[serde(default)]
    pub actual_minimum_complement_paid_cost_text: Option<String>,
    #[serde(default)]
    pub actual_compensation_above_minimum_cost_text: Option<String>,
    #[serde(default)]
    pub actual_combined_campaign_period_cost_text: Option<String>,
    #[serde(default)]
    pub compensatory_calibration_rate_numerator_text: Option<String>,
    #[serde(default)]
    pub compensatory_calibration_rate_denominator_text: Option<String>,
    #[serde(default)]
    pub minimum_increase_population_employee_count: Option<i64>,
    #[serde(default)]
    pub promoted_included_employee_count: Option<i64>,
    #[serde(default)]
    pub total_base_salary_reminder_text: Option<String>,
    #[serde(default)]
    pub total_remaining_year_direct_increase_cost_text: Option<String>,
    #[serde(default)]
    pub total_annual_actual_base_increase_cost_text: Option<String>,
    #[serde(default)]
    pub total_seniority_reminder_text: Option<String>,
    #[serde(default)]
    pub total_remaining_year_direct_seniority_impact_text: Option<String>,
    #[serde(default)]
    pub total_annual_seniority_impact_text: Option<String>,
    #[serde(default)]
    pub total_annual_promotion_seniority_impact_text: Option<String>,
    #[serde(default)]
    pub total_annual_promotion_budget_cost_text: Option<String>,
    #[serde(default)]
    pub total_combined_annual_actual_cost_text: Option<String>,
    #[serde(default)]
    pub total_combined_annual_seniority_impact_text: Option<String>,
    #[serde(default)]
    pub full_year_run_rate_promotion_cost_text: Option<String>,
    #[serde(default)]
    pub full_year_run_rate_compensatory_cost_text: Option<String>,
    #[serde(default)]
    pub full_year_run_rate_combined_base_measure_cost_text: Option<String>,
    #[serde(default)]
    pub full_year_run_rate_seniority_impact_text: Option<String>,
    #[serde(default)]
    pub full_year_run_rate_minimum_complement_cost_text: Option<String>,
    #[serde(default)]
    pub full_year_run_rate_compensation_above_minimum_cost_text: Option<String>,
    #[serde(default)]
    pub promotion_cost_paid_before_technical_month_text: Option<String>,
    #[serde(default)]
    pub promotion_cost_from_technical_month_to_december_text: Option<String>,
    #[serde(default)]
    pub minimum_compensatory_reminder_text: Option<String>,
    #[serde(default)]
    pub above_minimum_compensatory_reminder_text: Option<String>,
    #[serde(default)]
    pub total_compensatory_reminder_text: Option<String>,
    #[serde(default)]
    pub minimum_remaining_year_direct_cost_text: Option<String>,
    #[serde(default)]
    pub above_minimum_remaining_year_direct_cost_text: Option<String>,
    #[serde(default)]
    pub total_remaining_year_direct_compensatory_cost_text: Option<String>,

    pub employees: Vec<SaveSimulationEmployeeDto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSimulationRunResult {
    pub simulation_run_id: i64,
    pub run_number: i64,
    pub created_at: String,
    pub employee_count: i64,
}

#[derive(Debug)]
pub enum SaveSimulationRunError {
    Validation(String),
    Database(String),
}

impl SaveSimulationRunError {
    pub fn user_message(&self) -> String {
        match self {
            Self::Validation(message) => message.clone(),
            Self::Database(_) => "L’enregistrement de la simulation a échoué.".to_string(),
        }
    }

    pub fn technical_code(&self) -> &'static str {
        match self {
            Self::Validation(_) => "VALIDATION",
            Self::Database(_) => "DATABASE",
        }
    }
}

impl From<sqlx::Error> for SaveSimulationRunError {
    fn from(value: sqlx::Error) -> Self {
        Self::Database(value.to_string())
    }
}

impl From<SqliteLocalError> for SaveSimulationRunError {
    fn from(value: SqliteLocalError) -> Self {
        Self::Database(value.to_string())
    }
}

/// Entier décimal canonique : chiffres, zéro non significatif interdit ; `-0` rejeté.
pub fn is_canonical_integer_text(s: &str, allow_negative: bool) -> bool {
    if s.is_empty() {
        return false;
    }
    let (negative, digits) = if let Some(rest) = s.strip_prefix('-') {
        if !allow_negative || rest.is_empty() {
            return false;
        }
        (true, rest)
    } else {
        (false, s)
    };
    if !digits.bytes().all(|b| b.is_ascii_digit()) {
        return false;
    }
    if digits.len() > 1 && digits.starts_with('0') {
        return false;
    }
    if negative && digits == "0" {
        return false;
    }
    true
}

fn is_positive_canonical_denominator(s: &str) -> bool {
    is_canonical_integer_text(s, false) && s != "0"
}

fn require_canonical(
    value: &str,
    allow_negative: bool,
    message: &str,
) -> Result<(), SaveSimulationRunError> {
    if is_canonical_integer_text(value, allow_negative) {
        Ok(())
    } else {
        Err(SaveSimulationRunError::Validation(message.into()))
    }
}

fn require_positive_denominator(value: &str) -> Result<(), SaveSimulationRunError> {
    if is_positive_canonical_denominator(value) {
        Ok(())
    } else {
        Err(SaveSimulationRunError::Validation(
            "Un dénominateur de simulation est invalide.".into(),
        ))
    }
}

fn require_optional_canonical(
    value: &Option<String>,
    allow_negative: bool,
    message: &str,
) -> Result<(), SaveSimulationRunError> {
    match value {
        Some(v) => require_canonical(v, allow_negative, message),
        None => Ok(()),
    }
}

fn require_optional_positive_denominator(
    value: &Option<String>,
) -> Result<(), SaveSimulationRunError> {
    match value {
        Some(v) => require_positive_denominator(v),
        None => Ok(()),
    }
}

fn is_valid_month(month: i64) -> bool {
    (1..=12).contains(&month)
}

fn validate_month(month: &SaveSimulationEmployeeMonthDto) -> Result<(), SaveSimulationRunError> {
    if !is_valid_month(month.month) {
        return Err(SaveSimulationRunError::Validation(
            "Un mois de trajectoire est hors de l’intervalle 1–12.".into(),
        ));
    }
    if month.seniority_rate_percent < 0 {
        return Err(SaveSimulationRunError::Validation(
            "Un taux d’ancienneté mensuel est invalide.".into(),
        ));
    }
    if !ALLOWED_MONTH_PAYMENT_TIMINGS.contains(&month.payment_timing.as_str()) {
        return Err(SaveSimulationRunError::Validation(
            "Un code de calendrier de paiement mensuel est invalide.".into(),
        ));
    }
    if !ALLOWED_MONTH_PROMOTION_TIMINGS.contains(&month.promotion_payment_timing.as_str()) {
        return Err(SaveSimulationRunError::Validation(
            "Un code de calendrier de promotion mensuel est invalide.".into(),
        ));
    }
    require_non_empty_trim(&month.grade_code, "Chaque mois doit avoir un code grade.")?;
    require_non_empty_trim(
        &month.job_family_code,
        "Chaque mois doit avoir un code famille.",
    )?;
    require_non_empty_trim(
        &month.promotion_status,
        "Chaque mois doit avoir un statut de promotion.",
    )?;

    let canonical = "Un montant mensuel n’est pas au format canonique.";
    require_canonical(&month.base_salary_fcfa_text, false, canonical)?;
    require_canonical(
        &month.rounded_compensatory_complement_fcfa_text,
        false,
        canonical,
    )?;
    require_canonical(&month.promotion_budget_cost_fcfa_text, false, canonical)?;
    require_canonical(&month.final_salary_fcfa_text, false, canonical)?;
    require_canonical(
        &month.applicable_promotion_increment_fcfa_text,
        false,
        canonical,
    )?;
    require_canonical(&month.minimum_complement_floor_fcfa_text, false, canonical)?;
    require_canonical(
        &month.actual_complement_above_minimum_fcfa_text,
        false,
        canonical,
    )?;
    require_canonical(
        &month.promotion_seniority_impact_fcfa_text,
        false,
        canonical,
    )?;
    require_canonical(
        &month.compensatory_seniority_impact_fcfa_text,
        false,
        canonical,
    )?;
    require_canonical(&month.total_seniority_impact_fcfa_text, false, canonical)?;

    // Numérateurs de fractions : signe autorisé ; dénominateurs positifs.
    require_canonical(
        &month.target_compensatory_rate_numerator_text,
        true,
        canonical,
    )?;
    require_positive_denominator(&month.target_compensatory_rate_denominator_text)?;
    require_canonical(&month.promotion_rate_offset_numerator_text, true, canonical)?;
    require_positive_denominator(&month.promotion_rate_offset_denominator_text)?;
    require_canonical(
        &month.compensatory_complement_rate_numerator_text,
        true,
        canonical,
    )?;
    require_positive_denominator(&month.compensatory_complement_rate_denominator_text)?;
    require_canonical(
        &month.theoretical_compensatory_complement_numerator_text,
        true,
        canonical,
    )?;
    require_positive_denominator(&month.theoretical_compensatory_complement_denominator_text)?;
    require_canonical(
        &month.guaranteed_total_increase_numerator_text,
        true,
        canonical,
    )?;
    require_positive_denominator(&month.guaranteed_total_increase_denominator_text)?;
    require_canonical(
        &month.required_minimum_complement_numerator_text,
        true,
        canonical,
    )?;
    require_positive_denominator(&month.required_minimum_complement_denominator_text)?;
    require_canonical(&month.weighted_complement_numerator_text, true, canonical)?;
    require_positive_denominator(&month.weighted_complement_denominator_text)?;
    require_canonical(
        &month.theoretical_complement_numerator_text,
        true,
        canonical,
    )?;
    require_positive_denominator(&month.theoretical_complement_denominator_text)?;
    Ok(())
}

fn require_non_empty_trim(value: &str, message: &str) -> Result<(), SaveSimulationRunError> {
    if value.trim().is_empty() {
        Err(SaveSimulationRunError::Validation(message.into()))
    } else {
        Ok(())
    }
}

fn validate_explanation_steps_json(raw: &str) -> Result<(), SaveSimulationRunError> {
    let parsed: serde_json::Value = serde_json::from_str(raw).map_err(|_| {
        SaveSimulationRunError::Validation(
            "Les étapes d’explication doivent être un tableau JSON valide.".into(),
        )
    })?;
    if !parsed.is_array() {
        return Err(SaveSimulationRunError::Validation(
            "Les étapes d’explication doivent être un tableau JSON valide.".into(),
        ));
    }
    Ok(())
}

fn validate_input(input: &SaveSimulationRunInput) -> Result<(), SaveSimulationRunError> {
    if !ALLOWED_CAMPAIGN_STATUSES_FOR_RUN.contains(&input.expected_campaign_status.as_str()) {
        return Err(SaveSimulationRunError::Validation(
            "Le statut de campagne attendu est invalide.".into(),
        ));
    }
    require_non_empty_trim(
        &input.campaign_name,
        "Le nom de campagne de la simulation est obligatoire.",
    )?;
    if !ALLOWED_CAMPAIGN_STATUSES_FOR_RUN.contains(&input.campaign_status_at_run.as_str())
        && input.campaign_status_at_run != "archived"
    {
        return Err(SaveSimulationRunError::Validation(
            "Le statut de campagne à l’exécution est invalide.".into(),
        ));
    }
    if !ALLOWED_EVALUATION_MODES.contains(&input.evaluation_mode.as_str()) {
        return Err(SaveSimulationRunError::Validation(
            "Le mode d’évaluation de la simulation est invalide.".into(),
        ));
    }
    require_non_empty_trim(
        &input.source_fingerprint,
        "L’empreinte source de la simulation est obligatoire.",
    )?;
    require_non_empty_trim(
        &input.configuration_fingerprint,
        "L’empreinte de configuration de la simulation est obligatoire.",
    )?;
    if !ALLOWED_BUDGET_TARGET_MODES.contains(&input.budget_target_mode.as_str()) {
        return Err(SaveSimulationRunError::Validation(
            "Le mode de budget cible est invalide.".into(),
        ));
    }
    if input.rounding_mode != ROUNDING_MODE {
        return Err(SaveSimulationRunError::Validation(
            "Le mode d’arrondi de la simulation est invalide.".into(),
        ));
    }

    if input.employee_count < 0
        || input.positive_weight_employee_count < 0
        || input.zero_weight_employee_count < 0
        || input.confirmed_underperformer_count < 0
    {
        return Err(SaveSimulationRunError::Validation(
            "Les compteurs de simulation sont invalides.".into(),
        ));
    }
    if input.employee_count != input.employees.len() as i64 {
        return Err(SaveSimulationRunError::Validation(
            "Le nombre de salariés ne correspond pas au résultat de simulation.".into(),
        ));
    }
    if let Some(rate) = input.budget_rate_basis_points {
        if rate < 0 {
            return Err(SaveSimulationRunError::Validation(
                "Le taux de budget est invalide.".into(),
            ));
        }
    }

    require_canonical(
        &input.budget_target_numerator_text,
        false,
        "Un montant de simulation n’est pas au format canonique.",
    )?;
    require_positive_denominator(&input.budget_target_denominator_text)?;
    require_canonical(
        &input.rounding_step_fcfa_text,
        false,
        "Un montant de simulation n’est pas au format canonique.",
    )?;
    require_canonical(
        &input.theoretical_total_numerator_text,
        false,
        "Un montant de simulation n’est pas au format canonique.",
    )?;
    require_positive_denominator(&input.theoretical_total_denominator_text)?;
    require_canonical(
        &input.actual_operation_amount_fcfa_text,
        false,
        "Un montant de simulation n’est pas au format canonique.",
    )?;
    require_canonical(
        &input.total_rounding_delta_numerator_text,
        true,
        "Un montant de simulation n’est pas au format canonique.",
    )?;
    require_positive_denominator(&input.total_rounding_delta_denominator_text)?;

    if let Some(value) = &input.manual_budget_fcfa_text {
        require_canonical(
            value,
            false,
            "Un montant de simulation n’est pas au format canonique.",
        )?;
    }
    if let Some(value) = &input.eligible_payroll_fcfa_text {
        require_canonical(
            value,
            false,
            "Un montant de simulation n’est pas au format canonique.",
        )?;
    }

    let mut seen_ids = HashSet::new();
    for employee in &input.employees {
        let employee_id = employee.employee_id.trim();
        if employee_id.is_empty() {
            return Err(SaveSimulationRunError::Validation(
                "Chaque salarié doit avoir un identifiant.".into(),
            ));
        }
        if !seen_ids.insert(employee_id.to_string()) {
            return Err(SaveSimulationRunError::Validation(
                "Les identifiants salariés de la simulation doivent être uniques.".into(),
            ));
        }
        require_non_empty_trim(
            &employee.family_code,
            "Chaque salarié doit avoir un code famille.",
        )?;
        require_non_empty_trim(
            &employee.grade_code,
            "Chaque salarié doit avoir un code grade.",
        )?;
        require_non_empty_trim(
            &employee.salary_position_code,
            "Chaque salarié doit avoir un code de position salariale.",
        )?;
        require_non_empty_trim(
            &employee.salary_position_label,
            "Chaque salarié doit avoir un libellé de position salariale.",
        )?;
        if employee.position_factor_milli < 0 {
            return Err(SaveSimulationRunError::Validation(
                "Le facteur de position est invalide.".into(),
            ));
        }
        if !ALLOWED_EVALUATION_MODES.contains(&employee.evaluation_mode.as_str()) {
            return Err(SaveSimulationRunError::Validation(
                "Le mode d’évaluation d’un salarié est invalide.".into(),
            ));
        }

        require_canonical(
            &employee.salary_fcfa_text,
            false,
            "Un montant de simulation n’est pas au format canonique.",
        )?;
        require_canonical(
            &employee.s0_fcfa_text,
            false,
            "Un montant de simulation n’est pas au format canonique.",
        )?;
        require_canonical(
            &employee.evaluation_factor_numerator_text,
            false,
            "Un montant de simulation n’est pas au format canonique.",
        )?;
        require_positive_denominator(&employee.evaluation_factor_denominator_text)?;
        require_canonical(
            &employee.theoretical_matrix_weight_numerator_text,
            false,
            "Un montant de simulation n’est pas au format canonique.",
        )?;
        require_positive_denominator(&employee.theoretical_matrix_weight_denominator_text)?;
        require_canonical(
            &employee.effective_matrix_weight_numerator_text,
            false,
            "Un montant de simulation n’est pas au format canonique.",
        )?;
        require_positive_denominator(&employee.effective_matrix_weight_denominator_text)?;
        require_canonical(
            &employee.allocation_weight_numerator_text,
            false,
            "Un montant de simulation n’est pas au format canonique.",
        )?;
        require_positive_denominator(&employee.allocation_weight_denominator_text)?;
        require_canonical(
            &employee.theoretical_increase_rate_numerator_text,
            false,
            "Un montant de simulation n’est pas au format canonique.",
        )?;
        require_positive_denominator(&employee.theoretical_increase_rate_denominator_text)?;
        require_canonical(
            &employee.theoretical_increase_amount_numerator_text,
            false,
            "Un montant de simulation n’est pas au format canonique.",
        )?;
        require_positive_denominator(&employee.theoretical_increase_amount_denominator_text)?;
        require_canonical(
            &employee.final_rounded_increase_fcfa_text,
            false,
            "Un montant de simulation n’est pas au format canonique.",
        )?;
        require_canonical(
            &employee.individual_rounding_delta_numerator_text,
            true,
            "Un montant de simulation n’est pas au format canonique.",
        )?;
        require_positive_denominator(&employee.individual_rounding_delta_denominator_text)?;
        require_canonical(
            &employee.final_salary_fcfa_text,
            false,
            "Un montant de simulation n’est pas au format canonique.",
        )?;
        validate_explanation_steps_json(&employee.explanation_steps_json)?;

        // Champs optionnels v3 : validés seulement si présents (NULL sinon).
        let canonical = "Un montant de simulation n’est pas au format canonique.";
        require_optional_canonical(&employee.annual_actual_cost_fcfa_text, false, canonical)?;
        require_optional_canonical(
            &employee.annual_theoretical_allocation_numerator_text,
            false,
            canonical,
        )?;
        require_optional_positive_denominator(
            &employee.annual_theoretical_allocation_denominator_text,
        )?;
        require_optional_canonical(
            &employee.annual_rounding_delta_numerator_text,
            true,
            canonical,
        )?;
        require_optional_positive_denominator(&employee.annual_rounding_delta_denominator_text)?;
        require_optional_canonical(&employee.promotion_rate_numerator_text, true, canonical)?;
        require_optional_positive_denominator(&employee.promotion_rate_denominator_text)?;

        if let Some(months) = &employee.months {
            if !months.is_empty() {
                if months.len() != 12 {
                    return Err(SaveSimulationRunError::Validation(
                        "La trajectoire mensuelle doit comporter exactement 12 mois.".into(),
                    ));
                }
                let mut seen_months = HashSet::new();
                for month in months {
                    if !seen_months.insert(month.month) {
                        return Err(SaveSimulationRunError::Validation(
                            "Les mois de trajectoire doivent être uniques (1–12).".into(),
                        ));
                    }
                    validate_month(month)?;
                }
            }
        }
    }

    // Invariant append-only : soit aucune trajectoire, soit toutes complètes.
    let employees_with_months = input
        .employees
        .iter()
        .filter(|e| e.months.as_ref().map(|m| !m.is_empty()).unwrap_or(false))
        .count();
    if employees_with_months != 0 && employees_with_months != input.employees.len() {
        return Err(SaveSimulationRunError::Validation(
            "La trajectoire mensuelle doit être fournie pour tous les salariés ou pour aucun."
                .into(),
        ));
    }

    if let Some(mode) = &input.minimum_increase_mode {
        if !ALLOWED_MINIMUM_INCREASE_MODES.contains(&mode.as_str()) {
            return Err(SaveSimulationRunError::Validation(
                "Le mode de minimum garanti est invalide.".into(),
            ));
        }
    }

    Ok(())
}

async fn utc_now_iso(tx: &mut Transaction<'_, Sqlite>) -> Result<String, SaveSimulationRunError> {
    let value: String = sqlx::query_scalar("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")
        .fetch_one(&mut **tx)
        .await?;
    Ok(value)
}

/// Exécute l’enregistrement atomique sur une URL SQLite (tests + commande).
pub async fn save_simulation_run_on_url(
    database_url: &str,
    input: &SaveSimulationRunInput,
    fault: Option<InjectedFault>,
) -> Result<SaveSimulationRunResult, SaveSimulationRunError> {
    validate_input(input)?;
    let mut conn = open_connection(database_url).await?;
    let outcome = async {
        let mut tx = conn.begin().await?;
        let result = save_simulation_run_in_tx(&mut tx, input, fault).await;
        match result {
            Ok(value) => {
                tx.commit().await?;
                Ok(value)
            }
            Err(error) => {
                let _ = tx.rollback().await;
                Err(error)
            }
        }
    }
    .await;
    // Libère explicitement le verrou writer avant tout retour au pool plugin SQL.
    let _ = close_connection(conn).await;
    outcome
}

async fn update_employee_v3_columns(
    tx: &mut Transaction<'_, Sqlite>,
    employee_result_id: i64,
    employee: &SaveSimulationEmployeeDto,
) -> Result<(), SaveSimulationRunError> {
    sqlx::query(
        r#"
        UPDATE compensation_simulation_employee_results SET
            annual_theoretical_allocation_num_text = ?1,
            annual_theoretical_allocation_den_text = ?2,
            annual_actual_cost_text = ?3,
            annual_rounding_delta_num_text = ?4,
            annual_rounding_delta_den_text = ?5,
            campaign_year = ?6,
            retroactivity_start_month = ?7,
            technical_application_month = ?8,
            campaign_covered_month_count = ?9,
            retroactive_months = ?10,
            remaining_direct_payment_months = ?11,
            base_salary_reminder_text = ?12,
            remaining_year_direct_increase_cost_text = ?13,
            annual_actual_base_increase_cost_text = ?14,
            hire_date = ?15,
            technical_application_month_seniority_rate_percent = ?16,
            seniority_reminder_text = ?17,
            remaining_year_direct_seniority_impact_text = ?18,
            annual_seniority_impact_text = ?19,
            full_year_run_rate_promotion_cost_text = ?20,
            full_year_run_rate_compensatory_cost_text = ?21,
            full_year_run_rate_combined_base_measure_cost_text = ?22,
            full_year_run_rate_seniority_impact_text = ?23,
            compensatory_measure_eligible = ?24,
            is_promotion_budget_population_employee = ?25,
            employment_status = ?26,
            contract_type = ?27,
            promotion_status_kind = ?28,
            compensatory_eligibility_kind = ?29,
            compensatory_ineligibility_reason_code = ?30,
            has_structured_promotion = ?31,
            promotion_date = ?32,
            promotion_year = ?33,
            promotion_month = ?34,
            previous_grade_code = ?35,
            promoted_grade_code = ?36,
            previous_job_family_code = ?37,
            promoted_job_family_code = ?38,
            salary_before_promotion_text = ?39,
            salary_after_promotion_text = ?40,
            promotion_amount_text = ?41,
            promotion_rate_num_text = ?42,
            promotion_rate_den_text = ?43,
            promotion_campaign_cost_informative_text = ?44,
            annual_promotion_budget_cost_text = ?45,
            promotion_cost_already_paid_before_technical_month_text = ?46,
            promotion_cost_from_technical_month_to_december_text = ?47,
            annual_promotion_seniority_impact_text = ?48,
            combined_annual_seniority_impact_text = ?49,
            combined_annual_actual_cost_text = ?50,
            technical_month_compensatory_complement_text = ?51,
            technical_month_final_salary_text = ?52,
            is_minimum_increase_population_employee = ?53,
            minimum_increase_exclusion_reason = ?54,
            campaign_period_minimum_complement_floor_cost_text = ?55,
            campaign_period_compensation_above_minimum_cost_text = ?56,
            minimum_compensatory_reminder_text = ?57,
            above_minimum_compensatory_reminder_text = ?58,
            minimum_remaining_year_direct_cost_text = ?59,
            above_minimum_remaining_year_direct_cost_text = ?60,
            full_year_run_rate_minimum_complement_cost_text = ?61,
            full_year_run_rate_compensation_above_minimum_cost_text = ?62
        WHERE id = ?63
        "#,
    )
    .bind(&employee.annual_theoretical_allocation_numerator_text)
    .bind(&employee.annual_theoretical_allocation_denominator_text)
    .bind(&employee.annual_actual_cost_fcfa_text)
    .bind(&employee.annual_rounding_delta_numerator_text)
    .bind(&employee.annual_rounding_delta_denominator_text)
    .bind(employee.campaign_year)
    .bind(employee.retroactivity_start_month)
    .bind(employee.technical_application_month)
    .bind(employee.campaign_covered_month_count)
    .bind(employee.retroactive_months)
    .bind(employee.remaining_direct_payment_months)
    .bind(&employee.base_salary_reminder_fcfa_text)
    .bind(&employee.remaining_year_direct_increase_cost_fcfa_text)
    .bind(&employee.annual_actual_base_increase_cost_fcfa_text)
    .bind(&employee.hire_date)
    .bind(employee.technical_application_month_seniority_rate_percent)
    .bind(&employee.seniority_reminder_fcfa_text)
    .bind(&employee.remaining_year_direct_seniority_impact_fcfa_text)
    .bind(&employee.annual_seniority_impact_fcfa_text)
    .bind(&employee.full_year_run_rate_promotion_cost_fcfa_text)
    .bind(&employee.full_year_run_rate_compensatory_cost_fcfa_text)
    .bind(&employee.full_year_run_rate_combined_base_measure_cost_fcfa_text)
    .bind(&employee.full_year_run_rate_seniority_impact_fcfa_text)
    .bind(employee.compensatory_measure_eligible)
    .bind(employee.is_promotion_budget_population_employee)
    .bind(&employee.employment_status)
    .bind(&employee.contract_type)
    .bind(&employee.promotion_status_kind)
    .bind(&employee.compensatory_eligibility_kind)
    .bind(&employee.compensatory_ineligibility_reason_code)
    .bind(employee.has_structured_promotion)
    .bind(&employee.promotion_date)
    .bind(employee.promotion_year)
    .bind(employee.promotion_month)
    .bind(&employee.previous_grade_code)
    .bind(&employee.promoted_grade_code)
    .bind(&employee.previous_job_family_code)
    .bind(&employee.promoted_job_family_code)
    .bind(&employee.salary_before_promotion_fcfa_text)
    .bind(&employee.salary_after_promotion_fcfa_text)
    .bind(&employee.promotion_amount_fcfa_text)
    .bind(&employee.promotion_rate_numerator_text)
    .bind(&employee.promotion_rate_denominator_text)
    .bind(&employee.promotion_campaign_cost_informative_fcfa_text)
    .bind(&employee.annual_promotion_budget_cost_fcfa_text)
    .bind(&employee.promotion_cost_already_paid_before_technical_month_fcfa_text)
    .bind(&employee.promotion_cost_from_technical_month_to_december_fcfa_text)
    .bind(&employee.annual_promotion_seniority_impact_fcfa_text)
    .bind(&employee.combined_annual_seniority_impact_fcfa_text)
    .bind(&employee.combined_annual_actual_cost_fcfa_text)
    .bind(&employee.technical_month_compensatory_complement_fcfa_text)
    .bind(&employee.technical_month_final_salary_fcfa_text)
    .bind(employee.is_minimum_increase_population_employee)
    .bind(&employee.minimum_increase_exclusion_reason)
    .bind(&employee.campaign_period_minimum_complement_floor_cost_fcfa_text)
    .bind(&employee.campaign_period_compensation_above_minimum_cost_fcfa_text)
    .bind(&employee.minimum_compensatory_reminder_fcfa_text)
    .bind(&employee.above_minimum_compensatory_reminder_fcfa_text)
    .bind(&employee.minimum_remaining_year_direct_cost_fcfa_text)
    .bind(&employee.above_minimum_remaining_year_direct_cost_fcfa_text)
    .bind(&employee.full_year_run_rate_minimum_complement_cost_fcfa_text)
    .bind(&employee.full_year_run_rate_compensation_above_minimum_cost_fcfa_text)
    .bind(employee_result_id)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn insert_employee_month(
    tx: &mut Transaction<'_, Sqlite>,
    employee_result_id: i64,
    month: &SaveSimulationEmployeeMonthDto,
) -> Result<(), SaveSimulationRunError> {
    sqlx::query(
        r#"
        INSERT INTO compensation_simulation_employee_month_results (
            employee_result_id, month, base_salary_fcfa_text, grade_code, job_family_code,
            salary_position_label,
            target_compensatory_rate_num_text, target_compensatory_rate_den_text,
            promotion_rate_offset_num_text, promotion_rate_offset_den_text,
            compensatory_complement_rate_num_text, compensatory_complement_rate_den_text,
            theoretical_compensatory_complement_num_text, theoretical_compensatory_complement_den_text,
            rounded_compensatory_complement_fcfa_text, promotion_budget_cost_fcfa_text,
            final_salary_fcfa_text,
            seniority_rate_percent, promotion_seniority_impact_fcfa_text,
            compensatory_seniority_impact_fcfa_text, total_seniority_impact_fcfa_text,
            payment_timing, promotion_payment_timing, covered_by_campaign_period,
            included_in_campaign_envelope, promotion_active, promotion_status,
            is_minimum_increase_population_employee,
            guaranteed_total_increase_num_text, guaranteed_total_increase_den_text,
            applicable_promotion_increment_fcfa_text,
            required_minimum_complement_num_text, required_minimum_complement_den_text,
            minimum_complement_floor_fcfa_text,
            weighted_complement_num_text, weighted_complement_den_text,
            theoretical_complement_num_text, theoretical_complement_den_text,
            actual_complement_above_minimum_fcfa_text
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5,
            ?6,
            ?7, ?8,
            ?9, ?10,
            ?11, ?12,
            ?13, ?14,
            ?15, ?16,
            ?17,
            ?18, ?19,
            ?20, ?21,
            ?22, ?23, ?24,
            ?25, ?26, ?27,
            ?28,
            ?29, ?30,
            ?31,
            ?32, ?33,
            ?34,
            ?35, ?36,
            ?37, ?38,
            ?39
        )
        "#,
    )
    .bind(employee_result_id)
    .bind(month.month)
    .bind(&month.base_salary_fcfa_text)
    .bind(month.grade_code.trim())
    .bind(month.job_family_code.trim())
    .bind(&month.salary_position_label)
    .bind(&month.target_compensatory_rate_numerator_text)
    .bind(&month.target_compensatory_rate_denominator_text)
    .bind(&month.promotion_rate_offset_numerator_text)
    .bind(&month.promotion_rate_offset_denominator_text)
    .bind(&month.compensatory_complement_rate_numerator_text)
    .bind(&month.compensatory_complement_rate_denominator_text)
    .bind(&month.theoretical_compensatory_complement_numerator_text)
    .bind(&month.theoretical_compensatory_complement_denominator_text)
    .bind(&month.rounded_compensatory_complement_fcfa_text)
    .bind(&month.promotion_budget_cost_fcfa_text)
    .bind(&month.final_salary_fcfa_text)
    .bind(month.seniority_rate_percent)
    .bind(&month.promotion_seniority_impact_fcfa_text)
    .bind(&month.compensatory_seniority_impact_fcfa_text)
    .bind(&month.total_seniority_impact_fcfa_text)
    .bind(&month.payment_timing)
    .bind(&month.promotion_payment_timing)
    .bind(month.covered_by_campaign_period)
    .bind(month.included_in_campaign_envelope)
    .bind(month.promotion_active)
    .bind(month.promotion_status.trim())
    .bind(month.is_minimum_increase_population_employee)
    .bind(&month.guaranteed_total_increase_numerator_text)
    .bind(&month.guaranteed_total_increase_denominator_text)
    .bind(&month.applicable_promotion_increment_fcfa_text)
    .bind(&month.required_minimum_complement_numerator_text)
    .bind(&month.required_minimum_complement_denominator_text)
    .bind(&month.minimum_complement_floor_fcfa_text)
    .bind(&month.weighted_complement_numerator_text)
    .bind(&month.weighted_complement_denominator_text)
    .bind(&month.theoretical_complement_numerator_text)
    .bind(&month.theoretical_complement_denominator_text)
    .bind(&month.actual_complement_above_minimum_fcfa_text)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

async fn save_simulation_run_in_tx(
    tx: &mut Transaction<'_, Sqlite>,
    input: &SaveSimulationRunInput,
    fault: Option<InjectedFault>,
) -> Result<SaveSimulationRunResult, SaveSimulationRunError> {
    let campaign_status: Option<String> =
        sqlx::query_scalar("SELECT status FROM campaigns WHERE id = ?1")
            .bind(input.campaign_id)
            .fetch_optional(&mut **tx)
            .await?;
    let Some(status) = campaign_status else {
        return Err(SaveSimulationRunError::Validation(
            "La campagne cible de la simulation est introuvable.".into(),
        ));
    };
    if status == "archived" {
        return Err(SaveSimulationRunError::Validation(
            "Cette campagne est archivée : l’enregistrement de simulation est bloqué.".into(),
        ));
    }
    if !ALLOWED_CAMPAIGN_STATUSES_FOR_RUN.contains(&status.as_str()) {
        return Err(SaveSimulationRunError::Validation(
            "Le statut de la campagne ne permet pas d’enregistrer une simulation.".into(),
        ));
    }
    if status != input.expected_campaign_status {
        return Err(SaveSimulationRunError::Validation(
            "Le statut de campagne a changé depuis le calcul de la simulation.".into(),
        ));
    }

    let current_batch_id: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM hr_import_batches WHERE campaign_id = ?1 AND status = 'current'",
    )
    .bind(input.campaign_id)
    .fetch_optional(&mut **tx)
    .await?;

    match (input.expected_current_import_batch_id, current_batch_id) {
        (Some(expected), Some(actual)) if expected == actual => {}
        (None, None) => {}
        _ => {
            return Err(SaveSimulationRunError::Validation(
                "Le lot d’import courant a changé depuis le calcul de la simulation.".into(),
            ));
        }
    }

    let created_at = utc_now_iso(tx).await?;

    let run_number: i64 = sqlx::query_scalar(
        r#"
        SELECT COALESCE(MAX(run_number), 0) + 1
        FROM compensation_simulation_runs
        WHERE campaign_id = ?1
        "#,
    )
    .bind(input.campaign_id)
    .fetch_one(&mut **tx)
    .await?;

    let insert = sqlx::query(
        r#"
        INSERT INTO compensation_simulation_runs (
            campaign_id, run_number, result_schema_version,
            campaign_name, campaign_year, campaign_status_at_run, evaluation_mode,
            source_import_batch_id, source_import_file_name,
            source_fingerprint, configuration_fingerprint,
            budget_target_mode, manual_budget_fcfa_text, eligible_payroll_fcfa_text,
            budget_rate_basis_points, budget_target_numerator_text, budget_target_denominator_text,
            rounding_mode, rounding_step_fcfa_text,
            employee_count, positive_weight_employee_count, zero_weight_employee_count,
            confirmed_underperformer_count,
            theoretical_total_numerator_text, theoretical_total_denominator_text,
            actual_operation_amount_fcfa_text,
            total_rounding_delta_numerator_text, total_rounding_delta_denominator_text,
            created_at
        ) VALUES (
            ?1, ?2, 3,
            ?3, ?4, ?5, ?6,
            ?7, ?8,
            ?9, ?10,
            ?11, ?12, ?13,
            ?14, ?15, ?16,
            ?17, ?18,
            ?19, ?20, ?21,
            ?22,
            ?23, ?24,
            ?25,
            ?26, ?27,
            ?28
        )
        "#,
    )
    .bind(input.campaign_id)
    .bind(run_number)
    .bind(input.campaign_name.trim())
    .bind(input.campaign_year)
    .bind(&input.campaign_status_at_run)
    .bind(&input.evaluation_mode)
    .bind(input.source_import_batch_id)
    .bind(&input.source_import_file_name)
    .bind(input.source_fingerprint.trim())
    .bind(input.configuration_fingerprint.trim())
    .bind(&input.budget_target_mode)
    .bind(&input.manual_budget_fcfa_text)
    .bind(&input.eligible_payroll_fcfa_text)
    .bind(input.budget_rate_basis_points)
    .bind(&input.budget_target_numerator_text)
    .bind(&input.budget_target_denominator_text)
    .bind(&input.rounding_mode)
    .bind(&input.rounding_step_fcfa_text)
    .bind(input.employee_count)
    .bind(input.positive_weight_employee_count)
    .bind(input.zero_weight_employee_count)
    .bind(input.confirmed_underperformer_count)
    .bind(&input.theoretical_total_numerator_text)
    .bind(&input.theoretical_total_denominator_text)
    .bind(&input.actual_operation_amount_fcfa_text)
    .bind(&input.total_rounding_delta_numerator_text)
    .bind(&input.total_rounding_delta_denominator_text)
    .bind(&created_at)
    .execute(&mut **tx)
    .await?;

    let simulation_run_id = insert.last_insert_rowid();
    if simulation_run_id <= 0 {
        return Err(SaveSimulationRunError::Database(
            "Identifiant de simulation introuvable après insertion.".into(),
        ));
    }

    // Colonnes schema v3 (migration 0007) — écrites en un seul UPDATE.
    sqlx::query(
        r#"
        UPDATE compensation_simulation_runs SET
            result_schema_version = ?1,
            retroactivity_start_month = ?2,
            technical_application_month = ?3,
            campaign_covered_month_count = ?4,
            reminder_month_count = ?5,
            direct_payment_month_count = ?6,
            calculation_contract_version = ?7,
            seniority_impact_contract_version = ?8,
            minimum_increase_contract_version = ?9,
            minimum_increase_mode = ?10,
            minimum_monthly_amount_text = ?11,
            minimum_rate_num_text = ?12,
            minimum_rate_den_text = ?13,
            promotion_campaign_period_budget_cost_text = ?14,
            total_minimum_complement_floor_cost_text = ?15,
            available_budget_after_promotions_num_text = ?16,
            available_budget_after_promotions_den_text = ?17,
            available_budget_after_promotions_and_minimum_num_text = ?18,
            available_budget_after_promotions_and_minimum_den_text = ?19,
            theoretical_compensatory_campaign_period_cost_num_text = ?20,
            theoretical_compensatory_campaign_period_cost_den_text = ?21,
            actual_compensatory_campaign_period_cost_text = ?22,
            actual_minimum_complement_paid_cost_text = ?23,
            actual_compensation_above_minimum_cost_text = ?24,
            actual_combined_campaign_period_cost_text = ?25,
            compensatory_calibration_rate_num_text = ?26,
            compensatory_calibration_rate_den_text = ?27,
            minimum_increase_population_employee_count = ?28,
            promoted_included_employee_count = ?29,
            total_base_salary_reminder_text = ?30,
            total_remaining_year_direct_increase_cost_text = ?31,
            total_annual_actual_base_increase_cost_text = ?32,
            total_seniority_reminder_text = ?33,
            total_remaining_year_direct_seniority_impact_text = ?34,
            total_annual_seniority_impact_text = ?35,
            total_annual_promotion_seniority_impact_text = ?36,
            total_annual_promotion_budget_cost_text = ?37,
            total_combined_annual_actual_cost_text = ?38,
            total_combined_annual_seniority_impact_text = ?39,
            full_year_run_rate_promotion_cost_text = ?40,
            full_year_run_rate_compensatory_cost_text = ?41,
            full_year_run_rate_combined_base_measure_cost_text = ?42,
            full_year_run_rate_seniority_impact_text = ?43,
            full_year_run_rate_minimum_complement_cost_text = ?44,
            full_year_run_rate_compensation_above_minimum_cost_text = ?45,
            promotion_cost_paid_before_technical_month_text = ?46,
            promotion_cost_from_technical_month_to_december_text = ?47,
            minimum_compensatory_reminder_text = ?48,
            above_minimum_compensatory_reminder_text = ?49,
            total_compensatory_reminder_text = ?50,
            minimum_remaining_year_direct_cost_text = ?51,
            above_minimum_remaining_year_direct_cost_text = ?52,
            total_remaining_year_direct_compensatory_cost_text = ?53
        WHERE id = ?54
        "#,
    )
    .bind(input.result_schema_version.unwrap_or(3))
    .bind(input.retroactivity_start_month)
    .bind(input.technical_application_month)
    .bind(input.campaign_covered_month_count)
    .bind(input.reminder_month_count)
    .bind(input.direct_payment_month_count)
    .bind(input.calculation_contract_version)
    .bind(input.seniority_impact_contract_version)
    .bind(input.minimum_increase_contract_version)
    .bind(&input.minimum_increase_mode)
    .bind(&input.minimum_monthly_amount_text)
    .bind(&input.minimum_rate_numerator_text)
    .bind(&input.minimum_rate_denominator_text)
    .bind(&input.promotion_campaign_period_budget_cost_text)
    .bind(&input.total_minimum_complement_floor_cost_text)
    .bind(&input.available_budget_after_promotions_numerator_text)
    .bind(&input.available_budget_after_promotions_denominator_text)
    .bind(&input.available_budget_after_promotions_and_minimum_numerator_text)
    .bind(&input.available_budget_after_promotions_and_minimum_denominator_text)
    .bind(&input.theoretical_compensatory_campaign_period_cost_numerator_text)
    .bind(&input.theoretical_compensatory_campaign_period_cost_denominator_text)
    .bind(&input.actual_compensatory_campaign_period_cost_text)
    .bind(&input.actual_minimum_complement_paid_cost_text)
    .bind(&input.actual_compensation_above_minimum_cost_text)
    .bind(&input.actual_combined_campaign_period_cost_text)
    .bind(&input.compensatory_calibration_rate_numerator_text)
    .bind(&input.compensatory_calibration_rate_denominator_text)
    .bind(input.minimum_increase_population_employee_count)
    .bind(input.promoted_included_employee_count)
    .bind(&input.total_base_salary_reminder_text)
    .bind(&input.total_remaining_year_direct_increase_cost_text)
    .bind(&input.total_annual_actual_base_increase_cost_text)
    .bind(&input.total_seniority_reminder_text)
    .bind(&input.total_remaining_year_direct_seniority_impact_text)
    .bind(&input.total_annual_seniority_impact_text)
    .bind(&input.total_annual_promotion_seniority_impact_text)
    .bind(&input.total_annual_promotion_budget_cost_text)
    .bind(&input.total_combined_annual_actual_cost_text)
    .bind(&input.total_combined_annual_seniority_impact_text)
    .bind(&input.full_year_run_rate_promotion_cost_text)
    .bind(&input.full_year_run_rate_compensatory_cost_text)
    .bind(&input.full_year_run_rate_combined_base_measure_cost_text)
    .bind(&input.full_year_run_rate_seniority_impact_text)
    .bind(&input.full_year_run_rate_minimum_complement_cost_text)
    .bind(&input.full_year_run_rate_compensation_above_minimum_cost_text)
    .bind(&input.promotion_cost_paid_before_technical_month_text)
    .bind(&input.promotion_cost_from_technical_month_to_december_text)
    .bind(&input.minimum_compensatory_reminder_text)
    .bind(&input.above_minimum_compensatory_reminder_text)
    .bind(&input.total_compensatory_reminder_text)
    .bind(&input.minimum_remaining_year_direct_cost_text)
    .bind(&input.above_minimum_remaining_year_direct_cost_text)
    .bind(&input.total_remaining_year_direct_compensatory_cost_text)
    .bind(simulation_run_id)
    .execute(&mut **tx)
    .await?;

    if fault == Some(InjectedFault::AfterRunInsert) {
        return Err(SaveSimulationRunError::Database(
            "Échec injecté après insertion de la simulation.".into(),
        ));
    }

    let mut total_month_count: i64 = 0;
    for (index, employee) in input.employees.iter().enumerate() {
        let employee_insert = sqlx::query(
            r#"
            INSERT INTO compensation_simulation_employee_results (
                simulation_run_id, employee_id, employee_display_name,
                family_code, family_label, grade_code, grade_label,
                salary_fcfa_text, s0_fcfa_text, salary_ratio_basis_points,
                salary_position_code, salary_position_label, position_factor_milli,
                evaluation_mode, performance_level, potential_level,
                evaluation_factor_numerator_text, evaluation_factor_denominator_text,
                theoretical_matrix_weight_numerator_text, theoretical_matrix_weight_denominator_text,
                effective_matrix_weight_numerator_text, effective_matrix_weight_denominator_text,
                allocation_weight_numerator_text, allocation_weight_denominator_text,
                blocking_reason,
                theoretical_increase_rate_numerator_text, theoretical_increase_rate_denominator_text,
                theoretical_increase_amount_numerator_text, theoretical_increase_amount_denominator_text,
                final_rounded_increase_fcfa_text,
                individual_rounding_delta_numerator_text, individual_rounding_delta_denominator_text,
                final_salary_fcfa_text, explanation_steps_json
            ) VALUES (
                ?1, ?2, ?3,
                ?4, ?5, ?6, ?7,
                ?8, ?9, ?10,
                ?11, ?12, ?13,
                ?14, ?15, ?16,
                ?17, ?18,
                ?19, ?20,
                ?21, ?22,
                ?23, ?24,
                ?25,
                ?26, ?27,
                ?28, ?29,
                ?30,
                ?31, ?32,
                ?33, ?34
            )
            "#,
        )
        .bind(simulation_run_id)
        .bind(employee.employee_id.trim())
        .bind(&employee.employee_display_name)
        .bind(employee.family_code.trim())
        .bind(&employee.family_label)
        .bind(employee.grade_code.trim())
        .bind(&employee.grade_label)
        .bind(&employee.salary_fcfa_text)
        .bind(&employee.s0_fcfa_text)
        .bind(employee.salary_ratio_basis_points)
        .bind(employee.salary_position_code.trim())
        .bind(employee.salary_position_label.trim())
        .bind(employee.position_factor_milli)
        .bind(&employee.evaluation_mode)
        .bind(&employee.performance_level)
        .bind(&employee.potential_level)
        .bind(&employee.evaluation_factor_numerator_text)
        .bind(&employee.evaluation_factor_denominator_text)
        .bind(&employee.theoretical_matrix_weight_numerator_text)
        .bind(&employee.theoretical_matrix_weight_denominator_text)
        .bind(&employee.effective_matrix_weight_numerator_text)
        .bind(&employee.effective_matrix_weight_denominator_text)
        .bind(&employee.allocation_weight_numerator_text)
        .bind(&employee.allocation_weight_denominator_text)
        .bind(&employee.blocking_reason)
        .bind(&employee.theoretical_increase_rate_numerator_text)
        .bind(&employee.theoretical_increase_rate_denominator_text)
        .bind(&employee.theoretical_increase_amount_numerator_text)
        .bind(&employee.theoretical_increase_amount_denominator_text)
        .bind(&employee.final_rounded_increase_fcfa_text)
        .bind(&employee.individual_rounding_delta_numerator_text)
        .bind(&employee.individual_rounding_delta_denominator_text)
        .bind(&employee.final_salary_fcfa_text)
        .bind(&employee.explanation_steps_json)
        .execute(&mut **tx)
        .await?;

        let employee_result_id = employee_insert.last_insert_rowid();
        if employee_result_id <= 0 {
            return Err(SaveSimulationRunError::Database(
                "Identifiant de salarié introuvable après insertion.".into(),
            ));
        }

        if fault == Some(InjectedFault::AfterEmployeeIndex(index)) {
            return Err(SaveSimulationRunError::Database(
                "Échec injecté pendant l’insertion des salariés de simulation.".into(),
            ));
        }

        // Colonnes schema v3 du salarié (migration 0007).
        update_employee_v3_columns(tx, employee_result_id, employee).await?;

        // Trajectoire mensuelle (schema v3) — 12 lignes append-only si fournie.
        if let Some(months) = &employee.months {
            for month in months {
                insert_employee_month(tx, employee_result_id, month).await?;
                total_month_count += 1;
                if fault == Some(InjectedFault::AfterMonth(index, month.month)) {
                    return Err(SaveSimulationRunError::Database(
                        "Échec injecté pendant l’insertion des mois de simulation.".into(),
                    ));
                }
            }
        }
    }

    // Vérification append-only : cohérence salariés + mois avant commit.
    let inserted_employees: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM compensation_simulation_employee_results WHERE simulation_run_id = ?1",
    )
    .bind(simulation_run_id)
    .fetch_one(&mut **tx)
    .await?;
    if inserted_employees != input.employee_count {
        return Err(SaveSimulationRunError::Database(
            "Le nombre de salariés insérés ne correspond pas à la simulation.".into(),
        ));
    }

    let inserted_months: i64 = sqlx::query_scalar(
        r#"
        SELECT COUNT(*)
        FROM compensation_simulation_employee_month_results m
        JOIN compensation_simulation_employee_results e ON e.id = m.employee_result_id
        WHERE e.simulation_run_id = ?1
        "#,
    )
    .bind(simulation_run_id)
    .fetch_one(&mut **tx)
    .await?;
    if inserted_months != total_month_count {
        return Err(SaveSimulationRunError::Database(
            "Le nombre de mois insérés est incohérent.".into(),
        ));
    }
    if total_month_count != 0 && total_month_count != input.employee_count * 12 {
        return Err(SaveSimulationRunError::Database(
            "La trajectoire mensuelle persistée n’est pas complète (12 mois par salarié).".into(),
        ));
    }

    Ok(SaveSimulationRunResult {
        simulation_run_id,
        run_number,
        created_at,
        employee_count: input.employee_count,
    })
}

/// Commande Tauri : transaction SQLx réelle, chemin résolu côté Rust uniquement.
#[tauri::command]
pub async fn save_simulation_run(
    app: AppHandle,
    input: SaveSimulationRunInput,
) -> Result<SaveSimulationRunResult, String> {
    let path = resolve_app_database_path(&app).map_err(|error| error.user_message())?;
    let url = sqlite_url_from_path(&path).map_err(|error| error.user_message())?;

    match save_simulation_run_on_url(&url, &input, None).await {
        Ok(result) => Ok(result),
        Err(error) => {
            if cfg!(debug_assertions) {
                let detail = match &error {
                    SaveSimulationRunError::Validation(_) => "validation",
                    SaveSimulationRunError::Database(message) => {
                        let _ = message.len();
                        "database"
                    }
                };
                eprintln!(
                    "[SIMULATION_SAVE_FAILED] code={} kind={}",
                    error.technical_code(),
                    detail
                );
            }
            Err(error.user_message())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
    use sqlx::{ConnectOptions, SqlitePool};
    use std::str::FromStr;

    const MINIMAL_SCHEMA: &str = r#"
        PRAGMA foreign_keys = ON;

        CREATE TABLE campaigns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            reference_year INTEGER NOT NULL,
            status TEXT NOT NULL,
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            archived_at TEXT
        );

        CREATE TABLE hr_import_batches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
            status TEXT NOT NULL CHECK (status IN ('current', 'superseded')),
            source_file_name TEXT NOT NULL CHECK (length(trim(source_file_name)) > 0),
            source_format TEXT NOT NULL CHECK (source_format IN ('xlsx', 'xls', 'csv')),
            source_sheet_name TEXT NULL,
            file_size_bytes INTEGER NOT NULL CHECK (file_size_bytes > 0),
            source_row_count INTEGER NOT NULL CHECK (source_row_count >= 0),
            imported_row_count INTEGER NOT NULL CHECK (imported_row_count > 0),
            warning_count INTEGER NOT NULL CHECK (warning_count >= 0),
            imported_at TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE UNIQUE INDEX ux_hr_import_batches_one_current
        ON hr_import_batches(campaign_id)
        WHERE status = 'current';
    "#;

    const SIMULATION_SCHEMA: &str = include_str!("../migrations/0005_campaign_simulations.sql");
    const SIMULATION_SCHEMA_V3: &str =
        include_str!("../migrations/0007_simulation_contract_v4_results.sql");

    async fn apply_sql(conn: &mut sqlx::SqliteConnection, sql: &str) {
        for statement in sql.split(';') {
            let trimmed = statement.trim();
            if !trimmed.is_empty() {
                sqlx::query(trimmed)
                    .execute(&mut *conn)
                    .await
                    .expect("schema statement");
            }
        }
    }

    async fn setup_temp_db() -> (tempfile::TempDir, String) {
        let dir = tempfile::tempdir().expect("temp dir");
        let db_path = dir.path().join("test-simulation.db");
        let url = format!("sqlite:{}", db_path.to_str().unwrap());

        {
            let options = SqliteConnectOptions::from_str(&url)
                .unwrap()
                .create_if_missing(true)
                .foreign_keys(true);
            let mut conn = options.connect().await.expect("create db");
            apply_sql(&mut conn, MINIMAL_SCHEMA).await;
            apply_sql(&mut conn, SIMULATION_SCHEMA).await;
            apply_sql(&mut conn, SIMULATION_SCHEMA_V3).await;
        }

        (dir, url)
    }

    async fn seed_campaign(pool: &SqlitePool, status: &str) -> i64 {
        let now = "2026-07-20T00:00:00.000Z";
        let campaign = sqlx::query(
            r#"
            INSERT INTO campaigns (name, reference_year, status, notes, created_at, updated_at, archived_at)
            VALUES ('Campagne Sim', 2026, ?1, '', ?2, ?2, NULL)
            "#,
        )
        .bind(status)
        .bind(now)
        .execute(pool)
        .await
        .expect("campaign");
        campaign.last_insert_rowid()
    }

    async fn seed_current_batch(pool: &SqlitePool, campaign_id: i64) -> i64 {
        let now = "2026-07-20T00:00:00.000Z";
        let batch = sqlx::query(
            r#"
            INSERT INTO hr_import_batches (
                campaign_id, status, source_file_name, source_format, source_sheet_name,
                file_size_bytes, source_row_count, imported_row_count, warning_count,
                imported_at, created_at
            ) VALUES (?1, 'current', 'pop.xlsx', 'xlsx', 'Population', 1000, 2, 2, 0, ?2, ?2)
            "#,
        )
        .bind(campaign_id)
        .bind(now)
        .execute(pool)
        .await
        .expect("batch");
        batch.last_insert_rowid()
    }

    fn sample_employee(employee_id: &str) -> SaveSimulationEmployeeDto {
        SaveSimulationEmployeeDto {
            employee_id: employee_id.into(),
            employee_display_name: Some(format!("Salarié {employee_id}")),
            family_code: "TECH".into(),
            family_label: Some("Technique".into()),
            grade_code: "GA".into(),
            grade_label: Some("Grade A".into()),
            salary_fcfa_text: "450000".into(),
            s0_fcfa_text: "400000".into(),
            salary_ratio_basis_points: 11_250,
            salary_position_code: "mid".into(),
            salary_position_label: "Milieu".into(),
            position_factor_milli: 1_000,
            evaluation_mode: "none".into(),
            performance_level: None,
            potential_level: None,
            evaluation_factor_numerator_text: "1".into(),
            evaluation_factor_denominator_text: "1".into(),
            theoretical_matrix_weight_numerator_text: "1".into(),
            theoretical_matrix_weight_denominator_text: "1".into(),
            effective_matrix_weight_numerator_text: "1".into(),
            effective_matrix_weight_denominator_text: "1".into(),
            allocation_weight_numerator_text: "1".into(),
            allocation_weight_denominator_text: "2".into(),
            blocking_reason: None,
            theoretical_increase_rate_numerator_text: "3".into(),
            theoretical_increase_rate_denominator_text: "100".into(),
            theoretical_increase_amount_numerator_text: "13500".into(),
            theoretical_increase_amount_denominator_text: "1".into(),
            final_rounded_increase_fcfa_text: "13500".into(),
            individual_rounding_delta_numerator_text: "0".into(),
            individual_rounding_delta_denominator_text: "1".into(),
            final_salary_fcfa_text: "463500".into(),
            explanation_steps_json: "[]".into(),
            ..Default::default()
        }
    }

    fn sample_input(campaign_id: i64, batch_id: Option<i64>) -> SaveSimulationRunInput {
        let employees = vec![sample_employee("EMP-0001"), sample_employee("EMP-0002")];
        SaveSimulationRunInput {
            campaign_id,
            expected_campaign_status: "draft".into(),
            expected_current_import_batch_id: batch_id,
            campaign_name: "Campagne Sim".into(),
            campaign_year: 2026,
            campaign_status_at_run: "draft".into(),
            evaluation_mode: "none".into(),
            source_import_batch_id: batch_id,
            source_import_file_name: batch_id.map(|_| "pop.xlsx".into()),
            source_fingerprint: "src-fp-1".into(),
            configuration_fingerprint: "cfg-fp-1".into(),
            budget_target_mode: "manual_amount".into(),
            manual_budget_fcfa_text: Some("30000".into()),
            eligible_payroll_fcfa_text: None,
            budget_rate_basis_points: None,
            budget_target_numerator_text: "30000".into(),
            budget_target_denominator_text: "1".into(),
            rounding_mode: "nearest_half_up".into(),
            rounding_step_fcfa_text: "500".into(),
            employee_count: 2,
            positive_weight_employee_count: 2,
            zero_weight_employee_count: 0,
            confirmed_underperformer_count: 0,
            theoretical_total_numerator_text: "27000".into(),
            theoretical_total_denominator_text: "1".into(),
            actual_operation_amount_fcfa_text: "27000".into(),
            total_rounding_delta_numerator_text: "0".into(),
            total_rounding_delta_denominator_text: "1".into(),
            employees,
            ..Default::default()
        }
    }

    fn sample_month(month: i64) -> SaveSimulationEmployeeMonthDto {
        SaveSimulationEmployeeMonthDto {
            month,
            base_salary_fcfa_text: "450000".into(),
            grade_code: "GA".into(),
            job_family_code: "TECH".into(),
            salary_position_label: Some("Milieu".into()),
            target_compensatory_rate_numerator_text: "3".into(),
            target_compensatory_rate_denominator_text: "100".into(),
            promotion_rate_offset_numerator_text: "0".into(),
            promotion_rate_offset_denominator_text: "1".into(),
            compensatory_complement_rate_numerator_text: "3".into(),
            compensatory_complement_rate_denominator_text: "100".into(),
            theoretical_compensatory_complement_numerator_text: "13500".into(),
            theoretical_compensatory_complement_denominator_text: "1".into(),
            rounded_compensatory_complement_fcfa_text: "13500".into(),
            promotion_budget_cost_fcfa_text: "0".into(),
            final_salary_fcfa_text: "463500".into(),
            seniority_rate_percent: 0,
            promotion_seniority_impact_fcfa_text: "0".into(),
            compensatory_seniority_impact_fcfa_text: "0".into(),
            total_seniority_impact_fcfa_text: "0".into(),
            payment_timing: "direct".into(),
            promotion_payment_timing: "not_applicable".into(),
            covered_by_campaign_period: true,
            included_in_campaign_envelope: true,
            promotion_active: false,
            promotion_status: "none".into(),
            is_minimum_increase_population_employee: true,
            guaranteed_total_increase_numerator_text: "0".into(),
            guaranteed_total_increase_denominator_text: "1".into(),
            applicable_promotion_increment_fcfa_text: "0".into(),
            required_minimum_complement_numerator_text: "0".into(),
            required_minimum_complement_denominator_text: "1".into(),
            minimum_complement_floor_fcfa_text: "0".into(),
            weighted_complement_numerator_text: "13500".into(),
            weighted_complement_denominator_text: "1".into(),
            theoretical_complement_numerator_text: "13500".into(),
            theoretical_complement_denominator_text: "1".into(),
            actual_complement_above_minimum_fcfa_text: "13500".into(),
        }
    }

    fn sample_employee_with_months(employee_id: &str) -> SaveSimulationEmployeeDto {
        let mut employee = sample_employee(employee_id);
        employee.months = Some((1..=12).map(sample_month).collect());
        employee
    }

    fn sample_input_with_months(campaign_id: i64, batch_id: Option<i64>) -> SaveSimulationRunInput {
        let mut input = sample_input(campaign_id, batch_id);
        input.result_schema_version = Some(3);
        input.retroactivity_start_month = Some(1);
        input.technical_application_month = Some(1);
        input.campaign_covered_month_count = Some(12);
        input.calculation_contract_version = Some(4);
        input.minimum_increase_mode = Some("none".into());
        input.employees = vec![
            sample_employee_with_months("EMP-0001"),
            sample_employee_with_months("EMP-0002"),
        ];
        input
    }

    async fn count_runs(pool: &SqlitePool, campaign_id: i64) -> i64 {
        sqlx::query_scalar(
            "SELECT COUNT(*) FROM compensation_simulation_runs WHERE campaign_id = ?1",
        )
        .bind(campaign_id)
        .fetch_one(pool)
        .await
        .unwrap()
    }

    async fn count_employees(pool: &SqlitePool, run_id: i64) -> i64 {
        sqlx::query_scalar(
            "SELECT COUNT(*) FROM compensation_simulation_employee_results WHERE simulation_run_id = ?1",
        )
        .bind(run_id)
        .fetch_one(pool)
        .await
        .unwrap()
    }

    async fn count_batches(pool: &SqlitePool, campaign_id: i64) -> i64 {
        sqlx::query_scalar("SELECT COUNT(*) FROM hr_import_batches WHERE campaign_id = ?1")
            .bind(campaign_id)
            .fetch_one(pool)
            .await
            .unwrap()
    }

    #[test]
    fn canonical_integer_text_accepts_valid_forms() {
        assert!(is_canonical_integer_text("0", false));
        assert!(is_canonical_integer_text("25000003", false));
        assert!(is_canonical_integer_text("-3", true));
        assert!(is_canonical_integer_text("1", false));
    }

    #[test]
    fn canonical_integer_text_rejects_invalid_forms() {
        assert!(!is_canonical_integer_text("-0", true));
        assert!(!is_canonical_integer_text("01", false));
        assert!(!is_canonical_integer_text("-3", false));
        assert!(!is_canonical_integer_text("", false));
        assert!(!is_canonical_integer_text("1.5", false));
        assert!(!is_positive_canonical_denominator("0"));
        assert!(!is_positive_canonical_denominator("-1"));
    }

    #[tokio::test]
    async fn first_save_assigns_run_number_one() {
        let (_dir, url) = setup_temp_db().await;
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .unwrap();
        let campaign_id = seed_campaign(&pool, "draft").await;
        let batch_id = seed_current_batch(&pool, campaign_id).await;
        pool.close().await;

        let input = sample_input(campaign_id, Some(batch_id));
        let result = save_simulation_run_on_url(&url, &input, None)
            .await
            .expect("first save");
        assert_eq!(result.run_number, 1);
        assert_eq!(result.employee_count, 2);

        let pool = SqlitePool::connect(&url).await.unwrap();
        assert_eq!(count_runs(&pool, campaign_id).await, 1);
        assert_eq!(count_employees(&pool, result.simulation_run_id).await, 2);
        pool.close().await;
    }

    #[tokio::test]
    async fn second_save_assigns_run_number_two() {
        let (_dir, url) = setup_temp_db().await;
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .unwrap();
        let campaign_id = seed_campaign(&pool, "draft").await;
        let batch_id = seed_current_batch(&pool, campaign_id).await;
        pool.close().await;

        let input = sample_input(campaign_id, Some(batch_id));
        let first = save_simulation_run_on_url(&url, &input, None)
            .await
            .expect("first");
        let second = save_simulation_run_on_url(&url, &input, None)
            .await
            .expect("second");
        assert_eq!(first.run_number, 1);
        assert_eq!(second.run_number, 2);

        let pool = SqlitePool::connect(&url).await.unwrap();
        assert_eq!(count_runs(&pool, campaign_id).await, 2);
        pool.close().await;
    }

    #[tokio::test]
    async fn two_campaigns_have_independent_run_sequences() {
        let (_dir, url) = setup_temp_db().await;
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .unwrap();
        let campaign_a = seed_campaign(&pool, "draft").await;
        let campaign_b = seed_campaign(&pool, "draft").await;
        let batch_a = seed_current_batch(&pool, campaign_a).await;
        let batch_b = seed_current_batch(&pool, campaign_b).await;
        pool.close().await;

        let result_a =
            save_simulation_run_on_url(&url, &sample_input(campaign_a, Some(batch_a)), None)
                .await
                .expect("a");
        let result_b =
            save_simulation_run_on_url(&url, &sample_input(campaign_b, Some(batch_b)), None)
                .await
                .expect("b");
        assert_eq!(result_a.run_number, 1);
        assert_eq!(result_b.run_number, 1);
    }

    #[tokio::test]
    async fn missing_campaign_inserts_nothing() {
        let (_dir, url) = setup_temp_db().await;
        let input = sample_input(999_999, None);
        let err = save_simulation_run_on_url(&url, &input, None)
            .await
            .expect_err("missing");
        assert!(matches!(err, SaveSimulationRunError::Validation(_)));

        let pool = SqlitePool::connect(&url).await.unwrap();
        let total: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM compensation_simulation_runs")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(total, 0);
        pool.close().await;
    }

    #[tokio::test]
    async fn archived_campaign_blocks_save() {
        let (_dir, url) = setup_temp_db().await;
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .unwrap();
        let campaign_id = seed_campaign(&pool, "archived").await;
        pool.close().await;

        let mut input = sample_input(campaign_id, None);
        input.expected_campaign_status = "draft".into();
        let err = save_simulation_run_on_url(&url, &input, None)
            .await
            .expect_err("archived");
        assert!(matches!(err, SaveSimulationRunError::Validation(_)));

        let pool = SqlitePool::connect(&url).await.unwrap();
        assert_eq!(count_runs(&pool, campaign_id).await, 0);
        pool.close().await;
    }

    #[tokio::test]
    async fn wrong_current_batch_blocks_save() {
        let (_dir, url) = setup_temp_db().await;
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .unwrap();
        let campaign_id = seed_campaign(&pool, "draft").await;
        let batch_id = seed_current_batch(&pool, campaign_id).await;
        pool.close().await;

        let input = sample_input(campaign_id, Some(batch_id + 1));
        let err = save_simulation_run_on_url(&url, &input, None)
            .await
            .expect_err("wrong batch");
        assert!(matches!(err, SaveSimulationRunError::Validation(_)));

        let pool = SqlitePool::connect(&url).await.unwrap();
        assert_eq!(count_runs(&pool, campaign_id).await, 0);
        pool.close().await;
    }

    #[tokio::test]
    async fn duplicate_employee_id_rolls_back() {
        let (_dir, url) = setup_temp_db().await;
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .unwrap();
        let campaign_id = seed_campaign(&pool, "draft").await;
        let batch_id = seed_current_batch(&pool, campaign_id).await;
        pool.close().await;

        let mut input = sample_input(campaign_id, Some(batch_id));
        input.employees[1].employee_id = "EMP-0001".into();
        let err = save_simulation_run_on_url(&url, &input, None)
            .await
            .expect_err("duplicate");
        assert!(matches!(err, SaveSimulationRunError::Validation(_)));

        let pool = SqlitePool::connect(&url).await.unwrap();
        assert_eq!(count_runs(&pool, campaign_id).await, 0);
        pool.close().await;
    }

    #[tokio::test]
    async fn wrong_employee_count_rolls_back() {
        let (_dir, url) = setup_temp_db().await;
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .unwrap();
        let campaign_id = seed_campaign(&pool, "draft").await;
        let batch_id = seed_current_batch(&pool, campaign_id).await;
        pool.close().await;

        let mut input = sample_input(campaign_id, Some(batch_id));
        input.employee_count = 3;
        let err = save_simulation_run_on_url(&url, &input, None)
            .await
            .expect_err("count");
        assert!(matches!(err, SaveSimulationRunError::Validation(_)));

        let pool = SqlitePool::connect(&url).await.unwrap();
        assert_eq!(count_runs(&pool, campaign_id).await, 0);
        pool.close().await;
    }

    #[tokio::test]
    async fn zero_denominator_rolls_back() {
        let (_dir, url) = setup_temp_db().await;
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .unwrap();
        let campaign_id = seed_campaign(&pool, "draft").await;
        let batch_id = seed_current_batch(&pool, campaign_id).await;
        pool.close().await;

        let mut input = sample_input(campaign_id, Some(batch_id));
        input.budget_target_denominator_text = "0".into();
        let err = save_simulation_run_on_url(&url, &input, None)
            .await
            .expect_err("zero den");
        assert!(matches!(err, SaveSimulationRunError::Validation(_)));

        let pool = SqlitePool::connect(&url).await.unwrap();
        assert_eq!(count_runs(&pool, campaign_id).await, 0);
        pool.close().await;
    }

    #[tokio::test]
    async fn non_canonical_number_rolls_back() {
        let (_dir, url) = setup_temp_db().await;
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .unwrap();
        let campaign_id = seed_campaign(&pool, "draft").await;
        let batch_id = seed_current_batch(&pool, campaign_id).await;
        pool.close().await;

        let mut input = sample_input(campaign_id, Some(batch_id));
        input.actual_operation_amount_fcfa_text = "027000".into();
        let err = save_simulation_run_on_url(&url, &input, None)
            .await
            .expect_err("non canonical");
        assert!(matches!(err, SaveSimulationRunError::Validation(_)));

        let pool = SqlitePool::connect(&url).await.unwrap();
        assert_eq!(count_runs(&pool, campaign_id).await, 0);
        pool.close().await;
    }

    #[tokio::test]
    async fn fault_after_run_insert_rolls_back_completely() {
        let (_dir, url) = setup_temp_db().await;
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .unwrap();
        let campaign_id = seed_campaign(&pool, "draft").await;
        let batch_id = seed_current_batch(&pool, campaign_id).await;
        pool.close().await;

        let input = sample_input(campaign_id, Some(batch_id));
        let err = save_simulation_run_on_url(&url, &input, Some(InjectedFault::AfterRunInsert))
            .await
            .expect_err("fault");
        assert!(matches!(err, SaveSimulationRunError::Database(_)));

        let pool = SqlitePool::connect(&url).await.unwrap();
        assert_eq!(count_runs(&pool, campaign_id).await, 0);
        let employees: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM compensation_simulation_employee_results")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(employees, 0);
        pool.close().await;
    }

    #[tokio::test]
    async fn fault_after_partial_employees_rolls_back_completely() {
        let (_dir, url) = setup_temp_db().await;
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .unwrap();
        let campaign_id = seed_campaign(&pool, "draft").await;
        let batch_id = seed_current_batch(&pool, campaign_id).await;
        pool.close().await;

        let input = sample_input(campaign_id, Some(batch_id));
        let err =
            save_simulation_run_on_url(&url, &input, Some(InjectedFault::AfterEmployeeIndex(0)))
                .await
                .expect_err("partial");
        assert!(matches!(err, SaveSimulationRunError::Database(_)));

        let pool = SqlitePool::connect(&url).await.unwrap();
        assert_eq!(count_runs(&pool, campaign_id).await, 0);
        let employees: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM compensation_simulation_employee_results")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(employees, 0);
        pool.close().await;
    }

    #[tokio::test]
    async fn inserted_employee_count_matches_before_commit() {
        let (_dir, url) = setup_temp_db().await;
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .unwrap();
        let campaign_id = seed_campaign(&pool, "draft").await;
        let batch_id = seed_current_batch(&pool, campaign_id).await;
        pool.close().await;

        let input = sample_input(campaign_id, Some(batch_id));
        let result = save_simulation_run_on_url(&url, &input, None)
            .await
            .expect("save");
        assert_eq!(result.employee_count, 2);

        let pool = SqlitePool::connect(&url).await.unwrap();
        assert_eq!(count_employees(&pool, result.simulation_run_id).await, 2);
        pool.close().await;
    }

    #[tokio::test]
    async fn connection_closed_allows_immediate_second_write() {
        let (_dir, url) = setup_temp_db().await;
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .unwrap();
        let campaign_id = seed_campaign(&pool, "draft").await;
        let batch_id = seed_current_batch(&pool, campaign_id).await;
        pool.close().await;

        let input = sample_input(campaign_id, Some(batch_id));
        save_simulation_run_on_url(&url, &input, None)
            .await
            .expect("first");
        let second = save_simulation_run_on_url(&url, &input, None)
            .await
            .expect("immediate second");
        assert_eq!(second.run_number, 2);
    }

    #[tokio::test]
    async fn hr_import_batches_count_unchanged_after_save() {
        let (_dir, url) = setup_temp_db().await;
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .unwrap();
        let campaign_id = seed_campaign(&pool, "draft").await;
        let batch_id = seed_current_batch(&pool, campaign_id).await;
        let before = count_batches(&pool, campaign_id).await;
        pool.close().await;

        let input = sample_input(campaign_id, Some(batch_id));
        save_simulation_run_on_url(&url, &input, None)
            .await
            .expect("save");

        let pool = SqlitePool::connect(&url).await.unwrap();
        assert_eq!(count_batches(&pool, campaign_id).await, before);
        assert_eq!(before, 1);
        pool.close().await;
    }

    async fn count_months_for_run(pool: &SqlitePool, run_id: i64) -> i64 {
        sqlx::query_scalar(
            r#"
            SELECT COUNT(*)
            FROM compensation_simulation_employee_month_results m
            JOIN compensation_simulation_employee_results e ON e.id = m.employee_result_id
            WHERE e.simulation_run_id = ?1
            "#,
        )
        .bind(run_id)
        .fetch_one(pool)
        .await
        .unwrap()
    }

    #[tokio::test]
    async fn save_persists_schema_v3_and_twelve_months_per_employee() {
        let (_dir, url) = setup_temp_db().await;
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .unwrap();
        let campaign_id = seed_campaign(&pool, "draft").await;
        let batch_id = seed_current_batch(&pool, campaign_id).await;
        pool.close().await;

        let input = sample_input_with_months(campaign_id, Some(batch_id));
        let result = save_simulation_run_on_url(&url, &input, None)
            .await
            .expect("save v3");

        let pool = SqlitePool::connect(&url).await.unwrap();
        let schema: i64 = sqlx::query_scalar(
            "SELECT result_schema_version FROM compensation_simulation_runs WHERE id = ?1",
        )
        .bind(result.simulation_run_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(schema, 3);
        let contract: i64 = sqlx::query_scalar(
            "SELECT calculation_contract_version FROM compensation_simulation_runs WHERE id = ?1",
        )
        .bind(result.simulation_run_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(contract, 4);
        assert_eq!(count_employees(&pool, result.simulation_run_id).await, 2);
        assert_eq!(
            count_months_for_run(&pool, result.simulation_run_id).await,
            24
        );
        pool.close().await;
    }

    #[tokio::test]
    async fn partial_month_trajectory_is_rejected() {
        let (_dir, url) = setup_temp_db().await;
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .unwrap();
        let campaign_id = seed_campaign(&pool, "draft").await;
        let batch_id = seed_current_batch(&pool, campaign_id).await;
        pool.close().await;

        let mut input = sample_input_with_months(campaign_id, Some(batch_id));
        input.employees[0].months = Some((1..=11).map(sample_month).collect());
        let err = save_simulation_run_on_url(&url, &input, None)
            .await
            .expect_err("partial months");
        assert!(matches!(err, SaveSimulationRunError::Validation(_)));

        let pool = SqlitePool::connect(&url).await.unwrap();
        assert_eq!(count_runs(&pool, campaign_id).await, 0);
        pool.close().await;
    }

    #[tokio::test]
    async fn invalid_month_range_is_rejected() {
        let (_dir, url) = setup_temp_db().await;
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .unwrap();
        let campaign_id = seed_campaign(&pool, "draft").await;
        let batch_id = seed_current_batch(&pool, campaign_id).await;
        pool.close().await;

        let mut input = sample_input_with_months(campaign_id, Some(batch_id));
        input.employees[0].months.as_mut().unwrap()[0].month = 13;
        let err = save_simulation_run_on_url(&url, &input, None)
            .await
            .expect_err("month range");
        assert!(matches!(err, SaveSimulationRunError::Validation(_)));

        let pool = SqlitePool::connect(&url).await.unwrap();
        assert_eq!(count_runs(&pool, campaign_id).await, 0);
        pool.close().await;
    }

    #[tokio::test]
    async fn months_all_or_nothing_across_employees() {
        let (_dir, url) = setup_temp_db().await;
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .unwrap();
        let campaign_id = seed_campaign(&pool, "draft").await;
        let batch_id = seed_current_batch(&pool, campaign_id).await;
        pool.close().await;

        let mut input = sample_input_with_months(campaign_id, Some(batch_id));
        input.employees[1].months = None;
        let err = save_simulation_run_on_url(&url, &input, None)
            .await
            .expect_err("all or nothing");
        assert!(matches!(err, SaveSimulationRunError::Validation(_)));

        let pool = SqlitePool::connect(&url).await.unwrap();
        assert_eq!(count_runs(&pool, campaign_id).await, 0);
        pool.close().await;
    }

    #[tokio::test]
    async fn fault_after_month_rolls_back_completely() {
        let (_dir, url) = setup_temp_db().await;
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .unwrap();
        let campaign_id = seed_campaign(&pool, "draft").await;
        let batch_id = seed_current_batch(&pool, campaign_id).await;
        pool.close().await;

        let input = sample_input_with_months(campaign_id, Some(batch_id));
        let err = save_simulation_run_on_url(&url, &input, Some(InjectedFault::AfterMonth(0, 6)))
            .await
            .expect_err("month fault");
        assert!(matches!(err, SaveSimulationRunError::Database(_)));

        let pool = SqlitePool::connect(&url).await.unwrap();
        assert_eq!(count_runs(&pool, campaign_id).await, 0);
        let months: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM compensation_simulation_employee_month_results",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(months, 0);
        pool.close().await;
    }
}
