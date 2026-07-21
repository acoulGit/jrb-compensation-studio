# Simulation de campagne — Lot 2B

## Rôle du Lot 2B

Le Lot 2B relie la campagne, sa population RH courante et ses référentiels
au moteur déterministe du Lot 2A, pour préparer puis exécuter une simulation
d’augmentation.

| Sous-lot | Contenu |
| --- | --- |
| **2B-1** | Préparation / readiness — rapport structuré, sans calcul |
| **2B-2** | Page Simulation + configuration budgétaire / arrondi en mémoire |
| **2B-3** | Exécution en mémoire + consultation des résultats |
| **2B-4A** | Persistance transactionnelle immuable (sans UI Historique) |
| **2B-4B** (prévu) | Interface Historique / bouton Enregistrer |

## Séparation import / préparation / configuration / calcul

```text
Import RH (Lot 1C)
  → EmployeeSnapshot (population courante)
Préparation (Lot 2B-1)
  → CampaignSimulationReadinessReport
Configuration UI (Lot 2B-2)
  → brouillon + snapshot ValidatedCampaignSimulationConfiguration (mémoire)
Exécution (Lot 2B-3)
  → executeCampaignSimulation → calculatePreparedPopulationCompensation (1×)
  → CampaignSimulationExecutionResult (vue consultable, mémoire)
Persistance (Lot 2B-4A)
  → saveCurrentCampaignSimulation → save_simulation_run (Rust TX)
  → compensation_simulation_runs (+ lignes salariés)
```

Les Lots **2B-1 et 2B-2 n’appellent pas** le moteur d’allocation.
Le Lot **2B-3** l’appelle **uniquement** après un clic explicite
« Lancer la simulation », jamais à l’ouverture, à la saisie ni à la validation.

## Page Simulation

- Navigation : libellé **Simulation** (`PageId` `simulations`).
- Zones : Campagne, État de préparation, Budget cible, Arrondi individuel,
  Validation, **Lancer la simulation**, Synthèse, Résultats individuels,
  Détail salarié (drawer).
- Bouton de lancement visible seulement après validation réussie, campagne
  draft/active, readiness prêt, configuration non stale, aucune exécution
  en cours.

## État de configuration (mémoire de session) — Lot 2B-2

`SimulationConfigurationProvider` conserve :

- un **brouillon par `campaignId`** pendant la session ;
- un **snapshot validé** immuable par campagne (invalidé dès modification
  de brouillon ou d’empreinte des sources) ;
- `configurationFingerprint` + `sourceFingerprint` au moment de la validation ;
- champs calendrier (2A-H2A) : `campaignYear`, `technicalApplicationMonth` ;
- aucun `localStorage`, `sessionStorage`, SQLite, AppData ni fichier.

### Empreinte des sources (Lot 2B-3 / H2A)

`buildSimulationSourceFingerprint` / `buildConfigurationFingerprint` couvrent
au minimum : campaignId, statut, mode d’évaluation, lot RH courant, population
préparée (salaire, famille, grade, Performance/Potentiel, sous-performant,
**`employmentStatus`**, **`compensatoryMeasureEligible`**, promotion structurée),
référentiels (S0, positions, facteurs), budget, arrondi, **`campaignYear`**,
**`technicalApplicationMonth`**, **`SENIORITY_IMPACT_CONTRACT_VERSION`**,
**`PROMOTION_TRAJECTORY_CONTRACT_VERSION`**,
**`PROMOTION_COMPENSATORY_CALIBRATION_CONTRACT_VERSION`**,
**`PROMOTION_AWARE_COMPENSATION_CONTRACT_VERSION`** (Lot 2A-H2C-2), et
**`hireDate`** dans l’identité population. Hash FNV-1a déterministe sans
dépendance externe. Deux mois d’application, dates d’embauche, statuts
d’emploi ou éligibilités compensatoires distincts ⇒ fingerprints distincts.

Si les sources changent après validation :

- code `SIMULATION_INPUTS_CHANGED_AFTER_VALIDATION` ;
- message : *Les données ont changé depuis la validation. Veuillez valider
  de nouveau la configuration.* ;
- le moteur n’est **pas** appelé.

## Exécution en mémoire — Lot 2B-3

### Service

`executeCampaignSimulation(input)` :

1. vérifie la configuration validée et l’appartenance à la campagne ;
2. recharge campagne / lot / population / référentiels via ports ;
3. reconstruit le readiness ;
4. vérifie calculabilité + empreintes ;
5. construit `PreparedPopulationCalculationInput` ;
6. appelle **une seule fois** `calculatePreparedPopulationCompensation` ;
7. construit `CampaignSimulationExecutionResult` (vue) ;
8. **ne persiste rien**.

### Atomicité

Une simulation réussie exige toute la population calculée. En cas d’erreur
bloquante : échec structuré, pas de totaux partiels présentés comme valides.

### Provider d’exécution

`SimulationExecutionProvider` — état par `campaignId` :

- status : `idle` | `ready` | `running` | `success` | `error` | `stale` ;
- `runSequence` local à la session (pas de date système) ;
- isolation : revenir à une campagne restaure son dernier résultat de session ;
- redémarrage app : tout est perdu.

### Invalidation du résultat

Un résultat courant devient stale (retiré de l’affichage courant) si budget,
arrondi, lot, population, salaires, famille/grade, Performance/Potentiel,
sous-performant, statut d’emploi, éligibilité compensatoire, promotion
structurée, S0, positions, facteurs, mode d’évaluation ou statut
campagne changent. Message :

*Résultat obsolète — les données ou la configuration ont changé.*

Un `staleResult` peut rester en mémoire pour diagnostic uniquement.

### Affichage

- Synthèse : budget **annuel** cible, allocation théorique annuelle,
  augmentation mensuelle théorique totale, coût **annuel** réel, écart **annuel**
  d’arrondi (signe conservé), compteurs population, **mois d’application
  technique**, **rappel total**, **coût direct reste d’année** (2A-H2A),
  section **Impacts hors budget** (rappel / direct / annuel d’ancienneté —
  2A-H2B).
- Tableau : matricule, nom, famille/grade, salaire/S0 **mensuels**, position,
  évaluation, taux mensuel, allocation annuelle, augmentations mensuelles,
  mois de rappel, rappel, mois restants, coût direct, taux ancienneté,
  rappel / incidence annuelle ancienneté, nouveau salaire mensuel,
  coût annuel réel.
- Recherche matricule/nom, tri `employeeId`, pagination 25/50/100.
- Détail drawer : facteurs, poids, allocation annuelle, mensuel théorique /
  final, calendrier / rappel, incidence d’ancienneté (hors budget), écarts,
  étapes d’explication.

### Campagne archivée

Consultation lecture seule d’un résultat déjà en mémoire possible ; pas de
nouvelle validation ni nouveau lancement.

## Persistance (Lot 2B-4A)

Voir `docs/SIMULATION_PERSISTENCE.md`.

- Snapshot immuable append-only ; sauvegarde **explicite** uniquement.
- Tables `compensation_simulation_runs` /
  `compensation_simulation_employee_results`.
- Commande Rust `save_simulation_run` (connexion dédiée, WAL, rollback).
- Repositories lecture/écriture prêts pour le Lot 2B-4B.
- **Pas d’UI** Historique ni bouton Enregistrer dans 2B-4A.

## Restitution H2C-2B (résultats promotion-aware)

L’écran de résultats (`SimulationResultsPanel`) consomme uniquement des
**modèles de vue** produits par `buildSimulationResultView` — aucun recalcul
métier dans React.

### Structure des écrans

1. **Synthèse de l’enveloppe** — enveloppe de la période d’effet, coût
   promotions imputé, budget disponible complément, théorique / coût effectif
   de campagne, delta de période, coût à plein effet sur 12 mois (informatif).
2. **Calendrier de paiement** — promotions déjà payées vs période restante ;
   rappel + paiement direct du **complément** uniquement
   (jamais « rappel de promotion ») ; mois avant rétro = « Hors période ».
3. **Incidences d’ancienneté — hors budget** — ventilation promotion /
   complément / totale.
4. **Tableau salariés** — colonnes promotion / éligibilité / coûts ;
   colonnes promotion masquées s’il n’y a aucune promotion structurée.
5. **Détail salarié** — blocs Promotion, Complément, Ancienneté,
   Trajectoire mensuelle (12 mois, défilement horizontal).

### Configuration — rétroactivité (H2D-1)

Champ UI `retroactivityStartMonthInput` (défaut `"1"`). Empreintes
configuration / sources : token `retroStart:`. Contrat de calcul **v3**.
Sauvegarde snapshot bloquée tant que `result_schema_version` reste à 2.

### Coût brut vs imputable

| Champ | Sémantique |
| --- | --- |
| `promotionCampaignCostInformativeFcfa` | Coût brut informatif H2C-1 |
| `annualPromotionBudgetCostFcfa` | Coût imputé à l’enveloppe |

### Erreurs métier dédiées

- `PROMOTION_COST_EXCEEDS_BUDGET` — titre + budget / coût / dépassement
- `NO_COMPENSATORY_ALLOCATION_CAPACITY` — titre + budget cible / coût promo /
  disponible / expositions ; message : réduire l’enveloppe ou revoir
  l’éligibilité (**pas** « Augmentez le budget »).

### Recette visuelle (manuel)

A. Campagne sans promotion — parité historique, banner « Aucune promotion incluse ».
B. Promotion N-1 (500 000 → 550 000) — coût × 12, active toute l’année.
C. Promotion avril N / application juillet — déjà payée avril–juin ; rappel = complément.
D. Promotion juillet N / application juillet — bascule en juillet.
E. Promotion août N / application juillet — statut « Exclue après application ».
F. Promu non éligible — coût promo imputé, complément nul, motif visible.
G. Promotions > budget — erreur métier dédiée.

## Reporté au Lot 2B-4B

- bouton « Enregistrer la simulation » ;
- page / liste Historique ;
- comparaison, export ;
- workflow de validation métier ;
- édition manuelle salarié par salarié.
