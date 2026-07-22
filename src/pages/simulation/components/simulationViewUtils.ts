/** Utilitaires d’affichage partagés simulation (Lot 2B-4B). */

export function levelOrNotRequired(
  level: string | null,
  required: boolean,
): string {
  if (!required) return "Non requis";
  return level ?? "—";
}

export function compareEmployeeId(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export const SIMULATION_EMPLOYEE_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export const SIMULATION_HISTORY_PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
