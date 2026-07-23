-- Lot 2A-H2C-1 : données structurées de promotion sur le snapshot RH importé.
-- Compatible bases déjà migrées en 0001–0005.
-- Colonnes optionnelles (NULL = pas de promotion).
-- Un événement pertinent N-1/N par salarié pour la fenêtre courante.

PRAGMA foreign_keys = ON;

ALTER TABLE hr_import_employees ADD COLUMN promotion_date TEXT NULL;
ALTER TABLE hr_import_employees ADD COLUMN salary_before_promotion INTEGER NULL;
ALTER TABLE hr_import_employees ADD COLUMN salary_after_promotion INTEGER NULL;
ALTER TABLE hr_import_employees ADD COLUMN previous_grade_id INTEGER NULL
    REFERENCES campaign_grades(id);
ALTER TABLE hr_import_employees ADD COLUMN promoted_grade_id INTEGER NULL
    REFERENCES campaign_grades(id);
ALTER TABLE hr_import_employees ADD COLUMN previous_job_family_id INTEGER NULL
    REFERENCES campaign_job_families(id);
ALTER TABLE hr_import_employees ADD COLUMN promoted_job_family_id INTEGER NULL
    REFERENCES campaign_job_families(id);
