# Dictionnaire de données initial

## Conventions

- Les noms techniques de domaine sont en anglais et en `camelCase`.
- Les colonnes SQLite sont en `snake_case`.
- Les montants monétaires futurs sont exprimés en FCFA. Le stockage devra
  éviter les nombres flottants pour les montants.
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

## Données importées (lots ultérieurs)

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

## Paramètres métier futurs

Les paramètres salariaux (budget annoncé, mode 9-Box, coefficients, familles,
grades, médianes S0 et positions) seront versionnés lors des lots de
paramétrage. Ils ne sont pas encore stockés dans SQLite.

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
