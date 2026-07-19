# Import RH — Lot 1C

## Périmètre

Ce lot permet d’importer, **par campagne**, la population salariée à partir d’un
fichier local (Excel ou CSV). L’import produit un instantané versionné en base,
consultable dans l’application (aperçu, population courante, historique des
lots).

Hors périmètre : calcul d’éligibilité, positionnement, proposition
matricielle, budget, simulation, promotion, ancienneté, export, sauvegarde
automatisée, chiffrement, conservation du fichier source sur disque.

## Principe d’import local

L’utilisateur sélectionne un fichier via l’interface web embarquée (input
`<input type="file">`). Le navigateur lit le contenu en mémoire
(`File.arrayBuffer()`) ; aucune permission Tauri filesystem n’est requise. Le
parseur SheetJS analyse le buffer côté frontend ; aucune ressource distante
n’est chargée à l’exécution (la dépendance `xlsx` est bundlée au build).

Le flux est : **sélection fichier → analyse → mapping colonnes → prévisualisation
→ confirmation**. Tant que l’import n’est pas confirmé, aucune écriture en base
n’est effectuée.

## Formats acceptés et refusés

### Acceptés

| Extension | Valeur technique | Remarque |
| --- | --- | --- |
| `.xlsx` | `xlsx` | Classeur Excel moderne |
| `.xls` | `xls` | Classeur Excel legacy |
| `.csv` | `csv` | Fichier texte délimité |

Pour les classeurs multi-feuilles, l’utilisateur choisit la feuille à importer
(maximum 50 feuilles par fichier).

### Refusés

Explicitement exclus : `.xlsm`, `.ods`, `.pdf`, archives compressées, et tout
format non identifié. Les fichiers vides ou illisibles sont également rejetés.

## Limites

| Limite | Valeur |
| --- | --- |
| Taille maximale du fichier | 20 Mo (`MAX_IMPORT_FILE_BYTES`) |
| Lignes de données (hors en-tête) | 20 000 (`MAX_IMPORT_DATA_ROWS`) |
| Feuilles par classeur | 50 |
| Lignes scannées pour détecter l’en-tête | 20 premières lignes |
| Échantillon affiché en prévisualisation | 20 lignes normalisées |
| Pagination population consultée | 50 par défaut, 200 maximum |

Les lignes entièrement vides sont ignorées et ne comptent pas dans la limite de
lignes de données.

## Colonnes obligatoires et facultatives

### Obligatoires

Une valeur exploitable est requise sur chaque ligne importée.

| Champ domaine | Libellé interface | Rôle |
| --- | --- | --- |
| `employeeNumber` | Matricule | Identifiant technique, unique par lot |
| `employeeLabel` | Nom complet | Libellé d’affichage (donnée sensible) |
| `jobFamilyCode` | Famille de métiers | Code parmi les 5 familles du référentiel campagne |
| `gradeCode` | Grade | Code parmi les 6 grades du référentiel campagne |
| `contractType` | Type de contrat | Valeur reconnue (voir ci-dessous) |
| `employmentStatus` | Statut d’emploi | Valeur reconnue (voir ci-dessous) |
| `hireDate` | Date d’embauche | Date d’entrée (ISO `YYYY-MM-DD`) |
| `decemberBaseSalary` | Salaire de base décembre N-1 | Montant FCFA entier strictement positif |

### Facultatives

Si la colonne est absente du mapping, des valeurs par défaut s’appliquent.

| Champ domaine | Libellé interface | Défaut si absent / vide |
| --- | --- | --- |
| `nineBoxCode` | Code 9-Box | `null` |
| `confirmedUnderperformer` | Sous-performant confirmé | `false` |
| `promotionAmount` | Montant de promotion | `0` |
| `correctionAmount` | Montant de correction | `0` |
| `socialMeasureAmount` | Montant mesure RH / sociale | `0` |

Les familles et grades sont résolus par **code** (comparaison insensible à la
casse) vers les identifiants persistés du référentiel Lot 1B de la campagne.

## Aliases d’en-têtes

Les en-têtes source sont normalisés (casse, accents, espaces) puis comparés à
une table d’alias français et anglais. Le mapping automatique associe chaque
champ cible à la **première** colonne source reconnue ; une colonne source déjà
utilisée n’est pas réutilisée.

Exemples d’alias reconnus (liste non exhaustive) :

| Champ cible | Exemples d’en-têtes source |
| --- | --- |
| `employeeNumber` | Matricule, N° matricule, employee number, employee_id |
| `employeeLabel` | Nom complet, Nom et prénoms, employee name, full name |
| `jobFamilyCode` | Famille, Famille de métiers, job family, family code |
| `gradeCode` | Grade, Code grade, job grade |
| `contractType` | Type de contrat, Contrat, contract type |
| `employmentStatus` | Statut, Statut d’emploi, employment status |
| `hireDate` | Date d’embauche, Date d’entrée, hire date, start date |
| `decemberBaseSalary` | Salaire de base décembre, december base salary |
| `nineBoxCode` | 9-Box, Code 9-Box, nine box code |
| `confirmedUnderperformer` | Sous-performant confirmé, underperformer |
| `promotionAmount` | Montant promotion, promotion amount |
| `correctionAmount` | Montant correction, correction amount |
| `socialMeasureAmount` | Mesure RH, mesure sociale, social measure |

L’utilisateur peut corriger manuellement le mapping avant confirmation.

## Types de contrat et statuts d’emploi

### Types de contrat

| Valeur technique | Libellé FR | Alias acceptés (exemples) |
| --- | --- | --- |
| `cdi` | CDI | cdi, permanent |
| `cdd` | CDD | cdd, fixed term |
| `temporary` | Intérimaire | intérim, interim, temporaire, temporary |
| `contractor` | Prestataire | prestataire, consultant, contractor |
| `other` | Autre | autre, other |

Les valeurs `INTERIM` / `PRESTATAIRE` des règles métier globales correspondent
respectivement à `temporary` et `contractor` dans le modèle d’import.

### Statuts d’emploi

| Valeur technique | Libellé FR | Alias acceptés (exemples) |
| --- | --- | --- |
| `active` | Actif | actif, en poste |
| `group_detachment` | Détachement groupe | détachement groupe, detachement |
| `legal_leave` | Congé légal | congé légal, congé |
| `external_availability` | Disponibilité hors groupe | disponibilité hors groupe |
| `suspended` | Suspendu | suspendu |
| `departed` | Départ | sorti, parti, departed |
| `other` | Autre | autre, other |

La disponibilité hors groupe (`external_availability`) sera exploitée par le
futur moteur pour geler les actions ; l’import ne calcule pas encore
d’éligibilité.

## Règles de validation

### Mapping

- Toutes les colonnes **obligatoires** doivent être associées à une colonne
  source (sinon erreur bloquante `missing_required_column`).
- Une même colonne source ne peut pas être mappée sur plusieurs champs cibles
  (`duplicate_column_mapping`).

### Lignes

- **Erreurs bloquantes** (empêchent la confirmation) : matricule ou nom absent ;
  famille ou grade absent ou inconnu dans le référentiel ; contrat ou statut non
  reconnu ; date d’embauche invalide ou future ; salaire décembre absent ou non
  entier strictement positif ; matricule en doublon dans le fichier ; formule
  Excel dans une cellule obligatoire ou dans un montant optionnel mappé.
- **Avertissements** (import possible si le reste est valide) : matricule lu
  comme nombre (perte possible de zéros de tête) ; code 9-Box non reconnu
  (ignoré, `null` conservé) ; drapeau sous-performant non reconnu (défaut
  `false`) ; référentiel de campagne incomplet (`reference_incomplete`) — l’import
  reste autorisé si les codes utilisés existent.

### Formules

Les formules ne sont **jamais** exécutées. Une cellule contenant une formule est
marquée et bloque la ligne (champs obligatoires) ou le montant concerné. Seules
des valeurs fixes sont acceptées.

### Campagne

- Import interdit sur campagne **archivée** (lecture seule).
- Aucun import partiel : voir ci-dessous.

## Gestion des dates

- Format de stockage et d’échange : **ISO `YYYY-MM-DD`**, sans composante
  horaire ni fuseau horaire métier.
- Formats lus : ISO ; `JJ/MM/AAAA`, `JJ-MM-AAAA`, `JJ.MM.AAAA` ; numéro de
  série Excel (époque 1899-12-30, conversion UTC sans décalage local) ; objet
  `Date` SheetJS.
- La date d’embauche ne peut pas être **postérieure** à la date du jour
  (calendrier local de l’application au moment de l’import).
- Les dates sur deux chiffres ou ambiguës sont rejetées.

## Gestion des FCFA

- Tous les montants sont des **entiers** FCFA (pas de décimales, pas de `REAL`
  en base).
- **Salaire décembre N-1** : entier strictement positif ; espaces et suffixe
  « FCFA » tolérés en lecture ; virgule décimale `,00` ignorée en fin de
  chaîne.
- **Montants optionnels** (promotion, correction, mesure) : entiers ≥ 0 ;
  cellule vide → `0`.
- Les nombres flottants non entiers sont rejetés.

## Mapping

1. Détection automatique de la ligne d’en-tête (score d’alias sur les 20
   premières lignes).
2. Proposition de mapping automatique colonne source → champ cible.
3. Ajustement manuel possible avant prévisualisation et confirmation.
4. Validation du mapping puis normalisation ligne à ligne.

## Prévisualisation

L’aperçu est calculé **sans écriture en base**. Il expose :

- nom de fichier, format, feuille, index d’en-tête ;
- mapping retenu ;
- nombre de lignes source, lignes valides, erreurs, avertissements, doublons de
  matricule ;
- liste des issues (code, sévérité, ligne, champ, message) ;
- échantillon de 20 lignes normalisées.

L’utilisateur filtre l’aperçu (toutes / valides / erreurs / avertissements)
avant de confirmer.

## Erreurs et avertissements

| Sévérité | Effet sur la confirmation |
| --- | --- |
| `error` | Bloque la confirmation ; aucune écriture |
| `warning` | N’empêche pas la confirmation si aucune erreur |

Les messages sont affichés en français dans l’interface. Les codes techniques
(ex. `duplicate_employee_number`, `formula_not_allowed`) servent au diagnostic
et aux tests.

## Absence d’import partiel

Si **une seule** ligne est en erreur, ou si le mapping est invalide, la
confirmation est refusée. Il n’existe pas de mode « importer uniquement les
lignes valides ». Le fichier doit être corrigé puis réimporté en entier.

## Remplacement atomique (current / superseded)

Par campagne, un seul lot est **courant** (`status = current`). Lors d’une
confirmation réussie :

1. Transaction SQLite `BEGIN IMMEDIATE` ;
2. le lot courant existant passe à `superseded` ;
3. insertion du nouveau lot `current` et de tous les salariés du fichier ;
4. `COMMIT`.

En cas d’échec, `ROLLBACK` : l’ancienne population reste inchangée. Les lots
historiques (`superseded`) et leurs lignes salariés restent consultables ; ils
ne sont pas supprimés physiquement.

## Historique des lots

Chaque confirmation crée un enregistrement dans `hr_import_batches` avec
métadonnées de source (nom de fichier, format, feuille, taille, compteurs).
L’écran Historique liste les lots par campagne (courant et remplacés), avec
date d’import et statistiques.

## Absence de conservation du fichier source

Seules les **métadonnées** du fichier et la **population normalisée** sont
persistées. Le binaire du classeur ou CSV n’est ni copié dans AppData ni
conservé après la session. Seul le nom de fichier original est mémorisé à titre
informatif.

## Confidentialité

- Traitement entièrement local ; aucun envoi réseau.
- Données salariés hors dépôt Git ; tests avec libellés fictifs uniquement.
- Le matricule est un identifiant technique ; le nom complet est une donnée
  sensible affichée uniquement dans l’application locale.

## Rattachement par campagne

Chaque lot et chaque salarié importé sont rattachés à une `campaign_id`. Un
nouvel import sur une campagne remplace la population courante de **cette**
campagne sans affecter les autres.

## Moteur de calcul

Aucun calcul salarié n’est exécuté dans ce lot. Les données importées
alimentent le futur moteur décrit dans `docs/CALCULATION_CONTRACT.md`
(éligibilité, positionnement, proposition, budget, etc.).

## Documentation associée

- Schéma : `docs/DATABASE_SCHEMA.md` (tables `hr_import_*`)
- Dictionnaire : `docs/DATA_DICTIONARY.md`
- Architecture : `docs/ARCHITECTURE.md`
- Journal : `docs/DEVELOPMENT_LOG.md` (entrée Lot 1C)
