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

## 2026-07-18 — Lot 1C : import RH versionné par campagne

### Objectif

Importer localement la population salariée d’une campagne depuis un fichier
Excel ou CSV, avec prévisualisation, validation stricte et remplacement atomique
de la population courante. Hors périmètre : calcul, budget, simulation,
conservation du binaire source.

### Dépendance SheetJS

- Package : `xlsx@0.20.3`
- Source npm : `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`
- Déclaration dans `package.json` (URL tarball CDN SheetJS, bundlé au build ;
  aucun chargement réseau à l’exécution)

### Migration 0003

- Fichier : `src-tauri/migrations/0003_hr_import.sql`
- Tables : `hr_import_batches`, `hr_import_employees`
- Enregistrement Rust : constantes `MIGRATION_0003_*` dans
  `src-tauri/src/persistence.rs`, ordre strict après `0002`
- Index unique partiel `ux_hr_import_batches_one_current` (un lot `current` par
  campagne)
- Tests Rust : présence du SQL, ordre 0001 → 0002 → 0003, contraintes CHECK

### Décision input fichier + ArrayBuffer

L’import utilise l’API web standard `File.arrayBuffer()` depuis un input
`<input type="file">` dans le webview Tauri. Le buffer est passé au parseur
SheetJS sans écriture intermédiaire sur disque applicatif. **Aucune nouvelle
permission Tauri** (filesystem, dialog, shell) n’a été ajoutée ; les capabilities
restent `core:default`, `sql:default`, `sql:allow-execute`.

### Modèle versionné

- Un lot `current` par campagne ; les confirmations suivantes basculent l’ancien
  lot en `superseded`
- Historique consultable ; lignes salariés conservées par lot
- Métadonnées source (nom, format, feuille, taille, compteurs) sans binaire

### Transaction

`replace_current_population` (commande Tauri Rust) ouvre une **connexion SQLite
dédiée**, démarre une **vraie transaction SQLx** (`Connection::begin`), exécute
vérifications + supersede + insert batch + inserts salariés + contrôle de
count, puis `commit`. En cas d’erreur : `rollback` — aucune compensation
applicative côté JavaScript. Le plugin `@tauri-apps/plugin-sql` reste utilisé pour
migrations, lectures et écritures simples.

Capability : `allow-replace-current-population` (en plus de `core:default`,
`sql:default`, `sql:allow-execute`). Aucune permission filesystem/shell/dialog.

### Architecture applicative

- Domaine `src/domain/hrImport`, infrastructure `src/infrastructure/imports`
- Repositories SQLite + mémoire ; service `hrImportService` ; provider
  `HrImportProvider` ; page Import

### Tests

- **Vitest** : `src/tests/hrImport.test.ts` (parseur, mapping, normalisation,
  service, remplacement atomique, campagne archivée, limites taille/lignes)
- **Rust** : `cargo test --manifest-path src-tauri/Cargo.toml --locked`
  (migration 0003)

### Recette

Fichiers de démonstration locaux (hors Git) :

`%TEMP%\jrb-compensation-import-demo`

Scénarios manuels recommandés : import nominal FR/EN, mapping manuel, rejet
formules, doublon matricule, famille/grade inconnu, remplacement population,
historique des lots, campagne archivée en lecture seule.

### Emplacement de la base (inchangé)

`%APPDATA%\com.jrbxsolutions.compensationstudio\jrb-compensation-studio.db`

Chemin absolu constaté :

`C:\Users\HP\AppData\Roaming\com.jrbxsolutions.compensationstudio\jrb-compensation-studio.db`

La migration `0003` s’applique sur la base existante sans recréation.

### Commandes de build

Identiques aux lots précédents. Si l’espace disque de `C:` est insuffisant :

```text
$env:CARGO_TARGET_DIR="D:\dev\jrb-compensation-studio\src-tauri\target"
pnpm tauri build
```

### Impact SheetJS sur le bundle (constaté)

Après `pnpm build`, le chunk dynamique SheetJS est séparé du bundle principal :

| Artefact | Taille | Gzip |
| --- | --- | --- |
| `dist/assets/index-*.js` | ~316 kB | ~91 kB |
| `dist/assets/xlsx-*.js` | ~500 kB | ~163 kB |

SheetJS n’est chargé qu’au moment de l’analyse d’un fichier (import dynamique
`await import("xlsx")`). Aucune ressource CDN à l’exécution.

### Limites connues

- Aucun moteur de calcul ni budget.
- Import tout-ou-rien : une erreur bloque la confirmation.
- Fichier source non conservé après import.
- Pas de chiffrement ni sauvegarde automatique.
- La complétude du référentiel n’empêche pas l’import (avertissement seulement).

## 2026-07-19 — Lot 2A-1 : contrat sémantique 9-Box et orientation

### Objectif

Solidifier le modèle 9-Box avant le moteur de calcul : orientation
paramétrable, clé métier Performance/Potentiel, sans calcul d’augmentation.

### Choix

- Mapping case → (performance, potentiel, facteur) déduit des seeds Lot 1B /
  migration 0002 (non ambigu).
- Orientation stockée dans `campaign_reference_config.nine_box_orientation`
  (défaut Orange = `performance_rows_potential_columns`).
- Index unique `ux_campaign_nine_box_semantic` sur le couple sémantique.
- Ordre d’axes centralisé dans `nineBoxOrientation.ts` (lignes high→low,
  colonnes low→high).
- Lookup pur `getNineBoxFactor` indépendant de l’orientation et du box_code.
- Écriture d’orientation : un seul `UPDATE` atomique (pas de BEGIN via le pool).

### Migration

`0004_compensation_calculation.sql` — 0001/0002/0003 inchangées.

### Vérifications

- `pnpm test` / `pnpm build`
- `cargo fmt --check` / `cargo check --locked` / `cargo test --locked`
- `git diff --check`
- migrations 0001–0003 : diff silencieux

### Limites

- Pas encore de calcul d’augmentation, budget, calibrage, etc.
- Recette manuelle UI (redémarrage / archivage) à valider sur AppData.

## 2026-07-19 — Lot 2A-2 : moteur individuel position + pondération

### Objectif

Produire, pour un salarié, le ratio Salaire/S0, la position, le facteur
d’évaluation, le poids composite et une trace déterministe — sans montant
d’augmentation ni calibrage budget.

### Convention JRB retenue

- Position : point de référence le plus proche (65…135), `BigInt`, mi-chemin →
  ratio supérieur ; `< 65 %` Sout- ; `> 135 %` Sout+.
- Modes : `none` = 1,000 ; `performance_potential` = produit ; échelle
  évaluation 1e6 ; poids 1e9.
- Sous-performant confirmé : poids effectif 0, trace théorique conservée.

### Livrables

- Module `src/domain/compensationCalculation/`
- Tests `src/tests/compensationCalculation.test.ts`
- Docs : BUSINESS_RULES, CALCULATION_CONTRACT, ARCHITECTURE, DATA_DICTIONARY,
  DEVELOPMENT_LOG
- Aucune migration, UI, persistance ni commande Tauri

### Vérifications

- `pnpm test` / `pnpm build`
- `cargo fmt --check` / `cargo check --locked` / `cargo test --locked`
- `git diff --check`
- migrations 0001–0004 : diff silencieux

## 2026-07-19 — Lot 2A-3 : budget cible, allocation théorique, arrondi

### Objectif

Séparer résolution du budget, répartition théorique exacte et arrondi
individuel paramétrable — sans forcer le total réel au budget cible.

### Choix

- `ExactAmount` BigInt réduit (PGCD) ; aucun flottant métier.
- Modes `manual_amount` (montant = budget ; assiette/taux ignorés) et
  `percentage_of_eligible_payroll` (payroll × bps / 10000).
- Allocation `budget × poids / Σpoids` ; invariant Σ parts = budget.
- Arrondi `nearest_half_up` + `stepFcfa` explicite (non figé à 5).
- Montant réel = Σ finaux ; `totalRoundingDelta` exposé, non corrigé.
- Pas de plus forts restes ni réconciliation forcée.

### Livrables

- Extensions `src/domain/compensationCalculation/`
- Tests `src/tests/populationBudgetAllocation.test.ts`
- Docs mises à jour
- Aucune migration / UI / Rust / persistance

### Vérifications

- `pnpm test` / `pnpm build`
- `cargo fmt --check` / `cargo check --locked` / `cargo test --locked`
- `git diff --check`
- migrations 0001–0004 : diff silencieux

## 2026-07-19 — Lot 2A-4 : orchestrateur population préparée

### Objectif

Assembler 2A-2 + 2A-3 pour une population préparée (S0 → poids → budget →
allocation → arrondi), sans UI ni persistance.

### Convention JRB

`allocationWeight = salaryFcfa × effectiveMatrixWeight`
même poids matriciel ⇒ même taux théorique ; montants ∝ salaires.

### Livrables

- `resolveEmployeeS0`, validation, calcul salarié, orchestrateur
- Tests `preparedPopulationCompensation.test.ts`
- Docs mises à jour
- Aucune migration / UI / Rust / persistance

### Vérifications

- `pnpm test` / `pnpm build`
- `cargo fmt --check` / `cargo check --locked` / `cargo test --locked`
- `git diff --check`
- migrations 0001–0004 : diff silencieux

## 2026-07-19 — Lot 2B-1 : préparation applicative de simulation

### Objectif

Créer le pont campagne ↔ population RH courante ↔ référentiels ↔ contrats
moteur Lot 2A, sous forme d’un rapport de readiness, sans lancer le calcul.

### Décision contrat d’entrée

Mapping non ambigu : `employeeNumber` → `employeeId` ;
`jobFamilyId`/`gradeId` → codes référentiel ; `decemberBaseSalary` →
`salaryFcfa` ; Performance/Potentiel dérivés de `nineBoxCode` via facteurs
9-Box ; `confirmedUnderperformer` booléen post-import (pas de défaut
silencieux dans le mapper). Statut : pas de
`LOT_2B_1_BLOCKED_INPUT_CONTRACT`.

### Livrables

- `src/application/campaignSimulation/` (modèles, mapping, readiness, codes)
- `CampaignService.getCampaign` (lecture seule)
- Tests `campaignSimulationReadiness.test.ts`
- Docs : `CAMPAIGN_SIMULATION.md` + mises à jour Architecture / règles /
  contrat / dictionnaire / import / journal
- Aucune migration / UI / Rust / persistance / calcul d’allocation

### Vérifications

- `pnpm test` / `pnpm build`
- `cargo fmt --check` / `cargo check --locked` / `cargo test --locked`
- `git diff --check`
- migrations 0001–0004 : diff silencieux

## 2026-07-19 — Lot 2B-2 : configuration UI de simulation

### Objectif

Page Simulation : sélection de campagne, readiness, saisie budget / arrondi,
validation en mémoire — sans exécuter le moteur ni persister.

### Livrables

- `SimulationPage`, `SimulationConfigurationProvider`
- Parsing exact FCFA / taux bps / pas d’arrondi
- Tests parsing + page + navigation
- Docs mises à jour
- Aucune migration / Rust / Tauri / calcul d’allocation

### Vérifications

- `pnpm test` / `pnpm build`
- `cargo fmt --check` / `cargo check --locked` / `cargo test --locked`
- `git diff --check`
- migrations 0001–0004 : diff silencieux

## 2026-07-20 — Correctif alignement readiness référentiels (2B-2)

### Cause

Rapport Simulation obsolète après édition Référentiels ; validation Simulation
pas assez alignée sur `computeReferenceCompleteness` ; messages génériques.

### Correction

- `buildPopulationCalculationReferences` = complétude éditoriale + contrôles moteur
- coercion numérique IDs/montants SQLite dans les mappers
- refresh readiness à l’entrée Simulation + révision référentiels
- sous-issues détaillées + log DEV `[SIMULATION_REFERENCE_READINESS_FAILED]`
- tests `referenceReadinessAlignment.test.ts`

## 2026-07-20 — Lot 2B-3 : exécution en mémoire et consultation

### Objectif

Lancer explicitement une simulation via le moteur Lot 2A, consulter synthèse /
résultats individuels / détail, avec garde d’empreinte et isolation session —
sans persistance.

### Livrables

- `executeCampaignSimulation`, `buildSimulationSourceFingerprint`,
  `buildSimulationResultView`, formatage exact étendu
- `SimulationExecutionProvider` + panneau résultats / drawer
- Tests service, provider, UI
- Docs mises à jour
- Aucune migration / Rust / Tauri / SQLite simulation

### Vérifications

- `pnpm test` / `pnpm build`
- `cargo fmt --check` / `cargo check --locked` / `cargo test --locked`
- `git diff --check`
- migrations 0001–0004 : diff silencieux
- aucun fichier `src-tauri/` modifié

## 2026-07-20 — Lot 2B-4A : persistance transactionnelle des simulations

### Objectif

Enregistrer durablement un snapshot immuable d’une simulation réussie
(SQLite + commande Rust atomique), sans UI Historique.

### Livrables

- Migration `0005_campaign_simulations.sql`
- `simulation_persistence.rs` + permission `allow-save-simulation-run`
- Service `saveCurrentCampaignSimulation`, DTO / mappers TEXT canonique
- `SimulationHistoryRepository` memory + sqlite
- Docs + tests Rust / TypeScript
- Aucune UI Enregistrer / Historique

### Vérifications

- `pnpm test` / `pnpm build`
- `cargo fmt --check` / `cargo check --locked` / `cargo test --locked`
- `git diff --check`
- migrations 0001–0004 inchangées ; seule 0005 ajoutée

## 2026-07-20 — Correctif 2A-H1 : budget annuel / augmentation mensuelle

### Objectif

Corriger le contrat de calcul qui traitait le budget annuel comme une
augmentation mensuelle (taux ×12, nouveau salaire gonflé).

### Livrables

- Constantes `CALCULATION_CONTRACT_VERSION=2`, `ANNUAL_BUDGET_PERIOD_MONTHS=12`
- `resolveBudgetTarget` : annualisation masse × 12 en mode %
- Orchestrateur 2A-4 : allocation annuelle → ÷12 → arrondi mensuel → ×12
- Modèles / vues / UI avec libellés annuel/mensuel explicites
- `result_schema_version = 2` (Rust + memory) ; pas de migration 0006
- Fingerprints contrat v2 ; snapshots v1 signalés incompatibles
- Tests moteur + régression EMP-2002 / budget 5 000 023
- Docs mises à jour
- Stash 2B-4B **non appliqué**

### Vérifications

- `pnpm test` / `pnpm build`
- `cargo fmt --check` / `cargo check --locked` / `cargo test --locked`
- migrations 0001–0005 inchangées
- stash intact ; aucun commit

## 2026-07-20 — Correctif 2A-H1 final : formatage d’affichage 2 décimales

### Objectif

Limiter l’affichage UI des taux et montants théoriques à 2 décimales
(arrondi d’affichage half-up), sans modifier les fractions métier.

### Livrables

- `formatExactAmountAsFcfa` / `formatExactRateAsPercent` — max 2 décimales
- Tests dédiés `formatExactBudgetDisplay.test.ts`
- Aucune modification moteur / migrations / Rust / stash

### Vérifications

- `pnpm test` / `pnpm build` / cargo / migrations inchangées
- stash intact ; aucun commit

## 2026-07-20 — Lot 2A-H2A : calendrier d’application et rappel

### Objectif

Ajouter mois d’application technique, effet rétroactif au 1er janvier,
rappel de salaire de base et ventilation du coût annuel (rappel vs paiement
direct), sans anticiper H2B (ancienneté / charges).

### Livrables

- Domaine `baseSalaryReminder.ts` + champs salarié / population
- Config UI : `campaignYear`, `technicalApplicationMonth` (liste FR)
- Fingerprints étendus ; moteur sans `Date.now()`
- Affichage synthèse / tableau / détail
- Tests janvier / juillet / décembre / invariants / validations / fingerprint
- Docs BUSINESS_RULES, CALCULATION_CONTRACT, CAMPAIGN_SIMULATION,
  DATA_DICTIONARY, DEVELOPMENT_LOG
- `result_schema_version` inchangé (= 2) ; pas de migration 0006
- Persistance colonnes rappel : **différée** (mémoire d’abord)
- Stash 2B-4B **non appliqué**

### Vérifications

- `pnpm test` / `pnpm build`
- `cargo fmt --check` / `cargo check --locked` / `cargo test --locked`
- `git diff --check`
- migrations 0001–0005 inchangées
- stash intact ; aucun commit
