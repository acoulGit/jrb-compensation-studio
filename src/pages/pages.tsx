import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { SectionCard } from "../components/ui/SectionCard";
import type { PageId } from "../components/navigation/navigation";
import { AboutPage } from "./AboutPage";
import { CampaignsPage } from "./CampaignsPage";
import { DashboardPage } from "./DashboardPage";
import { pageDefinitions } from "./pageDefinitions";
import { ImportPage } from "./ImportPage";
import { ReferencesPage } from "./ReferencesPage";
import { SettingsPage } from "./SettingsPage";

export { pageDefinitions };

function FeaturePage({
  page,
}: {
  page: Exclude<
    PageId,
    | "dashboard"
    | "about"
    | "settings"
    | "campaigns"
    | "references"
    | "imports"
  >;
}) {
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
  if (page === "campaigns") return <CampaignsPage />;
  if (page === "references") return <ReferencesPage />;
  if (page === "imports") return <ImportPage />;
  if (page === "settings") return <SettingsPage />;
  if (page === "about") return <AboutPage />;
  return <FeaturePage page={page} />;
}
