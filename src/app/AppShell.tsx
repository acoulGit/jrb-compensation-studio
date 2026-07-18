import { useState } from "react";
import { CampaignContext } from "../components/layout/CampaignContext";
import { TopHeader } from "../components/layout/TopHeader";
import { Sidebar } from "../components/navigation/Sidebar";
import type { PageId } from "../components/navigation/navigation";
import { PageContent, pageDefinitions } from "../pages/pages";

export function AppShell() {
  const [activePage, setActivePage] = useState<PageId>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className={`app-shell${sidebarCollapsed ? " app-shell--collapsed" : ""}`}>
      <Sidebar
        activePage={activePage}
        collapsed={sidebarCollapsed}
        onNavigate={setActivePage}
        onToggle={() => setSidebarCollapsed((value) => !value)}
      />
      <div className="app-shell__workspace">
        <TopHeader pageTitle={pageDefinitions[activePage].title} />
        <CampaignContext />
        <main className="main-content" id="main-content">
          <PageContent page={activePage} />
        </main>
      </div>
    </div>
  );
}
