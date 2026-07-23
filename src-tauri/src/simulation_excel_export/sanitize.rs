//! Neutralisation des cellules texte pour éviter l’injection de formules
//! Excel/CSV (Lot 2B-E1).
//!
//! Une cellule texte commençant par `=`, `+`, `-`, `@`, tabulation ou retour
//! chariot est préfixée d’une apostrophe. Cette règle ne s’applique QU’AUX
//! valeurs texte libres : les nombres réels (y compris négatifs) sont écrits
//! comme nombres et ne passent jamais par cette fonction.

const DANGEROUS_PREFIXES: &[char] = &['=', '+', '-', '@', '\t', '\r'];

/// Neutralise une cellule texte si elle démarre par un préfixe dangereux.
pub fn sanitize_text_cell(value: &str) -> String {
    match value.chars().next() {
        Some(first) if DANGEROUS_PREFIXES.contains(&first) => {
            let mut out = String::with_capacity(value.len() + 1);
            out.push('\'');
            out.push_str(value);
            out
        }
        _ => value.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn neutralizes_formula_injection() {
        assert_eq!(sanitize_text_cell("=SUM(A1)"), "'=SUM(A1)");
        assert_eq!(sanitize_text_cell("+42"), "'+42");
        assert_eq!(sanitize_text_cell("-cmd"), "'-cmd");
        assert_eq!(sanitize_text_cell("@ref"), "'@ref");
        assert_eq!(sanitize_text_cell("\tTab"), "'\tTab");
        assert_eq!(sanitize_text_cell("\rCr"), "'\rCr");
    }

    #[test]
    fn leaves_safe_text_untouched() {
        assert_eq!(sanitize_text_cell("Jean Dupont"), "Jean Dupont");
        assert_eq!(sanitize_text_cell("TECH"), "TECH");
        assert_eq!(sanitize_text_cell(""), "");
    }
}
