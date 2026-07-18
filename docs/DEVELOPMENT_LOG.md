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
