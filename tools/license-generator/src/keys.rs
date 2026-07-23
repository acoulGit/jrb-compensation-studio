//! Lecture / écriture de fichiers de clés (jamais journaliser la clé privée).

use std::fs;
use std::path::Path;

use base64ct::{Base64UrlUnpadded, Encoding};
use ed25519_dalek::{SigningKey, VerifyingKey};
use zeroize::Zeroizing;

pub fn write_new_keypair(private_path: &Path, public_path: &Path) -> Result<VerifyingKey, String> {
    if private_path.exists() {
        return Err(format!(
            "Refus d’écraser la clé privée existante : {}",
            private_path.display()
        ));
    }
    if public_path.exists() {
        return Err(format!(
            "Refus d’écraser la clé publique existante : {}",
            public_path.display()
        ));
    }
    if let Some(parent) = private_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Impossible de créer le dossier privé : {error}"))?;
    }
    if let Some(parent) = public_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Impossible de créer le dossier public : {error}"))?;
    }

    let mut rng = rand::rngs::OsRng;
    let signing_key = SigningKey::generate(&mut rng);
    let verifying_key = signing_key.verifying_key();

    let private_b64 = Base64UrlUnpadded::encode_string(signing_key.to_bytes().as_ref());
    let public_b64 = Base64UrlUnpadded::encode_string(verifying_key.as_bytes());

    // Zeroize the temporary private encoding after write.
    let private_b64 = Zeroizing::new(private_b64);
    fs::write(private_path, private_b64.as_bytes())
        .map_err(|error| format!("Écriture clé privée impossible : {error}"))?;
    fs::write(public_path, format!("{public_b64}\n"))
        .map_err(|error| format!("Écriture clé publique impossible : {error}"))?;

    Ok(verifying_key)
}

pub fn load_signing_key(private_path: &Path) -> Result<SigningKey, String> {
    let raw = fs::read_to_string(private_path)
        .map_err(|error| format!("Lecture de la clé privée impossible : {error}"))?;
    let trimmed = Zeroizing::new(raw.trim().to_string());
    let bytes = Base64UrlUnpadded::decode_vec(trimmed.as_str())
        .map_err(|_| "Fichier de clé privée invalide.".to_string())?;
    if bytes.len() != 32 {
        return Err("Fichier de clé privée invalide (longueur).".into());
    }
    let mut array = [0u8; 32];
    array.copy_from_slice(&bytes);
    Ok(SigningKey::from_bytes(&array))
}

pub fn load_verifying_key(public_path: &Path) -> Result<VerifyingKey, String> {
    let raw = fs::read_to_string(public_path)
        .map_err(|error| format!("Lecture de la clé publique impossible : {error}"))?;
    jrb_license_core::verifying_key_from_base64(&raw)
        .map_err(|_| "Fichier de clé publique invalide.".to_string())
}

pub fn public_key_b64(verifying_key: &VerifyingKey) -> String {
    Base64UrlUnpadded::encode_string(verifying_key.as_bytes())
}
