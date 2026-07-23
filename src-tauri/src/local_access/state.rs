//! État de session en mémoire (non persisté) du verrou local.

use std::sync::Mutex;

/// Managé par Tauri (`app.manage(...)`). Jamais persisté : redémarrer le
/// processus revient toujours à `unlocked = false`. Aucune copie du mot de
/// passe n’est conservée ici — uniquement le booléen de session et un
/// compteur d’échecs de déverrouillage (temporisation simple, non bloquante
/// dans SEC1-A).
#[derive(Debug, Default)]
pub struct AccessSessionState {
    unlocked: Mutex<bool>,
    unlock_failure_count: Mutex<u32>,
}

impl AccessSessionState {
    pub fn new() -> Self {
        Self {
            unlocked: Mutex::new(false),
            unlock_failure_count: Mutex::new(0),
        }
    }

    pub fn is_unlocked(&self) -> bool {
        *self
            .unlocked
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn set_unlocked(&self, value: bool) {
        let mut guard = self
            .unlocked
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *guard = value;
        if value {
            self.reset_unlock_failures();
        }
    }

    pub fn record_unlock_failure(&self) {
        let mut guard = self
            .unlock_failure_count
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *guard = guard.saturating_add(1);
    }

    #[allow(dead_code)] // exposé pour diagnostic / tests ; non requis par les commandes SEC1-A
    pub fn unlock_failure_count(&self) -> u32 {
        *self
            .unlock_failure_count
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn reset_unlock_failures(&self) {
        let mut guard = self
            .unlock_failure_count
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *guard = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn starts_locked() {
        let state = AccessSessionState::new();
        assert!(!state.is_unlocked());
        assert_eq!(state.unlock_failure_count(), 0);
    }

    #[test]
    fn set_unlocked_toggles_state() {
        let state = AccessSessionState::new();
        state.set_unlocked(true);
        assert!(state.is_unlocked());
        state.set_unlocked(false);
        assert!(!state.is_unlocked());
    }

    #[test]
    fn unlock_failures_increment_and_reset_on_success() {
        let state = AccessSessionState::new();
        state.record_unlock_failure();
        state.record_unlock_failure();
        assert_eq!(state.unlock_failure_count(), 2);
        state.set_unlocked(true);
        assert_eq!(state.unlock_failure_count(), 0);
    }
}
