export const DATABASE_URL = "sqlite:jrb-compensation-studio.db" as const;

export const DEFAULT_ORGANIZATION_SEED = {
  productName: "JRB Compensation Studio",
  organizationName: "Organisation non configurée",
  organizationShortName: "Organisation",
  applicationSubtitle: "Simulation et pilotage des augmentations salariales",
  reportFooter: "Document confidentiel",
} as const;

export type CampaignStatus = "draft" | "active" | "archived";

export const CAMPAIGN_STATUSES: readonly CampaignStatus[] = [
  "draft",
  "active",
  "archived",
] as const;

export const MIN_REFERENCE_YEAR = 2000;
export const MAX_REFERENCE_YEAR = 2100;

export interface OrganizationProfile {
  productName: string;
  organizationName: string;
  organizationShortName: string;
  applicationSubtitle: string;
  reportFooter: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationProfileInput {
  productName: string;
  organizationName: string;
  organizationShortName: string;
  applicationSubtitle: string;
  reportFooter: string;
}

export interface Campaign {
  id: number;
  name: string;
  referenceYear: number;
  status: CampaignStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface CampaignDraftInput {
  name: string;
  referenceYear: number;
  notes: string;
}

export interface OrganizationProfileRow {
  id: number;
  product_name: string;
  organization_name: string;
  organization_short_name: string;
  application_subtitle: string;
  report_footer: string;
  created_at: string;
  updated_at: string;
}

export interface CampaignRow {
  id: number;
  name: string;
  reference_year: number;
  status: string;
  notes: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface SqlDatabase {
  execute(query: string, bindValues?: unknown[]): Promise<unknown>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
}
