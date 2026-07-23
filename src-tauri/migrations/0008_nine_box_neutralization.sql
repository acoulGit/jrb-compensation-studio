-- Lot 2B-RC1-H1 — Neutralisation individuelle de l'effet 9-Box
-- Migration additive non destructive (contrat de calcul v5 / schema résultat v4).
-- Les snapshots v3 restent lisibles. Colonnes NULL = information absente
-- (jamais de faux Non reconstruit historiquement).

-- ---------------------------------------------------------------------------
-- Import RH : colonne facultative (défaut 0 = Non pour nouveaux imports)
-- ---------------------------------------------------------------------------
ALTER TABLE hr_import_employees ADD COLUMN neutralize_nine_box_effect INTEGER NOT NULL DEFAULT 0
  CHECK (neutralize_nine_box_effect IN (0, 1));

-- ---------------------------------------------------------------------------
-- Snapshot run : compteur population
-- ---------------------------------------------------------------------------
ALTER TABLE compensation_simulation_runs ADD COLUMN neutralize_nine_box_effect_employee_count INTEGER
  CHECK (neutralize_nine_box_effect_employee_count IS NULL
    OR neutralize_nine_box_effect_employee_count >= 0);

-- ---------------------------------------------------------------------------
-- Snapshot salarié : traçabilité 9-Box / neutralisation
-- ---------------------------------------------------------------------------
ALTER TABLE compensation_simulation_employee_results ADD COLUMN neutralize_nine_box_effect INTEGER
  CHECK (neutralize_nine_box_effect IS NULL OR neutralize_nine_box_effect IN (0, 1));

ALTER TABLE compensation_simulation_employee_results ADD COLUMN source_nine_box_code INTEGER
  CHECK (source_nine_box_code IS NULL OR (source_nine_box_code BETWEEN 1 AND 9));

ALTER TABLE compensation_simulation_employee_results ADD COLUMN nine_box_treatment_kind TEXT
  CHECK (nine_box_treatment_kind IS NULL OR nine_box_treatment_kind IN (
    'nine_box_code_applied',
    'nine_box_effect_neutralized',
    'missing_nine_box_data_treatment'
  ));
