import { useState } from "react";
import { useAppData } from "./AppDataProvider";
import { CampaignContext } from "../components/layout/CampaignContext";
import { TopHeader } from "../components/layout/TopHeader";
import { Sidebar } from "../components/navigation/Sidebar";
import type { PageId } from "../components/navigation/navigation";
import { PageContent, pageDefinitions } from "../pages/pages";

export function AppShell() {
  const { status, errorMessage, retry } = useAppData();
  const [activePage, setActivePage] = useState<PageId>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (status === "loading") {
    return (
      <div className="boot-screen" role="status" aria-live="polite">
        <div className="boot-screen__card">
          <p className="boot-screen__eyebrow">JRB Compensation Studio</p>
          <h1>Ouverture de la base locale</h1>
          <p>Initialisation de la persistance SQLite sur ce poste…</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="boot-screen" role="alert">
        <div className="boot-screen__card boot-screen__card--error">
          <p className="boot-screen__eyebrow">Persistance locale</p>
          <h1>Base locale indisponible</h1>
          <p>
            {errorMessage ??
              "La base locale n’a pas pu être ouverte. Réessayez dans un instant."}
          </p>
          <button type="button" className="button button--primary" onClick={retry}>
            Réessayer
          </button>
        </div>
      </div>
    );
  }

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
