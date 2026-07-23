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
| **2B-P1** | Consolidation snapshot schema v3 (contrat v4 + trajectoire mensuelle, migration `0007`) |
| **2B-RC1-H1** | Neutralisation individuelle effet 9-Box (contrat v5 / schema v4, migration `0008`) |
| **2B-RC1-H2** | Coefficient provisoire 9-Box « Performance à confirmer » (contrat v6 / schema v5, migration `0009`) |
| **2B-RC1-H3** | Promotion salariale sans changement de grade (contrat v7 / schema v5, **pas** de migration) |
| **2B-RC1-H4** | Mois d’effet configurable du minimum garanti (contrat v8 / schema v6, migration `0012`) |
| **2B-4B** | Bouton Enregistrer + page Historique (lecture seule, compatible schema v3 / dégradation v1-v2) |
| **2B-UX1** | Confort UI : sidebar repliable, pages résultats fluides, détail salarié quasi plein écran (sans changement métier) |

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
  Détail salarié (drawer quasi plein écran — Lot 2B-UX1).
- Bouton de lancement visible seulement après validation réussie, campagne
  draft/active, readiness prêt, configuration non stale, aucune exécution
  en cours.
- Lot **2B-UX1** : sidebar repliable (session), pages Simulation/Historique en
  largeur fluide (`main-content--fluid`), trajectoire densifiée
  (`data-table--trajectory`) — aucun changement métier.

## État de configuration (mémoire de session) — Lot 2B-2

`SimulationConfigurationProvider` conserve :

- un **brouillon par `campaignId`** pendant la session ;
- un **snapshot validé** immuable par campagne (invalidé dès modification
  de brouillon ou d’empreinte des sources) ;
- `configurationFingerprint` + `sourceFingerprint` au moment de la validation ;
- champs calendrier (2A-H2A / 2B-RC1-H4) : `campaignYear`,
  `retroactivityStartMonth`, `technicalApplicationMonth`,
  `minimumGuaranteeEffectiveMonth` (défaut nouvelle simulation =
  `technicalApplicationMonth`) ;
- aucun `localStorage`, `sessionStorage`, SQLite, AppData ni fichier.

### Empreinte des sources (Lot 2B-3 / H2A)

`buildSimulationSourceFingerprint` / `buildConfigurationFingerprint` couvrent
au minimum : campaignId, statut, mode d’évaluation, lot RH courant, population
préparée (salaire, famille, grade, Performance/Potentiel, sous-performant,
**`employmentStatus`**, **`compensatoryMeasureEligible`**, promotion structurée),
référentiels (S0, positions, facteurs), budget, arrondi, **`campaignYear`**,
**`retroactivityStartMonth`**, **`technicalApplicationMonth`**,
**`minimumGuaranteeEffectiveMonth`**, **`SENIORITY_IMPACT_CONTRACT_VERSION`**,
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

## Persistance (Lots 2B-4A + 2B-P1)

Voir `docs/SIMULATION_PERSISTENCE.md`.

- Snapshot immuable append-only ; sauvegarde **explicite** uniquement.
- Tables `compensation_simulation_runs` /
  `compensation_simulation_employee_results` /
  `compensation_simulation_employee_month_results` (mensuel, migration `0007`).
- Commande Rust `save_simulation_run` (connexion dédiée, WAL, rollback) :
  run `result_schema_version = 3` + salariés + **12 mois** dans une seule
  transaction, sans recalcul.
- **Lot 2B-P1** : contrat v4 persistable en schema v3 (configuration période,
  ancienneté, minimum garanti, trajectoire mensuelle). Colonnes NULL pour les
  anciens snapshots v1/v2.
- Repositories lecture/écriture prêts pour le Lot 2B-4B (ports mensuels
  inclus : `listSimulationEmployeeMonthResults`).
- **Pas d’UI** Historique ni bouton Enregistrer dans ce périmètre.

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
Depuis le Lot 2B-P1, la sauvegarde snapshot est possible en
`result_schema_version = 3` (migration `0007`).

### Configuration — minimum garanti (H2D-2 / 2B-RC1-H4)

Section UI « Minimum garanti d’augmentation » : modes exclusifs none /
forfait / pourcentage. Empreintes : `minMode` / `minAmt` / `minRate` /
`minInc:v2` / `minEffMonth:`. Contrat de calcul **v8**
(`MINIMUM_INCREASE_CONTRACT_VERSION = 2`). Enveloppe : promotions, minimum
réservé, disponible après, parts minimum / au-dessus. Erreur dédiée
`MINIMUM_GUARANTEE_EXCEEDS_BUDGET` (ne pas recommander d’augmenter le
minimum ; le plancher réservé ne compte que les mois couverts par le
minimum). Depuis le Lot 2B-P1, le minimum garanti est persistable ;
un contrat ≥ 3 reste refusé si le schema snapshot est < 3 ; un contrat **v8**
exige schema **≥ 6** (migration `0012`).

#### Temporalités distinctes (Lot 2B-RC1-H4)

Trois paramètres calendaires coexistent ; ils ne doivent pas être confondus :

| Paramètre | Rôle |
| --- | --- |
| **`retroactivityStartMonth`** | Début de la période budgétaire générale `[rétro … décembre]` ; rappels de la part **au-dessus** du minimum. |
| **`technicalApplicationMonth`** | Mois de paiement direct du complément compensatoire (calendrier salaire de base). |
| **`minimumGuaranteeEffectiveMonth`** | Mois à partir duquel le plancher du minimum garanti s’applique et entre dans la réservation budgétaire. |

Règles métier :

- **Défaut** (nouvelle simulation) : `minimumGuaranteeEffectiveMonth =
  technicalApplicationMonth` (le brouillon conserve sa valeur si le mois
  technique change ensuite).
- **Mois couverts par le minimum** : `m >= max(retroactivityStartMonth,
  minimumGuaranteeEffectiveMonth)` jusqu’à décembre (`isMonthCoveredByMinimumGuarantee`).
  Un mois d’effet antérieur à la rétroactivité ne crée pas de période hors
  campagne.
- **Part au-dessus du minimum** : conserve la rétroactivité générale
  (`retroactivityStartMonth`) — indépendamment du mois d’effet du plancher.
- **Rappel du minimum** : uniquement si
  `minimumGuaranteeEffectiveMonth < technicalApplicationMonth` ; sinon
  « Aucun rappel du minimum garanti ».
- **Réservation budgétaire du plancher** : agrégée uniquement sur les mois
  couverts par le minimum (pas sur les 12 mois civils par défaut).

Compatibilité historique (schema **≤ 5**) : le mois d’effet affiché /
exporté se résout vers `retroactivityStartMonth` (**jamais** le mois
technique), avec la mention « Aligné historiquement sur le mois de
rétroactivité » (`resolveMinimumGuaranteeEffectiveMonth`).

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
- `MINIMUM_GUARANTEE_EXCEEDS_BUDGET` — enveloppe / promotions / minimum
  requis / dépassement ; proposer d’augmenter l’enveloppe, réduire ou
  désactiver le minimum, ou revoir la population (**pas** d’augmenter le
  minimum).

### Recette visuelle (manuel)

A. Campagne sans promotion — parité historique, banner « Aucune promotion incluse ».
B. Promotion N-1 (500 000 → 550 000) — coût × 12, active toute l’année.
C. Promotion avril N / application juillet — déjà payée avril–juin ; rappel = complément.
D. Promotion juillet N / application juillet — bascule en juillet.
E. Promotion août N / application juillet — statut « Exclue après application ».
F. Promu non éligible — coût promo imputé, complément nul, motif visible.
G. Promotions > budget — erreur métier dédiée.

## Interface Historique (Lot 2B-4B)

- Page `simulation-history` : liste paginée par campagne, détail snapshot.
- Composants partagés avec la page Simulation (formatage exact identique).
- Campagnes archivées : historique consultable, aucune nouvelle sauvegarde.
- Voir `docs/SIMULATION_PERSISTENCE.md`.

## Export Excel RH depuis l’historique (Lot 2B-E1)

- Colonne **Actions** de l’historique : bouton **Export Excel** à côté de
  **Consulter**.
- Export réservé aux snapshots **v3+** (`canPresentResultSchemaVersion`) ; les
  snapshots v1/v2/inconnu affichent le bouton désactivé avec infobulle. Les
  runs schema **6** (contrat v8) exportent le mois d’effet explicite du minimum.
- Dialogue modal : protection par mot de passe cochée par défaut (≥ 12
  caractères), générateur de mot de passe robuste (≥ 20), ou export non protégé
  confirmé explicitement.
- Destination choisie via le sélecteur natif Windows (`.xlsx`). L’annulation du
  sélecteur ferme le dialogue sans erreur.
- Le mot de passe n’est jamais journalisé ni conservé après fermeture.
- Voir `docs/HR_EXCEL_EXPORT.md`.

## Reporté (post 2B-E1)
- comparaison de simulations ;
- workflow de validation métier ;
- édition manuelle salarié par salarié.
