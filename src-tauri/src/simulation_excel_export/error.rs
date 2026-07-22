//! Erreurs de l’export Excel RH (Lot 2B-E1).
//!
//! Chaque variante expose un code stable (`code()`) et un message
//! utilisateur en français (`user_message()`). Les messages utilisateur ne
//! contiennent JAMAIS le mot de passe ni de détail technique sensible.

use crate::sqlite_local::SqliteLocalError;

/// Erreur d’export. Les codes sont stables (consommés par le frontend).
///
/// Certaines variantes / champs de détail ne sont pas encore consommés par le
/// backend mais font partie du contrat stable d’erreurs (journalisation,
/// évolutions frontend) : `dead_code` est donc explicitement toléré.
#[allow(dead_code)]
#[derive(Debug)]
pub enum ExportError {
    SnapshotNotFound,
    SchemaNotSupported,
    ContractNotSupported,
    SnapshotIncomplete(String),
    PasswordRequired,
    PasswordTooShort,
    PasswordConfirmationMismatch,
    UnprotectedConfirmationRequired,
    DestinationInvalid,
    DestinationAlreadyExists,
    WorkbookGenerationFailed(String),
    Encryption(String),
    FileWrite(String),
    MonthCountInvalid,
    MonthDuplicate,
    NumericValueInvalid,
    Cancelled,
    /// Erreur base de données inattendue (jamais causée par les entrées).
    Database(String),
}

impl ExportError {
    /// Code stable, préfixé `EXPORT_`.
    pub fn code(&self) -> &'static str {
        match self {
            Self::SnapshotNotFound => "EXPORT_SNAPSHOT_NOT_FOUND",
            Self::SchemaNotSupported => "EXPORT_SCHEMA_NOT_SUPPORTED",
            Self::ContractNotSupported => "EXPORT_CONTRACT_NOT_SUPPORTED",
            Self::SnapshotIncomplete(_) => "EXPORT_SNAPSHOT_INCOMPLETE",
            Self::PasswordRequired => "EXPORT_PASSWORD_REQUIRED",
            Self::PasswordTooShort => "EXPORT_PASSWORD_TOO_SHORT",
            Self::PasswordConfirmationMismatch => "EXPORT_PASSWORD_CONFIRMATION_MISMATCH",
            Self::UnprotectedConfirmationRequired => "EXPORT_UNPROTECTED_CONFIRMATION_REQUIRED",
            Self::DestinationInvalid => "EXPORT_DESTINATION_INVALID",
            Self::DestinationAlreadyExists => "EXPORT_DESTINATION_ALREADY_EXISTS",
            Self::WorkbookGenerationFailed(_) => "EXPORT_WORKBOOK_GENERATION_FAILED",
            Self::Encryption(_) => "EXPORT_ENCRYPTION_FAILED",
            Self::FileWrite(_) => "EXPORT_FILE_WRITE_FAILED",
            Self::MonthCountInvalid => "EXPORT_MONTH_COUNT_INVALID",
            Self::MonthDuplicate => "EXPORT_MONTH_DUPLICATE",
            Self::NumericValueInvalid => "EXPORT_NUMERIC_VALUE_INVALID",
            Self::Cancelled => "EXPORT_CANCELLED",
            Self::Database(_) => "EXPORT_DATABASE_ERROR",
        }
    }

    /// Message affiché à l’utilisateur (français, sans détail sensible).
    pub fn user_message(&self) -> String {
        match self {
            Self::SnapshotNotFound => {
                "La simulation demandée est introuvable dans la base locale.".into()
            }
            Self::SchemaNotSupported => {
                "Cette simulation utilise un format de résultat non pris en charge par l’export RH."
                    .into()
            }
            Self::ContractNotSupported => {
                "Cette simulation repose sur une version de calcul non prise en charge par l’export RH."
                    .into()
            }
            Self::SnapshotIncomplete(_) => {
                "La trajectoire mensuelle de la simulation est incomplète : export impossible.".into()
            }
            Self::PasswordRequired => {
                "Un mot de passe est requis pour un export protégé.".into()
            }
            Self::PasswordTooShort => {
                "Le mot de passe de protection doit comporter au moins 12 caractères.".into()
            }
            Self::PasswordConfirmationMismatch => {
                "La confirmation du mot de passe ne correspond pas.".into()
            }
            Self::UnprotectedConfirmationRequired => {
                "Un export non protégé doit être confirmé explicitement avant génération.".into()
            }
            Self::DestinationInvalid => {
                "La destination du fichier d’export est invalide.".into()
            }
            Self::DestinationAlreadyExists => {
                "Un fichier existe déjà à cette destination : l’export a été interrompu pour ne rien écraser."
                    .into()
            }
            Self::WorkbookGenerationFailed(_) => {
                "La génération du classeur Excel a échoué.".into()
            }
            Self::Encryption(_) => {
                "Le chiffrement du fichier Excel a échoué.".into()
            }
            Self::FileWrite(_) => {
                "L’écriture du fichier Excel sur le disque a échoué.".into()
            }
            Self::MonthCountInvalid => {
                "La trajectoire mensuelle ne comporte pas exactement les 12 mois attendus.".into()
            }
            Self::MonthDuplicate => {
                "La trajectoire mensuelle contient un mois en double.".into()
            }
            Self::NumericValueInvalid => {
                "Une valeur numérique de la simulation est invalide.".into()
            }
            Self::Cancelled => "L’export a été annulé.".into(),
            Self::Database(_) => {
                "La lecture de la simulation dans la base locale a échoué.".into()
            }
        }
    }
}

impl From<sqlx::Error> for ExportError {
    fn from(value: sqlx::Error) -> Self {
        Self::Database(value.to_string())
    }
}

impl From<SqliteLocalError> for ExportError {
    fn from(value: SqliteLocalError) -> Self {
        Self::Database(value.to_string())
    }
}

impl From<rust_xlsxwriter::XlsxError> for ExportError {
    fn from(value: rust_xlsxwriter::XlsxError) -> Self {
        Self::WorkbookGenerationFailed(value.to_string())
    }
}
