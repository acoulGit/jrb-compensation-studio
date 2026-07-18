# Architecture

## Vue d’ensemble

JRB Compensation Studio est une application Windows monoposte construite avec
Tauri 2. Tauri fournit la fenêtre native et le packaging ; React rend
l’interface ; TypeScript sécurise les contrats du front. Le code Rust reste
minimal tant qu’aucune capacité native métier n’est nécessaire.

L’application est conçue hors ligne. En production, le contenu web est embarqué
dans l’exécutable : il n’existe ni serveur applicatif, ni API distante, ni
télémétrie. Le serveur Vite local est exclusivement un outil de développement.

## Organisation du code

- `src/app` assemble l’application et son état global minimal.
- `src/components/layout` contient le cadre visuel partagé.
- `src/components/navigation` définit et rend la navigation.
- `src/components/ui` contient les composants de présentation réutilisables.
- `src/config` contient la configuration locale provisoire.
- `src/pages` compose les écrans fonctionnels.
- `src/domain` accueillera le modèle métier pur par sous-domaine.
- `src/services` orchestrera les cas d’usage sans dépendre de React.
- `src/infrastructure` adaptera le stockage, les imports et les exports.
- `src/tests` contient les tests du front.
- `src-tauri` contient l’hôte natif et ses capacités explicites.

Cette séparation vise une dépendance orientée vers le domaine : l’interface et
l’infrastructure pourront utiliser les contrats métier, tandis que le domaine
ne dépendra ni de React, ni de Tauri, ni de SQLite.

## Persistance SQLite future

SQLite n’est pas inclus dans le lot de fondation. Son ajout futur devra :

- rester local à la machine ;
- passer par une couche `infrastructure/database` ;
- appliquer des migrations versionnées et testées ;
- définir les règles de transaction, sauvegarde et reprise ;
- éviter de journaliser des données RH ;
- exposer aux services des interfaces indépendantes du moteur SQL.

Le choix du chiffrement au repos et de la gestion de clé doit être traité comme
une décision de sécurité explicite avant l’import de données réelles.

## Réseau et capacités Tauri

Aucune fonction produit ne nécessite le réseau. La politique est de ne déclarer
aucune permission HTTP, shell, système de fichiers généraliste ou ouverture
externe. Toute future capacité native devra être minimale, justifiée, limitée à
la fenêtre concernée et accompagnée de tests.

Le schéma distant référencé dans `tauri.conf.json` sert uniquement à l’aide de
validation des outils ; il n’est pas chargé par l’application exécutée. La CSP
devra être explicitée avant l’introduction de contenu dynamique complexe.

## Stratégie de tests

- Tests unitaires du domaine pour chaque règle et cas limite.
- Tests de composants pour le rendu, l’accessibilité et la navigation.
- Tests de contrats sur les imports, exports et adaptateurs SQLite.
- Jeux de données exclusivement synthétiques dans `test-data/fixtures`.
- Résultats attendus versionnés dans `test-data/expected-results`.
- Tests d’intégration Tauri ciblés sur les seules commandes natives.
- Build web et bundle Windows vérifiés avant livraison.

Les futurs calculs devront utiliser des cas nominaux, bornes de grille, cas
Sout-/Sout+, exclusions, arrondis et preuves de conservation budgétaire.

## Personnalisation client

La configuration initiale dans `src/config/branding.ts` centralise le nom du
produit, l’organisation, le sous-titre et le pied de rapport. Elle est
provisoire et non persistée. Une évolution future pourra charger une
configuration locale validée, sans modifier le code ni contacter un service
distant. Les paramètres de marque doivent rester distincts des règles métier.

## Décisions à venir

- Modèle SQLite et stratégie de migration.
- Protection des données et sauvegardes.
- Contrats d’import et d’export Excel.
- Représentation exacte des montants et conventions d’arrondi.
- Politique CSP de production.
