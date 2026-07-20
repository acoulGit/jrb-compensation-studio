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
  formatExactRateAsPercent,
  formatExactWeight,
  formatFactorMilli,
  formatFcfaInteger,
} from "./formatExactBudgetDisplay";
export { buildSimulationSourceFingerprint } from "./buildSimulationSourceFingerprint";
export { executeCampaignSimulation } from "./executeCampaignSimulation";
export { buildSimulationResultView } from "./buildSimulationResultView";
export type { CampaignSimulationExecutionCode } from "./campaignSimulationExecutionCodes";
export type {
  CampaignSimulationExecutionIssue,
  CampaignSimulationExecutionResult,
  EmployeeSimulationResultView,
  ExecuteCampaignSimulationInput,
  ExecuteCampaignSimulationOutcome,
  SimulationBudgetSummaryView,
  SimulationExecutionStatus,
  SimulationPopulationSummaryView,
} from "./campaignSimulationExecutionModels";
export {
  ROUNDING_STEP_SUGGESTIONS,
  createEmptyConfigurationDraft,
  type CampaignSimulationConfigurationDraft,
  type ValidatedCampaignSimulationConfiguration,
  type BudgetTargetModeChoice,
} from "./simulationConfigurationModels";
export {
  bigintToCanonicalText,
  exactAmountToCanonicalTexts,
  isCanonicalIntegerText,
  isCanonicalPositiveDenominatorText,
  parseCanonicalExactAmount,
  parseCanonicalIntegerText,
} from "./canonicalDecimalText";
export { mapExecutionResultToSaveDto } from "./mapExecutionResultToSaveDto";
export { saveCurrentCampaignSimulation } from "./saveCurrentCampaignSimulation";
export type { SimulationPersistenceCode } from "./simulationPersistenceCodes";
export type {
  PaginatedSimulationRuns,
  PersistedSimulationEmployeeResult,
  PersistedSimulationRunDetail,
  PersistedSimulationRunSummary,
  SaveCampaignSimulationOutcome,
  SaveSimulationRunCommandResult,
  SaveSimulationRunDto,
  SimulationHistoryListOptions,
} from "./simulationPersistenceModels";
