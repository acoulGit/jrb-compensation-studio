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
| `manual_amount` | `manualBudgetFcfa / 1` | **budget annuel** ≥ 0 (assiette/taux ignorés) |
| `percentage_of_eligible_payroll` | `(payrollMensuel × 12) × rateBps / 10000` | assiette **mensuelle** ≥ 0, taux bps ≥ 0 |

Aucun arrondi du budget. Pas d’obligation de divisibilité par le pas d’arrondi.
Assiette éligible **non calculée** ici (fournie en entrée, mensuelle, annualisée × 12).

### Allocation théorique

`partAnnuelle_i = budgetAnnuel × weight_i / Σ weight` (fractions réduites).
Invariant : Σ parts annuelles = budget annuel. Aucun plus fort reste.

### Arrondi final (niveau 2A-3 isolé)

Politique explicite : `nearest_half_up` + `stepFcfa > 0` sur le montant fourni.
Au niveau population préparée (2A-4 / H1), l’arrondi s’applique à
l’**augmentation mensuelle** uniquement.

### Hors périmètre Lot 2A-3

Éligibilité, masse auto, UI, persistance, Tauri, migration, ancienneté,
promotion, correction, mesure sociale, min/max individuels.

## Lot 2A-4 — orchestrateur population préparée

Fonction pure `calculatePreparedPopulationCompensation` :

1. valider la population préparée (erreurs structurées, atomicité) ;
2. résoudre le S0 (`resolveEmployeeS0`) ;
3. chaîner 2A-2 (position, évaluation, poids matriciel) ;
4. construire `allocationWeight = monthlySalary × effectiveMatrixWeight` ;
5. résoudre le budget **annuel** (2A-3) ;
6. allouer les parts **annuelles** exactes ;
7. convertir en augmentation **mensuelle** (`÷ 12`) ;
8. arrondir uniquement l’augmentation mensuelle ;
9. coût annuel réel = Σ (mensuel arrondi × 12) ;
10. ventiler le coût annuel (rappel vs paiement direct) selon le mois
    d’application technique (2A-H2A) — sans modifier l’allocation.

## Correctif 2A-H1 — budget annuel / augmentation mensuelle

**Contrat** (`calculationContractVersion = 2`, `annualBudgetPeriodMonths = 12`,
`employerChargesIncluded = false`) :

| Concept | Période |
| --- | --- |
| Budget cible | Annuel (coût des augmentations de salaire de base, 12 mois, hors charges) |
| Salaires importés / S0 | Mensuels |
| Allocation théorique | Annuelle |
| Augmentation théorique / finale | Mensuelle |
| Taux d’augmentation | Mensuel (`mensuel ÷ salaire mensuel`) |
| Nouveau salaire | Mensuel |
| Coût réel d’opération | Annuel (`Σ mensuel arrondi × 12`) |
| Écart d’arrondi synthétique | Annuel (`coût annuel − budget annuel`) |

Équivalence : `annualRoundingDelta = monthlyRoundingDelta × 12`.

## Lot 2A-H2A — calendrier d’application / rappel

Champs obligatoires d’entrée population : `campaignYear`,
`technicalApplicationMonth` (1–12).

| Concept | Formule / règle |
| --- | --- |
| Mois de rappel | `technicalApplicationMonth - 1` (0–11) |
| Mois restants | `13 - technicalApplicationMonth` (1–12) |
| Rappel salaire de base | `monthlyFinalIncrease × retroactiveMonths` |
| Coût direct reste d’année | `monthlyFinalIncrease × remainingDirectPaymentMonths` |
| Coût annuel base | `monthlyFinalIncrease × 12` (= `annualActualCostFcfa`) |

Invariant salarié et population : `rappel + direct = annuel`.

Le rappel **ne modifie pas** l’allocation annuelle ni le budget cible ; il
ventile uniquement le calendrier de versement.

**Persistance H2A** : modèles moteur / UI en mémoire ; colonnes snapshot 0005
et `result_schema_version` **inchangés** (pas de migration 0006 dans ce lot).

## Lot 2A-H2B — incidence supplémentaire d’ancienneté

Contrat `SENIORITY_IMPACT_CONTRACT_VERSION = 1` (empreintes).
`CALCULATION_CONTRACT_VERSION` reste **2**.

| Concept | Règle |
| --- | --- |
| Source date | `hireDate` ISO `YYYY-MM-DD` (import → préparé → moteur) |
| Assiette | `monthlyFinalIncreaseFcfa` uniquement |
| Taux | moins de 3 anniv. effectifs → 0 ; sinon `count + 2` (sans plafond) |
| Effet | mois précédant l’anniversaire ; janvier → décembre N-1 |
| Arrondi | plafond FCFA |
| Totaux | `seniorityReminder` + `remainingYearDirect` = `annualSeniorityImpact` |

Hors budget : aucun impact sur `annualBudgetTarget`, allocation théorique,
`monthlyFinalIncrease` ni `annualActualBaseIncreaseCost`.

**Persistance H2B** : mémoire uniquement ; pas de colonnes SQL ; pas de
migration 0006 ; `result_schema_version = 2` inchangé.

**Persistance** : `result_schema_version = 2` (colonnes 0005 réinterprétées ;
pas de migration 0006). Version 1 = sémantique obsolète — ne pas recalculer ni
présenter comme conforme H1.

La population est déjà préparée : **aucune** dépendance au module d’import RH.
Résultats salariés triés par `employeeId` (ordre lexicographique UTF-16, sans
locale). Échec global `POPULATION_CALCULATION_FAILED` si une erreur bloquante.

Hors périmètre : UI, persistance SQL des champs H2A/H2B, éligibilité, promotion,
correction, mesure sociale, export, scénarios, TPA/CNSS/charges.

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

**Lot 2A-H2C-2A** : prédicat `isCompensatoryMeasureEligible` (contrat CDI/CDD,
ancienneté ≥ 12 mois au 31/12 N-1, gel `external_availability`). Distinct de
la population budgétaire promotion. Période d’essai : règle documentée non
opérationalisée (absence de champ d’import).

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

**Lot 2A-H2C-1 (préparation)** : import structuré d’un événement de promotion
(`PromotionEvent`), validations N-1/N vs décembre N-1, trajectoire mensuelle
déterministe (`buildPromotionAwareMonthlySalaryTrajectory`) et coût campagne
préparé (`promotionCampaignCostFcfa`). Une seule date `promotionDate` = effet
et première paie (pas de prorata journalier, pas de rappel de promotion).
Exclusion si promotion en N après `technicalApplicationMonth`.
Le champ historique `promotionAmount` reste une compatibilité d’import : sans
groupe structuré il est conservé sans créer d’événement ; avec groupe structuré
le montant canonique est `salaryAfter − salaryBefore` (rejet si saisie
explicite différente).

**Lot 2A-H2C-2 (moteur budget promotion / calibrage compensatoire)** : intègre
le coût des promotions incluses au budget annuel et calibre le complément
compensatoire matriciel sur le reliquat.

Pipeline (`calculatePreparedPopulationCompensation`) :

1. Validation d’entrée + résolution du budget + validation du calendrier
   d’application (inchangé du Lot 2A-3/H2A).
2. Préparation individuelle (`calculatePreparedEmployeeCompensation`) pour les
   champs instantané décembre (compatibilité UI / legacy).
3. Construction, par salarié, de 12 expositions mensuelles
   (`buildEmployeePromotionAwareExposures`) : salaire du mois, S0 du mois,
   facteur matriciel effectif du mois (0 si sous-performant confirmé ou
   `compensatoryMeasureEligible === false`), `promotionRateOffset` mensuel issu
   de la trajectoire promotion (Lot 2A-H2C-1) et coût de promotion du mois.
4. Somme `totalAnnualPromotionBudgetCostFcfa` = **somme exacte** des
   `annualPromotionBudgetCostFcfa` salariés. Chaque coût salarié imputable vaut :
   `includedInSimulation && isPromotionBudgetPopulationEmployee`
   ? `promotionInclusion.promotionCampaignCostFcfa` : `0`.
   Le coût brut informatif reste dans `promotionInclusion.promotionCampaignCostFcfa`
   (y compris hors population budget).
   Statuts consommant le budget : `active`, `group_detachment`,
   `legal_leave` ; `employmentStatus` absent/`null` ⇒ traité comme `active`
   (fixtures techniques). Exclus : `external_availability`,
   `suspended`, `departed`, `other`.
5. Si `totalAnnualPromotionBudgetCostFcfa > budget annuel cible` ⇒
   `PROMOTION_COST_EXCEEDS_BUDGET` (code conservé, aucun résultat partiel).
6. `availableAnnualCompensatoryBudget = budget annuel cible −
   totalAnnualPromotionBudgetCostFcfa`.
7. Résolution exacte (BigInt / fractions) d’un taux unique de calibrage
   `compensatoryCalibrationRate` par solveur piecewise
   (`solvePromotionAwareCompensatoryCalibrationRate`,
   `promotionCompensatoryCalibration.ts`) sur l’ensemble des 12 × N expositions
   mensuelles éligibles (facteur > 0) :
   - `theoreticalComplement(rate) = Σ salaire × max(0, rate×facteur − offset)`
     où `offset = promotionRateOffset` du mois (0 hors promotion incluse) ;
   - recherche du taux tel que `theoreticalComplement(rate) =
     availableAnnualCompensatoryBudget`, en tenant compte des seuils
     `offset/facteur` où une exposition redevient active ;
   - sans exposition éligible et budget disponible > 0 ⇒
     `NO_COMPENSATORY_ALLOCATION_CAPACITY` (code **conservé**, non remplacé
     par `POPULATION_CALCULATION_FAILED`).
8. Finalisation mensuelle par salarié
   (`finalizeEmployeePromotionAwareCompensation`) : complément théorique
   arrondi mois par mois (`nearest_half_up`, pas paramétrable),
   `finalSalaryFcfa = baseSalaryFcfa(mois) + complémentArrondi` (le montant de
   promotion n’est **pas** ajouté une seconde fois, il est déjà dans
   `baseSalaryFcfa` du mois).
9. Rappel / paiement direct (sémantique H2A conservée) : calculés uniquement
   sur les mois **compensatoires arrondis** (avant/à partir du mois
   d’application technique), jamais sur la part promotion (la promotion n’a
   pas de rappel propre, payée dès son mois d’effet — cf. H2C-1).
10. Ancienneté (sémantique H2B conservée) ventilée par mois entre part
    promotion et part compensatoire :
    `combinedIncrease = promotionIncrement + complémentArrondi` ;
    `totalSeniorityImpact = ceil(combinedIncrease × taux/100)` ;
    `promotionSeniorityImpact = ceil(promotionIncrement × taux/100)` ;
    `compensatorySeniorityImpact = totalSeniorityImpact −
    promotionSeniorityImpact` (jamais négatif).
11. **Sans promotion structurée dans la population**, le pipeline est
    strictement équivalent au Lot 2A-3/H2A/H2B : `promotionRateOffset = 0`
    partout, `availableAnnualCompensatoryBudget = budget annuel cible`, taux de
    calibrage identique à `calibrationCoefficient` historique. Parité vérifiée
    par la fixture `annualBudgetMonthlyIncrease.test.ts` (inchangée).

Champs population supplémentaires : `totalAnnualPromotionBudgetCostFcfa`,
`availableAnnualCompensatoryBudget`, `compensatoryCalibrationRate`,
`totalCombinedAnnualActualCostFcfa`, `totalAnnualPromotionSeniorityImpactFcfa`,
`totalCombinedAnnualSeniorityImpactFcfa`, `promotedIncludedEmployeeCount`.
Champs salarié supplémentaires : `employmentStatus`,
`compensatoryMeasureEligible`, `isPromotionBudgetPopulationEmployee`,
`annualPromotionBudgetCostFcfa`, `monthlyCompensationTrajectory`
(`MonthlyCompensationTrajectoryEntry[]`), `combinedAnnualActualCostFcfa`,
`annualPromotionSeniorityImpactFcfa`, `combinedAnnualSeniorityImpactFcfa`.

Le moteur d’allocation Lot 2A n’est pas modifié dans son principe (poids
`salary × effectiveMatrixWeight`, arrondi individuel) : H2C-2 ajoute la
consommation budgétaire des promotions incluses et bascule le calibrage vers
une résolution **mensuelle** (12 expositions/salarié) au lieu d’une résolution
annuelle unique, pour absorber les variations de facteur/salaire induites par
une promotion en cours d’année. `CALCULATION_CONTRACT_VERSION` reste **2**
(aucun changement de forme des entrées/validations de base) ;
`PROMOTION_COMPENSATORY_CALIBRATION_CONTRACT_VERSION` et
`PROMOTION_AWARE_COMPENSATION_CONTRACT_VERSION` (= 1) versionnent les nouveaux
contrats de calibrage / trajectoire mensuelle.

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

## Lot 2B-4A — persistance snapshot (sans recalcul)

Le service `saveCurrentCampaignSimulation` mappe le résultat mémoire vers
`SaveSimulationRunDto` (chaînes décimales) puis appelle la commande Rust.
La commande **ne recalcule pas** les formules : elle valide la cohérence du
snapshot et l’inscrit transactionnellement.

## Sorties attendues

Le futur résultat devra distinguer proposition matricielle, complément de
promotion, correction, mesure sociale, ancienneté, total final, alertes et
consommation budgétaire. Aucun de ces éléments n’est calculé dans les lots
fondation (1A), référentiels (1B) ni import population (1C).
