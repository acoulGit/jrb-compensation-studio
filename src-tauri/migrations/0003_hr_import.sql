-- Lot 1C : import RH versionné par campagne
-- Compatible base déjà migrée en 0001/0002.
-- Aucun fichier source stocké ; population versionnée uniquement.

PRAGMA foreign_keys = ON;

------------------------------------------------------------
-- 1. Lots d’import (versions de population)
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_import_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL
        REFERENCES campaigns(id),
    status TEXT NOT NULL
        CHECK (status IN ('current', 'superseded')),
    source_file_name TEXT NOT NULL
        CHECK (length(trim(source_file_name)) > 0),
    source_format TEXT NOT NULL
        CHECK (source_format IN ('xlsx', 'xls', 'csv')),
    source_sheet_name TEXT NULL,
    file_size_bytes INTEGER NOT NULL
        CHECK (file_size_bytes > 0),
    source_row_count INTEGER NOT NULL
        CHECK (source_row_count >= 0),
    imported_row_count INTEGER NOT NULL
        CHECK (imported_row_count > 0),
    warning_count INTEGER NOT NULL
        CHECK (warning_count >= 0),
    imported_at TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_hr_import_batches_one_current
ON hr_import_batches(campaign_id)
WHERE status = 'current';

CREATE INDEX IF NOT EXISTS ix_hr_import_batches_campaign
ON hr_import_batches(campaign_id);

------------------------------------------------------------
-- 2. Salariés importés (snapshots par lot)
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hr_import_employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    import_batch_id INTEGER NOT NULL
        REFERENCES hr_import_batches(id),
    campaign_id INTEGER NOT NULL
        REFERENCES campaigns(id),
    employee_number TEXT NOT NULL
        CHECK (length(trim(employee_number)) > 0),
    employee_label TEXT NOT NULL
        CHECK (length(trim(employee_label)) > 0),
    job_family_id INTEGER NOT NULL
        REFERENCES campaign_job_families(id),
    grade_id INTEGER NOT NULL
        REFERENCES campaign_grades(id),
    contract_type TEXT NOT NULL
        CHECK (contract_type IN (
            'cdi', 'cdd', 'temporary', 'contractor', 'other'
        )),
    employment_status TEXT NOT NULL
        CHECK (employment_status IN (
            'active',
            'group_detachment',
            'legal_leave',
            'external_availability',
            'suspended',
            'departed',
            'other'
        )),
    hire_date TEXT NOT NULL
        CHECK (length(trim(hire_date)) = 10),
    december_base_salary INTEGER NOT NULL
        CHECK (december_base_salary > 0),
    nine_box_code INTEGER NULL
        CHECK (nine_box_code IS NULL OR (nine_box_code BETWEEN 1 AND 9)),
    confirmed_underperformer INTEGER NOT NULL DEFAULT 0
        CHECK (confirmed_underperformer IN (0, 1)),
    promotion_amount INTEGER NOT NULL DEFAULT 0
        CHECK (promotion_amount >= 0),
    correction_amount INTEGER NOT NULL DEFAULT 0
        CHECK (correction_amount >= 0),
    social_measure_amount INTEGER NOT NULL DEFAULT 0
        CHECK (social_measure_amount >= 0),
    source_row_number INTEGER NOT NULL
        CHECK (source_row_number > 0),
    created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_hr_import_employees_batch_number
ON hr_import_employees(import_batch_id, employee_number COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS ix_hr_import_employees_campaign
ON hr_import_employees(campaign_id);

CREATE INDEX IF NOT EXISTS ix_hr_import_employees_batch
ON hr_import_employees(import_batch_id);

CREATE INDEX IF NOT EXISTS ix_hr_import_employees_number
ON hr_import_employees(employee_number);

CREATE INDEX IF NOT EXISTS ix_hr_import_employees_family
ON hr_import_employees(job_family_id);

CREATE INDEX IF NOT EXISTS ix_hr_import_employees_grade
ON hr_import_employees(grade_id);
