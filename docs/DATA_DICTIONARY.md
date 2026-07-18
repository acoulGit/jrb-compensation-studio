# Dictionnaire de données initial

## Conventions

- Les noms techniques sont en anglais et en `camelCase`.
- Les montants monétaires sont exprimés en FCFA. Le futur stockage devra éviter
  les nombres flottants pour les montants.
- Les dates utilisent le format ISO `YYYY-MM-DD`.
- Les valeurs importées restent distinguées des paramètres, résultats calculés
  et décisions RH.
- Les règles de présence et listes de valeurs définitives restent à valider avec
  le modèle d’import.

## Données importées

### `employeeNumber`

Identifiant technique salarié issu de la source RH. Texte obligatoire, unique
dans une campagne. Ne doit pas être affiché comme une donnée nominative dans les
jeux de test.

### `employeeLabel`

Libellé d’affichage du salarié. Texte sensible importé. Les tests et
documentations utilisent exclusivement des libellés fictifs ou anonymisés.

### `jobFamily`

Famille de métiers rattachée au salarié. Valeur attendue parmi les 5 familles
du référentiel configuré.

### `grade`

Grade du salarié. Valeur attendue parmi les 6 grades, avec traitement distinct
des directeurs hors grille.

### `contractType`

Type de contrat. Valeurs métier attendues au minimum : `CDI`, `CDD`,
`INTERIM`, `PRESTATAIRE`.

### `employmentStatus`

Statut d’emploi à la date de référence. Doit permettre d’identifier notamment
la disponibilité hors groupe et les situations actives.

### `hireDate`

Date d’entrée utilisée pour l’évaluation de l’ancienneté au 31 décembre N-1.

### `decemberBaseSalary`

Salaire de base payé en décembre N-1, montant FCFA non négatif. Sert de
référence au budget pour la population incluse.

### `nineBoxCode`

Code 9-Box entier de 1 à 9. Son effet dépend du mode de campagne sélectionné.

### `confirmedUnderperformer`

Booléen indiquant un statut de sous-performant confirmé.

### `promotionAmount`

Montant d’augmentation de promotion déjà reçu, en FCFA. Il sert à déterminer
un éventuel complément, sans être confondu avec celui-ci.

## Paramètres

Les paramètres ne font pas partie des champs salariés importés. Ils comprendront
notamment l’exercice, le budget annoncé, la date de référence, le mode 9-Box,
les coefficients, les familles, grades, médianes S0 et positions de grille.
Leur schéma détaillé sera versionné lors du lot de paramétrage.

## Données calculées

Les données calculées seront produites par le moteur et ne devront pas être
écrasées par l’import : éligibilité, position dans la grille, proposition
matricielle, complément de promotion, ancienneté, total final, consommation et
alertes. Le schéma sera aligné sur `CALCULATION_CONTRACT.md`.

## Décisions RH

### `correctionAmount`

Montant de correction salariale décidé et tracé séparément, notamment pour une
situation Sout-. Valeur FCFA non négative ; son motif et son éventuel étalement
seront définis dans un lot ultérieur.

### `socialMeasureAmount`

Montant d’une mesure RH ou sociale distincte et motivée. Valeur FCFA non
négative, associée à une justification et à l’auteur de la décision dans le
futur modèle.
