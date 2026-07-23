//! Erreurs stables du format / de la vérification de licence (sans secret).

use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LicenseCoreErrorCode {
    InvalidFormat,
    InvalidSignature,
    InvalidPayload,
    InvalidVersion,
    InvalidAppId,
    InvalidDuration,
    InvalidIssuedAt,
}

impl LicenseCoreErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::InvalidFormat => "INVALID_LICENSE_FORMAT",
            Self::InvalidSignature => "INVALID_LICENSE_SIGNATURE",
            Self::InvalidPayload => "INVALID_LICENSE_PAYLOAD",
            Self::InvalidVersion => "INVALID_LICENSE_VERSION",
            Self::InvalidAppId => "INVALID_LICENSE_APP_ID",
            Self::InvalidDuration => "INVALID_LICENSE_DURATION",
            Self::InvalidIssuedAt => "INVALID_LICENSE_ISSUED_AT",
        }
    }
}

#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum LicenseCoreError {
    #[error("Le format du code de licence est invalide.")]
    InvalidFormat,
    #[error("La signature du code de licence est invalide.")]
    InvalidSignature,
    #[error("Le contenu du code de licence est invalide.")]
    InvalidPayload,
    #[error("La version du code de licence n’est pas prise en charge.")]
    InvalidVersion,
    #[error("Le code de licence ne correspond pas à cette application.")]
    InvalidAppId,
    #[error("La durée de la licence doit être comprise entre 1 et 120 mois.")]
    InvalidDuration,
    #[error("La date d’émission du code de licence est invalide.")]
    InvalidIssuedAt,
}

impl LicenseCoreError {
    pub fn code(&self) -> LicenseCoreErrorCode {
        match self {
            Self::InvalidFormat => LicenseCoreErrorCode::InvalidFormat,
            Self::InvalidSignature => LicenseCoreErrorCode::InvalidSignature,
            Self::InvalidPayload => LicenseCoreErrorCode::InvalidPayload,
            Self::InvalidVersion => LicenseCoreErrorCode::InvalidVersion,
            Self::InvalidAppId => LicenseCoreErrorCode::InvalidAppId,
            Self::InvalidDuration => LicenseCoreErrorCode::InvalidDuration,
            Self::InvalidIssuedAt => LicenseCoreErrorCode::InvalidIssuedAt,
        }
    }

    pub fn user_message(&self) -> &'static str {
        match self {
            Self::InvalidFormat => "Le format du code de licence est invalide.",
            Self::InvalidSignature => "La signature du code de licence est invalide.",
            Self::InvalidPayload => "Le contenu du code de licence est invalide.",
            Self::InvalidVersion => "La version du code de licence n’est pas prise en charge.",
            Self::InvalidAppId => "Le code de licence ne correspond pas à cette application.",
            Self::InvalidDuration => {
                "La durée de la licence doit être comprise entre 1 et 120 mois."
            }
            Self::InvalidIssuedAt => "La date d’émission du code de licence est invalide.",
        }
    }
}
