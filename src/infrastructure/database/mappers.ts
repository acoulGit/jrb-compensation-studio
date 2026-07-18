import type {
  Campaign,
  CampaignRow,
  CampaignStatus,
  OrganizationProfile,
  OrganizationProfileRow,
} from "./types";
import { CAMPAIGN_STATUSES } from "./types";

export function mapOrganizationProfile(
  row: OrganizationProfileRow,
): OrganizationProfile {
  return {
    productName: row.product_name,
    organizationName: row.organization_name,
    organizationShortName: row.organization_short_name,
    applicationSubtitle: row.application_subtitle,
    reportFooter: row.report_footer,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCampaign(row: CampaignRow): Campaign {
  if (!isCampaignStatus(row.status)) {
    throw new Error(`Statut de campagne inconnu : ${row.status}`);
  }

  return {
    id: row.id,
    name: row.name,
    referenceYear: row.reference_year,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

function isCampaignStatus(value: string): value is CampaignStatus {
  return (CAMPAIGN_STATUSES as readonly string[]).includes(value);
}
