# Architecture

## Vue d’ensemble

JRB Compensation Studio est une application Windows monoposte construite avec
Tauri 2. Tauri fournit la fenêtre native et le packaging ; React rend
l’interface ; TypeScript sécurise les contrats du front. Le plugin officiel
`tauri-plugin-sql` (feature `sqlite`) assure la persistance locale.

L’application est conçue hors ligne. En production, le contenu web est embarqué
dans l’exécutable : il n’existe ni serveur applicatif, ni API distante, ni
télémétrie. Le serveur Vite local est exclusivement un outil de développement.

## Organisation du code

- `src/app` assemble l’application, le provider de données et l’état global.
- `src/components/layout` contient le cadre visuel partagé.
- `src/components/navigation` définit et rend la navigation.
- `src/components/ui` contient les composants de présentation réutilisables.
- `src/config` conserve les valeurs initiales de référence (identité client).
- `src/pages` compose les écrans fonctionnels.
- `src/domain` expose les modèles métier purs, dont
  `src/domain/compensationReference` (Lot 1B + orientation 9-Box Lot 2A-1),
  `src/domain/compensationCalculation` (Lots 2A-2 à 2A-4 — moteur pur) et
  `src/domain/hrImport` (Lot 1C).
- `src/application` orchestre les cas d’usage multi-services sans UI, notamment
  `campaignSimulation` (Lot 2B-1 — readiness de simulation).
- `src/services` orchestre validations et cas d’usage, sans dépendre de React,
  notamment `compensationReferenceService`, `campaignService` et
  `hrImportService`.
- `src/infrastructure/database` gère la connexion SQLite, les mappers et les
  repositories (SQLite et mémoire pour les tests).
- `src/tests` contient les tests du front.
- `src-tauri` contient l’hôte natif, les migrations SQL et les capacités.
  Les écritures multi-statements critiques (import RH, archivage campagne)
  passent par des commandes Rust à connexion SQLite dédiée.

Cette séparation vise une dépendance orientée vers le domaine : l’interface et
l’infrastructure peuvent utiliser les contrats métier, tandis que le domaine
ne dépend ni de React, ni de Tauri, ni de SQLite.

## Couche référentiels de rémunération (Lot 1B)

Le Lot 1B ajoute la persistance des paramètres de rémunération par campagne,
sans moteur de calcul ni données salariés.

- **Domaine** (`src/domain/compensationReference`) : modèles (`NineBoxMode`,
  `JobFamily`, `Grade`, `SalaryGridCell`, `SalaryPosition`, facteurs Performance /
  Potentiel / 9-Box), valeurs par défaut, conversions bps/milli, validation et
  calcul de complétude (`ReferenceCompleteness`).
- **Repositories** : contrat `CompensationReferenceRepository` avec implémentations
  SQLite (`sqliteCompensationReferenceRepository`) et mémoire
  (`memoryCompensationReferenceRepository`). L’initialisation idempotente d’une
  campagne est centralisée dans `seedCampaignReferences.ts`.
- **Services** : `CompensationReferenceService` orchestre lectures, mises à jour
  et contrôles métier ; `CampaignService` déclenche l’initialisation du
  référentiel à la création d’une campagne.
- **Provider React** : `CompensationReferenceProvider` expose l’état du
  référentiel sélectionné, la complétude de la campagne active et les actions
  de mise à jour à la page Référentiels et au bandeau de contexte campagne.

Voir `docs/COMPENSATION_REFERENCES.md` pour le périmètre fonctionnel détaillé.

## Couche moteur de calcul (Lots 2A-2 / 2A-3)

Module pur `src/domain/compensationCalculation/` : aucune dépendance React,
SQLite, Tauri, navigateur, filesystem, date courante, locale ou réseau.

**Lot 2A-2 — individuel**

- `resolveSalaryPosition` — classement Salaire/S0 → position + facteur ;
- `resolveEvaluationFactor` — facteur selon le mode de campagne ;
- `calculateIndividualMatrixWeight` — poids composite exact + trace.

**Lot 2A-3 — population / budget**

- `exactFraction` — rationnels BigInt (PGCD, +, −, ×, ÷, compare, arrondi pas) ;
- `resolveBudgetTarget` — budget manuel ou % d’assiette (sans arrondi) ;
- `allocateTheoreticalPopulationBudget` — parts exactes au prorata des poids ;
- `roundPopulationAllocations` — arrondi individuel paramétrable ;
- `calculatePopulationBudgetAllocation` — orchestrateur budget optionnel.

**Lot 2A-4 — orchestrateur end-to-end**

- `resolveEmployeeS0` — lookup S0 par famille/grade ;
- `validatePreparedPopulationCalculationInput` ;
- `calculatePreparedEmployeeCompensation` ;
- `calculatePreparedPopulationCompensation` — assemble 2A-2 + 2A-3 + H1 ;
- convention `allocationWeight = monthlySalary × effectiveMatrixWeight` ;
- correctif **2A-H1** : budget annuel, allocation annuelle, ÷12, arrondi
  mensuel, coût annuel = mensuel × 12 (`CALCULATION_CONTRACT_VERSION = 2`).

Erreurs typées `CompensationCalculationError` (codes stables). Pas de
duplication Rust, ni UI, ni persistance, ni commande Tauri.

Voir `docs/CALCULATION_CONTRACT.md` et `docs/BUSINESS_RULES.md`.

## Couche préparation de simulation (Lot 2B-1)

Module applicatif `src/application/campaignSimulation/` : pont entre campagne,
population RH courante, référentiels persistés et contrats d’entrée du moteur
2A-4, **sans** exécuter le calcul d’allocation.

- `buildCampaignSimulationReadiness` — charge campagne / lot courant /
  population / référentiels via ports injectés ; produit
  `CampaignSimulationReadinessReport` ;
- `mapImportedEmployeeToPreparedInput` — mapping déterministe
  `EmployeeSnapshot` → `PreparedEmployeeCalculationInput` ;
- `buildPopulationCalculationReferences` — projection des référentiels campagne
  vers `PopulationCalculationReferences` (orientation 9-Box exclue du moteur) ;
- normalisation explicite des niveaux Performance/Potentiel (`low` / `medium` /
  `high`).

Pas de dépendance React, SQLite directe, Tauri, date système ni locale.
Aucune migration, UI ou commande Tauri dans ce sous-lot.

Voir `docs/CAMPAIGN_SIMULATION.md`.

## Couche configuration UI de simulation (Lot 2B-2)

- **Page** `SimulationPage` (navigation « Simulation »).
- **Provider** `SimulationConfigurationProvider` : brouillons et snapshots
  validés **en mémoire de session**, isolés par `campaignId`, sans persistance.
- Parsing exact (`parseNonNegativeFcfaAmount`, `parseBudgetRatePercentToBps`,
  `parseRoundingStepFcfa`) et aperçu budget via `resolveBudgetTarget` +
  `formatExactAmountAsFcfa`.
- Réutilise `buildCampaignSimulationReadiness` ; n’appelle pas le moteur
  d’allocation.

## Couche exécution de simulation (Lot 2B-3)

- **Service** `executeCampaignSimulation` : recharge sources, vérifie empreintes,
  appelle **une fois** `calculatePreparedPopulationCompensation`, construit une
  vue consultable — **aucune persistance**.
- **Fingerprint** `buildSimulationSourceFingerprint` (sources + config).
- **Provider** `SimulationExecutionProvider` : état / résultat / issues par
  `campaignId`, `runSequence` de session, invalidation stale.
- **UI** : synthèse, tableau (recherche / pagination), drawer de détail
  quasi plein écran (Lot **2B-UX1**) ; pages Simulation / Historique en largeur
  fluide ; barre latérale repliable (état session dans `AppShell`).
- Formatage exact : `formatFcfaInteger`, `formatExactAmountAsFcfa`,
  `formatExactRateAsPercent`, `formatFactorMilli`, `formatExactWeight`.

## Couche persistance de simulation (Lots 2B-4A + 2B-P1)

- Migrations `0005_campaign_simulations.sql` puis
  `0007_simulation_contract_v4_results.sql` (consolidation schema v3 : colonnes
  contrat v4 + table `compensation_simulation_employee_month_results`),
  `0008_nine_box_neutralization.sql` (schema v4 / contrat v5 : colonnes
  `neutralize_nine_box_effect`, `source_nine_box_code`,
  `nine_box_treatment_kind` + compteur run),
  `0009_nine_box_confirmation_factor.sql` (schema v5 / contrat v6 :
  coefficient provisoire `nine_box_confirmation_factor_milli` sur
  `campaign_reference_config` et sur le run de simulation ; Lot 2B-RC1-H2).
- Commande Rust `save_simulation_run` (transaction SQLx dédiée) : écrit le run
  (`result_schema_version = 3`), les salariés et **12 mois** par salarié en une
  seule transaction, sans recalcul.
- Service `saveCurrentCampaignSimulation` + DTO chaînes canoniques (run /
  salarié / mensuel).
- `SimulationHistoryRepository` (memory / sqlite) — lecture paginée et
  mensuelle.
- **2B-4B** : `SimulationSaveProvider`, `AppNavigationProvider`,
  `SimulationHistoryRefreshProvider`, `SimulationHistoryPage` et composants
  partagés courant / historique (`SimulationSummaryPanel`,
  `SimulationEmployeeTable`, `SimulationEmployeeDetailDrawer`) — enregistrement
  explicite et consultation en lecture seule, compatibles schema v3 (période
  configurable, promotions, minimum garanti, ancienneté, trajectoire mensuelle)
  avec dégradation explicite pour les snapshots v1/v2.
- Voir `docs/SIMULATION_PERSISTENCE.md`.

Voir `docs/CAMPAIGN_SIMULATION.md`.

## Couche export Excel RH (Lot 2B-E1)

- Module Rust `src-tauri/src/simulation_excel_export/` : chargement du snapshot
  v3, génération du classeur XLSX (4 feuilles), chiffrement agile optionnel,
  écriture atomique, génération / validation du mot de passe. Aucun recalcul.
- Commandes `export_simulation_run_excel` (entrée camelCase, résultat structuré,
  erreurs FR sans détail sensible) et `generate_hr_export_password`.
- Frontend `src/application/campaignSimulation/hrExcelExport*`,
  `exportSimulationRunExcel`, `generateHrExportPassword` : fonctions pures
  invoquant `invoke` / `save`, testées avec mocks jsdom.
- UI : `SimulationExcelExportDialog` + intégration dans `SimulationHistoryPage`
  (export réservé aux snapshots v3, protection mot de passe par défaut, export
  non protégé confirmé explicitement). Le mot de passe n’est jamais journalisé
  ni conservé après fermeture du dialogue.
- Voir `docs/HR_EXCEL_EXPORT.md`.

## Couche import RH (Lot 1C)

Le Lot 1C ajoute l’import local de population par campagne, sans moteur de
calcul ni conservation du fichier source.

- **Domaine** (`src/domain/hrImport`) : modèles de lot (`HrImportBatch`,
  statuts `current` / `superseded`), colonnes obligatoires et optionnelles,
  types contrat et statut d’emploi, mapping, prévisualisation, population
  paginée.
- **Infrastructure imports** (`src/infrastructure/imports`) : parseur
  classeur/CSV via SheetJS (`spreadsheetParser`), détection d’en-tête, alias de
  colonnes, mapping automatique, normalisation des lignes et lecteurs de cellules
  (dates ISO, FCFA entiers, formules refusées). Lecture via `ArrayBuffer` depuis
  l’input fichier HTML, sans permission Tauri filesystem.
- **Repositories** : contrat `HrImportRepository` avec implémentations SQLite
  (`sqliteHrImportRepository`) et mémoire (`memoryHrImportRepository`). Le
  remplacement de population s’effectue en transaction `BEGIN IMMEDIATE`
  (bascule `current` → `superseded`, insertion du nouveau lot).
- **Services** : `HrImportService` orchestre analyse, prévisualisation sans
  écriture et confirmation atomique (refus si erreur ou mapping invalide).
- **Provider React** : `HrImportProvider` expose l’assistant d’import, la
  population courante paginée et l’historique des lots à la page Import et au
  bandeau de contexte campagne.

Voir `docs/HR_IMPORT.md` pour le périmètre fonctionnel détaillé.

## Persistance SQLite

- Chaîne unique : `sqlite:jrb-compensation-studio.db`
- Fichier hors dépôt, dans le répertoire applicatif Tauri (AppConfig)
- Migrations versionnées dans `src-tauri/migrations/`
- Repositories injectables pour basculer vers des doubles en mémoire en test
- Requêtes exclusivement paramétrées
- Voir `docs/DATABASE_SCHEMA.md`

## Réseau et capacités Tauri

Aucune fonction produit ne nécessite le réseau. Permissions actuelles :

- `core:default`
- `sql:default`
- `sql:allow-execute`
- `allow-save-simulation-run`
- `allow-export-simulation-run-excel`
- `dialog:allow-save`

`dialog:allow-save` est la seule capacité de dialogue déclarée : elle ouvre le
sélecteur natif de destination `.xlsx` pour l’export RH (aucune ouverture ni
lecture de fichier). Aucune permission HTTP, shell, opener, filesystem
(lecture/écriture arbitraire), upload, updater ou websocket n’est déclarée.

Le schéma distant référencé dans `tauri.conf.json` sert uniquement à l’aide de
validation des outils ; il n’est pas chargé par l’application exécutée. La CSP
reste restrictive (`default-src 'self'`).

## Stratégie de tests

- Tests unitaires des services (validations et transitions de statut).
- Tests de composants avec repositories mémoire (sans runtime Tauri).
- Tests Rust sur la chaîne de connexion et la présence des migrations.
- Jeux de données exclusivement synthétiques dans `test-data/fixtures`.
- Build web et bundle Windows vérifiés avant livraison.

## Personnalisation client

Le profil organisation est persisté dans `organization_profile`. Les valeurs
par défaut restent disponibles dans `src/config/branding.ts` comme référence
de seed, alignée sur la migration SQL. Les paramètres de marque restent
distincts des règles métier.

## Décisions à venir

- Protection des données et sauvegardes.
- Export Excel et scénarios de calcul.
- Représentation exacte des montants et conventions d’arrondi au-delà de
  l’import (arrondi final matriciel).
- Extension éventuelle du modèle salarié (résultats calculés, décisions RH
  tracées).
