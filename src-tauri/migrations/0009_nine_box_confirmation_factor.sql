-- Lot 2B-RC1-H2 — Coefficient provisoire « Performance à confirmer »
-- Migration additive non destructive (contrat de calcul v6 / schema résultat v5).
-- Les snapshots v4 restent lisibles. Coefficient NULL sur anciens runs =
-- Non disponible (jamais de 900 reconstruit).

-- ---------------------------------------------------------------------------
-- Referentiel campagne : parametre global (defaut 900 = 0,900)
-- ---------------------------------------------------------------------------
ALTER TABLE campaign_reference_config
  ADD COLUMN nine_box_confirmation_factor_milli INTEGER NOT NULL DEFAULT 900
  CHECK (nine_box_confirmation_factor_milli BETWEEN 500 AND 1000);

-- ---------------------------------------------------------------------------
-- Snapshot run : coefficient utilise au calcul (NULL = run anterieur a v5)
-- ---------------------------------------------------------------------------
ALTER TABLE compensation_simulation_runs
  ADD COLUMN nine_box_confirmation_factor_milli INTEGER
  CHECK (
    nine_box_confirmation_factor_milli IS NULL
    OR (
      nine_box_confirmation_factor_milli BETWEEN 500 AND 1000
    )
  );

-- ---------------------------------------------------------------------------
-- Etendre les traitements 9-Box autorises (SQLite : recreate colonne)
-- ---------------------------------------------------------------------------
ALTER TABLE compensation_simulation_employee_results
  ADD COLUMN nine_box_treatment_kind_v5 TEXT
  CHECK (
    nine_box_treatment_kind_v5 IS NULL
    OR nine_box_treatment_kind_v5 IN (
      'nine_box_code_applied',
      'nine_box_effect_neutralized',
      'missing_nine_box_data_treatment',
      'performance_pending_confirmation'
    )
  );

UPDATE compensation_simulation_employee_results
SET nine_box_treatment_kind_v5 = nine_box_treatment_kind;

ALTER TABLE compensation_simulation_employee_results
  DROP COLUMN nine_box_treatment_kind;

ALTER TABLE compensation_simulation_employee_results
  RENAME COLUMN nine_box_treatment_kind_v5 TO nine_box_treatment_kind;
