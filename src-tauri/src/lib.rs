mod campaign_write;
mod hr_import;
mod persistence;
mod sqlite_local;

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
    ];

    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(persistence::DATABASE_URL, migrations)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            hr_import::replace_current_population,
            campaign_write::archive_campaign,
            campaign_write::restore_campaign,
            campaign_write::activate_campaign,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
