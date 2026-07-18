import { MemoryCampaignRepository } from "../infrastructure/database/repositories/memoryCampaignRepository";
import { MemoryOrganizationRepository } from "../infrastructure/database/repositories/memoryOrganizationRepository";
import { SqliteCampaignRepository } from "../infrastructure/database/repositories/sqliteCampaignRepository";
import { SqliteOrganizationRepository } from "../infrastructure/database/repositories/sqliteOrganizationRepository";
import { CampaignService } from "./campaignService";
import { OrganizationService } from "./organizationService";

export interface AppServices {
  organization: OrganizationService;
  campaign: CampaignService;
}

export function createSqliteAppServices(): AppServices {
  return {
    organization: new OrganizationService(new SqliteOrganizationRepository()),
    campaign: new CampaignService(new SqliteCampaignRepository()),
  };
}

export function createMemoryAppServices(): AppServices {
  return {
    organization: new OrganizationService(new MemoryOrganizationRepository()),
    campaign: new CampaignService(new MemoryCampaignRepository()),
  };
}
