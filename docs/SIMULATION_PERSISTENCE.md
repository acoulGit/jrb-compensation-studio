# Persistance des simulations — Lot 2B-4A

## Rôle

Le Lot **2B-4A** enregistre durablement dans SQLite une simulation **réussie**
et **courante** produite par le Lot 2B-3. L’enregistrement est **explicite**
(service applicatif) ; il n’est **pas** déclenché automatiquement après le
calcul.

Le Lot **2B-4B** (ultérieur) branchera l’interface Historique sur les
repositories créés ici.

## Sémantique result_schema_version (Lot 2B-P1)

| Version | Statut | Lecture |
| --- | --- | --- |
| 1 | Incompatible (budget traité comme mensuel) | Afficher un avertissement ; **ne pas** recalculer ni convertir |
| 2 | Incomplet (contrat ≤ 2 ; ni mois, ni ancienneté, ni minimum persistés) | Présentable avec message d’incomplétude ; **aucun recalcul** |
| 3 | **Courante** (contrat v4 : période configurable, ancienneté, minimum, trajectoire mensuelle) | Lecture complète |

Nouvelles écritures : `RESULT_SCHEMA_VERSION = 3` (Rust + memory), introduite
par la migration `0007`. La constante `RESULT_SCHEMA_VERSION_V2 = 2` est
conservée pour la classification de compatibilité en lecture.

**Compatibilité (`resultSchemaCompatibility`)** : v3 = `current` ; v2 =
`incomplete` (présentable, message dédié, sans faux zéros) ; v1 =
`incompatible` ; toute autre version = `unknown` (refusée).

**Lot 2B-P1** : `assertSimulationResultPersistable` autorise désormais
`calculationContractVersion = 4` avec `resultSchemaVersion = 3`, et **refuse**
toujours un contrat ≥ 3 avec un schema < 3
(`SIMULATION_SNAPSHOT_SCHEMA_REQUIRES_CONSOLIDATION`). Le snapshot reste
append-only et n’est jamais recalculé.

## Audit legacy — réutilisation des colonnes 0005

Les colonnes 0005 conservent leur sémantique « période d’effet » ; elles ne
sont **pas** réinterprétées par le schema v3 :

| Colonne 0005 | Sémantique conservée |
| --- | --- |
| `budget_target_*` | enveloppe de la période d’effet |
| `theoretical_total_*` | allocation théorique de la période |
| `actual_operation_amount_fcfa_text` | coût effectif de campagne (période) |
| `total_rounding_delta_*` | delta d’arrondi de la période (combiné) |
| `campaign_year` | déjà présent |
| `result_schema_version` | déjà présent (passe à 3 en écriture) |

Les alias `annual*` côté TypeScript restent transitionnels et sont mappés vers
ces colonnes ; aucun champ `annual*` n’est réutilisé silencieusement pour une
autre sémantique.

## Trajectoire mensuelle (schema v3)

Chaque salarié enregistré en schema v3 porte exactement **12 lignes** dans
`compensation_simulation_employee_month_results` (mois 1→12), écrites dans la
même transaction que le run et les salariés. Règle « tout ou rien » : la
trajectoire est fournie pour tous les salariés ou pour aucun (schema v2
rétro-compatible). Les codes de calendrier sont stables et stockés tels quels :

- `payment_timing` : `outside_campaign` | `reminder` | `direct`
- `promotion_payment_timing` : `outside_campaign` | `reminder` | `direct` |
  `not_applicable` (dérivé de `promotionActive` + `paymentTiming`, sans recalcul
  métier)

## Snapshot immuable

Une simulation enregistrée est un snapshot append-only :

- campagne (nom, année, statut au moment du run) ;
- lot RH courant et empreintes sources / configuration ;
- budget cible exact (fractions en texte) ;
- politique d’arrondi ;
- synthèse population ;
- tous les résultats salariés + `explanation_steps_json`.

Elle **n’est jamais recalculée** automatiquement lorsque la population, les
référentiels, le budget ou le statut de campagne changent.

## Sauvegarde explicite

Service : `saveCurrentCampaignSimulation`.

Gardes :

- `executionStatus === success` ;
- résultat non stale ;
- campagne draft/active (pas archivée) ;
- configuration validée alignée sur le résultat ;
- lot RH courant inchangé ;
- fingerprint sources recalculé identique.

Écriture : `SimulationHistoryRepository.saveSimulationRun` → commande Rust
`save_simulation_run`.

## Tables (migrations 0005 + 0007)

- `compensation_simulation_runs` (colonnes contrat v4 ajoutées en 0007)
- `compensation_simulation_employee_results` (`ON DELETE CASCADE` ; colonnes
  contrat v4 ajoutées en 0007)
- `compensation_simulation_employee_month_results` (nouveau en 0007 ;
  `ON DELETE CASCADE` ; `UNIQUE(employee_result_id, month)`)

`UNIQUE(campaign_id, run_number)` — `run_number` = `MAX+1` transactionnel
par campagne. Détail des colonnes : voir `DATABASE_SCHEMA.md`.

## Stockage des grands entiers

Pas de `REAL`. Montants et fractions stockés en **TEXT** décimal canonique
(`25000003`, `-3`, dénominateurs strictement positifs). Validation côté Rust
et helpers TS `canonicalDecimalText`.

## Transaction Rust

Connexion SQLx dédiée (`sqlite_local`) : WAL, `busy_timeout=5000`,
`foreign_keys=ON`, `BEGIN` réel, insert run + lignes, vérification
`COUNT(*)`, commit, fermeture explicite. Rollback complet en cas d’erreur.
Pas de `BEGIN`/`COMMIT` via le pool Tauri SQL.

## Append-only

Aucune méthode update/delete dans ce sous-lot. Une nouvelle sauvegarde crée
un nouveau `run_number`.

## Lecture (ports prêts, sans UI 2B-4B)

- `listSimulationRuns(campaignId, { limit, offset })` — tri `run_number` DESC
- `getSimulationRun(runId)` — attache la trajectoire mensuelle (schema v3)
- `listSimulationEmployeeResults(runId)` — tri `employee_id`
- `listSimulationEmployeeMonthResults(employeeResultId)` — tri `month` (1→12)

## Hors périmètre 2B-4A

- bouton « Enregistrer » ;
- page / onglet Historique ;
- comparaison, export, suppression.
