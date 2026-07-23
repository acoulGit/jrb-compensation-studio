//! Commandes keygen / issue / inspect.

use std::path::PathBuf;

use ed25519_dalek::Signer;
use jrb_license_core::{
    encode_license_code, verify_license_code, LicensePayload, APP_ID, LICENSE_PAYLOAD_VERSION,
    MAX_DURATION_MONTHS, MIN_DURATION_MONTHS,
};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

use crate::keys::{self, public_key_b64};

pub fn keygen(private_key: &str, public_key: &str) -> Result<(), String> {
    let private_path = PathBuf::from(private_key);
    let public_path = PathBuf::from(public_key);
    let verifying = keys::write_new_keypair(&private_path, &public_path)?;
    println!("Clé privée créée : {}", private_path.display());
    println!("Clé publique créée : {}", public_path.display());
    println!("Clé publique (Base64) : {}", public_key_b64(&verifying));
    Ok(())
}

pub fn issue(
    private_key: &str,
    installation_id: &str,
    months: u32,
    customer: Option<&str>,
) -> Result<(), String> {
    if months < MIN_DURATION_MONTHS || months > MAX_DURATION_MONTHS {
        return Err(format!(
            "La durée doit être comprise entre {MIN_DURATION_MONTHS} et {MAX_DURATION_MONTHS} mois."
        ));
    }
    if installation_id.trim().is_empty() {
        return Err("L’identifiant d’installation est obligatoire.".into());
    }

    let signing_key = keys::load_signing_key(&PathBuf::from(private_key))?;
    let now = OffsetDateTime::now_utc();
    let issued_at = now
        .format(&Rfc3339)
        .map_err(|error| format!("Format de date impossible : {error}"))?;
    let license_id = generate_license_id(now);

    let payload = LicensePayload {
        v: LICENSE_PAYLOAD_VERSION,
        app_id: APP_ID.to_string(),
        installation_id: installation_id.trim().to_string(),
        license_id: license_id.clone(),
        issued_at: issued_at.clone(),
        duration_months: months,
        customer: customer
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string),
    };
    payload
        .validate_fields()
        .map_err(|error| error.user_message().to_string())?;

    let payload_bytes = payload
        .to_canonical_bytes()
        .map_err(|error| error.user_message().to_string())?;
    let signature = signing_key.sign(&payload_bytes);
    let code = encode_license_code(&payload_bytes, signature.to_bytes().as_ref());

    println!("licenseId={license_id}");
    println!("issuedAt={issued_at}");
    println!("durationMonths={months}");
    match &payload.customer {
        Some(name) => println!("customer={name}"),
        None => println!("customer="),
    }
    println!("code={code}");
    Ok(())
}

pub fn inspect(code: &str, public_key: Option<&str>) -> Result<(), String> {
    let payload_bytes = jrb_license_core::decode_payload_bytes_only(code)
        .map_err(|error| error.user_message().to_string())?;
    let payload = LicensePayload::from_bytes(&payload_bytes)
        .map_err(|error| error.user_message().to_string())?;

    println!("payload=");
    println!(
        "{}",
        serde_json::to_string_pretty(&payload)
            .map_err(|error| format!("Sérialisation impossible : {error}"))?
    );

    if let Some(path) = public_key {
        let verifying = keys::load_verifying_key(&PathBuf::from(path))?;
        let now = OffsetDateTime::now_utc();
        match verify_license_code(code, &verifying, now) {
            Ok(_) => println!("signatureValid=true"),
            Err(error) => {
                println!("signatureValid=false");
                println!("verificationError={}", error.user_message());
            }
        }
    } else {
        println!("signatureValid=unchecked");
    }
    Ok(())
}

fn generate_license_id(now: OffsetDateTime) -> String {
    use rand::Rng;
    let date = format!(
        "{:04}{:02}{:02}",
        now.year(),
        u8::from(now.month()),
        now.day()
    );
    let suffix: u32 = rand::thread_rng().gen();
    format!("LIC-{date}-{suffix:08X}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keys::{load_signing_key, write_new_keypair};
    use jrb_license_core::verify_license_code;
    use tempfile::tempdir;

    #[test]
    fn keygen_creates_pair_and_refuses_overwrite() {
        let dir = tempdir().expect("temp");
        let private = dir.path().join("private-key.txt");
        let public = dir.path().join("public-key.txt");
        write_new_keypair(&private, &public).expect("keygen");
        assert!(private.exists());
        assert!(public.exists());
        let err = write_new_keypair(&private, &public).expect_err("overwrite");
        assert!(err.contains("Refus"));
        assert!(!err.to_lowercase().contains("secret"));
    }

    #[test]
    fn issue_produces_verifiable_code_without_private_in_stdout_shape() {
        let dir = tempdir().expect("temp");
        let private = dir.path().join("private-key.txt");
        let public = dir.path().join("public-key.txt");
        let verifying = write_new_keypair(&private, &public).expect("keygen");
        let signing = load_signing_key(&private).expect("load");
        assert_eq!(signing.verifying_key().as_bytes(), verifying.as_bytes());

        // Simulate issue internals.
        let payload = LicensePayload {
            v: LICENSE_PAYLOAD_VERSION,
            app_id: APP_ID.to_string(),
            installation_id: "JRB-CS-12345678-ABCDEF12".into(),
            license_id: "LIC-20260723-11223344".into(),
            issued_at: "2026-07-23T12:00:00Z".into(),
            duration_months: 12,
            customer: None,
        };
        let bytes = payload.to_canonical_bytes().expect("bytes");
        let signature = signing.sign(&bytes);
        let code = encode_license_code(&bytes, signature.to_bytes().as_ref());
        let now = time::macros::datetime!(2026-07-23 12:00:00 UTC);
        verify_license_code(&code, &verifying, now).expect("verify");
        assert!(code.starts_with("JRB1."));
    }

    #[test]
    fn issue_rejects_invalid_duration() {
        let err = issue("missing-key", "JRB-CS-12345678-ABCDEF12", 0, None).expect_err("duration");
        assert!(err.contains("1") && err.contains("120"));
    }

    #[test]
    fn license_ids_differ() {
        let now = OffsetDateTime::now_utc();
        let a = generate_license_id(now);
        let b = generate_license_id(now);
        assert_ne!(a, b);
        assert!(a.starts_with("LIC-"));
    }
}
