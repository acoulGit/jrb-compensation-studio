import { StatusBadge } from "../ui/StatusBadge";

export function CampaignContext() {
  return (
    <aside className="campaign-context" aria-label="Campagne active">
      <div>
        <span className="campaign-context__label">Campagne active</span>
        <strong>Aucune campagne configurée</strong>
      </div>
      <div className="campaign-context__meta">
        <span>Exercice : Non configuré</span>
        <span>Budget : 0 %</span>
        <StatusBadge>Inactive</StatusBadge>
      </div>
    </aside>
  );
}
