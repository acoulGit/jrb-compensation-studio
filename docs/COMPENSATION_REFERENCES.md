# Référentiels de rémunération — Lot 1B

## Périmètre

Ce lot permet de configurer, **par campagne**, les paramètres de rémunération
utilisés ultérieurement par le moteur de calcul :

- 5 familles de métiers ;
- 6 grades (directeurs hors grille) ;
- matrice des médianes mensuelles S0 (5 × 6) ;
- 17 positions salariales (Sout- à Sout+) ;
- coefficients d’augmentation liés aux positions ;
- coefficients Performance, Potentiel et 9-Box ;
- mode 9-Box de la campagne ;
- indicateur de complétude du référentiel.

Hors périmètre : salariés, import, calcul individuel, budget, simulation,
promotion, ancienneté, corrections, export, sauvegarde automatisée, chiffrement.

## Rattachement par campagne

Chaque référentiel est rattaché à une campagne via `campaign_id`. Deux
campagnes peuvent avoir des paramètres différents afin de préserver
l’historique des décisions. Une campagne archivée reste consultable en
**lecture seule**.

## Familles et grades

Valeurs de démarrage génériques (modifiables) :

| Code | Libellé initial |
| --- | --- |
| F1…F5 | Famille 1…5 |
| G1…G6 | Grade 1…6 |

L’interface permet uniquement la modification du code et du libellé. Aucun
ajout ni suppression. Les codes sont normalisés en majuscules.

## Matrice S0

Trente cellules (`campaign_salary_grid`). Montants mensuels en FCFA, entiers
strictement positifs, ou `NULL` pour « Non configuré ». Aucune valeur fictive
n’est préremplie. Aucun calcul dérivé (S7-, S7+, etc.) n’est exécuté.

## Positions salariales

Dix-sept lignes dont les **ratios de référence** sont fixes (règles validées)
et les **coefficients** sont reparamétrables.

### Stockage des ratios (`reference_ratio_bps`)

Entiers en basis points : `10000` = 100,00 %, `6500` = 65,00 %,
`13500` = 135,00 %. `NULL` pour Sout- (< 65 %) et Sout+ (> 135 %).

### Stockage des coefficients (`*_factor_milli` / `position_factor_milli`)

Entiers en millièmes : `1000` = 1,000 ; `1300` = 1,300 ; `100` = 0,100.
Plage autorisée : 0 à 10 000 (soit 0 à 10 inclus). Pas de type `REAL` pour les
paramètres destinés aux futurs calculs.

## Modes 9-Box

| Valeur technique | Libellé |
| --- | --- |
| `none` | Aucun effet |
| `performance_only` | Performance uniquement |
| `full_nine_box` | 9-Box complète |
| `performance_potential` | Performance × Potentiel |

## Coefficients par défaut

- Positions : Sout- 1,300 … S0 0,900 … Sout+ 0,100 (voir migration 0002).
- Performance : Faible 0,250 ; Moyenne 1,000 ; Élevée 1,250.
- Potentiel : Faible 0,950 ; Moyen 1,000 ; Élevé 1,050.
- 9-Box cases 1→9 : 0,200 ; 0,800 ; 1,100 ; 0,250 ; 1,000 ; 1,250 ; 0,300 ;
  1,100 ; 1,400.

## Complétude

Le référentiel est **Prêt** lorsque structure, grille S0 (30/30), positions et
exigences du mode sélectionné sont satisfaites. Sinon **À compléter**.

La complétude n’empêche pas l’activation d’une campagne dans ce lot ; elle
s’affiche comme information / avertissement.

## Initialisation

- Migration `0002` : seed idempotent (`INSERT OR IGNORE`) de toutes les
  campagnes existantes.
- Nouvelle campagne : initialisation atomique (transaction SQLite) ou via le
  service pour le dépôt mémoire.
- Réentrée sans doublons ni écrasement des valeurs déjà configurées.

## Moteur de calcul

Aucun calcul salarié n’est exécuté. Les paramètres sont uniquement stockés et
validés pour les lots ultérieurs décrits dans `CALCULATION_CONTRACT.md`.
