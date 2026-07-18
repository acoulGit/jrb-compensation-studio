import type { CampaignStatus } from "../infrastructure/database/types";

export function campaignStatusLabel(status: CampaignStatus): string {
  switch (status) {
    case "active":
      return "Active";
    case "draft":
      return "Brouillon";
    case "archived":
      return "Archivée";
  }
}

export function campaignStatusTone(
  status: CampaignStatus,
): "neutral" | "warning" | "success" {
  switch (status) {
    case "active":
      return "success";
    case "archived":
      return "warning";
    case "draft":
      return "neutral";
  }
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function isDefaultOrganizationName(name: string): boolean {
  return name === "Organisation non configurée";
}
