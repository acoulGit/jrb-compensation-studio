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
export {
  buildPopulationCalculationReferences,
  logSimulationReferenceReadinessFailure,
} from "./buildPopulationCalculationReferences";
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
export type { SimulationConfigurationCode } from "./simulationConfigurationCodes";
export {
  parseBudgetRatePercentToBps,
  parseNonNegativeFcfaAmount,
  parseRoundingStepFcfa,
  parseSimulationConfigurationDraft,
  type ParseFailure,
  type ParseResult,
  type ParsedSimulationConfiguration,
  type SimulationConfigurationDraftFields,
} from "./parseSimulationConfiguration";
export {
  buildConfigurationFingerprint,
  formatBasisPointsAsPercent,
  formatExactAmountAsFcfa,
} from "./formatExactBudgetDisplay";
export {
  ROUNDING_STEP_SUGGESTIONS,
  createEmptyConfigurationDraft,
  type CampaignSimulationConfigurationDraft,
  type ValidatedCampaignSimulationConfiguration,
  type BudgetTargetModeChoice,
} from "./simulationConfigurationModels";
