# Simulation de campagne — Lot 2B

## Rôle du Lot 2B

Le Lot 2B relie la campagne, sa population RH courante et ses référentiels
au moteur déterministe du Lot 2A, pour préparer puis exécuter une simulation
d’augmentation.

| Sous-lot | Contenu |
| --- | --- |
| **2B-1** (ce document) | Préparation / readiness — rapport structuré, sans calcul |
| **2B-2** (prévu) | Lancement du calcul de simulation depuis les entrées préparées |
| **2B-3** (prévu) | Persistance / historique / exposition UI des résultats |

## Séparation import / préparation / calcul

```text
Import RH (Lot 1C)
  → EmployeeSnapshot (population courante)
Préparation (Lot 2B-1)
  → PreparedEmployeeCalculationInput + PopulationCalculationReferences
  → CampaignSimulationReadinessReport
Calcul (Lot 2A-4, appelé à partir de 2B-2)
  → calculatePreparedPopulationCompensation
  → montants / allocations
```

Le Lot **2B-1 n’appelle pas** `calculatePreparedPopulationCompensation` et ne
produit aucun montant d’augmentation.

## Couche applicative

`src/application/campaignSimulation/`

- indépendante de React, DOM, date système, locale, réseau ;
- dépend des modèles campagne / import / référentiels / `compensationCalculation` ;
- orchestre via **ports injectés** (services existants), sans SQLite direct.

Entrée principale : `buildCampaignSimulationReadiness(input, ports)`.

## Population courante

Seuls les salariés du lot `hr_import_batches.status = current` sont préparés.
Les lots `superseded` sont ignorés. Un remplacement d’import bascule
automatiquement l’ancien lot en `superseded`.

## Contrat de mapping source → moteur

| Cible moteur | Source import / référentiel | Transformation | Si absent |
| --- | --- | --- | --- |
| `employeeId` | `employeeNumber` | trim, non vide | bloquant |
| `familyCode` | `jobFamilyId` → famille campagne | code référentiel | bloquant |
| `gradeCode` | `gradeId` → grade campagne | code référentiel | bloquant |
| `salaryFcfa` | `decemberBaseSalary` | entier FCFA > 0 | bloquant |
| `performanceLevel` | `nineBoxCode` → `campaign_nine_box_factors` | niveaux canoniques `low`/`medium`/`high` (aliases FR testés) | bloquant si mode l’exige |
| `potentialLevel` | idem | idem | bloquant si mode l’exige |
| `confirmedUnderperformer` | `confirmedUnderperformer` | booléen explicite post-import | bloquant si indéterminé — **pas** de défaut silencieux `false` dans le mapper |

L’orientation 9-Box (`nineBoxOrientation`) est une métadonnée du rapport
uniquement ; elle n’entre pas dans `PopulationCalculationReferences` et
n’influence pas les facteurs.

## Readiness

Une campagne **draft** ou **active** peut être préparée. Une campagne
**archived** reste consultable mais ne peut pas être « prête » pour une
nouvelle simulation. Le statut campagne n’est jamais muté.

Une campagne est **non prête** (`isReady = false`) si, entre autres :

- campagne introuvable ou archivée ;
- aucun lot RH courant / population vide ;
- référentiels incomplets ;
- mapping salarié impossible ;
- S0 absent pour une famille/grade utilisée ;
- facteur requis par le mode d’évaluation absent ;
- `employeeId` dupliqué ;
- salaire invalide ;
- Performance / Potentiel / sous-performant indéterminés alors que requis ;
- configuration budget ou arrondi absente (section configuration distincte).

### Sections du rapport

- `populationReadiness` — import + mapping salariés ;
- `referenceReadiness` — grille, positions, facteurs ;
- `configurationReadiness` — budget cible + politique d’arrondi (optionnels en entrée 2B-1).

L’absence de budget n’est **pas** confondue avec une erreur de population.

### Issues

`CampaignSimulationReadinessIssue` : `scope`, `code`, `severity`
(`blocking` | `warning`), `employeeId` / `field` optionnels, message, détails.

Codes stables dédiés 2B-1 (ex. `CAMPAIGN_ARCHIVED`, `MISSING_BUDGET_CONFIGURATION`) ;
réutilisation des codes moteur 2A lorsqu’ils s’appliquent déjà au même concept.

## Hors périmètre 2B-1

- UI / pages / providers React ;
- commande Tauri / Rust ;
- migration SQLite ;
- persistance de simulation ;
- calcul d’allocation ou montants simulés.

## Suite prévue

- **2B-2** : si `isReady`, appeler le moteur 2A-4 avec `preparedEmployees`,
  `preparedReferences`, `budgetTarget`, `roundingPolicy`.
- **2B-3** : stocker les résultats, historique, exposition UI.
