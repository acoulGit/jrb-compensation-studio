interface StatusBadgeProps {
  children: string;
  tone?: "neutral" | "warning" | "success";
}

export function StatusBadge({
  children,
  tone = "neutral",
}: StatusBadgeProps) {
  return <span className={`status-badge status-badge--${tone}`}>{children}</span>;
}
