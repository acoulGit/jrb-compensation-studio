//! Tests d’intégration de l’export Excel RH (Lot 2B-E1).
//!
//! Réutilise le motif de `simulation_persistence` : base SQLite temporaire
//! (MINIMAL_SCHEMA + organization_profile + 0005 + 0007), remplie via
//! `save_simulation_run_on_url`. Les helpers d’échantillon sont dupliqués ici
//! volontairement (pas de refactor de la persistance).

use std::io::Read;
use std::path::Path;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{ConnectOptions, SqlitePool};
use std::str::FromStr;

use super::*;
use crate::simulation_persistence::{
    save_simulation_run_on_url, SaveSimulationEmployeeDto, SaveSimulationEmployeeMonthDto,
    SaveSimulationRunInput,
};

// ---------------------------------------------------------------------------
// Schéma de test
// ---------------------------------------------------------------------------

const MINIMAL_SCHEMA: &str = r#"
    PRAGMA foreign_keys = ON;

    CREATE TABLE organization_profile (
        id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
        product_name TEXT NOT NULL,
        organization_name TEXT NOT NULL,
        organization_short_name TEXT NOT NULL,
        application_subtitle TEXT NOT NULL,
        report_footer TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );

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

const ORG_SEED: &str = r#"
    INSERT INTO organization_profile (
        id, product_name, organization_name, organization_short_name,
        application_subtitle, report_footer, created_at, updated_at
    ) VALUES (
        1, 'JRB Compensation Studio', 'ACME SA', 'ACME',
        'Simulation et pilotage', 'Document confidentiel',
        '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
    );
"#;

const SIMULATION_SCHEMA: &str = include_str!("../../migrations/0005_campaign_simulations.sql");
const SIMULATION_SCHEMA_V3: &str =
    include_str!("../../migrations/0007_simulation_contract_v4_results.sql");

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
    let db_path = dir.path().join("test-export.db");
    let url = format!("sqlite:{}", db_path.to_str().unwrap());

    {
        let options = SqliteConnectOptions::from_str(&url)
            .unwrap()
            .create_if_missing(true)
            .foreign_keys(true);
        let mut conn = options.connect().await.expect("create db");
        apply_sql(&mut conn, MINIMAL_SCHEMA).await;
        apply_sql(&mut conn, ORG_SEED).await;
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
        VALUES ('Campagne RH 2026', 2026, ?1, '', ?2, ?2, NULL)
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

// ---------------------------------------------------------------------------
// Échantillons (dupliqués depuis simulation_persistence)
// ---------------------------------------------------------------------------

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

fn base_input(campaign_id: i64, batch_id: Option<i64>) -> SaveSimulationRunInput {
    SaveSimulationRunInput {
        campaign_id,
        expected_campaign_status: "draft".into(),
        expected_current_import_batch_id: batch_id,
        campaign_name: "Campagne RH 2026".into(),
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
        employees: vec![sample_employee("EMP-0001"), sample_employee("EMP-0002")],
        ..Default::default()
    }
}

fn input_with_months(campaign_id: i64, batch_id: Option<i64>) -> SaveSimulationRunInput {
    let mut input = base_input(campaign_id, batch_id);
    input.result_schema_version = Some(3);
    input.retroactivity_start_month = Some(1);
    input.technical_application_month = Some(1);
    input.campaign_covered_month_count = Some(12);
    input.calculation_contract_version = Some(4);
    input.seniority_impact_contract_version = Some(1);
    input.minimum_increase_contract_version = Some(1);
    input.minimum_increase_mode = Some("none".into());
    input.employees = vec![
        sample_employee_with_months("EMP-0001"),
        sample_employee_with_months("EMP-0002"),
    ];
    input
}

/// Base + campagne draft + lot courant + run v3 avec 12 mois. Renvoie l’id run.
async fn setup_with_run() -> (tempfile::TempDir, String, i64) {
    let (dir, url) = setup_temp_db().await;
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await
        .unwrap();
    let campaign_id = seed_campaign(&pool, "draft").await;
    let batch_id = seed_current_batch(&pool, campaign_id).await;
    pool.close().await;

    let input = input_with_months(campaign_id, Some(batch_id));
    let saved = save_simulation_run_on_url(&url, &input, None)
        .await
        .expect("save run");
    (dir, url, saved.simulation_run_id)
}

async fn seed_raw_run(url: &str, campaign_id: i64, schema_version: i64) -> i64 {
    let pool = SqlitePool::connect(url).await.unwrap();
    let result = sqlx::query(
        r#"
        INSERT INTO compensation_simulation_runs (
            campaign_id, run_number, result_schema_version,
            campaign_name, campaign_year, campaign_status_at_run, evaluation_mode,
            source_fingerprint, configuration_fingerprint,
            budget_target_mode, budget_target_numerator_text, budget_target_denominator_text,
            rounding_mode, rounding_step_fcfa_text,
            employee_count, positive_weight_employee_count, zero_weight_employee_count,
            confirmed_underperformer_count,
            theoretical_total_numerator_text, theoretical_total_denominator_text,
            actual_operation_amount_fcfa_text,
            total_rounding_delta_numerator_text, total_rounding_delta_denominator_text,
            created_at
        ) VALUES (
            ?1, 1, ?2,
            'Campagne RH 2026', 2026, 'draft', 'none',
            'src-fp', 'cfg-fp',
            'manual_amount', '30000', '1',
            'nearest_half_up', '500',
            0, 0, 0, 0,
            '0', '1', '0', '0', '1',
            '2026-07-20T00:00:00.000Z'
        )
        "#,
    )
    .bind(campaign_id)
    .bind(schema_version)
    .execute(&pool)
    .await
    .expect("raw run");
    let id = result.last_insert_rowid();
    pool.close().await;
    id
}

fn export_input(
    run_id: i64,
    output_path: &str,
    password: Option<&str>,
    confirm: bool,
) -> ExportSimulationRunExcelInput {
    ExportSimulationRunExcelInput {
        simulation_run_id: run_id,
        output_path: output_path.into(),
        password: password.map(str::to_string),
        confirm_unprotected_export: confirm,
    }
}

fn out_path(dir: &tempfile::TempDir, name: &str) -> String {
    dir.path().join(name).to_str().unwrap().to_string()
}

// ---------------------------------------------------------------------------
// Lecture OOXML (via crate zip, dev-dependency)
// ---------------------------------------------------------------------------

fn read_all_xml(bytes: &[u8]) -> String {
    let reader = std::io::Cursor::new(bytes.to_vec());
    let mut archive = zip::ZipArchive::new(reader).expect("archive zip");
    let mut out = String::new();
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).expect("entrée zip");
        if file.name().ends_with(".xml") {
            let mut buf = Vec::new();
            file.read_to_end(&mut buf).expect("lecture entrée");
            out.push_str(&String::from_utf8_lossy(&buf));
            out.push('\n');
        }
    }
    out
}

fn read_entry(bytes: &[u8], name: &str) -> String {
    let reader = std::io::Cursor::new(bytes.to_vec());
    let mut archive = zip::ZipArchive::new(reader).expect("archive zip");
    let mut file = archive.by_name(name).expect("entrée nommée");
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).expect("lecture entrée");
    String::from_utf8_lossy(&buf).into_owned()
}

fn sheet_names(bytes: &[u8]) -> Vec<String> {
    let workbook = read_entry(bytes, "xl/workbook.xml");
    let mut names = Vec::new();
    for part in workbook.split("<sheet ").skip(1) {
        if let Some(idx) = part.find("name=\"") {
            let rest = &part[idx + 6..];
            if let Some(end) = rest.find('"') {
                names.push(rest[..end].to_string());
            }
        }
    }
    names
}

fn temp_files_present(dir: &tempfile::TempDir) -> bool {
    std::fs::read_dir(dir.path())
        .unwrap()
        .filter_map(|e| e.ok())
        .any(|e| e.file_name().to_string_lossy().starts_with(".jrb-export-"))
}

// ===========================================================================
// Tests — validation d’entrée
// ===========================================================================

#[tokio::test]
async fn password_too_short_is_rejected() {
    let (dir, url, run_id) = setup_with_run().await;
    let input = export_input(run_id, &out_path(&dir, "e.xlsx"), Some("court"), false);
    let err = export_simulation_run_excel_on_url(&url, &input)
        .await
        .expect_err("trop court");
    assert!(matches!(err, ExportError::PasswordTooShort));
}

#[tokio::test]
async fn unprotected_without_confirmation_is_rejected() {
    let (dir, url, run_id) = setup_with_run().await;
    let input = export_input(run_id, &out_path(&dir, "e.xlsx"), None, false);
    let err = export_simulation_run_excel_on_url(&url, &input)
        .await
        .expect_err("sans confirmation");
    assert!(matches!(err, ExportError::UnprotectedConfirmationRequired));
}

#[tokio::test]
async fn relative_path_is_rejected() {
    let (_dir, url, run_id) = setup_with_run().await;
    let input = export_input(run_id, "relatif/export.xlsx", None, true);
    let err = export_simulation_run_excel_on_url(&url, &input)
        .await
        .expect_err("chemin relatif");
    assert!(matches!(err, ExportError::DestinationInvalid));
}

#[tokio::test]
async fn non_xlsx_extension_is_rejected() {
    let (dir, url, run_id) = setup_with_run().await;
    let input = export_input(run_id, &out_path(&dir, "export.csv"), None, true);
    let err = export_simulation_run_excel_on_url(&url, &input)
        .await
        .expect_err("mauvaise extension");
    assert!(matches!(err, ExportError::DestinationInvalid));
}

#[tokio::test]
async fn existing_file_is_not_overwritten() {
    let (dir, url, run_id) = setup_with_run().await;
    let path = out_path(&dir, "export.xlsx");
    std::fs::write(&path, b"contenu original").unwrap();

    let input = export_input(run_id, &path, None, true);
    let err = export_simulation_run_excel_on_url(&url, &input)
        .await
        .expect_err("fichier existant");
    assert!(matches!(err, ExportError::DestinationAlreadyExists));

    let content = std::fs::read(&path).unwrap();
    assert_eq!(content, b"contenu original");
}

// ===========================================================================
// Tests — rejets de version
// ===========================================================================

#[tokio::test]
async fn missing_run_is_not_found() {
    let (dir, url) = setup_temp_db().await;
    let input = export_input(999_999, &out_path(&dir, "e.xlsx"), None, true);
    let err = export_simulation_run_excel_on_url(&url, &input)
        .await
        .expect_err("introuvable");
    assert!(matches!(err, ExportError::SnapshotNotFound));
    assert!(!temp_files_present(&dir));
}

#[tokio::test]
async fn schema_v2_v1_and_unknown_are_rejected() {
    for schema in [1_i64, 2, 99] {
        let (dir, url) = setup_temp_db().await;
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .unwrap();
        let campaign_id = seed_campaign(&pool, "draft").await;
        pool.close().await;

        let run_id = seed_raw_run(&url, campaign_id, schema).await;
        let input = export_input(run_id, &out_path(&dir, "e.xlsx"), None, true);
        let err = export_simulation_run_excel_on_url(&url, &input)
            .await
            .expect_err("schéma non supporté");
        assert!(
            matches!(err, ExportError::SchemaNotSupported),
            "schema {schema} devrait être rejeté"
        );
    }
}

#[tokio::test]
async fn wrong_contract_version_is_rejected() {
    let (dir, url, run_id) = setup_with_run().await;
    // Corrompt la version de contrat de calcul après coup.
    let pool = SqlitePool::connect(&url).await.unwrap();
    sqlx::query(
        "UPDATE compensation_simulation_runs SET calculation_contract_version = 5 WHERE id = ?1",
    )
    .bind(run_id)
    .execute(&pool)
    .await
    .unwrap();
    pool.close().await;

    let input = export_input(run_id, &out_path(&dir, "e.xlsx"), None, true);
    let err = export_simulation_run_excel_on_url(&url, &input)
        .await
        .expect_err("contrat non supporté");
    assert!(matches!(err, ExportError::ContractNotSupported));
}

#[tokio::test]
async fn missing_seniority_contract_is_rejected() {
    let (dir, url, run_id) = setup_with_run().await;
    let pool = SqlitePool::connect(&url).await.unwrap();
    sqlx::query("UPDATE compensation_simulation_runs SET seniority_impact_contract_version = NULL WHERE id = ?1")
        .bind(run_id)
        .execute(&pool)
        .await
        .unwrap();
    pool.close().await;

    let input = export_input(run_id, &out_path(&dir, "e.xlsx"), None, true);
    let err = export_simulation_run_excel_on_url(&url, &input)
        .await
        .expect_err("contrat ancienneté manquant");
    assert!(matches!(err, ExportError::ContractNotSupported));
}

// ===========================================================================
// Tests — complétude de la trajectoire
// ===========================================================================

#[tokio::test]
async fn missing_month_makes_count_invalid() {
    let (dir, url, run_id) = setup_with_run().await;
    // Supprime un mois d’un salarié : la trajectoire n’a plus 12 mois.
    let pool = SqlitePool::connect(&url).await.unwrap();
    sqlx::query(
        r#"
        DELETE FROM compensation_simulation_employee_month_results
        WHERE month = 6 AND employee_result_id IN (
            SELECT id FROM compensation_simulation_employee_results
            WHERE simulation_run_id = ?1
            ORDER BY employee_id LIMIT 1
        )
        "#,
    )
    .bind(run_id)
    .execute(&pool)
    .await
    .unwrap();
    pool.close().await;

    let input = export_input(run_id, &out_path(&dir, "e.xlsx"), None, true);
    let err = export_simulation_run_excel_on_url(&url, &input)
        .await
        .expect_err("mois manquant");
    assert!(matches!(err, ExportError::MonthCountInvalid));
}

#[tokio::test]
async fn run_without_trajectory_is_incomplete() {
    let (dir, url) = setup_temp_db().await;
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await
        .unwrap();
    let campaign_id = seed_campaign(&pool, "draft").await;
    let batch_id = seed_current_batch(&pool, campaign_id).await;
    pool.close().await;

    // Run v3 valide mais SANS trajectoire mensuelle.
    let mut input = base_input(campaign_id, Some(batch_id));
    input.result_schema_version = Some(3);
    input.calculation_contract_version = Some(4);
    input.seniority_impact_contract_version = Some(1);
    input.minimum_increase_contract_version = Some(1);
    let saved = save_simulation_run_on_url(&url, &input, None)
        .await
        .expect("save sans mois");

    let export = export_input(
        saved.simulation_run_id,
        &out_path(&dir, "e.xlsx"),
        None,
        true,
    );
    let err = export_simulation_run_excel_on_url(&url, &export)
        .await
        .expect_err("trajectoire absente");
    assert!(matches!(err, ExportError::SnapshotIncomplete(_)));
}

// ===========================================================================
// Tests — contenu du classeur (export non protégé)
// ===========================================================================

#[tokio::test]
async fn unprotected_export_is_valid_xlsx_with_five_sheets() {
    let (dir, url, run_id) = setup_with_run().await;
    let path = out_path(&dir, "export.xlsx");
    let input = export_input(run_id, &path, None, true);
    let result = export_simulation_run_excel_on_url(&url, &input)
        .await
        .expect("export non protégé");

    assert!(!result.protected);
    assert_eq!(result.employee_count, 2);
    assert_eq!(result.month_row_count, 24);
    assert_eq!(result.month_row_count, result.employee_count * 12);
    assert!(result.size_bytes > 0);
    assert_eq!(result.file_name, "export.xlsx");

    let bytes = std::fs::read(&path).unwrap();
    assert!(bytes.starts_with(b"PK"), "un XLSX clair commence par PK");

    let names = sheet_names(&bytes);
    assert_eq!(
        names,
        vec![
            "Tableau_de_bord_RH".to_string(),
            "Resultats_RH".to_string(),
            "Trajectoire_12_mois".to_string(),
            "Synthese_campagne".to_string(),
            "Parametres".to_string(),
        ]
    );

    assert!(!temp_files_present(&dir));
}

#[tokio::test]
async fn workbook_contains_french_months_bools_and_ids() {
    let (dir, url, run_id) = setup_with_run().await;
    let path = out_path(&dir, "export.xlsx");
    let input = export_input(run_id, &path, None, true);
    export_simulation_run_excel_on_url(&url, &input)
        .await
        .expect("export");

    let bytes = std::fs::read(&path).unwrap();
    let xml = read_all_xml(&bytes);

    // Mois français.
    assert!(xml.contains("Janvier"));
    assert!(xml.contains("Août"));
    assert!(xml.contains("Décembre"));
    // Booléens Oui/Non.
    assert!(xml.contains("Oui"));
    assert!(xml.contains("Non"));
    // Identifiants salariés.
    assert!(xml.contains("EMP-0001"));
    assert!(xml.contains("EMP-0002"));
}

#[tokio::test]
async fn null_optional_is_non_disponible_not_zero() {
    let (dir, url) = setup_temp_db().await;
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await
        .unwrap();
    let campaign_id = seed_campaign(&pool, "draft").await;
    let batch_id = seed_current_batch(&pool, campaign_id).await;
    pool.close().await;

    let mut input = input_with_months(campaign_id, Some(batch_id));
    // Force des optionnels NULL (jamais convertis en zéro).
    input.manual_budget_fcfa_text = None;
    input.eligible_payroll_fcfa_text = None;
    input.budget_target_mode = "percentage_of_eligible_payroll".into();
    let saved = save_simulation_run_on_url(&url, &input, None)
        .await
        .expect("save");

    let path = out_path(&dir, "export.xlsx");
    export_simulation_run_excel_on_url(
        &url,
        &export_input(saved.simulation_run_id, &path, None, true),
    )
    .await
    .expect("export");

    let bytes = std::fs::read(&path).unwrap();
    let xml = read_all_xml(&bytes);
    assert!(
        xml.contains("Non disponible"),
        "les optionnels NULL doivent afficher « Non disponible »"
    );
}

#[tokio::test]
async fn formula_injection_is_neutralized() {
    let (dir, url) = setup_temp_db().await;
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await
        .unwrap();
    let campaign_id = seed_campaign(&pool, "draft").await;
    let batch_id = seed_current_batch(&pool, campaign_id).await;
    pool.close().await;

    let mut input = input_with_months(campaign_id, Some(batch_id));
    input.employees[0].employee_display_name = Some("=cmd()".into());
    let saved = save_simulation_run_on_url(&url, &input, None)
        .await
        .expect("save");

    let path = out_path(&dir, "export.xlsx");
    export_simulation_run_excel_on_url(
        &url,
        &export_input(saved.simulation_run_id, &path, None, true),
    )
    .await
    .expect("export");

    let bytes = std::fs::read(&path).unwrap();
    let xml = read_all_xml(&bytes);
    assert!(
        xml.contains("'=cmd()"),
        "une cellule commençant par = doit être préfixée d’une apostrophe"
    );
}

#[tokio::test]
async fn unsafe_big_integer_is_written_as_text() {
    let (dir, url) = setup_temp_db().await;
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await
        .unwrap();
    let campaign_id = seed_campaign(&pool, "draft").await;
    let batch_id = seed_current_batch(&pool, campaign_id).await;
    pool.close().await;

    // 2^53 = 9007199254740992 : hors intervalle sûr des f64 -> écrit en texte.
    let mut input = input_with_months(campaign_id, Some(batch_id));
    input.employees[0].salary_fcfa_text = "9007199254740992".into();
    let saved = save_simulation_run_on_url(&url, &input, None)
        .await
        .expect("save");

    let path = out_path(&dir, "export.xlsx");
    export_simulation_run_excel_on_url(
        &url,
        &export_input(saved.simulation_run_id, &path, None, true),
    )
    .await
    .expect("export");

    let bytes = std::fs::read(&path).unwrap();
    // Une chaîne texte est stockée dans sharedStrings.
    let shared = read_entry(&bytes, "xl/sharedStrings.xml");
    assert!(
        shared.contains("9007199254740992"),
        "un grand entier non sûr doit être écrit comme texte"
    );
}

// ===========================================================================
// Tests — chiffrement agile
// ===========================================================================

#[tokio::test]
async fn protected_export_is_not_a_plain_zip() {
    let (dir, url, run_id) = setup_with_run().await;
    let path = out_path(&dir, "export.xlsx");
    let input = export_input(run_id, &path, Some("Motdepasse-Solide-2026"), false);
    let result = export_simulation_run_excel_on_url(&url, &input)
        .await
        .expect("export protégé");
    assert!(result.protected);

    let bytes = std::fs::read(&path).unwrap();
    assert!(
        !bytes.starts_with(b"PK"),
        "un fichier chiffré ne commence pas par PK"
    );
    assert!(!temp_files_present(&dir));
}

#[tokio::test]
async fn protected_export_roundtrips_with_good_password_only() {
    let (dir, url, run_id) = setup_with_run().await;
    let path = out_path(&dir, "export.xlsx");
    let password = "Motdepasse-Solide-2026";
    let input = export_input(run_id, &path, Some(password), false);
    export_simulation_run_excel_on_url(&url, &input)
        .await
        .expect("export protégé");

    let bytes = std::fs::read(&path).unwrap();

    // Bon mot de passe : déchiffrement valide + 5 feuilles.
    let decrypted =
        office_crypto::decrypt_from_bytes(bytes.clone(), password).expect("déchiffrement ok");
    assert!(decrypted.starts_with(b"PK"));
    let names = sheet_names(&decrypted);
    assert_eq!(
        names,
        vec![
            "Tableau_de_bord_RH".to_string(),
            "Resultats_RH".to_string(),
            "Trajectoire_12_mois".to_string(),
            "Synthese_campagne".to_string(),
            "Parametres".to_string(),
        ]
    );

    // Mauvais mot de passe : échec ou contenu invalide (jamais un XLSX valide).
    let bad = office_crypto::decrypt_from_bytes(bytes, "Mauvais-Mot-De-Passe-9999");
    let bad_is_valid_xlsx = bad.map(|d| d.starts_with(b"PK")).unwrap_or(false);
    assert!(
        !bad_is_valid_xlsx,
        "un mauvais mot de passe ne doit pas produire un XLSX valide"
    );
}

#[tokio::test]
async fn password_never_appears_in_error_messages() {
    let (dir, url, run_id) = setup_with_run().await;
    let password = "Secret-Ultra-Confidentiel-42";
    // Destination déjà existante -> erreur, avec mot de passe valide fourni.
    let path = out_path(&dir, "export.xlsx");
    std::fs::write(&path, b"deja").unwrap();

    let input = export_input(run_id, &path, Some(password), false);
    let err = export_simulation_run_excel_on_url(&url, &input)
        .await
        .expect_err("destination existante");
    let message = err.user_message();
    assert!(
        !message.contains(password),
        "le message ne doit jamais contenir le mot de passe"
    );
}

// ===========================================================================
// Tests — robustesse
// ===========================================================================

#[tokio::test]
async fn second_export_to_new_path_succeeds() {
    let (dir, url, run_id) = setup_with_run().await;
    let path_a = out_path(&dir, "export_a.xlsx");
    let path_b = out_path(&dir, "export_b.xlsx");

    export_simulation_run_excel_on_url(&url, &export_input(run_id, &path_a, None, true))
        .await
        .expect("premier export");
    export_simulation_run_excel_on_url(&url, &export_input(run_id, &path_b, None, true))
        .await
        .expect("second export");

    assert!(Path::new(&path_a).exists());
    assert!(Path::new(&path_b).exists());
    assert!(!temp_files_present(&dir));
}

#[test]
fn suggested_file_name_is_sanitized() {
    let name = build_suggested_file_name("Campagne / 2026 : RH", 3, "2026-07-22");
    assert!(name.starts_with("JRB_Compensation_"));
    assert!(name.ends_with(".xlsx"));
    for forbidden in ['/', ':', '\\', '<', '>', '"', '|', '?', '*'] {
        assert!(
            !name.contains(forbidden),
            "caractère interdit : {forbidden}"
        );
    }
    assert!(name.contains("Run_3"));
}

#[test]
fn generate_password_command_meets_contract() {
    let result = generate_hr_export_password();
    assert!(result.length >= 20);
    assert_eq!(result.length as usize, result.password.chars().count());

    let other = generate_hr_export_password();
    assert_ne!(result.password, other.password);
}

// ===========================================================================
// Tests — Lot 2B-E1-R1 (présentation RH + tableau de bord)
// ===========================================================================

#[tokio::test]
async fn resultats_rh_has_readable_rate_headers_not_primary_num_den() {
    let (dir, url, run_id) = setup_with_run().await;
    let path = out_path(&dir, "export.xlsx");
    export_simulation_run_excel_on_url(&url, &export_input(run_id, &path, None, true))
        .await
        .expect("export");

    let bytes = std::fs::read(&path).unwrap();
    let xml = read_all_xml(&bytes);

    assert!(xml.contains("Taux de promotion (%)"));
    assert!(xml.contains("Taux de complément (%)"));
    assert!(xml.contains("Taux total d’augmentation de base (%)"));
    assert!(xml.contains("Taux cible total (%)"));

    // Les couples num/den ne sont plus les colonnes RH principales.
    assert!(!xml.contains("Taux d’augmentation théorique (num)"));
    assert!(!xml.contains("Taux d’augmentation théorique (den)"));
    assert!(!xml.contains("Taux compensatoire cible (num)"));
    assert!(!xml.contains("Taux complément compensatoire (num)"));

    // Colonnes techniques d’audit encore présentes en fin de feuille.
    assert!(xml.contains("Taux théorique (num)"));
    assert!(xml.contains("Taux cible total (num)"));
}

#[tokio::test]
async fn annual_labels_are_corrected_to_period() {
    let (dir, url, run_id) = setup_with_run().await;
    let path = out_path(&dir, "export.xlsx");
    export_simulation_run_excel_on_url(&url, &export_input(run_id, &path, None, true))
        .await
        .expect("export");

    let bytes = std::fs::read(&path).unwrap();
    let xml = read_all_xml(&bytes);

    assert!(xml.contains("Coût compensatoire sur la période"));
    assert!(xml.contains("Coût total sur la période"));
    assert!(xml.contains("Coût des promotions sur la période"));
    assert!(xml.contains("Incidence ancienneté totale sur la période"));
    assert!(xml.contains("plein effet 12 mois") || xml.contains("Plein effet"));

    assert!(!xml.contains("Coût annuel effectif"));
    assert!(!xml.contains("Coût annuel combiné"));
    assert!(!xml.contains("Coût annuel des promotions"));
    assert!(!xml.contains("Incidence ancienneté annuelle"));
    assert!(!xml.contains("Coût effectif de campagne"));
}

#[tokio::test]
async fn dashboard_sheet_has_distribution_chart_and_stats() {
    let (dir, url, run_id) = setup_with_run().await;
    let path = out_path(&dir, "export.xlsx");
    export_simulation_run_excel_on_url(&url, &export_input(run_id, &path, None, true))
        .await
        .expect("export");

    let bytes = std::fs::read(&path).unwrap();
    let xml = read_all_xml(&bytes);

    assert!(xml.contains("Tableau de bord RH"));
    assert!(xml.contains("Effectifs par tranche de taux d’augmentation"));
    assert!(xml.contains("Statistiques hors incidence d’ancienneté"));
    assert!(xml.contains("Taux moyen"));
    assert!(xml.contains("Taux médian"));
    assert!(xml.contains("Taux non calculable"));

    let reader = std::io::Cursor::new(bytes.clone());
    let mut archive = zip::ZipArchive::new(reader).expect("zip");
    let has_chart = (0..archive.len()).any(|i| {
        archive
            .by_index(i)
            .map(|f| f.name().contains("chart"))
            .unwrap_or(false)
    });
    assert!(has_chart, "au moins un fichier chart*.xml attendu");
}

#[tokio::test]
async fn codes_are_translated_oui_non_and_status() {
    let (dir, url) = setup_temp_db().await;
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await
        .unwrap();
    let campaign_id = seed_campaign(&pool, "draft").await;
    let batch_id = seed_current_batch(&pool, campaign_id).await;
    pool.close().await;

    let mut input = input_with_months(campaign_id, Some(batch_id));
    input.employees[0].employment_status = Some("active".into());
    input.employees[0].contract_type = Some("cdi".into());
    input.employees[0].compensatory_measure_eligible = Some(true);
    input.employees[0].has_structured_promotion = Some(false);
    input.employees[1].contract_type = Some("cdd".into());
    input.employees[1].employment_status = Some("active".into());
    let saved = save_simulation_run_on_url(&url, &input, None)
        .await
        .expect("save");

    let path = out_path(&dir, "export.xlsx");
    export_simulation_run_excel_on_url(
        &url,
        &export_input(saved.simulation_run_id, &path, None, true),
    )
    .await
    .expect("export");

    let bytes = std::fs::read(&path).unwrap();
    let xml = read_all_xml(&bytes);
    assert!(xml.contains("Actif"));
    assert!(xml.contains("CDI"));
    assert!(xml.contains("CDD"));
    assert!(xml.contains("Oui"));
    assert!(xml.contains("Non"));
}

#[tokio::test]
async fn rate_8827_over_129580_is_exported_as_percent_ratio() {
    let (dir, url) = setup_temp_db().await;
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await
        .unwrap();
    let campaign_id = seed_campaign(&pool, "draft").await;
    let batch_id = seed_current_batch(&pool, campaign_id).await;
    pool.close().await;

    let mut input = input_with_months(campaign_id, Some(batch_id));
    // (8827 + 0) / 129580 ≈ 6,812 %
    input.employees[0].salary_fcfa_text = "129580".into();
    input.employees[0].s0_fcfa_text = "129580".into();
    input.employees[0].promotion_amount_fcfa_text = Some("0".into());
    input.employees[0].technical_month_compensatory_complement_fcfa_text = Some("8827".into());
    input.employees[0].final_rounded_increase_fcfa_text = "8827".into();
    let saved = save_simulation_run_on_url(&url, &input, None)
        .await
        .expect("save");

    let path = out_path(&dir, "export.xlsx");
    export_simulation_run_excel_on_url(
        &url,
        &export_input(saved.simulation_run_id, &path, None, true),
    )
    .await
    .expect("export");

    let bytes = std::fs::read(&path).unwrap();
    let xml = read_all_xml(&bytes);
    assert!(
        xml.contains("0.06812")
            || xml.contains("6.812")
            || xml.contains("6,812")
            || xml.contains("6.812008")
            || xml.contains("0.068120"),
        "le taux 8827/129580 doit être exporté comme pourcentage lisible"
    );
}

#[tokio::test]
async fn twelve_months_per_employee_preserved() {
    let (dir, url, run_id) = setup_with_run().await;
    let path = out_path(&dir, "export.xlsx");
    let result = export_simulation_run_excel_on_url(&url, &export_input(run_id, &path, None, true))
        .await
        .expect("export");
    assert_eq!(result.employee_count, 2);
    assert_eq!(result.month_row_count, 24);
}
