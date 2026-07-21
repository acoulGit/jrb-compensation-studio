# Persistance des simulations — Lot 2B-4A

## Rôle

Le Lot **2B-4A** enregistre durablement dans SQLite une simulation **réussie**
et **courante** produite par le Lot 2B-3. L’enregistrement est **explicite**
(service applicatif) ; il n’est **pas** déclenché automatiquement après le
calcul.

Le Lot **2B-4B** (ultérieur) branchera l’interface Historique sur les
repositories créés ici.

## Sémantique result_schema_version (correctif 2A-H1)

| Version | Statut | Lecture |
| --- | --- | --- |
| 1 | Obsolète (budget traité comme mensuel) | Afficher un avertissement ; **ne pas** recalculer ni convertir |
| 2 | Courante pour écritures historiques (contrat ≤ 2) | Budget/totaux annuels ; montants salariés mensuels |
| 3 | À consolider (contrat 3 / période configurable) | Non écrit tant que non livré |

Nouvelles écritures : `RESULT_SCHEMA_VERSION = 2` (Rust + memory). Schéma SQL
0005 inchangé ; pas de migration 0006 (dérivation exacte × 12).

**Lot 2A-H2D-1** : un résultat avec `calculationContractVersion >= 3` est
**refusé** à l’enregistrement tant que le schema snapshot reste à 2
(`assertSimulationResultPersistable` →
`SIMULATION_SNAPSHOT_SCHEMA_REQUIRES_CONSOLIDATION`). Le calcul et
l’affichage restent possibles.

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

## Tables (migration 0005)

- `compensation_simulation_runs`
- `compensation_simulation_employee_results` (`ON DELETE CASCADE`)

`UNIQUE(campaign_id, run_number)` — `run_number` = `MAX+1` transactionnel
par campagne.

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

## Lecture (sans UI 2B-4A)

- `listSimulationRuns(campaignId, { limit, offset })` — tri `run_number` DESC
- `getSimulationRun(runId)`
- `listSimulationEmployeeResults(runId)` — tri `employee_id`

## Hors périmètre 2B-4A

- bouton « Enregistrer » ;
- page / onglet Historique ;
- comparaison, export, suppression.
