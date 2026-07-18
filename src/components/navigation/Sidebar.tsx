import { useAppData } from "../../app/AppDataProvider";
import {
  primaryNavigation,
  secondaryNavigation,
  type NavigationItem,
  type PageId,
} from "./navigation";

interface SidebarProps {
  activePage: PageId;
  collapsed: boolean;
  onNavigate: (page: PageId) => void;
  onToggle: () => void;
}

function NavigationGroup({
  items,
  activePage,
  collapsed,
  onNavigate,
}: {
  items: NavigationItem[];
  activePage: PageId;
  collapsed: boolean;
  onNavigate: (page: PageId) => void;
}) {
  return (
    <ul className="navigation-list">
      {items.map((item) => (
        <li key={item.id}>
          <button
            className={`navigation-link${activePage === item.id ? " navigation-link--active" : ""}`}
            type="button"
            aria-current={activePage === item.id ? "page" : undefined}
            aria-label={collapsed ? item.label : undefined}
            title={collapsed ? item.label : undefined}
            onClick={() => onNavigate(item.id)}
          >
            <span className="navigation-link__symbol" aria-hidden="true">
              {item.symbol}
            </span>
            <span className="navigation-link__label">{item.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function Sidebar({
  activePage,
  collapsed,
  onNavigate,
  onToggle,
}: SidebarProps) {
  const { organization } = useAppData();
  const footerLabel = organization?.reportFooter ?? "Document confidentiel";

  return (
    <aside className={`sidebar${collapsed ? " sidebar--collapsed" : ""}`}>
      <div className="brand">
        <span className="brand__mark" aria-hidden="true">
          J
        </span>
        <div className="brand__text">
          <strong>JRB</strong>
          <span>Compensation Studio</span>
        </div>
      </div>

      <nav className="sidebar__navigation" aria-label="Navigation principale">
        <NavigationGroup
          items={primaryNavigation}
          activePage={activePage}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
        <div className="sidebar__secondary">
          <NavigationGroup
            items={secondaryNavigation}
            activePage={activePage}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        </div>
      </nav>

      <div className="sidebar__footer">
        <div className="confidentiality">
          <span className="confidentiality__icon" aria-hidden="true">
            ✓
          </span>
          <div>
            <strong>Mode local</strong>
            <span>{footerLabel}</span>
          </div>
        </div>
        <button
          className="sidebar-toggle"
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Déployer la barre latérale" : "Réduire la barre latérale"}
          aria-expanded={!collapsed}
        >
          <span aria-hidden="true">{collapsed ? "›" : "‹"}</span>
          <span className="sidebar-toggle__label">Réduire</span>
        </button>
      </div>
    </aside>
  );
}
