//! Tests d’intégration de l’activation de licence hors ligne (Lot 2B-RC1-SEC1-B).
//!
//! Toutes les logiques métier testées ici opèrent sur une URL SQLite explicite
//! (`*_on_url`), sans dépendre d’un `AppHandle` Tauri réel — cohérent avec les
//! autres tests du module (`local_access::tests`). Les paires de clés Ed25519
//! sont générées à la volée (`license::generate_test_keypair`) : la clé
//! publique embarquée en production n’est jamais nécessaire ici.

use ed25519_dalek::{Signer, SigningKey};
use jrb_license_core::{
    encode_license_code, LicenseCoreError, LicensePayload, APP_ID, LICENSE_PAYLOAD_VERSION,
};
use sqlx::SqlitePool;
use time::OffsetDateTime;

use super::calendar;
use super::commands::{
    activate_offline_license_for_window, load_status_on_url, setup_local_access_on_url,
    SetupLocalAccessInput,
};
use super::error::LocalAccessError;
use super::license::{activate_offline_license_on_url, generate_test_keypair};
use super::state::AccessSessionState;
use super::store::{self, open_and_ensure_schema_on_url, LocalAccessStateRow};
use super::windows::{ACCESS_WINDOW_LABEL, MAIN_WINDOW_LABEL};

// ---------------------------------------------------------------------------
// Fixtures et utilitaires
// ---------------------------------------------------------------------------

async fn temp_url() -> (tempfile::TempDir, String) {
    let dir = tempfile::tempdir().expect("temp dir");
    let db_path = dir.path().join("license-tests.db");
    let url = format!("sqlite:{}", db_path.to_str().unwrap());
    (dir, url)
}

fn setup_input(password: &str) -> SetupLocalAccessInput {
    SetupLocalAccessInput {
        password: password.to_string(),
        password_confirmation: password.to_string(),
    }
}

async fn setup_state(url: &str) -> LocalAccessStateRow {
    setup_local_access_on_url(url, &setup_input("MotDePasseValide1"))
        .await
        .expect("setup")
}

async fn fetch_row(url: &str) -> LocalAccessStateRow {
    let mut conn = open_and_ensure_schema_on_url(url).await.expect("open");
    let row = store::fetch_state(&mut conn)
        .await
        .expect("fetch")
        .expect("row present");
    let _ = crate::sqlite_local::close_connection(conn).await;
    row
}

async fn activation_count(url: &str) -> i64 {
    let pool = SqlitePool::connect(url).await.expect("pool");
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM license_activations")
        .fetch_one(&pool)
        .await
        .expect("count");
    pool.close().await;
    count
}

async fn force_current_valid_until(url: &str, value: &str) {
    let pool = SqlitePool::connect(url).await.expect("pool");
    sqlx::query("UPDATE local_access_state SET current_valid_until = ?1 WHERE singleton_id = 1")
        .bind(value)
        .execute(&pool)
        .await
        .expect("force current_valid_until");
    pool.close().await;
}

async fn force_last_observed_at(url: &str, value: &str) {
    let pool = SqlitePool::connect(url).await.expect("pool");
    sqlx::query("UPDATE local_access_state SET last_observed_at = ?1 WHERE singleton_id = 1")
        .bind(value)
        .execute(&pool)
        .await
        .expect("force last_observed_at");
    pool.close().await;
}

async fn force_clock_anomaly(url: &str, value: bool) {
    let pool = SqlitePool::connect(url).await.expect("pool");
    sqlx::query("UPDATE local_access_state SET clock_anomaly_detected = ?1 WHERE singleton_id = 1")
        .bind(if value { 1 } else { 0 })
        .execute(&pool)
        .await
        .expect("force clock_anomaly_detected");
    pool.close().await;
}

fn license_id_for(now: OffsetDateTime, suffix: u32) -> String {
    format!(
        "LIC-{:04}{:02}{:02}-{:08X}",
        now.year(),
        u8::from(now.month()),
        now.day(),
        suffix
    )
}

fn payload_for(
    installation_id: &str,
    duration_months: u32,
    now: OffsetDateTime,
    suffix: u32,
) -> LicensePayload {
    LicensePayload {
        v: LICENSE_PAYLOAD_VERSION,
        app_id: APP_ID.to_string(),
        installation_id: installation_id.to_string(),
        license_id: license_id_for(now, suffix),
        issued_at: calendar::to_rfc3339(now).expect("issued_at"),
        duration_months,
        customer: None,
    }
}

fn sign_code(signing_key: &SigningKey, payload: &LicensePayload) -> String {
    let bytes = payload.to_canonical_bytes().expect("bytes");
    let signature = signing_key.sign(&bytes);
    encode_license_code(&bytes, signature.to_bytes().as_ref())
}

fn tamper_payload_segment(code: &str) -> String {
    let parts: Vec<&str> = code.split('.').collect();
    let mut payload_b64 = parts[1].to_string();
    let last = payload_b64.pop().expect("non-empty payload segment");
    let replacement = if last == 'A' { 'B' } else { 'A' };
    payload_b64.push(replacement);
    format!("{}.{}.{}", parts[0], payload_b64, parts[2])
}

// ---------------------------------------------------------------------------
// 1. Chemin heureux
// ---------------------------------------------------------------------------

#[tokio::test]
async fn case_01_activate_succeeds_and_extends_from_current_valid_until() {
    let (_dir, url) = temp_url().await;
    let row = setup_state(&url).await;
    let (signing, verifying) = generate_test_keypair();
    let now = calendar::now_utc();
    let payload = payload_for(&row.installation_id, 12, now, 1);
    let code = sign_code(&signing, &payload);

    let dto = activate_offline_license_on_url(&url, &code, &verifying, now)
        .await
        .expect("activate");

    assert_eq!(dto.license_id, payload.license_id);
    assert_eq!(dto.duration_months, 12);
    assert_eq!(dto.previous_valid_until, row.current_valid_until);
    assert!(dto.customer.is_none());

    let expected_base = calendar::parse_rfc3339(&row.current_valid_until).expect("parse");
    let expected_new = calendar::add_calendar_months(expected_base, 12);
    assert_eq!(
        calendar::parse_rfc3339(&dto.new_valid_until).expect("parse new"),
        expected_new
    );
}

#[tokio::test]
async fn case_02_activate_from_expired_state_uses_now_as_base_date() {
    let (_dir, url) = temp_url().await;
    let row = setup_state(&url).await;
    force_current_valid_until(&url, "2000-01-01T00:00:00Z").await;
    let (signing, verifying) = generate_test_keypair();
    let now = calendar::now_utc();
    let payload = payload_for(&row.installation_id, 6, now, 2);
    let code = sign_code(&signing, &payload);

    let dto = activate_offline_license_on_url(&url, &code, &verifying, now)
        .await
        .expect("activate");

    let expected_new = calendar::add_calendar_months(now, 6);
    assert_eq!(
        calendar::parse_rfc3339(&dto.new_valid_until).expect("parse new"),
        expected_new
    );
    assert_eq!(dto.previous_valid_until, "2000-01-01T00:00:00Z");
}

// ---------------------------------------------------------------------------
// 2. Échecs métier
// ---------------------------------------------------------------------------

#[tokio::test]
async fn case_03_activate_fails_when_not_set_up() {
    let (_dir, url) = temp_url().await;
    let (signing, verifying) = generate_test_keypair();
    let now = calendar::now_utc();
    let payload = payload_for("JRB-CS-00000000-00000000", 12, now, 3);
    let code = sign_code(&signing, &payload);

    let result = activate_offline_license_on_url(&url, &code, &verifying, now).await;
    assert!(matches!(result, Err(LocalAccessError::NotSetUp)));
}

#[tokio::test]
async fn case_04_activate_fails_on_installation_id_mismatch() {
    let (_dir, url) = temp_url().await;
    setup_state(&url).await;
    let (signing, verifying) = generate_test_keypair();
    let now = calendar::now_utc();
    let payload = payload_for("JRB-CS-FFFFFFFF-FFFFFFFF", 12, now, 4);
    let code = sign_code(&signing, &payload);

    let result = activate_offline_license_on_url(&url, &code, &verifying, now).await;
    assert!(matches!(
        result,
        Err(LocalAccessError::LicenseInstallationMismatch)
    ));
    assert_eq!(activation_count(&url).await, 0);
}

#[tokio::test]
async fn case_05_activate_fails_when_license_already_used() {
    let (_dir, url) = temp_url().await;
    let row = setup_state(&url).await;
    let (signing, verifying) = generate_test_keypair();
    let now = calendar::now_utc();
    let payload = payload_for(&row.installation_id, 12, now, 5);
    let code = sign_code(&signing, &payload);

    activate_offline_license_on_url(&url, &code, &verifying, now)
        .await
        .expect("first activation");
    let second = activate_offline_license_on_url(&url, &code, &verifying, now).await;
    assert!(matches!(second, Err(LocalAccessError::LicenseAlreadyUsed)));
    assert_eq!(activation_count(&url).await, 1);
}

#[tokio::test]
async fn case_06_activate_fails_on_wrong_verifying_key() {
    let (_dir, url) = temp_url().await;
    let row = setup_state(&url).await;
    let (signing, _verifying) = generate_test_keypair();
    let (_other_signing, other_verifying) = generate_test_keypair();
    let now = calendar::now_utc();
    let payload = payload_for(&row.installation_id, 12, now, 6);
    let code = sign_code(&signing, &payload);

    let result = activate_offline_license_on_url(&url, &code, &other_verifying, now).await;
    assert!(matches!(
        result,
        Err(LocalAccessError::License(
            LicenseCoreError::InvalidSignature
        ))
    ));
}

#[tokio::test]
async fn case_07_activate_fails_on_malformed_code_format() {
    let (_dir, url) = temp_url().await;
    setup_state(&url).await;
    let (_signing, verifying) = generate_test_keypair();
    let now = calendar::now_utc();

    let result = activate_offline_license_on_url(&url, "not-a-license-code", &verifying, now).await;
    assert!(matches!(
        result,
        Err(LocalAccessError::License(LicenseCoreError::InvalidFormat))
    ));
}

#[tokio::test]
async fn case_08_activate_fails_on_tampered_payload() {
    let (_dir, url) = temp_url().await;
    let row = setup_state(&url).await;
    let (signing, verifying) = generate_test_keypair();
    let now = calendar::now_utc();
    let payload = payload_for(&row.installation_id, 12, now, 8);
    let code = sign_code(&signing, &payload);
    let tampered = tamper_payload_segment(&code);

    let result = activate_offline_license_on_url(&url, &tampered, &verifying, now).await;
    assert!(matches!(
        result,
        Err(LocalAccessError::License(
            LicenseCoreError::InvalidSignature
                | LicenseCoreError::InvalidFormat
                | LicenseCoreError::InvalidPayload
        ))
    ));
}

#[tokio::test]
async fn case_09_activate_fails_on_issued_at_more_than_24h_in_future() {
    let (_dir, url) = temp_url().await;
    let row = setup_state(&url).await;
    let (signing, verifying) = generate_test_keypair();
    let now = calendar::now_utc();
    let mut payload = payload_for(&row.installation_id, 12, now, 9);
    payload.issued_at = calendar::to_rfc3339(now + time::Duration::hours(48)).expect("future");
    let code = sign_code(&signing, &payload);

    let result = activate_offline_license_on_url(&url, &code, &verifying, now).await;
    assert!(matches!(
        result,
        Err(LocalAccessError::License(LicenseCoreError::InvalidIssuedAt))
    ));
}

#[tokio::test]
async fn case_10_activate_fails_on_wrong_app_id() {
    let (_dir, url) = temp_url().await;
    let row = setup_state(&url).await;
    let (signing, verifying) = generate_test_keypair();
    let now = calendar::now_utc();
    let mut payload = payload_for(&row.installation_id, 12, now, 10);
    payload.app_id = "com.other.application".to_string();
    let code = sign_code(&signing, &payload);

    let result = activate_offline_license_on_url(&url, &code, &verifying, now).await;
    assert!(matches!(
        result,
        Err(LocalAccessError::License(LicenseCoreError::InvalidAppId))
    ));
}

#[tokio::test]
async fn case_11_activate_fails_on_duration_out_of_range() {
    let (_dir, url) = temp_url().await;
    let row = setup_state(&url).await;
    let (signing, verifying) = generate_test_keypair();
    let now = calendar::now_utc();
    let mut payload = payload_for(&row.installation_id, 12, now, 11);
    payload.duration_months = 0;
    let code = sign_code(&signing, &payload);

    let result = activate_offline_license_on_url(&url, &code, &verifying, now).await;
    assert!(matches!(
        result,
        Err(LocalAccessError::License(LicenseCoreError::InvalidDuration))
    ));
}

#[tokio::test]
async fn case_12_activate_fails_on_invalid_version() {
    let (_dir, url) = temp_url().await;
    let row = setup_state(&url).await;
    let (signing, verifying) = generate_test_keypair();
    let now = calendar::now_utc();
    let mut payload = payload_for(&row.installation_id, 12, now, 12);
    payload.v = 999;
    let code = sign_code(&signing, &payload);

    let result = activate_offline_license_on_url(&url, &code, &verifying, now).await;
    assert!(matches!(
        result,
        Err(LocalAccessError::License(LicenseCoreError::InvalidVersion))
    ));
}

// ---------------------------------------------------------------------------
// 3. Persistance, transaction, préservation des champs
// ---------------------------------------------------------------------------

#[tokio::test]
async fn case_13_activation_history_row_matches_returned_dto() {
    let (_dir, url) = temp_url().await;
    let row = setup_state(&url).await;
    let (signing, verifying) = generate_test_keypair();
    let now = calendar::now_utc();
    let payload = payload_for(&row.installation_id, 24, now, 13);
    let code = sign_code(&signing, &payload);

    let dto = activate_offline_license_on_url(&url, &code, &verifying, now)
        .await
        .expect("activate");

    let mut conn = open_and_ensure_schema_on_url(&url).await.expect("open");
    let latest = store::fetch_latest_activation(&mut conn)
        .await
        .expect("fetch")
        .expect("row present");
    let _ = crate::sqlite_local::close_connection(conn).await;

    assert_eq!(latest.license_id, dto.license_id);
    assert_eq!(latest.installation_id, row.installation_id);
    assert_eq!(latest.duration_months, dto.duration_months);
    assert_eq!(latest.new_valid_until, dto.new_valid_until);
    assert_eq!(latest.previous_valid_until, dto.previous_valid_until);
    assert_eq!(latest.activated_at, dto.activated_at);
}

#[tokio::test]
async fn case_14_failed_activation_leaves_state_and_history_unchanged() {
    let (_dir, url) = temp_url().await;
    setup_state(&url).await;
    let before = fetch_row(&url).await;
    let (signing, verifying) = generate_test_keypair();
    let now = calendar::now_utc();
    let payload = payload_for("JRB-CS-FFFFFFFF-FFFFFFFF", 12, now, 14);
    let code = sign_code(&signing, &payload);

    let result = activate_offline_license_on_url(&url, &code, &verifying, now).await;
    assert!(result.is_err());

    let after = fetch_row(&url).await;
    assert_eq!(before, after);
    assert_eq!(activation_count(&url).await, 0);
}

#[tokio::test]
async fn case_15_duplicate_attempt_does_not_change_state_further() {
    let (_dir, url) = temp_url().await;
    let row = setup_state(&url).await;
    let (signing, verifying) = generate_test_keypair();
    let now = calendar::now_utc();
    let payload = payload_for(&row.installation_id, 12, now, 15);
    let code = sign_code(&signing, &payload);

    activate_offline_license_on_url(&url, &code, &verifying, now)
        .await
        .expect("first activation");
    let after_first = fetch_row(&url).await;

    let _ = activate_offline_license_on_url(&url, &code, &verifying, now).await;
    let after_second_attempt = fetch_row(&url).await;

    assert_eq!(after_first, after_second_attempt);
    assert_eq!(activation_count(&url).await, 1);
}

#[tokio::test]
async fn case_16_clears_clock_anomaly_on_successful_activation() {
    let (_dir, url) = temp_url().await;
    let row = setup_state(&url).await;
    force_clock_anomaly(&url, true).await;
    let (signing, verifying) = generate_test_keypair();
    let now = calendar::now_utc();
    let payload = payload_for(&row.installation_id, 12, now, 16);
    let code = sign_code(&signing, &payload);

    activate_offline_license_on_url(&url, &code, &verifying, now)
        .await
        .expect("activate despite anomaly");

    let after = fetch_row(&url).await;
    assert!(!after.clock_anomaly_detected);
}

#[tokio::test]
async fn case_17_clock_anomaly_not_cleared_on_failed_activation() {
    let (_dir, url) = temp_url().await;
    setup_state(&url).await;
    force_clock_anomaly(&url, true).await;
    let (signing, verifying) = generate_test_keypair();
    let now = calendar::now_utc();
    let payload = payload_for("JRB-CS-FFFFFFFF-FFFFFFFF", 12, now, 17);
    let code = sign_code(&signing, &payload);

    let result = activate_offline_license_on_url(&url, &code, &verifying, now).await;
    assert!(result.is_err());

    let after = fetch_row(&url).await;
    assert!(after.clock_anomaly_detected);
}

#[tokio::test]
async fn case_18_preserves_password_hash_installation_id_and_initial_valid_until() {
    let (_dir, url) = temp_url().await;
    let row = setup_state(&url).await;
    let (signing, verifying) = generate_test_keypair();
    let now = calendar::now_utc();
    let payload = payload_for(&row.installation_id, 12, now, 18);
    let code = sign_code(&signing, &payload);

    activate_offline_license_on_url(&url, &code, &verifying, now)
        .await
        .expect("activate");

    let after = fetch_row(&url).await;
    assert_eq!(after.password_hash, row.password_hash);
    assert_eq!(after.installation_id, row.installation_id);
    assert_eq!(after.initial_valid_until, row.initial_valid_until);
}

#[tokio::test]
async fn case_19_last_observed_at_advances_to_now_when_later_than_stored() {
    let (_dir, url) = temp_url().await;
    let row = setup_state(&url).await;
    let past = calendar::to_rfc3339(calendar::now_utc() - time::Duration::hours(1)).expect("past");
    force_last_observed_at(&url, &past).await;
    let (signing, verifying) = generate_test_keypair();
    let now = calendar::now_utc();
    let payload = payload_for(&row.installation_id, 12, now, 19);
    let code = sign_code(&signing, &payload);

    activate_offline_license_on_url(&url, &code, &verifying, now)
        .await
        .expect("activate");

    let after = fetch_row(&url).await;
    let after_observed = calendar::parse_rfc3339(&after.last_observed_at).expect("parse");
    assert!(after_observed >= now);
}

#[tokio::test]
async fn case_20_last_observed_at_never_decreases_when_stored_value_is_future() {
    let (_dir, url) = temp_url().await;
    let row = setup_state(&url).await;
    let now = calendar::now_utc();
    let future = calendar::to_rfc3339(now + time::Duration::days(3650)).expect("future");
    force_last_observed_at(&url, &future).await;
    let (signing, verifying) = generate_test_keypair();
    let payload = payload_for(&row.installation_id, 12, now, 20);
    let code = sign_code(&signing, &payload);

    activate_offline_license_on_url(&url, &code, &verifying, now)
        .await
        .expect("activate");

    let after = fetch_row(&url).await;
    assert_eq!(after.last_observed_at, future);
}

#[tokio::test]
async fn case_21_base_date_uses_previously_extended_valid_until_when_still_future() {
    let (_dir, url) = temp_url().await;
    let row = setup_state(&url).await;
    let (signing, verifying) = generate_test_keypair();
    let now = calendar::now_utc();

    let first_payload = payload_for(&row.installation_id, 12, now, 21);
    let first_code = sign_code(&signing, &first_payload);
    let first_dto = activate_offline_license_on_url(&url, &first_code, &verifying, now)
        .await
        .expect("first activation");

    let second_payload = payload_for(&row.installation_id, 6, now, 22);
    let second_code = sign_code(&signing, &second_payload);
    let second_dto = activate_offline_license_on_url(&url, &second_code, &verifying, now)
        .await
        .expect("second activation");

    assert_eq!(second_dto.previous_valid_until, first_dto.new_valid_until);
    let expected_base = calendar::parse_rfc3339(&first_dto.new_valid_until).expect("parse");
    let expected_new = calendar::add_calendar_months(expected_base, 6);
    assert_eq!(
        calendar::parse_rfc3339(&second_dto.new_valid_until).expect("parse new"),
        expected_new
    );
}

#[tokio::test]
async fn case_22_new_valid_until_clamps_to_last_day_of_shorter_month() {
    let (_dir, url) = temp_url().await;
    let row = setup_state(&url).await;
    // Date volontairement très éloignée dans le futur (2099, non bissextile) :
    // reste supérieure à « maintenant » quelle que soit la date d’exécution
    // des tests, donc `base_date = current_valid_until` (jamais `now`).
    force_current_valid_until(&url, "2099-01-31T12:00:00Z").await;
    let (signing, verifying) = generate_test_keypair();
    let now = calendar::now_utc();
    let payload = payload_for(&row.installation_id, 1, now, 23);
    let code = sign_code(&signing, &payload);

    let dto = activate_offline_license_on_url(&url, &code, &verifying, now)
        .await
        .expect("activate");

    assert_eq!(dto.new_valid_until, "2099-02-28T12:00:00Z");
}

#[tokio::test]
async fn case_23_customer_field_round_trips_when_present() {
    let (_dir, url) = temp_url().await;
    let row = setup_state(&url).await;
    let (signing, verifying) = generate_test_keypair();
    let now = calendar::now_utc();
    let mut payload = payload_for(&row.installation_id, 12, now, 24);
    payload.customer = Some("Client A".to_string());
    let code = sign_code(&signing, &payload);

    let dto = activate_offline_license_on_url(&url, &code, &verifying, now)
        .await
        .expect("activate");

    assert_eq!(dto.customer, Some("Client A".to_string()));

    let mut conn = open_and_ensure_schema_on_url(&url).await.expect("open");
    let latest = store::fetch_latest_activation(&mut conn)
        .await
        .expect("fetch")
        .expect("row");
    let _ = crate::sqlite_local::close_connection(conn).await;
    assert_eq!(latest.customer, Some("Client A".to_string()));
}

#[tokio::test]
async fn case_24_customer_field_is_none_when_absent() {
    let (_dir, url) = temp_url().await;
    let row = setup_state(&url).await;
    let (signing, verifying) = generate_test_keypair();
    let now = calendar::now_utc();
    let payload = payload_for(&row.installation_id, 12, now, 25);
    let code = sign_code(&signing, &payload);

    let dto = activate_offline_license_on_url(&url, &code, &verifying, now)
        .await
        .expect("activate");

    assert!(dto.customer.is_none());
}

// ---------------------------------------------------------------------------
// 4. Restriction par fenêtre (couche commande)
// ---------------------------------------------------------------------------

#[tokio::test]
async fn case_25_command_from_access_succeeds_when_expired() {
    let (_dir, url) = temp_url().await;
    let row = setup_state(&url).await;
    force_current_valid_until(&url, "2000-01-01T00:00:00Z").await;
    let (signing, verifying) = generate_test_keypair();
    let now = calendar::now_utc();
    let payload = payload_for(&row.installation_id, 12, now, 26);
    let code = sign_code(&signing, &payload);
    let session = AccessSessionState::new();

    let result =
        activate_offline_license_for_window(ACCESS_WINDOW_LABEL, &session, &url, &code, &verifying)
            .await;
    assert!(result.is_ok());
    // L’activation seule ne doit jamais déverrouiller la session.
    assert!(!session.is_unlocked());
}

#[tokio::test]
async fn case_26_command_from_access_refused_when_not_expired_or_anomalous() {
    let (_dir, url) = temp_url().await;
    let row = setup_state(&url).await;
    let (signing, verifying) = generate_test_keypair();
    let now = calendar::now_utc();
    let payload = payload_for(&row.installation_id, 12, now, 27);
    let code = sign_code(&signing, &payload);
    let session = AccessSessionState::new();

    let result =
        activate_offline_license_for_window(ACCESS_WINDOW_LABEL, &session, &url, &code, &verifying)
            .await;
    assert!(matches!(result, Err(LocalAccessError::InvalidAccessWindow)));
    assert_eq!(activation_count(&url).await, 0);
}

#[tokio::test]
async fn case_27_command_from_main_refused_when_session_locked() {
    let (_dir, url) = temp_url().await;
    let row = setup_state(&url).await;
    force_current_valid_until(&url, "2000-01-01T00:00:00Z").await;
    let (signing, verifying) = generate_test_keypair();
    let now = calendar::now_utc();
    let payload = payload_for(&row.installation_id, 12, now, 28);
    let code = sign_code(&signing, &payload);
    let session = AccessSessionState::new();

    let result =
        activate_offline_license_for_window(MAIN_WINDOW_LABEL, &session, &url, &code, &verifying)
            .await;
    assert!(matches!(result, Err(LocalAccessError::SessionLocked)));
}

#[tokio::test]
async fn case_28_command_from_main_succeeds_when_session_unlocked() {
    let (_dir, url) = temp_url().await;
    let row = setup_state(&url).await;
    let (signing, verifying) = generate_test_keypair();
    let now = calendar::now_utc();
    let payload = payload_for(&row.installation_id, 6, now, 29);
    let code = sign_code(&signing, &payload);
    let session = AccessSessionState::new();
    session.set_unlocked(true);

    let result =
        activate_offline_license_for_window(MAIN_WINDOW_LABEL, &session, &url, &code, &verifying)
            .await;
    assert!(result.is_ok());
    // La session déverrouillée le reste : l’activation ne modifie pas la session.
    assert!(session.is_unlocked());
}

#[tokio::test]
async fn case_29_command_from_unknown_window_refused() {
    let (_dir, url) = temp_url().await;
    let row = setup_state(&url).await;
    let (signing, verifying) = generate_test_keypair();
    let now = calendar::now_utc();
    let payload = payload_for(&row.installation_id, 12, now, 30);
    let code = sign_code(&signing, &payload);
    let session = AccessSessionState::new();

    let result =
        activate_offline_license_for_window("other", &session, &url, &code, &verifying).await;
    assert!(matches!(result, Err(LocalAccessError::InvalidAccessWindow)));
}

// ---------------------------------------------------------------------------
// 5. DTO de statut (`canActivateLicense`, dernière licence)
// ---------------------------------------------------------------------------

#[tokio::test]
async fn case_30_status_can_activate_license_true_when_expired() {
    let (_dir, url) = temp_url().await;
    setup_state(&url).await;
    force_current_valid_until(&url, "2000-01-01T00:00:00Z").await;

    let status = load_status_on_url(&url).await.expect("status");
    assert!(status.expired);
    let can_activate = status.expired || status.clock_anomaly;
    assert!(can_activate);
}

#[tokio::test]
async fn case_31_status_reports_last_license_after_successful_activation() {
    let (_dir, url) = temp_url().await;
    let row = setup_state(&url).await;
    let (signing, verifying) = generate_test_keypair();
    let now = calendar::now_utc();
    let payload = payload_for(&row.installation_id, 12, now, 31);
    let code = sign_code(&signing, &payload);

    let dto = activate_offline_license_on_url(&url, &code, &verifying, now)
        .await
        .expect("activate");

    let status = load_status_on_url(&url).await.expect("status");
    let latest = status.latest_activation.expect("latest activation present");
    assert_eq!(latest.license_id, dto.license_id);
    assert_eq!(latest.activated_at, dto.activated_at);
}

#[tokio::test]
async fn case_32_status_has_no_latest_activation_before_any_activation() {
    let (_dir, url) = temp_url().await;
    setup_state(&url).await;

    let status = load_status_on_url(&url).await.expect("status");
    assert!(status.latest_activation.is_none());
}

#[tokio::test]
async fn case_33_license_id_exists_reflects_persisted_activations() {
    let (_dir, url) = temp_url().await;
    let row = setup_state(&url).await;
    let (signing, verifying) = generate_test_keypair();
    let now = calendar::now_utc();
    let payload = payload_for(&row.installation_id, 12, now, 33);
    let code = sign_code(&signing, &payload);

    let mut conn = open_and_ensure_schema_on_url(&url).await.expect("open");
    assert!(!store::license_id_exists(&mut conn, &payload.license_id)
        .await
        .expect("exists before"));
    let _ = crate::sqlite_local::close_connection(conn).await;

    activate_offline_license_on_url(&url, &code, &verifying, now)
        .await
        .expect("activate");

    let mut conn = open_and_ensure_schema_on_url(&url).await.expect("open");
    assert!(store::license_id_exists(&mut conn, &payload.license_id)
        .await
        .expect("exists after"));
    let _ = crate::sqlite_local::close_connection(conn).await;
}

#[tokio::test]
async fn case_34_ensure_schema_replay_preserves_license_activations() {
    let (_dir, url) = temp_url().await;
    let row = setup_state(&url).await;
    let (signing, verifying) = generate_test_keypair();
    let now = calendar::now_utc();
    let payload = payload_for(&row.installation_id, 12, now, 34);
    let code = sign_code(&signing, &payload);
    activate_offline_license_on_url(&url, &code, &verifying, now)
        .await
        .expect("activate");

    // Rejoue l’ouverture + migrations idempotentes (0010 + 0011) : l’historique
    // d’activation doit survivre, comme la ligne `local_access_state`.
    let mut conn = open_and_ensure_schema_on_url(&url).await.expect("reopen");
    let latest = store::fetch_latest_activation(&mut conn)
        .await
        .expect("fetch")
        .expect("row still present");
    assert_eq!(latest.license_id, payload.license_id);
    let _ = crate::sqlite_local::close_connection(conn).await;
}
