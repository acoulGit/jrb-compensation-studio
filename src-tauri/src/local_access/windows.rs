//! Bascule entre la fenêtre « access » (verrou local) et « main » (application).
//!
//! Au démarrage, seule la fenêtre `access` existe (voir `tauri.conf.json`). Ces
//! fonctions créent / affichent / masquent les fenêtres à la demande des
//! commandes d’accès local (`setup_local_access`, `unlock_local_access`,
//! `lock_local_access`).

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use super::error::LocalAccessError;

pub const MAIN_WINDOW_LABEL: &str = "main";
pub const ACCESS_WINDOW_LABEL: &str = "access";

/// Refuse l’opération si le label de la fenêtre appelante n’est pas exactement
/// `expected`. Aucun détail de capability n’est exposé.
pub fn require_window_label(actual: &str, expected: &str) -> Result<(), LocalAccessError> {
    if actual != expected {
        return Err(LocalAccessError::InvalidAccessWindow);
    }
    Ok(())
}

/// Crée (si nécessaire) et affiche la fenêtre principale, puis masque la
/// fenêtre d’accès. Appelée après un `setup_local_access` ou `unlock_local_access`
/// réussi.
pub fn ensure_main_window(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window(MAIN_WINDOW_LABEL).is_none() {
        WebviewWindowBuilder::new(app, MAIN_WINDOW_LABEL, WebviewUrl::App("index.html".into()))
            .title("JRB Compensation Studio")
            .inner_size(1280.0, 800.0)
            .min_inner_size(960.0, 650.0)
            .center()
            .build()
            .map_err(|error| error.to_string())?;
    }
    if let Some(main_window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = main_window.show();
        let _ = main_window.set_focus();
    }
    if let Some(access_window) = app.get_webview_window(ACCESS_WINDOW_LABEL) {
        let _ = access_window.hide();
    }
    Ok(())
}

/// Affiche (en la recréant si besoin) la fenêtre d’accès et masque la fenêtre
/// principale. Appelée par `lock_local_access`.
pub fn show_access_hide_main(app: &AppHandle) -> Result<(), String> {
    if app.get_webview_window(ACCESS_WINDOW_LABEL).is_none() {
        WebviewWindowBuilder::new(
            app,
            ACCESS_WINDOW_LABEL,
            WebviewUrl::App("index.html".into()),
        )
        .title("JRB Compensation Studio — Accès")
        .inner_size(520.0, 640.0)
        .resizable(false)
        .center()
        .build()
        .map_err(|error| error.to_string())?;
    }
    if let Some(access_window) = app.get_webview_window(ACCESS_WINDOW_LABEL) {
        let _ = access_window.show();
        let _ = access_window.set_focus();
    }
    if let Some(main_window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = main_window.hide();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn require_window_label_accepts_exact_match() {
        assert!(require_window_label(ACCESS_WINDOW_LABEL, ACCESS_WINDOW_LABEL).is_ok());
        assert!(require_window_label(MAIN_WINDOW_LABEL, MAIN_WINDOW_LABEL).is_ok());
    }

    #[test]
    fn require_window_label_rejects_mismatch_with_stable_code() {
        let error = require_window_label(MAIN_WINDOW_LABEL, ACCESS_WINDOW_LABEL).unwrap_err();
        assert_eq!(error.code(), "INVALID_ACCESS_WINDOW");
        assert_eq!(
            error.user_message(),
            "Cette action n’est pas autorisée depuis cette fenêtre."
        );
    }
}
