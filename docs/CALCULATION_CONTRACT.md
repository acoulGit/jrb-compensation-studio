# Contrat de calcul

## Objet et statut

Ce document fixe l’enchaînement attendu du futur moteur afin de rendre les
résultats explicables et testables. Il ne définit aucune formule exécutable.

> **Statut général : À implémenter dans un lot ultérieur.**

## Lot 1B — stockage des paramètres uniquement

Le Lot 1B persiste les paramètres de référence par campagne (familles, grades,
grille S0, positions, coefficients et mode 9-Box) dans les tables
`campaign_reference_*`. Aucune formule exécutable n’est introduite : le moteur
ne calcule ni positionnement, ni proposition matricielle, ni consommation
budgétaire.

Les étapes **4. Positionnement dans la grille** et **5. Application du mode
9-Box** consommeront ultérieurement ces tables (`campaign_salary_grid`,
`campaign_salary_positions`, `campaign_reference_config`,
`campaign_performance_factors`, `campaign_potential_factors`,
`campaign_nine_box_factors`) comme instantané versionné des paramètres de la
campagne.

## Lot 1C — import population sans calcul

Le Lot 1C importe et versionne la population salariée par campagne (tables
`hr_import_batches`, `hr_import_employees`). **Aucune étape de ce contrat
n’est exécutée** : pas de détermination d’éligibilité, pas de positionnement,
pas de proposition matricielle, pas de consolidation budgétaire.

Les données importées (contrat, statut, date d’embauche, salaire décembre N-1,
9-Box, sous-performant confirmé, montants promotion/correction/mesure) seront
consommées aux étapes 1 à 12 lors de l’implémentation du moteur. L’import valide
déjà la forme et la cohérence référentielle des entrées, mais ne produit aucun
résultat calculé ni alerte métier de calcul (S7+, consommation budget, etc.).

## Lot 2A-1 — contrat sémantique 9-Box (sans calcul)

Le Lot 2A-1 solidifie le modèle 9-Box avant le moteur :

- orientation de présentation persistée par campagne ;
- lookup métier par couple Performance/Potentiel (`getNineBoxFactor`) ;
- unicité SQLite du couple sémantique ;
- aucun calcul d’augmentation.

## Lot 2A-2 — moteur individuel pur (position + pondération)

Module domaine `src/domain/compensationCalculation/` :

- `resolveSalaryPosition` — ratio Salaire/S0, position, facteur de position ;
- `resolveEvaluationFactor` — facteur d’évaluation selon le mode ;
- `calculateIndividualMatrixWeight` — poids composite exact.

**Produit** : poids individuel déterministe + trace structurée.
**Hors périmètre** : montant d’augmentation, calibrage budget, arrondi final,
ancienneté, promotion, correction, mesure sociale, persistance, UI, commande
Tauri, migration.

### Arithmétique

- Aucun flottant binaire métier ; FCFA entiers, millièmes, `BigInt`.
- Ratio affiché : basis points half-up, deux décimales ; classement via le
  ratio rationnel exact uniquement.
- Facteur d’évaluation : échelle **1 000 000**.
- Poids : `positionFactorMilli × evaluationFactorScaled`, échelle
  **1 000 000 000**.

### Positionnement (convention JRB)

Point de référence le plus proche (65…135) ; mi-chemin → ratio supérieur ;
`< 65 %` → Sout- ; `> 135 %` → Sout+.

### Modes d’évaluation

| Mode | Formule (numérateur, échelle 1e6) | Données requises |
| --- | --- | --- |
| `none` | `1_000_000` | — |
| `performance_only` | `performanceMilli × 1000` | Performance |
| `full_nine_box` | `nineBoxMilli × 1000` | Performance + Potentiel |
| `performance_potential` | `performanceMilli × potentialMilli` | Performance + Potentiel |

Indépendant de l’orientation 9-Box et du `boxCode`.

### Sous-performant confirmé

Poids théorique calculé et tracé ; poids effectif = 0 ;
`blockingReason = CONFIRMED_UNDERPERFORMER`.

### Erreurs métier (codes stables)

`INVALID_SALARY`, `INVALID_S0`, `EMPTY_POSITION_REFERENCE`,
`DUPLICATE_POSITION`, `INCOHERENT_POSITION_THRESHOLDS`, `POSITION_NOT_FOUND`,
`MISSING_PERFORMANCE_LEVEL`, `MISSING_POTENTIAL_LEVEL`, `DUPLICATE_FACTOR`,
`FACTOR_NOT_FOUND`, `INVALID_FACTOR`, `UNSUPPORTED_EVALUATION_MODE`.

## Lot 2A-3 — budget cible, allocation théorique, arrondi individuel

Fonctions pures dans le même module :

- `resolveBudgetTarget`
- `allocateTheoreticalPopulationBudget`
- `roundPopulationAllocations`
- orchestrateur optionnel `calculatePopulationBudgetAllocation`

### Modes de budget

| Mode | Formule exacte | Données |
| --- | --- | --- |
| `manual_amount` | `manualBudgetFcfa / 1` | montant ≥ 0 (assiette/taux ignorés) |
| `percentage_of_eligible_payroll` | `payroll × rateBps / 10000` | assiette ≥ 0, taux bps ≥ 0 |

Aucun arrondi du budget. Pas d’obligation de divisibilité par le pas d’arrondi.
Assiette éligible **non calculée** ici (fournie en entrée).

### Allocation théorique

`part_i = budget × weight_i / Σ weight` (fractions réduites, échelles
hétérogènes admises). Invariant : Σ parts = budget. Aucun plus fort reste.

### Arrondi final

Politique explicite : `nearest_half_up` + `stepFcfa > 0`. Montant réel =
Σ finaux ; `totalRoundingDelta = réel − budget` (non forcé à zéro).

### Hors périmètre Lot 2A-3

Éligibilité, masse auto, UI, persistance, Tauri, migration, ancienneté,
promotion, correction, mesure sociale, min/max individuels.

## Lot 2A-4 — orchestrateur population préparée

Fonction pure `calculatePreparedPopulationCompensation` :

1. valider la population préparée (erreurs structurées, atomicité) ;
2. résoudre le S0 (`resolveEmployeeS0`) ;
3. chaîner 2A-2 (position, évaluation, poids matriciel) ;
4. construire `allocationWeight = salary × effectiveMatrixWeight` ;
5. résoudre le budget (2A-3) ;
6. allouer théoriquement puis arrondir individuellement (2A-3).

La population est déjà préparée : **aucune** dépendance au module d’import RH.
Résultats salariés triés par `employeeId` (ordre lexicographique UTF-16, sans
locale). Échec global `POPULATION_CALCULATION_FAILED` si une erreur bloquante.

Hors périmètre : UI, persistance, éligibilité, ancienneté, promotion,
correction, mesure sociale, export, scénarios.

## Principes

- Une exécution utilise un instantané versionné des données et paramètres.
- Les montants intermédiaires conservent leur précision ; l’arrondi final est
  appliqué uniquement à l’étape prévue.
- Chaque exclusion, alerte, correction et décision doit rester traçable.
- Les paramètres manquants ou incohérents empêchent la validation du scénario.

## Ordre futur des calculs

### 1. Validation des entrées

Contrôler les champs obligatoires, types, dates, codes de référentiel,
unicité des matricules et cohérence des paramètres.

**À implémenter dans un lot ultérieur.**

### 2. Détermination du périmètre budgétaire

Identifier la population incluse dans la masse salariale de décembre N-1 et
exclure les directeurs conformément aux règles validées.

**À implémenter dans un lot ultérieur.**

### 3. Calcul de l’éligibilité individuelle

Évaluer contrat, ancienneté au 31 décembre N-1, fin de période d’essai et statut
d’emploi. Geler les actions en cas de disponibilité hors groupe.

**À implémenter dans un lot ultérieur.**

### 4. Positionnement dans la grille

Rattacher famille, grade et médiane S0, puis déterminer la position salariale et
les cas Sout- ou Sout+.

**Lot 2A-2** : résolution pure `resolveSalaryPosition` (convention JRB du point
le plus proche). Le calibrage population / budget reste ultérieur.

### 5. Application du mode 9-Box

Appliquer le mode sélectionné et ses coefficients reparamétrables. Le
sous-performant confirmé reçoit 0 % matriciel.

Le moteur sélectionne le coefficient 9-Box exclusivement via le couple
sémantique `(performance_level, potential_level)`. L’orientation de matrice
(`nine_box_orientation`) et le numéro de case (`box_code`) sont hors clé de
calcul : ce sont des données de présentation / compatibilité.

**Lot 2A-2** : `resolveEvaluationFactor` + poids
`calculateIndividualMatrixWeight` (pas encore de montant FCFA).

Correspondance seed validée (Lot 1B / Lot 2A-1) :

| Case | Performance | Potentiel | Facteur |
| --- | --- | --- | --- |
| 1 | low | low | 0,20 |
| 2 | medium | low | 0,80 |
| 3 | high | low | 1,10 |
| 4 | low | medium | 0,25 |
| 5 | medium | medium | 1,00 |
| 6 | high | medium | 1,25 |
| 7 | low | high | 0,30 |
| 8 | medium | high | 1,10 |
| 9 | high | high | 1,40 |

**Lot 2A-2** fournit le poids ; **Lot 2A-3** convertit budget + poids en
montants individuels (théoriques puis arrondis).

### 6. Détermination de la proposition matricielle

Produire la cible individuelle à partir du positionnement et des coefficients,
sans présumer qu’elle équivaut au taux budgétaire annoncé.

**Lot 2A-3** : allocation théorique exacte `budget × poids / Σpoids`, puis
arrondi individuel paramétrable. Pas de forçage du total au budget cible.

**Lot 2A-4** : orchestrateur population ; poids d’allocation =
`salary × effectiveMatrixWeight` (même taux pour même poids matriciel).

### 7. Traitement de la promotion

Calculer uniquement le complément éventuel lorsque la cible matricielle dépasse
l’augmentation de promotion déjà reçue.

**À implémenter dans un lot ultérieur.**

### 8. Traitement des corrections et mesures distinctes

Isoler la correction Sout-, y compris son étalement éventuel, ainsi que les
mesures RH ou sociales motivées. Ne pas les confondre avec la proposition
matricielle.

**À implémenter dans un lot ultérieur.**

### 9. Ancienneté hors enveloppe

Calculer l’ancienneté à la date anniversaire sur le salaire de base courant et
la conserver hors de l’enveloppe annoncée.

**À implémenter dans un lot ultérieur.**

### 10. Consolidation budgétaire et ajustement

Comparer la somme des composantes incluses au budget global.

**Lot 2A-3** : le montant réel (= Σ montants individuels arrondis) peut différer
du budget cible ; l’écart est tracé. Aucune réconciliation forcée (plus forts
restes) n’est appliquée. Un ajustement métier ultérieur reste possible hors
moteur pur.

### 11. Arrondi final

**Lot 2A-3** : arrondi individuel `nearest_half_up` au pas `stepFcfa`
paramétrable (non figé à 5 FCFA), uniquement sur le montant final individuel.
Mesure de `totalRoundingDelta = réel − budget`.

### 12. Contrôles et alertes

Signaler notamment les dépassements S7+, données invalides, paramètres absents
et écarts budgétaires. Produire les éléments de preuve associés.

**À implémenter dans un lot ultérieur.**

## Lot 2B-1 — préparation (sans calcul)

Avant d’appeler le moteur 2A-4, la couche applicative produit un
`CampaignSimulationReadinessReport` :

- mapping population courante → `PreparedEmployeeCalculationInput` ;
- projection référentiels → `PopulationCalculationReferences` ;
- contrôle de configuration (`BudgetTargetInput`, `RoundingPolicy`) optionnelle
  en entrée ;
- issues bloquantes / warnings, sans montants ni allocations.

Le Lot 2B-1 **ne doit pas** appeler
`calculatePreparedPopulationCompensation`. Voir
`docs/CAMPAIGN_SIMULATION.md`.

## Lot 2B-2 — configuration UI (sans calcul)

La page Simulation permet de saisir et valider en mémoire :

- `BudgetTargetInput` (manuel ou % d’assiette saisie) ;
- `RoundingPolicy` (`nearest_half_up` + pas > 0) .

Aperçu autorisé : `resolveBudgetTarget` + affichage exact fractionnaire.
Interdit : allocation population, arrondi individuel des augmentations,
persistance.

## Lot 2B-3 — exécution en mémoire

Entrée applicative : `ExecuteCampaignSimulationInput`
(`campaignId`, `validatedConfiguration`, `expectedSourceFingerprint`, ports).

Ordre :

1. contrôles campagne / configuration ;
2. readiness reconstruit ;
3. comparaison d’empreinte sources + config ;
4. `PreparedPopulationCalculationInput` ;
5. **un seul** appel `calculatePreparedPopulationCompensation` ;
6. vue `CampaignSimulationExecutionResult` (synthèse + salariés + étapes).

Interdit dans la couche applicative : recalcul de position, facteurs, poids,
budget exact, allocation théorique ou arrondi final.

Échec structuré si le moteur lève `CompensationCalculationError` ou si le
résultat est incomplet — aucun total partiel « valide ».

## Sorties attendues

Le futur résultat devra distinguer proposition matricielle, complément de
promotion, correction, mesure sociale, ancienneté, total final, alertes et
consommation budgétaire. Aucun de ces éléments n’est calculé dans les lots
fondation (1A), référentiels (1B) ni import population (1C).
