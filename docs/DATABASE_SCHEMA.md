# Schéma de base de données — Lots 1A à 2B-RC1-H4

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
| `promotion_date` | TEXT | NULL, ISO `YYYY-MM-DD` (Lot 2A-H2C-1) |
| `salary_before_promotion` | INTEGER | NULL, FCFA > 0 si promo |
| `salary_after_promotion` | INTEGER | NULL, FCFA > salaire avant |
| `previous_grade_id` | INTEGER | NULL, FK → `campaign_grades(id)` |
| `promoted_grade_id` | INTEGER | NULL, FK → `campaign_grades(id)` |
| `previous_job_family_id` | INTEGER | NULL, FK → `campaign_job_families(id)` |
| `promoted_job_family_id` | INTEGER | NULL, FK → `campaign_job_families(id)` |
| `source_row_number` | INTEGER | NOT NULL, > 0 |
| `created_at` | TEXT | NOT NULL (UTC ISO-8601) |

Colonnes promotion ajoutées par migration `0006_employee_promotions.sql`
(toutes NULL = pas de promotion). Un événement pertinent N-1/N par salarié
pour la fenêtre courante ; extension multi-événements possible ultérieurement.

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

### Consolidation schema v3 (migration `0007`)

`result_schema_version` passe à **3** en écriture (contrat de calcul v4). Les
colonnes ci-dessous sont **ajoutées NULL** pour les anciens snapshots (v1/v2) —
aucun faux zéro. Aucun `REAL` : montants et fractions restent en TEXT canonique.

`compensation_simulation_runs` — colonnes ajoutées (résumé) :

- Configuration : `retroactivity_start_month`, `technical_application_month`,
  `minimum_guarantee_effective_month` (Lot 2B-RC1-H4, migration `0012` ;
  NULL pour schema ≤ 5), `campaign_covered_month_count`, `reminder_month_count`,
  `direct_payment_month_count`, `calculation_contract_version`,
  `seniority_impact_contract_version`, `minimum_increase_contract_version`,
  `minimum_increase_mode` (CHECK `none` / `fixed_monthly_amount` /
  `percentage_of_base_salary`), `minimum_monthly_amount_text`,
  `minimum_rate_num_text`, `minimum_rate_den_text`.
- Enveloppe promotion-aware (distincte de `budget_target_*`) :
  `promotion_campaign_period_budget_cost_text`,
  `total_minimum_complement_floor_cost_text`,
  `available_budget_after_promotions_num/den_text`,
  `available_budget_after_promotions_and_minimum_num/den_text`,
  `theoretical_compensatory_campaign_period_cost_num/den_text`,
  `actual_compensatory_campaign_period_cost_text`,
  `actual_minimum_complement_paid_cost_text`,
  `actual_compensation_above_minimum_cost_text`,
  `actual_combined_campaign_period_cost_text`,
  `compensatory_calibration_rate_num/den_text`,
  `minimum_increase_population_employee_count`,
  `promoted_included_employee_count`.
- Rappels / directs, ancienneté, plein effet (population) : totaux `*_text`
  (`total_base_salary_reminder_text`, `total_annual_seniority_impact_text`,
  `full_year_run_rate_*`, etc.).

Les colonnes 0005 (`budget_target_*`, `theoretical_total_*`,
`actual_operation_amount_fcfa_text`, `total_rounding_delta_*`, `campaign_year`)
sont **réutilisées** avec leur sémantique « période » (voir
`SIMULATION_PERSISTENCE.md`).

`compensation_simulation_employee_results` — colonnes ajoutées : allocation /
coût annuel (`annual_theoretical_allocation_num/den_text`,
`annual_actual_cost_text`, `annual_rounding_delta_num/den_text`), calendrier
(`retroactivity_start_month`, `technical_application_month`,
`minimum_guarantee_effective_month`, `campaign_covered_month_count`, `retroactive_months`,
`remaining_direct_payment_months`, `base_salary_reminder_text`, …), ancienneté
(`hire_date`, `technical_application_month_seniority_rate_percent`,
`seniority_reminder_text`, `annual_seniority_impact_text`, …), plein effet
(`full_year_run_rate_*_text`), promotion structurée (`promotion_status_kind`,
`has_structured_promotion`, `promotion_date`, `previous/promoted_grade_code`,
`salary_before/after_promotion_text`, `promotion_rate_num/den_text`, …), et
minimum garanti (`is_minimum_increase_population_employee`,
`campaign_period_minimum_complement_floor_cost_text`, …). Contraintes CHECK
usuelles : mois 1–12, booléens 0/1, dénominateurs `length(trim()) > 0`.

### `compensation_simulation_employee_month_results` (migration `0007`)

Trajectoire mensuelle du snapshot : **une ligne par (résultat salarié, mois
1..12)**. Append-only, aucun `REAL`.

| Colonne | Type | Contraintes |
| --- | --- | --- |
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `employee_result_id` | INTEGER | NOT NULL, FK → `compensation_simulation_employee_results(id)` **ON DELETE CASCADE** |
| `month` | INTEGER | NOT NULL, CHECK (1–12) |
| `base_salary_fcfa_text` / `grade_code` / `job_family_code` | TEXT | NOT NULL, `length(trim()) > 0` |
| `salary_position_label` | TEXT | NULL |
| taux / compléments / plein salaire (`*_num_text` / `*_den_text` / `*_fcfa_text`) | TEXT | NOT NULL (dénominateurs `length(trim()) > 0`) |
| `seniority_rate_percent` | INTEGER | NOT NULL |
| impacts d’ancienneté (`*_seniority_impact_fcfa_text`) | TEXT | NOT NULL |
| `payment_timing` | TEXT | NOT NULL, CHECK (`outside_campaign` / `reminder` / `direct`) |
| `promotion_payment_timing` | TEXT | NOT NULL, CHECK (`outside_campaign` / `reminder` / `direct` / `not_applicable`) |
| `covered_by_campaign_period` / `included_in_campaign_envelope` / `promotion_active` / `is_minimum_increase_population_employee` | INTEGER | NOT NULL, CHECK (0 / 1) |
| `promotion_status` | TEXT | NOT NULL, `length(trim()) > 0` |
| minimum garanti (`guaranteed_total_increase_*`, `required_minimum_complement_*`, `weighted_complement_*`, `theoretical_complement_*`, `*_fcfa_text`) | TEXT | NOT NULL (dénominateurs `length(trim()) > 0`) |

Contrainte : `UNIQUE(employee_result_id, month)`. Index de lecture :
`ix_compensation_simulation_employee_month_results_employee` et
`…_employee_month`.

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
Depuis le Lot 2B-RC1-SEC1-A, la fenêtre `access` (démarrage) n’utilise **pas**
le plugin SQL et ne précharge jamais la base ; seule la fenêtre `main` (après
déverrouillage) déclenche le préchargement + les migrations 0001–0012 via le
plugin. Les commandes d’accès local (`get_local_access_status`,
`setup_local_access`, `unlock_local_access`) ouvrent une connexion SQLite
dédiée (`create_if_missing`) et rejouent la migration `0010` de façon
idempotente avant toute lecture/écriture — voir `docs/LOCAL_ACCESS_SECURITY.md`.

| Version | Fichier | Description |
| --- | --- | --- |
| 1 | `0001_initial_persistence.sql` | `organization_profile`, `campaigns` |
| 2 | `0002_compensation_references.sql` | huit tables `campaign_reference_*` et seed idempotent |
| 3 | `0003_hr_import.sql` | tables `hr_import_batches`, `hr_import_employees` |
| 4 | `0004_compensation_calculation.sql` | `nine_box_orientation` + index sémantique 9-Box |
| 5 | `0005_campaign_simulations.sql` | snapshots de simulations immuables |
| 6 | `0006_employee_promotions.sql` | colonnes promotion optionnelles sur `hr_import_employees` |
| 7 | `0007_simulation_contract_v4_results.sql` | consolidation snapshot schema v3 (contrat v4 + trajectoire mensuelle) |
| 8 | `0008_nine_box_neutralization.sql` | import + snapshot schema v4 (contrat v5) — neutralisation 9-Box |
| 9 | `0009_nine_box_confirmation_factor.sql` | référentiel + snapshot schema v5 (contrat v6) — coefficient provisoire 9-Box |
| 10 | `0010_local_access_state.sql` | `local_access_state` (accès local : mot de passe + période initiale) |
| 11 | `0011_license_activations.sql` | `license_activations` (historique des licences hors ligne) |
| 12 | `0012_minimum_guarantee_effective_month.sql` | mois d’effet explicite du minimum garanti (schema v6 / contrat v8) |
| 13 | `0013_universal_fixed_amount.sql` | mécanisme social exclusif + forfait social universel (schema v7 / contrat v9) |

### Forfait social universel (migration `0013`, schema v7 / contrat v9)

Additive, non destructive. Aucun `DEFAULT`, aucun backfill artificiel.
Les snapshots historiques conservent `NULL` sur les nouveaux champs ;
à la relecture, `social_mechanism_kind` absent se dérive de
`minimum_increase_mode` (`minimum_guaranteed` / `none`) — **jamais**
`universal_fixed_amount` inventé.

Colonnes principales sur `compensation_simulation_runs` :
`social_mechanism_kind`, paramètres forfait (montant, mois d’effet,
ancienneté minimale, **date de référence d’ancienneté**
`universal_fixed_amount_seniority_reference_date`), compteurs / totaux forfait,
budget résiduel après mécanisme social. Miroir salarié
(`universal_fixed_amount_seniority_reference_date`) et trajectoire mensuelle
(`universal_fixed_amount_fcfa_text`) pour audit.

L’ancienneté minimale d’éligibilité au forfait social universel est évaluée en mois calendaires révolus à une date de référence configurable. Par défaut, cette date est fixée au 31 décembre de l’année précédant la campagne. Le mois d’effet du forfait détermine uniquement sa durée d’incidence budgétaire.

### Mois d’effet du minimum garanti (migration `0012`, schema v6 / contrat v8)

Additive, non destructive. Aucun `DEFAULT`, aucun backfill artificiel :
les snapshots historiques conservent `NULL`.

- `compensation_simulation_runs.minimum_guarantee_effective_month` INTEGER
  NULL, CHECK (`NULL` ou entre **1** et **12**). Les nouveaux runs schema **6**
  écrivent une valeur explicite côté applicatif.
- `compensation_simulation_employee_results.minimum_guarantee_effective_month`
  INTEGER NULL, CHECK identique (miroir salarié, aligné sur
  `retroactivity_start_month` / `technical_application_month` depuis `0007`).

Relecture schema **≤ 5** : le mois d’effet affiché / exporté se résout vers
`retroactivity_start_month` (**jamais** `technical_application_month`), avec
libellé « Aligné historiquement sur le mois de rétroactivité » — aucune
valeur 1–12 fabriquée à la lecture.

### Neutralisation 9-Box (migration `0008`, schema v4 / contrat v5)

Additive, non destructive. Colonnes NULL sur les anciens snapshots v3
(jamais de faux « Non » reconstruit).

- `hr_import_employees.neutralize_nine_box_effect` INTEGER NOT NULL DEFAULT 0
- `compensation_simulation_runs.neutralize_nine_box_effect_employee_count`
- `compensation_simulation_employee_results` :
  `neutralize_nine_box_effect`, `source_nine_box_code`,
  `nine_box_treatment_kind`

### Coefficient provisoire 9-Box (migration `0009`, schema v5 / contrat v6)

Additive, non destructive. Ne modifie ni la colonne d’import
`neutralize_nine_box_effect`, ni son libellé : le déclencheur reste
inchangé, seul le traitement du calcul évolue (le facteur neutre 1 du
Lot H1 est remplacé par un coefficient provisoire paramétrable).

- `campaign_reference_config.nine_box_confirmation_factor_milli` INTEGER
  NOT NULL DEFAULT 900, CHECK 500–1000 (référentiel par campagne, éditable
  depuis la page Références).
- `compensation_simulation_runs.nine_box_confirmation_factor_milli` INTEGER
  NULL, CHECK 500–1000 ou NULL (coefficient effectivement utilisé au
  calcul ; NULL pour les runs antérieurs au schema v5 — jamais de 900
  reconstruit à la lecture).
- `compensation_simulation_employee_results.nine_box_treatment_kind` : jeu
  de valeurs étendu avec `performance_pending_confirmation` (recréation de
  colonne SQLite via `ADD COLUMN` + `UPDATE` + `DROP COLUMN` + `RENAME COLUMN`,
  car SQLite ne permet pas d’altérer une contrainte `CHECK` existante). La
  valeur historique `nine_box_effect_neutralized` reste acceptée pour les
  snapshots v4.

Évolution : ajouter un fichier `0013_....sql`, une constante associée et une
entrée `Migration` supplémentaire, sans modifier une migration déjà appliquée.

### Accès local (migration `0010`, Lot 2B-RC1-SEC1-A)

Additive, non destructive. Aucune table métier existante modifiée. Table
singleton (`singleton_id = 1`, une seule ligne possible) :

- `installation_id` TEXT UNIQUE — format `JRB-CS-{8hex}-{8hex}`.
- `password_hash` TEXT — hachage Argon2id (format PHC), jamais le mot de
  passe en clair.
- `installed_at`, `initial_valid_until`, `current_valid_until`,
  `last_observed_at` TEXT — dates RFC3339 UTC.
- `clock_anomaly_detected` INTEGER (0/1) — anomalie sticky (jamais réinitialisée
  automatiquement).

`license_activations` est ajoutée en Lot 2B-RC1-SEC1-B (migration `0011`) :
historique transactionnel des activations (`license_id` unique, `payload_json`,
`payload_sha256`, durée 1–120 mois, dates de validité avant/après).

### Licences hors ligne (migration `0011`, Lot 2B-RC1-SEC1-B)

Table `license_activations` : une ligne par code activé. Aucune clé privée.
Champs : `license_id` UNIQUE, `installation_id`, `payload_json`,
`payload_sha256`, `activated_at`, `issued_at`, `duration_months` (1–120),
`previous_valid_until`, `new_valid_until`, `customer` NULL, `created_at`.
Voir `docs/OFFLINE_LICENSES.md`.

Évolution : ajouter un fichier `0013_....sql`, une constante associée et une
entrée `Migration` supplémentaire, sans modifier une migration déjà appliquée.

## Export Excel RH et mot de passe (Lot 2B-E1)

L’export Excel RH (`export_simulation_run_excel`) lit un snapshot existant en
lecture seule et **n’écrit aucune donnée en base**. Le **mot de passe de
protection n’est jamais persisté** : il n’existe que le temps de l’export (en
mémoire, via `Zeroizing` côté Rust) et sert uniquement au chiffrement agile du
fichier `.xlsx`. Aucune migration n’est introduite par ce lot.
