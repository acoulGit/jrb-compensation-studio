-- Lot 1A : persistance locale initiale (organisation + campagnes)
-- Aucune donnée RH dans ce schéma.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS organization_profile (
    id INTEGER PRIMARY KEY NOT NULL CHECK (id = 1),
    product_name TEXT NOT NULL,
    organization_name TEXT NOT NULL,
    organization_short_name TEXT NOT NULL,
    application_subtitle TEXT NOT NULL,
    report_footer TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO organization_profile (
    id,
    product_name,
    organization_name,
    organization_short_name,
    application_subtitle,
    report_footer,
    created_at,
    updated_at
) VALUES (
    1,
    'JRB Compensation Studio',
    'Organisation non configurée',
    'Organisation',
    'Simulation et pilotage des augmentations salariales',
    'Document confidentiel',
    '1970-01-01T00:00:00.000Z',
    '1970-01-01T00:00:00.000Z'
);

CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    reference_year INTEGER NOT NULL CHECK (reference_year BETWEEN 2000 AND 2100),
    status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'archived')),
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_campaigns_one_active
ON campaigns(status)
WHERE status = 'active';
