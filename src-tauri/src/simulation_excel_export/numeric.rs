//! Écriture numérique sûre pour l’export Excel (Lot 2B-E1).
//!
//! Les montants sont persistés en TEXTE canonique (aucun flottant métier).
//! On ne les convertit en nombre Excel (`f64`) que lorsqu’ils sont
//! représentables exactement (entier dans l’intervalle sûr des `f64`,
//! soit |v| <= 2^53 - 1). Sinon la valeur est écrite comme texte pour
//! préserver l’exactitude — jamais de zéro de substitution.

/// Plus grand entier représentable exactement en `f64` (2^53 - 1).
pub const MAX_SAFE_INTEGER: i128 = 9_007_199_254_740_991;

/// Entier décimal canonique : chiffres, pas de zéro non significatif, `-0`
/// interdit. Miroir de la règle de persistance.
pub fn is_canonical_integer_text(s: &str, allow_negative: bool) -> bool {
    if s.is_empty() {
        return false;
    }
    let (negative, digits) = if let Some(rest) = s.strip_prefix('-') {
        if !allow_negative || rest.is_empty() {
            return false;
        }
        (true, rest)
    } else {
        (false, s)
    };
    if !digits.bytes().all(|b| b.is_ascii_digit()) {
        return false;
    }
    if digits.len() > 1 && digits.starts_with('0') {
        return false;
    }
    if negative && digits == "0" {
        return false;
    }
    true
}

/// Représentation retenue pour une valeur numérique canonique.
#[derive(Debug, Clone, PartialEq)]
pub enum NumericCell {
    /// Représentable exactement : à écrire via `write_number`.
    Number(f64),
    /// Trop grand pour un `f64` exact : à écrire tel quel en texte.
    Text(String),
}

/// Décide de la représentation d’un entier canonique.
///
/// Retourne `None` si le texte n’est pas un entier canonique.
pub fn classify_canonical_integer(s: &str) -> Option<NumericCell> {
    if !is_canonical_integer_text(s, true) {
        return None;
    }
    match s.parse::<i128>() {
        Ok(value) if value.abs() <= MAX_SAFE_INTEGER => Some(NumericCell::Number(value as f64)),
        Ok(_) => Some(NumericCell::Text(s.to_string())),
        Err(_) => Some(NumericCell::Text(s.to_string())),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_integers_become_numbers() {
        assert_eq!(
            classify_canonical_integer("450000"),
            Some(NumericCell::Number(450000.0))
        );
        assert_eq!(
            classify_canonical_integer("-13500"),
            Some(NumericCell::Number(-13500.0))
        );
        assert_eq!(
            classify_canonical_integer("9007199254740991"),
            Some(NumericCell::Number(9_007_199_254_740_991.0))
        );
    }

    #[test]
    fn unsafe_integers_become_text() {
        assert_eq!(
            classify_canonical_integer("9007199254740992"),
            Some(NumericCell::Text("9007199254740992".into()))
        );
        assert_eq!(
            classify_canonical_integer("123456789012345678901234567890"),
            Some(NumericCell::Text("123456789012345678901234567890".into()))
        );
    }

    #[test]
    fn non_canonical_is_none() {
        assert_eq!(classify_canonical_integer("01"), None);
        assert_eq!(classify_canonical_integer("1.5"), None);
        assert_eq!(classify_canonical_integer(""), None);
        assert_eq!(classify_canonical_integer("-0"), None);
    }
}
