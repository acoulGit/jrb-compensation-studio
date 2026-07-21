/**
 * Lot 2A-H2C-1 — trajectoire promotion / validations pures.
 */

import { describe, expect, it } from "vitest";
import { buildConfigurationFingerprint } from "../application/campaignSimulation/formatExactBudgetDisplay";
import { buildSimulationSourceFingerprint } from "../application/campaignSimulation/buildSimulationSourceFingerprint";
import {
  PROMOTION_TRAJECTORY_CONTRACT_VERSION,
  PromotionValidationError,
  buildPromotionAwareMonthlySalaryTrajectory,
  buildPromotionEvent,
  parsePromotionDateIso,
  promotionRateFromAmounts,
} from "../domain/compensationCalculation";
import type { PreparedEmployeeCalculationInput } from "../domain/compensationCalculation";

function july2026Promotion() {
  return buildPromotionEvent({
    promotionDate: "2026-04-15",
    salaryBeforePromotionFcfa: 500_000n,
    salaryAfterPromotionFcfa: 550_000n,
    previousGradeCode: "G1",
    promotedGradeCode: "G2",
    previousJobFamilyCode: "F1",
    promotedJobFamilyCode: "F1",
  });
}

describe("Lot 2A-H2C-1 — PromotionEvent", () => {
  it("salarié sans promotion → trajectoire plate", () => {
    const result = buildPromotionAwareMonthlySalaryTrajectory({
      campaignYear: 2026,
      technicalApplicationMonth: 7,
      decemberBaseSalaryFcfa: 500_000n,
      currentGradeCode: "G1",
      currentJobFamilyCode: "F1",
      promotion: null,
    });
    expect(result.trajectory).toHaveLength(12);
    expect(result.trajectory[0]!.month).toBe(1);
    expect(result.trajectory[11]!.month).toBe(12);
    expect(result.trajectory.every((e) => e.promotionStatus === "NO_PROMOTION")).toBe(
      true,
    );
    expect(result.costPreview.promotionCampaignCostFcfa).toBe(0n);
  });

  it("groupe promotion entièrement renseigné + montant/taux exacts", () => {
    const event = july2026Promotion();
    expect(event.promotionAmountFcfa).toBe(50_000n);
    expect(promotionRateFromAmounts(500_000n, 550_000n)).toEqual({
      numerator: 1n,
      denominator: 10n,
    });
    expect(event.promotionRate).toEqual({ numerator: 1n, denominator: 10n });
  });

  it("rejette salaire avant nul/négatif et après ≤ avant", () => {
    expect(() =>
      buildPromotionEvent({
        promotionDate: "2026-04-15",
        salaryBeforePromotionFcfa: 0n,
        salaryAfterPromotionFcfa: 1n,
        previousGradeCode: "G1",
        promotedGradeCode: "G2",
        previousJobFamilyCode: "F1",
        promotedJobFamilyCode: "F1",
      }),
    ).toThrow(PromotionValidationError);
    expect(() =>
      buildPromotionEvent({
        promotionDate: "2026-04-15",
        salaryBeforePromotionFcfa: 500_000n,
        salaryAfterPromotionFcfa: 500_000n,
        previousGradeCode: "G1",
        promotedGradeCode: "G2",
        previousJobFamilyCode: "F1",
        promotedJobFamilyCode: "F1",
      }),
    ).toThrow(PromotionValidationError);
  });

  it("rejette même grade et dates ISO invalides", () => {
    expect(() =>
      buildPromotionEvent({
        promotionDate: "2026-04-15",
        salaryBeforePromotionFcfa: 500_000n,
        salaryAfterPromotionFcfa: 550_000n,
        previousGradeCode: "G1",
        promotedGradeCode: "G1",
        previousJobFamilyCode: "F1",
        promotedJobFamilyCode: "F1",
      }),
    ).toThrow(PromotionValidationError);
    expect(() => parsePromotionDateIso("2026/04/15")).toThrow(
      PromotionValidationError,
    );
    expect(() => parsePromotionDateIso("2026-02-30")).toThrow(
      PromotionValidationError,
    );
  });

  it("aucun prorata journalier : 1 et 30 avril identiques", () => {
    const early = buildPromotionEvent({
      promotionDate: "2026-04-01",
      salaryBeforePromotionFcfa: 500_000n,
      salaryAfterPromotionFcfa: 550_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const late = buildPromotionEvent({
      promotionDate: "2026-04-30",
      salaryBeforePromotionFcfa: 500_000n,
      salaryAfterPromotionFcfa: 550_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const a = buildPromotionAwareMonthlySalaryTrajectory({
      campaignYear: 2026,
      technicalApplicationMonth: 7,
      decemberBaseSalaryFcfa: 500_000n,
      currentGradeCode: "G1",
      currentJobFamilyCode: "F1",
      promotion: early,
    });
    const b = buildPromotionAwareMonthlySalaryTrajectory({
      campaignYear: 2026,
      technicalApplicationMonth: 7,
      decemberBaseSalaryFcfa: 500_000n,
      currentGradeCode: "G1",
      currentJobFamilyCode: "F1",
      promotion: late,
    });
    expect(a.trajectory.map((e) => e.baseSalaryFcfa)).toEqual(
      b.trajectory.map((e) => e.baseSalaryFcfa),
    );
  });
});

describe("Lot 2A-H2C-1 — trajectoire N-1 / N", () => {
  it("promotion N-1 cohérente active janvier–décembre ; coût × 12", () => {
    const event = buildPromotionEvent({
      promotionDate: "2025-06-10",
      salaryBeforePromotionFcfa: 400_000n,
      salaryAfterPromotionFcfa: 500_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F2",
    });
    const result = buildPromotionAwareMonthlySalaryTrajectory({
      campaignYear: 2026,
      technicalApplicationMonth: 7,
      decemberBaseSalaryFcfa: 500_000n,
      currentGradeCode: "G2",
      currentJobFamilyCode: "F2",
      promotion: event,
    });
    expect(result.trajectory).toHaveLength(12);
    expect(
      result.trajectory.every(
        (e) =>
          e.baseSalaryFcfa === 500_000n &&
          e.gradeCode === "G2" &&
          e.jobFamilyCode === "F2" &&
          e.promotionStatus === "PROMOTION_FROM_PREVIOUS_YEAR",
      ),
    ).toBe(true);
    expect(result.costPreview.promotionApplicableMonths).toBe(12);
    expect(result.costPreview.promotionCampaignCostFcfa).toBe(100_000n * 12n);
  });

  it("promotion N-1 incohérente avec salaire courant", () => {
    const event = buildPromotionEvent({
      promotionDate: "2025-06-10",
      salaryBeforePromotionFcfa: 400_000n,
      salaryAfterPromotionFcfa: 500_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    expect(() =>
      buildPromotionAwareMonthlySalaryTrajectory({
        campaignYear: 2026,
        technicalApplicationMonth: 7,
        decemberBaseSalaryFcfa: 480_000n,
        currentGradeCode: "G2",
        currentJobFamilyCode: "F1",
        promotion: event,
      }),
    ).toThrow(PromotionValidationError);
  });

  it("promotion N cohérente avec salaire avant ; changement famille au mois", () => {
    const event = buildPromotionEvent({
      promotionDate: "2026-04-15",
      salaryBeforePromotionFcfa: 500_000n,
      salaryAfterPromotionFcfa: 550_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F2",
    });
    const result = buildPromotionAwareMonthlySalaryTrajectory({
      campaignYear: 2026,
      technicalApplicationMonth: 7,
      decemberBaseSalaryFcfa: 500_000n,
      currentGradeCode: "G1",
      currentJobFamilyCode: "F1",
      promotion: event,
    });
    expect(result.trajectory).toHaveLength(12);
    expect(result.trajectory.map((e) => e.month)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(result.trajectory[2]!.baseSalaryFcfa).toBe(500_000n);
    expect(result.trajectory[2]!.gradeCode).toBe("G1");
    expect(result.trajectory[2]!.jobFamilyCode).toBe("F1");
    expect(result.trajectory[3]!.baseSalaryFcfa).toBe(550_000n);
    expect(result.trajectory[3]!.gradeCode).toBe("G2");
    expect(result.trajectory[3]!.jobFamilyCode).toBe("F2");
    expect(result.trajectory[3]!.promotionStatus).toBe(
      "PROMOTION_EFFECTIVE_THIS_MONTH",
    );
    expect(result.trajectory[4]!.promotionStatus).toBe("PROMOTION_ACTIVE");
    expect(result.costPreview.promotionApplicableMonths).toBe(9);
    expect(result.costPreview.promotionCampaignCostFcfa).toBe(50_000n * 9n);
    expect(result.costPreview.includedInSimulation).toBe(true);
  });

  it("promotion N incohérente avec le snapshot décembre N-1", () => {
    const event = july2026Promotion();
    expect(() =>
      buildPromotionAwareMonthlySalaryTrajectory({
        campaignYear: 2026,
        technicalApplicationMonth: 7,
        decemberBaseSalaryFcfa: 480_000n,
        currentGradeCode: "G1",
        currentJobFamilyCode: "F1",
        promotion: event,
      }),
    ).toThrow(PromotionValidationError);
  });

  it("rejette une date hors fenêtre N-1/N", () => {
    const event = buildPromotionEvent({
      promotionDate: "2024-06-01",
      salaryBeforePromotionFcfa: 400_000n,
      salaryAfterPromotionFcfa: 500_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    expect(() =>
      buildPromotionAwareMonthlySalaryTrajectory({
        campaignYear: 2026,
        technicalApplicationMonth: 7,
        decemberBaseSalaryFcfa: 500_000n,
        currentGradeCode: "G2",
        currentJobFamilyCode: "F1",
        promotion: event,
      }),
    ).toThrow(/N-1|N \(/);
  });

  it("promotion N en juillet incluse ; août exclue pour application juillet", () => {
    const july = buildPromotionEvent({
      promotionDate: "2026-07-20",
      salaryBeforePromotionFcfa: 500_000n,
      salaryAfterPromotionFcfa: 560_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const included = buildPromotionAwareMonthlySalaryTrajectory({
      campaignYear: 2026,
      technicalApplicationMonth: 7,
      decemberBaseSalaryFcfa: 500_000n,
      currentGradeCode: "G1",
      currentJobFamilyCode: "F1",
      promotion: july,
    });
    expect(included.costPreview.includedInSimulation).toBe(true);
    expect(included.trajectory[6]!.promotionStatus).toBe(
      "PROMOTION_EFFECTIVE_THIS_MONTH",
    );

    const august = buildPromotionEvent({
      promotionDate: "2026-08-01",
      salaryBeforePromotionFcfa: 500_000n,
      salaryAfterPromotionFcfa: 560_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const excluded = buildPromotionAwareMonthlySalaryTrajectory({
      campaignYear: 2026,
      technicalApplicationMonth: 7,
      decemberBaseSalaryFcfa: 500_000n,
      currentGradeCode: "G1",
      currentJobFamilyCode: "F1",
      promotion: august,
    });
    expect(excluded.costPreview.includedInSimulation).toBe(false);
    expect(excluded.costPreview.promotionApplicableMonths).toBe(0);
    expect(excluded.costPreview.promotionCampaignCostFcfa).toBe(0n);
    expect(excluded.costPreview.exclusionReason).toBe(
      "EXCLUDED_AFTER_TECHNICAL_APPLICATION_MONTH",
    );
    expect(
      excluded.trajectory.every(
        (e) =>
          e.baseSalaryFcfa === 500_000n &&
          e.promotionStatus === "PROMOTION_EXCLUDED_AFTER_APPLICATION_MONTH",
      ),
    ).toBe(true);
  });

  it("fingerprint diffère selon données de promotion", () => {
    const baseEmployee: PreparedEmployeeCalculationInput = {
      employeeId: "E1",
      familyCode: "F1",
      gradeCode: "G1",
      salaryFcfa: 500_000,
      hireDate: "2020-01-01",
      confirmedUnderperformer: false,
      promotion: null,
    };
    const withPromo: PreparedEmployeeCalculationInput = {
      ...baseEmployee,
      promotion: july2026Promotion(),
    };
    const fpBase = buildSimulationSourceFingerprint({
      campaignId: 1,
      campaignStatus: "draft",
      evaluationMode: "none",
      currentImportBatchId: 1,
      preparedEmployees: [baseEmployee],
      preparedReferences: null,
      budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 1 },
      roundingPolicy: { mode: "nearest_half_up", stepFcfa: 1 },
      campaignYear: 2026,
      technicalApplicationMonth: 7,
    });
    const fpPromo = buildSimulationSourceFingerprint({
      campaignId: 1,
      campaignStatus: "draft",
      evaluationMode: "none",
      currentImportBatchId: 1,
      preparedEmployees: [withPromo],
      preparedReferences: null,
      budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 1 },
      roundingPolicy: { mode: "nearest_half_up", stepFcfa: 1 },
      campaignYear: 2026,
      technicalApplicationMonth: 7,
    });
    expect(fpBase).not.toBe(fpPromo);
    expect(PROMOTION_TRAJECTORY_CONTRACT_VERSION).toBe(1);
    const configA = buildConfigurationFingerprint({
      campaignId: 1,
      budgetMode: "manual_amount",
      manualBudget: 1n,
      roundingMode: "nearest_half_up",
      roundingStep: 1n,
      promotionTrajectoryContractVersion: 1,
    });
    const configB = buildConfigurationFingerprint({
      campaignId: 1,
      budgetMode: "manual_amount",
      manualBudget: 1n,
      roundingMode: "nearest_half_up",
      roundingStep: 1n,
      promotionTrajectoryContractVersion: 99,
    });
    expect(configA).not.toBe(configB);
  });

  it("coût préparé H2C sans ajout au budget ; historique seul = coût 0", () => {
    const without = buildPromotionAwareMonthlySalaryTrajectory({
      campaignYear: 2026,
      technicalApplicationMonth: 7,
      decemberBaseSalaryFcfa: 500_000n,
      currentGradeCode: "G1",
      currentJobFamilyCode: "F1",
      promotion: null,
    });
    expect(without.trajectory).toHaveLength(12);
    expect(without.costPreview.promotionCampaignCostFcfa).toBe(0n);
    expect(without.costPreview.promotionAmountFcfa).toBe(0n);

    const withPromo = buildPromotionAwareMonthlySalaryTrajectory({
      campaignYear: 2026,
      technicalApplicationMonth: 7,
      decemberBaseSalaryFcfa: 500_000n,
      currentGradeCode: "G1",
      currentJobFamilyCode: "F1",
      promotion: july2026Promotion(),
    });
    // Un seul delta compté dans le coût (pas de double comptage).
    expect(withPromo.costPreview.promotionAmountFcfa).toBe(50_000n);
    expect(withPromo.costPreview.promotionCampaignCostFcfa).toBe(50_000n * 9n);
  });
});
