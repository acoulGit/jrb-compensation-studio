import { EmptyState } from "../components/ui/EmptyState";
import { MetricCard } from "../components/ui/MetricCard";
import { PageHeader } from "../components/ui/PageHeader";
import { SectionCard } from "../components/ui/SectionCard";
import { StatusBadge } from "../components/ui/StatusBadge";
import type { PageId } from "../components/navigation/navigation";
import { branding } from "../config/branding";

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
      "Les campagnes permettront de regrouper paramètres, population et scénarios pour un exercice.",
    plannedFeatures: [
      "Création et duplication d’une campagne",
      "Jalons et statut de validation",
      "Archivage des exercices clôturés",
    ],
  },
  references: {
    title: "Référentiels",
    description: "Préparez les grilles, grades, coefficients et règles de référence.",
    emptyTitle: "Aucun référentiel configuré",
    emptyDescription:
      "Cet espace accueillera les paramètres nécessaires aux futurs calculs.",
    plannedFeatures: [
      "Familles de métiers et grades",
      "Grilles salariales et positions",
      "Coefficients 9-Box reparamétrables",
    ],
  },
  imports: {
    title: "Import RH",
    description: "Préparez l’intégration contrôlée des données de population.",
    emptyTitle: "Aucun import disponible",
    emptyDescription:
      "L’import de fichiers RH sera ajouté dans un lot ultérieur, avec validations et rapport d’anomalies.",
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
    emptyTitle: "Configuration locale à venir",
    emptyDescription:
      "Les valeurs affichées sont provisoires et ne sont pas encore persistées.",
    plannedFeatures: [
      "Personnalisation de l’organisation",
      "Préférences d’affichage et d’export",
      "Sauvegarde locale des paramètres",
    ],
  },
  about: {
    title: "À propos",
    description: "Informations sur le produit, sa version et son mode de fonctionnement.",
    emptyTitle: "Fondation applicative",
    emptyDescription:
      "Cette version installe le socle desktop. Les fonctions métier seront ajoutées progressivement.",
    plannedFeatures: [
      "Informations de diagnostic local",
      "Historique des versions",
      "Documentation utilisateur intégrée",
    ],
  },
};

function DashboardPage() {
  const definition = pageDefinitions.dashboard;
  const metrics = [
    ["Campagne active", "Non configuré", "Aucun exercice ouvert", "C"],
    ["Budget annoncé", "0 %", "Masse salariale de référence", "%"],
    ["Population importée", "0", "Aucune donnée RH chargée", "P"],
    ["Scénarios", "0", "Aucune simulation créée", "S"],
    ["Alertes", "0", "Aucun contrôle à signaler", "!"],
    ["Statut de validation", "Non configuré", "Circuit non démarré", "V"],
  ];

  return (
    <>
      <PageHeader title={definition.title} description={definition.description} />
      <div className="metrics-grid">
        {metrics.map(([label, value, detail, icon]) => (
          <MetricCard
            key={label}
            label={label}
            value={value}
            detail={detail}
            icon={icon}
          />
        ))}
      </div>
      <SectionCard
        title="Démarrer une campagne"
        description="Le socle est prêt à accueillir les futurs paramètres métier."
      >
        <EmptyState
          title={definition.emptyTitle}
          description={definition.emptyDescription}
          plannedFeatures={definition.plannedFeatures}
        />
      </SectionCard>
    </>
  );
}

function AboutPage() {
  const definition = pageDefinitions.about;

  return (
    <>
      <PageHeader title={definition.title} description={definition.description} />
      <SectionCard title={branding.productName}>
        <dl className="about-details">
          <div>
            <dt>Version</dt>
            <dd>0.1.0</dd>
          </div>
          <div>
            <dt>Organisation</dt>
            <dd>{branding.organizationName}</dd>
          </div>
          <div>
            <dt>Mode de fonctionnement</dt>
            <dd>
              <StatusBadge tone="success">Application locale et confidentielle</StatusBadge>
            </dd>
          </div>
        </dl>
        <div className="privacy-notice">
          <strong>Aucune donnée transmise sur Internet</strong>
          <p>
            L’application fonctionne sur ce poste. Elle n’intègre ni télémétrie,
            ni service cloud, ni ressource distante.
          </p>
        </div>
      </SectionCard>
      <SectionCard title="Évolutions prévues">
        <EmptyState
          title={definition.emptyTitle}
          description={definition.emptyDescription}
          plannedFeatures={definition.plannedFeatures}
        />
      </SectionCard>
    </>
  );
}

function FeaturePage({ page }: { page: Exclude<PageId, "dashboard" | "about"> }) {
  const definition = pageDefinitions[page];

  return (
    <>
      <PageHeader title={definition.title} description={definition.description} />
      <SectionCard title="Espace disponible">
        <EmptyState
          title={definition.emptyTitle}
          description={definition.emptyDescription}
          plannedFeatures={definition.plannedFeatures}
        />
      </SectionCard>
    </>
  );
}

export function PageContent({ page }: { page: PageId }) {
  if (page === "dashboard") return <DashboardPage />;
  if (page === "about") return <AboutPage />;
  return <FeaturePage page={page} />;
}
