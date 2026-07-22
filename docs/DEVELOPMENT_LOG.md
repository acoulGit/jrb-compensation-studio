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

## 2026-07-20 — Lot 2A-H2B : incidence supplémentaire d’ancienneté

### Objectif

Calculer mois par mois l’incidence d’ancienneté sur l’augmentation mensuelle
finale, hors budget, avec rappel/direct et date d’embauche importée.

### Livrables

- Domaine `seniorityImpact.ts` + `SENIORITY_IMPACT_CONTRACT_VERSION = 1`
- Propagation `hireDate` : import → préparé → moteur → vues
- Fingerprints : contrat ancienneté + `hireDate`
- UI synthèse « Impacts hors budget », tableau et détail
- Tests barème / cas 2023–2024 / validations / hors budget
- Docs mises à jour ; `result_schema_version = 2` inchangé
- Pas de migration 0006 ; persistance SQL inchangée
- Stash 2B-4B **non appliqué**

### Vérifications

- `pnpm test` / `pnpm build` / cargo / `git diff --check`
- migrations 0001–0005 et `simulation_persistence.rs` inchangés
- stash intact ; aucun commit

## 2026-07-21 — Lot 2A-H2C-1 correction : coexistence promotionAmount

### Objectif

Sécuriser la coexistence entre `promotionAmount` historique et la promotion
structurée H2C (pas de correction silencieuse en cas d’écart).

### Comportement

- Sans promo structurée : conserver `promotionAmount` ; pas de `PromotionEvent`
- Avec promo structurée : montant canonique = delta salaires
- Absente / vide / 0 → dérivé ; égale → OK ; différente → `PROMOTION_AMOUNT_MISMATCH`

### Vérifications

- `pnpm test` / `pnpm build` / cargo / `git diff --check`
- stash intact ; aucun commit

## 2026-07-20 — Lot 2A-H2C-1 : import promotions + trajectoire mensuelle

### Objectif

Capturer une promotion structurée (N-1 ou N), valider la cohérence avec le
snapshot décembre N-1, construire une trajectoire salariale mensuelle
déterministe et préparer le coût campagne pour H2C-2 — sans modifier
l’allocation budgétaire ni `result_schema_version` / contrat v2.

### Livrables

- Domaine `promotionTrajectory.ts` (`PromotionEvent`, trajectoire, validations)
- Migration `0006_employee_promotions.sql` (colonnes optionnelles sur
  `hr_import_employees`)
- Import : colonnes optionnelles, aliases, normalisation, persistance TS/Rust
- Mapping → `PreparedEmployeeCalculationInput.promotion` + fingerprint
- Prévisualisation ImportPage (date / delta)
- Tests `promotionTrajectory.test.ts` + scénarios import
- Docs BUSINESS_RULES, CALCULATION_CONTRACT, DATA_DICTIONARY, HR_IMPORT
- Stash 2B-4B **non appliqué** ; aucun commit

### Vérifications

- `pnpm test` : 305 passed
- `pnpm build` : OK
- `cargo fmt --check` / `cargo check --locked` / `cargo test --locked` : OK
- migrations 0001–0005 inchangées ; 0006 créée
- stash 2B-4B intact ; aucun commit

## 2026-07-21 — Lot 2A-H2C-2A correction sémantique coût / erreurs

### Objectif

- `annualPromotionBudgetCostFcfa` = coût **imputable** uniquement ;
  coût brut informatif = `promotionInclusion.promotionCampaignCostFcfa` ;
- `totalAnnualPromotionBudgetCostFcfa` = Σ exacte des coûts imputables ;
- `NO_COMPENSATORY_ALLOCATION_CAPACITY` / `PROMOTION_COST_EXCEEDS_BUDGET`
  conservent leur code (non masqués en `POPULATION_CALCULATION_FAILED`).

### Vérifications

- `pnpm test` / `pnpm build` / cargo ; stash intact ; aucun commit

## 2026-07-21 — Lot 2A-H2C-2A audit éligibilité avant commit

### Objectif

Clarifier et brancher la séparation population budget promotion vs éligibilité
complément compensatoire, en réutilisant les règles documentées (CDI/CDD,
12 mois au 31/12 N-1, gel `external_availability`).

### Livrables

- `compensatoryMeasureEligibility.ts` — `isCompensatoryMeasureEligible`
- Mapping import → `contractType` + éligibilité calculée
- Fallback statut/contrat absents limité aux fixtures techniques
- Tests pipeline (contrat, ancienneté, promu non éligible, etc.)
- Parité fixture 5 000 023 inchangée
- Stash intact ; aucun commit ; migrations inchangées

## 2026-07-21 — Lot 2A-H2C-2A : moteur budget promotion / calibrage compensatoire

### Objectif

Intégrer le coût des promotions structurées (Lot 2A-H2C-1) au budget annuel
et calibrer le complément compensatoire matriciel sur le reliquat, avec une
résolution **mensuelle** (12 expositions/salarié) pour absorber les
promotions en cours d’année, tout en garantissant une parité stricte avec le
moteur existant en l’absence de promotion structurée.

### Livrables

- `promotionBudgetPopulation.ts` — statuts d’emploi consommant le budget
  (`isPromotionBudgetPopulationEmployee` ; `active` / `group_detachment` /
  `legal_leave` ; absent ⇒ `active` par rétro-compatibilité)
- `promotionCompensatoryCalibration.ts` — solveur exact piecewise
  (`solvePromotionAwareCompensatoryCalibrationRate`, BigInt/fractions
  uniquement) + helpers de coût annuel promotion
  (`PROMOTION_COMPENSATORY_CALIBRATION_CONTRACT_VERSION = 1`)
- `promotionAwareEmployeeCompensation.ts` — expositions mensuelles puis
  finalisation par salarié (arrondi mensuel, ventilation ancienneté
  promotion/compensatoire, coût combiné)
  (`PROMOTION_AWARE_COMPENSATION_CONTRACT_VERSION = 1`)
- `calculatePreparedPopulationCompensation.ts` réécrit : nouveau pipeline
  (coût promotion → `PROMOTION_COST_EXCEEDS_BUDGET` si dépassement → budget
  disponible → calibrage → finalisation → invariants population)
- `PreparedEmployeeCalculationInput` : `employmentStatus`,
  `compensatoryMeasureEligible` (tous deux optionnels, défauts
  rétro-compatibles)
- Nouveaux champs résultat salarié/population (`monthlyCompensationTrajectory`,
  `totalAnnualPromotionBudgetCostFcfa`, `availableAnnualCompensatoryBudget`,
  `compensatoryCalibrationRate`, totaux combinés et ancienneté ventilée)
- Nouveaux codes d’erreur : `INVALID_EMPLOYMENT_STATUS`,
  `INVALID_COMPENSATORY_MEASURE_ELIGIBLE`, `PROMOTION_COST_EXCEEDS_BUDGET`,
  `NO_COMPENSATORY_ALLOCATION_CAPACITY` (remontée dans
  `POPULATION_CALCULATION_FAILED`), `PROMOTION_BUDGET_INVARIANT_FAILED`
- Wiring `employmentStatus` : `EmployeeSnapshot` →
  `mapImportedEmployeeToPreparedInput`
- Fingerprint de simulation (Lot 2B-3) étendu : `employmentStatus`,
  `compensatoryMeasureEligible`, versions de contrat calibrage / trajectoire
  mensuelle
- Tests `promotionBudgetEngine.test.ts` (solveur, population budget,
  dépassement budget, statuts non payants, éligibilité compensatoire,
  ventilation ancienneté)
- Docs BUSINESS_RULES, CALCULATION_CONTRACT, HR_IMPORT, DEVELOPMENT_LOG

### Parité

- `annualBudgetMonthlyIncrease.test.ts` inchangé et **toujours au vert** :
  sans promotion structurée, `promotionRateOffset = 0` partout et
  `availableAnnualCompensatoryBudget = budget annuel cible`, donc résultats
  strictement identiques au moteur Lot 2A-3/H2A/H2B.
- `result_schema_version` inchangé (= 2) ; aucune migration créée/modifiée.

### Vérifications

- `pnpm test` : 328 passed (25 fichiers)
- `pnpm build` : OK
- `cargo fmt --check` / `cargo check` : OK (aucun fichier Rust modifié dans ce
  lot) ; `cargo test` non concluant dans cet environnement d’exécution
  (espace disque insuffisant sur le volume de travail, sans rapport avec ce
  lot — voir limites connues)
- migrations 0001–0006 inchangées (`git diff -- src-tauri/migrations` vide)
- stash `wip/lot-2b-4b-before-annual-budget-fix` intact ; aucun commit

### Limites connues

- Environnement d’exécution à espace disque très contraint : `cargo test`
  (build complet) a échoué avec `no space on device` indépendamment du code
  produit ; `cargo fmt --check` et `cargo check` (build incrémental) ont
  réussi. À rejouer sur un environnement disposant de plus d’espace disque
  libre si une validation Rust complète est requise.
- Couverture de tests du nouveau moteur volontairement ciblée (scénarios clés
  du brief) plutôt qu’exhaustive sur toutes les combinaisons possibles de
  statuts / éligibilité / mois de promotion.

## 2026-07-21 — Lot 2A-H2C-2B restitution UI résultats

### Objectif

Rendre les résultats H2C-2A auditables : enveloppe, calendrier de paiement,
ancienneté hors budget, tableau / détail salarié, trajectoire mensuelle,
erreurs métier dédiées — sans recalcul dans React ni migration.

### Livrables

- `buildSimulationResultView` enrichi + `promotionAwareResultLabels`
- `findDedicatedSimulationBusinessError`
- `SimulationResultsPanel` (synthèse enveloppe, calendrier, ancienneté, détail)
- Tests `promotionAwareResultView.test.ts`
- Docs CAMPAIGN_SIMULATION / DATA_DICTIONARY / CALCULATION_CONTRACT
- `result_schema_version = 2` inchangé ; stash 2B-4B intact ; aucun commit

## 2026-07-21 — Lot 2A-H2C-2B audit agrégats de vue

### Objectif

Supprimer les recompositions métier dans `buildSimulationResultView` :
delta combiné, ventilations promo et ancienneté viennent exclusivement du
moteur (`annualCombinedRoundingDeltaFcfa`,
`totalPromotionCostAlreadyPaidBeforeTechnicalMonthFcfa`, etc.).

### Vérifications

- Tests de preuve (valeurs forgées ≠ recomposition locale)
- Erreurs métier détectées par `issue.code` uniquement
- Migrations / `result_schema_version` / stash inchangés ; aucun commit

## 2026-07-21 — Lot 2A-H2C-2B fix NO_COMPENSATORY_ALLOCATION_CAPACITY

### Objectif

Enrichir l’erreur avec le contexte budgétaire structuré et corriger le
message : ne plus conseiller d’augmenter le budget.

### Vérifications

- Carte : budget disponible / coût promo / cible / expositions depuis le moteur
- Message : réduire l’enveloppe ou revoir l’éligibilité
- `PROMOTION_COST_EXCEEDS_BUDGET` inchangé ; migrations / stash / aucun commit

## 2026-07-21 — Lot 2A-H2D-1 rétroactivité configurable

### Objectif

Rendre le début de période d’effet configurable (`retroactivityStartMonth`),
passer le contrat de calcul à **v3**, propager la vue / labels / tests, et
bloquer la persistance schema v2 pour les résultats contrat 3.

### Livrables

- Moteur : période `[rétro … décembre]`, `outside_campaign`, `fullYearRunRate*`
- Vue : `buildSimulationResultView` + labels « Enveloppe de la période d’effet »,
  « Coût effectif de campagne », « Hors période », « Delta de période »
- Tests : `configurableRetroactivity.test.ts` + alignement contrat v3
- Docs : CALCULATION_CONTRACT / BUSINESS_RULES / CAMPAIGN_SIMULATION /
  DATA_DICTIONARY / SIMULATION_PERSISTENCE
- Migrations 0001–0006 et stash inchangés ; aucun commit

### Limites

- `RESULT_SCHEMA_VERSION = 2` : sauvegarde snapshot refusée pour contrat 3
  jusqu’à consolidation schema v3 (lot ultérieur).

## 2026-07-21 — Audit non-régression H2D-1 (recette 5 000 023)

### Constat (CAS B)

La fixture Population Test 1 (14 éligibles + 1 sous-performant, mode `none`,
budget manuel 5 000 023, pas 5, rétro janvier) produit **sur tous les moteurs
mesurés** :

| Moteur | Coût réel | Delta |
|---|---|---|
| e985548 (H1 pré-H2C-2) | 5 000 040 | +17 |
| 21dbbb6 (H2C) | 5 000 040 | +17 |
| H2D-1 rétro=1 / omis | 5 000 040 | +17 |

EMP-2002 mensuel arrondi mesuré : **30 205** FCFA (×12 = 362 460).

Le brief H2D-1 citant 4 999 860 / −163 et EMP-2002 = 31 110 **n’est pas
reproductible** avec cette fixture. `31 110` reste un montant **illustratif**
des tests unitaires H2A/H2B (rappel / ancienneté), pas le résultat de
Population Test 1. Aucune régression moteur H2D-1 ni H2C détectée sur cette
recette ; tests renforcés sur les valeurs mesurées.
## 2026-07-21 — Lot 2A-H2D-2 minimum garanti d'augmentation

### Objectif

Ajouter un minimum garanti d'augmentation optionnel (modes exclusifs),
passer le contrat de calcul a **v4**, reserver les planchers avant
allocation du reliquat, et exposer config / resultats / erreurs.

### Livrables

- Domaine : minimumIncrease.ts, minimumIncreasePopulation.ts, planchers
  sur expositions, solveur floor-aware, agregats periode / rappel / plein effet
- Config / UI : section minimum, fingerprints minMode/minAmt/minRate
- Erreur dediee MINIMUM_GUARANTEE_EXCEEDS_BUDGET
- Tests : minimumIncreaseGuarantee.test.ts + alignement contrat v4
- Docs : BUSINESS_RULES / CALCULATION_CONTRACT / CAMPAIGN_SIMULATION /
  DATA_DICTIONARY / SIMULATION_PERSISTENCE
- Migrations 0001-0006 et stash inchanges ; aucun commit

## 2026-07-21 — Lot 2B-P1 consolidation snapshot schema v3

### Objectif

Persister fidèlement le résultat du contrat de calcul **v4** (rétroactivité
configurable, incidence d'ancienneté, minimum garanti, trajectoire mensuelle)
en **append-only**, **sans recalcul**, et débloquer l'enregistrement des
simulations contrat ≥ 3 refusées jusqu'ici.

### Livrables

- Migration `0007_simulation_contract_v4_results.sql` (uniquement) :
  - `ALTER compensation_simulation_runs` : configuration contrat v4, enveloppe
    promotion-aware, agrégats rappel/direct, ancienneté, plein effet
    (colonnes NULL pour les anciens snapshots)
  - `ALTER compensation_simulation_employee_results` : identité promotion,
    minimum garanti, ancienneté, calendrier, plein effet
  - Nouvelle table `compensation_simulation_employee_month_results`
    (trajectoire mensuelle 1–12, FK `ON DELETE CASCADE`,
    `UNIQUE(employee_result_id, month)`, index de lecture, aucun `REAL`)
- Audit legacy : réutilisation documentée des colonnes 0005
  (`budget_target_*`, `theoretical_total_*`, `actual_operation_amount_fcfa_text`,
  `total_rounding_delta_*`, `campaign_year`) sans réinterprétation ; alias
  `annual*` côté TS restent transitionnels et mappés vers ces colonnes
- TS : `RESULT_SCHEMA_VERSION = 3` (+ `RESULT_SCHEMA_VERSION_V2 = 2`) ;
  DTO run/employee/**month** étendus ; `mapExecutionResultToSaveDto` mappe les
  12 mois sans recalcul ; `assertSimulationResultPersistable` autorise
  contrat 4 + schema 3 et refuse contrat ≥ 3 && schema < 3 ;
  `resultSchemaCompatibility` : v3 courant / v2 incomplet / v1 incompatible /
  inconnu refusé ; memory + sqlite repos + mappers lisent les mois (copie
  défensive, ordre jan→déc)
- Rust : `MIGRATION_0007` enregistrée (`persistence.rs` + `lib.rs`) ;
  `simulation_persistence.rs` étendu (DTO miroir, validations run/employee/mois,
  INSERT run `result_schema_version = 3` + salariés + 12 mois, vérification
  `month_count = employee_count × 12`, transaction unique + rollback + faute
  `AfterMonth`)
- Tests : `simulationPersistenceSchemaV3.test.ts` + extensions
  (mapExecutionResultToSaveDto, memory repo, resultSchemaCompatibility) ;
  nouveaux tests Rust (v3 + 12 mois, all-or-nothing, plage mois, rollback mois)
- Docs : ARCHITECTURE / DATABASE_SCHEMA / CALCULATION_CONTRACT /
  CAMPAIGN_SIMULATION / DATA_DICTIONARY / SIMULATION_PERSISTENCE / DEVELOPMENT_LOG

### Validations

- `pnpm test` (414) / `pnpm build` : OK
- `cargo fmt --check` / `cargo check --locked` / `cargo test --locked` (47) : OK
- `git diff --check` propre ; `git diff -- migrations 0001..0006` vide
- stash `wip/lot-2b-4b-before-annual-budget-fix` intact ; aucun commit

## 2026-07-21 — Lot 2B-4B : enregistrement UI et historique (schema v3)

### Objectif

Greffer l’enregistrement explicite depuis la page Simulation et la consultation
en lecture seule de l’historique SQLite par campagne, en réconciliant l’UI issue
du stash `wip/lot-2b-4b-before-annual-budget-fix` avec le moteur / schema v3
(contrat v4) livré à HEAD.

### Livrables

- `SimulationSaveActions` greffée dans `SimulationResultsPanel`
  (visible hors résultat obsolète et hors lecture seule ; métriques H2A–H2D
  intactes).
- `SimulationSaveProvider`, `AppNavigationProvider`,
  `SimulationHistoryRefreshProvider` déjà câblés dans `App.tsx` ; navigation
  `simulation-history` branchée dans l’`AppShell`.
- Vue partagée `SimulationResultViewModel` étendue schema v3 (période d’effet,
  promotions, minimum garanti, au-dessus du minimum, combiné, delta, plein
  effet, trajectoire mensuelle) avec `ResultSchemaCompatibility` ; dégradation
  explicite pour v1 (incompatible) / v2 (incomplète) — aucun faux zéro, aucun
  détail mensuel inventé.
- `getPersistedSimulationRun` branché sur `classifyResultSchemaVersion`
  (unknown ⇒ échec explicite ; v1/v2 ⇒ ok + drapeaux + message ; v3 ⇒ vue
  complète).
- `buildSimulationResultIdentity` documentée (empreintes source/config encodant
  rétro/tech/minimum) et enrichie de champs de configuration validée optionnels.
- `PersistedSimulationRunSummary` étendue de champs v3 optionnels (NULL pour
  v1/v2), alignée memory repo + mappers SQLite **en lecture seule** (aucune
  migration).
- Historique n’utilise pas l’import RH courant pour reconstruire une simulation.
- Tests : `buildSimulationResultIdentity`, `simulationHistoryServices`,
  `simulationSaveAndHistory`.

### Validations

- `pnpm test` / `pnpm build`
- `cargo fmt --check` / `cargo check --locked` / `cargo test --locked`
- `git diff --check` ; migrations 0001–0007 inchangées ; stash intact ; aucun
  commit

## 2026-07-22 — Lot 2B-UX1 — confort de visualisation des résultats

### Objectif

Améliorer uniquement l’UI de consultation : sidebar réellement repliable,
pages Simulation / Historique en largeur fluide, détail salarié quasi plein
écran, densification du tableau de trajectoire mensuelle. Aucun changement
métier (moteur, contrats, DTO, migrations).

### Choix

- Réutilisation de l’état `sidebarCollapsed` déjà présent dans `AppShell`.
- `main-content--fluid` uniquement pour `simulations` et `simulation-history`.
- Drawer partagé et panneau courant : `simulation-drawer--max` (~96 vw).
- Intitulés de colonnes compactés avec `title` pour les libellés complets.
- Tests structurels jsdom (`resultsLayoutUx.test.tsx`) — pas de mesure pixel.

### Recette manuelle

**A. Sidebar** — Simulation → réduire → vérifier élargissement du tableau →
Historique (sidebar reste réduite) → redéployer.

**B. Résultat courant** — lancer une simulation → ouvrir un salarié → largeur
quasi plein écran → colonnes trajectoire → Échap.

**C. Historique** — ouvrir un run → salarié → même largeur → 12 mois → Fermer.

**D. Responsive** — réduire la fenêtre → pas de débordement de page ; scroll
éventuel local au tableau.

### Validations

- `pnpm test` / `pnpm build`
- `cargo fmt --check` / `cargo check --locked` / `cargo test --locked`
- `git diff --check` ; migrations / domaine calcul / DTO save inchangés ; aucun
  commit

## 2026-07-22 — Lot 2B-E1 : frontend export Excel RH

### Objectif

Exposer, depuis l’historique des simulations, un export Excel RH d’un snapshot
persisté v3, avec protection par mot de passe optionnelle, en s’appuyant sur les
commandes Tauri `export_simulation_run_excel` et `generate_hr_export_password`
déjà présentes côté Rust. Aucun changement de moteur, DTO, contrat ou migration.

### Choix

- Couche applicative dédiée (`hrExcelExport*`, `generateHrExportPassword`,
  `exportSimulationRunExcel`) : fonctions pures appelant `invoke`/`save`
  directement, mockées dans les tests jsdom.
- Nom de fichier suggéré construit côté frontend en miroir de la sanitisation
  Windows Rust (`JRB_Compensation_<Campagne>_Run_<Numero>_<Date>.xlsx`).
- Dialogue modal centré réutilisant les couleurs de la charte (`.app-modal`),
  distinct du drawer latéral existant.
- Export réservé aux snapshots v3 via `canPresentResultSchemaVersion` ; v1/v2/
  inconnu désactivés avec infobulle et texte lecteur d’écran.
- Défense en profondeur sur le mot de passe : jamais journalisé, jamais conservé
  après fermeture, message générique si une chaîne d’erreur le contenait.
- Sélection de destination via `@tauri-apps/plugin-dialog` (déjà déclaré) ;
  annulation = fermeture silencieuse sans erreur.

### Fichiers

- `src/application/campaignSimulation/hrExcelExportModels.ts`
- `src/application/campaignSimulation/hrExcelExportErrorMessages.ts`
- `src/application/campaignSimulation/generateHrExportPassword.ts`
- `src/application/campaignSimulation/exportSimulationRunExcel.ts`
- `src/pages/simulation/SimulationExcelExportDialog.tsx`
- `src/pages/SimulationHistoryPage.tsx` (colonne « Actions », bouton export,
  flux d’export, région aria-live)
- `src/styles/global.css` (`.app-modal*`, `.sr-only`, `.field--checkbox`,
  `.history-row-actions`, `.form-feedback--warning`)
- `src/application/campaignSimulation/index.ts` (exports)
- `src/tests/hrExcelExport.test.tsx`
- `docs/HR_EXCEL_EXPORT.md` (+ mises à jour ARCHITECTURE / CAMPAIGN_SIMULATION /
  DATABASE_SCHEMA)

### Recette manuelle

**A. Disponibilité** — Historique → sélectionner une campagne → un run v3 affiche
un bouton **Export Excel** actif ; un run v2/v1 l’affiche désactivé avec
infobulle.

**B. Protection** — Cliquer Export → mot de passe coché par défaut → **Générer un
mot de passe** → Afficher/Masquer → Exporter → choisir la destination → message
de succès (aria-live), dialogue fermé.

**C. Non protégé** — Décocher la protection → avertissement → cocher la
confirmation → Exporter.

**D. Annulation** — Ouvrir Export → Exporter → annuler le sélecteur de fichier →
aucune erreur, dialogue fermé.

**E. Sécurité** — Vérifier qu’aucun mot de passe n’apparaît dans les journaux ni
dans un message d’erreur.

### Validations

- `pnpm exec tsc --noEmit`
- `pnpm test` (478 tests, dont `hrExcelExport.test.tsx`)
- `git diff --check` ; `mapExecutionResultToSaveDto.ts` /
  `simulationPersistenceModels.ts` / migrations / moteur inchangés ; aucun commit

## 2026-07-22 — Lot 2B-E1-R1 : correction métier et présentation export RH

### Objectif

Corriger rapidement la présentation RH de l’export Excel déjà validé
techniquement (E1) : taux lisibles en pourcentage, libellés de période,
feuille `Tableau_de_bord_RH`, statistiques et histogramme — sans toucher
import, migrations, contrats, moteur, DTO ni snapshot.

### Choix

- Nouveau module `rates.rs` : fractions exactes (`i128`), stats min/max/moyenne/
  médiane, bornes des 7 tranches ; conversion `f64` uniquement à l’écriture.
- Taux total d’augmentation de base =
  (promotion mensuelle + complément mensuel) / salaire décembre N-1 ;
  **ancienneté exclue** des statistiques principales.
- Colonnes num/den déplacées en fin de feuille (audit) ; colonnes RH principales
  en pourcentages.
- Cinq feuilles dans l’ordre :
  `Tableau_de_bord_RH`, `Resultats_RH`, `Trajectoire_12_mois`,
  `Synthese_campagne`, `Parametres`.
- Graphique colonnes obligatoire sur la distribution ; doughnut P2 de répartition
  des coûts lorsque les agrégats de période sont présents.
- Libellés « annuel » incorrects remplacés par « sur la période » ; doublon
  synthèse réduit à « Coût compensatoire sur la période ».
- Import actuel **conservé** ; enrichissement d’import reporté.

### Fichiers

- `src-tauri/src/simulation_excel_export/rates.rs` (nouveau)
- `src-tauri/src/simulation_excel_export/models.rs` (lecture élargie snapshot)
- `src-tauri/src/simulation_excel_export/workbook.rs` (présentation + dashboard)
- `src-tauri/src/simulation_excel_export/tests.rs` / `mod.rs`
- `docs/HR_EXCEL_EXPORT.md`, `docs/DEVELOPMENT_LOG.md`

### Validations

- `pnpm test` / `pnpm build`
- `cargo fmt --check` / `cargo check --locked` / `cargo test --locked`
- `git diff --check` ; migrations / domaine calcul / DTO save inchangés ;
  aucun commit

## 2026-07-22 — Lot 2B-RC1-PKG : métadonnées package pré-recette 0.9.0

### Objectif

Aligner les versions applicatives sur **0.9.0** et documenter la livraison
pré-recette `0.9.0-prerecette-1`, sans changement fonctionnel.

### Choix

- Versions synchronisées : `package.json`, `Cargo.toml` / `Cargo.lock`,
  `tauri.conf.json`.
- Bundle Windows limité à `msi` + `nsis` ; publisher `JRB XSolutions`.
- Identifiant inchangé : `com.jrbxsolutions.compensationstudio`.
- WebView2 : stratégie par défaut Tauri conservée (pas de runtime offline).
- Note de livraison : `docs/releases/0.9.0-prerecette-1.md`.

### Validations

- `pnpm test` / `pnpm build` / `cargo fmt --check` / `cargo check` /
  `cargo test` (+ `--locked` après mise à jour du lock)
- Zones métier (moteur, import, snapshot, export Excel) inchangées ; aucun
  commit / tag / push
