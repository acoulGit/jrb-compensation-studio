//! Écritures campagne via connexion SQLite dédiée (transaction réelle).

use crate::sqlite_local::{
    close_connection, open_connection, resolve_app_database_path, sqlite_url_from_path,
    SqliteLocalError,
};
use serde::{Deserialize, Serialize};
use sqlx::{Connection, Row, SqliteConnection};
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignDto {
    pub id: i64,
    pub name: String,
    pub reference_year: i64,
    pub status: String,
    pub notes: String,
    pub created_at: String,
    pub updated_at: String,
    pub archived_at: Option<String>,
}

#[derive(Debug)]
pub enum CampaignWriteError {
    NotFound,
    InvalidState(String),
    Database(String),
}

impl CampaignWriteError {
    pub fn user_message(&self) -> String {
        match self {
            Self::InvalidState(message) => message.clone(),
            Self::NotFound => "Campagne introuvable.".into(),
            Self::Database(_) => "L’écriture de la campagne a échoué.".into(),
        }
    }

    pub fn technical_code(&self) -> &'static str {
        match self {
            Self::NotFound => "NOT_FOUND",
            Self::InvalidState(_) => "INVALID_STATE",
            Self::Database(_) => "DATABASE",
        }
    }
}

impl From<SqliteLocalError> for CampaignWriteError {
    fn from(value: SqliteLocalError) -> Self {
        Self::Database(value.to_string())
    }
}

impl From<sqlx::Error> for CampaignWriteError {
    fn from(value: sqlx::Error) -> Self {
        Self::Database(value.to_string())
    }
}

async fn fetch_campaign(
    conn: &mut SqliteConnection,
    campaign_id: i64,
) -> Result<Option<CampaignDto>, CampaignWriteError> {
    let row = sqlx::query(
        r#"
        SELECT id, name, reference_year, status, notes, created_at, updated_at, archived_at
        FROM campaigns
        WHERE id = ?1
        "#,
    )
    .bind(campaign_id)
    .fetch_optional(&mut *conn)
    .await?;

    Ok(row.map(|row| CampaignDto {
        id: row.get("id"),
        name: row.get("name"),
        reference_year: row.get("reference_year"),
        status: row.get("status"),
        notes: row.get("notes"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
        archived_at: row.get("archived_at"),
    }))
}

async fn utc_now_iso(conn: &mut SqliteConnection) -> Result<String, CampaignWriteError> {
    let value: String = sqlx::query_scalar("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")
        .fetch_one(&mut *conn)
        .await?;
    Ok(value)
}

/// Archive une campagne draft ou active (connexion dédiée, hors pool plugin).
pub async fn archive_campaign_on_url(
    database_url: &str,
    campaign_id: i64,
) -> Result<CampaignDto, CampaignWriteError> {
    let mut conn = open_connection(database_url).await?;
    let result = archive_campaign_on_conn(&mut conn, campaign_id).await;
    let _ = close_connection(conn).await;
    result
}

async fn archive_campaign_on_conn(
    conn: &mut SqliteConnection,
    campaign_id: i64,
) -> Result<CampaignDto, CampaignWriteError> {
    let existing = fetch_campaign(conn, campaign_id).await?;
    let Some(campaign) = existing else {
        return Err(CampaignWriteError::NotFound);
    };
    if campaign.status == "archived" {
        return Ok(campaign);
    }
    if campaign.status != "draft" && campaign.status != "active" {
        return Err(CampaignWriteError::InvalidState(
            "Seule une campagne brouillon ou active peut être archivée.".into(),
        ));
    }

    let now = utc_now_iso(conn).await?;
    let updated = sqlx::query(
        r#"
        UPDATE campaigns
        SET status = 'archived',
            archived_at = ?1,
            updated_at = ?2
        WHERE id = ?3
          AND status IN ('draft', 'active')
        "#,
    )
    .bind(&now)
    .bind(&now)
    .bind(campaign_id)
    .execute(&mut *conn)
    .await?;

    if updated.rows_affected() != 1 {
        return Err(CampaignWriteError::Database(format!(
            "archivage: rows_affected={}",
            updated.rows_affected()
        )));
    }

    let archived = fetch_campaign(conn, campaign_id)
        .await?
        .ok_or(CampaignWriteError::NotFound)?;
    if archived.status != "archived" || archived.archived_at.is_none() {
        return Err(CampaignWriteError::Database(
            "archivage: statut non persisté après UPDATE".into(),
        ));
    }
    Ok(archived)
}

/// Restaure une campagne archivée vers draft.
pub async fn restore_campaign_on_url(
    database_url: &str,
    campaign_id: i64,
) -> Result<CampaignDto, CampaignWriteError> {
    let mut conn = open_connection(database_url).await?;
    let result = restore_campaign_on_conn(&mut conn, campaign_id).await;
    let _ = close_connection(conn).await;
    result
}

async fn restore_campaign_on_conn(
    conn: &mut SqliteConnection,
    campaign_id: i64,
) -> Result<CampaignDto, CampaignWriteError> {
    let existing = fetch_campaign(conn, campaign_id).await?;
    let Some(campaign) = existing else {
        return Err(CampaignWriteError::NotFound);
    };
    if campaign.status != "archived" {
        return Err(CampaignWriteError::InvalidState(
            "Seule une campagne archivée peut être restaurée.".into(),
        ));
    }

    let now = utc_now_iso(conn).await?;
    let updated = sqlx::query(
        r#"
        UPDATE campaigns
        SET status = 'draft',
            archived_at = NULL,
            updated_at = ?1
        WHERE id = ?2
          AND status = 'archived'
        "#,
    )
    .bind(&now)
    .bind(campaign_id)
    .execute(&mut *conn)
    .await?;

    if updated.rows_affected() != 1 {
        return Err(CampaignWriteError::Database(format!(
            "restauration: rows_affected={}",
            updated.rows_affected()
        )));
    }

    let restored = fetch_campaign(conn, campaign_id)
        .await?
        .ok_or(CampaignWriteError::NotFound)?;
    if restored.status != "draft" || restored.archived_at.is_some() {
        return Err(CampaignWriteError::Database(
            "restauration: statut non persisté après UPDATE".into(),
        ));
    }
    Ok(restored)
}

/// Active une campagne (désactive l’éventuelle active) dans une vraie transaction.
pub async fn activate_campaign_on_url(
    database_url: &str,
    campaign_id: i64,
) -> Result<CampaignDto, CampaignWriteError> {
    let mut conn = open_connection(database_url).await?;
    let result = activate_campaign_on_conn(&mut conn, campaign_id).await;
    let _ = close_connection(conn).await;
    result
}

async fn activate_campaign_on_conn(
    conn: &mut SqliteConnection,
    campaign_id: i64,
) -> Result<CampaignDto, CampaignWriteError> {
    let existing = fetch_campaign(conn, campaign_id).await?;
    let Some(campaign) = existing else {
        return Err(CampaignWriteError::NotFound);
    };
    if campaign.status == "archived" {
        return Err(CampaignWriteError::InvalidState(
            "Une campagne archivée doit d’abord être restaurée avant d’être activée.".into(),
        ));
    }
    if campaign.status == "active" {
        return Ok(campaign);
    }

    let now = utc_now_iso(conn).await?;
    let mut tx = conn.begin().await?;

    sqlx::query(
        r#"
        UPDATE campaigns
        SET status = 'draft', updated_at = ?1
        WHERE status = 'active'
        "#,
    )
    .bind(&now)
    .execute(&mut *tx)
    .await?;

    let activated = sqlx::query(
        r#"
        UPDATE campaigns
        SET status = 'active', archived_at = NULL, updated_at = ?1
        WHERE id = ?2
          AND status = 'draft'
        "#,
    )
    .bind(&now)
    .bind(campaign_id)
    .execute(&mut *tx)
    .await?;

    if activated.rows_affected() != 1 {
        let _ = tx.rollback().await;
        return Err(CampaignWriteError::Database(format!(
            "activation: rows_affected={}",
            activated.rows_affected()
        )));
    }

    tx.commit().await?;

    let result = fetch_campaign(conn, campaign_id)
        .await?
        .ok_or(CampaignWriteError::NotFound)?;
    if result.status != "active" {
        return Err(CampaignWriteError::Database(
            "activation: statut non persisté après COMMIT".into(),
        ));
    }
    Ok(result)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CampaignIdInput {
    pub campaign_id: i64,
}

fn map_command_error(error: CampaignWriteError) -> String {
    if cfg!(debug_assertions) {
        let detail = match &error {
            CampaignWriteError::Database(message) => message.as_str(),
            CampaignWriteError::InvalidState(message) => message.as_str(),
            CampaignWriteError::NotFound => "not_found",
        };
        eprintln!(
            "[CAMPAIGN_WRITE_FAILED] code={} detail_len={}",
            error.technical_code(),
            detail.len()
        );
    }
    error.user_message()
}

#[tauri::command]
pub async fn archive_campaign(
    app: AppHandle,
    input: CampaignIdInput,
) -> Result<CampaignDto, String> {
    crate::local_access::require_unlocked_and_licensed(&app).await?;
    let path = resolve_app_database_path(&app).map_err(|e| e.to_string())?;
    let url = sqlite_url_from_path(&path).map_err(|e| e.to_string())?;
    archive_campaign_on_url(&url, input.campaign_id)
        .await
        .map_err(map_command_error)
}

#[tauri::command]
pub async fn restore_campaign(
    app: AppHandle,
    input: CampaignIdInput,
) -> Result<CampaignDto, String> {
    crate::local_access::require_unlocked_and_licensed(&app).await?;
    let path = resolve_app_database_path(&app).map_err(|e| e.to_string())?;
    let url = sqlite_url_from_path(&path).map_err(|e| e.to_string())?;
    restore_campaign_on_url(&url, input.campaign_id)
        .await
        .map_err(map_command_error)
}

#[tauri::command]
pub async fn activate_campaign(
    app: AppHandle,
    input: CampaignIdInput,
) -> Result<CampaignDto, String> {
    crate::local_access::require_unlocked_and_licensed(&app).await?;
    let path = resolve_app_database_path(&app).map_err(|e| e.to_string())?;
    let url = sqlite_url_from_path(&path).map_err(|e| e.to_string())?;
    activate_campaign_on_url(&url, input.campaign_id)
        .await
        .map_err(map_command_error)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqliteConnectOptions;
    use sqlx::{ConnectOptions, Connection, SqlitePool};
    use std::str::FromStr;

    const SCHEMA: &str = r#"
        PRAGMA foreign_keys = ON;
        CREATE TABLE campaigns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            reference_year INTEGER NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            archived_at TEXT NULL
        );
        CREATE UNIQUE INDEX ux_campaigns_one_active ON campaigns(status) WHERE status = 'active';
    "#;

    async fn setup_db() -> (tempfile::TempDir, String, i64) {
        let dir = tempfile::tempdir().expect("temp dir");
        let db_path = dir.path().join("campaign-write.db");
        let url = format!("sqlite:{}", db_path.to_str().unwrap());

        let options = SqliteConnectOptions::from_str(&url)
            .unwrap()
            .create_if_missing(true)
            .foreign_keys(true);
        let mut conn = options.connect().await.expect("connect");
        for statement in SCHEMA.split(';') {
            let trimmed = statement.trim();
            if !trimmed.is_empty() {
                sqlx::query(trimmed)
                    .execute(&mut conn)
                    .await
                    .expect("schema");
            }
        }
        let insert = sqlx::query(
            r#"
            INSERT INTO campaigns (name, reference_year, status, notes, created_at, updated_at, archived_at)
            VALUES ('Campagne recette Lot 1B', 2028, 'draft', '', '2026-07-19T00:00:00.000Z', '2026-07-19T00:00:00.000Z', NULL)
            "#,
        )
        .execute(&mut conn)
        .await
        .expect("insert");
        close_connection(conn).await.expect("close setup");

        (dir, url, insert.last_insert_rowid())
    }

    #[tokio::test]
    async fn archives_draft_campaign_with_archived_at() {
        let (_dir, url, campaign_id) = setup_db().await;
        let archived = archive_campaign_on_url(&url, campaign_id)
            .await
            .expect("archive");
        assert_eq!(archived.status, "archived");
        assert!(archived.archived_at.is_some());

        let pool = SqlitePool::connect(&url).await.expect("pool");
        let status: String = sqlx::query_scalar("SELECT status FROM campaigns WHERE id = ?1")
            .bind(campaign_id)
            .fetch_one(&pool)
            .await
            .expect("status");
        let archived_at: Option<String> =
            sqlx::query_scalar("SELECT archived_at FROM campaigns WHERE id = ?1")
                .bind(campaign_id)
                .fetch_one(&pool)
                .await
                .expect("archived_at");
        assert_eq!(status, "archived");
        assert!(archived_at.is_some());
        pool.close().await;
    }

    #[tokio::test]
    async fn restore_returns_draft_and_clears_archived_at() {
        let (_dir, url, campaign_id) = setup_db().await;
        archive_campaign_on_url(&url, campaign_id)
            .await
            .expect("archive");
        let restored = restore_campaign_on_url(&url, campaign_id)
            .await
            .expect("restore");
        assert_eq!(restored.status, "draft");
        assert!(restored.archived_at.is_none());
    }

    #[tokio::test]
    async fn archive_works_immediately_after_writer_connection_closed() {
        let (_dir, url, campaign_id) = setup_db().await;

        // Simule la commande d’import : writer dédié commit + close.
        {
            let mut conn = open_connection(&url).await.expect("open writer");
            let mut tx = conn.begin().await.expect("begin");
            sqlx::query("UPDATE campaigns SET notes = 'after-import' WHERE id = ?1")
                .bind(campaign_id)
                .execute(&mut *tx)
                .await
                .expect("touch");
            tx.commit().await.expect("commit");
            close_connection(conn).await.expect("close writer");
        }

        let archived = archive_campaign_on_url(&url, campaign_id)
            .await
            .expect("archive after writer close");
        assert_eq!(archived.status, "archived");
    }

    /// Recette manuelle AppData : archive « Campagne recette Lot 1B » (id=3).
    /// Ignoré par défaut — lancer avec `--ignored` après arrêt de l’app.
    #[tokio::test]
    #[ignore = "recette AppData archivage Lot 1C"]
    async fn recipe_appdata_archive_campagne_lot_1b() {
        let db = std::path::PathBuf::from(
            r"C:\Users\HP\AppData\Roaming\com.jrbxsolutions.compensationstudio\jrb-compensation-studio.db",
        );
        assert!(db.exists(), "base AppData absente");
        let url = sqlite_url_from_path(&db).expect("url");
        let archived = archive_campaign_on_url(&url, 3)
            .await
            .expect("archive id=3");
        assert_eq!(archived.name, "Campagne recette Lot 1B");
        assert_eq!(archived.status, "archived");
        assert!(archived.archived_at.is_some());
    }

    /// Recette manuelle AppData : restaure id=3 vers draft et vérifie les référentiels.
    #[tokio::test]
    #[ignore = "recette AppData restauration Lot 1C"]
    async fn recipe_appdata_restore_campagne_lot_1b() {
        let db = std::path::PathBuf::from(
            r"C:\Users\HP\AppData\Roaming\com.jrbxsolutions.compensationstudio\jrb-compensation-studio.db",
        );
        assert!(db.exists(), "base AppData absente");
        let url = sqlite_url_from_path(&db).expect("url");
        let restored = restore_campaign_on_url(&url, 3)
            .await
            .expect("restore id=3");
        assert_eq!(restored.status, "draft");
        assert!(restored.archived_at.is_none());

        let pool = SqlitePool::connect(&url).await.expect("pool");
        let families: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM campaign_job_families WHERE campaign_id = 3")
                .fetch_one(&pool)
                .await
                .expect("families");
        let grades: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM campaign_grades WHERE campaign_id = 3")
                .fetch_one(&pool)
                .await
                .expect("grades");
        assert_eq!(families, 5);
        assert_eq!(grades, 6);
        pool.close().await;
    }

    #[tokio::test]
    async fn pool_begin_without_commit_blocks_other_writers() {
        let (_dir, url, campaign_id) = setup_db().await;
        let pool = sqlx::sqlite::SqlitePoolOptions::new()
            .max_connections(2)
            .connect(&url)
            .await
            .expect("pool");

        // Anti-pattern du plugin SQL : BEGIN sur une connexion du pool.
        let mut poisoned = pool.acquire().await.expect("acquire");
        sqlx::query("BEGIN IMMEDIATE")
            .execute(&mut *poisoned)
            .await
            .expect("begin");

        // Une autre connexion ne peut ni configurer ni écrire tant que le BEGIN orphelin vit.
        let open_err = open_connection(&url).await.err().map(|e| e.to_string());
        let update_err = if open_err.is_none() {
            let mut other = open_connection(&url).await.expect("other");
            sqlx::query("PRAGMA busy_timeout = 100")
                .execute(&mut other)
                .await
                .ok();
            let err = sqlx::query(
                r#"
                UPDATE campaigns
                SET status = 'archived',
                    archived_at = '2026-07-19T00:00:00.000Z',
                    updated_at = '2026-07-19T00:00:00.000Z'
                WHERE id = ?1 AND status = 'draft'
                "#,
            )
            .bind(campaign_id)
            .execute(&mut other)
            .await
            .err()
            .map(|e| e.to_string());
            let _ = close_connection(other).await;
            err
        } else {
            open_err
        };

        let message = update_err.expect("must fail").to_lowercase();
        assert!(
            message.contains("locked") || message.contains("busy"),
            "unexpected error: {message}"
        );

        sqlx::query("ROLLBACK")
            .execute(&mut *poisoned)
            .await
            .expect("rollback");
        drop(poisoned);
        pool.close().await;
    }
}
