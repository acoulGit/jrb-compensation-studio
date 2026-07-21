//! Constantes de persistance locale partagées par le runtime et les tests Rust.

pub const DATABASE_URL: &str = "sqlite:jrb-compensation-studio.db";

pub const MIGRATION_0001_SQL: &str = include_str!("../migrations/0001_initial_persistence.sql");
pub const MIGRATION_0002_SQL: &str = include_str!("../migrations/0002_compensation_references.sql");
pub const MIGRATION_0003_SQL: &str = include_str!("../migrations/0003_hr_import.sql");
pub const MIGRATION_0004_SQL: &str =
    include_str!("../migrations/0004_compensation_calculation.sql");
pub const MIGRATION_0005_SQL: &str = include_str!("../migrations/0005_campaign_simulations.sql");
pub const MIGRATION_0006_SQL: &str = include_str!("../migrations/0006_employee_promotions.sql");

pub const MIGRATION_0001_VERSION: i64 = 1;
pub const MIGRATION_0001_DESCRIPTION: &str = "initial_persistence";

pub const MIGRATION_0002_VERSION: i64 = 2;
pub const MIGRATION_0002_DESCRIPTION: &str = "compensation_references";

pub const MIGRATION_0003_VERSION: i64 = 3;
pub const MIGRATION_0003_DESCRIPTION: &str = "hr_import";

pub const MIGRATION_0004_VERSION: i64 = 4;
pub const MIGRATION_0004_DESCRIPTION: &str = "compensation_calculation";

pub const MIGRATION_0005_VERSION: i64 = 5;
pub const MIGRATION_0005_DESCRIPTION: &str = "campaign_simulations";

pub const MIGRATION_0006_VERSION: i64 = 6;
pub const MIGRATION_0006_DESCRIPTION: &str = "employee_promotions";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn database_url_matches_contract() {
        assert_eq!(DATABASE_URL, "sqlite:jrb-compensation-studio.db");
    }

    #[test]
    fn migration_0001_is_present_and_ordered() {
        assert_eq!(MIGRATION_0001_VERSION, 1);
        assert_eq!(MIGRATION_0001_DESCRIPTION, "initial_persistence");
        assert!(MIGRATION_0001_SQL.contains("organization_profile"));
        assert!(MIGRATION_0001_SQL.contains("campaigns"));
        assert!(MIGRATION_0001_SQL.contains("ux_campaigns_one_active"));
        assert!(MIGRATION_0001_SQL.contains("INSERT OR IGNORE"));
    }

    #[test]
    fn migration_0002_is_present_and_ordered_after_0001() {
        assert_eq!(MIGRATION_0002_VERSION, 2);
        assert_eq!(MIGRATION_0002_DESCRIPTION, "compensation_references");
        assert!(MIGRATION_0002_VERSION > MIGRATION_0001_VERSION);
        assert!(MIGRATION_0002_SQL.contains("campaign_reference_config"));
        assert!(MIGRATION_0002_SQL.contains("campaign_job_families"));
        assert!(MIGRATION_0002_SQL.contains("campaign_grades"));
        assert!(!MIGRATION_0002_SQL.contains("REAL"));
    }

    #[test]
    fn migration_0003_is_present_and_ordered_after_0002() {
        assert_eq!(MIGRATION_0003_VERSION, 3);
        assert_eq!(MIGRATION_0003_DESCRIPTION, "hr_import");
        assert!(MIGRATION_0003_VERSION > MIGRATION_0002_VERSION);
        assert!(MIGRATION_0003_SQL.contains("hr_import_batches"));
        assert!(MIGRATION_0003_SQL.contains("hr_import_employees"));
        assert!(MIGRATION_0003_SQL.contains("ux_hr_import_batches_one_current"));
        assert!(MIGRATION_0003_SQL.contains("source_file_name"));
        assert!(MIGRATION_0003_SQL.contains("december_base_salary"));
        assert!(MIGRATION_0003_SQL.contains("employee_number"));
        assert!(MIGRATION_0003_SQL.contains("CHECK (status IN ('current', 'superseded'))"));
    }

    #[test]
    fn migration_0004_is_present_and_ordered_after_0003() {
        assert_eq!(MIGRATION_0004_VERSION, 4);
        assert_eq!(MIGRATION_0004_DESCRIPTION, "compensation_calculation");
        assert!(MIGRATION_0004_VERSION > MIGRATION_0003_VERSION);
        assert!(MIGRATION_0004_SQL.contains("nine_box_orientation"));
        assert!(MIGRATION_0004_SQL.contains("performance_rows_potential_columns"));
        assert!(MIGRATION_0004_SQL.contains("performance_columns_potential_rows"));
        assert!(MIGRATION_0004_SQL.contains("ux_campaign_nine_box_semantic"));
        assert!(!MIGRATION_0004_SQL.contains("REAL"));
    }

    #[test]
    fn migration_0005_is_present_and_ordered_after_0004() {
        assert_eq!(MIGRATION_0005_VERSION, 5);
        assert_eq!(MIGRATION_0005_DESCRIPTION, "campaign_simulations");
        assert!(MIGRATION_0005_VERSION > MIGRATION_0004_VERSION);
        assert!(MIGRATION_0005_SQL.contains("compensation_simulation_runs"));
        assert!(MIGRATION_0005_SQL.contains("compensation_simulation_employee_results"));
        assert!(MIGRATION_0005_SQL.contains("source_fingerprint"));
        assert!(MIGRATION_0005_SQL.contains("budget_target_numerator_text"));
        assert!(MIGRATION_0005_SQL.contains("final_salary_fcfa_text"));
        assert!(MIGRATION_0005_SQL.contains("ON DELETE CASCADE"));
        assert!(!MIGRATION_0005_SQL.contains("REAL"));
    }

    #[test]
    fn migration_0006_is_present_and_ordered_after_0005() {
        assert_eq!(MIGRATION_0006_VERSION, 6);
        assert_eq!(MIGRATION_0006_DESCRIPTION, "employee_promotions");
        assert!(MIGRATION_0006_VERSION > MIGRATION_0005_VERSION);
        assert!(MIGRATION_0006_SQL.contains("promotion_date"));
        assert!(MIGRATION_0006_SQL.contains("salary_before_promotion"));
        assert!(MIGRATION_0006_SQL.contains("salary_after_promotion"));
        assert!(MIGRATION_0006_SQL.contains("previous_grade_id"));
        assert!(MIGRATION_0006_SQL.contains("promoted_grade_id"));
        assert!(MIGRATION_0006_SQL.contains("previous_job_family_id"));
        assert!(MIGRATION_0006_SQL.contains("promoted_job_family_id"));
        assert!(!MIGRATION_0006_SQL.contains("REAL"));
    }

    #[test]
    fn migration_config_is_valid() {
        assert!(MIGRATION_0001_VERSION > 0);
        assert!(!MIGRATION_0001_DESCRIPTION.is_empty());
        assert!(!MIGRATION_0001_SQL.trim().is_empty());
        assert!(MIGRATION_0002_VERSION > 0);
        assert!(!MIGRATION_0002_DESCRIPTION.is_empty());
        assert!(!MIGRATION_0002_SQL.trim().is_empty());
        assert!(MIGRATION_0003_VERSION > 0);
        assert!(!MIGRATION_0003_DESCRIPTION.is_empty());
        assert!(!MIGRATION_0003_SQL.trim().is_empty());
        assert!(MIGRATION_0004_VERSION > 0);
        assert!(!MIGRATION_0004_DESCRIPTION.is_empty());
        assert!(!MIGRATION_0004_SQL.trim().is_empty());
        assert!(MIGRATION_0005_VERSION > 0);
        assert!(!MIGRATION_0005_DESCRIPTION.is_empty());
        assert!(!MIGRATION_0005_SQL.trim().is_empty());
        assert!(MIGRATION_0006_VERSION > 0);
        assert!(!MIGRATION_0006_DESCRIPTION.is_empty());
        assert!(!MIGRATION_0006_SQL.trim().is_empty());
        assert!(DATABASE_URL.starts_with("sqlite:"));
        assert_eq!(DATABASE_URL, "sqlite:jrb-compensation-studio.db");
    }

    #[test]
    fn migration_order_is_exactly_0001_to_0006() {
        assert_eq!(MIGRATION_0001_VERSION, 1);
        assert_eq!(MIGRATION_0002_VERSION, 2);
        assert_eq!(MIGRATION_0003_VERSION, 3);
        assert_eq!(MIGRATION_0004_VERSION, 4);
        assert_eq!(MIGRATION_0005_VERSION, 5);
        assert_eq!(MIGRATION_0006_VERSION, 6);
    }

    #[tokio::test]
    async fn migration_0006_preserves_existing_rows_without_promotion() {
        use sqlx::sqlite::SqliteConnectOptions;
        use sqlx::{ConnectOptions, SqlitePool};
        use std::str::FromStr;

        let dir = tempfile::tempdir().expect("temp dir");
        let db_path = dir.path().join("migrate-0006.db");
        let url = format!("sqlite:{}", db_path.to_str().unwrap());

        {
            let options = SqliteConnectOptions::from_str(&url)
                .unwrap()
                .create_if_missing(true)
                .foreign_keys(true);
            let mut conn = options.connect().await.expect("create db");
            // Schéma minimal pré-0006 (colonnes 0003 sans promotion structurée).
            sqlx::query(
                r#"
                CREATE TABLE campaigns (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    reference_year INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    notes TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                "#,
            )
            .execute(&mut conn)
            .await
            .unwrap();
            sqlx::query(
                r#"
                CREATE TABLE campaign_job_families (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
                    code TEXT NOT NULL,
                    label TEXT NOT NULL,
                    sort_order INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                "#,
            )
            .execute(&mut conn)
            .await
            .unwrap();
            sqlx::query(
                r#"
                CREATE TABLE campaign_grades (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
                    code TEXT NOT NULL,
                    label TEXT NOT NULL,
                    sort_order INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                "#,
            )
            .execute(&mut conn)
            .await
            .unwrap();
            sqlx::query(
                r#"
                CREATE TABLE hr_import_batches (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
                    status TEXT NOT NULL,
                    source_file_name TEXT NOT NULL,
                    source_format TEXT NOT NULL,
                    source_sheet_name TEXT,
                    file_size_bytes INTEGER NOT NULL,
                    source_row_count INTEGER NOT NULL,
                    imported_row_count INTEGER NOT NULL,
                    warning_count INTEGER NOT NULL,
                    imported_at TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                "#,
            )
            .execute(&mut conn)
            .await
            .unwrap();
            sqlx::query(
                r#"
                CREATE TABLE hr_import_employees (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    import_batch_id INTEGER NOT NULL REFERENCES hr_import_batches(id),
                    campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
                    employee_number TEXT NOT NULL,
                    employee_label TEXT NOT NULL,
                    job_family_id INTEGER NOT NULL REFERENCES campaign_job_families(id),
                    grade_id INTEGER NOT NULL REFERENCES campaign_grades(id),
                    contract_type TEXT NOT NULL,
                    employment_status TEXT NOT NULL,
                    hire_date TEXT NOT NULL,
                    december_base_salary INTEGER NOT NULL,
                    nine_box_code INTEGER,
                    confirmed_underperformer INTEGER NOT NULL DEFAULT 0,
                    promotion_amount INTEGER NOT NULL DEFAULT 0,
                    correction_amount INTEGER NOT NULL DEFAULT 0,
                    social_measure_amount INTEGER NOT NULL DEFAULT 0,
                    source_row_number INTEGER NOT NULL,
                    created_at TEXT NOT NULL
                );
                "#,
            )
            .execute(&mut conn)
            .await
            .unwrap();

            let now = "2026-01-01T00:00:00.000Z";
            sqlx::query(
                "INSERT INTO campaigns (name, reference_year, status, created_at, updated_at) VALUES ('C', 2026, 'draft', ?1, ?1)",
            )
            .bind(now)
            .execute(&mut conn)
            .await
            .unwrap();
            sqlx::query(
                "INSERT INTO campaign_job_families (campaign_id, code, label, sort_order, created_at, updated_at) VALUES (1, 'F1', 'F1', 1, ?1, ?1)",
            )
            .bind(now)
            .execute(&mut conn)
            .await
            .unwrap();
            sqlx::query(
                "INSERT INTO campaign_grades (campaign_id, code, label, sort_order, created_at, updated_at) VALUES (1, 'G1', 'G1', 1, ?1, ?1)",
            )
            .bind(now)
            .execute(&mut conn)
            .await
            .unwrap();
            sqlx::query(
                "INSERT INTO hr_import_batches (campaign_id, status, source_file_name, source_format, source_sheet_name, file_size_bytes, source_row_count, imported_row_count, warning_count, imported_at, created_at) VALUES (1, 'current', 'a.xlsx', 'xlsx', 'P', 1, 1, 1, 0, ?1, ?1)",
            )
            .bind(now)
            .execute(&mut conn)
            .await
            .unwrap();
            sqlx::query(
                r#"
                INSERT INTO hr_import_employees (
                    import_batch_id, campaign_id, employee_number, employee_label,
                    job_family_id, grade_id, contract_type, employment_status, hire_date,
                    december_base_salary, confirmed_underperformer, source_row_number, created_at
                ) VALUES (1, 1, 'E1', 'Emp', 1, 1, 'cdi', 'active', '2020-01-01', 500000, 0, 2, ?1)
                "#,
            )
            .bind(now)
            .execute(&mut conn)
            .await
            .unwrap();

            for statement in MIGRATION_0006_SQL.split(';') {
                let trimmed = statement.trim();
                if trimmed.is_empty() || !trimmed.to_uppercase().contains("ALTER TABLE") {
                    continue;
                }
                sqlx::query(trimmed)
                    .execute(&mut conn)
                    .await
                    .unwrap_or_else(|e| panic!("0006 statement failed: {trimmed} — {e}"));
            }
        }

        let pool = SqlitePool::connect(&url).await.unwrap();
        let row: (Option<String>, Option<i64>, Option<i64>) = sqlx::query_as(
            "SELECT promotion_date, salary_before_promotion, previous_grade_id FROM hr_import_employees WHERE employee_number = 'E1'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert!(row.0.is_none());
        assert!(row.1.is_none());
        assert!(row.2.is_none());
        let salary: i64 = sqlx::query_scalar(
            "SELECT december_base_salary FROM hr_import_employees WHERE employee_number = 'E1'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(salary, 500_000);
        pool.close().await;
    }
}
