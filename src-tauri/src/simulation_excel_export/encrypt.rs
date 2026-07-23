//! Chiffrement agile ECMA-376 du classeur XLSX (Lot 2B-E1).
//!
//! Le buffer clair est chiffré en mémoire (aucune écriture disque du clair).
//! `ms-offcrypto-writer` lie `rand` 0.9 (`CryptoRng + Rng`).

use std::io::{Cursor, Write};

use ms_offcrypto_writer::Ecma376AgileWriter;

use super::error::ExportError;

/// Chiffre `plain` (XLSX OOXML) avec `password` en Agile Encryption.
///
/// Retourne le conteneur CFB chiffré (ne commence PAS par « PK »).
pub fn encrypt_agile(plain: &[u8], password: &str) -> Result<Vec<u8>, ExportError> {
    let mut out = Cursor::new(Vec::new());
    let mut agile = Ecma376AgileWriter::create(&mut rand::rng(), password, &mut out)
        .map_err(|error| ExportError::Encryption(error.to_string()))?;
    agile
        .write_all(plain)
        .map_err(|error| ExportError::Encryption(error.to_string()))?;
    agile
        .finalize()
        .map_err(|error| ExportError::Encryption(error.to_string()))?;
    Ok(out.into_inner())
}
