-- Lot 2B-RC1-SEC1-B — Activation de licence hors ligne : historique
-- Migration additive non destructive. Aucune table métier modifiée.
-- Ne touche pas à `local_access_state` (créée par la migration 0010) : les
-- colonnes de validité de cette table sont mises à jour par le code applicatif
-- (transaction unique avec l'insertion ci-dessous), pas par cette migration.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS license_activations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id TEXT NOT NULL UNIQUE
    CHECK (length(trim(license_id)) > 0),
  installation_id TEXT NOT NULL
    CHECK (length(trim(installation_id)) > 0),
  payload_json TEXT NOT NULL
    CHECK (length(trim(payload_json)) > 0),
  payload_sha256 TEXT NOT NULL
    CHECK (length(trim(payload_sha256)) = 64),
  activated_at TEXT NOT NULL
    CHECK (length(trim(activated_at)) > 0),
  issued_at TEXT NOT NULL
    CHECK (length(trim(issued_at)) > 0),
  duration_months INTEGER NOT NULL
    CHECK (duration_months BETWEEN 1 AND 120),
  previous_valid_until TEXT NOT NULL
    CHECK (length(trim(previous_valid_until)) > 0),
  new_valid_until TEXT NOT NULL
    CHECK (length(trim(new_valid_until)) > 0),
  customer TEXT,
  created_at TEXT NOT NULL
    CHECK (length(trim(created_at)) > 0)
);

CREATE INDEX IF NOT EXISTS ix_license_activations_installation_id
  ON license_activations (installation_id);
