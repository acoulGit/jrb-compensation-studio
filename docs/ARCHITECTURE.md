# Architecture

## Vue d’ensemble

JRB Compensation Studio est une application Windows monoposte construite avec
Tauri 2. Tauri fournit la fenêtre native et le packaging ; React rend
l’interface ; TypeScript sécurise les contrats du front. Le plugin officiel
`tauri-plugin-sql` (feature `sqlite`) assure la persistance locale.

L’application est conçue hors ligne. En production, le contenu web est embarqué
dans l’exécutable : il n’existe ni serveur applicatif, ni API distante, ni
télémétrie. Le serveur Vite local est exclusivement un outil de développement.

## Organisation du code

- `src/app` assemble l’application, le provider de données et l’état global.
- `src/components/layout` contient le cadre visuel partagé.
- `src/components/navigation` définit et rend la navigation.
- `src/components/ui` contient les composants de présentation réutilisables.
- `src/config` conserve les valeurs initiales de référence (identité client).
- `src/pages` compose les écrans fonctionnels.
- `src/domain` expose les modèles métier purs.
- `src/services` orchestre validations et cas d’usage, sans dépendre de React.
- `src/infrastructure/database` gère la connexion SQLite, les mappers et les
  repositories (SQLite et mémoire pour les tests).
- `src/tests` contient les tests du front.
- `src-tauri` contient l’hôte natif, les migrations SQL et les capacités.

Cette séparation vise une dépendance orientée vers le domaine : l’interface et
l’infrastructure peuvent utiliser les contrats métier, tandis que le domaine
ne dépend ni de React, ni de Tauri, ni de SQLite.

## Persistance SQLite

- Chaîne unique : `sqlite:jrb-compensation-studio.db`
- Fichier hors dépôt, dans le répertoire applicatif Tauri (AppConfig)
- Migrations versionnées dans `src-tauri/migrations/`
- Repositories injectables pour basculer vers des doubles en mémoire en test
- Requêtes exclusivement paramétrées
- Voir `docs/DATABASE_SCHEMA.md`

## Réseau et capacités Tauri

Aucune fonction produit ne nécessite le réseau. Permissions actuelles :

- `core:default`
- `sql:default`
- `sql:allow-execute`

Aucune permission HTTP, shell, opener, filesystem, upload, updater ou
websocket n’est déclarée.

Le schéma distant référencé dans `tauri.conf.json` sert uniquement à l’aide de
validation des outils ; il n’est pas chargé par l’application exécutée. La CSP
reste restrictive (`default-src 'self'`).

## Stratégie de tests

- Tests unitaires des services (validations et transitions de statut).
- Tests de composants avec repositories mémoire (sans runtime Tauri).
- Tests Rust sur la chaîne de connexion et la présence des migrations.
- Jeux de données exclusivement synthétiques dans `test-data/fixtures`.
- Build web et bundle Windows vérifiés avant livraison.

## Personnalisation client

Le profil organisation est persisté dans `organization_profile`. Les valeurs
par défaut restent disponibles dans `src/config/branding.ts` comme référence
de seed, alignée sur la migration SQL. Les paramètres de marque restent
distincts des règles métier.

## Décisions à venir

- Protection des données et sauvegardes.
- Contrats d’import et d’export Excel.
- Représentation exacte des montants et conventions d’arrondi.
- Tables salariés et référentiels.
