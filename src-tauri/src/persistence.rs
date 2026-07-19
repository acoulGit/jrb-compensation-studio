//! Constantes de persistance locale partagées par le runtime et les tests Rust.

pub const DATABASE_URL: &str = "sqlite:jrb-compensation-studio.db";

pub const MIGRATION_0001_SQL: &str = include_str!("../migrations/0001_initial_persistence.sql");
pub const MIGRATION_0002_SQL: &str = include_str!("../migrations/0002_compensation_references.sql");
pub const MIGRATION_0003_SQL: &str = include_str!("../migrations/0003_hr_import.sql");
pub const MIGRATION_0004_SQL: &str =
    include_str!("../migrations/0004_compensation_calculation.sql");

pub const MIGRATION_0001_VERSION: i64 = 1;
pub const MIGRATION_0001_DESCRIPTION: &str = "initial_persistence";

pub const MIGRATION_0002_VERSION: i64 = 2;
pub const MIGRATION_0002_DESCRIPTION: &str = "compensation_references";

pub const MIGRATION_0003_VERSION: i64 = 3;
pub const MIGRATION_0003_DESCRIPTION: &str = "hr_import";

pub const MIGRATION_0004_VERSION: i64 = 4;
pub const MIGRATION_0004_DESCRIPTION: &str = "compensation_calculation";

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
        assert!(DATABASE_URL.starts_with("sqlite:"));
        assert_eq!(DATABASE_URL, "sqlite:jrb-compensation-studio.db");
    }

    #[test]
    fn migration_order_is_exactly_0001_0002_0003_0004() {
        assert_eq!(MIGRATION_0001_VERSION, 1);
        assert_eq!(MIGRATION_0002_VERSION, 2);
        assert_eq!(MIGRATION_0003_VERSION, 3);
        assert_eq!(MIGRATION_0004_VERSION, 4);
    }
}
