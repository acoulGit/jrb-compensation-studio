-- Lot 2A-1 : orientation 9-Box + unicité sémantique Performance/Potentiel
-- N’altère pas 0001 / 0002 / 0003.
-- Préserve les facteurs 9-Box existants ; orientation par défaut = Orange.

PRAGMA foreign_keys = ON;

------------------------------------------------------------
-- 1. Orientation 9-Box (présentation / configuration campagne)
------------------------------------------------------------
ALTER TABLE campaign_reference_config
ADD COLUMN nine_box_orientation TEXT NOT NULL
    DEFAULT 'performance_rows_potential_columns'
    CHECK (
        nine_box_orientation IN (
            'performance_rows_potential_columns',
            'performance_columns_potential_rows'
        )
    );

------------------------------------------------------------
-- 2. Clé métier sémantique des facteurs 9-Box
--    (box_code reste la PK historique / visuelle)
------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS ux_campaign_nine_box_semantic
ON campaign_nine_box_factors (
    campaign_id,
    performance_level,
    potential_level
);
