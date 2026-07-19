//! Connexion SQLite locale dédiée (hors pool du plugin SQL).

use sqlx::sqlite::{SqliteConnectOptions, SqliteConnection};
use sqlx::{ConnectOptions, Connection};
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::time::Duration;
use tauri::{AppHandle, Manager};

const DATABASE_FILE_NAME: &str = "jrb-compensation-studio.db";
const BUSY_TIMEOUT: Duration = Duration::from_millis(5_000);

#[derive(Debug)]
pub enum SqliteLocalError {
    Message(String),
}

impl SqliteLocalError {
    pub fn database(message: impl Into<String>) -> Self {
        Self::Message(message.into())
    }

    pub fn user_message(&self) -> String {
        "La base locale n’a pas pu être ouverte.".into()
    }
}

impl std::fmt::Display for SqliteLocalError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Message(message) => write!(f, "{message}"),
        }
    }
}

impl From<sqlx::Error> for SqliteLocalError {
    fn from(value: sqlx::Error) -> Self {
        Self::Message(value.to_string())
    }
}

/// Résout le fichier SQLite local sans recevoir de chemin du frontend.
pub fn resolve_app_database_path(app: &AppHandle) -> Result<PathBuf, SqliteLocalError> {
    let mut dir = app
        .path()
        .app_config_dir()
        .map_err(|error| SqliteLocalError::database(error.to_string()))?;
    std::fs::create_dir_all(&dir).map_err(|error| SqliteLocalError::database(error.to_string()))?;
    dir.push(DATABASE_FILE_NAME);
    Ok(dir)
}

pub fn sqlite_url_from_path(path: &Path) -> Result<String, SqliteLocalError> {
    let path_str = path
        .to_str()
        .ok_or_else(|| SqliteLocalError::database("Chemin de base invalide."))?;
    Ok(format!("sqlite:{path_str}"))
}

/// Ouvre une connexion unique avec WAL + busy_timeout (cohérent pour les écritures).
pub async fn open_connection(database_url: &str) -> Result<SqliteConnection, SqliteLocalError> {
    let options = SqliteConnectOptions::from_str(database_url)
        .map_err(|error| SqliteLocalError::database(error.to_string()))?
        .create_if_missing(false)
        .foreign_keys(true)
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .busy_timeout(BUSY_TIMEOUT);
    let mut conn = options
        .connect()
        .await
        .map_err(|error| SqliteLocalError::database(error.to_string()))?;
    // Renforce le timeout côté connexion (certaines builds sqlx ne l’appliquent qu’à l’open).
    sqlx::query("PRAGMA busy_timeout = 5000")
        .execute(&mut conn)
        .await?;
    Ok(conn)
}

pub async fn close_connection(conn: SqliteConnection) -> Result<(), SqliteLocalError> {
    conn.close()
        .await
        .map_err(|error| SqliteLocalError::database(error.to_string()))
}
