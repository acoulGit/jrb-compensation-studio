# JRB Compensation Studio

Application Windows locale et confidentielle destinée au pilotage des campagnes
d’augmentation salariale.

Le dépôt contient actuellement le socle desktop : shell navigable, composants
UI, configuration client provisoire et documentation métier initiale. Il ne
contient encore ni données RH, ni SQLite, ni import Excel, ni moteur de calcul.

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

## Confidentialité

L’application ne charge aucune ressource distante et ne transmet aucune donnée
sur Internet. Les répertoires de données, imports, exports, sauvegardes et jeux
de test réels sont exclus de Git.

Voir `docs/ARCHITECTURE.md` et `docs/PRODUCT_VISION.md` pour les principes du
produit et les limites du lot actuel.
