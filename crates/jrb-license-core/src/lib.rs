//! Crate partagée des licences hors ligne JRB Compensation Studio.
//!
//! Contient le format `JRB1.<payload>.<signature>`, la structure de payload et
//! la vérification Ed25519. **Aucune clé privée** n’est incluse.

mod error;
mod format;
mod payload;
mod verify;

pub use error::{LicenseCoreError, LicenseCoreErrorCode};
pub use format::{decode_license_code, decode_payload_bytes_only, encode_license_code, CODE_PREFIX};
pub use payload::{
    LicensePayload, APP_ID, LICENSE_PAYLOAD_VERSION, MAX_DURATION_MONTHS, MIN_DURATION_MONTHS,
};
pub use verify::{
    payload_sha256_hex, verifying_key_from_base64, verifying_key_from_bytes, verify_license_code,
    VerifyingKeyBytes,
};
