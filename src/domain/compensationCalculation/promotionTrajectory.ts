/**
 * Promotion événementielle et trajectoire salariale mensuelle (Lot 2A-H2C-1).
 *
 * Ne modifie pas encore l’allocation budgétaire (H2C-2).
 * Le coût campagne (`promotionCampaignCostFcfa`) est préparé mais n’est
 * **jamais** additionné au budget cible dans ce sous-lot.
 * Déterministe : parse année/mois ISO sans Date.now() ni fuseau.
 */

import { exactAmountFromInteger, reduceFraction, type ExactAmount } from "./exactFraction";

export const PROMOTION_TRAJECTORY_CONTRACT_VERSION = 1 as const;

export type PromotionInclusionStatus =
  | "NO_PROMOTION"
  | "PROMOTION_FROM_PREVIOUS_YEAR"
  | "PROMOTION_EFFECTIVE_THIS_MONTH"
  | "PROMOTION_ACTIVE"
  | "PROMOTION_EXCLUDED_AFTER_APPLICATION_MONTH";

export interface PromotionEvent {
  promotionDate: string;
  salaryBeforePromotionFcfa: bigint;
  salaryAfterPromotionFcfa: bigint;
  promotionAmountFcfa: bigint;
  promotionRate: ExactAmount;
  previousGradeCode: string;
  promotedGradeCode: string;
  previousJobFamilyCode: string;
  promotedJobFamilyCode: string;
}

export interface MonthlySalaryTrajectoryEntry {
  month: number;
  baseSalaryFcfa: bigint;
  gradeCode: string;
  jobFamilyCode: string;
  promotionActive: boolean;
  promotionStatus: PromotionInclusionStatus;
}

export interface PromotionCampaignCostPreview {
  promotionAmountFcfa: bigint;
  promotionApplicableMonths: number;
  promotionCampaignCostFcfa: bigint;
  includedInSimulation: boolean;
  exclusionReason: "EXCLUDED_AFTER_TECHNICAL_APPLICATION_MONTH" | null;
}

export interface PromotionAwareTrajectoryResult {
  trajectory: readonly MonthlySalaryTrajectoryEntry[];
  costPreview: PromotionCampaignCostPreview;
  promotionYear: number | null;
  promotionMonth: number | null;
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export class PromotionValidationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PromotionValidationError";
    this.code = code;
  }
}

/** Parse ISO YYYY-MM-DD sans Date / fuseau. */
export function parsePromotionDateIso(raw: string): {
  year: number;
  month: number;
  day: number;
  iso: string;
} {
  const trimmed = raw.trim();
  const match = ISO_DATE_RE.exec(trimmed);
  if (!match) {
    throw new PromotionValidationError(
      "INVALID_PROMOTION_DATE",
      "La date de promotion doit être au format ISO YYYY-MM-DD.",
    );
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  ) {
    throw new PromotionValidationError(
      "INVALID_PROMOTION_DATE",
      "La date de promotion est calendairement impossible.",
    );
  }
  return { year, month, day, iso: trimmed };
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  if ([4, 6, 9, 11].includes(month)) return 30;
  return 31;
}

export function buildPromotionEvent(input: {
  promotionDate: string;
  salaryBeforePromotionFcfa: bigint;
  salaryAfterPromotionFcfa: bigint;
  previousGradeCode: string;
  promotedGradeCode: string;
  previousJobFamilyCode: string;
  promotedJobFamilyCode: string;
}): PromotionEvent {
  parsePromotionDateIso(input.promotionDate);
  if (input.salaryBeforePromotionFcfa <= 0n) {
    throw new PromotionValidationError(
      "INVALID_SALARY_BEFORE_PROMOTION",
      "Le salaire avant promotion doit être strictement positif.",
    );
  }
  if (input.salaryAfterPromotionFcfa <= input.salaryBeforePromotionFcfa) {
    throw new PromotionValidationError(
      "INVALID_SALARY_AFTER_PROMOTION",
      "Le salaire après promotion doit être strictement supérieur au salaire avant.",
    );
  }
  const previousGrade = input.previousGradeCode.trim().toUpperCase();
  const promotedGrade = input.promotedGradeCode.trim().toUpperCase();
  if (!previousGrade || !promotedGrade) {
    throw new PromotionValidationError(
      "MISSING_PROMOTION_GRADE",
      "L’ancien et le nouveau grade sont obligatoires pour une promotion.",
    );
  }
  if (previousGrade === promotedGrade) {
    throw new PromotionValidationError(
      "PROMOTION_REQUIRES_GRADE_CHANGE",
      "Une promotion exige un changement de grade.",
    );
  }
  const previousFamily = input.previousJobFamilyCode.trim().toUpperCase();
  const promotedFamily = input.promotedJobFamilyCode.trim().toUpperCase();
  if (!previousFamily || !promotedFamily) {
    throw new PromotionValidationError(
      "MISSING_PROMOTION_JOB_FAMILY",
      "Les familles avant/après promotion sont obligatoires (réutiliser la famille courante si inchangée).",
    );
  }

  const promotionAmountFcfa =
    input.salaryAfterPromotionFcfa - input.salaryBeforePromotionFcfa;
  const promotionRate = reduceFraction(
    promotionAmountFcfa,
    input.salaryBeforePromotionFcfa,
  );

  return {
    promotionDate: input.promotionDate.trim(),
    salaryBeforePromotionFcfa: input.salaryBeforePromotionFcfa,
    salaryAfterPromotionFcfa: input.salaryAfterPromotionFcfa,
    promotionAmountFcfa,
    promotionRate,
    previousGradeCode: previousGrade,
    promotedGradeCode: promotedGrade,
    previousJobFamilyCode: previousFamily,
    promotedJobFamilyCode: promotedFamily,
  };
}

export function validatePromotionAgainstDecemberSnapshot(input: {
  event: PromotionEvent;
  campaignYear: number;
  decemberBaseSalaryFcfa: bigint;
  currentGradeCode: string;
  currentJobFamilyCode: string;
}): { promotionYear: number; promotionMonth: number } {
  const { year, month } = parsePromotionDateIso(input.event.promotionDate);
  if (year < input.campaignYear - 1 || year > input.campaignYear) {
    throw new PromotionValidationError(
      "PROMOTION_DATE_OUT_OF_WINDOW",
      `La date de promotion doit appartenir à l’année N-1 (${input.campaignYear - 1}) ou N (${input.campaignYear}).`,
    );
  }

  const currentGrade = input.currentGradeCode.trim().toUpperCase();
  const currentFamily = input.currentJobFamilyCode.trim().toUpperCase();

  if (year === input.campaignYear - 1) {
    if (input.decemberBaseSalaryFcfa !== input.event.salaryAfterPromotionFcfa) {
      throw new PromotionValidationError(
        "PROMOTION_N1_SALARY_MISMATCH",
        "Pour une promotion en N-1, le salaire de décembre N-1 doit égaler le salaire après promotion.",
      );
    }
    if (currentGrade !== input.event.promotedGradeCode) {
      throw new PromotionValidationError(
        "PROMOTION_N1_GRADE_MISMATCH",
        "Pour une promotion en N-1, le grade importé doit être le nouveau grade.",
      );
    }
    if (currentFamily !== input.event.promotedJobFamilyCode) {
      throw new PromotionValidationError(
        "PROMOTION_N1_FAMILY_MISMATCH",
        "Pour une promotion en N-1, la famille importée doit être la nouvelle famille.",
      );
    }
  } else {
    if (input.decemberBaseSalaryFcfa !== input.event.salaryBeforePromotionFcfa) {
      throw new PromotionValidationError(
        "PROMOTION_N_SALARY_MISMATCH",
        "Pour une promotion en N, le salaire de décembre N-1 doit égaler le salaire avant promotion.",
      );
    }
    if (currentGrade !== input.event.previousGradeCode) {
      throw new PromotionValidationError(
        "PROMOTION_N_GRADE_MISMATCH",
        "Pour une promotion en N, le grade du snapshot doit être l’ancien grade.",
      );
    }
    if (currentFamily !== input.event.previousJobFamilyCode) {
      throw new PromotionValidationError(
        "PROMOTION_N_FAMILY_MISMATCH",
        "Pour une promotion en N, la famille du snapshot doit être l’ancienne famille.",
      );
    }
  }

  return { promotionYear: year, promotionMonth: month };
}

/**
 * Trajectoire mensuelle janvier–décembre pour l’année de campagne.
 * La promotion est payée dès son mois d’effet (pas de rappel de promotion).
 */
export function buildPromotionAwareMonthlySalaryTrajectory(input: {
  campaignYear: number;
  technicalApplicationMonth: number;
  decemberBaseSalaryFcfa: bigint;
  currentGradeCode: string;
  currentJobFamilyCode: string;
  promotion: PromotionEvent | null;
}): PromotionAwareTrajectoryResult {
  if (
    !Number.isInteger(input.technicalApplicationMonth) ||
    input.technicalApplicationMonth < 1 ||
    input.technicalApplicationMonth > 12
  ) {
    throw new PromotionValidationError(
      "INVALID_TECHNICAL_APPLICATION_MONTH",
      "Le mois d’application technique doit être entre 1 et 12.",
    );
  }

  const baselineGrade = input.currentGradeCode.trim().toUpperCase();
  const baselineFamily = input.currentJobFamilyCode.trim().toUpperCase();

  if (!input.promotion) {
    const trajectory = Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      baseSalaryFcfa: input.decemberBaseSalaryFcfa,
      gradeCode: baselineGrade,
      jobFamilyCode: baselineFamily,
      promotionActive: false,
      promotionStatus: "NO_PROMOTION" as const,
    }));
    return {
      trajectory,
      costPreview: {
        promotionAmountFcfa: 0n,
        promotionApplicableMonths: 0,
        promotionCampaignCostFcfa: 0n,
        includedInSimulation: false,
        exclusionReason: null,
      },
      promotionYear: null,
      promotionMonth: null,
    };
  }

  const { promotionYear, promotionMonth } =
    validatePromotionAgainstDecemberSnapshot({
      event: input.promotion,
      campaignYear: input.campaignYear,
      decemberBaseSalaryFcfa: input.decemberBaseSalaryFcfa,
      currentGradeCode: baselineGrade,
      currentJobFamilyCode: baselineFamily,
    });

  const isPreviousYear = promotionYear === input.campaignYear - 1;
  const excluded =
    !isPreviousYear && promotionMonth > input.technicalApplicationMonth;

  if (excluded) {
    const trajectory = Array.from({ length: 12 }, (_, index) => ({
      month: index + 1,
      baseSalaryFcfa: input.decemberBaseSalaryFcfa,
      gradeCode: baselineGrade,
      jobFamilyCode: baselineFamily,
      promotionActive: false,
      promotionStatus:
        "PROMOTION_EXCLUDED_AFTER_APPLICATION_MONTH" as const,
    }));
    return {
      trajectory,
      costPreview: {
        promotionAmountFcfa: input.promotion.promotionAmountFcfa,
        promotionApplicableMonths: 0,
        promotionCampaignCostFcfa: 0n,
        includedInSimulation: false,
        exclusionReason: "EXCLUDED_AFTER_TECHNICAL_APPLICATION_MONTH",
      },
      promotionYear,
      promotionMonth,
    };
  }

  const trajectory: MonthlySalaryTrajectoryEntry[] = [];
  for (let month = 1; month <= 12; month += 1) {
    if (isPreviousYear) {
      trajectory.push({
        month,
        baseSalaryFcfa: input.promotion.salaryAfterPromotionFcfa,
        gradeCode: input.promotion.promotedGradeCode,
        jobFamilyCode: input.promotion.promotedJobFamilyCode,
        promotionActive: true,
        promotionStatus: "PROMOTION_FROM_PREVIOUS_YEAR",
      });
      continue;
    }

    if (month < promotionMonth) {
      trajectory.push({
        month,
        baseSalaryFcfa: input.promotion.salaryBeforePromotionFcfa,
        gradeCode: input.promotion.previousGradeCode,
        jobFamilyCode: input.promotion.previousJobFamilyCode,
        promotionActive: false,
        promotionStatus: "NO_PROMOTION",
      });
    } else if (month === promotionMonth) {
      trajectory.push({
        month,
        baseSalaryFcfa: input.promotion.salaryAfterPromotionFcfa,
        gradeCode: input.promotion.promotedGradeCode,
        jobFamilyCode: input.promotion.promotedJobFamilyCode,
        promotionActive: true,
        promotionStatus: "PROMOTION_EFFECTIVE_THIS_MONTH",
      });
    } else {
      trajectory.push({
        month,
        baseSalaryFcfa: input.promotion.salaryAfterPromotionFcfa,
        gradeCode: input.promotion.promotedGradeCode,
        jobFamilyCode: input.promotion.promotedJobFamilyCode,
        promotionActive: true,
        promotionStatus: "PROMOTION_ACTIVE",
      });
    }
  }

  const promotionApplicableMonths = isPreviousYear
    ? 12
    : 13 - promotionMonth;
  const promotionCampaignCostFcfa =
    input.promotion.promotionAmountFcfa * BigInt(promotionApplicableMonths);

  return {
    trajectory,
    costPreview: {
      promotionAmountFcfa: input.promotion.promotionAmountFcfa,
      promotionApplicableMonths,
      promotionCampaignCostFcfa,
      includedInSimulation: true,
      exclusionReason: null,
    },
    promotionYear,
    promotionMonth,
  };
}

/** Helper exposé pour les tests de fraction exacte. */
export function promotionRateFromAmounts(
  before: bigint,
  after: bigint,
): ExactAmount {
  return reduceFraction(after - before, before);
}

export { exactAmountFromInteger };
