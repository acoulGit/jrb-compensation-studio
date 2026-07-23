//! Écriture atomique du fichier d’export (Lot 2B-E1).
//!
//! On écrit d’abord un fichier temporaire au nom imprévisible (extension NON
//! `.xlsx`) dans le même répertoire, on le synchronise sur disque, puis on le
//! renomme vers la destination finale. Le temporaire est nettoyé en cas
//! d’erreur.

use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};

use rand::Rng;

use super::error::ExportError;

fn temp_path_for(final_path: &Path) -> Result<PathBuf, ExportError> {
    let parent = final_path.parent().ok_or(ExportError::DestinationInvalid)?;
    let mut rng = rand::rng();
    let token: u128 = ((rng.random::<u64>() as u128) << 64) | (rng.random::<u64>() as u128);
    // Extension volontairement différente de .xlsx (fichier partiel non ouvrable).
    let name = format!(".jrb-export-{token:032x}.part");
    Ok(parent.join(name))
}

/// Écrit `bytes` de façon atomique vers `final_path`.
pub fn atomic_write(final_path: &Path, bytes: &[u8]) -> Result<(), ExportError> {
    let temp_path = temp_path_for(final_path)?;

    let write_result = (|| -> std::io::Result<()> {
        let mut file = File::create(&temp_path)?;
        file.write_all(bytes)?;
        file.flush()?;
        file.sync_all()?;
        drop(file);
        Ok(())
    })();

    if let Err(error) = write_result {
        let _ = fs::remove_file(&temp_path);
        return Err(ExportError::FileWrite(error.to_string()));
    }

    if let Err(error) = fs::rename(&temp_path, final_path) {
        let _ = fs::remove_file(&temp_path);
        return Err(ExportError::FileWrite(error.to_string()));
    }

    Ok(())
}
