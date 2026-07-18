import { useAppData } from "../../app/AppDataProvider";
import { useCompensationReference } from "../../app/CompensationReferenceProvider";
import { StatusBadge } from "../ui/StatusBadge";

export function CampaignContext() {
  const { activeCampaign } = useAppData();
  const { activeCampaignCompleteness } = useCompensationReference();

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
        {activeCampaign ? (
          <span data-testid="active-campaign-reference">
            Référentiel : {activeCampaignCompleteness?.badge ?? "À compléter"}
          </span>
        ) : null}
        <StatusBadge tone={activeCampaign ? "success" : "neutral"}>
          {activeCampaign ? "Active" : "Inactive"}
        </StatusBadge>
      </div>
    </aside>
  );
}
