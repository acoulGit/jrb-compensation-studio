//! Encodage / décodage du code `JRB1.<payload_b64url>.<signature_b64url>`.

use base64ct::{Base64UrlUnpadded, Encoding};

use crate::error::LicenseCoreError;

pub const CODE_PREFIX: &str = "JRB1";

pub fn encode_license_code(payload_bytes: &[u8], signature_bytes: &[u8]) -> String {
    let payload_b64 = Base64UrlUnpadded::encode_string(payload_bytes);
    let signature_b64 = Base64UrlUnpadded::encode_string(signature_bytes);
    format!("{CODE_PREFIX}.{payload_b64}.{signature_b64}")
}

pub fn decode_license_code(code: &str) -> Result<(Vec<u8>, Vec<u8>), LicenseCoreError> {
    let trimmed = code.trim();
    let parts: Vec<&str> = trimmed.split('.').collect();
    if parts.len() != 3 {
        return Err(LicenseCoreError::InvalidFormat);
    }
    if parts[0] != CODE_PREFIX {
        return Err(LicenseCoreError::InvalidFormat);
    }
    if parts[1].is_empty() || parts[2].is_empty() {
        return Err(LicenseCoreError::InvalidFormat);
    }
    let payload = Base64UrlUnpadded::decode_vec(parts[1])
        .map_err(|_| LicenseCoreError::InvalidFormat)?;
    let signature = Base64UrlUnpadded::decode_vec(parts[2])
        .map_err(|_| LicenseCoreError::InvalidFormat)?;
    Ok((payload, signature))
}

/// Décode uniquement le payload pour `inspect` (sans vérifier la signature).
pub fn decode_payload_bytes_only(code: &str) -> Result<Vec<u8>, LicenseCoreError> {
    let (payload, _) = decode_license_code(code)?;
    Ok(payload)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_encode_decode() {
        let payload = br#"{"v":1}"#;
        let signature = b"signature-bytes-here!!";
        let code = encode_license_code(payload, signature);
        assert!(code.starts_with("JRB1."));
        assert!(!code.contains('='));
        let (p, s) = decode_license_code(&code).expect("decode");
        assert_eq!(p, payload);
        assert_eq!(s, signature);
    }

    #[test]
    fn rejects_wrong_prefix_and_segment_count() {
        assert!(matches!(
            decode_license_code("JRB2.aaa.bbb"),
            Err(LicenseCoreError::InvalidFormat)
        ));
        assert!(matches!(
            decode_license_code("JRB1.aaa"),
            Err(LicenseCoreError::InvalidFormat)
        ));
    }
}
