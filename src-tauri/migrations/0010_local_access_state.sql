-- Lot 2B-RC1-SEC1-A — Accès local : mot de passe + période initiale
-- Migration additive non destructive. Aucune table métier modifiée.
-- license_activations sera ajoutée en SEC1-B.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS local_access_state (
  singleton_id INTEGER PRIMARY KEY NOT NULL CHECK (singleton_id = 1),
  installation_id TEXT NOT NULL UNIQUE
    CHECK (length(trim(installation_id)) > 0),
  password_hash TEXT NOT NULL
    CHECK (length(trim(password_hash)) > 0),
  installed_at TEXT NOT NULL
    CHECK (length(trim(installed_at)) > 0),
  initial_valid_until TEXT NOT NULL
    CHECK (length(trim(initial_valid_until)) > 0),
  current_valid_until TEXT NOT NULL
    CHECK (length(trim(current_valid_until)) > 0),
  last_observed_at TEXT NOT NULL
    CHECK (length(trim(last_observed_at)) > 0),
  clock_anomaly_detected INTEGER NOT NULL DEFAULT 0
    CHECK (clock_anomaly_detected IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
