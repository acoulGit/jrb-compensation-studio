//! Constantes de persistance locale partagées par le runtime et les tests Rust.

pub const DATABASE_URL: &str = "sqlite:jrb-compensation-studio.db";

pub const MIGRATION_0001_SQL: &str = include_str!("../migrations/0001_initial_persistence.sql");

pub const MIGRATION_0001_VERSION: i64 = 1;
pub const MIGRATION_0001_DESCRIPTION: &str = "initial_persistence";

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
    fn migration_config_is_valid() {
        assert!(MIGRATION_0001_VERSION > 0);
        assert!(!MIGRATION_0001_DESCRIPTION.is_empty());
        assert!(!MIGRATION_0001_SQL.trim().is_empty());
        assert!(DATABASE_URL.starts_with("sqlite:"));
    }
}
