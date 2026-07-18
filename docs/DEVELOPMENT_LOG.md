# Journal de développement

## Principes de tenue

Ce journal consigne les choix structurants, vérifications et limites de chaque
lot. Il ne remplace ni l’historique Git ni les règles métier de référence.

## 2026-07-18 — Fondation du shell desktop

### Objectif

Remplacer le template de démonstration par une fondation professionnelle,
locale et navigable, sans données RH ni logique de calcul.

### Choix

- Navigation React par état local : neuf vues simples ne justifient pas
  l’ajout d’un routeur à ce stade.
- Composants et styles locaux, sans framework UI ni police distante.
- Configuration client provisoire en TypeScript, non persistée.
- Suppression de la commande de démonstration et du plugin Tauri d’ouverture
  de liens pour réduire les permissions.
- Tests de rendu et de navigation avec Vitest, Testing Library et jsdom.

### Vérifications attendues

- `pnpm test`
- `pnpm build`
- vérification Tauri en développement
- `pnpm tauri build`
- recherche d’appels ou ressources distantes

### Limites connues

- Aucune base SQLite ni persistance.
- Aucun import Excel, calcul, scénario réel ou export.
- Aucun modèle de données exécutable.
- Navigation sans URL ni historique ; ce besoin sera réévalué si la profondeur
  de navigation augmente.

## 2026-07-18 — Lot 1A : persistance locale et campagnes

### Objectif

Introduire SQLite via le plugin officiel Tauri SQL, persister l’identité de
l’organisation et permettre la gestion des campagnes avec une seule campagne
active.

### Installation plugin SQL

- Frontend : `@tauri-apps/plugin-sql`
- Rust : `tauri-plugin-sql` avec feature `sqlite`
- Chaîne unique : `sqlite:jrb-compensation-studio.db`
- Migration : `src-tauri/migrations/0001_initial_persistence.sql`
- Enregistrement Rust via `include_str!` et `add_migrations`
- Préchargement dans `tauri.conf.json` (`plugins.sql.preload`)
- Capabilities : `core:default`, `sql:default`, `sql:allow-execute`

### Architecture applicative

- Repositories SQLite + doubles mémoire pour les tests jsdom
- Services `organizationService` et `campaignService`
- `AppDataProvider` pour l’initialisation, le rechargement et les erreurs
- Pages Paramètres et Campagnes fonctionnelles

### Emplacement constaté de la base sous Windows

Lors de `pnpm tauri dev`, la base a été créée ici :

`%APPDATA%\com.jrbxsolutions.compensationstudio\jrb-compensation-studio.db`

Chemin absolu constaté :

`C:\Users\HP\AppData\Roaming\com.jrbxsolutions.compensationstudio\jrb-compensation-studio.db`

Le fichier reste hors Git (motif `*.db` du `.gitignore`).

### Commandes de tests

```text
pnpm test
cargo test --manifest-path src-tauri/Cargo.toml --locked
```

### Commandes de build

```text
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml --locked
pnpm tauri build
```

Si l’espace disque de `C:` est insuffisant, réutiliser :

```text
$env:CARGO_TARGET_DIR="D:\dev\jrb-compensation-studio\src-tauri\target"
pnpm tauri build
```

Exécutable et installateurs générés (avec `CARGO_TARGET_DIR` sur `D:`) :

- `D:\dev\jrb-compensation-studio\src-tauri\target\release\jrb-compensation-studio.exe`
- `D:\dev\jrb-compensation-studio\src-tauri\target\release\bundle\msi\JRB Compensation Studio_0.1.0_x64_en-US.msi`
- `D:\dev\jrb-compensation-studio\src-tauri\target\release\bundle\nsis\JRB Compensation Studio_0.1.0_x64-setup.exe`

### Limites connues

- Pas de chiffrement ni de sauvegarde automatique.
- Pas de données RH, import, calculs ni simulations.
- Transactions d’activation via `BEGIN IMMEDIATE` / `COMMIT` sur la connexion
  SQL Tauri.

## 2026-07-18 — Lot 1B : référentiels de rémunération par campagne

### Objectif

Persister les paramètres de rémunération validés (grille, positions, 9-Box)
par campagne, avec complétude et édition en lecture seule pour les campagnes
archivées. Hors périmètre : salariés, import, calcul individuel, budget,
simulation.

### Migration 0002

- Fichier : `src-tauri/migrations/0002_compensation_references.sql`
- Huit tables : `campaign_reference_config`, `campaign_job_families`,
  `campaign_grades`, `campaign_salary_grid`, `campaign_salary_positions`,
  `campaign_performance_factors`, `campaign_potential_factors`,
  `campaign_nine_box_factors`
- Enregistrement Rust : constantes `MIGRATION_0002_*` dans
  `src-tauri/src/persistence.rs`, ordre strict après `0001`
- Tests Rust : présence du SQL, noms de tables, absence de type `REAL` pour
  les paramètres numériques

### Initialisation des campagnes existantes

La migration exécute des `INSERT OR IGNORE` pour toutes les campagnes déjà
présentes : config (`nine_box_mode = none`), familles F1–F5, grades G1–G6,
grille S0 (30 cellules à `NULL`), 17 positions, facteurs Performance /
Potentiel / 9-Box avec valeurs par défaut. Réentrée idempotente : aucun
doublon, aucun écrasement des valeurs déjà saisies.

### Initialisation des nouvelles campagnes

- **SQLite** : transaction `BEGIN IMMEDIATE` dans
  `SqliteCampaignRepository.createCampaign`, puis appel à
  `seedCampaignReferences` (même logique `INSERT OR IGNORE` que la migration).
- **Mémoire / tests** : `CampaignService.createCampaign` appelle
  `referenceRepository.initializeForCampaign` ; le dépôt mémoire reproduit
  la structure par défaut sans SQLite.

### Entiers à échelle (bps, milli)

Les ratios et coefficients sont stockés en entiers, sans `REAL` :

- `reference_ratio_bps` : basis points (`10000` = 100 %)
- `*_factor_milli` / `position_factor_milli` : millièmes (`1000` = 1,000),
  plage 0–10 000

Les montants S0 restent des entiers FCFA (`s0_amount`). Conversions
affichage ↔ stockage dans `src/domain/compensationReference/conversions.ts`.

### Tests

- **Vitest** : `src/tests/compensationReferences.test.tsx` (service, complétude,
  validations, campagne archivée en lecture seule)
- **Rust** : `cargo test --manifest-path src-tauri/Cargo.toml --locked`
  (migrations 0001 puis 0002, contenu SQL)

### Recette de persistance

Effectuée sur la base AppData existante (non recréée) :

1. `pnpm tauri dev` applique la migration `0002` ; campagnes Lot 1A
   (`Revue salariale 2026`, `Simulation 2027`) conservées ;
2. chaque campagne reçoit 5 familles, 6 grades, 30 cellules S0 (`NULL`),
   17 positions et les facteurs par défaut ;
3. valeurs fictives saisies sur `Simulation 2027` (libellés, 2 médianes S0,
   coefficient Sout-, mode `performance_only`, facteur Performance) ;
4. nouvelle campagne fictive `Campagne recette Lot 1B` initialisée avec
   structure complète ;
5. arrêt complet puis relance : données toujours présentes ; campagne 1
   non altérée (`F1` / `Famille 1`).

Point d’attention Windows : les fichiers `*.sql` doivent rester en LF.
Un checkout CRLF faisait échouer sqlx (`migration 1 … has been modified`).
Correctif : `*.sql text eol=lf` dans `.gitattributes`.

À compléter lors des prochains lots (salariés, budget, calcul).

### Emplacement de la base (inchangé)

`C:\Users\HP\AppData\Roaming\com.jrbxsolutions.compensationstudio\jrb-compensation-studio.db`

### Commandes de build

Identiques au Lot 1A. Si l’espace disque de `C:` est insuffisant :

```text
$env:CARGO_TARGET_DIR="D:\dev\jrb-compensation-studio\src-tauri\target"
pnpm tauri build
```

### Limites connues

- Pas de table salariés ni d’import RH.
- Aucun moteur de calcul : paramètres stockés et validés uniquement.
- La complétude du référentiel n’empêche pas l’activation d’une campagne.
- Pas de chiffrement, sauvegarde automatique, export ni simulation.
