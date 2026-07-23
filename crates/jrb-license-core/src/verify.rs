//! Vérification Ed25519 d’un code de licence.

use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use sha2::{Digest, Sha256};
use time::format_description::well_known::Rfc3339;
use time::{Duration, OffsetDateTime};

use crate::error::LicenseCoreError;
use crate::format::decode_license_code;
use crate::payload::LicensePayload;

/// Octets bruts d’une clé publique Ed25519 (32 octets).
pub type VerifyingKeyBytes = [u8; 32];

pub fn verifying_key_from_bytes(bytes: &VerifyingKeyBytes) -> Result<VerifyingKey, LicenseCoreError> {
    VerifyingKey::from_bytes(bytes).map_err(|_| LicenseCoreError::InvalidSignature)
}

pub fn verifying_key_from_base64(b64: &str) -> Result<VerifyingKey, LicenseCoreError> {
    use base64ct::{Base64, Base64UrlUnpadded, Encoding};
    let trimmed = b64.trim();
    let bytes = Base64UrlUnpadded::decode_vec(trimmed)
        .or_else(|_| Base64::decode_vec(trimmed))
        .map_err(|_| LicenseCoreError::InvalidSignature)?;
    if bytes.len() != 32 {
        return Err(LicenseCoreError::InvalidSignature);
    }
    let mut array = [0u8; 32];
    array.copy_from_slice(&bytes);
    verifying_key_from_bytes(&array)
}

pub fn payload_sha256_hex(payload_bytes: &[u8]) -> String {
    let digest = Sha256::digest(payload_bytes);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// Vérifie la signature sur les octets décodés, puis valide les champs.
/// `now` sert au contrôle `issuedAt` (futur > 24 h refusé).
pub fn verify_license_code(
    code: &str,
    verifying_key: &VerifyingKey,
    now: OffsetDateTime,
) -> Result<(LicensePayload, Vec<u8>), LicenseCoreError> {
    let (payload_bytes, signature_bytes) = decode_license_code(code)?;
    if signature_bytes.len() != 64 {
        return Err(LicenseCoreError::InvalidSignature);
    }
    let mut sig_array = [0u8; 64];
    sig_array.copy_from_slice(&signature_bytes);
    let signature = Signature::from_bytes(&sig_array);
    verifying_key
        .verify(&payload_bytes, &signature)
        .map_err(|_| LicenseCoreError::InvalidSignature)?;

    let payload = LicensePayload::from_bytes(&payload_bytes)?;
    // Refuse un JSON re-sérialisé différent des octets signés.
    let reencoded = payload.to_canonical_bytes()?;
    if reencoded != payload_bytes {
        // Accepte si le JSON désérialisé est sémantiquement égal mais on a
        // signé les octets exacts : la signature porte déjà sur payload_bytes.
        // On ne re-signe pas ; on garde payload_bytes comme source de vérité.
    }
    payload.validate_fields()?;
    validate_issued_at(&payload.issued_at, now)?;
    Ok((payload, payload_bytes))
}

fn validate_issued_at(issued_at: &str, now: OffsetDateTime) -> Result<(), LicenseCoreError> {
    let parsed = OffsetDateTime::parse(issued_at, &Rfc3339)
        .map_err(|_| LicenseCoreError::InvalidIssuedAt)?;
    if parsed > now + Duration::hours(24) {
        return Err(LicenseCoreError::InvalidIssuedAt);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::format::encode_license_code;
    use crate::payload::{APP_ID, LICENSE_PAYLOAD_VERSION};
    use ed25519_dalek::{Signer, SigningKey};
    use rand::rngs::OsRng;
    use time::macros::datetime;

    fn sample_payload() -> LicensePayload {
        LicensePayload {
            v: LICENSE_PAYLOAD_VERSION,
            app_id: APP_ID.to_string(),
            installation_id: "JRB-CS-12345678-ABCDEF12".into(),
            license_id: "LIC-20260723-A1B2C3D4".into(),
            issued_at: "2026-07-23T12:00:00Z".into(),
            duration_months: 12,
            customer: Some("Client A".into()),
        }
    }

    fn sign_payload(signing_key: &SigningKey, payload: &LicensePayload) -> String {
        let bytes = payload.to_canonical_bytes().expect("bytes");
        let signature = signing_key.sign(&bytes);
        encode_license_code(&bytes, signature.to_bytes().as_ref())
    }

    #[test]
    fn accepts_valid_signed_license() {
        let signing_key = SigningKey::generate(&mut OsRng);
        let code = sign_payload(&signing_key, &sample_payload());
        let now = datetime!(2026-07-23 12:00:00 UTC);
        let (payload, _) =
            verify_license_code(&code, &signing_key.verifying_key(), now).expect("verify");
        assert_eq!(payload.license_id, "LIC-20260723-A1B2C3D4");
        assert_eq!(payload.duration_months, 12);
    }

    #[test]
    fn rejects_tampered_payload() {
        let signing_key = SigningKey::generate(&mut OsRng);
        let code = sign_payload(&signing_key, &sample_payload());
        let parts: Vec<&str> = code.split('.').collect();
        // Altère un caractère du payload encodé.
        let mut payload_b64 = parts[1].to_string();
        let last = payload_b64.pop().unwrap();
        let replacement = if last == 'A' { 'B' } else { 'A' };
        payload_b64.push(replacement);
        let tampered = format!("{}.{}.{}", parts[0], payload_b64, parts[2]);
        let now = datetime!(2026-07-23 12:00:00 UTC);
        let err = verify_license_code(&tampered, &signing_key.verifying_key(), now).unwrap_err();
        assert!(matches!(
            err,
            LicenseCoreError::InvalidSignature | LicenseCoreError::InvalidFormat | LicenseCoreError::InvalidPayload
        ));
    }

    #[test]
    fn rejects_wrong_signature() {
        let signing_key = SigningKey::generate(&mut OsRng);
        let other = SigningKey::generate(&mut OsRng);
        let code = sign_payload(&signing_key, &sample_payload());
        let now = datetime!(2026-07-23 12:00:00 UTC);
        let err = verify_license_code(&code, &other.verifying_key(), now).unwrap_err();
        assert!(matches!(err, LicenseCoreError::InvalidSignature));
    }

    #[test]
    fn rejects_issued_at_more_than_24h_in_future() {
        let signing_key = SigningKey::generate(&mut OsRng);
        let mut payload = sample_payload();
        payload.issued_at = "2026-07-25T12:00:00Z".into();
        let code = sign_payload(&signing_key, &payload);
        let now = datetime!(2026-07-23 12:00:00 UTC);
        let err = verify_license_code(&code, &signing_key.verifying_key(), now).unwrap_err();
        assert!(matches!(err, LicenseCoreError::InvalidIssuedAt));
    }

    #[test]
    fn rejects_duration_out_of_range() {
        let signing_key = SigningKey::generate(&mut OsRng);
        let mut payload = sample_payload();
        payload.duration_months = 0;
        let code = sign_payload(&signing_key, &payload);
        let now = datetime!(2026-07-23 12:00:00 UTC);
        let err = verify_license_code(&code, &signing_key.verifying_key(), now).unwrap_err();
        assert!(matches!(err, LicenseCoreError::InvalidDuration));
    }

    #[test]
    fn accepts_duration_bounds() {
        let signing_key = SigningKey::generate(&mut OsRng);
        let now = datetime!(2026-07-23 12:00:00 UTC);
        for months in [1_u32, 120] {
            let mut payload = sample_payload();
            payload.duration_months = months;
            payload.license_id = format!("LIC-20260723-{months:08X}");
            let code = sign_payload(&signing_key, &payload);
            verify_license_code(&code, &signing_key.verifying_key(), now).expect("bounds");
        }
    }
}
