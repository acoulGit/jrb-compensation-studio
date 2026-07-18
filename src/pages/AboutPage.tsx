import { useAppData } from "../app/AppDataProvider";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { SectionCard } from "../components/ui/SectionCard";
import { StatusBadge } from "../components/ui/StatusBadge";
import { pageDefinitions } from "./pageDefinitions";

export function AboutPage() {
  const { organization } = useAppData();
  const definition = pageDefinitions.about;

  return (
    <>
      <PageHeader title={definition.title} description={definition.description} />
      <SectionCard title={organization?.productName ?? "JRB Compensation Studio"}>
        <dl className="about-details">
          <div>
            <dt>Version</dt>
            <dd>0.1.0</dd>
          </div>
          <div>
            <dt>Organisation</dt>
            <dd data-testid="about-organization">
              {organization?.organizationName ?? "Organisation non configurée"}
            </dd>
          </div>
          <div>
            <dt>Mode de fonctionnement</dt>
            <dd>
              <StatusBadge tone="success">
                Application locale et confidentielle
              </StatusBadge>
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
