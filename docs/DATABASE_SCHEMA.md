# Schéma de base de données — Lots 1A, 1B et 1C

## Emplacement logique

La base SQLite est gérée par le plugin officiel Tauri SQL. Le fichier est créé
dans le répertoire applicatif Windows associé à l’identifiant
`com.jrbxsolutions.compensationstudio` (répertoire de configuration
application / AppConfig), et non dans le dépôt Git.

## Fichier

- Nom logique : `jrb-compensation-studio.db`
- Chaîne de connexion unique : `sqlite:jrb-compensation-studio.db`

## Tables

### `organization_profile`

Table mono-enregistrement pour l’identité client.

| Colonne | Type | Contraintes |
| --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY, CHECK (`id = 1`) |
| `product_name` | TEXT | NOT NULL |
| `organization_name` | TEXT | NOT NULL |
| `organization_short_name` | TEXT | NOT NULL |
| `application_subtitle` | TEXT | NOT NULL |
| `report_footer` | TEXT | NOT NULL |
| `created_at` | TEXT | NOT NULL (UTC ISO-8601) |
| `updated_at` | TEXT | NOT NULL (UTC ISO-8601) |

Initialisation : `INSERT OR IGNORE` avec les valeurs par défaut produit.

### `campaigns`

| Colonne | Type | Contraintes |
| --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `name` | TEXT | NOT NULL, CHECK (`length(trim(name)) > 0`) |
| `reference_year` | INTEGER | NOT NULL, CHECK (2000–2100) |
| `status` | TEXT | NOT NULL, CHECK (`draft` / `active` / `archived`) |
| `notes` | TEXT | NOT NULL DEFAULT `''` |
| `created_at` | TEXT | NOT NULL (UTC) |
| `updated_at` | TEXT | NOT NULL (UTC) |
| `archived_at` | TEXT | NULL (UTC) |

### `campaign_reference_config` (Lot 1B)

Configuration générale du référentiel de rémunération, une ligne par campagne.

| Colonne | Type | Contraintes |
| --- | --- | --- |
| `campaign_id` | INTEGER | PRIMARY KEY, FK → `campaigns(id)` |
| `nine_box_mode` | TEXT | NOT NULL, CHECK (`none` / `performance_only` / `full_nine_box` / `performance_potential`) |
| `created_at` | TEXT | NOT NULL (UTC) |
| `updated_at` | TEXT | NOT NULL (UTC) |

### `campaign_job_families` (Lot 1B)

Cinq familles de métiers par campagne (codes et libellés modifiables).

| Colonne | Type | Contraintes |
| --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `campaign_id` | INTEGER | NOT NULL, FK → `campaigns(id)` |
| `code` | TEXT | NOT NULL, CHECK (`length(trim(code)) > 0`) |
| `label` | TEXT | NOT NULL, CHECK (`length(trim(label)) > 0`) |
| `sort_order` | INTEGER | NOT NULL, CHECK (1–5) |
| `created_at` | TEXT | NOT NULL (UTC) |
| `updated_at` | TEXT | NOT NULL (UTC) |

Index uniques : `(campaign_id, code COLLATE NOCASE)`, `(campaign_id, sort_order)`.

### `campaign_grades` (Lot 1B)

Six grades par campagne (directeurs hors grille au niveau métier).

| Colonne | Type | Contraintes |
| --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `campaign_id` | INTEGER | NOT NULL, FK → `campaigns(id)` |
| `code` | TEXT | NOT NULL, CHECK (`length(trim(code)) > 0`) |
| `label` | TEXT | NOT NULL, CHECK (`length(trim(label)) > 0`) |
| `sort_order` | INTEGER | NOT NULL, CHECK (1–6) |
| `created_at` | TEXT | NOT NULL (UTC) |
| `updated_at` | TEXT | NOT NULL (UTC) |

Index uniques : `(campaign_id, code COLLATE NOCASE)`, `(campaign_id, sort_order)`.

### `campaign_salary_grid` (Lot 1B)

Matrice S0 : 5 × 6 = 30 cellules par campagne. `NULL` = non configuré.

| Colonne | Type | Contraintes |
| --- | --- | --- |
| `campaign_id` | INTEGER | NOT NULL, FK → `campaigns(id)` |
| `job_family_id` | INTEGER | NOT NULL, FK → `campaign_job_families(id)` |
| `grade_id` | INTEGER | NOT NULL, FK → `campaign_grades(id)` |
| `s0_amount` | INTEGER | NULL ou > 0 (FCFA entier) |
| `created_at` | TEXT | NOT NULL (UTC) |
| `updated_at` | TEXT | NOT NULL (UTC) |

Clé primaire : `(campaign_id, job_family_id, grade_id)`.

### `campaign_salary_positions` (Lot 1B)

Dix-sept positions salariales par campagne. Ratios de référence fixes (bps),
coefficients reparamétrables (milli).

| Colonne | Type | Contraintes |
| --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `campaign_id` | INTEGER | NOT NULL, FK → `campaigns(id)` |
| `code` | TEXT | NOT NULL, CHECK (`length(trim(code)) > 0`) |
| `label` | TEXT | NOT NULL, CHECK (`length(trim(label)) > 0`) |
| `sort_order` | INTEGER | NOT NULL, CHECK (1–17) |
| `reference_ratio_bps` | INTEGER | NULL ou 0–20 000 (basis points ; NULL pour Sout- / Sout+) |
| `position_factor_milli` | INTEGER | NOT NULL, CHECK (0–10 000) |
| `created_at` | TEXT | NOT NULL (UTC) |
| `updated_at` | TEXT | NOT NULL (UTC) |

Index uniques : `(campaign_id, code COLLATE NOCASE)`, `(campaign_id, sort_order)`.

### `campaign_performance_factors` (Lot 1B)

Trois niveaux de coefficient Performance par campagne.

| Colonne | Type | Contraintes |
| --- | --- | --- |
| `campaign_id` | INTEGER | NOT NULL, FK → `campaigns(id)` |
| `level` | TEXT | NOT NULL, CHECK (`low` / `medium` / `high`) |
| `label` | TEXT | NOT NULL |
| `sort_order` | INTEGER | NOT NULL, CHECK (1–3) |
| `factor_milli` | INTEGER | NOT NULL, CHECK (0–10 000) |
| `created_at` | TEXT | NOT NULL (UTC) |
| `updated_at` | TEXT | NOT NULL (UTC) |

Clé primaire : `(campaign_id, level)`.

### `campaign_potential_factors` (Lot 1B)

Trois niveaux de coefficient Potentiel par campagne.

| Colonne | Type | Contraintes |
| --- | --- | --- |
| `campaign_id` | INTEGER | NOT NULL, FK → `campaigns(id)` |
| `level` | TEXT | NOT NULL, CHECK (`low` / `medium` / `high`) |
| `label` | TEXT | NOT NULL |
| `sort_order` | INTEGER | NOT NULL, CHECK (1–3) |
| `factor_milli` | INTEGER | NOT NULL, CHECK (0–10 000) |
| `created_at` | TEXT | NOT NULL (UTC) |
| `updated_at` | TEXT | NOT NULL (UTC) |

Clé primaire : `(campaign_id, level)`.

### `campaign_nine_box_factors` (Lot 1B)

Neuf coefficients 9-Box par campagne (cases 1 à 9).

| Colonne | Type | Contraintes |
| --- | --- | --- |
| `campaign_id` | INTEGER | NOT NULL, FK → `campaigns(id)` |
| `box_code` | INTEGER | NOT NULL, CHECK (1–9) |
| `performance_level` | TEXT | NOT NULL, CHECK (`low` / `medium` / `high`) |
| `potential_level` | TEXT | NOT NULL, CHECK (`low` / `medium` / `high`) |
| `factor_milli` | INTEGER | NOT NULL, CHECK (0–10 000) |
| `created_at` | TEXT | NOT NULL (UTC) |
| `updated_at` | TEXT | NOT NULL (UTC) |

Clé primaire : `(campaign_id, box_code)`.

### `hr_import_batches` (Lot 1C)

Versions de population importée par campagne. Un seul lot `current` par campagne
(index unique partiel).

| Colonne | Type | Contraintes |
| --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `campaign_id` | INTEGER | NOT NULL, FK → `campaigns(id)` |
| `status` | TEXT | NOT NULL, CHECK (`current` / `superseded`) |
| `source_file_name` | TEXT | NOT NULL (nom original, sans binaire) |
| `source_format` | TEXT | NOT NULL, CHECK (`xlsx` / `xls` / `csv`) |
| `source_sheet_name` | TEXT | NULL |
| `file_size_bytes` | INTEGER | NOT NULL, > 0 |
| `source_row_count` | INTEGER | NOT NULL, ≥ 0 |
| `imported_row_count` | INTEGER | NOT NULL, > 0 |
| `warning_count` | INTEGER | NOT NULL, ≥ 0 |
| `imported_at` | TEXT | NOT NULL (UTC ISO-8601) |
| `created_at` | TEXT | NOT NULL (UTC ISO-8601) |

Index : `ux_hr_import_batches_one_current` (unique partiel `status = 'current'`
par `campaign_id`), `ix_hr_import_batches_campaign`.

### `hr_import_employees` (Lot 1C)

Snapshot salarié rattaché à un lot d’import. Les clés étrangères
`job_family_id` et `grade_id` pointent vers le référentiel Lot 1B de la
campagne.

| Colonne | Type | Contraintes |
| --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `import_batch_id` | INTEGER | NOT NULL, FK → `hr_import_batches(id)` |
| `campaign_id` | INTEGER | NOT NULL, FK → `campaigns(id)` |
| `employee_number` | TEXT | NOT NULL |
| `employee_label` | TEXT | NOT NULL |
| `job_family_id` | INTEGER | NOT NULL, FK → `campaign_job_families(id)` |
| `grade_id` | INTEGER | NOT NULL, FK → `campaign_grades(id)` |
| `contract_type` | TEXT | NOT NULL, CHECK (`cdi` / `cdd` / `temporary` / `contractor` / `other`) |
| `employment_status` | TEXT | NOT NULL, CHECK (statuts Lot 1C) |
| `hire_date` | TEXT | NOT NULL, ISO `YYYY-MM-DD` (longueur 10) |
| `december_base_salary` | INTEGER | NOT NULL, > 0 (FCFA entier) |
| `nine_box_code` | INTEGER | NULL ou 1–9 |
| `confirmed_underperformer` | INTEGER | NOT NULL DEFAULT 0, CHECK (0 / 1) |
| `promotion_amount` | INTEGER | NOT NULL DEFAULT 0, ≥ 0 |
| `correction_amount` | INTEGER | NOT NULL DEFAULT 0, ≥ 0 |
| `social_measure_amount` | INTEGER | NOT NULL DEFAULT 0, ≥ 0 |
| `source_row_number` | INTEGER | NOT NULL, > 0 |
| `created_at` | TEXT | NOT NULL (UTC ISO-8601) |

Index : unicité `(import_batch_id, employee_number COLLATE NOCASE)` ; index
sur `campaign_id`, `import_batch_id`, `employee_number`, `job_family_id`,
`grade_id`.

## Index

- `ux_campaigns_one_active` : index unique partiel sur `status` lorsque
  `status = 'active'`, garantissant une seule campagne active.

## Règles de suppression

Aucune suppression physique des campagnes. L’archivage est une suppression
logique (`status = archived`, `archived_at` renseigné). La restauration remet
le statut à `draft` et `archived_at` à NULL.

## Données absentes de ce lot

- aucun budget calculé ;
- aucune simulation ;
- aucun résultat de calcul individuel (éligibilité, proposition, consommation).

Les référentiels de rémunération (Lot 1B) et la population importée (Lot 1C)
sont persistés ; ils ne produisent ni montants calculés ni scénarios.

## Stratégie de migrations

Les migrations SQL versionnées sont placées dans `src-tauri/migrations/` et
intégrées au build Rust via `include_str!`. Elles sont enregistrées dans le
builder `tauri-plugin-sql` avec la même chaîne de connexion que le frontend.
Le préchargement est déclaré dans `tauri.conf.json` (`plugins.sql.preload`).

| Version | Fichier | Description |
| --- | --- | --- |
| 1 | `0001_initial_persistence.sql` | `organization_profile`, `campaigns` |
| 2 | `0002_compensation_references.sql` | huit tables `campaign_reference_*` et seed idempotent |
| 3 | `0003_hr_import.sql` | tables `hr_import_batches`, `hr_import_employees` |

La migration `0002` active `PRAGMA foreign_keys = ON`, crée les huit tables
Lot 1B, puis initialise toutes les campagnes déjà présentes via
`INSERT OR IGNORE` (config, familles, grades, grille S0 à `NULL`, positions,
facteurs Performance / Potentiel / 9-Box). Les valeurs déjà configurées ne sont
pas écrasées lors d’une réapplication.

La migration `0003` crée les tables d’import RH, l’index unique partiel garantissant
un seul lot `current` par campagne, et les contraintes CHECK sur formats,
statuts de lot, types de contrat, statuts d’emploi et montants FCFA entiers.
Aucune donnée seed : les lots apparaissent uniquement après confirmation d’import
dans l’application.

Évolution : ajouter un fichier `0004_....sql`, une constante associée et une
entrée `Migration` supplémentaire, sans modifier une migration déjà appliquée.
