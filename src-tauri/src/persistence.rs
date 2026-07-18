//! Constantes de persistance locale partagées par le runtime et les tests Rust.

pub const DATABASE_URL: &str = "sqlite:jrb-compensation-studio.db";

pub const MIGRATION_0001_SQL: &str = include_str!("../migrations/0001_initial_persistence.sql");
pub const MIGRATION_0002_SQL: &str = include_str!("../migrations/0002_compensation_references.sql");

pub const MIGRATION_0001_VERSION: i64 = 1;
pub const MIGRATION_0001_DESCRIPTION: &str = "initial_persistence";

pub const MIGRATION_0002_VERSION: i64 = 2;
pub const MIGRATION_0002_DESCRIPTION: &str = "compensation_references";

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
        assert!(MIGRATION_0002_SQL.contains("campaign_salary_grid"));
        assert!(MIGRATION_0002_SQL.contains("campaign_salary_positions"));
        assert!(MIGRATION_0002_SQL.contains("campaign_performance_factors"));
        assert!(MIGRATION_0002_SQL.contains("campaign_potential_factors"));
        assert!(MIGRATION_0002_SQL.contains("campaign_nine_box_factors"));
        assert!(MIGRATION_0002_SQL.contains("nine_box_mode"));
        assert!(MIGRATION_0002_SQL.contains("position_factor_milli"));
        assert!(MIGRATION_0002_SQL.contains("factor_milli"));
        assert!(MIGRATION_0002_SQL.contains("reference_ratio_bps"));
        assert!(!MIGRATION_0002_SQL.contains("REAL"));
    }

    #[test]
    fn migration_config_is_valid() {
        assert!(MIGRATION_0001_VERSION > 0);
        assert!(!MIGRATION_0001_DESCRIPTION.is_empty());
        assert!(!MIGRATION_0001_SQL.trim().is_empty());
        assert!(MIGRATION_0002_VERSION > 0);
        assert!(!MIGRATION_0002_DESCRIPTION.is_empty());
        assert!(!MIGRATION_0002_SQL.trim().is_empty());
        assert!(DATABASE_URL.starts_with("sqlite:"));
        assert_eq!(DATABASE_URL, "sqlite:jrb-compensation-studio.db");
    }

    #[test]
    fn migration_order_is_exactly_0001_then_0002() {
        assert_eq!(MIGRATION_0001_VERSION, 1);
        assert_eq!(MIGRATION_0002_VERSION, 2);
        assert_eq!(MIGRATION_0002_VERSION - MIGRATION_0001_VERSION, 1);
    }
}
