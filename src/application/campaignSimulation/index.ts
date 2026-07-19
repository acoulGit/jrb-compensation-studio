/** Couche applicative — préparation de simulation de campagne (Lot 2B-1). */

export type {
  CampaignSimulationReadinessCode,
  ReadinessScope,
  ReadinessSeverity,
} from "./campaignSimulationCodes";
export {
  buildCampaignSimulationReadiness,
  createCampaignSimulationReadinessPortsFromServices,
} from "./buildCampaignSimulationReadiness";
export { buildPopulationCalculationReferences } from "./buildPopulationCalculationReferences";
export type {
  CampaignSimulationReadinessInput,
  CampaignSimulationReadinessIssue,
  CampaignSimulationReadinessPorts,
  CampaignSimulationReadinessReport,
  CampaignSimulationReadinessSummary,
  SimulationConfigurationReadiness,
  SectionReadiness,
} from "./campaignSimulationModels";
export {
  mapImportedEmployeeToPreparedInput,
  sortPreparedEmployees,
  type EmployeeMappingContext,
  type EmployeeMappingResult,
} from "./mapImportedEmployeeToPreparedInput";
export {
  normalizeFactorLevel,
  normalizePerformanceLevel,
  normalizePotentialLevel,
} from "./normalizeFactorLevel";
