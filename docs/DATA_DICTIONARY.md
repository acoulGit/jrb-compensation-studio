# Dictionnaire de données initial

## Conventions

- Les noms techniques de domaine sont en anglais et en `camelCase`.
- Les colonnes SQLite sont en `snake_case`.
- Les montants monétaires futurs sont exprimés en FCFA. Le stockage devra
  éviter les nombres flottants pour les montants.
- **Basis points (`*_bps`)** : entiers ; `10000` = 100,00 %, `6500` = 65,00 %.
  Utilisés pour les ratios de position (`reference_ratio_bps`). `NULL` pour
  Sout- et Sout+ (bornes hors plage fixe).
- **Millièmes (`*_milli`)** : entiers ; `1000` = 1,000. Plage autorisée 0 à
  10 000 (soit 0 à 10 inclus). Utilisés pour les coefficients de position et
  de 9-Box. Aucun type `REAL` pour ces paramètres.
- **Échelles moteur Lot 2A-2** : facteur d’évaluation sur **1 000 000** ;
  poids individuel sur **1 000 000 000** (`positionFactorMilli ×
  evaluationFactorScaled`). Calculs en entiers / `BigInt`, sans flottants.
- **Montants rationnels Lot 2A-3** : `ExactAmount { numerator, denominator }`
  (fraction réduite, dénominateur > 0). Budget cible, parts théoriques et
  écarts d’arrondi restent exacts jusqu’à l’arrondi individuel final.
- **Basis points budget** : `10000` = 100,00 % du taux de budget cible.
- **Ratio affiché** : basis points entiers (half-up), présentation à deux
  décimales ; distinct du ratio rationnel exact utilisé pour classer.
- Les dates métier utilisent le format ISO `YYYY-MM-DD`.
- Les horodatages de persistance utilisent l’UTC ISO-8601 complet.
- Les valeurs importées restent distinguées des paramètres, résultats calculés
  et décisions RH.

## Paramètres locaux persistés (Lot 1A)

### OrganizationProfile

| Champ domaine | Colonne SQLite | Nature |
| --- | --- | --- |
| `productName` | `product_name` | Paramètre local |
| `organizationName` | `organization_name` | Paramètre local |
| `organizationShortName` | `organization_short_name` | Paramètre local |
| `applicationSubtitle` | `application_subtitle` | Paramètre local |
| `reportFooter` | `report_footer` | Paramètre local |
| `createdAt` | `created_at` | Technique |
| `updatedAt` | `updated_at` | Technique |

### Campaign

| Champ domaine | Colonne SQLite | Nature |
| --- | --- | --- |
| `id` | `id` | Technique |
| `name` | `name` | Paramètre de campagne |
| `referenceYear` | `reference_year` | Paramètre de campagne |
| `status` | `status` | Décision de cycle (`draft` / `active` / `archived`) |
| `notes` | `notes` | Annotation locale |
| `createdAt` | `created_at` | Technique |
| `updatedAt` | `updated_at` | Technique |
| `archivedAt` | `archived_at` | Technique / suppression logique |

## Paramètres de référentiel par campagne (Lot 1B)

Persistés dans les tables `campaign_reference_*`. Voir
`docs/COMPENSATION_REFERENCES.md` pour le périmètre fonctionnel.

### NineBoxMode

| Champ domaine | Colonne SQLite | Nature |
| --- | --- | --- |
| — | `nine_box_mode` (`campaign_reference_config`) | Paramètre de campagne |
| — | `nine_box_orientation` (`campaign_reference_config`) | Présentation matrice (Lot 2A-1) |

Valeurs mode : `none`, `performance_only`, `full_nine_box`, `performance_potential`.
Valeurs orientation : `performance_rows_potential_columns` (défaut Orange),
`performance_columns_potential_rows`.

### JobFamily

| Champ domaine | Colonne SQLite | Nature |
| --- | --- | --- |
| `id` | `id` | Technique |
| `campaignId` | `campaign_id` | Rattachement campagne |
| `code` | `code` | Paramètre de référentiel |
| `label` | `label` | Paramètre de référentiel |
| `sortOrder` | `sort_order` | Ordre d’affichage (1–5) |
| `createdAt` | `created_at` | Technique |
| `updatedAt` | `updated_at` | Technique |

### Grade

| Champ domaine | Colonne SQLite | Nature |
| --- | --- | --- |
| `id` | `id` | Technique |
| `campaignId` | `campaign_id` | Rattachement campagne |
| `code` | `code` | Paramètre de référentiel |
| `label` | `label` | Paramètre de référentiel |
| `sortOrder` | `sort_order` | Ordre d’affichage (1–6) |
| `createdAt` | `created_at` | Technique |
| `updatedAt` | `updated_at` | Technique |

### SalaryGridCell

| Champ domaine | Colonne SQLite | Nature |
| --- | --- | --- |
| `campaignId` | `campaign_id` | Rattachement campagne |
| `jobFamilyId` | `job_family_id` | Clé étrangère structure |
| `gradeId` | `grade_id` | Clé étrangère structure |
| `s0Amount` | `s0_amount` | Médiane mensuelle S0 (FCFA entier ou `null`) |
| `createdAt` | `created_at` | Technique |
| `updatedAt` | `updated_at` | Technique |

### SalaryPosition

| Champ domaine | Colonne SQLite | Nature |
| --- | --- | --- |
| `id` | `id` | Technique |
| `campaignId` | `campaign_id` | Rattachement campagne |
| `code` | `code` | Paramètre de référentiel (ex. `S0`, `S7-`) |
| `label` | `label` | Libellé d’affichage |
| `sortOrder` | `sort_order` | Ordre d’affichage (1–17) |
| `referenceRatioBps` | `reference_ratio_bps` | Ratio fixe en bps (`null` pour Sout- / Sout+) |
| `positionFactorMilli` | `position_factor_milli` | Coefficient reparamétrable en milli |
| `createdAt` | `created_at` | Technique |
| `updatedAt` | `updated_at` | Technique |

### PerformanceFactor / PotentialFactor

| Champ domaine | Colonne SQLite | Nature |
| --- | --- | --- |
| `campaignId` | `campaign_id` | Rattachement campagne |
| `level` | `level` | Niveau (`low` / `medium` / `high`) |
| `label` | `label` | Libellé d’affichage |
| `sortOrder` | `sort_order` | Ordre d’affichage |
| `factorMilli` | `factor_milli` | Coefficient reparamétrable en milli |
| `createdAt` | `created_at` | Technique |
| `updatedAt` | `updated_at` | Technique |

Tables : `campaign_performance_factors`, `campaign_potential_factors`.

### NineBoxFactor

| Champ domaine | Colonne SQLite | Nature |
| --- | --- | --- |
| `campaignId` | `campaign_id` | Rattachement campagne |
| `boxCode` | `box_code` | Numéro de case historique / visuel (1–9), **pas** la clé moteur |
| `performanceLevel` | `performance_level` | Clé sémantique performance |
| `potentialLevel` | `potential_level` | Clé sémantique potentiel |
| `factorMilli` | `factor_milli` | Coefficient reparamétrable en milli |
| `createdAt` | `created_at` | Technique |
| `updatedAt` | `updated_at` | Technique |

Table : `campaign_nine_box_factors`. Lookup métier : `getNineBoxFactor(factors, performance, potential)`.

### ReferenceCompleteness

Objet calculé côté domaine (`computeReferenceCompleteness`), non persisté.
Indique si le référentiel est **Prêt** ou **À compléter** (structure, grille
S0 30/30, positions, exigences du mode 9-Box sélectionné).

| Champ domaine | Nature |
| --- | --- |
| `ready` | Booléen synthétique |
| `badge` | `"Prêt"` ou `"À compléter"` |
| `completedSections` / `totalSections` / `percent` | Progression agrégée |
| `structureComplete` | Familles et grades valides |
| `salaryGridComplete` / `salaryGridFilledCount` / `salaryGridTotal` | Grille S0 |
| `positionsComplete` | Coefficients de position valides |
| `performanceStatus` / `potentialStatus` / `nineBoxStatus` | Sections selon le mode |
| `nineBoxMode` | Mode actif évalué |
| `issues` | Liste de codes et messages de validation |

## Données importées — population RH (Lot 1C)

Persistées dans `hr_import_batches` (métadonnées de lot) et
`hr_import_employees` (lignes salariés). Voir `docs/HR_IMPORT.md` pour le
périmètre fonctionnel et les règles de validation.

### HrImportBatch

| Champ domaine | Colonne SQLite | Nature |
| --- | --- | --- |
| `id` | `id` | Technique |
| `campaignId` | `campaign_id` | Rattachement campagne |
| `status` | `status` | `current` ou `superseded` |
| `sourceFileName` | `source_file_name` | Métadonnée source (nom fichier) |
| `sourceFormat` | `source_format` | `xlsx` / `xls` / `csv` |
| `sourceSheetName` | `source_sheet_name` | Feuille importée ou `null` (CSV) |
| `fileSizeBytes` | `file_size_bytes` | Taille fichier lue à l’import |
| `sourceRowCount` | `source_row_count` | Lignes de données analysées |
| `importedRowCount` | `imported_row_count` | Lignes salariés persistées |
| `warningCount` | `warning_count` | Avertissements au moment de l’import |
| `importedAt` | `imported_at` | Horodatage confirmation |
| `createdAt` | `created_at` | Technique |

### EmployeeSnapshot (salarié importé)

| Champ domaine | Colonne SQLite | Nature |
| --- | --- | --- |
| `id` | `id` | Technique |
| `importBatchId` | `import_batch_id` | Lot d’import |
| `campaignId` | `campaign_id` | Rattachement campagne |
| `employeeNumber` | `employee_number` | Donnée importée (identifiant) |
| `employeeLabel` | `employee_label` | Donnée importée (sensible) |
| `jobFamilyId` | `job_family_id` | FK référentiel Lot 1B |
| `gradeId` | `grade_id` | FK référentiel Lot 1B |
| `contractType` | `contract_type` | Donnée importée |
| `employmentStatus` | `employment_status` | Donnée importée |
| `hireDate` | `hire_date` | Donnée importée (ISO date) |
| `decemberBaseSalary` | `december_base_salary` | Donnée importée (FCFA entier > 0) |
| `nineBoxCode` | `nine_box_code` | Donnée importée (1–9 ou `null`) |
| `confirmedUnderperformer` | `confirmed_underperformer` | Donnée importée (booléen 0/1) |
| `promotionAmount` | `promotion_amount` | Donnée importée (FCFA ≥ 0) |
| `correctionAmount` | `correction_amount` | Donnée importée (FCFA ≥ 0) |
| `socialMeasureAmount` | `social_measure_amount` | Donnée importée (FCFA ≥ 0) |
| `sourceRowNumber` | `source_row_number` | Traçabilité ligne fichier |
| `createdAt` | `created_at` | Technique |

### ContractType

Valeurs : `cdi`, `cdd`, `temporary`, `contractor`, `other`. Libellés FR dans
`CONTRACT_TYPE_LABELS` (`src/domain/hrImport/models.ts`).

### EmploymentStatus

Valeurs : `active`, `group_detachment`, `legal_leave`, `external_availability`,
`suspended`, `departed`, `other`. Libellés FR dans `EMPLOYMENT_STATUS_LABELS`.

### Champs importés — correspondance dictionnaire initial

Les termes ci-dessous désignent les mêmes concepts que dans les lots ultérieurs
de calcul ; ils sont désormais persistés par le Lot 1C :

| Terme | Champ domaine / colonne | Remarque |
| --- | --- | --- |
| `employeeNumber` | `employee_number` | Unique par lot |
| `employeeLabel` | `employee_label` | Libellé sensible |
| Famille / grade | `job_family_id`, `grade_id` | Résolus depuis codes référentiel |
| `contractType` | `contract_type` | Voir valeurs ci-dessus |
| `employmentStatus` | `employment_status` | Voir valeurs ci-dessus |
| `hireDate` | `hire_date` | ISO `YYYY-MM-DD` |
| `decemberBaseSalary` | `december_base_salary` | FCFA entier strictement positif |
| `nineBoxCode` | `nine_box_code` | Optionnel |
| `confirmedUnderperformer` | `confirmed_underperformer` | Optionnel, défaut false |
| `promotionAmount` | `promotion_amount` | Optionnel, défaut 0 |
| `correctionAmount` | `correction_amount` | Optionnel, défaut 0 |
| `socialMeasureAmount` | `social_measure_amount` | Optionnel, défaut 0 |

## Paramètres métier futurs

Les paramètres salariaux de campagne (budget annoncé, enveloppe, scénarios) ne
sont pas encore stockés. Les référentiels par campagne (Lot 1B) et la population
importée (Lot 1C) le sont. Le Lot 2A-2 calcule en mémoire pure le
positionnement, le facteur d’évaluation et le poids individuel ; la
persistance des résultats et le calibrage budgétaire restent ultérieurs
(`CALCULATION_CONTRACT.md`).

## Données calculées

### Lot 2A-2 (non persisté)

Résultats de domaine purs (non stockés) :

| Concept | Nature |
| --- | --- |
| `ratioBasisPoints` | Ratio Salaire/S0 affiché (bps half-up) |
| `positionCode` / `positionFactorMilli` | Position et facteur |
| `exactFactorNumerator` | Facteur d’évaluation (échelle 1e6) |
| `exactWeightNumerator` | Poids individuel effectif (échelle 1e9, `BigInt`) |
| `theoreticalWeightNumerator` | Poids avant blocage sous-performant |
| `blockingReason` | Ex. `CONFIRMED_UNDERPERFORMER` |
| `explanationSteps` | Trace structurée déterministe |

### Lot 2A-3 (non persisté)

| Concept | Nature |
| --- | --- |
| `BudgetTargetMode` | `manual_amount` / `percentage_of_eligible_payroll` |
| `exactAmount` | Budget / part / écart rationnel (`numerator`/`denominator`) |
| `theoreticalAmount` | Part individuelle exacte avant arrondi |
| `finalRoundedAmountFcfa` | Montant individuel final (entier, multiple du pas) |
| `actualOperationAmountFcfa` | Σ montants finaux |
| `totalRoundingDelta` | `réel − budget` (fraction exacte) |
| `RoundingPolicy` | `nearest_half_up` + `stepFcfa` explicite |

### Lot 2A-4 (non persisté)

| Concept | Nature |
| --- | --- |
| `PreparedEmployeeCalculationInput` | Salarié préparé (hors import RH) |
| `allocationWeight` | `monthlySalary × effectiveMatrixWeight` (ExactAmount) |
| `calibrationCoefficient` | `annualBudget / Σ allocationWeight` |
| `annualTheoreticalAllocation` | Part annuelle exacte |
| `monthlyTheoreticalIncrease` | `annualTheoreticalAllocation / 12` |
| `monthlyTheoreticalIncreaseRate` | `monthlyIncrease / monthlySalary` |
| `monthlyFinalRoundedIncreaseFcfa` | Augmentation mensuelle arrondie |
| `annualActualCostFcfa` | `monthlyFinalRounded × 12` |
| `monthlyFinalSalaryFcfa` | Nouveau salaire mensuel |
| `PopulationCalculationSummary` | Synthèse annuelle/mensuelle |
| `CALCULATION_CONTRACT_VERSION` | `2` (H1) |
| `RESULT_SCHEMA_VERSION` | `2` (snapshots) |
| `POPULATION_CALCULATION_FAILED` | Échec atomique + `issues[]` |

Éligibilité, masse auto, promotion, ancienneté, persistance des résultats et
alertes budgétaires restent à produire dans des lots ultérieurs.

### Lot 2B-1 (non persisté — readiness)

| Concept | Nature |
| --- | --- |
| `CampaignSimulationReadinessReport` | Rapport de préparation campagne |
| `CampaignSimulationReadinessIssue` | Issue structurée (scope, code, severity) |
| `SimulationConfigurationReadiness` | Budget / arrondi encore nécessaires |
| `preparedEmployees` | Entrées moteur triées, sans montants |
| `preparedReferences` | `PopulationCalculationReferences` ou null |
| `nineBoxOrientation` | Métadonnée informative (hors calcul) |

### Lot 2B-2 (non persisté — session UI)

| Concept | Nature |
| --- | --- |
| `CampaignSimulationConfigurationDraft` | Brouillon saisi par campagne |
| `ValidatedCampaignSimulationConfiguration` | Snapshot mémoire après validation |
| `validatedAtSessionSequence` | Compteur de session (non temporel) |
| `configurationFingerprint` | Empreinte stable des paramètres |
| `sourceFingerprint` | Empreinte sources + config à la validation |

### Lot 2B-3 (non persisté — exécution session)

| Concept | Nature |
| --- | --- |
| `CampaignSimulationExecutionResult` | Vue consultable post-calcul |
| `EmployeeSimulationResultView` | Ligne salarié + `finalSalaryFcfa` affichage |
| `SimulationBudgetSummaryView` | Budget cible / théorique / réel / écart |
| `SimulationPopulationSummaryView` | Compteurs et totaux population |
| `runSequence` | Compteur local de session par campagne |
| `CampaignSimulationExecutionState` | idle/running/success/error/stale |

### Lot 2B-4A (persisté — append-only)

| Concept | Nature |
| --- | --- |
| `compensation_simulation_runs` | Snapshot run (empreintes, budget, synthèse) |
| `compensation_simulation_employee_results` | Lignes salariés immuables |
| `SaveSimulationRunDto` | DTO sans BigInt JS (chaînes) |
| `PersistedSimulationRunSummary` / `Detail` | Modèles de lecture |
| `run_number` | Séquence durable par campagne |

Voir `docs/SIMULATION_PERSISTENCE.md` et `docs/CAMPAIGN_SIMULATION.md`.

## Décisions RH

### `correctionAmount`

Montant de correction salariale décidé et tracé séparément, notamment pour une
situation Sout-. Valeur FCFA non négative ; son motif et son éventuel étalement
seront définis dans un lot ultérieur.

### `socialMeasureAmount`

Montant d’une mesure RH ou sociale distincte et motivée. Valeur FCFA non
négative, associée à une justification et à l’auteur de la décision dans le
futur modèle.
