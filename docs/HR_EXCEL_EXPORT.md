# Export Excel RH d’une simulation (Lot 2B-E1 / R1)

## Objectif

Produire, à partir d’un **snapshot de simulation persisté** (schema v3 ou v4,
contrats v4/v5), un classeur Excel `.xlsx` destiné aux équipes RH, avec
**protection par mot de passe optionnelle** et **écriture atomique**.

L’export reste une **lecture fidèle** du snapshot immutable : aucun recalcul
moteur, aucune relecture de l’import courant. Les **taux RH lisibles** et les
**statistiques** du tableau de bord sont dérivés exclusivement des montants et
fractions déjà persistés (arithématique rationnelle exacte côté Rust).

Depuis le Lot **2B-RC1-H1** (schema v4) :

- `Resultats_RH` : Effet 9-Box neutralisé, Code 9-Box source, Facteur 9-Box
  effectif, Traitement 9-Box appliqué (libellés français).
- `Tableau_de_bord_RH` : Salariés avec effet 9-Box neutralisé.
- Snapshots v3 : ces cellules restent vides / « Non disponible »
  (aucune invention historique).

## Feuilles produites (ordre)

1. `Tableau_de_bord_RH` — indicateurs, distribution des taux, graphiques
2. `Resultats_RH` — une ligne par salarié
3. `Trajectoire_12_mois` — exactement 12 mois par salarié
4. `Synthese_campagne` — synthèse de campagne
5. `Parametres` — paramètres techniques et empreintes (nom inchangé)

## Taux RH (définitions)

Tous les calculs de taux sont effectués **côté Rust** en fractions exactes.
Conversion décimale uniquement à l’écriture Excel (format `0,00 %`).
Dénominateur NULL / nul / invalide → cellule vide ou « Non disponible »
(jamais de zéro fabriqué).

| Taux | Formule (valeurs persistées) |
| --- | --- |
| **Taux de promotion (%)** | Montant mensuel de promotion ÷ salaire avant promotion (ou fraction `promotion_rate_*` si présente). Montant explicitement `0` → `0,00 %` ; données absentes → vide. |
| **Taux de complément (%)** | Complément compensatoire mensuel réel ÷ salaire de référence (S0). |
| **Taux total d’augmentation de base (%)** | (Promotion mensuelle + complément mensuel) ÷ salaire de base décembre N-1. **Exclut l’ancienneté.** Taux principal des statistiques et de l’histogramme. |
| **Taux d’ancienneté (%)** | Présenté séparément lorsqu’il est disponible ; jamais additionné au taux total dans le tableau de bord. |

Les couples numérateur / dénominateur exacts restent disponibles en **colonnes
techniques en fin de feuille** (ou dans `Parametres`) pour l’audit — ils ne
sont plus les colonnes RH principales.

## Tableau de bord RH

- **Population** : effectif total, éligibles au complément, promus, recevant un
  complément, sans augmentation de base, bénéficiant du minimum garanti.
- **Taux total d’augmentation de base** : min / max / moyen / médian
  (statistiques exactes ; salariés au taux non calculable exclus des stats
  de taux seulement).
- **Budget** : budget de période, coûts de période (promotions, minimum,
  au-dessus du minimum, compensatoire, combiné), delta budgétaire, coût moyen
  par bénéficiaire — agrégats persistés réutilisés lorsqu’ils existent.
- **Tranches de taux** (bornes inclusives à droite, sauf 0 % exact) :
  `0 %` · `> 0 % à 2 %` · `> 2 % à 4 %` · `> 4 % à 6 %` · `> 6 % à 8 %` ·
  `> 8 % à 10 %` · `> 10 %`.
  Les taux non calculables ne sont **pas** classés dans `0 %` ; ils sont
  affichés séparément (« Taux non calculable : N salariés »).
- **Graphique obligatoire** : histogramme
  « Effectifs par tranche de taux d’augmentation » (données de la table,
  aucune formule métier cachée).
- **Graphique P2** : doughnut « Répartition de l’enveloppe d’augmentation »
  (promotions / minimum / au-dessus du minimum) lorsque les coûts de période
  sont disponibles.
- Mention : « Statistiques hors incidence d’ancienneté ».

## Libellés corrigés (période vs annuel)

Les intitulés fondés à tort sur « annuel » pour une valeur de **période de
campagne** sont remplacés, par exemple :

- Coût compensatoire sur la période
- Coût total sur la période
- Coût des promotions sur la période
- Incidence d’ancienneté sur la période

« Plein effet sur 12 mois » est conservé uniquement pour le run-rate
décembre × 12. Dans `Synthese_campagne`, le doublon
« Coût effectif de campagne » / « Coût compensatoire période » est réduit à
un seul indicateur principal : **Coût compensatoire sur la période**.

## Présentation

- En-têtes avec retour à la ligne, filtres automatiques, volets figés.
- Montants `# ##0` / `# ##0 "FCFA"` ; pourcentages `0,00 %` ; dates `jj/mm/aaaa`.
- Codes traduits : `active` → Actif, `cdi`/`cdd` → CDI/CDD, `none` → Aucun,
  booléens → Oui/Non.
- Facteur de position milli → décimal (`1050` → `1,050`) ;
  ratio salaire points de base → pourcentage (`8571` → `85,71 %`).
- Mention « Document confidentiel — Données salariales » sur les feuilles.

## Import RH

Le **format d’import actuel est conservé** sans modification. Le client adapte
ou mappe son fichier RH vers ce format. L’enrichissement éventuel de l’import
est **reporté** à une version ultérieure.

## Portée frontend

- Bouton **Export Excel** sur chaque ligne de l’historique (snapshot v3).
- Dialogue `SimulationExcelExportDialog` : protection, générateur de mot de
  passe, confirmation d’export non protégé.
- Sélection de destination via `@tauri-apps/plugin-dialog`.
- Aucun mot de passe journalisé ni conservé après fermeture.

## Contrat backend (rappel)

Commande `export_simulation_run_excel` (entrée camelCase) :

```jsonc
{
  "simulationRunId": 12,
  "outputPath": "C:\\...\\JRB_Compensation_...xlsx",
  "password": "MotDePasseFort" ,      // ou null
  "confirmUnprotectedExport": false    // true si password == null
}
```

Résultat de succès :

```jsonc
{
  "outputPath": "…",
  "fileName": "…",
  "sizeBytes": 2048,
  "protected": true,
  "employeeCount": 1,
  "monthRowCount": 12
}
```

Erreurs : chaînes françaises (`Result<_, String>`), sans détail technique et
**sans jamais divulguer le mot de passe**.

Commande `generate_hr_export_password` → `{ password, length }` (longueur
garantie ≥ 20, alphabet sans caractères ambigus).

## Principes de sécurité

- **Mot de passe jamais journalisé** ni renvoyé par le backend.
- **Longueur minimale utilisateur : 12 caractères** ; mot de passe généré ≥ 20.
- **Export non protégé** uniquement après confirmation explicite.
- **Écriture atomique** : aucun fichier en clair intermédiaire, aucun
  écrasement d’un fichier existant. Le fichier protégé n’est jamais écrit en
  clair sur disque.
- **Neutralisation des cellules texte** (préfixes `= + - @`, tabulations).

## Recette manuelle — protection (Excel Desktop)

### A. Ouvrir un fichier protégé

1. Double-cliquer le `.xlsx` exporté.
2. Saisir le mot de passe fourni à l’export.
3. Mot de passe erroné → Excel refuse l’ouverture.

### B. Vérifier le chiffrement

Fichier → Informations → **Protéger le classeur** indique qu’un mot de passe
est requis.

### C / D. Modifier ou retirer le mot de passe

Via Fichier → Informations → Protéger le classeur → Chiffrer avec mot de passe.
Un fichier dont le mot de passe est perdu est **irrécupérable**.

### E. Export non protégé (déconseillé)

Confirmation explicite dans le dialogue ; stocker uniquement sur un emplacement
à accès restreint.

## Résumé d’architecture

- **Frontend** (`src/application/campaignSimulation/`) :
  `hrExcelExportModels.ts`, `hrExcelExportErrorMessages.ts`,
  `generateHrExportPassword.ts`, `exportSimulationRunExcel.ts`.
- **UI** : `SimulationExcelExportDialog.tsx`, `SimulationHistoryPage.tsx`.
- **Backend Rust** : `src-tauri/src/simulation_excel_export/`
  (chargement snapshot, `rates` fractions exactes, génération classeur /
  dashboard / graphiques, chiffrement agile, écriture atomique).
