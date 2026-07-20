# Règles métier validées

Ce document consigne uniquement les règles validées. Toute précision,
interprétation ou nouvelle règle doit faire l’objet d’une validation métier
avant d’être ajoutée.

## Persistance des paramètres (Lot 1B)

Le Lot 1B ne crée aucune règle métier nouvelle. Il persiste, **par campagne**,
les paramètres déjà validés ci-dessous : structure familles/grades, médianes S0,
positions salariales (ratios et coefficients), mode 9-Box et coefficients
Performance, Potentiel et 9-Box. Les valeurs par défaut et les contraintes de
stockage sont décrites dans `docs/COMPENSATION_REFERENCES.md` et
`docs/DATA_DICTIONARY.md`.

## Grilles

- Le référentiel comprend 5 familles de métiers et 6 grades.
- Les directeurs sont hors grille.
- La médiane de référence est S0.
- Les positions sont S1- à S7- et S1+ à S7+.
- Le pas entre positions de référence est de 5 %.
- S7- correspond à 65 % de S0.
- S7+ correspond à 135 % de S0.
- Sout- désigne une position inférieure à 65 %.
- Sout+ désigne une position supérieure à 135 %.

### Classement en position (convention JRB Compensation Studio)

Règle produit du Lot 2A-2 (moteur individuel), indépendante de toute
convention historique non documentée :

- classer au **point de référence le plus proche** parmi 65 %, 70 %, …, 135 % ;
- comparaison exacte par produits croisés / distances en `BigInt`
  (`|salary × 10000 − s0 × R|`) ;
- en cas d’égalité à mi-chemin, retenir le **ratio supérieur** ;
- ratio strictement `< 65 %` → Sout- ;
- ratio strictement `> 135 %` → Sout+ ;
- en particulier, 132,5 % à 135 % inclus → S7+ ;
- le ratio **affiché** (basis points, arrondi half-up, deux décimales) ne
  sert jamais au classement.

## 9-Box

- Les codes de case vont de 1 à 9 (propriété visuelle / historique).
- La clé métier d’un facteur 9-Box est le couple sémantique
  **Performance × Potentiel** (`low` / `medium` / `high` × idem), pas le
  numéro de case ni l’orientation de la matrice.
- Quatre modes sont disponibles :
  1. aucun effet ;
  2. performance uniquement ;
  3. 9-Box complète ;
  4. performance avec modulation du potentiel.
- Les coefficients sont reparamétrables.
- Deux orientations de présentation (Lot 2A-1) :
  1. `performance_rows_potential_columns` (défaut Orange) — performance en
     lignes, potentiel en colonnes ;
  2. `performance_columns_potential_rows` — performance en colonnes, potentiel
     en lignes.
- L’orientation n’affecte pas le facteur métier d’un couple
  Performance/Potentiel ; elle transpose uniquement l’affichage.
- Ordre d’affichage (non paramétrable au Lot 2A-1) :
  - lignes : haut = high, milieu = medium, bas = low ;
  - colonnes : gauche = low, centre = medium, droite = high.

### Facteur d’évaluation et poids individuel (Lot 2A-2)

- **Facteur** ≠ **montant** : le facteur module la pondération ; le montant
  d’augmentation n’est pas calculé dans ce sous-lot.
- Échelle uniforme du facteur d’évaluation : **1 000 000** (= 1,000) :
  - `none` → 1 000 000 ;
  - `performance_only` → `performanceMilli × 1000` ;
  - `full_nine_box` → `nineBoxMilli × 1000` ;
  - `performance_potential` → `performanceMilli × potentialMilli`.
- Données individuelles requises :
  - `none` : aucune ;
  - `performance_only` : Performance ;
  - `full_nine_box` : Performance + Potentiel ;
  - `performance_potential` : Performance + Potentiel.
- **Poids individuel** = `positionFactorMilli × evaluationFactorScaled`,
  échelle uniforme **1 000 000 000**, sans arrondi prématuré.
- Sous-performant confirmé : poids théorique conservé dans la trace ;
  poids effectif = 0 ; `blockingReason = CONFIRMED_UNDERPERFORMER` ;
  les données du mode restent obligatoires.
- Salaire `≤ 0` → erreur `INVALID_SALARY` ; S0 absent ou `≤ 0` → `INVALID_S0`.

## Budget

- Le budget est global et ne constitue pas un taux individuel garanti.
- Les directeurs sont exclus de l’assiette (résolution d’assiette hors Lot 2A-3).
- Une consommation exacte du budget n’est **pas** forcée après arrondi
  individuel : le montant réel de l’opération est la somme des montants
  individuels finaux arrondis, et peut différer légèrement du budget cible.
- Certains salariés peuvent recevoir moins ou plus que le taux annoncé.

### Budget cible et répartition (Lot 2A-3 — convention JRB)

Trois responsabilités séparées, calculs exacts en fractions `BigInt` :

1. **Résoudre** le budget cible (`resolveBudgetTarget`) — aucun arrondi ;
2. **Allouer** théoriquement selon les poids effectifs
   (`allocateTheoreticalPopulationBudget`) — aucun arrondi ;
3. **Arrondir** uniquement chaque montant individuel final
   (`roundPopulationAllocations`).

Modes de budget (toujours explicites) :

- `manual_amount` : le montant saisi **est** le budget cible (`N / 1`) ;
  aucun calcul ; assiette et taux éventuellement fournis sont **ignorés** ;
  aucune obligation de divisibilité par le pas d’arrondi.
- `percentage_of_eligible_payroll` :
  `eligiblePayrollFcfa × budgetRateBasisPoints / 10_000` (fraction réduite) ;
  l’assiette éligible est fournie en entrée (non calculée dans ce lot) ;
  le budget peut rester fractionnaire.

Répartition théorique : `part = budget × poids / Σpoids` ; somme exacte des
parts = budget cible. Poids nuls → part nulle. Pas de méthode des plus forts
restes ni de réconciliation forcée.

### Base de répartition budgétaire (Lot 2A-4 — convention JRB)

Le poids transmis à l’allocation n’est **pas** le poids matriciel seul :

`allocationWeight = salaryFcfa × effectiveMatrixWeight`

Conséquence : deux salariés au même poids matriciel effectif reçoivent le même
**taux** théorique d’augmentation ; leurs montants sont proportionnels à leurs
salaires.

Formules équivalentes (fractions BigInt exactes, sans arrondi) :

- `totalAllocationWeight = Σ(salary × effectiveMatrixWeight)`
- `calibrationCoefficient = budgetTarget / totalAllocationWeight`
- `theoreticalIncreaseRate = calibrationCoefficient × effectiveMatrixWeight`
- `theoreticalIncreaseAmount = salary × theoreticalIncreaseRate`
  (= `budget × allocationWeight / totalAllocationWeight`)

Identique pour `manual_amount` et `percentage_of_eligible_payroll`.

Arrondi individuel : politique explicite (`nearest_half_up`, `stepFcfa`
paramétrable : 1, 5, 10, 100, 1000… — **pas figé à 5 FCFA**).
Montant réel = Σ montants arrondis ; écart total = montant réel − budget cible
(exposé, non corrigé).

## Éligibilité

- Les CDI et CDD sont inclus.
- Une ancienneté minimale de 12 mois au 31 décembre N-1 est requise.
- La période d’essai doit être terminée.
- Les intérimaires et prestataires sont exclus.
- En cas de disponibilité hors groupe, les actions sont gelées.

## Ancienneté

- L’ancienneté représente 1 % du salaire de base courant.
- Elle est appliquée à la date anniversaire.
- Elle est hors enveloppe annoncée.

## Import de population (Lot 1C)

Le Lot 1C ne calcule ni éligibilité ni augmentation. Il persiste un instantané
salarié par campagne, aligné sur les règles ci-dessous pour alimenter le futur
moteur.

- **Périmètre contrats** : CDI et CDD importables ; intérimaires (`temporary`)
  et prestataires (`contractor`) enregistrés mais exclus de l’éligibilité future
  conformément aux règles validées.
- **Statut d’emploi** : la disponibilité hors groupe (`external_availability`)
  doit être identifiable pour le gel d’actions prévu au calcul.
- **Unicité** : un matricule par salarié et par lot ; doublon dans le fichier
  = rejet global de l’import.
- **Famille et grade** : codes parmi le référentiel Lot 1B de la campagne ;
  comparaison insensible à la casse.
- **Salaire décembre N-1** : entier FCFA strictement positif ; sert de base au
  futur périmètre budgétaire.
- **Champs optionnels** : code 9-Box (1–9), sous-performant confirmé, montants
  de promotion, correction et mesure RH/sociale (≥ 0 FCFA).
- **Intégrité** : aucun import partiel ; remplacement atomique de la population
  courante ; historique des lots conservé (`current` / `superseded`).
- **Campagne archivée** : import bloqué (lecture seule).
- **Fichier source** : non conservé sur disque après import ; seules les données
  normalisées et métadonnées du lot sont persistées.

Détails techniques : `docs/HR_IMPORT.md`.

## Préparation de simulation (Lot 2B-1)

Règles de readiness (sans calcul d’allocation) :

- Campagnes `draft` et `active` : préparation autorisée.
- Campagne `archived` : consultation possible, nouvelle simulation bloquée ;
  le statut n’est pas modifié par la préparation.
- Population : uniquement le lot RH `current` ; lots `superseded` ignorés.
- Mapping déterministe vers `PreparedEmployeeCalculationInput` ; aucune valeur
  par défaut silencieuse (notamment `confirmedUnderperformer`).
- Niveaux Performance/Potentiel : valeurs canoniques `low` / `medium` /
  `high` (aliases FR normalisés explicitement).
- Orientation 9-Box : métadonnée de rapport uniquement, hors moteur.
- Configuration budget / arrondi : section distincte de la population et des
  référentiels ; absente ⇒ non prêt, sans masquer les autres issues.

Détails : `docs/CAMPAIGN_SIMULATION.md`.

## Configuration de simulation (Lot 2B-2)

- Deux modes de budget explicites (aucun défaut silencieux) : montant saisi ;
  pourcentage de masse éligible saisie.
- Montant manuel : entier FCFA ≥ 0, non arrondi au pas individuel.
- Taux : conversion exacte en basis points (max 2 décimales, sans flottant).
- Budget cible exact éventuellement fractionnaire ; jamais arrondi au pas.
- Pas d’arrondi individuel paramétrable (mode `nearest_half_up`), non figé à 5.
- Configuration validée uniquement en mémoire de session ; invalidée à toute
  modification ; isolée par campagne.
- Campagne archivée : lecture seule (pas de nouvelle validation).

## Exécution de simulation (Lot 2B-3)

- Lancement **explicite** uniquement (« Lancer la simulation »).
- Pas d’appel moteur à l’ouverture, saisie, readiness ou validation seule.
- Empreinte des sources : toute divergence après validation bloque l’exécution
  (`SIMULATION_INPUTS_CHANGED_AFTER_VALIDATION`).
- Atomicité : pas de résultat partiel présenté comme valide.
- Résultat courant invalidé (stale) si données ou configuration changent.
- Isolation mémoire par campagne ; rien après redémarrage.
- `finalSalaryFcfa` = affichage dérivé BigInt (`salaire + augmentation finale`),
  hors mutation du résultat moteur.
- Persistance / historique UI / export reportés au Lot 2B-4B.

## Persistance de simulation (Lot 2B-4A)

- Enregistrement **explicite** d’un snapshot immuable (append-only).
- Pas d’enregistrement automatique après calcul.
- Vérification fingerprints / lot courant / statut avant sauvegarde.
- Grands entiers et fractions en TEXT canonique (pas de REAL / Number).
- Aucune mise à jour ni suppression métier des runs enregistrés.

## Autres règles

- Un sous-performant confirmé reçoit 0 % matriciel.
- Une mesure RH ou sociale distincte et motivée reste possible.
- En cas de promotion, un complément est accordé seulement si la cible
  matricielle dépasse l’augmentation de promotion déjà reçue.
- La correction Sout- est distincte et peut être étalée sur deux ans.
- L’arrondi final individuel est effectué au multiple d’un pas paramétrable
  (politique `nearest_half_up`) ; le pas n’est pas figé à 5 FCFA.
- Tout dépassement S7+ est signalé à la RH.
- Le bonus de performance est hors périmètre.
