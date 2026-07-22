//! Export Excel RH d’une simulation de campagne (Lot 2B-E1 / R1).
//!
//! Génère un classeur XLSX à 5 feuilles à partir d’un snapshot de simulation
//! persisté (schema v3 / contrat v4), avec chiffrement agile optionnel et
//! écriture atomique. Les taux RH et statistiques sont dérivés exclusivement
//! des valeurs persistées (arithématique rationnelle exacte côté Rust).

mod atomic_write;
mod encrypt;
mod error;
mod load;
mod models;
mod numeric;
mod password;
mod rates;
mod sanitize;
mod workbook;

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use zeroize::Zeroizing;

use crate::sqlite_local::{
    close_connection, open_connection, resolve_app_database_path, sqlite_url_from_path,
};

use error::ExportError;
use load::load_snapshot;

pub use password::generate_password;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSimulationRunExcelInput {
    pub simulation_run_id: i64,
    pub output_path: String,
    pub password: Option<String>,
    pub confirm_unprotected_export: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSimulationRunExcelResult {
    pub output_path: String,
    pub file_name: String,
    pub size_bytes: u64,
    pub protected: bool,
    pub employee_count: i64,
    pub month_row_count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateHrExportPasswordResult {
    pub password: String,
    pub length: u32,
}

/// Valide le mot de passe fourni (ou l’absence de mot de passe confirmée).
///
/// Retourne le mot de passe protégé par `Zeroizing` s’il est présent.
fn validate_password(
    input: &ExportSimulationRunExcelInput,
) -> Result<Option<Zeroizing<String>>, ExportError> {
    match &input.password {
        Some(raw) => {
            if password::is_user_password_blank(raw) {
                return Err(ExportError::PasswordRequired);
            }
            if password::is_user_password_too_short(raw) {
                return Err(ExportError::PasswordTooShort);
            }
            Ok(Some(Zeroizing::new(raw.clone())))
        }
        None => {
            if !input.confirm_unprotected_export {
                return Err(ExportError::UnprotectedConfirmationRequired);
            }
            Ok(None)
        }
    }
}

/// Valide la destination : absolue, `.xlsx`, parent existant, non existante.
fn validate_output_path(output_path: &str) -> Result<PathBuf, ExportError> {
    let path = Path::new(output_path);
    if !path.is_absolute() {
        return Err(ExportError::DestinationInvalid);
    }
    match path.extension() {
        Some(ext) if ext.eq_ignore_ascii_case("xlsx") => {}
        _ => return Err(ExportError::DestinationInvalid),
    }
    let parent = path.parent().ok_or(ExportError::DestinationInvalid)?;
    if !parent.is_dir() {
        return Err(ExportError::DestinationInvalid);
    }
    if path.exists() {
        return Err(ExportError::DestinationAlreadyExists);
    }
    Ok(path.to_path_buf())
}

/// Neutralise un composant de nom de fichier pour Windows.
#[allow(dead_code)]
fn sanitize_file_component(component: &str) -> String {
    let mut out: String = component
        .chars()
        .map(|c| {
            if matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') || c.is_control() {
                '_'
            } else if c.is_whitespace() {
                '_'
            } else {
                c
            }
        })
        .collect();
    out = out.trim_matches(|c: char| c == '.' || c == '_').to_string();
    if out.is_empty() {
        out = "NA".to_string();
    }
    out
}

/// Construit le nom de fichier suggéré (sanitisé pour Windows).
///
/// Format : `JRB_Compensation_<Campagne>_Run_<Numero>_<Date>.xlsx`.
#[allow(dead_code)]
pub(crate) fn build_suggested_file_name(campaign: &str, run_number: i64, date: &str) -> String {
    format!(
        "JRB_Compensation_{}_Run_{}_{}.xlsx",
        sanitize_file_component(campaign),
        run_number,
        sanitize_file_component(date),
    )
}

/// Exécute l’export sur une URL SQLite (tests + commande).
pub async fn export_simulation_run_excel_on_url(
    database_url: &str,
    input: &ExportSimulationRunExcelInput,
) -> Result<ExportSimulationRunExcelResult, ExportError> {
    // 1) Validation des entrées (avant toute ouverture de base).
    let password = validate_password(input)?;
    // 2) Validation de la destination.
    let output = validate_output_path(&input.output_path)?;

    // 3) Ouverture / chargement / fermeture (fermeture TOUJOURS).
    let mut conn = open_connection(database_url).await?;
    let load_result = load_snapshot(&mut conn, input.simulation_run_id).await;
    let _ = close_connection(conn).await;
    let snapshot = load_result?;

    // 4) Génération du classeur en mémoire.
    let plain = workbook::build_workbook(&snapshot)?;

    // 5) Chiffrement agile optionnel (jamais de clair sur disque).
    let (bytes, protected) = match &password {
        Some(pw) => (encrypt::encrypt_agile(&plain, pw.as_str())?, true),
        None => (plain, false),
    };

    // 6) Écriture atomique.
    atomic_write::atomic_write(&output, &bytes)?;

    let size_bytes = fs::metadata(&output)
        .map(|meta| meta.len())
        .unwrap_or(bytes.len() as u64);
    let file_name = output
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_string();

    Ok(ExportSimulationRunExcelResult {
        output_path: output.to_string_lossy().into_owned(),
        file_name,
        size_bytes,
        protected,
        employee_count: snapshot.employee_count(),
        month_row_count: snapshot.month_row_count(),
    })
}

/// Commande Tauri : export XLSX RH d’une simulation.
#[tauri::command]
pub async fn export_simulation_run_excel(
    app: AppHandle,
    input: ExportSimulationRunExcelInput,
) -> Result<ExportSimulationRunExcelResult, String> {
    let path = resolve_app_database_path(&app).map_err(|error| error.user_message())?;
    let url = sqlite_url_from_path(&path).map_err(|error| error.user_message())?;

    match export_simulation_run_excel_on_url(&url, &input).await {
        Ok(result) => Ok(result),
        Err(error) => {
            if cfg!(debug_assertions) {
                // Aucun détail sensible (jamais le mot de passe).
                eprintln!("[EXPORT_SIMULATION_EXCEL_FAILED] code={}", error.code());
            }
            Err(error.user_message())
        }
    }
}

/// Commande Tauri : génère un mot de passe RH robuste (>= 20 caractères).
#[tauri::command]
pub fn generate_hr_export_password() -> GenerateHrExportPasswordResult {
    let password = generate_password();
    let length = password.chars().count() as u32;
    GenerateHrExportPasswordResult { password, length }
}

#[cfg(test)]
mod tests;
