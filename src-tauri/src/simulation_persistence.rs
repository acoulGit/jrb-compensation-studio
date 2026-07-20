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
}

#[derive(Debug, Clone, Deserialize)]
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
}

#[derive(Debug, Clone, Deserialize)]
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
            ?1, ?2, 1,
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

    if fault == Some(InjectedFault::AfterRunInsert) {
        return Err(SaveSimulationRunError::Database(
            "Échec injecté après insertion de la simulation.".into(),
        ));
    }

    for (index, employee) in input.employees.iter().enumerate() {
        sqlx::query(
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

        if fault == Some(InjectedFault::AfterEmployeeIndex(index)) {
            return Err(SaveSimulationRunError::Database(
                "Échec injecté pendant l’insertion des salariés de simulation.".into(),
            ));
        }
    }

    let inserted_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM compensation_simulation_employee_results WHERE simulation_run_id = ?1",
    )
    .bind(simulation_run_id)
    .fetch_one(&mut **tx)
    .await?;
    if inserted_count != input.employee_count {
        return Err(SaveSimulationRunError::Database(
            "Le nombre de salariés insérés ne correspond pas à la simulation.".into(),
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
        }
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
}
