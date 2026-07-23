//! Payload JSON signé des licences hors ligne.

use serde::{Deserialize, Serialize};

use crate::error::LicenseCoreError;

pub const LICENSE_PAYLOAD_VERSION: u32 = 1;
pub const APP_ID: &str = "com.jrbxsolutions.compensationstudio";
pub const MIN_DURATION_MONTHS: u32 = 1;
pub const MAX_DURATION_MONTHS: u32 = 120;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicensePayload {
    pub v: u32,
    pub app_id: String,
    pub installation_id: String,
    pub license_id: String,
    pub issued_at: String,
    pub duration_months: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub customer: Option<String>,
}

impl LicensePayload {
    /// Sérialise le payload en octets JSON exacts (ordre des champs stable via
    /// la dérivation serde de la struct — le générateur doit signer ces octets).
    pub fn to_canonical_bytes(&self) -> Result<Vec<u8>, LicenseCoreError> {
        serde_json::to_vec(self).map_err(|_| LicenseCoreError::InvalidPayload)
    }

    pub fn from_bytes(bytes: &[u8]) -> Result<Self, LicenseCoreError> {
        serde_json::from_slice(bytes).map_err(|_| LicenseCoreError::InvalidPayload)
    }

    /// Contrôles métier du payload déjà désérialisé (hors signature).
    pub fn validate_fields(&self) -> Result<(), LicenseCoreError> {
        if self.v != LICENSE_PAYLOAD_VERSION {
            return Err(LicenseCoreError::InvalidVersion);
        }
        if self.app_id != APP_ID {
            return Err(LicenseCoreError::InvalidAppId);
        }
        if self.installation_id.trim().is_empty() {
            return Err(LicenseCoreError::InvalidPayload);
        }
        if !is_valid_license_id(&self.license_id) {
            return Err(LicenseCoreError::InvalidPayload);
        }
        if self.duration_months < MIN_DURATION_MONTHS
            || self.duration_months > MAX_DURATION_MONTHS
        {
            return Err(LicenseCoreError::InvalidDuration);
        }
        if self.issued_at.trim().is_empty() {
            return Err(LicenseCoreError::InvalidIssuedAt);
        }
        Ok(())
    }
}

/// Format attendu : `LIC-YYYYMMDD-XXXXXXXX` (suffixe hexadécimal).
pub fn is_valid_license_id(license_id: &str) -> bool {
    let parts: Vec<&str> = license_id.split('-').collect();
    if parts.len() != 3 {
        return false;
    }
    if parts[0] != "LIC" {
        return false;
    }
    if parts[1].len() != 8 || !parts[1].chars().all(|c| c.is_ascii_digit()) {
        return false;
    }
    if parts[2].len() != 8 || !parts[2].chars().all(|c| c.is_ascii_hexdigit()) {
        return false;
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_valid_license_id() {
        assert!(is_valid_license_id("LIC-20260723-A1B2C3D4"));
    }

    #[test]
    fn rejects_empty_or_malformed_license_id() {
        assert!(!is_valid_license_id(""));
        assert!(!is_valid_license_id("LIC-20260723"));
        assert!(!is_valid_license_id("LIC-2026-A1B2C3D4"));
    }
}
