//! Génération et validation du mot de passe d’export RH (Lot 2B-E1).
//!
//! Le mot de passe généré n’est JAMAIS journalisé.

use rand::Rng;

/// Longueur du mot de passe généré (bornée à >= 20 par contrat).
pub const GENERATED_PASSWORD_LENGTH: u32 = 24;

/// Longueur minimale d’un mot de passe fourni par l’utilisateur.
pub const MIN_USER_PASSWORD_LENGTH: usize = 12;

/// Alphabet sans caractères ambigus (pas de 0/O/1/l/I).
const PASSWORD_ALPHABET: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#%+=?";

/// Génère un mot de passe robuste (>= 20 caractères, alphabet non ambigu).
pub fn generate_password() -> String {
    generate_password_with_length(GENERATED_PASSWORD_LENGTH)
}

fn generate_password_with_length(length: u32) -> String {
    let length = length.max(20) as usize;
    let mut rng = rand::rng();
    let mut out = String::with_capacity(length);
    for _ in 0..length {
        let idx = rng.random_range(0..PASSWORD_ALPHABET.len());
        out.push(PASSWORD_ALPHABET[idx] as char);
    }
    out
}

/// Valide un mot de passe fourni : non vide/non blanc et >= 12 caractères.
pub fn is_user_password_blank(password: &str) -> bool {
    password.trim().is_empty()
}

pub fn is_user_password_too_short(password: &str) -> bool {
    password.chars().count() < MIN_USER_PASSWORD_LENGTH
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_password_is_at_least_twenty_chars() {
        for _ in 0..50 {
            let pw = generate_password();
            assert!(pw.chars().count() >= 20, "trop court : {}", pw.len());
        }
    }

    #[test]
    fn generated_password_has_no_ambiguous_chars() {
        let pw = generate_password();
        for forbidden in ['0', 'O', '1', 'l', 'I'] {
            assert!(!pw.contains(forbidden), "caractère ambigu : {forbidden}");
        }
    }

    #[test]
    fn two_generated_passwords_differ() {
        let a = generate_password();
        let b = generate_password();
        assert_ne!(a, b);
    }

    #[test]
    fn blank_and_short_detection() {
        assert!(is_user_password_blank("   "));
        assert!(!is_user_password_blank("abcdefghijkl"));
        assert!(is_user_password_too_short("short"));
        assert!(!is_user_password_too_short("abcdefghijkl"));
    }
}
