# Dictionnaire de données initial

## Conventions

- Les noms techniques de domaine sont en anglais et en `camelCase`.
- Les colonnes SQLite sont en `snake_case`.
- Les montants monétaires futurs sont exprimés en FCFA. Le stockage devra
  éviter les nombres flottants pour les montants.
- **Basis points (`*_bps`)** : entiers ; `10000` = 100,00 %, `6500` = 65,00 %.
  Utilisés pour les ratios de position (`reference_ratio_bps`). `NULL` pour
  Sout- et Sout+ (bornes hors plage fixe).
- **Millièmes (`*_milli`)** : entiers ; `1000` = 1,000. Plage autorisée 0 à
  10 000 (soit 0 à 10 inclus). Utilisés pour les coefficients de position et
  de 9-Box. Aucun type `REAL` pour ces paramètres.
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

## Paramètres de référentiel par campagne (Lot 1B)

Persistés dans les tables `campaign_reference_*`. Voir
`docs/COMPENSATION_REFERENCES.md` pour le périmètre fonctionnel.

### NineBoxMode

| Champ domaine | Colonne SQLite | Nature |
| --- | --- | --- |
| — | `nine_box_mode` (`campaign_reference_config`) | Paramètre de campagne |

Valeurs : `none`, `performance_only`, `full_nine_box`, `performance_potential`.

### JobFamily

| Champ domaine | Colonne SQLite | Nature |
| --- | --- | --- |
| `id` | `id` | Technique |
| `campaignId` | `campaign_id` | Rattachement campagne |
| `code` | `code` | Paramètre de référentiel |
| `label` | `label` | Paramètre de référentiel |
| `sortOrder` | `sort_order` | Ordre d’affichage (1–5) |
| `createdAt` | `created_at` | Technique |
| `updatedAt` | `updated_at` | Technique |

### Grade

| Champ domaine | Colonne SQLite | Nature |
| --- | --- | --- |
| `id` | `id` | Technique |
| `campaignId` | `campaign_id` | Rattachement campagne |
| `code` | `code` | Paramètre de référentiel |
| `label` | `label` | Paramètre de référentiel |
| `sortOrder` | `sort_order` | Ordre d’affichage (1–6) |
| `createdAt` | `created_at` | Technique |
| `updatedAt` | `updated_at` | Technique |

### SalaryGridCell

| Champ domaine | Colonne SQLite | Nature |
| --- | --- | --- |
| `campaignId` | `campaign_id` | Rattachement campagne |
| `jobFamilyId` | `job_family_id` | Clé étrangère structure |
| `gradeId` | `grade_id` | Clé étrangère structure |
| `s0Amount` | `s0_amount` | Médiane mensuelle S0 (FCFA entier ou `null`) |
| `createdAt` | `created_at` | Technique |
| `updatedAt` | `updated_at` | Technique |

### SalaryPosition

| Champ domaine | Colonne SQLite | Nature |
| --- | --- | --- |
| `id` | `id` | Technique |
| `campaignId` | `campaign_id` | Rattachement campagne |
| `code` | `code` | Paramètre de référentiel (ex. `S0`, `S7-`) |
| `label` | `label` | Libellé d’affichage |
| `sortOrder` | `sort_order` | Ordre d’affichage (1–17) |
| `referenceRatioBps` | `reference_ratio_bps` | Ratio fixe en bps (`null` pour Sout- / Sout+) |
| `positionFactorMilli` | `position_factor_milli` | Coefficient reparamétrable en milli |
| `createdAt` | `created_at` | Technique |
| `updatedAt` | `updated_at` | Technique |

### PerformanceFactor / PotentialFactor

| Champ domaine | Colonne SQLite | Nature |
| --- | --- | --- |
| `campaignId` | `campaign_id` | Rattachement campagne |
| `level` | `level` | Niveau (`low` / `medium` / `high`) |
| `label` | `label` | Libellé d’affichage |
| `sortOrder` | `sort_order` | Ordre d’affichage |
| `factorMilli` | `factor_milli` | Coefficient reparamétrable en milli |
| `createdAt` | `created_at` | Technique |
| `updatedAt` | `updated_at` | Technique |

Tables : `campaign_performance_factors`, `campaign_potential_factors`.

### NineBoxFactor

| Champ domaine | Colonne SQLite | Nature |
| --- | --- | --- |
| `campaignId` | `campaign_id` | Rattachement campagne |
| `boxCode` | `box_code` | Code case (1–9) |
| `performanceLevel` | `performance_level` | Niveau performance associé |
| `potentialLevel` | `potential_level` | Niveau potentiel associé |
| `factorMilli` | `factor_milli` | Coefficient reparamétrable en milli |
| `createdAt` | `created_at` | Technique |
| `updatedAt` | `updated_at` | Technique |

Table : `campaign_nine_box_factors`.

### ReferenceCompleteness

Objet calculé côté domaine (`computeReferenceCompleteness`), non persisté.
Indique si le référentiel est **Prêt** ou **À compléter** (structure, grille
S0 30/30, positions, exigences du mode 9-Box sélectionné).

| Champ domaine | Nature |
| --- | --- |
| `ready` | Booléen synthétique |
| `badge` | `"Prêt"` ou `"À compléter"` |
| `completedSections` / `totalSections` / `percent` | Progression agrégée |
| `structureComplete` | Familles et grades valides |
| `salaryGridComplete` / `salaryGridFilledCount` / `salaryGridTotal` | Grille S0 |
| `positionsComplete` | Coefficients de position valides |
| `performanceStatus` / `potentialStatus` / `nineBoxStatus` | Sections selon le mode |
| `nineBoxMode` | Mode actif évalué |
| `issues` | Liste de codes et messages de validation |

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

Les paramètres salariaux de campagne (budget annoncé, enveloppe, scénarios) et
les données salariés ne sont pas encore stockés. Les référentiels par campagne
(grille, positions, coefficients, mode 9-Box) le sont depuis le Lot 1B ; le
moteur de calcul les consommera ultérieurement conformément à
`CALCULATION_CONTRACT.md`.

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
