//! Commandes Tauri du module d’accès local (Lot 2B-RC1-SEC1-A).
//!
//! La logique métier (`*_on_url`) opère sur une URL SQLite explicite et ne
//! dépend jamais d’un `AppHandle`, ce qui permet de la tester avec une base
//! temporaire (voir `local_access::tests`). Les commandes `#[tauri::command]`
//! ne font que résoudre l’URL, déléguer à la logique pure, puis appliquer les
//! effets de bord Tauri (session en mémoire, bascule de fenêtre).
//!
//! Aucune commande ne renvoie de secret (mot de passe, hachage). Les échecs
//! internes (SQL, format de date) sont journalisés côté diagnostic via
//! `LocalAccessError::code()` uniquement en build debug — jamais le détail brut.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, WebviewWindow};
use zeroize::Zeroizing;

use crate::sqlite_local::close_connection;

use super::calendar;
use super::error::LocalAccessError;
use super::evaluate_and_persist_clock;
use super::password;
use super::state::AccessSessionState;
use super::store::{self, LocalAccessStateRow};
use super::windows;
use super::windows::{ACCESS_WINDOW_LABEL, MAIN_WINDOW_LABEL};

/// État public de l’accès local, sans aucun secret. Utilisé par l’écran
/// d’accès pour choisir entre configuration initiale, saisie du mot de passe,
/// période expirée ou anomalie d’horloge.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalAccessStatusDto {
    pub is_set_up: bool,
    pub is_unlocked: bool,
    pub is_expired: bool,
    pub clock_anomaly_detected: bool,
    pub installation_id: Option<String>,
    pub initial_valid_until: Option<String>,
    pub current_valid_until: Option<String>,
    /// Jours civils restants avant expiration (`None` si non calculable).
    pub remaining_days: Option<i64>,
}

impl LocalAccessStatusDto {
    fn not_set_up() -> Self {
        Self {
            is_set_up: false,
            is_unlocked: false,
            is_expired: false,
            clock_anomaly_detected: false,
            installation_id: None,
            initial_valid_until: None,
            current_valid_until: None,
            remaining_days: None,
        }
    }

    fn from_row(
        row: &LocalAccessStateRow,
        is_unlocked: bool,
        is_expired: bool,
        clock_anomaly_detected: bool,
    ) -> Self {
        let remaining_days =
            calendar::remaining_days_until(calendar::now_utc(), &row.current_valid_until);
        Self {
            is_set_up: true,
            is_unlocked,
            is_expired,
            clock_anomaly_detected,
            installation_id: Some(row.installation_id.clone()),
            initial_valid_until: Some(row.initial_valid_until.clone()),
            current_valid_until: Some(row.current_valid_until.clone()),
            remaining_days,
        }
    }
}

fn log_failure(context: &str, error: &LocalAccessError) {
    if cfg!(debug_assertions) {
        eprintln!(
            "[LOCAL_ACCESS_FAILED] context={context} code={}",
            error.code()
        );
    }
}

/// Cliché d’état pour l’écran d’accès (pas de secret) : ligne persistée
/// (absente si jamais configuré) et évaluation horloge/licence associée.
pub(crate) struct StatusSnapshot {
    pub row: Option<LocalAccessStateRow>,
    pub expired: bool,
    pub clock_anomaly: bool,
}

pub(crate) async fn load_status_on_url(
    database_url: &str,
) -> Result<StatusSnapshot, LocalAccessError> {
    let mut conn = store::open_and_ensure_schema_on_url(database_url).await?;
    let outcome = async {
        let Some(row) = store::fetch_state(&mut conn).await? else {
            return Ok(StatusSnapshot {
                row: None,
                expired: false,
                clock_anomaly: false,
            });
        };
        let evaluation = evaluate_and_persist_clock(&mut conn, &row).await?;
        // Relit la ligne : `evaluate_and_persist_clock` peut avoir avancé
        // `last_observed_at` (ou levé l’anomalie) depuis le `row` chargé plus haut.
        let refreshed = store::fetch_state(&mut conn).await?.unwrap_or(row);
        Ok(StatusSnapshot {
            row: Some(refreshed),
            expired: evaluation.expired,
            clock_anomaly: evaluation.clock_anomaly,
        })
    }
    .await;
    let _ = close_connection(conn).await;
    outcome
}

/// Commande Tauri : état courant de l’accès local (aucun secret renvoyé).
#[tauri::command]
pub async fn get_local_access_status(app: AppHandle) -> Result<LocalAccessStatusDto, String> {
    let url = store::resolve_database_url(&app).map_err(|error| error.user_message())?;
    let session = app.state::<AccessSessionState>();
    let snapshot = load_status_on_url(&url).await.map_err(|error| {
        log_failure("get_local_access_status", &error);
        error.user_message()
    })?;
    Ok(match snapshot.row {
        None => LocalAccessStatusDto::not_set_up(),
        Some(row) => LocalAccessStatusDto::from_row(
            &row,
            session.is_unlocked(),
            snapshot.expired,
            snapshot.clock_anomaly,
        ),
    })
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupLocalAccessInput {
    pub password: String,
    pub password_confirmation: String,
}

/// Configure le mot de passe initial et la période de validité (10 mois
/// civils). Échoue si un accès est déjà configuré sur cette base.
pub(crate) async fn setup_local_access_on_url(
    database_url: &str,
    input: &SetupLocalAccessInput,
) -> Result<LocalAccessStateRow, LocalAccessError> {
    let password = Zeroizing::new(input.password.clone());
    let confirmation = Zeroizing::new(input.password_confirmation.clone());
    password::validate_password_policy(&password)?;
    if password.as_str() != confirmation.as_str() {
        return Err(LocalAccessError::Validation(
            "Les deux mots de passe saisis ne correspondent pas.".into(),
        ));
    }

    let mut conn = store::open_and_ensure_schema_on_url(database_url).await?;
    let outcome = async {
        if store::fetch_state(&mut conn).await?.is_some() {
            return Err(LocalAccessError::AlreadySetUp);
        }

        let hash = password::hash_password(&password)?;
        let now = calendar::now_utc();
        let valid_until = calendar::initial_valid_until(now);
        let now_text = calendar::to_rfc3339(now)?;
        let valid_until_text = calendar::to_rfc3339(valid_until)?;
        let installation_id = password::generate_installation_id();

        store::insert_state(
            &mut conn,
            &installation_id,
            &hash,
            &now_text,
            &valid_until_text,
        )
        .await?;

        Ok(LocalAccessStateRow {
            installation_id,
            password_hash: hash,
            installed_at: now_text.clone(),
            initial_valid_until: valid_until_text.clone(),
            current_valid_until: valid_until_text,
            last_observed_at: now_text,
            clock_anomaly_detected: false,
        })
    }
    .await;
    let _ = close_connection(conn).await;
    outcome
}

/// Variante testable : vérifie le label de fenêtre avant toute lecture/écriture.
pub(crate) async fn setup_local_access_for_window(
    window_label: &str,
    database_url: &str,
    input: &SetupLocalAccessInput,
) -> Result<LocalAccessStateRow, LocalAccessError> {
    windows::require_window_label(window_label, ACCESS_WINDOW_LABEL)?;
    setup_local_access_on_url(database_url, input).await
}

/// Commande Tauri : configuration initiale du mot de passe local. Réservée à
/// la fenêtre `access`. Échoue aussi si un accès est déjà configuré.
#[tauri::command]
pub async fn setup_local_access(
    window: WebviewWindow,
    app: AppHandle,
    input: SetupLocalAccessInput,
) -> Result<LocalAccessStatusDto, String> {
    let url = store::resolve_database_url(&app).map_err(|error| error.user_message())?;
    let row = setup_local_access_for_window(window.label(), &url, &input)
        .await
        .map_err(|error| {
            log_failure("setup_local_access", &error);
            error.user_message()
        })?;

    let session = app.state::<AccessSessionState>();
    session.set_unlocked(true);
    windows::ensure_main_window(&app)?;

    Ok(LocalAccessStatusDto::from_row(&row, true, false, false))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnlockLocalAccessInput {
    pub password: String,
}

/// Vérifie le mot de passe, l’horloge système et la période de validité.
pub(crate) async fn unlock_local_access_on_url(
    database_url: &str,
    input: &UnlockLocalAccessInput,
) -> Result<LocalAccessStateRow, LocalAccessError> {
    let password = Zeroizing::new(input.password.clone());
    if password.trim().is_empty() {
        return Err(LocalAccessError::InvalidCredentials);
    }

    let mut conn = store::open_and_ensure_schema_on_url(database_url).await?;
    let outcome = async {
        let row = store::fetch_state(&mut conn)
            .await?
            .ok_or(LocalAccessError::NotSetUp)?;

        if !password::verify_password(&password, &row.password_hash)? {
            return Err(LocalAccessError::InvalidCredentials);
        }

        let evaluation = evaluate_and_persist_clock(&mut conn, &row).await?;
        if evaluation.clock_anomaly {
            return Err(LocalAccessError::ClockAnomaly);
        }
        if evaluation.expired {
            return Err(LocalAccessError::LicenseExpired);
        }
        Ok(row)
    }
    .await;
    let _ = close_connection(conn).await;
    outcome
}

/// Variante testable : vérifie le label de fenêtre avant toute vérification
/// de mot de passe / horloge / expiration.
pub(crate) async fn unlock_local_access_for_window(
    window_label: &str,
    database_url: &str,
    input: &UnlockLocalAccessInput,
) -> Result<LocalAccessStateRow, LocalAccessError> {
    windows::require_window_label(window_label, ACCESS_WINDOW_LABEL)?;
    unlock_local_access_on_url(database_url, input).await
}

/// Commande Tauri : déverrouillage par mot de passe. Réservée à la fenêtre
/// `access`. Un mot de passe correct ne déverrouille pas une session expirée
/// ou dont l’horloge est jugée anormale.
#[tauri::command]
pub async fn unlock_local_access(
    window: WebviewWindow,
    app: AppHandle,
    input: UnlockLocalAccessInput,
) -> Result<LocalAccessStatusDto, String> {
    let url = store::resolve_database_url(&app).map_err(|error| error.user_message())?;
    let row = match unlock_local_access_for_window(window.label(), &url, &input).await {
        Ok(row) => row,
        Err(error) => {
            if matches!(error, LocalAccessError::InvalidCredentials) {
                app.state::<AccessSessionState>().record_unlock_failure();
            }
            log_failure("unlock_local_access", &error);
            return Err(error.user_message());
        }
    };

    let session = app.state::<AccessSessionState>();
    session.set_unlocked(true);
    windows::ensure_main_window(&app)?;

    Ok(LocalAccessStatusDto::from_row(&row, true, false, false))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeLocalPasswordInput {
    pub old_password: String,
    pub new_password: String,
    pub new_password_confirmation: String,
}

/// Vérifie l’ancien mot de passe puis persiste le nouveau hachage. N’effectue
/// pas la vérification de session déverrouillée (à la charge de l’appelant,
/// qui dispose de l’`AccessSessionState`).
pub(crate) async fn change_local_password_on_url(
    database_url: &str,
    input: &ChangeLocalPasswordInput,
) -> Result<(), LocalAccessError> {
    let old_password = Zeroizing::new(input.old_password.clone());
    let new_password = Zeroizing::new(input.new_password.clone());
    let new_confirmation = Zeroizing::new(input.new_password_confirmation.clone());

    password::validate_password_policy(&new_password)?;
    if new_password.as_str() != new_confirmation.as_str() {
        return Err(LocalAccessError::Validation(
            "Les deux nouveaux mots de passe ne correspondent pas.".into(),
        ));
    }

    let mut conn = store::open_and_ensure_schema_on_url(database_url).await?;
    let outcome = async {
        let row = store::fetch_state(&mut conn)
            .await?
            .ok_or(LocalAccessError::NotSetUp)?;

        if !password::verify_password(&old_password, &row.password_hash)? {
            return Err(LocalAccessError::InvalidCredentials);
        }
        if new_password.as_str() == old_password.as_str() {
            return Err(LocalAccessError::Validation(
                "Le nouveau mot de passe doit être différent de l’ancien.".into(),
            ));
        }

        let hash = password::hash_password(&new_password)?;
        let now_text = calendar::to_rfc3339(calendar::now_utc())?;
        store::update_password_hash(&mut conn, &hash, &now_text).await?;
        Ok(())
    }
    .await;
    let _ = close_connection(conn).await;
    outcome
}

/// Variante testable : label `main` + session déverrouillée avant toute
/// lecture/écriture de hachage.
pub(crate) async fn change_local_password_for_window(
    window_label: &str,
    session: &AccessSessionState,
    database_url: &str,
    input: &ChangeLocalPasswordInput,
) -> Result<(), LocalAccessError> {
    windows::require_window_label(window_label, MAIN_WINDOW_LABEL)?;
    if !session.is_unlocked() {
        return Err(LocalAccessError::SessionLocked);
    }
    change_local_password_on_url(database_url, input).await
}

/// Commande Tauri : changement de mot de passe. Réservée à `main`, session
/// déverrouillée, ancien mot de passe correct.
#[tauri::command]
pub async fn change_local_password(
    window: WebviewWindow,
    app: AppHandle,
    input: ChangeLocalPasswordInput,
) -> Result<(), String> {
    let session = app.state::<AccessSessionState>();
    let url = store::resolve_database_url(&app).map_err(|error| error.user_message())?;
    change_local_password_for_window(window.label(), &session, &url, &input)
        .await
        .map_err(|error| {
            log_failure("change_local_password", &error);
            error.user_message()
        })
}

/// Variante testable du verrouillage : label `main` puis invalidation session.
pub(crate) fn lock_local_access_for_window(
    window_label: &str,
    session: &AccessSessionState,
) -> Result<(), LocalAccessError> {
    windows::require_window_label(window_label, MAIN_WINDOW_LABEL)?;
    session.set_unlocked(false);
    Ok(())
}

/// Commande Tauri : verrouille la session en mémoire et bascule l’affichage
/// vers la fenêtre d’accès. Réservée à `main`.
#[tauri::command]
pub fn lock_local_access(window: WebviewWindow, app: AppHandle) -> Result<(), String> {
    let session = app.state::<AccessSessionState>();
    lock_local_access_for_window(window.label(), &session).map_err(|error| {
        log_failure("lock_local_access", &error);
        error.user_message()
    })?;
    windows::show_access_hide_main(&app)
}
