//! Erreurs et messages utilisateur du module d’accès local (Lot 2B-RC1-SEC1-A).
//!
//! Les codes techniques sont stables (journalisation / tests) ; les messages
//! affichés à l’écran sont en français et ne contiennent jamais de secret.

use crate::sqlite_local::SqliteLocalError;

pub const CODE_SESSION_LOCKED: &str = "SESSION_LOCKED";
pub const CODE_LICENSE_EXPIRED: &str = "LICENSE_EXPIRED";
pub const CODE_CLOCK_ANOMALY: &str = "CLOCK_ANOMALY";
pub const CODE_VALIDATION: &str = "VALIDATION";
pub const CODE_INVALID_CREDENTIALS: &str = "INVALID_CREDENTIALS";
pub const CODE_ALREADY_SET_UP: &str = "ALREADY_SET_UP";
pub const CODE_NOT_SET_UP: &str = "NOT_SET_UP";
pub const CODE_INVALID_ACCESS_WINDOW: &str = "INVALID_ACCESS_WINDOW";
pub const CODE_DATABASE: &str = "DATABASE";

pub const MSG_SESSION_LOCKED: &str =
    "L’application est verrouillée. Veuillez saisir votre mot de passe.";
pub const MSG_LICENSE_EXPIRED: &str =
    "Le droit d’utilisation de l’application a expiré. Une licence est requise.";
pub const MSG_CLOCK_ANOMALY: &str =
    "La date système semble avoir été modifiée. Vérifiez l’horloge ou contactez JRB XSolutions.";
pub const MSG_INVALID_ACCESS_WINDOW: &str =
    "Cette action n’est pas autorisée depuis cette fenêtre.";
const MSG_INVALID_CREDENTIALS: &str = "Mot de passe incorrect.";
const MSG_ALREADY_SET_UP: &str = "L’accès local est déjà configuré sur ce poste.";
const MSG_NOT_SET_UP: &str = "L’accès local n’est pas encore configuré sur ce poste.";
const MSG_DATABASE_GENERIC: &str = "L’opération sur l’accès local a échoué.";

/// Erreurs internes au module. `user_message()` ne renvoie jamais de secret ni
/// de détail SQL — seul `code()` (stable) doit être journalisé côté diagnostic.
#[derive(Debug)]
pub enum LocalAccessError {
    SessionLocked,
    LicenseExpired,
    ClockAnomaly,
    Validation(String),
    InvalidCredentials,
    AlreadySetUp,
    NotSetUp,
    InvalidAccessWindow,
    Database(String),
}

impl LocalAccessError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::SessionLocked => CODE_SESSION_LOCKED,
            Self::LicenseExpired => CODE_LICENSE_EXPIRED,
            Self::ClockAnomaly => CODE_CLOCK_ANOMALY,
            Self::Validation(_) => CODE_VALIDATION,
            Self::InvalidCredentials => CODE_INVALID_CREDENTIALS,
            Self::AlreadySetUp => CODE_ALREADY_SET_UP,
            Self::NotSetUp => CODE_NOT_SET_UP,
            Self::InvalidAccessWindow => CODE_INVALID_ACCESS_WINDOW,
            Self::Database(_) => CODE_DATABASE,
        }
    }

    pub fn user_message(&self) -> String {
        match self {
            Self::SessionLocked => MSG_SESSION_LOCKED.to_string(),
            Self::LicenseExpired => MSG_LICENSE_EXPIRED.to_string(),
            Self::ClockAnomaly => MSG_CLOCK_ANOMALY.to_string(),
            Self::Validation(message) => message.clone(),
            Self::InvalidCredentials => MSG_INVALID_CREDENTIALS.to_string(),
            Self::AlreadySetUp => MSG_ALREADY_SET_UP.to_string(),
            Self::NotSetUp => MSG_NOT_SET_UP.to_string(),
            Self::InvalidAccessWindow => MSG_INVALID_ACCESS_WINDOW.to_string(),
            Self::Database(_) => MSG_DATABASE_GENERIC.to_string(),
        }
    }
}

impl std::fmt::Display for LocalAccessError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} ({})", self.user_message(), self.code())
    }
}

impl From<SqliteLocalError> for LocalAccessError {
    fn from(value: SqliteLocalError) -> Self {
        Self::Database(value.to_string())
    }
}

impl From<sqlx::Error> for LocalAccessError {
    fn from(value: sqlx::Error) -> Self {
        Self::Database(value.to_string())
    }
}

impl From<LocalAccessError> for String {
    fn from(value: LocalAccessError) -> Self {
        value.user_message()
    }
}
