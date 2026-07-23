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
  parseRetroactivityStartMonthInput,
  parseTechnicalApplicationMonthInput,
  parseMinimumGuaranteeEffectiveMonthInput,
  parseUniversalFixedAmountMonthlyAmountInput,
  parseUniversalFixedAmountEffectiveMonthInput,
  parseUniversalFixedAmountMinimumSeniorityMonthsInput,
  resolveDraftSocialMechanismKind,
  parseSimulationConfigurationDraft,
  type ParseFailure,
  type ParseResult,
  type ParsedSimulationConfiguration,
  type SimulationConfigurationDraftFields,
} from "./parseSimulationConfiguration";
export {
  resolveMinimumGuaranteeEffectiveMonth,
  minimumGuaranteeReminderSummaryFr,
  type MinimumGuaranteeEffectiveMonthOrigin,
  type ResolvedMinimumGuaranteeEffectiveMonth,
} from "./resolveMinimumGuaranteeEffectiveMonth";
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
export {
  GENERATED_PASSWORD_MIN_LENGTH,
  MIN_PASSWORD_LENGTH,
  buildSuggestedFileName,
  formatExportDate,
  sanitizeFileComponent,
} from "./hrExcelExportModels";
export type {
  ExportSimulationRunExcelInput,
  ExportSimulationRunExcelResult,
  GenerateHrExportPasswordResult,
  SuggestedFileNameInput,
} from "./hrExcelExportModels";
export {
  EXPORT_UNKNOWN_DISABLED_HINT,
  EXPORT_UNPROTECTED_CONFIRMATION_MESSAGE,
  EXPORT_UNPROTECTED_WARNING,
  EXPORT_V1_DISABLED_HINT,
  EXPORT_V2_DISABLED_HINT,
  isCancelledMessage,
  looksLikePasswordLeak,
  validateExportPasswordOptions,
} from "./hrExcelExportErrorMessages";
export type {
  ValidateExportPasswordOptionsInput,
  ValidateExportPasswordResult,
} from "./hrExcelExportErrorMessages";
export { generateHrExportPassword } from "./generateHrExportPassword";
export type { GenerateHrExportPasswordOutcome } from "./generateHrExportPassword";
export {
  exportSimulationRunExcel,
  pickExcelSavePath,
} from "./exportSimulationRunExcel";
export type { ExportSimulationRunExcelOutcome } from "./exportSimulationRunExcel";
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
