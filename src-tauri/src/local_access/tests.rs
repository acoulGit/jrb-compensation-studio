//! Tests d’intégration du module d’accès local (Lot 2B-RC1-SEC1-A).
//!
//! Toutes les logiques métier testées ici opèrent sur une URL SQLite explicite
//! (`*_on_url`), sans dépendre d’un `AppHandle` Tauri réel — cohérent avec les
//! autres modules de persistance dédiée du projet.

use sqlx::SqlitePool;

use super::calendar;
use super::commands::{
    change_local_password_for_window, change_local_password_on_url, load_status_on_url,
    lock_local_access_for_window, setup_local_access_for_window, setup_local_access_on_url,
    unlock_local_access_for_window, unlock_local_access_on_url, ChangeLocalPasswordInput,
    SetupLocalAccessInput, UnlockLocalAccessInput,
};
use super::error::{LocalAccessError, CODE_INVALID_ACCESS_WINDOW};
use super::evaluate_license_status_on_url;
use super::state::AccessSessionState;
use super::store::open_and_ensure_schema_on_url;
use super::windows::{ACCESS_WINDOW_LABEL, MAIN_WINDOW_LABEL};

async fn temp_url() -> (tempfile::TempDir, String) {
    let dir = tempfile::tempdir().expect("temp dir");
    let db_path = dir.path().join("local-access-tests.db");
    let url = format!("sqlite:{}", db_path.to_str().unwrap());
    (dir, url)
}

fn setup_input(password: &str) -> SetupLocalAccessInput {
    SetupLocalAccessInput {
        password: password.to_string(),
        password_confirmation: password.to_string(),
    }
}

/// Recule artificiellement `current_valid_until` et/ou `last_observed_at` pour
/// simuler une expiration ou une anomalie d’horloge sans dépendre de l’horloge
/// système réelle.
async fn force_state(url: &str, current_valid_until: Option<&str>, last_observed_at: Option<&str>) {
    let pool = SqlitePool::connect(url).await.expect("pool");
    if let Some(value) = current_valid_until {
        sqlx::query(
            "UPDATE local_access_state SET current_valid_until = ?1 WHERE singleton_id = 1",
        )
        .bind(value)
        .execute(&pool)
        .await
        .expect("force current_valid_until");
    }
    if let Some(value) = last_observed_at {
        sqlx::query("UPDATE local_access_state SET last_observed_at = ?1 WHERE singleton_id = 1")
            .bind(value)
            .execute(&pool)
            .await
            .expect("force last_observed_at");
    }
    pool.close().await;
}

// ---------------------------------------------------------------------------
// 1. AccessSessionState (session en mémoire, non persistée)
// ---------------------------------------------------------------------------

#[test]
fn case_01_session_starts_locked_by_default() {
    let session = AccessSessionState::new();
    assert!(!session.is_unlocked());
}

#[test]
fn case_02_session_lock_and_unlock_toggle_independently() {
    let session = AccessSessionState::new();
    session.set_unlocked(true);
    assert!(session.is_unlocked());
    session.set_unlocked(false);
    assert!(!session.is_unlocked());
}

// ---------------------------------------------------------------------------
// 2. setup_local_access_on_url
// ---------------------------------------------------------------------------

#[tokio::test]
async fn case_03_setup_creates_installation_id_and_valid_until() {
    let (_dir, url) = temp_url().await;
    let row = setup_local_access_on_url(&url, &setup_input("MotDePasseValide1"))
        .await
        .expect("setup");
    assert!(row.installation_id.starts_with("JRB-CS-"));
    assert_eq!(row.installed_at, row.last_observed_at);
    assert_eq!(row.initial_valid_until, row.current_valid_until);
    assert!(!row.clock_anomaly_detected);
}

#[tokio::test]
async fn case_04_setup_sets_current_valid_until_ten_months_ahead() {
    let (_dir, url) = temp_url().await;
    let row = setup_local_access_on_url(&url, &setup_input("MotDePasseValide1"))
        .await
        .expect("setup");
    let installed_at = calendar::parse_rfc3339(&row.installed_at).expect("parse installed_at");
    let valid_until =
        calendar::parse_rfc3339(&row.current_valid_until).expect("parse current_valid_until");
    let expected = calendar::initial_valid_until(installed_at);
    assert_eq!(valid_until, expected);
}

#[tokio::test]
async fn case_05_setup_fails_when_already_configured() {
    let (_dir, url) = temp_url().await;
    setup_local_access_on_url(&url, &setup_input("MotDePasseValide1"))
        .await
        .expect("first setup");
    let second = setup_local_access_on_url(&url, &setup_input("AutreMotDePasse2")).await;
    assert!(matches!(second, Err(LocalAccessError::AlreadySetUp)));
}

#[tokio::test]
async fn case_06_setup_fails_on_password_confirmation_mismatch() {
    let (_dir, url) = temp_url().await;
    let input = SetupLocalAccessInput {
        password: "MotDePasseValide1".into(),
        password_confirmation: "AutreValeur2".into(),
    };
    let result = setup_local_access_on_url(&url, &input).await;
    assert!(matches!(result, Err(LocalAccessError::Validation(_))));
}

#[tokio::test]
async fn case_07_setup_fails_on_password_too_short() {
    let (_dir, url) = temp_url().await;
    let result = setup_local_access_on_url(&url, &setup_input("Ab1")).await;
    assert!(matches!(result, Err(LocalAccessError::Validation(_))));
}

#[tokio::test]
async fn case_08_setup_fails_on_whitespace_only_password() {
    let (_dir, url) = temp_url().await;
    let result = setup_local_access_on_url(&url, &setup_input("        ")).await;
    assert!(matches!(result, Err(LocalAccessError::Validation(_))));
}

#[tokio::test]
async fn case_09_setup_fails_on_password_too_long() {
    let (_dir, url) = temp_url().await;
    let too_long = "A".repeat(200);
    let result = setup_local_access_on_url(&url, &setup_input(&too_long)).await;
    assert!(matches!(result, Err(LocalAccessError::Validation(_))));
}

// ---------------------------------------------------------------------------
// 3. unlock_local_access_on_url
// ---------------------------------------------------------------------------

#[tokio::test]
async fn case_10_unlock_succeeds_with_correct_password() {
    let (_dir, url) = temp_url().await;
    setup_local_access_on_url(&url, &setup_input("MotDePasseValide1"))
        .await
        .expect("setup");
    let unlocked = unlock_local_access_on_url(
        &url,
        &UnlockLocalAccessInput {
            password: "MotDePasseValide1".into(),
        },
    )
    .await
    .expect("unlock");
    assert!(unlocked.installation_id.starts_with("JRB-CS-"));
}

#[tokio::test]
async fn case_11_unlock_fails_with_incorrect_password() {
    let (_dir, url) = temp_url().await;
    setup_local_access_on_url(&url, &setup_input("MotDePasseValide1"))
        .await
        .expect("setup");
    let result = unlock_local_access_on_url(
        &url,
        &UnlockLocalAccessInput {
            password: "MauvaisMotDePasse".into(),
        },
    )
    .await;
    assert!(matches!(result, Err(LocalAccessError::InvalidCredentials)));
}

#[tokio::test]
async fn case_12_unlock_fails_with_blank_password() {
    let (_dir, url) = temp_url().await;
    setup_local_access_on_url(&url, &setup_input("MotDePasseValide1"))
        .await
        .expect("setup");
    let result = unlock_local_access_on_url(
        &url,
        &UnlockLocalAccessInput {
            password: "   ".into(),
        },
    )
    .await;
    assert!(matches!(result, Err(LocalAccessError::InvalidCredentials)));
}

#[tokio::test]
async fn case_13_unlock_fails_when_not_set_up() {
    let (_dir, url) = temp_url().await;
    let result = unlock_local_access_on_url(
        &url,
        &UnlockLocalAccessInput {
            password: "Peu importe1".into(),
        },
    )
    .await;
    assert!(matches!(result, Err(LocalAccessError::NotSetUp)));
}

#[tokio::test]
async fn case_14_unlock_fails_when_license_expired() {
    let (_dir, url) = temp_url().await;
    setup_local_access_on_url(&url, &setup_input("MotDePasseValide1"))
        .await
        .expect("setup");
    force_state(&url, Some("2000-01-01T00:00:00Z"), None).await;

    let result = unlock_local_access_on_url(
        &url,
        &UnlockLocalAccessInput {
            password: "MotDePasseValide1".into(),
        },
    )
    .await;
    assert!(matches!(result, Err(LocalAccessError::LicenseExpired)));
}

#[tokio::test]
async fn case_15_unlock_fails_when_clock_already_flagged_anomalous() {
    let (_dir, url) = temp_url().await;
    setup_local_access_on_url(&url, &setup_input("MotDePasseValide1"))
        .await
        .expect("setup");
    let pool = SqlitePool::connect(&url).await.expect("pool");
    sqlx::query("UPDATE local_access_state SET clock_anomaly_detected = 1 WHERE singleton_id = 1")
        .execute(&pool)
        .await
        .expect("flag anomaly");
    pool.close().await;

    let result = unlock_local_access_on_url(
        &url,
        &UnlockLocalAccessInput {
            password: "MotDePasseValide1".into(),
        },
    )
    .await;
    assert!(matches!(result, Err(LocalAccessError::ClockAnomaly)));
}

#[tokio::test]
async fn case_16_unlock_detects_new_clock_regression_and_persists_flag() {
    let (_dir, url) = temp_url().await;
    setup_local_access_on_url(&url, &setup_input("MotDePasseValide1"))
        .await
        .expect("setup");
    // La dernière observation persistée est dans le futur lointain : l’horloge
    // système réelle (« maintenant ») recule donc de plus de 24h par rapport à
    // cette observation, ce qui doit être détecté comme une anomalie.
    let far_future = calendar::to_rfc3339(calendar::now_utc() + time::Duration::days(3650))
        .expect("format future");
    force_state(&url, None, Some(&far_future)).await;

    let result = unlock_local_access_on_url(
        &url,
        &UnlockLocalAccessInput {
            password: "MotDePasseValide1".into(),
        },
    )
    .await;
    assert!(matches!(result, Err(LocalAccessError::ClockAnomaly)));

    // L’anomalie doit être persistée (sticky) même après relecture.
    let status = load_status_on_url(&url).await.expect("status");
    assert!(status.clock_anomaly);
}

// ---------------------------------------------------------------------------
// 4. change_local_password_on_url
// ---------------------------------------------------------------------------

fn change_input(old: &str, new: &str) -> ChangeLocalPasswordInput {
    ChangeLocalPasswordInput {
        old_password: old.into(),
        new_password: new.into(),
        new_password_confirmation: new.into(),
    }
}

#[tokio::test]
async fn case_17_change_password_succeeds_and_new_password_unlocks() {
    let (_dir, url) = temp_url().await;
    setup_local_access_on_url(&url, &setup_input("AncienMotDePasse1"))
        .await
        .expect("setup");
    change_local_password_on_url(
        &url,
        &change_input("AncienMotDePasse1", "NouveauMotDePasse2"),
    )
    .await
    .expect("change password");

    let unlocked = unlock_local_access_on_url(
        &url,
        &UnlockLocalAccessInput {
            password: "NouveauMotDePasse2".into(),
        },
    )
    .await;
    assert!(unlocked.is_ok());
}

#[tokio::test]
async fn case_18_change_password_old_password_no_longer_works() {
    let (_dir, url) = temp_url().await;
    setup_local_access_on_url(&url, &setup_input("AncienMotDePasse1"))
        .await
        .expect("setup");
    change_local_password_on_url(
        &url,
        &change_input("AncienMotDePasse1", "NouveauMotDePasse2"),
    )
    .await
    .expect("change password");

    let result = unlock_local_access_on_url(
        &url,
        &UnlockLocalAccessInput {
            password: "AncienMotDePasse1".into(),
        },
    )
    .await;
    assert!(matches!(result, Err(LocalAccessError::InvalidCredentials)));
}

#[tokio::test]
async fn case_19_change_password_fails_with_wrong_old_password() {
    let (_dir, url) = temp_url().await;
    setup_local_access_on_url(&url, &setup_input("AncienMotDePasse1"))
        .await
        .expect("setup");
    let result =
        change_local_password_on_url(&url, &change_input("MauvaisAncien", "NouveauMotDePasse2"))
            .await;
    assert!(matches!(result, Err(LocalAccessError::InvalidCredentials)));
}

#[tokio::test]
async fn case_20_change_password_fails_when_new_equals_old() {
    let (_dir, url) = temp_url().await;
    setup_local_access_on_url(&url, &setup_input("AncienMotDePasse1"))
        .await
        .expect("setup");
    let result = change_local_password_on_url(
        &url,
        &change_input("AncienMotDePasse1", "AncienMotDePasse1"),
    )
    .await;
    assert!(matches!(result, Err(LocalAccessError::Validation(_))));
}

#[tokio::test]
async fn case_21_change_password_fails_on_confirmation_mismatch() {
    let (_dir, url) = temp_url().await;
    setup_local_access_on_url(&url, &setup_input("AncienMotDePasse1"))
        .await
        .expect("setup");
    let input = ChangeLocalPasswordInput {
        old_password: "AncienMotDePasse1".into(),
        new_password: "NouveauMotDePasse2".into(),
        new_password_confirmation: "AutreValeur3".into(),
    };
    let result = change_local_password_on_url(&url, &input).await;
    assert!(matches!(result, Err(LocalAccessError::Validation(_))));
}

#[tokio::test]
async fn case_22_change_password_fails_when_not_set_up() {
    let (_dir, url) = temp_url().await;
    let result =
        change_local_password_on_url(&url, &change_input("Peu importe1", "Autre chose2")).await;
    assert!(matches!(result, Err(LocalAccessError::NotSetUp)));
}

// ---------------------------------------------------------------------------
// 5. load_status_on_url (écran d’accès, sans secret)
// ---------------------------------------------------------------------------

#[tokio::test]
async fn case_23_status_reports_not_set_up_before_any_setup() {
    let (_dir, url) = temp_url().await;
    let status = load_status_on_url(&url).await.expect("status");
    assert!(status.row.is_none());
    assert!(!status.expired);
    assert!(!status.clock_anomaly);
}

#[tokio::test]
async fn case_24_status_reports_expired_when_valid_until_in_past() {
    let (_dir, url) = temp_url().await;
    setup_local_access_on_url(&url, &setup_input("MotDePasseValide1"))
        .await
        .expect("setup");
    force_state(&url, Some("2000-01-01T00:00:00Z"), None).await;

    let status = load_status_on_url(&url).await.expect("status");
    assert!(status.row.is_some());
    assert!(status.expired);
    assert!(!status.clock_anomaly);
}

#[tokio::test]
async fn case_25_status_reports_not_expired_right_after_setup() {
    let (_dir, url) = temp_url().await;
    setup_local_access_on_url(&url, &setup_input("MotDePasseValide1"))
        .await
        .expect("setup");
    let status = load_status_on_url(&url).await.expect("status");
    assert!(!status.expired);
    assert!(!status.clock_anomaly);
}

// ---------------------------------------------------------------------------
// 6. evaluate_license_status_on_url (garde métier)
// ---------------------------------------------------------------------------

#[tokio::test]
async fn case_26_guard_fails_not_set_up_when_row_missing() {
    let (_dir, url) = temp_url().await;
    let result = evaluate_license_status_on_url(&url).await;
    assert!(matches!(result, Err(LocalAccessError::NotSetUp)));
}

#[tokio::test]
async fn case_27_guard_succeeds_right_after_setup() {
    let (_dir, url) = temp_url().await;
    setup_local_access_on_url(&url, &setup_input("MotDePasseValide1"))
        .await
        .expect("setup");
    let evaluation = evaluate_license_status_on_url(&url).await.expect("guard");
    assert!(!evaluation.expired);
    assert!(!evaluation.clock_anomaly);
}

#[tokio::test]
async fn case_28_guard_reports_expired_after_forcing_past_valid_until() {
    let (_dir, url) = temp_url().await;
    setup_local_access_on_url(&url, &setup_input("MotDePasseValide1"))
        .await
        .expect("setup");
    force_state(&url, Some("2000-01-01T00:00:00Z"), None).await;
    let evaluation = evaluate_license_status_on_url(&url).await.expect("guard");
    assert!(evaluation.expired);
}

#[tokio::test]
async fn case_29_last_observed_at_never_decreases_across_calls() {
    let (_dir, url) = temp_url().await;
    setup_local_access_on_url(&url, &setup_input("MotDePasseValide1"))
        .await
        .expect("setup");
    let first = load_status_on_url(&url).await.expect("first status");
    let first_observed =
        calendar::parse_rfc3339(&first.row.as_ref().expect("row").last_observed_at)
            .expect("parse first");

    // Force une observation persistée dans le passé lointain (sans dépasser la
    // tolérance de 24h, donc pas d’anomalie) : l’appel suivant doit avancer
    // `last_observed_at` vers « maintenant », jamais reculer davantage.
    let slightly_past =
        calendar::to_rfc3339(calendar::now_utc() - time::Duration::hours(1)).expect("format past");
    force_state(&url, None, Some(&slightly_past)).await;

    let second = load_status_on_url(&url).await.expect("second status");
    let second_observed =
        calendar::parse_rfc3339(&second.row.as_ref().expect("row").last_observed_at)
            .expect("parse second");

    assert!(second_observed >= first_observed);
}

#[tokio::test]
async fn case_30_ensure_schema_replay_does_not_erase_existing_row() {
    let (_dir, url) = temp_url().await;
    setup_local_access_on_url(&url, &setup_input("MotDePasseValide1"))
        .await
        .expect("setup");
    // Rejoue l’ouverture + migration idempotente comme le ferait une commande
    // ultérieure : la ligne existante doit survivre.
    let mut conn = open_and_ensure_schema_on_url(&url).await.expect("reopen");
    let row = super::store::fetch_state(&mut conn)
        .await
        .expect("fetch")
        .expect("row still present");
    assert!(row.installation_id.starts_with("JRB-CS-"));
    let _ = crate::sqlite_local::close_connection(conn).await;
}

// ---------------------------------------------------------------------------
// HF1 — restriction par label de fenêtre
// ---------------------------------------------------------------------------

async fn fetch_row(url: &str) -> super::store::LocalAccessStateRow {
    let mut conn = open_and_ensure_schema_on_url(url).await.expect("open");
    let row = super::store::fetch_state(&mut conn)
        .await
        .expect("fetch")
        .expect("row");
    let _ = crate::sqlite_local::close_connection(conn).await;
    row
}

#[tokio::test]
async fn hf1_01_setup_from_access_accepted_on_first_launch() {
    let (_dir, url) = temp_url().await;
    let row =
        setup_local_access_for_window(ACCESS_WINDOW_LABEL, &url, &setup_input("MotDePasseValide1"))
            .await
            .expect("setup from access");
    assert!(row.installation_id.starts_with("JRB-CS-"));
}

#[tokio::test]
async fn hf1_02_setup_from_main_refused_by_invalid_access_window() {
    let (_dir, url) = temp_url().await;
    let error =
        setup_local_access_for_window(MAIN_WINDOW_LABEL, &url, &setup_input("MotDePasseValide1"))
            .await
            .expect_err("setup from main must fail");
    assert_eq!(error.code(), CODE_INVALID_ACCESS_WINDOW);
    let mut conn = open_and_ensure_schema_on_url(&url).await.expect("open");
    assert!(super::store::fetch_state(&mut conn)
        .await
        .expect("fetch")
        .is_none());
    let _ = crate::sqlite_local::close_connection(conn).await;
}

#[tokio::test]
async fn hf1_03_second_setup_from_access_still_refused_by_already_set_up() {
    let (_dir, url) = temp_url().await;
    setup_local_access_for_window(ACCESS_WINDOW_LABEL, &url, &setup_input("MotDePasseValide1"))
        .await
        .expect("first setup");
    let error =
        setup_local_access_for_window(ACCESS_WINDOW_LABEL, &url, &setup_input("AutreMotDePasse9"))
            .await
            .expect_err("second setup");
    assert!(matches!(error, LocalAccessError::AlreadySetUp));
}

#[tokio::test]
async fn hf1_04_unlock_from_access_accepted_with_correct_password() {
    let (_dir, url) = temp_url().await;
    setup_local_access_for_window(ACCESS_WINDOW_LABEL, &url, &setup_input("MotDePasseValide1"))
        .await
        .expect("setup");
    unlock_local_access_for_window(
        ACCESS_WINDOW_LABEL,
        &url,
        &UnlockLocalAccessInput {
            password: "MotDePasseValide1".into(),
        },
    )
    .await
    .expect("unlock from access");
}

#[tokio::test]
async fn hf1_05_unlock_from_main_refused() {
    let (_dir, url) = temp_url().await;
    setup_local_access_for_window(ACCESS_WINDOW_LABEL, &url, &setup_input("MotDePasseValide1"))
        .await
        .expect("setup");
    let before = fetch_row(&url).await;
    let error = unlock_local_access_for_window(
        MAIN_WINDOW_LABEL,
        &url,
        &UnlockLocalAccessInput {
            password: "MotDePasseValide1".into(),
        },
    )
    .await
    .expect_err("unlock from main");
    assert_eq!(error.code(), CODE_INVALID_ACCESS_WINDOW);
    let after = fetch_row(&url).await;
    assert_eq!(before.password_hash, after.password_hash);
    assert_eq!(before.current_valid_until, after.current_valid_until);
    assert_eq!(before.last_observed_at, after.last_observed_at);
}

#[tokio::test]
async fn hf1_06_change_password_from_main_accepted_when_unlocked() {
    let (_dir, url) = temp_url().await;
    setup_local_access_for_window(ACCESS_WINDOW_LABEL, &url, &setup_input("MotDePasseValide1"))
        .await
        .expect("setup");
    let session = AccessSessionState::new();
    session.set_unlocked(true);
    change_local_password_for_window(
        MAIN_WINDOW_LABEL,
        &session,
        &url,
        &ChangeLocalPasswordInput {
            old_password: "MotDePasseValide1".into(),
            new_password: "NouveauMotDePasse2".into(),
            new_password_confirmation: "NouveauMotDePasse2".into(),
        },
    )
    .await
    .expect("change from main");
    unlock_local_access_for_window(
        ACCESS_WINDOW_LABEL,
        &url,
        &UnlockLocalAccessInput {
            password: "NouveauMotDePasse2".into(),
        },
    )
    .await
    .expect("unlock with new password");
}

#[tokio::test]
async fn hf1_07_change_password_from_access_refused() {
    let (_dir, url) = temp_url().await;
    setup_local_access_for_window(ACCESS_WINDOW_LABEL, &url, &setup_input("MotDePasseValide1"))
        .await
        .expect("setup");
    let before = fetch_row(&url).await;
    let session = AccessSessionState::new();
    session.set_unlocked(true);
    let error = change_local_password_for_window(
        ACCESS_WINDOW_LABEL,
        &session,
        &url,
        &ChangeLocalPasswordInput {
            old_password: "MotDePasseValide1".into(),
            new_password: "NouveauMotDePasse2".into(),
            new_password_confirmation: "NouveauMotDePasse2".into(),
        },
    )
    .await
    .expect_err("change from access");
    assert_eq!(error.code(), CODE_INVALID_ACCESS_WINDOW);
    let after = fetch_row(&url).await;
    assert_eq!(before.password_hash, after.password_hash);
    assert_eq!(before.installed_at, after.installed_at);
    assert_eq!(before.current_valid_until, after.current_valid_until);
}

#[tokio::test]
async fn hf1_08_lock_from_main_accepted() {
    let session = AccessSessionState::new();
    session.set_unlocked(true);
    lock_local_access_for_window(MAIN_WINDOW_LABEL, &session).expect("lock from main");
    assert!(!session.is_unlocked());
}

#[tokio::test]
async fn hf1_09_lock_from_access_refused() {
    let session = AccessSessionState::new();
    session.set_unlocked(true);
    let error =
        lock_local_access_for_window(ACCESS_WINDOW_LABEL, &session).expect_err("lock from access");
    assert_eq!(error.code(), CODE_INVALID_ACCESS_WINDOW);
    assert!(session.is_unlocked());
}

#[tokio::test]
async fn hf1_10_wrong_window_setup_leaves_database_empty() {
    let (_dir, url) = temp_url().await;
    let _ =
        setup_local_access_for_window(MAIN_WINDOW_LABEL, &url, &setup_input("MotDePasseValide1"))
            .await
            .expect_err("wrong window");
    let mut conn = open_and_ensure_schema_on_url(&url).await.expect("open");
    assert!(super::store::fetch_state(&mut conn)
        .await
        .expect("fetch")
        .is_none());
    let _ = crate::sqlite_local::close_connection(conn).await;
}

#[tokio::test]
async fn hf1_11_wrong_window_change_leaves_hash_and_dates_unchanged() {
    let (_dir, url) = temp_url().await;
    setup_local_access_for_window(ACCESS_WINDOW_LABEL, &url, &setup_input("MotDePasseValide1"))
        .await
        .expect("setup");
    let before = fetch_row(&url).await;
    let session = AccessSessionState::new();
    session.set_unlocked(true);
    let _ = change_local_password_for_window(
        ACCESS_WINDOW_LABEL,
        &session,
        &url,
        &ChangeLocalPasswordInput {
            old_password: "MotDePasseValide1".into(),
            new_password: "NouveauMotDePasse2".into(),
            new_password_confirmation: "NouveauMotDePasse2".into(),
        },
    )
    .await
    .expect_err("wrong window");
    let after = fetch_row(&url).await;
    assert_eq!(before.password_hash, after.password_hash);
    assert_eq!(before.initial_valid_until, after.initial_valid_until);
    assert_eq!(before.current_valid_until, after.current_valid_until);
    assert_eq!(before.last_observed_at, after.last_observed_at);
    assert_eq!(before.installation_id, after.installation_id);
}

#[tokio::test]
async fn hf1_12_guard_still_rejects_locked_session_and_expiry() {
    let (_dir, url) = temp_url().await;
    setup_local_access_for_window(ACCESS_WINDOW_LABEL, &url, &setup_input("MotDePasseValide1"))
        .await
        .expect("setup");

    let session = AccessSessionState::new();
    assert!(!session.is_unlocked());
    let locked = change_local_password_for_window(
        MAIN_WINDOW_LABEL,
        &session,
        &url,
        &ChangeLocalPasswordInput {
            old_password: "MotDePasseValide1".into(),
            new_password: "NouveauMotDePasse2".into(),
            new_password_confirmation: "NouveauMotDePasse2".into(),
        },
    )
    .await
    .expect_err("locked session");
    assert!(matches!(locked, LocalAccessError::SessionLocked));

    force_state(&url, Some("2000-01-01T00:00:00Z"), None).await;
    let expired = unlock_local_access_for_window(
        ACCESS_WINDOW_LABEL,
        &url,
        &UnlockLocalAccessInput {
            password: "MotDePasseValide1".into(),
        },
    )
    .await
    .expect_err("expired");
    assert!(matches!(expired, LocalAccessError::LicenseExpired));
}
