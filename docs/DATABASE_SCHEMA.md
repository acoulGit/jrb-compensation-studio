# Schéma de base de données — Lot 1A

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

## Index

- `ux_campaigns_one_active` : index unique partiel sur `status` lorsque
  `status = 'active'`, garantissant une seule campagne active.

## Règles de suppression

Aucune suppression physique des campagnes. L’archivage est une suppression
logique (`status = archived`, `archived_at` renseigné). La restauration remet
le statut à `draft` et `archived_at` à NULL.

## Données absentes de ce lot

- aucune table salariés ;
- aucun import RH ;
- aucun référentiel salarial ;
- aucun budget calculé ;
- aucune simulation.

## Stratégie de migrations

Les migrations SQL versionnées sont placées dans `src-tauri/migrations/` et
intégrées au build Rust via `include_str!`. Elles sont enregistrées dans le
builder `tauri-plugin-sql` avec la même chaîne de connexion que le frontend.
Le préchargement est déclaré dans `tauri.conf.json` (`plugins.sql.preload`).

Évolution : ajouter un fichier `0002_....sql`, une constante associée et une
entrée `Migration` supplémentaire, sans modifier une migration déjà appliquée.
