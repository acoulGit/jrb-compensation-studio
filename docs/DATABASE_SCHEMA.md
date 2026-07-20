# Schéma de base de données — Lots 1A à 2B-4A

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

### `campaign_reference_config` (Lot 1B / Lot 2A-1)

Configuration générale du référentiel de rémunération, une ligne par campagne.

| Colonne | Type | Contraintes |
| --- | --- | --- |
| `campaign_id` | INTEGER | PRIMARY KEY, FK → `campaigns(id)` |
| `nine_box_mode` | TEXT | NOT NULL, CHECK (`none` / `performance_only` / `full_nine_box` / `performance_potential`) |
| `nine_box_orientation` | TEXT | NOT NULL (Lot 2A-1), DEFAULT `performance_rows_potential_columns`, CHECK (`performance_rows_potential_columns` / `performance_columns_potential_rows`) |
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

### `campaign_nine_box_factors` (Lot 1B / Lot 2A-1)

Neuf coefficients 9-Box par campagne. Clé historique : `box_code`. Clé métier
sémantique (Lot 2A-1) : couple `(performance_level, potential_level)`.

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
Index unique Lot 2A-1 : `ux_campaign_nine_box_semantic` sur
`(campaign_id, performance_level, potential_level)`.

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

### `compensation_simulation_runs` (Lot 2B-4A)

Snapshot immuable d’une simulation réussie. Montants / fractions en **TEXT**
décimal canonique (pas de `REAL`).

| Colonne | Type | Contraintes |
| --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `campaign_id` | INTEGER | NOT NULL, FK → `campaigns(id)` |
| `run_number` | INTEGER | NOT NULL, > 0, UNIQUE avec `campaign_id` |
| `result_schema_version` | INTEGER | NOT NULL DEFAULT 1 |
| `campaign_name` / `campaign_year` / `campaign_status_at_run` | TEXT/INT | snapshot campagne |
| `evaluation_mode` | TEXT | CHECK modes 9-Box |
| `source_import_batch_id` | INTEGER | FK → `hr_import_batches(id)` ON DELETE SET NULL |
| `source_fingerprint` / `configuration_fingerprint` | TEXT | NOT NULL |
| `budget_*_text` / `*_numerator_text` / `*_denominator_text` | TEXT | budget exact |
| compteurs population | INTEGER | ≥ 0 |
| `created_at` | TEXT | NOT NULL (UTC) |

### `compensation_simulation_employee_results` (Lot 2B-4A)

Lignes salariés du snapshot. FK `simulation_run_id` →
`compensation_simulation_runs(id)` **ON DELETE CASCADE**.
`UNIQUE(simulation_run_id, employee_id)`. Fractions et montants en TEXT.
`explanation_steps_json` TEXT DEFAULT `'[]'`.

## Index

- `ux_campaigns_one_active` : index unique partiel sur `status` lorsque
  `status = 'active'`, garantissant une seule campagne active.
- Index Lot 2B-4A : `campaign_id`, `(campaign_id, created_at)`,
  `source_import_batch_id`, `simulation_run_id`, `employee_id`.

## Règles de suppression

Aucune suppression physique des campagnes. L’archivage est une suppression
logique (`status = archived`, `archived_at` renseigné). La restauration remet
le statut à `draft` et `archived_at` à NULL.

Les simulations enregistrées sont **append-only** (pas d’UPDATE / DELETE métier
dans le Lot 2B-4A).

## Données absentes de ce sous-lot UI

- aucune interface Historique (reportée au Lot 2B-4B) ;
- aucun export de simulation ;
- aucune édition manuelle des lignes enregistrées.

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
| 4 | `0004_compensation_calculation.sql` | `nine_box_orientation` + index sémantique 9-Box |
| 5 | `0005_campaign_simulations.sql` | snapshots de simulations immuables |

Évolution : ajouter un fichier `0006_....sql`, une constante associée et une
entrée `Migration` supplémentaire, sans modifier une migration déjà appliquée.
