import { useAppData } from "../../app/AppDataProvider";
import { StatusBadge } from "../ui/StatusBadge";

export function CampaignContext() {
  const { activeCampaign } = useAppData();

  return (
    <aside className="campaign-context" aria-label="Campagne active">
      <div>
        <span className="campaign-context__label">Campagne active</span>
        <strong data-testid="active-campaign-name">
          {activeCampaign ? activeCampaign.name : "Aucune campagne active"}
        </strong>
      </div>
      <div className="campaign-context__meta">
        <span data-testid="active-campaign-year">
          Exercice :{" "}
          {activeCampaign ? activeCampaign.referenceYear : "Non configuré"}
        </span>
        <span>Budget : Non configuré</span>
        <StatusBadge tone={activeCampaign ? "success" : "neutral"}>
          {activeCampaign ? "Active" : "Inactive"}
        </StatusBadge>
      </div>
    </aside>
  );
}
