import { useAppData } from "../app/AppDataProvider";
import { EmptyState } from "../components/ui/EmptyState";
import { MetricCard } from "../components/ui/MetricCard";
import { PageHeader } from "../components/ui/PageHeader";
import { SectionCard } from "../components/ui/SectionCard";
import { pageDefinitions } from "./pageDefinitions";

export function DashboardPage() {
  const { activeCampaign } = useAppData();
  const definition = pageDefinitions.dashboard;
  const metrics = [
    [
      "Campagne active",
      activeCampaign?.name ?? "Non configuré",
      activeCampaign
        ? `Exercice ${activeCampaign.referenceYear}`
        : "Aucun exercice ouvert",
      "C",
    ],
    ["Budget annoncé", "Non configuré", "Masse salariale de référence", "%"],
    ["Population importée", "0", "Aucune donnée RH chargée", "P"],
    ["Scénarios", "0", "Aucune simulation créée", "S"],
    ["Alertes", "0", "Aucun contrôle à signaler", "!"],
    ["Statut de validation", "Non configuré", "Circuit non démarré", "V"],
  ] as const;

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
        description="Créez et activez une campagne depuis la page Campagnes pour alimenter ce tableau de bord."
      >
        <EmptyState
          title={
            activeCampaign
              ? "Campagne active prête"
              : definition.emptyTitle
          }
          description={
            activeCampaign
              ? "Les indicateurs budgétaires, population et simulations seront disponibles dans les lots suivants."
              : definition.emptyDescription
          }
          plannedFeatures={definition.plannedFeatures}
        />
      </SectionCard>
    </>
  );
}
