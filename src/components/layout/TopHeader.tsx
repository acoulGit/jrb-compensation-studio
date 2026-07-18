import { branding } from "../../config/branding";
import { StatusBadge } from "../ui/StatusBadge";

interface TopHeaderProps {
  pageTitle: string;
}

export function TopHeader({ pageTitle }: TopHeaderProps) {
  return (
    <header className="top-header">
      <div>
        <span className="top-header__context">JRB Compensation Studio</span>
        <strong>{pageTitle}</strong>
      </div>
      <div className="top-header__organization">
        <div>
          <span>Organisation</span>
          <strong>{branding.organizationName}</strong>
        </div>
        <StatusBadge tone="warning">À configurer</StatusBadge>
      </div>
    </header>
  );
}
