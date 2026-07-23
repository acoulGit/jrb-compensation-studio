//! Politique de mot de passe local et hachage Argon2id (Lot 2B-RC1-SEC1-A).
//!
//! Le mot de passe n’est jamais journalisé. Les buffers sensibles transitent
//! en `Zeroizing<String>` pour être effacés dès qu’ils sortent de portée.

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use zeroize::Zeroizing;

use super::error::LocalAccessError;

pub const MIN_PASSWORD_LENGTH: usize = 8;
pub const MAX_PASSWORD_LENGTH: usize = 128;

/// Valide la politique de mot de passe local : ni vide ni composé uniquement
/// d’espaces, et une longueur comprise entre 8 et 128 caractères.
pub fn validate_password_policy(password: &str) -> Result<(), LocalAccessError> {
    if password.trim().is_empty() {
        return Err(LocalAccessError::Validation(
            "Le mot de passe est obligatoire et ne peut pas être composé uniquement d’espaces."
                .into(),
        ));
    }
    let length = password.chars().count();
    if length < MIN_PASSWORD_LENGTH {
        return Err(LocalAccessError::Validation(format!(
            "Le mot de passe doit contenir au moins {MIN_PASSWORD_LENGTH} caractères."
        )));
    }
    if length > MAX_PASSWORD_LENGTH {
        return Err(LocalAccessError::Validation(format!(
            "Le mot de passe ne peut pas dépasser {MAX_PASSWORD_LENGTH} caractères."
        )));
    }
    Ok(())
}

/// Calcule un hachage Argon2id (format PHC) à partir d’un mot de passe.
pub fn hash_password(password: &Zeroizing<String>) -> Result<String, LocalAccessError> {
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|error| LocalAccessError::Database(format!("argon2 hash_password: {error}")))?;
    Ok(hash.to_string())
}

/// Vérifie un mot de passe contre un hachage PHC Argon2id persisté.
pub fn verify_password(
    password: &Zeroizing<String>,
    stored_hash: &str,
) -> Result<bool, LocalAccessError> {
    let parsed = PasswordHash::new(stored_hash)
        .map_err(|error| LocalAccessError::Database(format!("argon2 hash invalide: {error}")))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

/// Génère un identifiant d’installation stable au format `JRB-CS-{8hex}-{8hex}`.
pub fn generate_installation_id() -> String {
    use rand::Rng;
    let mut rng = rand::rng();
    let part1: u32 = rng.random();
    let part2: u32 = rng.random();
    format!("JRB-CS-{part1:08x}-{part2:08x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_password() {
        assert!(validate_password_policy("").is_err());
    }

    #[test]
    fn rejects_whitespace_only_password() {
        assert!(validate_password_policy("        ").is_err());
    }

    #[test]
    fn rejects_password_shorter_than_minimum() {
        assert!(validate_password_policy("Ab1234").is_err());
    }

    #[test]
    fn rejects_password_longer_than_maximum() {
        let too_long = "A".repeat(MAX_PASSWORD_LENGTH + 1);
        assert!(validate_password_policy(&too_long).is_err());
    }

    #[test]
    fn accepts_password_within_bounds() {
        assert!(validate_password_policy("MotDePasseValide1").is_ok());
        let exactly_min = "A".repeat(MIN_PASSWORD_LENGTH);
        assert!(validate_password_policy(&exactly_min).is_ok());
        let exactly_max = "A".repeat(MAX_PASSWORD_LENGTH);
        assert!(validate_password_policy(&exactly_max).is_ok());
    }

    #[test]
    fn hash_then_verify_round_trip_succeeds() {
        let password = Zeroizing::new("CorrectPassword123".to_string());
        let hash = hash_password(&password).expect("hash");
        assert!(verify_password(&password, &hash).expect("verify"));
    }

    #[test]
    fn verify_rejects_wrong_password() {
        let password = Zeroizing::new("CorrectPassword123".to_string());
        let wrong = Zeroizing::new("WrongPassword456".to_string());
        let hash = hash_password(&password).expect("hash");
        assert!(!verify_password(&wrong, &hash).expect("verify"));
    }

    #[test]
    fn two_hashes_of_same_password_differ_due_to_salt() {
        let password = Zeroizing::new("SamePassword123".to_string());
        let hash_a = hash_password(&password).expect("hash a");
        let hash_b = hash_password(&password).expect("hash b");
        assert_ne!(hash_a, hash_b);
    }

    #[test]
    fn generated_installation_id_matches_expected_format() {
        let id = generate_installation_id();
        let parts: Vec<&str> = id.split('-').collect();
        assert_eq!(parts.len(), 4);
        assert_eq!(parts[0], "JRB");
        assert_eq!(parts[1], "CS");
        assert_eq!(parts[2].len(), 8);
        assert_eq!(parts[3].len(), 8);
        assert!(parts[2].chars().all(|c| c.is_ascii_hexdigit()));
        assert!(parts[3].chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn two_generated_installation_ids_differ() {
        assert_ne!(generate_installation_id(), generate_installation_id());
    }
}
