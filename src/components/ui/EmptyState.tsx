interface EmptyStateProps {
  title: string;
  description: string;
  plannedFeatures: string[];
}

export function EmptyState({
  title,
  description,
  plannedFeatures,
}: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon" aria-hidden="true">
        +
      </div>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
        {plannedFeatures.length > 0 ? (
          <>
            <p className="empty-state__planned">
              Fonctions prévues ultérieurement
            </p>
            <ul>
              {plannedFeatures.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}
