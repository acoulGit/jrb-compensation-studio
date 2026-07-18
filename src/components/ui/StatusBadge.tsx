interface StatusBadgeProps {
  children: string;
  tone?: "neutral" | "warning" | "success";
  "data-testid"?: string;
}

export function StatusBadge({
  children,
  tone = "neutral",
  "data-testid": testId,
}: StatusBadgeProps) {
  return (
    <span
      className={`status-badge status-badge--${tone}`}
      data-testid={testId}
    >
      {children}
    </span>
  );
}
