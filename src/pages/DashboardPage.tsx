import { formatDateTime } from "../app/formatters";
import { useAppData } from "../app/AppDataProvider";
import { useCompensationReference } from "../app/CompensationReferenceProvider";
import { useHrImport } from "../app/HrImportProvider";
import { EmptyState } from "../components/ui/EmptyState";
import { MetricCard } from "../components/ui/MetricCard";
import { PageHeader } from "../components/ui/PageHeader";
import { SectionCard } from "../components/ui/SectionCard";
import { pageDefinitions } from "./pageDefinitions";

export function DashboardPage() {
  const { activeCampaign } = useAppData();
  const { activeCampaignCompleteness } = useCompensationReference();
  const { activeCampaignPopulationCount, activeCampaignLastImportAt } =
    useHrImport();
  const definition = pageDefinitions.dashboard;
  const referenceLabel = activeCampaign
    ? (activeCampaignCompleteness?.badge ?? "À compléter")
    : "Non configuré";
  const populationCount = activeCampaign
    ? (activeCampaignPopulationCount ?? 0)
    : 0;
  const populationDetail =
    populationCount > 0
      ? activeCampaignLastImportAt
        ? `Dernier import : ${formatDateTime(activeCampaignLastImportAt)}`
        : "Lot courant de la campagne active"
      : "Aucune donnée RH chargée";
  const metrics = [
    [
      "Campagne active",
      activeCampaign?.name ?? "Non configuré",
      activeCampaign
        ? `Exercice ${activeCampaign.referenceYear}`
        : "Aucun exercice ouvert",
      "C",
    ],
    [
      "Référentiel",
      referenceLabel,
      activeCampaign
        ? "Paramètres de rémunération de la campagne"
        : "Aucune campagne active",
      "R",
    ],
    ["Budget annoncé", "Non configuré", "Masse salariale de référence", "%"],
    [
      "Population importée",
      String(populationCount),
      populationDetail,
      "P",
    ],
    ["Scénarios", "0", "Aucune simulation créée", "S"],
    ["Alertes", "0", "Aucun contrôle à signaler", "!"],
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
