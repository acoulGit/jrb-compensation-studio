# Simulation de campagne — Lot 2B

## Rôle du Lot 2B

Le Lot 2B relie la campagne, sa population RH courante et ses référentiels
au moteur déterministe du Lot 2A, pour préparer puis exécuter une simulation
d’augmentation.

| Sous-lot | Contenu |
| --- | --- |
| **2B-1** | Préparation / readiness — rapport structuré, sans calcul |
| **2B-2** (ce document étendu) | Page Simulation + configuration budgétaire / arrondi en mémoire |
| **2B-3** (prévu) | Exécution du moteur (`calculatePreparedPopulationCompensation`) |
| **2B-4** (prévu) | Persistance / historique des configurations et résultats |

## Séparation import / préparation / configuration / calcul

```text
Import RH (Lot 1C)
  → EmployeeSnapshot (population courante)
Préparation (Lot 2B-1)
  → CampaignSimulationReadinessReport
Configuration UI (Lot 2B-2)
  → brouillon + snapshot ValidatedCampaignSimulationConfiguration (mémoire)
Calcul (Lot 2A-4, à partir de 2B-3)
  → calculatePreparedPopulationCompensation
```

Les Lots **2B-1 et 2B-2 n’appellent pas** le moteur d’allocation.

## Page Simulation (Lot 2B-2)

- Navigation : libellé **Simulation** (`PageId` `simulations`).
- Zones : Campagne, État de préparation, Budget cible, Arrondi individuel,
  Validation de la configuration.
- Aucun tableau de résultats salariés.
- Indice futur : « Calcul disponible après validation dans le prochain sous-lot »
  (pas de bouton « Lancer la simulation »).

## État de configuration (mémoire de session)

`SimulationConfigurationProvider` conserve :

- un **brouillon par `campaignId`** pendant la session ;
- un **snapshot validé** immuable par campagne (invalidé dès modification) ;
- aucun `localStorage`, `sessionStorage`, SQLite, AppData ni fichier.

Après fermeture complète de l’application, la configuration est perdue.

### Isolation

Changer de campagne restaure le brouillon de cette campagne uniquement.
Une nouvelle campagne démarre avec une configuration vide (aucun mode budget
sélectionné, pas vide).

### Modes de budget

Aucun mode par défaut :

1. **Montant saisi** (`manual_amount`) — entier FCFA ≥ 0, sans arrondi au pas.
2. **Pourcentage de la masse éligible** (`percentage_of_eligible_payroll`) —
   assiette entière saisie + taux % (max 2 décimales) → basis points exacts
   (ex. 4,25 % → 425 bps). Aucun `Number` / `parseFloat` pour les montants.

Le budget cible exact peut être **fractionnaire** (`resolveBudgetTarget`) et
est affiché via `formatExactAmountAsFcfa` sans conversion flottante ni arrondi
au pas.

### Arrondi individuel

Mode visible : **Au multiple le plus proche — half-up** (`nearest_half_up`).
Pas d’arrondi **obligatoire**, entier > 0, **non figé à 5** ; suggestions
1 / 5 / 10 / 50 / 100 / 500 / 1 000 (sélection explicite).

### Validation

Le bouton **Valider la configuration** crée un snapshot mémoire si readiness
complet. Message : *Aucun calcul n’a encore été lancé.* Toute modification
affiche *Configuration modifiée — nouvelle validation requise.*

Campagne **archived** : readiness consultable, validation interdite.

## Couche applicative 2B-1 / 2B-2

`src/application/campaignSimulation/`

- `buildCampaignSimulationReadiness`, mapping, référentiels ;
- `parseSimulationConfiguration`, `formatExactBudgetDisplay` ;
- codes UI (`MISSING_BUDGET_TARGET_MODE`, …) sans dupliquer inutilement le moteur.

Indépendante de React / DOM / date / locale / réseau.

## Hors périmètre 2B-2

- exécution du moteur population ;
- montants d’augmentation individuels ;
- persistance / migration / Rust / Tauri.

## Correction alignement référentiels (recette 2B-2)

`buildPopulationCalculationReferences` réutilise `computeReferenceCompleteness`
(même règle que la page Référentiels) puis ajoute les contrôles moteur.
Mode `performance_only` : Performance exigée ; Potentiel / 9-Box non exigés.
Le readiness Simulation se recharge à l’entrée page et après mutation des
référentiels (évite un rapport obsolète). Journal DEV :
`[SIMULATION_REFERENCE_READINESS_FAILED]` (sans salaires salariés).
