import { MemoryCampaignRepository } from "../infrastructure/database/repositories/memoryCampaignRepository";
import { MemoryCompensationReferenceRepository } from "../infrastructure/database/repositories/memoryCompensationReferenceRepository";
import { MemoryHrImportRepository } from "../infrastructure/database/repositories/memoryHrImportRepository";
import { MemoryOrganizationRepository } from "../infrastructure/database/repositories/memoryOrganizationRepository";
import { MemorySimulationHistoryRepository } from "../infrastructure/database/repositories/memorySimulationHistoryRepository";
import { SqliteCampaignRepository } from "../infrastructure/database/repositories/sqliteCampaignRepository";
import { SqliteCompensationReferenceRepository } from "../infrastructure/database/repositories/sqliteCompensationReferenceRepository";
import { SqliteHrImportRepository } from "../infrastructure/database/repositories/sqliteHrImportRepository";
import { SqliteOrganizationRepository } from "../infrastructure/database/repositories/sqliteOrganizationRepository";
import { SqliteSimulationHistoryRepository } from "../infrastructure/database/repositories/sqliteSimulationHistoryRepository";
import type { SimulationHistoryRepository } from "../infrastructure/database/repositories/simulationHistoryRepository";
import { CampaignService } from "./campaignService";
import { CompensationReferenceService } from "./compensationReferenceService";
import { HrImportService } from "./hrImportService";
import { OrganizationService } from "./organizationService";

export interface AppServices {
  organization: OrganizationService;
  campaign: CampaignService;
  compensationReference: CompensationReferenceService;
  hrImport: HrImportService;
  simulationHistory: SimulationHistoryRepository;
}

export function createSqliteAppServices(): AppServices {
  const campaignRepository = new SqliteCampaignRepository();
  const referenceRepository = new SqliteCompensationReferenceRepository();
  const compensationReference = new CompensationReferenceService(
    referenceRepository,
    campaignRepository,
  );
  return {
    organization: new OrganizationService(new SqliteOrganizationRepository()),
    campaign: new CampaignService(campaignRepository, referenceRepository),
    compensationReference,
    hrImport: new HrImportService(
      campaignRepository,
      compensationReference,
      new SqliteHrImportRepository(),
    ),
    simulationHistory: new SqliteSimulationHistoryRepository(),
  };
}

export function createMemoryAppServices(): AppServices {
  const campaignRepository = new MemoryCampaignRepository();
  const referenceRepository = new MemoryCompensationReferenceRepository();
  const compensationReference = new CompensationReferenceService(
    referenceRepository,
    campaignRepository,
  );
  return {
    organization: new OrganizationService(new MemoryOrganizationRepository()),
    campaign: new CampaignService(campaignRepository, referenceRepository),
    compensationReference,
    hrImport: new HrImportService(
      campaignRepository,
      compensationReference,
      new MemoryHrImportRepository(),
    ),
    simulationHistory: new MemorySimulationHistoryRepository(),
  };
}
