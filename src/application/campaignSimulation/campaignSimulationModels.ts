/** Modèles du rapport de préparation de simulation (Lot 2B-1). */

import type { CampaignStatus } from "../../domain/campaign/models";
import type {
  BudgetTargetInput,
  PreparedEmployeeCalculationInput,
  PopulationCalculationReferences,
  RoundingPolicy,
} from "../../domain/compensationCalculation";
import type { NineBoxMode, NineBoxOrientation } from "../../domain/compensationReference/models";
import type {
  CampaignSimulationReadinessCode,
  ReadinessScope,
  ReadinessSeverity,
} from "./campaignSimulationCodes";

export interface CampaignSimulationReadinessIssue {
  scope: ReadinessScope;
  employeeId?: string;
  code: CampaignSimulationReadinessCode | string;
  field?: string;
  severity: ReadinessSeverity;
  message: string;
  details?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface SimulationConfigurationReadiness {
  budgetTargetModeSelected: boolean;
  manualBudgetProvided: boolean;
  eligiblePayrollProvided: boolean;
  budgetRateProvided: boolean;
  roundingPolicyProvided: boolean;
  isComplete: boolean;
  missingFields: string[];
}

export interface SectionReadiness {
  isReady: boolean;
  blockingIssueCount: number;
  warningIssueCount: number;
}

export interface CampaignSimulationReadinessSummary {
  campaignStatus: CampaignStatus | "unknown";
  employeeCount: number;
  mappedEmployeeCount: number;
  blockingEmployeeCount: number;
  warningEmployeeCount: number;
  missingS0Count: number;
  missingPerformanceCount: number;
  missingPotentialCount: number;
  missingUnderperformerStatusCount: number;
  referenceBlockingIssueCount: number;
  configurationBlockingIssueCount: number;
  isReadyForCalculation: boolean;
}

export interface CampaignSimulationReadinessReport {
  campaignId: number;
  campaignName: string | null;
  campaignStatus: CampaignStatus | "unknown";
  isReady: boolean;
  currentImportBatchId: number | null;
  importedEmployeeCount: number;
  validEmployeeCount: number;
  blockedEmployeeCount: number;
  evaluationMode: NineBoxMode | null;
  /** Métadonnée informative ; hors clé de calcul. */
  nineBoxOrientation: NineBoxOrientation | null;
  referenceReadiness: SectionReadiness;
  populationReadiness: SectionReadiness;
  configurationReadiness: SimulationConfigurationReadiness;
  issues: CampaignSimulationReadinessIssue[];
  warnings: CampaignSimulationReadinessIssue[];
  summary: CampaignSimulationReadinessSummary;
  /** Salariés mappés prêts pour le moteur (triés) — sans montants. */
  preparedEmployees: PreparedEmployeeCalculationInput[];
  /** Référentiels prêts pour le moteur si références OK. */
  preparedReferences: PopulationCalculationReferences | null;
  /** Configuration fournie éventuellement, non recalculée. */
  budgetTarget: BudgetTargetInput | null;
  roundingPolicy: RoundingPolicy | null;
}

export interface CampaignSimulationReadinessInput {
  campaignId: number;
  budgetTarget?: BudgetTargetInput;
  roundingPolicy?: RoundingPolicy;
}

/**
 * Ports de lecture injectés (pas d’accès SQLite direct).
 */
export interface CampaignSimulationReadinessPorts {
  getCampaign(
    campaignId: number,
  ): Promise<import("../../domain/campaign/models").Campaign | null>;
  getReferenceSet(
    campaignId: number,
  ): Promise<
    import("../../domain/compensationReference/models").CompensationReferenceSet
  >;
  getCompleteness(
    campaignId: number,
  ): Promise<
    import("../../domain/compensationReference/models").ReferenceCompleteness
  >;
  getCurrentBatch(
    campaignId: number,
  ): Promise<import("../../domain/hrImport/models").HrImportBatch | null>;
  listCurrentPopulation(
    campaignId: number,
    query: import("../../domain/hrImport/models").PopulationQuery,
  ): Promise<import("../../domain/hrImport/models").PaginatedPopulation>;
}
