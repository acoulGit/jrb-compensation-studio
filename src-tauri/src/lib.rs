mod campaign_write;
mod hr_import;
mod local_access;
mod persistence;
mod simulation_excel_export;
mod simulation_persistence;
mod sqlite_local;

use local_access::AccessSessionState;
use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: persistence::MIGRATION_0001_VERSION,
            description: persistence::MIGRATION_0001_DESCRIPTION,
            sql: persistence::MIGRATION_0001_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: persistence::MIGRATION_0002_VERSION,
            description: persistence::MIGRATION_0002_DESCRIPTION,
            sql: persistence::MIGRATION_0002_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: persistence::MIGRATION_0003_VERSION,
            description: persistence::MIGRATION_0003_DESCRIPTION,
            sql: persistence::MIGRATION_0003_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: persistence::MIGRATION_0004_VERSION,
            description: persistence::MIGRATION_0004_DESCRIPTION,
            sql: persistence::MIGRATION_0004_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: persistence::MIGRATION_0005_VERSION,
            description: persistence::MIGRATION_0005_DESCRIPTION,
            sql: persistence::MIGRATION_0005_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: persistence::MIGRATION_0006_VERSION,
            description: persistence::MIGRATION_0006_DESCRIPTION,
            sql: persistence::MIGRATION_0006_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: persistence::MIGRATION_0007_VERSION,
            description: persistence::MIGRATION_0007_DESCRIPTION,
            sql: persistence::MIGRATION_0007_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: persistence::MIGRATION_0008_VERSION,
            description: persistence::MIGRATION_0008_DESCRIPTION,
            sql: persistence::MIGRATION_0008_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: persistence::MIGRATION_0009_VERSION,
            description: persistence::MIGRATION_0009_DESCRIPTION,
            sql: persistence::MIGRATION_0009_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: persistence::MIGRATION_0010_VERSION,
            description: persistence::MIGRATION_0010_DESCRIPTION,
            sql: persistence::MIGRATION_0010_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: persistence::MIGRATION_0011_VERSION,
            description: persistence::MIGRATION_0011_DESCRIPTION,
            sql: persistence::MIGRATION_0011_SQL,
            kind: MigrationKind::Up,
        },
        Migration {
            version: persistence::MIGRATION_0012_VERSION,
            description: persistence::MIGRATION_0012_DESCRIPTION,
            sql: persistence::MIGRATION_0012_SQL,
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .manage(AccessSessionState::new())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(persistence::DATABASE_URL, migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            local_access::commands::get_local_access_status,
            local_access::commands::setup_local_access,
            local_access::commands::unlock_local_access,
            local_access::commands::change_local_password,
            local_access::commands::lock_local_access,
            local_access::commands::activate_offline_license,
            hr_import::replace_current_population,
            campaign_write::archive_campaign,
            campaign_write::restore_campaign,
            campaign_write::activate_campaign,
            simulation_persistence::save_simulation_run,
            simulation_excel_export::export_simulation_run_excel,
            simulation_excel_export::generate_hr_export_password,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
