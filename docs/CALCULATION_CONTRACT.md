# Contrat de calcul

## Objet et statut

Ce document fixe l’enchaînement attendu du futur moteur afin de rendre les
résultats explicables et testables. Il ne définit aucune formule exécutable.

> **Statut général : À implémenter dans un lot ultérieur.**

## Lot 1B — stockage des paramètres uniquement

Le Lot 1B persiste les paramètres de référence par campagne (familles, grades,
grille S0, positions, coefficients et mode 9-Box) dans les tables
`campaign_reference_*`. Aucune formule exécutable n’est introduite : le moteur
ne calcule ni positionnement, ni proposition matricielle, ni consommation
budgétaire.

Les étapes **4. Positionnement dans la grille** et **5. Application du mode
9-Box** consommeront ultérieurement ces tables (`campaign_salary_grid`,
`campaign_salary_positions`, `campaign_reference_config`,
`campaign_performance_factors`, `campaign_potential_factors`,
`campaign_nine_box_factors`) comme instantané versionné des paramètres de la
campagne.

## Lot 1C — import population sans calcul

Le Lot 1C importe et versionne la population salariée par campagne (tables
`hr_import_batches`, `hr_import_employees`). **Aucune étape de ce contrat
n’est exécutée** : pas de détermination d’éligibilité, pas de positionnement,
pas de proposition matricielle, pas de consolidation budgétaire.

Les données importées (contrat, statut, date d’embauche, salaire décembre N-1,
9-Box, sous-performant confirmé, montants promotion/correction/mesure) seront
consommées aux étapes 1 à 12 lors de l’implémentation du moteur. L’import valide
déjà la forme et la cohérence référentielle des entrées, mais ne produit aucun
résultat calculé ni alerte métier de calcul (S7+, consommation budget, etc.).

## Principes

- Une exécution utilise un instantané versionné des données et paramètres.
- Les montants intermédiaires conservent leur précision ; l’arrondi final est
  appliqué uniquement à l’étape prévue.
- Chaque exclusion, alerte, correction et décision doit rester traçable.
- Les paramètres manquants ou incohérents empêchent la validation du scénario.

## Ordre futur des calculs

### 1. Validation des entrées

Contrôler les champs obligatoires, types, dates, codes de référentiel,
unicité des matricules et cohérence des paramètres.

**À implémenter dans un lot ultérieur.**

### 2. Détermination du périmètre budgétaire

Identifier la population incluse dans la masse salariale de décembre N-1 et
exclure les directeurs conformément aux règles validées.

**À implémenter dans un lot ultérieur.**

### 3. Calcul de l’éligibilité individuelle

Évaluer contrat, ancienneté au 31 décembre N-1, fin de période d’essai et statut
d’emploi. Geler les actions en cas de disponibilité hors groupe.

**À implémenter dans un lot ultérieur.**

### 4. Positionnement dans la grille

Rattacher famille, grade et médiane S0, puis déterminer la position salariale et
les cas Sout- ou Sout+.

**À implémenter dans un lot ultérieur.**

### 5. Application du mode 9-Box

Appliquer le mode sélectionné et ses coefficients reparamétrables. Le
sous-performant confirmé reçoit 0 % matriciel.

**À implémenter dans un lot ultérieur.**

### 6. Détermination de la proposition matricielle

Produire la cible individuelle à partir du positionnement et des coefficients,
sans présumer qu’elle équivaut au taux budgétaire annoncé.

**Formules à définir et à implémenter dans un lot ultérieur.**

### 7. Traitement de la promotion

Calculer uniquement le complément éventuel lorsque la cible matricielle dépasse
l’augmentation de promotion déjà reçue.

**À implémenter dans un lot ultérieur.**

### 8. Traitement des corrections et mesures distinctes

Isoler la correction Sout-, y compris son étalement éventuel, ainsi que les
mesures RH ou sociales motivées. Ne pas les confondre avec la proposition
matricielle.

**À implémenter dans un lot ultérieur.**

### 9. Ancienneté hors enveloppe

Calculer l’ancienneté à la date anniversaire sur le salaire de base courant et
la conserver hors de l’enveloppe annoncée.

**À implémenter dans un lot ultérieur.**

### 10. Consolidation budgétaire et ajustement

Comparer la somme des composantes incluses au budget global. Un mécanisme futur
pourra permettre une consommation exacte sans transformer le taux annoncé en
garantie individuelle.

**Règles d’ajustement à valider et à implémenter dans un lot ultérieur.**

### 11. Arrondi final

Appliquer l’arrondi final au multiple de 5 FCFA, puis mesurer et documenter
l’éventuel effet d’arrondi sur la consommation.

**Convention d’arrondi à préciser et à implémenter dans un lot ultérieur.**

### 12. Contrôles et alertes

Signaler notamment les dépassements S7+, données invalides, paramètres absents
et écarts budgétaires. Produire les éléments de preuve associés.

**À implémenter dans un lot ultérieur.**

## Sorties attendues

Le futur résultat devra distinguer proposition matricielle, complément de
promotion, correction, mesure sociale, ancienneté, total final, alertes et
consommation budgétaire. Aucun de ces éléments n’est calculé dans les lots
fondation (1A), référentiels (1B) ni import population (1C).
