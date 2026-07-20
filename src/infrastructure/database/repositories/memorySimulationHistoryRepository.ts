/**
 * Historique de simulations en mémoire (tests / mode mémoire).
 * Append-only, isolé par campagne.
 */

import {
  DEFAULT_SIMULATION_HISTORY_PAGE_SIZE,
  MAX_SIMULATION_HISTORY_PAGE_SIZE,
  type PaginatedSimulationRuns,
  type PersistedSimulationEmployeeResult,
  type PersistedSimulationRunDetail,
  type PersistedSimulationRunSummary,
  type SaveSimulationRunCommandResult,
  type SaveSimulationRunDto,
  type SimulationHistoryListOptions,
} from "../../../application/campaignSimulation/simulationPersistenceModels";
import {
  parseCanonicalExactAmount,
  parseCanonicalIntegerText,
} from "../../../application/campaignSimulation/canonicalDecimalText";
import type { NineBoxMode } from "../../../domain/compensationReference/models";
import type { SimulationHistoryRepository } from "./simulationHistoryRepository";

interface StoredRun {
  summary: PersistedSimulationRunSummary;
  employees: PersistedSimulationEmployeeResult[];
}

function parseExplanationSteps(
  raw: string,
): PersistedSimulationEmployeeResult["explanationSteps"] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((item) => {
      if (!item || typeof item !== "object") {
        return { step: "unknown" };
      }
      const record = item as Record<string, unknown>;
      return {
        step: typeof record.step === "string" ? record.step : "unknown",
        formula:
          typeof record.formula === "string" ? record.formula : undefined,
        outputValue:
          typeof record.outputValue === "string"
            ? record.outputValue
            : undefined,
      };
    });
  } catch {
    return [];
  }
}

function compareEmployeeId(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export class MemorySimulationHistoryRepository
  implements SimulationHistoryRepository
{
  private nextRunId = 1;
  private nextEmployeeRowId = 1;
  private readonly runs = new Map<number, StoredRun>();

  async saveSimulationRun(
    dto: SaveSimulationRunDto,
  ): Promise<SaveSimulationRunCommandResult> {
    const existingNumbers = [...this.runs.values()]
      .filter((run) => run.summary.campaignId === dto.campaignId)
      .map((run) => run.summary.runNumber);
    const runNumber =
      existingNumbers.length === 0 ? 1 : Math.max(...existingNumbers) + 1;
    const id = this.nextRunId;
    this.nextRunId += 1;
    const createdAt = new Date().toISOString();

    const summary: PersistedSimulationRunSummary = {
      id,
      campaignId: dto.campaignId,
      runNumber,
      resultSchemaVersion: 2,
      campaignName: dto.campaignName,
      campaignYear: dto.campaignYear,
      campaignStatusAtRun: dto.campaignStatusAtRun,
      evaluationMode: dto.evaluationMode,
      sourceImportBatchId: dto.sourceImportBatchId,
      sourceImportFileName: dto.sourceImportFileName,
      sourceFingerprint: dto.sourceFingerprint,
      configurationFingerprint: dto.configurationFingerprint,
      budgetTargetMode: dto.budgetTargetMode,
      manualBudgetFcfa: dto.manualBudgetFcfaText
        ? parseCanonicalIntegerText(dto.manualBudgetFcfaText, {
            allowNegative: false,
          })
        : null,
      eligiblePayrollFcfa: dto.eligiblePayrollFcfaText
        ? parseCanonicalIntegerText(dto.eligiblePayrollFcfaText, {
            allowNegative: false,
          })
        : null,
      budgetRateBasisPoints:
        dto.budgetRateBasisPoints === null
          ? null
          : BigInt(dto.budgetRateBasisPoints),
      exactBudgetTarget: parseCanonicalExactAmount({
        numeratorText: dto.budgetTargetNumeratorText,
        denominatorText: dto.budgetTargetDenominatorText,
        allowNegativeNumerator: false,
      }),
      roundingMode: dto.roundingMode,
      roundingStepFcfa: parseCanonicalIntegerText(dto.roundingStepFcfaText, {
        allowNegative: false,
      }),
      employeeCount: dto.employeeCount,
      positiveWeightEmployeeCount: dto.positiveWeightEmployeeCount,
      zeroWeightEmployeeCount: dto.zeroWeightEmployeeCount,
      confirmedUnderperformerCount: dto.confirmedUnderperformerCount,
      theoreticalAllocatedTotal: parseCanonicalExactAmount({
        numeratorText: dto.theoreticalTotalNumeratorText,
        denominatorText: dto.theoreticalTotalDenominatorText,
        allowNegativeNumerator: false,
      }),
      actualOperationAmountFcfa: parseCanonicalIntegerText(
        dto.actualOperationAmountFcfaText,
        { allowNegative: false },
      ),
      totalRoundingDelta: parseCanonicalExactAmount({
        numeratorText: dto.totalRoundingDeltaNumeratorText,
        denominatorText: dto.totalRoundingDeltaDenominatorText,
        allowNegativeNumerator: true,
      }),
      createdAt,
    };

    const employees: PersistedSimulationEmployeeResult[] = dto.employees
      .map((employee) => {
        const rowId = this.nextEmployeeRowId;
        this.nextEmployeeRowId += 1;
        return {
          id: rowId,
          simulationRunId: id,
          employeeId: employee.employeeId,
          employeeDisplayName: employee.employeeDisplayName,
          familyCode: employee.familyCode,
          familyLabel: employee.familyLabel,
          gradeCode: employee.gradeCode,
          gradeLabel: employee.gradeLabel,
          salaryFcfa: parseCanonicalIntegerText(employee.salaryFcfaText, {
            allowNegative: false,
          }),
          s0Fcfa: parseCanonicalIntegerText(employee.s0FcfaText, {
            allowNegative: false,
          }),
          salaryRatioBasisPoints: employee.salaryRatioBasisPoints,
          salaryPositionCode: employee.salaryPositionCode,
          salaryPositionLabel: employee.salaryPositionLabel,
          positionFactorMilli: employee.positionFactorMilli,
          evaluationMode: employee.evaluationMode as NineBoxMode,
          performanceLevel: employee.performanceLevel,
          potentialLevel: employee.potentialLevel,
          evaluationFactor: parseCanonicalExactAmount({
            numeratorText: employee.evaluationFactorNumeratorText,
            denominatorText: employee.evaluationFactorDenominatorText,
          }),
          theoreticalMatrixWeight: parseCanonicalExactAmount({
            numeratorText: employee.theoreticalMatrixWeightNumeratorText,
            denominatorText: employee.theoreticalMatrixWeightDenominatorText,
          }),
          effectiveMatrixWeight: parseCanonicalExactAmount({
            numeratorText: employee.effectiveMatrixWeightNumeratorText,
            denominatorText: employee.effectiveMatrixWeightDenominatorText,
          }),
          allocationWeight: parseCanonicalExactAmount({
            numeratorText: employee.allocationWeightNumeratorText,
            denominatorText: employee.allocationWeightDenominatorText,
          }),
          blockingReason: employee.blockingReason,
          theoreticalIncreaseRate: parseCanonicalExactAmount({
            numeratorText: employee.theoreticalIncreaseRateNumeratorText,
            denominatorText: employee.theoreticalIncreaseRateDenominatorText,
          }),
          theoreticalIncreaseAmount: parseCanonicalExactAmount({
            numeratorText: employee.theoreticalIncreaseAmountNumeratorText,
            denominatorText: employee.theoreticalIncreaseAmountDenominatorText,
          }),
          finalRoundedIncreaseAmountFcfa: parseCanonicalIntegerText(
            employee.finalRoundedIncreaseFcfaText,
            { allowNegative: false },
          ),
          individualRoundingDelta: parseCanonicalExactAmount({
            numeratorText: employee.individualRoundingDeltaNumeratorText,
            denominatorText: employee.individualRoundingDeltaDenominatorText,
            allowNegativeNumerator: true,
          }),
          finalSalaryFcfa: parseCanonicalIntegerText(
            employee.finalSalaryFcfaText,
            { allowNegative: false },
          ),
          explanationSteps: parseExplanationSteps(employee.explanationStepsJson),
        };
      })
      .sort((left, right) => compareEmployeeId(left.employeeId, right.employeeId));

    this.runs.set(id, {
      summary: Object.freeze({ ...summary }),
      employees: employees.map((employee) => Object.freeze({ ...employee })),
    });

    return {
      simulationRunId: id,
      runNumber,
      createdAt,
      employeeCount: dto.employeeCount,
    };
  }

  async listSimulationRuns(
    campaignId: number,
    options?: SimulationHistoryListOptions,
  ): Promise<PaginatedSimulationRuns> {
    const limit = Math.min(
      Math.max(options?.limit ?? DEFAULT_SIMULATION_HISTORY_PAGE_SIZE, 1),
      MAX_SIMULATION_HISTORY_PAGE_SIZE,
    );
    const offset = Math.max(options?.offset ?? 0, 0);
    const items = [...this.runs.values()]
      .map((run) => run.summary)
      .filter((summary) => summary.campaignId === campaignId)
      .sort((left, right) => right.runNumber - left.runNumber);
    const total = items.length;
    return {
      items: items.slice(offset, offset + limit).map((item) => ({ ...item })),
      total,
      limit,
      offset,
    };
  }

  async getSimulationRunSummary(
    runId: number,
  ): Promise<PersistedSimulationRunSummary | null> {
    const run = this.runs.get(runId);
    return run ? { ...run.summary } : null;
  }

  async getSimulationRun(
    runId: number,
  ): Promise<PersistedSimulationRunDetail | null> {
    const run = this.runs.get(runId);
    if (!run) return null;
    return {
      summary: { ...run.summary },
      employees: run.employees.map((employee) => ({ ...employee })),
    };
  }

  async listSimulationEmployeeResults(
    runId: number,
  ): Promise<PersistedSimulationEmployeeResult[]> {
    const run = this.runs.get(runId);
    if (!run) return [];
    return run.employees.map((employee) => ({ ...employee }));
  }
}
