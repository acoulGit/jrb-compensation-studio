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
- Le pas entre positions est de 5 %.
- S7- correspond à 65 % de S0.
- S7+ correspond à 135 % de S0.
- Sout- désigne une position inférieure à 65 %.
- Sout+ désigne une position supérieure à 135 %.

## 9-Box

- Les codes vont de 1 à 9.
- Quatre modes sont disponibles :
  1. aucun effet ;
  2. performance uniquement ;
  3. 9-Box complète ;
  4. performance avec modulation du potentiel.
- Les coefficients sont reparamétrables.

## Budget

- Le budget est exprimé en pourcentage de la masse des salaires de base payés
  en décembre N-1.
- Les directeurs sont exclus.
- Le budget est global et ne constitue pas un taux individuel garanti.
- Une consommation exacte du budget est possible.
- Certains salariés peuvent recevoir moins ou plus que le taux annoncé.

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

## Autres règles

- Un sous-performant confirmé reçoit 0 % matriciel.
- Une mesure RH ou sociale distincte et motivée reste possible.
- En cas de promotion, un complément est accordé seulement si la cible
  matricielle dépasse l’augmentation de promotion déjà reçue.
- La correction Sout- est distincte et peut être étalée sur deux ans.
- L’arrondi final est effectué au multiple de 5 FCFA.
- Tout dépassement S7+ est signalé à la RH.
- Le bonus de performance est hors périmètre.
