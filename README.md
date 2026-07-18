# JRB Compensation Studio

Application Windows locale et confidentielle destinée au pilotage des campagnes
d’augmentation salariale.

Le dépôt contient le socle desktop et le Lot 1A de persistance locale SQLite :

- shell navigable ;
- identité de l’organisation persistée ;
- gestion des campagnes (création, activation unique, archivage, restauration) ;
- documentation métier et schéma de base.

Il ne contient encore ni données RH, ni import Excel, ni moteur de calcul.

## Prérequis

- Windows 11
- Node.js et pnpm
- Rust stable avec la cible MSVC
- Prérequis système de Tauri 2

## Commandes

```text
pnpm install
pnpm test
pnpm build
pnpm tauri dev
pnpm tauri build
```

Sur certains postes Windows où le disque système est saturé, le build Rust peut
nécessiter :

```text
$env:CARGO_TARGET_DIR="D:\dev\jrb-compensation-studio\src-tauri\target"
pnpm tauri build
```

## Persistance locale

- Base : `sqlite:jrb-compensation-studio.db`
- Emplacement : répertoire applicatif Tauri (AppConfig), hors Git
- Détails : `docs/DATABASE_SCHEMA.md`

## Confidentialité

L’application ne charge aucune ressource distante et ne transmet aucune donnée
sur Internet. Les répertoires de données, imports, exports, sauvegardes et jeux
de test réels sont exclus de Git. Les fichiers `*.db` sont ignorés.

Voir `docs/ARCHITECTURE.md` et `docs/PRODUCT_VISION.md` pour les principes du
produit et les limites du lot actuel.
