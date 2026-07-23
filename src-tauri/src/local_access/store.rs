//! Persistance SQLite dédiée à `local_access_state` (Lot 2B-RC1-SEC1-A).
//!
//! Les commandes d’accès peuvent s’exécuter avant que le plugin `tauri-plugin-sql`
//! n’ait ouvert la base et joué les migrations 0001+ (la fenêtre « access » ne
//! précharge jamais la base). On ouvre donc ici une connexion dédiée avec
//! `create_if_missing(true)` et on rejoue la migration 0010 de façon idempotente
//! (`CREATE TABLE IF NOT EXISTS`) avant toute lecture/écriture.
//!
//! Toute la logique métier opère sur une URL SQLite explicite (`*_on_url`, comme
//! dans les autres modules de persistance dédiée) : cela permet de tester ce
//! module avec une base temporaire, sans dépendre d’un `AppHandle` Tauri réel.

use std::str::FromStr;
use std::time::Duration;

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode};
use sqlx::{ConnectOptions, Row, Sqlite, SqliteConnection, Transaction};
use tauri::AppHandle;

use crate::persistence::{MIGRATION_0010_SQL, MIGRATION_0011_SQL};
use crate::sqlite_local::{resolve_app_database_path, sqlite_url_from_path};

use super::error::LocalAccessError;

const BUSY_TIMEOUT: Duration = Duration::from_millis(5_000);

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LocalAccessStateRow {
    pub installation_id: String,
    pub password_hash: String,
    pub installed_at: String,
    pub initial_valid_until: String,
    pub current_valid_until: String,
    pub last_observed_at: String,
    pub clock_anomaly_detected: bool,
}

/// Résout l’URL SQLite locale à partir de l’`AppHandle` (chemin résolu côté
/// Rust uniquement, jamais reçu du frontend).
pub fn resolve_database_url(app: &AppHandle) -> Result<String, LocalAccessError> {
    let path = resolve_app_database_path(app)?;
    Ok(sqlite_url_from_path(&path)?)
}

async fn open_create_if_missing(url: &str) -> Result<SqliteConnection, LocalAccessError> {
    let options = SqliteConnectOptions::from_str(url)
        .map_err(|error| LocalAccessError::Database(error.to_string()))?
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .busy_timeout(BUSY_TIMEOUT);
    let mut conn = options
        .connect()
        .await
        .map_err(|error| LocalAccessError::Database(error.to_string()))?;
    sqlx::query("PRAGMA busy_timeout = 5000")
        .execute(&mut conn)
        .await
        .map_err(|error| LocalAccessError::Database(error.to_string()))?;
    Ok(conn)
}

async fn ensure_schema(conn: &mut SqliteConnection) -> Result<(), LocalAccessError> {
    for statement in MIGRATION_0010_SQL.split(';') {
        let trimmed = statement.trim();
        if trimmed.is_empty() {
            continue;
        }
        sqlx::query(trimmed).execute(&mut *conn).await?;
    }
    // Lot 2B-RC1-SEC1-B — rejoue aussi la migration 0011 (`license_activations`)
    // de façon idempotente, pour les mêmes raisons que la migration 0010 (la
    // fenêtre `access` ne précharge jamais la base via le plugin SQL).
    for statement in MIGRATION_0011_SQL.split(';') {
        let trimmed = statement.trim();
        if trimmed.is_empty() {
            continue;
        }
        sqlx::query(trimmed).execute(&mut *conn).await?;
    }
    Ok(())
}

/// Ouvre (en la créant si besoin) la base pointée par `database_url` et garantit
/// que la table `local_access_state` existe, sans dépendre du plugin SQL.
pub async fn open_and_ensure_schema_on_url(
    database_url: &str,
) -> Result<SqliteConnection, LocalAccessError> {
    let mut conn = open_create_if_missing(database_url).await?;
    ensure_schema(&mut conn).await?;
    Ok(conn)
}

pub async fn fetch_state(
    conn: &mut SqliteConnection,
) -> Result<Option<LocalAccessStateRow>, LocalAccessError> {
    let row = sqlx::query(
        r#"
        SELECT installation_id, password_hash, installed_at, initial_valid_until,
               current_valid_until, last_observed_at, clock_anomaly_detected
        FROM local_access_state
        WHERE singleton_id = 1
        "#,
    )
    .fetch_optional(&mut *conn)
    .await?;

    Ok(row.map(|row| LocalAccessStateRow {
        installation_id: row.get("installation_id"),
        password_hash: row.get("password_hash"),
        installed_at: row.get("installed_at"),
        initial_valid_until: row.get("initial_valid_until"),
        current_valid_until: row.get("current_valid_until"),
        last_observed_at: row.get("last_observed_at"),
        clock_anomaly_detected: row.get::<i64, _>("clock_anomaly_detected") != 0,
    }))
}

/// Crée l’unique ligne singleton (`singleton_id = 1`). Échoue si elle existe déjà
/// (contrainte `PRIMARY KEY`) : l’appelant doit vérifier au préalable via
/// [`fetch_state`] pour renvoyer un message métier clair plutôt qu’une erreur SQL.
pub async fn insert_state(
    conn: &mut SqliteConnection,
    installation_id: &str,
    password_hash: &str,
    installed_at: &str,
    initial_valid_until: &str,
) -> Result<(), LocalAccessError> {
    sqlx::query(
        r#"
        INSERT INTO local_access_state (
            singleton_id, installation_id, password_hash, installed_at,
            initial_valid_until, current_valid_until, last_observed_at,
            clock_anomaly_detected, created_at, updated_at
        ) VALUES (1, ?1, ?2, ?3, ?4, ?4, ?3, 0, ?3, ?3)
        "#,
    )
    .bind(installation_id)
    .bind(password_hash)
    .bind(installed_at)
    .bind(initial_valid_until)
    .execute(&mut *conn)
    .await?;
    Ok(())
}

pub async fn update_password_hash(
    conn: &mut SqliteConnection,
    new_hash: &str,
    now: &str,
) -> Result<(), LocalAccessError> {
    let updated = sqlx::query(
        "UPDATE local_access_state SET password_hash = ?1, updated_at = ?2 WHERE singleton_id = 1",
    )
    .bind(new_hash)
    .bind(now)
    .execute(&mut *conn)
    .await?;
    if updated.rows_affected() != 1 {
        return Err(LocalAccessError::Database(
            "update_password_hash: rows_affected != 1".into(),
        ));
    }
    Ok(())
}

pub async fn update_clock_observation(
    conn: &mut SqliteConnection,
    last_observed_at: &str,
    clock_anomaly_detected: bool,
    now: &str,
) -> Result<(), LocalAccessError> {
    sqlx::query(
        r#"
        UPDATE local_access_state
        SET last_observed_at = ?1, clock_anomaly_detected = ?2, updated_at = ?3
        WHERE singleton_id = 1
        "#,
    )
    .bind(last_observed_at)
    .bind(if clock_anomaly_detected { 1 } else { 0 })
    .bind(now)
    .execute(&mut *conn)
    .await?;
    Ok(())
}

/// Met à jour la période de validité et lève toute anomalie d’horloge après
/// une activation de licence réussie, sans jamais toucher `password_hash`,
/// `installation_id` ni `initial_valid_until`. `last_observed_at` ne recule
/// jamais : il est porté au maximum de la valeur persistée et de `now_text`.
pub async fn update_validity_after_license_activation(
    tx: &mut Transaction<'_, Sqlite>,
    new_current_valid_until: &str,
    now_text: &str,
) -> Result<(), LocalAccessError> {
    let updated = sqlx::query(
        r#"
        UPDATE local_access_state
        SET current_valid_until = ?1,
            last_observed_at = CASE
                WHEN ?2 > last_observed_at THEN ?2
                ELSE last_observed_at
            END,
            clock_anomaly_detected = 0,
            updated_at = ?2
        WHERE singleton_id = 1
        "#,
    )
    .bind(new_current_valid_until)
    .bind(now_text)
    .execute(&mut **tx)
    .await?;
    if updated.rows_affected() != 1 {
        return Err(LocalAccessError::Database(
            "update_validity_after_license_activation: rows_affected != 1".into(),
        ));
    }
    Ok(())
}

/// Ligne d’historique d’une activation de licence (`license_activations`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LicenseActivationRow {
    pub license_id: String,
    pub installation_id: String,
    pub payload_json: String,
    pub payload_sha256: String,
    pub duration_months: u32,
    pub customer: Option<String>,
    pub issued_at: String,
    pub previous_valid_until: String,
    pub new_valid_until: String,
    pub activated_at: String,
}

/// Insère une ligne d’historique d’activation. Échoue si `license_id` existe
/// déjà (contrainte `UNIQUE`) — l’appelant doit avoir vérifié au préalable via
/// [`license_id_exists`] pour renvoyer un message métier clair.
pub async fn insert_license_activation(
    tx: &mut Transaction<'_, Sqlite>,
    row: &LicenseActivationRow,
    created_at: &str,
) -> Result<(), LocalAccessError> {
    sqlx::query(
        r#"
        INSERT INTO license_activations (
            license_id, installation_id, payload_json, payload_sha256,
            activated_at, issued_at, duration_months, previous_valid_until,
            new_valid_until, customer, created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
        "#,
    )
    .bind(&row.license_id)
    .bind(&row.installation_id)
    .bind(&row.payload_json)
    .bind(&row.payload_sha256)
    .bind(&row.activated_at)
    .bind(&row.issued_at)
    .bind(row.duration_months as i64)
    .bind(&row.previous_valid_until)
    .bind(&row.new_valid_until)
    .bind(&row.customer)
    .bind(created_at)
    .execute(&mut **tx)
    .await?;
    Ok(())
}

/// `true` si une activation porte déjà cet identifiant de licence (rejeu d’un
/// même code de licence, y compris depuis une autre installation).
pub async fn license_id_exists(
    conn: &mut SqliteConnection,
    license_id: &str,
) -> Result<bool, LocalAccessError> {
    let row = sqlx::query("SELECT 1 FROM license_activations WHERE license_id = ?1 LIMIT 1")
        .bind(license_id)
        .fetch_optional(&mut *conn)
        .await?;
    Ok(row.is_some())
}

/// La dernière activation enregistrée (la plus récente par `id`), utilisée
/// pour l’affichage diagnostic (statut) — jamais de secret dans cette ligne.
pub async fn fetch_latest_activation(
    conn: &mut SqliteConnection,
) -> Result<Option<LicenseActivationRow>, LocalAccessError> {
    let row = sqlx::query(
        r#"
        SELECT license_id, installation_id, payload_json, payload_sha256,
               duration_months, customer, issued_at,
               previous_valid_until, new_valid_until, activated_at
        FROM license_activations
        ORDER BY id DESC
        LIMIT 1
        "#,
    )
    .fetch_optional(&mut *conn)
    .await?;

    Ok(row.map(|row| LicenseActivationRow {
        license_id: row.get("license_id"),
        installation_id: row.get("installation_id"),
        payload_json: row.get("payload_json"),
        payload_sha256: row.get("payload_sha256"),
        duration_months: row.get::<i64, _>("duration_months") as u32,
        customer: row.get("customer"),
        issued_at: row.get("issued_at"),
        previous_valid_until: row.get("previous_valid_until"),
        new_valid_until: row.get("new_valid_until"),
        activated_at: row.get("activated_at"),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn temp_conn() -> (tempfile::TempDir, SqliteConnection) {
        let dir = tempfile::tempdir().expect("temp dir");
        let db_path = dir.path().join("local-access-store.db");
        let url = format!("sqlite:{}", db_path.to_str().unwrap());
        let conn = open_and_ensure_schema_on_url(&url).await.expect("open");
        (dir, conn)
    }

    #[tokio::test]
    async fn fetch_state_is_none_before_setup() {
        let (_dir, mut conn) = temp_conn().await;
        assert!(fetch_state(&mut conn).await.expect("fetch").is_none());
    }

    #[tokio::test]
    async fn insert_then_fetch_round_trips_row() {
        let (_dir, mut conn) = temp_conn().await;
        insert_state(
            &mut conn,
            "JRB-CS-00000000-00000000",
            "hash",
            "2026-01-01T00:00:00Z",
            "2026-11-01T00:00:00Z",
        )
        .await
        .expect("insert");

        let row = fetch_state(&mut conn)
            .await
            .expect("fetch")
            .expect("row present");
        assert_eq!(row.installation_id, "JRB-CS-00000000-00000000");
        assert_eq!(row.password_hash, "hash");
        assert_eq!(row.current_valid_until, "2026-11-01T00:00:00Z");
        assert!(!row.clock_anomaly_detected);
    }

    #[tokio::test]
    async fn insert_twice_fails_singleton_constraint() {
        let (_dir, mut conn) = temp_conn().await;
        insert_state(
            &mut conn,
            "id-1",
            "hash",
            "2026-01-01T00:00:00Z",
            "2026-11-01T00:00:00Z",
        )
        .await
        .expect("first insert");
        let second = insert_state(
            &mut conn,
            "id-2",
            "hash2",
            "2026-01-02T00:00:00Z",
            "2026-11-02T00:00:00Z",
        )
        .await;
        assert!(second.is_err());
    }

    #[tokio::test]
    async fn update_password_hash_persists_new_value() {
        let (_dir, mut conn) = temp_conn().await;
        insert_state(
            &mut conn,
            "id-1",
            "old-hash",
            "2026-01-01T00:00:00Z",
            "2026-11-01T00:00:00Z",
        )
        .await
        .expect("insert");
        update_password_hash(&mut conn, "new-hash", "2026-02-01T00:00:00Z")
            .await
            .expect("update");
        let row = fetch_state(&mut conn).await.expect("fetch").expect("row");
        assert_eq!(row.password_hash, "new-hash");
    }

    #[tokio::test]
    async fn update_clock_observation_persists_anomaly_flag() {
        let (_dir, mut conn) = temp_conn().await;
        insert_state(
            &mut conn,
            "id-1",
            "hash",
            "2026-01-01T00:00:00Z",
            "2026-11-01T00:00:00Z",
        )
        .await
        .expect("insert");
        update_clock_observation(
            &mut conn,
            "2026-01-01T00:00:00Z",
            true,
            "2026-01-01T00:00:00Z",
        )
        .await
        .expect("update");
        let row = fetch_state(&mut conn).await.expect("fetch").expect("row");
        assert!(row.clock_anomaly_detected);
    }

    #[tokio::test]
    async fn ensure_schema_is_idempotent() {
        let (_dir, mut conn) = temp_conn().await;
        insert_state(
            &mut conn,
            "id-1",
            "hash",
            "2026-01-01T00:00:00Z",
            "2026-11-01T00:00:00Z",
        )
        .await
        .expect("insert");
        // Réouverture + rejeu de la migration : ne doit ni échouer ni effacer la ligne.
        let url_row_still_present = fetch_state(&mut conn).await.expect("fetch").is_some();
        assert!(url_row_still_present);
    }
}
