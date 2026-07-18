-- Lot 1B : référentiels de rémunération par campagne
-- Compatible base neuve et base déjà migrée en 0001.
-- Aucune donnée RH ; médianes S0 initialement non configurées (NULL).

PRAGMA foreign_keys = ON;

------------------------------------------------------------
-- 1. Configuration générale du référentiel
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaign_reference_config (
    campaign_id INTEGER PRIMARY KEY NOT NULL
        REFERENCES campaigns(id),
    nine_box_mode TEXT NOT NULL
        CHECK (nine_box_mode IN (
            'none',
            'performance_only',
            'full_nine_box',
            'performance_potential'
        )),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

------------------------------------------------------------
-- 2. Familles de métiers (exactement 5 par campagne)
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaign_job_families (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL
        REFERENCES campaigns(id),
    code TEXT NOT NULL
        CHECK (length(trim(code)) > 0),
    label TEXT NOT NULL
        CHECK (length(trim(label)) > 0),
    sort_order INTEGER NOT NULL
        CHECK (sort_order BETWEEN 1 AND 5),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_campaign_job_families_code
ON campaign_job_families(campaign_id, code COLLATE NOCASE);

CREATE UNIQUE INDEX IF NOT EXISTS ux_campaign_job_families_sort
ON campaign_job_families(campaign_id, sort_order);

------------------------------------------------------------
-- 3. Grades (exactement 6 par campagne ; directeurs hors grille)
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaign_grades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL
        REFERENCES campaigns(id),
    code TEXT NOT NULL
        CHECK (length(trim(code)) > 0),
    label TEXT NOT NULL
        CHECK (length(trim(label)) > 0),
    sort_order INTEGER NOT NULL
        CHECK (sort_order BETWEEN 1 AND 6),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_campaign_grades_code
ON campaign_grades(campaign_id, code COLLATE NOCASE);

CREATE UNIQUE INDEX IF NOT EXISTS ux_campaign_grades_sort
ON campaign_grades(campaign_id, sort_order);

------------------------------------------------------------
-- 4. Grille S0 (5 × 6 = 30 cellules ; NULL = non configuré)
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaign_salary_grid (
    campaign_id INTEGER NOT NULL
        REFERENCES campaigns(id),
    job_family_id INTEGER NOT NULL
        REFERENCES campaign_job_families(id),
    grade_id INTEGER NOT NULL
        REFERENCES campaign_grades(id),
    s0_amount INTEGER NULL
        CHECK (s0_amount IS NULL OR s0_amount > 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (campaign_id, job_family_id, grade_id)
);

------------------------------------------------------------
-- 5. Positions salariales (17 lignes ; ratios fixes, facteurs modifiables)
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaign_salary_positions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL
        REFERENCES campaigns(id),
    code TEXT NOT NULL
        CHECK (length(trim(code)) > 0),
    label TEXT NOT NULL
        CHECK (length(trim(label)) > 0),
    sort_order INTEGER NOT NULL
        CHECK (sort_order BETWEEN 1 AND 17),
    reference_ratio_bps INTEGER NULL
        CHECK (
            reference_ratio_bps IS NULL
            OR (reference_ratio_bps >= 0 AND reference_ratio_bps <= 20000)
        ),
    position_factor_milli INTEGER NOT NULL
        CHECK (position_factor_milli BETWEEN 0 AND 10000),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_campaign_salary_positions_code
ON campaign_salary_positions(campaign_id, code COLLATE NOCASE);

CREATE UNIQUE INDEX IF NOT EXISTS ux_campaign_salary_positions_sort
ON campaign_salary_positions(campaign_id, sort_order);

------------------------------------------------------------
-- 6. Coefficients Performance
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaign_performance_factors (
    campaign_id INTEGER NOT NULL
        REFERENCES campaigns(id),
    level TEXT NOT NULL
        CHECK (level IN ('low', 'medium', 'high')),
    label TEXT NOT NULL
        CHECK (length(trim(label)) > 0),
    sort_order INTEGER NOT NULL
        CHECK (sort_order BETWEEN 1 AND 3),
    factor_milli INTEGER NOT NULL
        CHECK (factor_milli BETWEEN 0 AND 10000),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (campaign_id, level)
);

------------------------------------------------------------
-- 7. Coefficients Potentiel
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaign_potential_factors (
    campaign_id INTEGER NOT NULL
        REFERENCES campaigns(id),
    level TEXT NOT NULL
        CHECK (level IN ('low', 'medium', 'high')),
    label TEXT NOT NULL
        CHECK (length(trim(label)) > 0),
    sort_order INTEGER NOT NULL
        CHECK (sort_order BETWEEN 1 AND 3),
    factor_milli INTEGER NOT NULL
        CHECK (factor_milli BETWEEN 0 AND 10000),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (campaign_id, level)
);

------------------------------------------------------------
-- 8. Coefficients 9-Box (9 cases)
------------------------------------------------------------
CREATE TABLE IF NOT EXISTS campaign_nine_box_factors (
    campaign_id INTEGER NOT NULL
        REFERENCES campaigns(id),
    box_code INTEGER NOT NULL
        CHECK (box_code BETWEEN 1 AND 9),
    performance_level TEXT NOT NULL
        CHECK (performance_level IN ('low', 'medium', 'high')),
    potential_level TEXT NOT NULL
        CHECK (potential_level IN ('low', 'medium', 'high')),
    factor_milli INTEGER NOT NULL
        CHECK (factor_milli BETWEEN 0 AND 10000),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (campaign_id, box_code)
);

------------------------------------------------------------
-- Initialisation des campagnes déjà présentes (idempotente)
------------------------------------------------------------

INSERT OR IGNORE INTO campaign_reference_config (
    campaign_id, nine_box_mode, created_at, updated_at
)
SELECT id, 'none', '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'
FROM campaigns;

INSERT OR IGNORE INTO campaign_job_families (
    campaign_id, code, label, sort_order, created_at, updated_at
)
SELECT c.id, v.code, v.label, v.sort_order,
       '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'
FROM campaigns c
CROSS JOIN (
    SELECT 'F1' AS code, 'Famille 1' AS label, 1 AS sort_order
    UNION ALL SELECT 'F2', 'Famille 2', 2
    UNION ALL SELECT 'F3', 'Famille 3', 3
    UNION ALL SELECT 'F4', 'Famille 4', 4
    UNION ALL SELECT 'F5', 'Famille 5', 5
) v;

INSERT OR IGNORE INTO campaign_grades (
    campaign_id, code, label, sort_order, created_at, updated_at
)
SELECT c.id, v.code, v.label, v.sort_order,
       '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'
FROM campaigns c
CROSS JOIN (
    SELECT 'G1' AS code, 'Grade 1' AS label, 1 AS sort_order
    UNION ALL SELECT 'G2', 'Grade 2', 2
    UNION ALL SELECT 'G3', 'Grade 3', 3
    UNION ALL SELECT 'G4', 'Grade 4', 4
    UNION ALL SELECT 'G5', 'Grade 5', 5
    UNION ALL SELECT 'G6', 'Grade 6', 6
) v;

INSERT OR IGNORE INTO campaign_salary_grid (
    campaign_id, job_family_id, grade_id, s0_amount, created_at, updated_at
)
SELECT f.campaign_id, f.id, g.id, NULL,
       '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'
FROM campaign_job_families f
INNER JOIN campaign_grades g ON g.campaign_id = f.campaign_id;

INSERT OR IGNORE INTO campaign_salary_positions (
    campaign_id, code, label, sort_order,
    reference_ratio_bps, position_factor_milli, created_at, updated_at
)
SELECT c.id, v.code, v.label, v.sort_order, v.ratio_bps, v.factor_milli,
       '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'
FROM campaigns c
CROSS JOIN (
    SELECT 'Sout-' AS code, 'Sout-' AS label, 1 AS sort_order,
           NULL AS ratio_bps, 1300 AS factor_milli
    UNION ALL SELECT 'S7-', 'S7-', 2, 6500, 1250
    UNION ALL SELECT 'S6-', 'S6-', 3, 7000, 1200
    UNION ALL SELECT 'S5-', 'S5-', 4, 7500, 1150
    UNION ALL SELECT 'S4-', 'S4-', 5, 8000, 1100
    UNION ALL SELECT 'S3-', 'S3-', 6, 8500, 1050
    UNION ALL SELECT 'S2-', 'S2-', 7, 9000, 1000
    UNION ALL SELECT 'S1-', 'S1-', 8, 9500, 950
    UNION ALL SELECT 'S0', 'S0', 9, 10000, 900
    UNION ALL SELECT 'S1+', 'S1+', 10, 10500, 850
    UNION ALL SELECT 'S2+', 'S2+', 11, 11000, 800
    UNION ALL SELECT 'S3+', 'S3+', 12, 11500, 750
    UNION ALL SELECT 'S4+', 'S4+', 13, 12000, 650
    UNION ALL SELECT 'S5+', 'S5+', 14, 12500, 550
    UNION ALL SELECT 'S6+', 'S6+', 15, 13000, 450
    UNION ALL SELECT 'S7+', 'S7+', 16, 13500, 300
    UNION ALL SELECT 'Sout+', 'Sout+', 17, NULL, 100
) v;

INSERT OR IGNORE INTO campaign_performance_factors (
    campaign_id, level, label, sort_order, factor_milli, created_at, updated_at
)
SELECT c.id, v.level, v.label, v.sort_order, v.factor_milli,
       '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'
FROM campaigns c
CROSS JOIN (
    SELECT 'low' AS level, 'Faible' AS label, 1 AS sort_order, 250 AS factor_milli
    UNION ALL SELECT 'medium', 'Moyenne', 2, 1000
    UNION ALL SELECT 'high', 'Élevée', 3, 1250
) v;

INSERT OR IGNORE INTO campaign_potential_factors (
    campaign_id, level, label, sort_order, factor_milli, created_at, updated_at
)
SELECT c.id, v.level, v.label, v.sort_order, v.factor_milli,
       '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'
FROM campaigns c
CROSS JOIN (
    SELECT 'low' AS level, 'Faible' AS label, 1 AS sort_order, 950 AS factor_milli
    UNION ALL SELECT 'medium', 'Moyen', 2, 1000
    UNION ALL SELECT 'high', 'Élevé', 3, 1050
) v;

INSERT OR IGNORE INTO campaign_nine_box_factors (
    campaign_id, box_code, performance_level, potential_level,
    factor_milli, created_at, updated_at
)
SELECT c.id, v.box_code, v.performance_level, v.potential_level, v.factor_milli,
       '1970-01-01T00:00:00.000Z', '1970-01-01T00:00:00.000Z'
FROM campaigns c
CROSS JOIN (
    SELECT 1 AS box_code, 'low' AS performance_level, 'low' AS potential_level, 200 AS factor_milli
    UNION ALL SELECT 2, 'medium', 'low', 800
    UNION ALL SELECT 3, 'high', 'low', 1100
    UNION ALL SELECT 4, 'low', 'medium', 250
    UNION ALL SELECT 5, 'medium', 'medium', 1000
    UNION ALL SELECT 6, 'high', 'medium', 1250
    UNION ALL SELECT 7, 'low', 'high', 300
    UNION ALL SELECT 8, 'medium', 'high', 1100
    UNION ALL SELECT 9, 'high', 'high', 1400
) v;
