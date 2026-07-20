# Simulation de campagne — Lot 2B

## Rôle du Lot 2B

Le Lot 2B relie la campagne, sa population RH courante et ses référentiels
au moteur déterministe du Lot 2A, pour préparer puis exécuter une simulation
d’augmentation.

| Sous-lot | Contenu |
| --- | --- |
| **2B-1** | Préparation / readiness — rapport structuré, sans calcul |
| **2B-2** | Page Simulation + configuration budgétaire / arrondi en mémoire |
| **2B-3** (ce document étendu) | Exécution en mémoire + consultation des résultats |
| **2B-4** (prévu) | Persistance / historique des configurations et résultats |

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
- aucun `localStorage`, `sessionStorage`, SQLite, AppData ni fichier.

### Empreinte des sources (Lot 2B-3)

`buildSimulationSourceFingerprint` couvre au minimum : campaignId, statut,
mode d’évaluation, lot RH courant, population préparée (salaire, famille,
grade, Performance/Potentiel, sous-performant), référentiels (S0, positions,
facteurs), budget et arrondi. Hash FNV-1a déterministe sans dépendance externe.
Les salaires ne sont pas journalisés en clair hors de la chaîne canonique
interne.

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
sous-performant, S0, positions, facteurs, mode d’évaluation ou statut
campagne changent. Message :

*Résultat obsolète — les données ou la configuration ont changé.*

Un `staleResult` peut rester en mémoire pour diagnostic uniquement.

### Affichage

- Synthèse : budget cible, montant théorique, coût réel, écart d’arrondi
  (signe conservé), compteurs population.
- Tableau : matricule, nom (`employeeLabel` si présent), famille/grade,
  salaires, position, évaluation, taux/montants, nouveau salaire
  (`salary + finalRoundedIncrease` en BigInt d’affichage).
- Recherche matricule/nom, tri `employeeId`, pagination 25/50/100.
- Détail drawer : facteurs, poids, arrondi, étapes d’explication ;
  codes techniques dans `<details>` ; pas de stack trace.

### Campagne archivée

Consultation lecture seule d’un résultat déjà en mémoire possible ; pas de
nouvelle validation ni nouveau lancement.

## Reporté au Lot 2B-4

- Persistance SQLite / historique des runs ;
- export ;
- workflow de validation métier ;
- édition manuelle salarié par salarié.
