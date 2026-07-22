/**
 * Trajectoire mensuelle de rémunération consciente des promotions
 * (Lot 2A-H2C-2 / Lot 2A-H2D-1 / Lot 2A-H2D-2). Combine, mois par mois
 * (janvier → décembre) :
 * - la trajectoire salariale de base (grade/famille/salaire) ;
 * - le calcul matriciel individuel ;
 * - le complément compensatoire (nul avant retroactivityStartMonth) ;
 * - le minimum garanti d’augmentation (plancher payable) ;
 * - l'incidence d'ancienneté ventilée promotion / compensatoire.
 *
 * Les agrégats de campagne ne couvrent que [rétroactivité … décembre].
 * Le coût à plein effet (décembre × 12) est informatif et hors calibrage.
 */

import { validateApplicationCalendar } from "./baseSalaryReminder";
import {
  FULL_YEAR_MONTH_COUNT,
  isMonthInCampaignPeriod,
} from "./campaignPeriod";
import { calculateIndividualMatrixWeight } from "./calculateIndividualMatrixWeight";
import { CompensationCalculationError } from "./errors";
import {
  addFractions,
  compareFractions,
  exactAmountFromInteger,
  multiplyFractions,
  reduceFraction,
  roundFractionToStepHalfUp,
  subtractFractions,
  type ExactAmount,
} from "./exactFraction";
import type {
  LevelFactorRef,
  NineBoxFactorRef,
  SalaryPositionInputRow,
} from "./models";
import type { PerformanceLevel, PotentialLevel, NineBoxMode } from "../compensationReference/models";
import {
  isPromotionBudgetPopulationEmployee,
  type PromotionBudgetEmploymentStatus,
} from "./promotionBudgetPopulation";
import { isCompensatoryMeasureEligible } from "./compensatoryMeasureEligibility";
import {
  computeGuaranteedTotalIncreaseExact,
  computeMinimumComplementFloorFcfa,
  computeRequiredMinimumComplementExact,
  NO_MINIMUM_INCREASE_POLICY,
  type MinimumIncreasePolicy,
} from "./minimumIncrease";
import {
  isMinimumIncreasePopulationEmployee,
  resolveMinimumIncreaseExclusionReason,
  type MinimumIncreaseExclusionReason,
} from "./minimumIncreasePopulation";
import {
  buildPromotionAwareMonthlySalaryTrajectory,
  type PromotionCampaignCostPreview,
  type PromotionEvent,
  type PromotionInclusionStatus,
} from "./promotionTrajectory";
import {
  promotionAnnualBudgetCostFcfa,
} from "./promotionCompensatoryCalibration";
import type { MonthlyCompensationTrajectoryEntry } from "./preparedPopulationModels";
import type { PreparedSalaryGridCell } from "./preparedPopulationModels";
import { resolveEmployeeS0 } from "./resolveEmployeeS0";
import {
  ceilFcfaPercentOfAmount,
  parseHireDateIso,
  seniorityRatePercentAt,
  validateHireDateForCampaign,
} from "./seniorityImpact";

export const PROMOTION_AWARE_COMPENSATION_CONTRACT_VERSION = 1 as const;

export interface EmployeeMonthlyExposureContext {
  month: number;
  baseSalaryFcfa: bigint;
  gradeCode: string;
  jobFamilyCode: string;
  promotionActive: boolean;
  promotionStatus: PromotionInclusionStatus;
  s0Fcfa: bigint;
  theoreticalCompensationFactor: ExactAmount;
  effectiveCompensationFactor: ExactAmount;
  promotionRateOffset: ExactAmount;
  promotionAmountForMonthFcfa: bigint;
  /** Plancher de complément payable (0 hors population / hors période / mode none). */
  minimumComplementFloorFcfa: bigint;
}

export interface EmployeePromotionAwareExposureResult {
  employeeId: string;
  months: readonly EmployeeMonthlyExposureContext[];
  costPreview: PromotionCampaignCostPreview;
  promotionYear: number | null;
  promotionMonth: number | null;
  isPromotionBudgetPopulationEmployee: boolean;
  compensatoryMeasureEligible: boolean;
  isMinimumIncreasePopulationEmployee: boolean;
  minimumIncreaseExclusionReason: MinimumIncreaseExclusionReason;
}

export interface BuildEmployeePromotionAwareExposuresInput {
  employeeId: string;
  hireDate: string;
  decemberBaseSalaryFcfa: bigint;
  currentGradeCode: string;
  currentJobFamilyCode: string;
  promotion: PromotionEvent | null;
  employmentStatus?: PromotionBudgetEmploymentStatus | null;
  contractType?: string | null;
  compensatoryMeasureEligible?: boolean;
  confirmedUnderperformer: boolean;
  performanceLevel?: PerformanceLevel;
  potentialLevel?: PotentialLevel;
  /** Neutralisation individuelle de l’effet 9-Box (Lot 2B-RC1-H1). */
  neutralizeNineBoxEffect?: boolean;
  campaignYear: number;
  technicalApplicationMonth: number;
  retroactivityStartMonth?: number;
  evaluationMode: NineBoxMode;
  salaryGrid: readonly PreparedSalaryGridCell[];
  salaryPositions: readonly SalaryPositionInputRow[];
  performanceFactors: readonly LevelFactorRef[];
  potentialFactors: readonly LevelFactorRef[];
  nineBoxFactors: readonly NineBoxFactorRef[];
  /** Politique de minimum (défaut = none). */
  minimumIncreasePolicy?: MinimumIncreasePolicy;
  /** Pas d’arrondi requis pour calculer le plancher payable. */
  roundingStepFcfa?: bigint;
}

/** Construit les 12 expositions mensuelles d'un salarié (avant résolution du taux). */
export function buildEmployeePromotionAwareExposures(
  input: BuildEmployeePromotionAwareExposuresInput,
): EmployeePromotionAwareExposureResult {
  const retroactivityStartMonth = input.retroactivityStartMonth ?? 1;
  validateApplicationCalendar({
    campaignYear: input.campaignYear,
    technicalApplicationMonth: input.technicalApplicationMonth,
    retroactivityStartMonth,
  });

  const policy = input.minimumIncreasePolicy ?? NO_MINIMUM_INCREASE_POLICY;
  const roundingStepFcfa = input.roundingStepFcfa ?? 1n;

  const trajectoryResult = buildPromotionAwareMonthlySalaryTrajectory({
    campaignYear: input.campaignYear,
    technicalApplicationMonth: input.technicalApplicationMonth,
    retroactivityStartMonth,
    decemberBaseSalaryFcfa: input.decemberBaseSalaryFcfa,
    currentGradeCode: input.currentGradeCode,
    currentJobFamilyCode: input.currentJobFamilyCode,
    promotion: input.promotion,
  });

  const compensatoryMeasureEligible = isCompensatoryMeasureEligible({
    contractType: input.contractType,
    hireDate: input.hireDate,
    campaignYear: input.campaignYear,
    employmentStatus: input.employmentStatus,
    override: input.compensatoryMeasureEligible,
  });

  const minimumPopulationInput = {
    contractType: input.contractType,
    employmentStatus: input.employmentStatus,
  };
  const inMinimumPopulation = isMinimumIncreasePopulationEmployee(
    minimumPopulationInput,
  );
  const minimumIncreaseExclusionReason = resolveMinimumIncreaseExclusionReason(
    minimumPopulationInput,
  );

  const months: EmployeeMonthlyExposureContext[] = trajectoryResult.trajectory.map(
    (entry) => {
      const s0Resolution = resolveEmployeeS0({
        familyCode: entry.jobFamilyCode,
        gradeCode: entry.gradeCode,
        salaryGrid: input.salaryGrid,
      });

      const matrixWeight = calculateIndividualMatrixWeight({
        salaryFcfa: entry.baseSalaryFcfa,
        s0Fcfa: s0Resolution.s0Fcfa,
        salaryPositions: input.salaryPositions,
        mode: input.evaluationMode,
        performanceLevel: input.performanceLevel,
        potentialLevel: input.potentialLevel,
        performanceFactors: input.performanceFactors,
        potentialFactors: input.potentialFactors,
        nineBoxFactors: input.nineBoxFactors,
        confirmedUnderperformer: input.confirmedUnderperformer,
        neutralizeNineBoxEffect: input.neutralizeNineBoxEffect === true,
      });

      const theoreticalCompensationFactor = reduceFraction(
        matrixWeight.theoreticalWeightNumerator,
        BigInt(matrixWeight.exactWeightScale),
      );
      const blockedEffectiveFactor = reduceFraction(
        matrixWeight.exactWeightNumerator,
        BigInt(matrixWeight.exactWeightScale),
      );
      const inCampaignPeriod = isMonthInCampaignPeriod(
        entry.month,
        retroactivityStartMonth,
      );
      const effectiveCompensationFactor =
        compensatoryMeasureEligible && inCampaignPeriod
          ? blockedEffectiveFactor
          : exactAmountFromInteger(0n);

      const countsForPromotionThisMonth =
        trajectoryResult.costPreview.includedInSimulation &&
        entry.promotionActive &&
        inCampaignPeriod;

      const promotionAmountForMonthFcfa = countsForPromotionThisMonth
        ? input.promotion!.promotionAmountFcfa
        : 0n;

      const minimumComplementFloorFcfa = computeMinimumComplementFloorFcfa({
        policy,
        applicableMonthlyBaseSalaryFcfa: entry.baseSalaryFcfa,
        applicablePromotionIncrementFcfa: promotionAmountForMonthFcfa,
        roundingStepFcfa,
        isCampaignCoveredMonth: inCampaignPeriod,
        isMinimumIncreasePopulationEmployee: inMinimumPopulation,
      });

      return {
        month: entry.month,
        baseSalaryFcfa: entry.baseSalaryFcfa,
        gradeCode: entry.gradeCode,
        jobFamilyCode: entry.jobFamilyCode,
        promotionActive: entry.promotionActive,
        promotionStatus: entry.promotionStatus,
        s0Fcfa: s0Resolution.s0Fcfa,
        theoreticalCompensationFactor,
        effectiveCompensationFactor,
        promotionRateOffset: countsForPromotionThisMonth
          ? input.promotion!.promotionRate
          : exactAmountFromInteger(0n),
        promotionAmountForMonthFcfa,
        minimumComplementFloorFcfa,
      };
    },
  );

  return {
    employeeId: input.employeeId,
    months,
    costPreview: trajectoryResult.costPreview,
    promotionYear: trajectoryResult.promotionYear,
    promotionMonth: trajectoryResult.promotionMonth,
    isPromotionBudgetPopulationEmployee: isPromotionBudgetPopulationEmployee({
      employmentStatus: input.employmentStatus,
    }),
    compensatoryMeasureEligible,
    isMinimumIncreasePopulationEmployee: inMinimumPopulation,
    minimumIncreaseExclusionReason,
  };
}

export interface FinalizeEmployeePromotionAwareCompensationInput {
  employeeId: string;
  hireDate: string;
  campaignYear: number;
  technicalApplicationMonth: number;
  retroactivityStartMonth?: number;
  months: readonly EmployeeMonthlyExposureContext[];
  calibrationRate: ExactAmount;
  roundingPolicy: { mode: "nearest_half_up"; stepFcfa: bigint };
  costPreview: PromotionCampaignCostPreview;
  isPromotionBudgetPopulationEmployee: boolean;
  minimumIncreasePolicy?: MinimumIncreasePolicy;
  isMinimumIncreasePopulationEmployee?: boolean;
}

export interface FinalizeEmployeePromotionAwareCompensationResult {
  hireDate: string;
  monthlyCompensationTrajectory: readonly MonthlyCompensationTrajectoryEntry[];
  annualTheoreticalCompensatoryAllocation: ExactAmount;
  annualActualCompensatoryCostFcfa: bigint;
  baseSalaryReminderFcfa: bigint;
  remainingYearDirectIncreaseCostFcfa: bigint;
  annualPromotionBudgetCostFcfa: bigint;
  promotionCostAlreadyPaidBeforeTechnicalMonthFcfa: bigint;
  promotionCostFromTechnicalMonthToDecemberFcfa: bigint;
  seniorityReminderFcfa: bigint;
  remainingYearDirectSeniorityImpactFcfa: bigint;
  annualSeniorityImpactFcfa: bigint;
  annualPromotionSeniorityImpactFcfa: bigint;
  combinedAnnualSeniorityImpactFcfa: bigint;
  promotionSeniorityAlreadyPaidBeforeTechnicalMonthFcfa: bigint;
  promotionSeniorityFromTechnicalMonthToDecemberFcfa: bigint;
  technicalApplicationMonthSeniorityRatePercent: number;
  fullYearRunRatePromotionCostFcfa: bigint;
  fullYearRunRateCompensatoryCostFcfa: bigint;
  fullYearRunRateCombinedBaseMeasureCostFcfa: bigint;
  fullYearRunRateSeniorityImpactFcfa: bigint;
  campaignPeriodMinimumComplementFloorCostFcfa: bigint;
  campaignPeriodCompensationAboveMinimumCostFcfa: bigint;
  minimumCompensatoryReminderFcfa: bigint;
  aboveMinimumCompensatoryReminderFcfa: bigint;
  minimumRemainingYearDirectCostFcfa: bigint;
  aboveMinimumRemainingYearDirectCostFcfa: bigint;
  fullYearRunRateMinimumComplementCostFcfa: bigint;
  fullYearRunRateCompensationAboveMinimumCostFcfa: bigint;
}

function maxZero(amount: ExactAmount): ExactAmount {
  return compareFractions(amount, exactAmountFromInteger(0n)) < 0
    ? exactAmountFromInteger(0n)
    : amount;
}

function maxExact(left: ExactAmount, right: ExactAmount): ExactAmount {
  return compareFractions(left, right) >= 0 ? left : right;
}

function nonNegative(value: bigint): bigint {
  return value < 0n ? 0n : value;
}

function resolvePaymentTiming(
  month: number,
  retroactivityStartMonth: number,
  technicalApplicationMonth: number,
): "outside_campaign" | "reminder" | "direct" {
  if (month < retroactivityStartMonth) {
    return "outside_campaign";
  }
  if (month < technicalApplicationMonth) {
    return "reminder";
  }
  return "direct";
}

/** Finalise la trajectoire mensuelle d'un salarié une fois le taux de calibrage résolu. */
export function finalizeEmployeePromotionAwareCompensation(
  input: FinalizeEmployeePromotionAwareCompensationInput,
): FinalizeEmployeePromotionAwareCompensationResult {
  const retroactivityStartMonth = input.retroactivityStartMonth ?? 1;
  validateApplicationCalendar({
    campaignYear: input.campaignYear,
    technicalApplicationMonth: input.technicalApplicationMonth,
    retroactivityStartMonth,
  });

  const hire = parseHireDateIso(input.hireDate);
  validateHireDateForCampaign(hire, input.campaignYear);

  const stepFcfa = input.roundingPolicy.stepFcfa;
  const policy = input.minimumIncreasePolicy ?? NO_MINIMUM_INCREASE_POLICY;
  const inMinimumPopulation = input.isMinimumIncreasePopulationEmployee ?? false;

  const imputesPromotionToBudget = promotionAnnualBudgetCostFcfa({
    costPreview: input.costPreview,
    isPromotionBudgetPopulationEmployee: input.isPromotionBudgetPopulationEmployee,
  }) > 0n;

  const trajectory: MonthlyCompensationTrajectoryEntry[] = input.months.map(
    (month) => {
      const coveredByCampaignPeriod = isMonthInCampaignPeriod(
        month.month,
        retroactivityStartMonth,
      );
      const targetCompensatoryRate = multiplyFractions(
        input.calibrationRate,
        month.effectiveCompensationFactor,
      );
      const compensatoryComplementRate = coveredByCampaignPeriod
        ? maxZero(
            subtractFractions(targetCompensatoryRate, month.promotionRateOffset),
          )
        : exactAmountFromInteger(0n);
      const weightedComplementExact = coveredByCampaignPeriod
        ? multiplyFractions(
            exactAmountFromInteger(month.baseSalaryFcfa),
            compensatoryComplementRate,
          )
        : exactAmountFromInteger(0n);

      const applicablePromotionIncrementFcfa = coveredByCampaignPeriod
        ? month.promotionAmountForMonthFcfa
        : 0n;

      const guaranteedTotalIncreaseExact =
        coveredByCampaignPeriod && inMinimumPopulation
          ? computeGuaranteedTotalIncreaseExact({
              policy,
              applicableMonthlyBaseSalaryFcfa: month.baseSalaryFcfa,
            })
          : exactAmountFromInteger(0n);
      const requiredMinimumComplementExact = computeRequiredMinimumComplementExact({
        guaranteedTotalIncreaseExact,
        applicablePromotionIncrementFcfa,
      });

      // Préférer le plancher déjà calculé sur l’exposition (identique au solveur).
      const minimumComplementFloorFcfa = coveredByCampaignPeriod
        ? (month.minimumComplementFloorFcfa ?? 0n)
        : 0n;

      const floorExact = exactAmountFromInteger(minimumComplementFloorFcfa);
      const theoreticalComplementExact = coveredByCampaignPeriod
        ? maxExact(floorExact, weightedComplementExact)
        : exactAmountFromInteger(0n);

      const roundedFromTheoretical = coveredByCampaignPeriod
        ? roundFractionToStepHalfUp(theoreticalComplementExact, stepFcfa)
        : 0n;
      const roundedCompensatoryComplementFcfa = coveredByCampaignPeriod
        ? roundedFromTheoretical > minimumComplementFloorFcfa
          ? roundedFromTheoretical
          : minimumComplementFloorFcfa
        : 0n;
      const actualComplementAboveMinimumFcfa = nonNegative(
        roundedCompensatoryComplementFcfa - minimumComplementFloorFcfa,
      );

      const finalSalaryFcfa =
        month.baseSalaryFcfa + roundedCompensatoryComplementFcfa;
      const promotionBudgetCostFcfa =
        imputesPromotionToBudget && coveredByCampaignPeriod
          ? month.promotionAmountForMonthFcfa
          : 0n;
      const combinedIncreaseFcfa =
        promotionBudgetCostFcfa + roundedCompensatoryComplementFcfa;
      const paymentTiming = resolvePaymentTiming(
        month.month,
        retroactivityStartMonth,
        input.technicalApplicationMonth,
      );
      const seniorityRatePercent = seniorityRatePercentAt(
        hire,
        input.campaignYear,
        month.month,
      );
      // Trajectoire complète : ancienneté promo visible toute l’année ;
      // agrégats de campagne filtrés plus bas.
      const rawPromotionAmountForSeniority =
        input.costPreview.includedInSimulation && month.promotionActive
          ? input.costPreview.promotionAmountFcfa
          : 0n;
      const promotionAmountForSeniority = month.promotionActive
        ? rawPromotionAmountForSeniority
        : 0n;
      const combinedForSeniority =
        promotionAmountForSeniority + roundedCompensatoryComplementFcfa;
      const totalSeniorityImpactFcfa = ceilFcfaPercentOfAmount(
        combinedForSeniority,
        seniorityRatePercent,
      );
      const promotionSeniorityImpactFcfa = ceilFcfaPercentOfAmount(
        promotionAmountForSeniority,
        seniorityRatePercent,
      );
      const compensatorySeniorityImpactFcfa = nonNegative(
        totalSeniorityImpactFcfa - promotionSeniorityImpactFcfa,
      );
      const includedInCampaignEnvelope =
        coveredByCampaignPeriod &&
        (promotionBudgetCostFcfa > 0n || roundedCompensatoryComplementFcfa > 0n);

      return {
        month: month.month,
        baseSalaryFcfa: month.baseSalaryFcfa,
        gradeCode: month.gradeCode,
        jobFamilyCode: month.jobFamilyCode,
        promotionActive: month.promotionActive,
        promotionStatus: month.promotionStatus,
        s0Fcfa: month.s0Fcfa,
        theoreticalCompensationFactor: month.theoreticalCompensationFactor,
        effectiveCompensationFactor: month.effectiveCompensationFactor,
        promotionRateOffset: month.promotionRateOffset,
        targetCompensatoryRate: coveredByCampaignPeriod
          ? targetCompensatoryRate
          : exactAmountFromInteger(0n),
        compensatoryComplementRate,
        // Alias historique : théorique = max(plancher, weighted).
        theoreticalCompensatoryComplement: theoreticalComplementExact,
        roundedCompensatoryComplementFcfa,
        finalSalaryFcfa,
        promotionBudgetCostFcfa,
        combinedIncreaseFcfa,
        coveredByCampaignPeriod,
        includedInCampaignEnvelope,
        paymentTiming,
        seniorityRatePercent,
        totalSeniorityImpactFcfa,
        promotionSeniorityImpactFcfa,
        compensatorySeniorityImpactFcfa,
        isMinimumIncreasePopulationEmployee: inMinimumPopulation,
        guaranteedTotalIncreaseExact,
        applicablePromotionIncrementFcfa,
        requiredMinimumComplementExact,
        minimumComplementFloorFcfa,
        weightedComplementExact,
        theoreticalComplementExact,
        actualComplementAboveMinimumFcfa,
      };
    },
  );

  let annualTheoreticalCompensatoryAllocation: ExactAmount =
    exactAmountFromInteger(0n);
  let annualActualCompensatoryCostFcfa = 0n;
  let baseSalaryReminderFcfa = 0n;
  let remainingYearDirectIncreaseCostFcfa = 0n;
  let seniorityReminderFcfa = 0n;
  let remainingYearDirectSeniorityImpactFcfa = 0n;
  let annualPromotionSeniorityImpactFcfa = 0n;
  let promotionCostAlreadyPaidBeforeTechnicalMonthFcfa = 0n;
  let promotionCostFromTechnicalMonthToDecemberFcfa = 0n;
  let promotionSeniorityAlreadyPaidBeforeTechnicalMonthFcfa = 0n;
  let promotionSeniorityFromTechnicalMonthToDecemberFcfa = 0n;
  let campaignPeriodMinimumComplementFloorCostFcfa = 0n;
  let campaignPeriodCompensationAboveMinimumCostFcfa = 0n;
  let minimumCompensatoryReminderFcfa = 0n;
  let aboveMinimumCompensatoryReminderFcfa = 0n;
  let minimumRemainingYearDirectCostFcfa = 0n;
  let aboveMinimumRemainingYearDirectCostFcfa = 0n;

  for (const entry of trajectory) {
    if (!entry.coveredByCampaignPeriod) {
      continue;
    }

    annualTheoreticalCompensatoryAllocation = addFractions(
      annualTheoreticalCompensatoryAllocation,
      entry.theoreticalCompensatoryComplement,
    );
    annualActualCompensatoryCostFcfa += entry.roundedCompensatoryComplementFcfa;
    annualPromotionSeniorityImpactFcfa += entry.promotionSeniorityImpactFcfa;
    campaignPeriodMinimumComplementFloorCostFcfa +=
      entry.minimumComplementFloorFcfa;
    campaignPeriodCompensationAboveMinimumCostFcfa +=
      entry.actualComplementAboveMinimumFcfa;

    if (entry.month < input.technicalApplicationMonth) {
      promotionCostAlreadyPaidBeforeTechnicalMonthFcfa +=
        entry.promotionBudgetCostFcfa;
      promotionSeniorityAlreadyPaidBeforeTechnicalMonthFcfa +=
        entry.promotionSeniorityImpactFcfa;
    } else {
      promotionCostFromTechnicalMonthToDecemberFcfa +=
        entry.promotionBudgetCostFcfa;
      promotionSeniorityFromTechnicalMonthToDecemberFcfa +=
        entry.promotionSeniorityImpactFcfa;
    }

    if (entry.paymentTiming === "reminder") {
      baseSalaryReminderFcfa += entry.roundedCompensatoryComplementFcfa;
      seniorityReminderFcfa += entry.compensatorySeniorityImpactFcfa;
      minimumCompensatoryReminderFcfa += entry.minimumComplementFloorFcfa;
      aboveMinimumCompensatoryReminderFcfa +=
        entry.actualComplementAboveMinimumFcfa;
    } else if (entry.paymentTiming === "direct") {
      remainingYearDirectIncreaseCostFcfa +=
        entry.roundedCompensatoryComplementFcfa;
      remainingYearDirectSeniorityImpactFcfa +=
        entry.compensatorySeniorityImpactFcfa;
      minimumRemainingYearDirectCostFcfa += entry.minimumComplementFloorFcfa;
      aboveMinimumRemainingYearDirectCostFcfa +=
        entry.actualComplementAboveMinimumFcfa;
    }
  }

  const annualPromotionBudgetCostFcfa = promotionAnnualBudgetCostFcfa({
    costPreview: input.costPreview,
    isPromotionBudgetPopulationEmployee: input.isPromotionBudgetPopulationEmployee,
  });

  const annualSeniorityImpactFcfa =
    seniorityReminderFcfa + remainingYearDirectSeniorityImpactFcfa;
  const combinedAnnualSeniorityImpactFcfa =
    annualSeniorityImpactFcfa + annualPromotionSeniorityImpactFcfa;

  if (
    baseSalaryReminderFcfa + remainingYearDirectIncreaseCostFcfa !==
    annualActualCompensatoryCostFcfa
  ) {
    throw new CompensationCalculationError(
      "PROMOTION_BUDGET_INVARIANT_FAILED",
      `Incohérence rappel/direct compensatoire pour ${input.employeeId}.`,
    );
  }

  if (
    promotionCostAlreadyPaidBeforeTechnicalMonthFcfa +
      promotionCostFromTechnicalMonthToDecemberFcfa !==
    annualPromotionBudgetCostFcfa
  ) {
    throw new CompensationCalculationError(
      "PROMOTION_BUDGET_INVARIANT_FAILED",
      `Incohérence calendrier promo pour ${input.employeeId}.`,
    );
  }

  if (
    campaignPeriodMinimumComplementFloorCostFcfa +
      campaignPeriodCompensationAboveMinimumCostFcfa !==
    annualActualCompensatoryCostFcfa
  ) {
    throw new CompensationCalculationError(
      "PROMOTION_BUDGET_INVARIANT_FAILED",
      `Incohérence minimum / au-dessus pour ${input.employeeId}.`,
    );
  }

  const decemberEntry = trajectory.find((entry) => entry.month === 12)!;
  // Plein effet : rythme de décembre, même si hors population budget (informatif).
  const decemberPromoForRunRate =
    input.costPreview.includedInSimulation && decemberEntry.promotionActive
      ? input.costPreview.promotionAmountFcfa
      : 0n;
  const fullYearRunRatePromotionCostFcfa =
    decemberPromoForRunRate * BigInt(FULL_YEAR_MONTH_COUNT);
  const fullYearRunRateCompensatoryCostFcfa =
    decemberEntry.roundedCompensatoryComplementFcfa *
    BigInt(FULL_YEAR_MONTH_COUNT);
  const fullYearRunRateCombinedBaseMeasureCostFcfa =
    (decemberPromoForRunRate + decemberEntry.roundedCompensatoryComplementFcfa) *
    BigInt(FULL_YEAR_MONTH_COUNT);
  const fullYearRunRateSeniorityImpactFcfa =
    decemberEntry.totalSeniorityImpactFcfa * BigInt(FULL_YEAR_MONTH_COUNT);
  const fullYearRunRateMinimumComplementCostFcfa =
    decemberEntry.minimumComplementFloorFcfa * BigInt(FULL_YEAR_MONTH_COUNT);
  const fullYearRunRateCompensationAboveMinimumCostFcfa =
    decemberEntry.actualComplementAboveMinimumFcfa *
    BigInt(FULL_YEAR_MONTH_COUNT);

  const technicalApplicationMonthSeniorityRatePercent = seniorityRatePercentAt(
    hire,
    input.campaignYear,
    input.technicalApplicationMonth,
  );

  return {
    hireDate: hire.iso,
    monthlyCompensationTrajectory: trajectory,
    annualTheoreticalCompensatoryAllocation,
    annualActualCompensatoryCostFcfa,
    baseSalaryReminderFcfa,
    remainingYearDirectIncreaseCostFcfa,
    annualPromotionBudgetCostFcfa,
    promotionCostAlreadyPaidBeforeTechnicalMonthFcfa,
    promotionCostFromTechnicalMonthToDecemberFcfa,
    seniorityReminderFcfa,
    remainingYearDirectSeniorityImpactFcfa,
    annualSeniorityImpactFcfa,
    annualPromotionSeniorityImpactFcfa,
    combinedAnnualSeniorityImpactFcfa,
    promotionSeniorityAlreadyPaidBeforeTechnicalMonthFcfa,
    promotionSeniorityFromTechnicalMonthToDecemberFcfa,
    technicalApplicationMonthSeniorityRatePercent,
    fullYearRunRatePromotionCostFcfa,
    fullYearRunRateCompensatoryCostFcfa,
    fullYearRunRateCombinedBaseMeasureCostFcfa,
    fullYearRunRateSeniorityImpactFcfa,
    campaignPeriodMinimumComplementFloorCostFcfa,
    campaignPeriodCompensationAboveMinimumCostFcfa,
    minimumCompensatoryReminderFcfa,
    aboveMinimumCompensatoryReminderFcfa,
    minimumRemainingYearDirectCostFcfa,
    aboveMinimumRemainingYearDirectCostFcfa,
    fullYearRunRateMinimumComplementCostFcfa,
    fullYearRunRateCompensationAboveMinimumCostFcfa,
  };
}
