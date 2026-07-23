-- Lot 2B-RC1-H4 : mois d’effet configurable du minimum garanti.
-- Additive only. NULL autorisé pour les snapshots historiques (schema ≤ 5).
-- Les nouveaux runs schema 6 écrivent une valeur explicite 1–12 côté applicatif.
-- Aucune valeur implicite, aucun backfill artificiel.

PRAGMA foreign_keys = ON;

ALTER TABLE compensation_simulation_runs
ADD COLUMN minimum_guarantee_effective_month INTEGER
CHECK (
  minimum_guarantee_effective_month IS NULL
  OR (
    minimum_guarantee_effective_month BETWEEN 1 AND 12
  )
);

-- Miroir salarié (aligné sur retroactivity_start_month / technical_application_month, 0007).
ALTER TABLE compensation_simulation_employee_results
ADD COLUMN minimum_guarantee_effective_month INTEGER
CHECK (
  minimum_guarantee_effective_month IS NULL
  OR (
    minimum_guarantee_effective_month BETWEEN 1 AND 12
  )
);
