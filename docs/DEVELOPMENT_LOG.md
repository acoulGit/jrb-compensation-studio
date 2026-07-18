# Journal de développement

## Principes de tenue

Ce journal consigne les choix structurants, vérifications et limites de chaque
lot. Il ne remplace ni l’historique Git ni les règles métier de référence.

## 2026-07-18 — Fondation du shell desktop

### Objectif

Remplacer le template de démonstration par une fondation professionnelle,
locale et navigable, sans données RH ni logique de calcul.

### Choix

- Navigation React par état local : neuf vues simples ne justifient pas
  l’ajout d’un routeur à ce stade.
- Composants et styles locaux, sans framework UI ni police distante.
- Configuration client provisoire en TypeScript, non persistée.
- Suppression de la commande de démonstration et du plugin Tauri d’ouverture
  de liens pour réduire les permissions.
- Tests de rendu et de navigation avec Vitest, Testing Library et jsdom.

### Vérifications attendues

- `pnpm test`
- `pnpm build`
- vérification Tauri en développement
- `pnpm tauri build`
- recherche d’appels ou ressources distantes

### Limites connues

- Aucune base SQLite ni persistance.
- Aucun import Excel, calcul, scénario réel ou export.
- Aucun modèle de données exécutable.
- Navigation sans URL ni historique ; ce besoin sera réévalué si la profondeur
  de navigation augmente.
