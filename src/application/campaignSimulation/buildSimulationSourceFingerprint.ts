/**
 * Empreinte déterministe des sources de simulation (Lot 2B-3).
 * Ne journalise pas les salaires en clair hors de la chaîne canonique interne.
 */

import type { BudgetTargetInput, RoundingPolicy } from "../../domain/compensationCalculation";
import type { PreparedEmployeeCalculationInput } from "../../domain/compensationCalculation";
import type { PopulationCalculationReferences } from "../../domain/compensationCalculation";
import { SENIORITY_IMPACT_CONTRACT_VERSION } from "../../domain/compensationCalculation";
import { PROMOTION_TRAJECTORY_CONTRACT_VERSION } from "../../domain/compensationCalculation";
import { PROMOTION_COMPENSATORY_CALIBRATION_CONTRACT_VERSION } from "../../domain/compensationCalculation";
import { PROMOTION_AWARE_COMPENSATION_CONTRACT_VERSION } from "../../domain/compensationCalculation";
import { MINIMUM_INCREASE_CONTRACT_VERSION } from "../../domain/compensationCalculation";
import type { MinimumIncreasePolicy } from "../../domain/compensationCalculation";
import type { CampaignStatus } from "../../domain/campaign/models";
import type { NineBoxMode } from "../../domain/compensationReference/models";
import { buildConfigurationFingerprint } from "./formatExactBudgetDisplay";

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function salaryToken(value: number | bigint): string {
  return typeof value === "bigint" ? value.toString() : String(value);
}

function promotionToken(
  promotion: PreparedEmployeeCalculationInput["promotion"],
): string {
  if (!promotion) {
    return "";
  }
  return [
    promotion.promotionDate,
    promotion.salaryBeforePromotionFcfa.toString(),
    promotion.salaryAfterPromotionFcfa.toString(),
    promotion.previousGradeCode,
    promotion.promotedGradeCode,
    promotion.previousJobFamilyCode,
    promotion.promotedJobFamilyCode,
    `${promotion.promotionRate.numerator}/${promotion.promotionRate.denominator}`,
  ].join("|");
}

export interface SimulationSourceFingerprintInput {
  campaignId: number;
  campaignStatus: CampaignStatus | "unknown";
  evaluationMode: NineBoxMode | null;
  currentImportBatchId: number | null;
  preparedEmployees: readonly PreparedEmployeeCalculationInput[];
  preparedReferences: PopulationCalculationReferences | null;
  budgetTarget: BudgetTargetInput;
  roundingPolicy: RoundingPolicy;
  campaignYear: number;
  retroactivityStartMonth: number;
  technicalApplicationMonth: number;
  minimumIncreasePolicy: MinimumIncreasePolicy;
}

/**
 * Construit une empreinte stable des sources + configuration.
 * Les salariés sont triés par employeeId pour la stabilité.
 */
export function buildSimulationSourceFingerprint(
  input: SimulationSourceFingerprintInput,
): string {
  const employees = [...input.preparedEmployees]
    .map((employee) => ({
      id: employee.employeeId,
      family: employee.familyCode,
      grade: employee.gradeCode,
      salary: salaryToken(employee.salaryFcfa),
      hire: employee.hireDate,
      perf: employee.performanceLevel ?? "",
      pot: employee.potentialLevel ?? "",
      under: employee.confirmedUnderperformer ? "1" : "0",
      promo: promotionToken(employee.promotion),
      status: employee.employmentStatus ?? "",
      contract: employee.contractType ?? "",
      compElig:
        employee.compensatoryMeasureEligible === undefined
          ? ""
          : employee.compensatoryMeasureEligible
            ? "1"
            : "0",
    }))
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));

  const refs = input.preparedReferences;
  const s0 = [...(refs?.salaryGrid ?? [])]
    .map((cell) => ({
      f: cell.familyCode,
      g: cell.gradeCode,
      s0: cell.s0Fcfa === null || cell.s0Fcfa === undefined ? "" : salaryToken(cell.s0Fcfa),
    }))
    .sort((a, b) => {
      const left = `${a.f}|${a.g}`;
      const right = `${b.f}|${b.g}`;
      return left < right ? -1 : left > right ? 1 : 0;
    });

  const positions = [...(refs?.salaryPositions ?? [])]
    .map((position) => ({
      code: position.code,
      ratio: position.referenceRatioBps ?? "",
      factor: position.positionFactorMilli,
    }))
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));

  const perf = [...(refs?.performanceFactors ?? [])]
    .map((factor) => `${factor.level}:${factor.factorMilli}`)
    .sort();
  const pot = [...(refs?.potentialFactors ?? [])]
    .map((factor) => `${factor.level}:${factor.factorMilli}`)
    .sort();
  const nine = [...(refs?.nineBoxFactors ?? [])]
    .map(
      (factor) =>
        `${factor.performanceLevel}/${factor.potentialLevel}:${factor.factorMilli}:${factor.boxCode ?? ""}`,
    )
    .sort();
  const nineBoxConfirmationFactorMilli = refs?.nineBoxConfirmationFactorMilli ?? "";

  const configFingerprint = buildConfigurationFingerprint({
    campaignId: input.campaignId,
    budgetMode: input.budgetTarget.mode,
    manualBudget:
      input.budgetTarget.mode === "manual_amount"
        ? BigInt(input.budgetTarget.manualBudgetFcfa ?? 0)
        : undefined,
    eligiblePayroll:
      input.budgetTarget.mode === "percentage_of_eligible_payroll"
        ? BigInt(input.budgetTarget.eligiblePayrollFcfa ?? 0)
        : undefined,
    budgetRateBps:
      input.budgetTarget.mode === "percentage_of_eligible_payroll"
        ? BigInt(input.budgetTarget.budgetRateBasisPoints ?? 0)
        : undefined,
    roundingMode: input.roundingPolicy.mode,
    roundingStep: BigInt(input.roundingPolicy.stepFcfa),
    campaignYear: input.campaignYear,
    retroactivityStartMonth: input.retroactivityStartMonth,
    technicalApplicationMonth: input.technicalApplicationMonth,
    seniorityImpactContractVersion: SENIORITY_IMPACT_CONTRACT_VERSION,
    promotionTrajectoryContractVersion: PROMOTION_TRAJECTORY_CONTRACT_VERSION,
    promotionCompensatoryCalibrationContractVersion:
      PROMOTION_COMPENSATORY_CALIBRATION_CONTRACT_VERSION,
    promotionAwareCompensationContractVersion: PROMOTION_AWARE_COMPENSATION_CONTRACT_VERSION,
    minimumIncreaseMode: input.minimumIncreasePolicy.mode,
    minimumMonthlyAmountFcfa:
      input.minimumIncreasePolicy.minimumMonthlyAmountFcfa,
    minimumIncreaseRateNumerator:
      input.minimumIncreasePolicy.minimumIncreaseRate?.numerator ?? null,
    minimumIncreaseRateDenominator:
      input.minimumIncreasePolicy.minimumIncreaseRate?.denominator ?? null,
    minimumIncreaseContractVersion: MINIMUM_INCREASE_CONTRACT_VERSION,
  });

  const canonical = [
    String(input.campaignId),
    input.campaignStatus,
    input.evaluationMode ?? "",
    String(input.currentImportBatchId ?? ""),
    refs?.evaluationMode ?? "",
    JSON.stringify(employees),
    JSON.stringify(s0),
    JSON.stringify(positions),
    perf.join(","),
    pot.join(","),
    nine.join(","),
    String(nineBoxConfirmationFactorMilli),
    configFingerprint,
  ].join("\n");

  return `v2:${fnv1aHex(canonical)}:${fnv1aHex(canonical.slice().split("").reverse().join(""))}:${canonical.length}`;
}
