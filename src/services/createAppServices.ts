import { MemoryCampaignRepository } from "../infrastructure/database/repositories/memoryCampaignRepository";
import { MemoryCompensationReferenceRepository } from "../infrastructure/database/repositories/memoryCompensationReferenceRepository";
import { MemoryOrganizationRepository } from "../infrastructure/database/repositories/memoryOrganizationRepository";
import { SqliteCampaignRepository } from "../infrastructure/database/repositories/sqliteCampaignRepository";
import { SqliteCompensationReferenceRepository } from "../infrastructure/database/repositories/sqliteCompensationReferenceRepository";
import { SqliteOrganizationRepository } from "../infrastructure/database/repositories/sqliteOrganizationRepository";
import { CampaignService } from "./campaignService";
import { CompensationReferenceService } from "./compensationReferenceService";
import { OrganizationService } from "./organizationService";

export interface AppServices {
  organization: OrganizationService;
  campaign: CampaignService;
  compensationReference: CompensationReferenceService;
}

export function createSqliteAppServices(): AppServices {
  const campaignRepository = new SqliteCampaignRepository();
  const referenceRepository = new SqliteCompensationReferenceRepository();
  return {
    organization: new OrganizationService(new SqliteOrganizationRepository()),
    campaign: new CampaignService(campaignRepository, referenceRepository),
    compensationReference: new CompensationReferenceService(
      referenceRepository,
      campaignRepository,
    ),
  };
}

export function createMemoryAppServices(): AppServices {
  const campaignRepository = new MemoryCampaignRepository();
  const referenceRepository = new MemoryCompensationReferenceRepository();
  return {
    organization: new OrganizationService(new MemoryOrganizationRepository()),
    campaign: new CampaignService(campaignRepository, referenceRepository),
    compensationReference: new CompensationReferenceService(
      referenceRepository,
      campaignRepository,
    ),
  };
}
