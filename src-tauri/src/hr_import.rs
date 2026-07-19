//! Remplacement atomique de la population RH via une vraie transaction SQLx.

use crate::sqlite_local::{
    close_connection, open_connection, resolve_app_database_path, sqlite_url_from_path,
    SqliteLocalError,
};
use serde::{Deserialize, Serialize};
use sqlx::{Connection, Row, Sqlite, Transaction};
use tauri::AppHandle;

const ALLOWED_CONTRACT_TYPES: &[&str] = &["cdi", "cdd", "temporary", "contractor", "other"];
const ALLOWED_EMPLOYMENT_STATUSES: &[&str] = &[
    "active",
    "group_detachment",
    "legal_leave",
    "external_availability",
    "suspended",
    "departed",
    "other",
];
const ALLOWED_FORMATS: &[&str] = &["xlsx", "xls", "csv"];

/// Point d’échec injecté uniquement dans les tests Rust.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InjectedFault {
    AfterBatchInsert,
    AfterEmployeeIndex(usize),
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplacePopulationEmployeeInput {
    pub source_row_number: i64,
    pub employee_number: String,
    pub employee_label: String,
    pub job_family_id: i64,
    pub grade_id: i64,
    pub contract_type: String,
    pub employment_status: String,
    pub hire_date: String,
    pub december_base_salary: i64,
    pub nine_box_code: Option<i64>,
    pub confirmed_underperformer: bool,
    pub promotion_amount: i64,
    pub correction_amount: i64,
    pub social_measure_amount: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplacePopulationInput {
    pub campaign_id: i64,
    pub file_name: String,
    pub format: String,
    pub sheet_name: Option<String>,
    pub file_size_bytes: i64,
    pub source_row_count: i64,
    pub warning_count: i64,
    pub employees: Vec<ReplacePopulationEmployeeInput>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HrImportBatchDto {
    pub id: i64,
    pub campaign_id: i64,
    pub status: String,
    pub source_file_name: String,
    pub source_format: String,
    pub source_sheet_name: Option<String>,
    pub file_size_bytes: i64,
    pub source_row_count: i64,
    pub imported_row_count: i64,
    pub warning_count: i64,
    pub imported_at: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplacePopulationResult {
    pub batch: HrImportBatchDto,
    pub imported_row_count: i64,
    pub warning_count: i64,
    pub superseded_batch_id: Option<i64>,
}

#[derive(Debug)]
pub enum ReplacePopulationError {
    Validation(String),
    Database(String),
}

impl ReplacePopulationError {
    pub fn user_message(&self) -> String {
        match self {
            Self::Validation(message) => message.clone(),
            Self::Database(_) => "La confirmation de l’import a échoué.".to_string(),
        }
    }

    pub fn technical_code(&self) -> &'static str {
        match self {
            Self::Validation(_) => "VALIDATION",
            Self::Database(_) => "DATABASE",
        }
    }
}

impl From<sqlx::Error> for ReplacePopulationError {
    fn from(value: sqlx::Error) -> Self {
        Self::Database(value.to_string())
    }
}

impl From<SqliteLocalError> for ReplacePopulationError {
    fn from(value: SqliteLocalError) -> Self {
        Self::Database(value.to_string())
    }
}

fn base_file_name(file_name: &str) -> String {
    file_name
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(file_name)
        .trim()
        .to_string()
}

fn validate_input(input: &ReplacePopulationInput) -> Result<String, ReplacePopulationError> {
    let file_name = base_file_name(&input.file_name);
    if file_name.is_empty() {
        return Err(ReplacePopulationError::Validation(
            "Le nom du fichier source est obligatoire.".into(),
        ));
    }
    if !ALLOWED_FORMATS.contains(&input.format.as_str()) {
        return Err(ReplacePopulationError::Validation(
            "Format de fichier non pris en charge.".into(),
        ));
    }
    if input.file_size_bytes <= 0 {
        return Err(ReplacePopulationError::Validation(
            "La taille du fichier doit être strictement positive.".into(),
        ));
    }
    if input.source_row_count < 0 || input.warning_count < 0 {
        return Err(ReplacePopulationError::Validation(
            "Les compteurs d’import sont invalides.".into(),
        ));
    }
    if input.employees.is_empty() {
        return Err(ReplacePopulationError::Validation(
            "Aucun salarié valide à importer.".into(),
        ));
    }

    for employee in &input.employees {
        if employee.employee_number.trim().is_empty() || employee.employee_label.trim().is_empty() {
            return Err(ReplacePopulationError::Validation(
                "Chaque salarié doit avoir un matricule et un libellé.".into(),
            ));
        }
        if !ALLOWED_CONTRACT_TYPES.contains(&employee.contract_type.as_str()) {
            return Err(ReplacePopulationError::Validation(
                "Type de contrat non reconnu.".into(),
            ));
        }
        if !ALLOWED_EMPLOYMENT_STATUSES.contains(&employee.employment_status.as_str()) {
            return Err(ReplacePopulationError::Validation(
                "Statut d’emploi non reconnu.".into(),
            ));
        }
        if employee.hire_date.trim().len() != 10 {
            return Err(ReplacePopulationError::Validation(
                "Date d’embauche invalide.".into(),
            ));
        }
        if employee.december_base_salary <= 0
            || employee.promotion_amount < 0
            || employee.correction_amount < 0
            || employee.social_measure_amount < 0
            || employee.source_row_number <= 0
        {
            return Err(ReplacePopulationError::Validation(
                "Montants ou numéros de ligne invalides.".into(),
            ));
        }
        if let Some(code) = employee.nine_box_code {
            if !(1..=9).contains(&code) {
                return Err(ReplacePopulationError::Validation(
                    "Code 9-Box invalide.".into(),
                ));
            }
        }
    }

    Ok(file_name)
}

async fn utc_now_iso(tx: &mut Transaction<'_, Sqlite>) -> Result<String, ReplacePopulationError> {
    let value: String = sqlx::query_scalar("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")
        .fetch_one(&mut **tx)
        .await?;
    Ok(value)
}

/// Exécute le remplacement atomique sur une URL SQLite (tests + commande).
pub async fn replace_current_population_on_url(
    database_url: &str,
    input: &ReplacePopulationInput,
    fault: Option<InjectedFault>,
) -> Result<ReplacePopulationResult, ReplacePopulationError> {
    let file_name = validate_input(input)?;
    let mut conn = open_connection(database_url).await?;
    let outcome = async {
        let mut tx = conn.begin().await?;
        let result = replace_current_population_in_tx(&mut tx, input, &file_name, fault).await;
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

async fn replace_current_population_in_tx(
    tx: &mut Transaction<'_, Sqlite>,
    input: &ReplacePopulationInput,
    file_name: &str,
    fault: Option<InjectedFault>,
) -> Result<ReplacePopulationResult, ReplacePopulationError> {
    // a. Campagne
    let campaign_status: Option<String> =
        sqlx::query_scalar("SELECT status FROM campaigns WHERE id = ?1")
            .bind(input.campaign_id)
            .fetch_optional(&mut **tx)
            .await?;
    let Some(status) = campaign_status else {
        return Err(ReplacePopulationError::Validation(
            "La campagne cible de l’import est introuvable.".into(),
        ));
    };
    if status == "archived" {
        return Err(ReplacePopulationError::Validation(
            "Cette campagne est archivée : l’import de population est bloqué.".into(),
        ));
    }

    // b. Familles et grades
    let mut family_ids: Vec<i64> = input
        .employees
        .iter()
        .map(|employee| employee.job_family_id)
        .collect();
    family_ids.sort_unstable();
    family_ids.dedup();
    for family_id in &family_ids {
        let exists: Option<i64> = sqlx::query_scalar(
            "SELECT id FROM campaign_job_families WHERE campaign_id = ?1 AND id = ?2",
        )
        .bind(input.campaign_id)
        .bind(family_id)
        .fetch_optional(&mut **tx)
        .await?;
        if exists.is_none() {
            return Err(ReplacePopulationError::Validation(
                "Une famille de métiers de l’import n’appartient pas à cette campagne.".into(),
            ));
        }
    }

    let mut grade_ids: Vec<i64> = input
        .employees
        .iter()
        .map(|employee| employee.grade_id)
        .collect();
    grade_ids.sort_unstable();
    grade_ids.dedup();
    for grade_id in &grade_ids {
        let exists: Option<i64> =
            sqlx::query_scalar("SELECT id FROM campaign_grades WHERE campaign_id = ?1 AND id = ?2")
                .bind(input.campaign_id)
                .bind(grade_id)
                .fetch_optional(&mut **tx)
                .await?;
        if exists.is_none() {
            return Err(ReplacePopulationError::Validation(
                "Un grade de l’import n’appartient pas à cette campagne.".into(),
            ));
        }
    }

    let now = utc_now_iso(tx).await?;

    // c. Ancien lot current → superseded
    let current_batch_id: Option<i64> = sqlx::query_scalar(
        "SELECT id FROM hr_import_batches WHERE campaign_id = ?1 AND status = 'current'",
    )
    .bind(input.campaign_id)
    .fetch_optional(&mut **tx)
    .await?;

    let superseded_batch_id = if let Some(batch_id) = current_batch_id {
        sqlx::query("UPDATE hr_import_batches SET status = 'superseded' WHERE id = ?1")
            .bind(batch_id)
            .execute(&mut **tx)
            .await?;
        Some(batch_id)
    } else {
        None
    };

    // d–e. Nouveau batch + id
    let insert = sqlx::query(
        r#"
        INSERT INTO hr_import_batches (
            campaign_id, status, source_file_name, source_format, source_sheet_name,
            file_size_bytes, source_row_count, imported_row_count, warning_count,
            imported_at, created_at
        ) VALUES (?1, 'current', ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        "#,
    )
    .bind(input.campaign_id)
    .bind(file_name)
    .bind(&input.format)
    .bind(&input.sheet_name)
    .bind(input.file_size_bytes)
    .bind(input.source_row_count)
    .bind(input.employees.len() as i64)
    .bind(input.warning_count)
    .bind(&now)
    .bind(&now)
    .execute(&mut **tx)
    .await?;

    let new_batch_id = insert.last_insert_rowid();
    if new_batch_id <= 0 {
        return Err(ReplacePopulationError::Database(
            "Identifiant du lot d’import introuvable après insertion.".into(),
        ));
    }

    if fault == Some(InjectedFault::AfterBatchInsert) {
        return Err(ReplacePopulationError::Database(
            "Échec injecté après insertion du lot.".into(),
        ));
    }

    // f. Salariés
    for (index, employee) in input.employees.iter().enumerate() {
        if fault == Some(InjectedFault::AfterEmployeeIndex(index)) {
            return Err(ReplacePopulationError::Database(
                "Échec injecté pendant l’insertion des salariés.".into(),
            ));
        }

        sqlx::query(
            r#"
            INSERT INTO hr_import_employees (
                import_batch_id, campaign_id, employee_number, employee_label,
                job_family_id, grade_id, contract_type, employment_status, hire_date,
                december_base_salary, nine_box_code, confirmed_underperformer,
                promotion_amount, correction_amount, social_measure_amount,
                source_row_number, created_at
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17
            )
            "#,
        )
        .bind(new_batch_id)
        .bind(input.campaign_id)
        .bind(employee.employee_number.trim())
        .bind(employee.employee_label.trim())
        .bind(employee.job_family_id)
        .bind(employee.grade_id)
        .bind(&employee.contract_type)
        .bind(&employee.employment_status)
        .bind(&employee.hire_date)
        .bind(employee.december_base_salary)
        .bind(employee.nine_box_code)
        .bind(if employee.confirmed_underperformer {
            1
        } else {
            0
        })
        .bind(employee.promotion_amount)
        .bind(employee.correction_amount)
        .bind(employee.social_measure_amount)
        .bind(employee.source_row_number)
        .bind(&now)
        .execute(&mut **tx)
        .await?;
    }

    // g. Vérification du nombre
    let inserted_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM hr_import_employees WHERE import_batch_id = ?1")
            .bind(new_batch_id)
            .fetch_one(&mut **tx)
            .await?;
    if inserted_count != input.employees.len() as i64 {
        return Err(ReplacePopulationError::Database(
            "Le nombre de salariés insérés ne correspond pas au fichier importé.".into(),
        ));
    }

    let batch_row = sqlx::query(
        r#"
        SELECT id, campaign_id, status, source_file_name, source_format, source_sheet_name,
               file_size_bytes, source_row_count, imported_row_count, warning_count,
               imported_at, created_at
        FROM hr_import_batches
        WHERE id = ?1
        "#,
    )
    .bind(new_batch_id)
    .fetch_one(&mut **tx)
    .await?;

    let batch = HrImportBatchDto {
        id: batch_row.get("id"),
        campaign_id: batch_row.get("campaign_id"),
        status: batch_row.get("status"),
        source_file_name: batch_row.get("source_file_name"),
        source_format: batch_row.get("source_format"),
        source_sheet_name: batch_row.get("source_sheet_name"),
        file_size_bytes: batch_row.get("file_size_bytes"),
        source_row_count: batch_row.get("source_row_count"),
        imported_row_count: batch_row.get("imported_row_count"),
        warning_count: batch_row.get("warning_count"),
        imported_at: batch_row.get("imported_at"),
        created_at: batch_row.get("created_at"),
    };

    // h. commit effectué par l’appelant après Ok
    Ok(ReplacePopulationResult {
        batch,
        imported_row_count: input.employees.len() as i64,
        warning_count: input.warning_count,
        superseded_batch_id,
    })
}

/// Commande Tauri : transaction SQLx réelle, chemin résolu côté Rust uniquement.
#[tauri::command]
pub async fn replace_current_population(
    app: AppHandle,
    input: ReplacePopulationInput,
) -> Result<ReplacePopulationResult, String> {
    let path = resolve_app_database_path(&app).map_err(|error| error.user_message())?;
    let url = sqlite_url_from_path(&path).map_err(|error| error.user_message())?;

    match replace_current_population_on_url(&url, &input, None).await {
        Ok(result) => Ok(result),
        Err(error) => {
            if cfg!(debug_assertions) {
                let detail = match &error {
                    ReplacePopulationError::Validation(_) => "validation",
                    ReplacePopulationError::Database(message) => {
                        // Longueur uniquement : pas de contenu SQL ni de données RH.
                        let _ = message.len();
                        "database"
                    }
                };
                eprintln!(
                    "[HR_IMPORT_CONFIRM_FAILED] code={} kind={}",
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

        CREATE TABLE campaign_job_families (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
            code TEXT NOT NULL,
            label TEXT NOT NULL,
            sort_order INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE campaign_grades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
            code TEXT NOT NULL,
            label TEXT NOT NULL,
            sort_order INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
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

        CREATE TABLE hr_import_employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            import_batch_id INTEGER NOT NULL REFERENCES hr_import_batches(id),
            campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
            employee_number TEXT NOT NULL CHECK (length(trim(employee_number)) > 0),
            employee_label TEXT NOT NULL CHECK (length(trim(employee_label)) > 0),
            job_family_id INTEGER NOT NULL REFERENCES campaign_job_families(id),
            grade_id INTEGER NOT NULL REFERENCES campaign_grades(id),
            contract_type TEXT NOT NULL,
            employment_status TEXT NOT NULL,
            hire_date TEXT NOT NULL,
            december_base_salary INTEGER NOT NULL CHECK (december_base_salary > 0),
            nine_box_code INTEGER NULL,
            confirmed_underperformer INTEGER NOT NULL DEFAULT 0,
            promotion_amount INTEGER NOT NULL DEFAULT 0,
            correction_amount INTEGER NOT NULL DEFAULT 0,
            social_measure_amount INTEGER NOT NULL DEFAULT 0,
            source_row_number INTEGER NOT NULL CHECK (source_row_number > 0),
            created_at TEXT NOT NULL
        );
    "#;

    async fn setup_temp_db() -> (tempfile::TempDir, String, i64, i64, i64) {
        let dir = tempfile::tempdir().expect("temp dir");
        let db_path = dir.path().join("test-import.db");
        let url = format!("sqlite:{}", db_path.to_str().unwrap());

        {
            let options = SqliteConnectOptions::from_str(&url)
                .unwrap()
                .create_if_missing(true)
                .foreign_keys(true);
            let mut conn = options.connect().await.expect("create db");
            for statement in MINIMAL_SCHEMA.split(';') {
                let trimmed = statement.trim();
                if !trimmed.is_empty() {
                    sqlx::query(trimmed)
                        .execute(&mut conn)
                        .await
                        .expect("schema");
                }
            }
        }

        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect(&url)
            .await
            .expect("connect");
        let (campaign_id, family_id, grade_id) = seed_campaign(&pool).await;
        pool.close().await;

        (dir, url, campaign_id, family_id, grade_id)
    }

    async fn seed_campaign(pool: &SqlitePool) -> (i64, i64, i64) {
        let now = "2026-07-19T00:00:00.000Z";
        let campaign = sqlx::query(
            r#"
            INSERT INTO campaigns (name, reference_year, status, notes, created_at, updated_at, archived_at)
            VALUES ('Campagne TX', 2026, 'draft', '', ?1, ?1, NULL)
            "#,
        )
        .bind(now)
        .execute(pool)
        .await
        .expect("campaign");
        let campaign_id = campaign.last_insert_rowid();

        let family = sqlx::query(
            r#"
            INSERT INTO campaign_job_families (campaign_id, code, label, sort_order, created_at, updated_at)
            VALUES (?1, 'TECH', 'Famille Technique', 1, ?2, ?2)
            "#,
        )
        .bind(campaign_id)
        .bind(now)
        .execute(pool)
        .await
        .expect("family");
        let family_id = family.last_insert_rowid();

        let grade = sqlx::query(
            r#"
            INSERT INTO campaign_grades (campaign_id, code, label, sort_order, created_at, updated_at)
            VALUES (?1, 'GA', 'Grade A', 1, ?2, ?2)
            "#,
        )
        .bind(campaign_id)
        .bind(now)
        .execute(pool)
        .await
        .expect("grade");
        let grade_id = grade.last_insert_rowid();

        (campaign_id, family_id, grade_id)
    }

    fn sample_employees(
        family_id: i64,
        grade_id: i64,
        count: usize,
    ) -> Vec<ReplacePopulationEmployeeInput> {
        (1..=count)
            .map(|index| ReplacePopulationEmployeeInput {
                source_row_number: (index + 1) as i64,
                employee_number: format!("EMP-{index:04}"),
                employee_label: format!("Salarié Démo {index}"),
                job_family_id: family_id,
                grade_id,
                contract_type: "cdi".into(),
                employment_status: "active".into(),
                hire_date: "2020-01-15".into(),
                december_base_salary: 450_000,
                nine_box_code: Some(5),
                confirmed_underperformer: false,
                promotion_amount: 0,
                correction_amount: 0,
                social_measure_amount: 0,
            })
            .collect()
    }

    fn sample_input(
        campaign_id: i64,
        family_id: i64,
        grade_id: i64,
        file_name: &str,
        count: usize,
    ) -> ReplacePopulationInput {
        ReplacePopulationInput {
            campaign_id,
            file_name: file_name.into(),
            format: "xlsx".into(),
            sheet_name: Some("Population".into()),
            file_size_bytes: 12_000,
            source_row_count: count as i64,
            warning_count: 0,
            employees: sample_employees(family_id, grade_id, count),
        }
    }

    async fn count_current(pool: &SqlitePool, campaign_id: i64) -> i64 {
        sqlx::query_scalar(
            "SELECT COUNT(*) FROM hr_import_batches WHERE campaign_id = ?1 AND status = 'current'",
        )
        .bind(campaign_id)
        .fetch_one(pool)
        .await
        .unwrap()
    }

    async fn count_employees_for_current(pool: &SqlitePool, campaign_id: i64) -> i64 {
        sqlx::query_scalar(
            r#"
            SELECT COUNT(*)
            FROM hr_import_employees e
            INNER JOIN hr_import_batches b ON b.id = e.import_batch_id
            WHERE b.campaign_id = ?1 AND b.status = 'current'
            "#,
        )
        .bind(campaign_id)
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

    #[tokio::test]
    async fn first_import_creates_one_current_batch_and_three_employees() {
        let (_dir, url, campaign_id, family_id, grade_id) = setup_temp_db().await;
        let input = sample_input(
            campaign_id,
            family_id,
            grade_id,
            "population-demo-3.xlsx",
            3,
        );
        let result = replace_current_population_on_url(&url, &input, None)
            .await
            .expect("first import");

        assert_eq!(result.batch.status, "current");
        assert_eq!(result.imported_row_count, 3);
        assert_eq!(result.superseded_batch_id, None);

        let pool = SqlitePool::connect(&url).await.unwrap();
        assert_eq!(count_current(&pool, campaign_id).await, 1);
        assert_eq!(count_employees_for_current(&pool, campaign_id).await, 3);
        pool.close().await;
    }

    #[tokio::test]
    async fn second_import_supersedes_previous_and_keeps_single_current() {
        let (_dir, url, campaign_id, family_id, grade_id) = setup_temp_db().await;
        let first = sample_input(
            campaign_id,
            family_id,
            grade_id,
            "population-demo-3.xlsx",
            3,
        );
        let first_result = replace_current_population_on_url(&url, &first, None)
            .await
            .expect("first");

        let second = sample_input(
            campaign_id,
            family_id,
            grade_id,
            "population-demo-2.xlsx",
            2,
        );
        let second_result = replace_current_population_on_url(&url, &second, None)
            .await
            .expect("second");

        assert_eq!(
            second_result.superseded_batch_id,
            Some(first_result.batch.id)
        );
        assert_eq!(second_result.imported_row_count, 2);

        let pool = SqlitePool::connect(&url).await.unwrap();
        assert_eq!(count_current(&pool, campaign_id).await, 1);
        assert_eq!(count_employees_for_current(&pool, campaign_id).await, 2);
        assert_eq!(count_batches(&pool, campaign_id).await, 2);

        let superseded: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM hr_import_batches WHERE campaign_id = ?1 AND status = 'superseded'",
        )
        .bind(campaign_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(superseded, 1);
        pool.close().await;
    }

    #[tokio::test]
    async fn fault_after_batch_insert_rolls_back_completely() {
        let (_dir, url, campaign_id, family_id, grade_id) = setup_temp_db().await;
        let seed = sample_input(campaign_id, family_id, grade_id, "seed.xlsx", 3);
        let seed_result = replace_current_population_on_url(&url, &seed, None)
            .await
            .expect("seed");

        let next = sample_input(campaign_id, family_id, grade_id, "next.xlsx", 2);
        let err =
            replace_current_population_on_url(&url, &next, Some(InjectedFault::AfterBatchInsert))
                .await
                .expect_err("must fail");
        assert!(matches!(err, ReplacePopulationError::Database(_)));

        let pool = SqlitePool::connect(&url).await.unwrap();
        assert_eq!(count_current(&pool, campaign_id).await, 1);
        assert_eq!(count_employees_for_current(&pool, campaign_id).await, 3);
        assert_eq!(count_batches(&pool, campaign_id).await, 1);

        let current_id: i64 = sqlx::query_scalar(
            "SELECT id FROM hr_import_batches WHERE campaign_id = ?1 AND status = 'current'",
        )
        .bind(campaign_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(current_id, seed_result.batch.id);
        pool.close().await;
    }

    #[tokio::test]
    async fn fault_after_partial_employees_rolls_back_completely() {
        let (_dir, url, campaign_id, family_id, grade_id) = setup_temp_db().await;
        let seed = sample_input(campaign_id, family_id, grade_id, "seed.xlsx", 2);
        replace_current_population_on_url(&url, &seed, None)
            .await
            .expect("seed");

        let next = sample_input(campaign_id, family_id, grade_id, "next.xlsx", 3);
        let err = replace_current_population_on_url(
            &url,
            &next,
            Some(InjectedFault::AfterEmployeeIndex(1)),
        )
        .await
        .expect_err("must fail");
        assert!(matches!(err, ReplacePopulationError::Database(_)));

        let pool = SqlitePool::connect(&url).await.unwrap();
        assert_eq!(count_current(&pool, campaign_id).await, 1);
        assert_eq!(count_employees_for_current(&pool, campaign_id).await, 2);
        assert_eq!(count_batches(&pool, campaign_id).await, 1);
        pool.close().await;
    }

    #[tokio::test]
    async fn archived_campaign_blocks_mutation() {
        let (_dir, url, campaign_id, family_id, grade_id) = setup_temp_db().await;
        let pool = SqlitePool::connect(&url).await.unwrap();
        sqlx::query("UPDATE campaigns SET status = 'archived' WHERE id = ?1")
            .bind(campaign_id)
            .execute(&pool)
            .await
            .unwrap();
        pool.close().await;

        let input = sample_input(campaign_id, family_id, grade_id, "arch.xlsx", 1);
        let err = replace_current_population_on_url(&url, &input, None)
            .await
            .expect_err("archived");
        assert!(matches!(err, ReplacePopulationError::Validation(_)));

        let pool = SqlitePool::connect(&url).await.unwrap();
        assert_eq!(count_batches(&pool, campaign_id).await, 0);
        pool.close().await;
    }

    #[tokio::test]
    async fn invalid_family_blocks_mutation() {
        let (_dir, url, campaign_id, _family_id, grade_id) = setup_temp_db().await;
        let mut input = sample_input(campaign_id, 999_999, grade_id, "bad-family.xlsx", 1);
        input.employees[0].job_family_id = 999_999;

        let err = replace_current_population_on_url(&url, &input, None)
            .await
            .expect_err("bad family");
        assert!(matches!(err, ReplacePopulationError::Validation(_)));

        let pool = SqlitePool::connect(&url).await.unwrap();
        assert_eq!(count_batches(&pool, campaign_id).await, 0);
        pool.close().await;
    }

    #[tokio::test]
    async fn inserted_count_is_verified_before_commit() {
        let (_dir, url, campaign_id, family_id, grade_id) = setup_temp_db().await;
        let input = sample_input(campaign_id, family_id, grade_id, "count.xlsx", 3);
        let result = replace_current_population_on_url(&url, &input, None)
            .await
            .expect("import");
        assert_eq!(result.batch.imported_row_count, 3);
        assert_eq!(result.imported_row_count, 3);

        let pool = SqlitePool::connect(&url).await.unwrap();
        let counted: i64 =
            sqlx::query_scalar("SELECT imported_row_count FROM hr_import_batches WHERE id = ?1")
                .bind(result.batch.id)
                .fetch_one(&pool)
                .await
                .unwrap();
        let actual: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM hr_import_employees WHERE import_batch_id = ?1",
        )
        .bind(result.batch.id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(counted, actual);
        pool.close().await;
    }

    #[tokio::test]
    #[ignore = "recette AppData Lot 1C"]
    async fn recipe_appdata_second_import_via_real_transaction() {
        let db_path = std::env::var("JRB_RECIPE_DB").expect("JRB_RECIPE_DB");
        let url = format!("sqlite:{db_path}");
        let campaign_id: i64 = 2;
        let family_id: i64 = 6;
        let grade_id: i64 = 7;
        let input = sample_input(
            campaign_id,
            family_id,
            grade_id,
            "population-demo-2.xlsx",
            2,
        );
        let result = replace_current_population_on_url(&url, &input, None)
            .await
            .expect("second import");
        assert_eq!(result.imported_row_count, 2);
        assert_eq!(result.batch.status, "current");
        assert!(result.superseded_batch_id.is_some());

        let pool = SqlitePool::connect(&url).await.unwrap();
        assert_eq!(count_current(&pool, campaign_id).await, 1);
        assert_eq!(count_employees_for_current(&pool, campaign_id).await, 2);
        assert_eq!(count_batches(&pool, campaign_id).await, 2);
        pool.close().await;
    }
}
