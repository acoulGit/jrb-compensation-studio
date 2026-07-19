import type { PageId } from "../components/navigation/navigation";

interface FeatureDefinition {
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  plannedFeatures: string[];
}

export const pageDefinitions: Record<PageId, FeatureDefinition> = {
  dashboard: {
    title: "Tableau de bord",
    description: "Vue synthétique de la campagne de rémunération en cours.",
    emptyTitle: "Votre espace de pilotage est prêt",
    emptyDescription:
      "Créez une campagne pour commencer à préparer votre cycle de rémunération.",
    plannedFeatures: [
      "Suivi de l’avancement de la campagne",
      "Synthèse budgétaire consolidée",
      "Alertes de conformité et de validation",
    ],
  },
  campaigns: {
    title: "Campagnes",
    description: "Créez et organisez les cycles d’augmentation salariale.",
    emptyTitle: "Aucune campagne",
    emptyDescription:
      "Créez une première campagne pour regrouper l’exercice, les paramètres futurs et les décisions.",
    plannedFeatures: [
      "Paramètres budgétaires de campagne",
      "Rattachement de la population importée",
      "Jalons et statut de validation avancés",
    ],
  },
  references: {
    title: "Référentiels",
    description:
      "Configurez les familles, grades, médianes S0, positions et coefficients par campagne.",
    emptyTitle: "Aucune campagne",
    emptyDescription:
      "Créez une campagne pour initialiser automatiquement son référentiel de rémunération.",
    plannedFeatures: [
      "Familles de métiers et grades",
      "Grilles salariales et positions",
      "Coefficients 9-Box reparamétrables",
    ],
  },
  imports: {
    title: "Import RH",
    description:
      "Importez localement une population RH Excel ou CSV pour une campagne.",
    emptyTitle: "Aucune campagne",
    emptyDescription:
      "Créez une campagne pour importer et versionner une population RH fictive.",
    plannedFeatures: [
      "Import local de fichiers Excel",
      "Contrôle des colonnes et des formats",
      "Prévisualisation avant intégration",
    ],
  },
  simulations: {
    title: "Simulations",
    description: "Construisez et comparez plusieurs hypothèses de répartition.",
    emptyTitle: "Aucun scénario",
    emptyDescription:
      "Les simulations seront disponibles après la mise en place du moteur de calcul.",
    plannedFeatures: [
      "Création de scénarios paramétrés",
      "Comparaison des consommations budgétaires",
      "Analyse des écarts entre scénarios",
    ],
  },
  "individual-review": {
    title: "Revue individuelle",
    description: "Examinez les propositions et décisions salarié par salarié.",
    emptyTitle: "Aucune population à examiner",
    emptyDescription:
      "La revue individuelle sera activée après l’import d’une population RH.",
    plannedFeatures: [
      "Détail de la proposition calculée",
      "Commentaires et justification des décisions",
      "Alertes et contrôles individuels",
    ],
  },
  reports: {
    title: "Rapports",
    description: "Préparez les exports RH et les preuves de consommation budgétaire.",
    emptyTitle: "Aucun rapport généré",
    emptyDescription:
      "Les rapports resteront locaux et seront produits à partir des campagnes validées.",
    plannedFeatures: [
      "Export des décisions RH",
      "Preuve de consommation budgétaire",
      "Synthèses anonymisées par segment",
    ],
  },
  settings: {
    title: "Paramètres",
    description: "Configurez l’identité du client et les préférences de l’application.",
    emptyTitle: "Configuration locale",
    emptyDescription:
      "L’identité de l’organisation est désormais persistée localement.",
    plannedFeatures: [
      "Préférences d’affichage et d’export",
      "Options de sauvegarde locale",
      "Personnalisation avancée du client",
    ],
  },
  about: {
    title: "À propos",
    description: "Informations sur le produit, sa version et son mode de fonctionnement.",
    emptyTitle: "Persistance locale active",
    emptyDescription:
      "Le lot 1A ajoute la base SQLite locale pour l’organisation et les campagnes.",
    plannedFeatures: [
      "Informations de diagnostic local",
      "Historique des versions",
      "Documentation utilisateur intégrée",
    ],
  },
};
