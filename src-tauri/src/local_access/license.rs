//! Activation de licence hors ligne (Lot 2B-RC1-SEC1-B).
//!
//! Un code de licence (`JRB1.<payload>.<signature>`) est vérifié avec
//! `jrb_license_core::verify_license_code` (signature Ed25519, format, champs
//! métier) puis contrôlé côté application (installation, unicité) avant de
//! prolonger la période de validité de `local_access_state`. L’insertion de
//! l’historique (`license_activations`) et la mise à jour de l’état sont
//! effectuées dans une unique transaction SQL : soit les deux réussissent,
//! soit aucune n’est appliquée.
//!
//! La clé de vérification (publique, non secrète) est reçue en paramètre par
//! [`activate_offline_license_on_url`] — jamais lue directement par la
//! logique métier — ce qui permet de tester ce module avec des paires de clés
//! générées à la volée, sans dépendre du fichier embarqué en production.

use ed25519_dalek::VerifyingKey;
use serde::Serialize;
use sqlx::Connection;
use time::OffsetDateTime;

use crate::sqlite_local::close_connection;

use super::calendar;
use super::error::LocalAccessError;
use super::store::{self, LicenseActivationRow};

/// La clé publique embarquée a été générée avec la commande `keygen` du
/// générateur de licences. La clé privée correspondante est conservée hors
/// du dépôt et ne doit jamais être intégrée à l'application ou au bundle.
/// Toute rotation de cette clé publique nécessitera une nouvelle version
/// de l'application.
const EMBEDDED_PUBLIC_KEY_B64: &str = include_str!("../../license/license_public_key.b64");

/// Charge la clé de vérification embarquée. Échoue (plutôt que de paniquer)
/// si le fichier embarqué est absent, vide ou mal formé — un binaire livré
/// sans clé publique valide ne doit jamais accepter silencieusement une
/// licence non signée.
pub fn embedded_verifying_key() -> Result<VerifyingKey, LocalAccessError> {
    jrb_license_core::verifying_key_from_base64(EMBEDDED_PUBLIC_KEY_B64)
        .map_err(LocalAccessError::from)
}

/// Résultat exposé au frontend après une activation réussie — aucun secret,
/// aucun détail de signature.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LicenseActivationDto {
    pub license_id: String,
    pub duration_months: u32,
    pub previous_valid_until: String,
    pub new_valid_until: String,
    pub customer: Option<String>,
    pub activated_at: String,
}

impl From<LicenseActivationRow> for LicenseActivationDto {
    fn from(row: LicenseActivationRow) -> Self {
        Self {
            license_id: row.license_id,
            duration_months: row.duration_months,
            previous_valid_until: row.previous_valid_until,
            new_valid_until: row.new_valid_until,
            customer: row.customer,
            activated_at: row.activated_at,
        }
    }
}

/// Active un code de licence hors ligne sur la base pointée par `database_url`.
///
/// Étapes (transactionnelles à partir de l’insertion de l’historique) :
/// 1. Charge `local_access_state` (échoue avec [`LocalAccessError::NotSetUp`]
///    si l’accès local n’a jamais été configuré) ;
/// 2. Vérifie la signature et les champs du code (`jrb_license_core`) ;
/// 3. Vérifie que le code cible bien cette installation ;
/// 4. Vérifie que ce `license_id` n’a pas déjà été utilisé ;
/// 5. Calcule la nouvelle date de fin de validité : `base_date = max(now,
///    current_valid_until)`, puis ajoute `duration_months` mois civils ;
/// 6. Insère l’historique et met à jour l’état en une seule transaction — la
///    mise à jour lève aussi toute anomalie d’horloge déjà détectée.
pub async fn activate_offline_license_on_url(
    database_url: &str,
    license_code: &str,
    verifying_key: &VerifyingKey,
    now: OffsetDateTime,
) -> Result<LicenseActivationDto, LocalAccessError> {
    let mut conn = store::open_and_ensure_schema_on_url(database_url).await?;
    let outcome = async {
        let row = store::fetch_state(&mut conn)
            .await?
            .ok_or(LocalAccessError::NotSetUp)?;

        let (payload, payload_bytes) =
            jrb_license_core::verify_license_code(license_code, verifying_key, now)
                .map_err(LocalAccessError::from)?;

        if payload.installation_id != row.installation_id {
            return Err(LocalAccessError::LicenseInstallationMismatch);
        }

        if store::license_id_exists(&mut conn, &payload.license_id).await? {
            return Err(LocalAccessError::LicenseAlreadyUsed);
        }

        let current_valid_until = calendar::parse_rfc3339(&row.current_valid_until)?;
        let base_date = if now > current_valid_until {
            now
        } else {
            current_valid_until
        };
        let new_valid_until = calendar::add_calendar_months(base_date, payload.duration_months);

        let now_text = calendar::to_rfc3339(now)?;
        let new_valid_until_text = calendar::to_rfc3339(new_valid_until)?;
        let payload_json = String::from_utf8(payload_bytes.clone())
            .map_err(|_| LocalAccessError::Database("payload licence non UTF-8".into()))?;
        let payload_sha256 = jrb_license_core::payload_sha256_hex(&payload_bytes);

        let activation_row = LicenseActivationRow {
            license_id: payload.license_id,
            installation_id: payload.installation_id,
            payload_json,
            payload_sha256,
            duration_months: payload.duration_months,
            customer: payload.customer,
            issued_at: payload.issued_at,
            previous_valid_until: row.current_valid_until.clone(),
            new_valid_until: new_valid_until_text.clone(),
            activated_at: now_text.clone(),
        };

        let mut tx = conn.begin().await?;
        let tx_outcome: Result<(), LocalAccessError> = async {
            store::insert_license_activation(&mut tx, &activation_row, &now_text).await?;
            store::update_validity_after_license_activation(
                &mut tx,
                &new_valid_until_text,
                &now_text,
            )
            .await?;
            Ok(())
        }
        .await;

        match tx_outcome {
            Ok(()) => {
                tx.commit().await?;
                Ok(LicenseActivationDto::from(activation_row))
            }
            Err(error) => {
                let _ = tx.rollback().await;
                Err(error)
            }
        }
    }
    .await;
    let _ = close_connection(conn).await;
    outcome
}

/// Génère une paire de clés Ed25519 éphémère pour les tests — jamais utilisée
/// en production (la clé publique embarquée vit dans
/// `license/license_public_key.b64`, la clé privée correspondante n’est
/// jamais présente dans ce dépôt).
#[cfg(test)]
pub(crate) fn generate_test_keypair() -> (ed25519_dalek::SigningKey, VerifyingKey) {
    use ed25519_dalek::SigningKey;
    use rand::RngCore;
    let mut seed = [0u8; 32];
    rand::rng().fill_bytes(&mut seed);
    let signing = SigningKey::from_bytes(&seed);
    let verifying = signing.verifying_key();
    (signing, verifying)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn embedded_verifying_key_loads_a_valid_key() {
        // Le fichier embarqué doit toujours décoder vers une clé Ed25519
        // valide, quelle que soit la clé effectivement déployée (dev ou
        // production) — sinon le binaire ne pourrait jamais activer de licence.
        embedded_verifying_key().expect("embedded verifying key must decode");
    }

    #[test]
    fn generated_test_keypairs_differ() {
        let (_signing_a, verifying_a) = generate_test_keypair();
        let (_signing_b, verifying_b) = generate_test_keypair();
        assert_ne!(verifying_a.as_bytes(), verifying_b.as_bytes());
    }
}
