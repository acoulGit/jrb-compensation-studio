import type { ReactNode } from "react";

interface MetricCardProps {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
}

export function MetricCard({ label, value, detail, icon }: MetricCardProps) {
  return (
    <article className="metric-card">
      <div className="metric-card__top">
        <span className="metric-card__label">{label}</span>
        <span className="metric-card__icon" aria-hidden="true">
          {icon}
        </span>
      </div>
      <strong>{value}</strong>
      <span className="metric-card__detail">{detail}</span>
    </article>
  );
}
