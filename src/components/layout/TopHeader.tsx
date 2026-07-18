import { useAppData } from "../../app/AppDataProvider";
import {
  isDefaultOrganizationName,
} from "../../app/formatters";
import { StatusBadge } from "../ui/StatusBadge";

interface TopHeaderProps {
  pageTitle: string;
}

export function TopHeader({ pageTitle }: TopHeaderProps) {
  const { organization } = useAppData();
  const organizationLabel =
    organization?.organizationShortName ||
    organization?.organizationName ||
    "Organisation";
  const needsConfiguration = isDefaultOrganizationName(
    organization?.organizationName ?? "Organisation non configurée",
  );

  return (
    <header className="top-header">
      <div>
        <span className="top-header__context">JRB Compensation Studio</span>
        <strong>{pageTitle}</strong>
      </div>
      <div className="top-header__organization">
        <div>
          <span>Organisation</span>
          <strong data-testid="header-organization">{organizationLabel}</strong>
        </div>
        <StatusBadge tone={needsConfiguration ? "warning" : "success"}>
          {needsConfiguration ? "À configurer" : "Locale et confidentielle"}
        </StatusBadge>
      </div>
    </header>
  );
}
