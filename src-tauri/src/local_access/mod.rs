//! Accès local : mot de passe + période initiale (Lot 2B-RC1-SEC1-A).
//!
//! Ce module gère :
//! - le verrouillage applicatif local (mot de passe Argon2id, session en mémoire) ;
//! - la période de validité initiale (10 mois civils depuis l’installation),
//!   avant activation d’une licence (Lot 2B-RC1-SEC1-B, hors périmètre ici) ;
//! - la détection d’anomalie d’horloge système (recul de plus de 24h).
//!
//! Toute commande métier existante doit appeler [`require_unlocked_and_licensed`]
//! avant d’exécuter son travail. Aucun secret (mot de passe, hachage) n’est
//! jamais renvoyé au frontend ni journalisé.

mod calendar;
// `pub(crate)` : le macro `tauri::generate_handler!` doit référencer directement
// `local_access::commands::nom_de_commande` (les items compagnons générés par
// `#[tauri::command]` ne survivent pas à un ré-export via `pub use`).
pub(crate) mod commands;
mod error;
mod password;
mod state;
mod store;
mod windows;

#[cfg(test)]
mod tests;

pub use state::AccessSessionState;

use sqlx::SqliteConnection;
use tauri::{AppHandle, Manager};

use error::LocalAccessError;
use store::LocalAccessStateRow;

/// Résultat de l’évaluation de l’horloge système et de la période de validité,
/// persisté au passage (dernière observation, anomalie détectée).
pub(crate) struct ClockEvaluation {
    pub expired: bool,
    pub clock_anomaly: bool,
}

/// Évalue l’horloge et l’expiration pour une ligne déjà chargée, en persistant
/// toute mise à jour nécessaire (observation d’horloge, anomalie détectée).
///
/// Règles :
/// - une anomalie déjà détectée reste bloquante (aucune récupération automatique) ;
/// - `now < last_observed_at - 24h` déclenche une nouvelle anomalie persistée ;
/// - `last_observed_at` ne recule jamais : il n’est mis à jour que si `now` est
///   postérieur à la valeur persistée ;
/// - la licence est valide tant que `now <= current_valid_until`.
pub(crate) async fn evaluate_and_persist_clock(
    conn: &mut SqliteConnection,
    row: &LocalAccessStateRow,
) -> Result<ClockEvaluation, LocalAccessError> {
    let now = calendar::now_utc();
    let valid_until = calendar::parse_rfc3339(&row.current_valid_until)?;

    if row.clock_anomaly_detected {
        return Ok(ClockEvaluation {
            expired: calendar::is_expired(now, valid_until),
            clock_anomaly: true,
        });
    }

    let last_observed_at = calendar::parse_rfc3339(&row.last_observed_at)?;
    if calendar::is_clock_anomaly(now, last_observed_at) {
        let now_text = calendar::to_rfc3339(now)?;
        store::update_clock_observation(conn, &row.last_observed_at, true, &now_text).await?;
        return Ok(ClockEvaluation {
            expired: calendar::is_expired(now, valid_until),
            clock_anomaly: true,
        });
    }

    if now > last_observed_at {
        let now_text = calendar::to_rfc3339(now)?;
        store::update_clock_observation(conn, &now_text, false, &now_text).await?;
    }

    Ok(ClockEvaluation {
        expired: calendar::is_expired(now, valid_until),
        clock_anomaly: false,
    })
}

/// Version pure (URL SQLite explicite) de l’évaluation horloge/licence, utilisée
/// à la fois par la garde et par les tests (base temporaire, sans `AppHandle`).
pub(crate) async fn evaluate_license_status_on_url(
    database_url: &str,
) -> Result<ClockEvaluation, LocalAccessError> {
    let mut conn = store::open_and_ensure_schema_on_url(database_url).await?;
    let outcome = async {
        let row = store::fetch_state(&mut conn)
            .await?
            .ok_or(LocalAccessError::NotSetUp)?;
        evaluate_and_persist_clock(&mut conn, &row).await
    }
    .await;
    let _ = crate::sqlite_local::close_connection(conn).await;
    outcome
}

/// Garde à appeler en tête de toute commande métier existante : vérifie que la
/// session est déverrouillée, que la licence (période initiale) est valide et
/// que l’horloge système n’a pas été manipulée. Ne renvoie jamais de secret.
pub async fn require_unlocked_and_licensed(app: &AppHandle) -> Result<(), String> {
    let session = app.state::<AccessSessionState>();
    if !session.is_unlocked() {
        return Err(error::MSG_SESSION_LOCKED.to_string());
    }

    let url = store::resolve_database_url(app).map_err(|error| error.user_message())?;
    let evaluation = match evaluate_license_status_on_url(&url).await {
        Ok(evaluation) => evaluation,
        Err(LocalAccessError::NotSetUp) => return Err(error::MSG_SESSION_LOCKED.to_string()),
        Err(other) => return Err(other.user_message()),
    };
    if evaluation.clock_anomaly {
        return Err(error::MSG_CLOCK_ANOMALY.to_string());
    }
    if evaluation.expired {
        return Err(error::MSG_LICENSE_EXPIRED.to_string());
    }
    Ok(())
}
