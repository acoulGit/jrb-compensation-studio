/**
 * Lot 2A-H2D-2 — minimum garanti d’augmentation (contrat de calcul v4).
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_NINE_BOX_CONFIRMATION_FACTOR_MILLI,
  DEFAULT_NINE_BOX_FACTORS,
  DEFAULT_PERFORMANCE_FACTORS,
  DEFAULT_POTENTIAL_FACTORS,
  DEFAULT_SALARY_POSITIONS,
} from "../domain/compensationReference/defaults";
import {
  CALCULATION_CONTRACT_VERSION,
  CompensationCalculationError,
  MINIMUM_INCREASE_CONTRACT_VERSION,
  NO_MINIMUM_INCREASE_POLICY,
  buildPromotionEvent,
  calculatePreparedPopulationCompensation,
  ceilFractionToConfiguredRoundingStep,
  computeMinimumComplementFloorFcfa,
  exactAmountFromInteger,
  fractionsEqual,
  isMinimumIncreasePopulationEmployee,
  minimumIncreaseRateFromPercentParts,
  reduceFraction,
  resolveMinimumIncreaseExclusionReason,
  validateMinimumIncreasePolicy,
  type PreparedEmployeeCalculationInput,
  type PreparedPopulationCalculationInput,
  type PopulationCalculationReferences,
} from "../domain/compensationCalculation";
import { buildConfigurationFingerprint as buildConfigFp } from "../application/campaignSimulation/formatExactBudgetDisplay";
import {
  parseMinimumIncreaseRatePercentInput,
  parseMinimumMonthlyAmountInput,
  parseSimulationConfigurationDraft as parseDraft,
} from "../application/campaignSimulation/parseSimulationConfiguration";
import { createEmptyConfigurationDraft } from "../application/campaignSimulation/simulationConfigurationModels";
import { assertSimulationResultPersistable } from "../application/campaignSimulation/mapExecutionResultToSaveDto";
import { findDedicatedSimulationBusinessError } from "../application/campaignSimulation/findDedicatedSimulationBusinessError";

function positions() {
  return DEFAULT_SALARY_POSITIONS.map((p) => ({
    code: p.code,
    label: p.label,
    referenceRatioBps: p.referenceRatioBps,
    positionFactorMilli: p.positionFactorMilli,
  }));
}

function factors(): Pick<
  PopulationCalculationReferences,
  "performanceFactors" | "potentialFactors" | "nineBoxFactors" | "nineBoxConfirmationFactorMilli"
> {
  return {
    performanceFactors: DEFAULT_PERFORMANCE_FACTORS.map((f) => ({
      level: f.level,
      factorMilli: f.factorMilli,
    })),
    potentialFactors: DEFAULT_POTENTIAL_FACTORS.map((f) => ({
      level: f.level,
      factorMilli: f.factorMilli,
    })),
    nineBoxFactors: DEFAULT_NINE_BOX_FACTORS.map((f) => ({
      performanceLevel: f.performanceLevel,
      potentialLevel: f.potentialLevel,
      factorMilli: f.factorMilli,
      boxCode: f.boxCode,
    })),
    nineBoxConfirmationFactorMilli: DEFAULT_NINE_BOX_CONFIRMATION_FACTOR_MILLI,
  };
}

function populationTest1Input(
  overrides: Partial<PreparedPopulationCalculationInput> = {},
): PreparedPopulationCalculationInput {
  const employees: PreparedEmployeeCalculationInput[] = [];
  for (let i = 1; i <= 14; i += 1) {
    employees.push({
      employeeId: `EMP-${2000 + i}`,
      familyCode: "F1",
      gradeCode: "G1",
      salaryFcfa: i === 2 ? 536_000 : 400_000 + i * 10_000,
      hireDate: "2020-07-15",
      confirmedUnderperformer: false,
      contractType: "cdi",
      employmentStatus: "active",
    });
  }
  employees.push({
    employeeId: "EMP-UNDER",
    familyCode: "F1",
    gradeCode: "G1",
    salaryFcfa: 450_000,
    hireDate: "2020-07-15",
    confirmedUnderperformer: true,
    contractType: "cdi",
    employmentStatus: "active",
  });

  return {
    employees,
    references: {
      evaluationMode: "none",
      salaryGrid: [{ familyCode: "F1", gradeCode: "G1", s0Fcfa: 500_000 }],
      salaryPositions: positions(),
      ...factors(),
    },
    budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 5_000_023 },
    roundingPolicy: { mode: "nearest_half_up", stepFcfa: 5 },
    campaignYear: 2026,
    technicalApplicationMonth: 1,
    retroactivityStartMonth: 1,
    minimumIncreasePolicy: NO_MINIMUM_INCREASE_POLICY,
    ...overrides,
  };
}

describe("Lot 2A-H2D-2 — minimum garanti d’augmentation", () => {
  it("expose MINIMUM_INCREASE_CONTRACT_VERSION = 2 (contrat de calcul courant ≥ 4)", () => {
    expect(CALCULATION_CONTRACT_VERSION).toBeGreaterThanOrEqual(4);
    expect(MINIMUM_INCREASE_CONTRACT_VERSION).toBe(2);
  });

  describe("configuration", () => {
    it("mode none par défaut", () => {
      const draft = createEmptyConfigurationDraft(1, { campaignYear: 2026 });
      expect(draft.minimumIncreaseMode).toBe("none");
      expect(draft.minimumMonthlyAmountInput).toBe("");
      expect(draft.minimumIncreaseRatePercentInput).toBe("");
      const parsed = parseDraft(draft);
      expect(parsed.minimumIncreasePolicy).toEqual(NO_MINIMUM_INCREASE_POLICY);
      expect(parsed.isMinimumIncreaseComplete).toBe(true);
    });

    it("forfait positif accepté ; zéro et négatif refusés", () => {
      expect(parseMinimumMonthlyAmountInput("15000").ok).toBe(true);
      expect(parseMinimumMonthlyAmountInput("0").ok).toBe(false);
      expect(parseMinimumMonthlyAmountInput("-1").ok).toBe(false);
    });

    it("taux positif exact ; zéro / négatif / scientifique refusés", () => {
      const ok = parseMinimumIncreaseRatePercentInput("2,5");
      expect(ok.ok).toBe(true);
      if (ok.ok) {
        expect(fractionsEqual(ok.value, reduceFraction(1n, 40n))).toBe(true);
      }
      expect(parseMinimumIncreaseRatePercentInput("0").ok).toBe(false);
      expect(parseMinimumIncreaseRatePercentInput("-3").ok).toBe(false);
      expect(parseMinimumIncreaseRatePercentInput("1e2").ok).toBe(false);
      expect(
        fractionsEqual(
          minimumIncreaseRateFromPercentParts(3n, ""),
          reduceFraction(3n, 100n),
        ),
      ).toBe(true);
    });

    it("modes exclusifs validés côté domaine", () => {
      expect(() =>
        validateMinimumIncreasePolicy({
          mode: "fixed_monthly_amount",
          minimumMonthlyAmountFcfa: 10_000n,
          minimumIncreaseRate: reduceFraction(3n, 100n),
        }),
      ).toThrow(CompensationCalculationError);
      expect(() =>
        validateMinimumIncreasePolicy({
          mode: "none",
          minimumMonthlyAmountFcfa: 1n,
          minimumIncreaseRate: null,
        }),
      ).toThrow(CompensationCalculationError);
    });

    it("fingerprint change avec le mode et la valeur", () => {
      const base = {
        campaignId: 1,
        budgetMode: "manual_amount",
        manualBudget: 1n,
        roundingMode: "nearest_half_up",
        roundingStep: 5n,
        campaignYear: 2026,
        retroactivityStartMonth: 1,
        technicalApplicationMonth: 1,
      };
      const none = buildConfigFp({
        ...base,
        minimumIncreaseMode: "none",
        minimumIncreaseContractVersion: 1,
      });
      const fixed = buildConfigFp({
        ...base,
        minimumIncreaseMode: "fixed_monthly_amount",
        minimumMonthlyAmountFcfa: 15_000n,
        minimumIncreaseContractVersion: 1,
      });
      const fixed2 = buildConfigFp({
        ...base,
        minimumIncreaseMode: "fixed_monthly_amount",
        minimumMonthlyAmountFcfa: 20_000n,
        minimumIncreaseContractVersion: 1,
      });
      expect(none).not.toBe(fixed);
      expect(fixed).not.toBe(fixed2);
    });
  });

  describe("population", () => {
    it("inclut CDI/CDD actifs, détachement, congé légal, <12 mois, sous-performant", () => {
      expect(
        isMinimumIncreasePopulationEmployee({
          contractType: "cdi",
          employmentStatus: "active",
        }),
      ).toBe(true);
      expect(
        isMinimumIncreasePopulationEmployee({
          contractType: "cdd",
          employmentStatus: "group_detachment",
        }),
      ).toBe(true);
      expect(
        isMinimumIncreasePopulationEmployee({
          contractType: "cdi",
          employmentStatus: "legal_leave",
        }),
      ).toBe(true);
    });

    it("exclut temporary, contractor, departed, suspended, external_availability", () => {
      expect(
        resolveMinimumIncreaseExclusionReason({
          contractType: "temporary",
          employmentStatus: "active",
        }),
      ).toBe("CONTRACT_TYPE_EXCLUDED");
      expect(
        resolveMinimumIncreaseExclusionReason({
          contractType: "contractor",
          employmentStatus: "active",
        }),
      ).toBe("CONTRACT_TYPE_EXCLUDED");
      expect(
        resolveMinimumIncreaseExclusionReason({
          contractType: "cdi",
          employmentStatus: "departed",
        }),
      ).toBe("EMPLOYMENT_STATUS_EXCLUDED");
      expect(
        resolveMinimumIncreaseExclusionReason({
          contractType: "cdi",
          employmentStatus: "suspended",
        }),
      ).toBe("EMPLOYMENT_STATUS_EXCLUDED");
      expect(
        resolveMinimumIncreaseExclusionReason({
          contractType: "cdi",
          employmentStatus: "external_availability",
        }),
      ).toBe("EMPLOYMENT_STATUS_EXCLUDED");
    });
  });

  describe("plancher et arrondi", () => {
    it("ceil au pas 5", () => {
      expect(
        ceilFractionToConfiguredRoundingStep(
          exactAmountFromInteger(15_000n),
          5n,
        ),
      ).toBe(15_000n);
      expect(
        ceilFractionToConfiguredRoundingStep(reduceFraction(1500001n, 100n), 5n),
      ).toBe(15_005n);
      expect(
        ceilFractionToConfiguredRoundingStep(reduceFraction(150025n, 10n), 5n),
      ).toBe(15_005n);
    });

    it("promotion déduite du complément minimum", () => {
      const floor = computeMinimumComplementFloorFcfa({
        policy: {
          mode: "fixed_monthly_amount",
          minimumMonthlyAmountFcfa: 30_000n,
          minimumIncreaseRate: null,
        },
        applicableMonthlyBaseSalaryFcfa: 500_000n,
        applicablePromotionIncrementFcfa: 20_000n,
        roundingStepFcfa: 5n,
        isCampaignCoveredMonth: true,
        isMinimumIncreasePopulationEmployee: true,
      });
      expect(floor).toBe(10_000n);
      const fullyCovered = computeMinimumComplementFloorFcfa({
        policy: {
          mode: "fixed_monthly_amount",
          minimumMonthlyAmountFcfa: 30_000n,
          minimumIncreaseRate: null,
        },
        applicableMonthlyBaseSalaryFcfa: 500_000n,
        applicablePromotionIncrementFcfa: 35_000n,
        roundingStepFcfa: 5n,
        isCampaignCoveredMonth: true,
        isMinimumIncreasePopulationEmployee: true,
      });
      expect(fullyCovered).toBe(0n);
    });
  });

  describe("calcul population", () => {
    it("mode none : parité Population Test 1 (5 000 040 / +17, EMP-2002=30205)", () => {
      const result = calculatePreparedPopulationCompensation(
        populationTest1Input(),
      );
      expect(result.annualActualOperationCostFcfa).toBe(5_000_040n);
      expect(
        fractionsEqual(
          result.annualTotalRoundingDelta,
          exactAmountFromInteger(17n),
        ),
      ).toBe(true);
      const emp2002 = result.employees.find((e) => e.employeeId === "EMP-2002")!;
      expect(emp2002.monthlyFinalRoundedIncreaseFcfa).toBe(30_205n);
      expect(
        fractionsEqual(
          result.compensatoryCalibrationRate,
          reduceFraction(5_000_023n, 75_421_200n),
        ),
      ).toBe(true);
      expect(result.totalMinimumComplementFloorCostFcfa).toBe(0n);
      expect(result.minimumIncreaseMode).toBe("none");
      for (const month of emp2002.monthlyCompensationTrajectory) {
        expect(month.minimumComplementFloorFcfa).toBe(0n);
        expect(month.actualComplementAboveMinimumFcfa).toBe(
          month.roundedCompensatoryComplementFcfa,
        );
      }
    });

    it("forfait : sous-performant reçoit uniquement le minimum", () => {
      const result = calculatePreparedPopulationCompensation(
        populationTest1Input({
          budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 8_000_000 },
          minimumIncreasePolicy: {
            mode: "fixed_monthly_amount",
            minimumMonthlyAmountFcfa: 10_000n,
            minimumIncreaseRate: null,
          },
        }),
      );
      const under = result.employees.find((e) => e.employeeId === "EMP-UNDER")!;
      expect(under.isMinimumIncreasePopulationEmployee).toBe(true);
      expect(under.monthlyFinalRoundedIncreaseFcfa).toBe(10_000n);
      expect(under.campaignPeriodCompensationAboveMinimumCostFcfa).toBe(0n);
      expect(under.campaignPeriodMinimumComplementFloorCostFcfa).toBe(
        10_000n * 12n,
      );
    });

    it("CDI < 12 mois reçoit le minimum uniquement (inéligible pondéré)", () => {
      const result = calculatePreparedPopulationCompensation(
        populationTest1Input({
          employees: [
            {
              employeeId: "EMP-NEW",
              familyCode: "F1",
              gradeCode: "G1",
              salaryFcfa: 400_000,
              hireDate: "2025-06-01",
              confirmedUnderperformer: false,
              contractType: "cdi",
              employmentStatus: "active",
            },
            {
              employeeId: "EMP-OLD",
              familyCode: "F1",
              gradeCode: "G1",
              salaryFcfa: 500_000,
              hireDate: "2020-01-01",
              confirmedUnderperformer: false,
              contractType: "cdi",
              employmentStatus: "active",
            },
          ],
          budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 500_000 },
          minimumIncreasePolicy: {
            mode: "fixed_monthly_amount",
            minimumMonthlyAmountFcfa: 5_000n,
            minimumIncreaseRate: null,
          },
        }),
      );
      const newbie = result.employees.find((e) => e.employeeId === "EMP-NEW")!;
      expect(newbie.compensatoryMeasureEligible).toBe(false);
      expect(newbie.isMinimumIncreasePopulationEmployee).toBe(true);
      expect(newbie.monthlyFinalRoundedIncreaseFcfa).toBe(5_000n);
      expect(newbie.campaignPeriodCompensationAboveMinimumCostFcfa).toBe(0n);
    });

    it("temporary / contractor exclus du minimum", () => {
      const result = calculatePreparedPopulationCompensation(
        populationTest1Input({
          employees: [
            {
              employeeId: "EMP-TEMP",
              familyCode: "F1",
              gradeCode: "G1",
              salaryFcfa: 400_000,
              hireDate: "2020-01-01",
              confirmedUnderperformer: false,
              contractType: "temporary",
              employmentStatus: "active",
              compensatoryMeasureEligible: false,
            },
            {
              employeeId: "EMP-OK",
              familyCode: "F1",
              gradeCode: "G1",
              salaryFcfa: 500_000,
              hireDate: "2020-01-01",
              confirmedUnderperformer: false,
              contractType: "cdi",
              employmentStatus: "active",
            },
          ],
          budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 200_000 },
          minimumIncreasePolicy: {
            mode: "fixed_monthly_amount",
            minimumMonthlyAmountFcfa: 8_000n,
            minimumIncreaseRate: null,
          },
        }),
      );
      const temp = result.employees.find((e) => e.employeeId === "EMP-TEMP")!;
      expect(temp.isMinimumIncreasePopulationEmployee).toBe(false);
      expect(temp.campaignPeriodMinimumComplementFloorCostFcfa).toBe(0n);
    });

    it("pourcentage : assiette sur salaire applicable + ceil", () => {
      const rate = minimumIncreaseRateFromPercentParts(3n, "");
      const result = calculatePreparedPopulationCompensation(
        populationTest1Input({
          employees: [
            {
              employeeId: "EMP-P",
              familyCode: "F1",
              gradeCode: "G1",
              salaryFcfa: 500_000,
              hireDate: "2020-01-01",
              confirmedUnderperformer: false,
              contractType: "cdi",
              employmentStatus: "active",
            },
          ],
          budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 300_000 },
          minimumIncreasePolicy: {
            mode: "percentage_of_base_salary",
            minimumMonthlyAmountFcfa: null,
            minimumIncreaseRate: rate,
          },
        }),
      );
      const emp = result.employees[0]!;
      // 3% de 500000 = 15000 exact → floor 15000
      expect(emp.monthlyFinalRoundedIncreaseFcfa).toBeGreaterThanOrEqual(15_000n);
      const dec = emp.monthlyCompensationTrajectory.find((m) => m.month === 12)!;
      expect(dec.minimumComplementFloorFcfa).toBe(15_000n);
      expect(dec.guaranteedTotalIncreaseExact).toEqual(
        exactAmountFromInteger(15_000n),
      );
    });

    it("MINIMUM_GUARANTEE_EXCEEDS_BUDGET quand planchers > budget", () => {
      expect(() =>
        calculatePreparedPopulationCompensation(
          populationTest1Input({
            employees: [
              {
                employeeId: "EMP-A",
                familyCode: "F1",
                gradeCode: "G1",
                salaryFcfa: 500_000,
                hireDate: "2020-01-01",
                confirmedUnderperformer: true,
                contractType: "cdi",
                employmentStatus: "active",
              },
            ],
            budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 50_000 },
            minimumIncreasePolicy: {
              mode: "fixed_monthly_amount",
              minimumMonthlyAmountFcfa: 10_000n,
              minimumIncreaseRate: null,
            },
          }),
        ),
      ).toThrow(
        expect.objectContaining({ code: "MINIMUM_GUARANTEE_EXCEEDS_BUDGET" }),
      );
    });

    it("budget = promo + minimum → simulation valide, taux 0", () => {
      // Un seul salarié, forfait 10 000 × 12 = 120 000, sans promo
      const result = calculatePreparedPopulationCompensation(
        populationTest1Input({
          employees: [
            {
              employeeId: "EMP-ONLY",
              familyCode: "F1",
              gradeCode: "G1",
              salaryFcfa: 400_000,
              hireDate: "2020-01-01",
              confirmedUnderperformer: true,
              contractType: "cdi",
              employmentStatus: "active",
            },
          ],
          budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 120_000 },
          minimumIncreasePolicy: {
            mode: "fixed_monthly_amount",
            minimumMonthlyAmountFcfa: 10_000n,
            minimumIncreaseRate: null,
          },
        }),
      );
      expect(
        fractionsEqual(
          result.compensatoryCalibrationRate,
          exactAmountFromInteger(0n),
        ),
      ).toBe(true);
      expect(result.totalMinimumComplementFloorCostFcfa).toBe(120_000n);
      expect(result.actualCompensationAboveMinimumCostFcfa).toBe(0n);
      expect(result.annualActualOperationCostFcfa).toBe(120_000n);
    });

    it("promotion contribue au minimum (forfait 30k, promo 20k → floor 10k)", () => {
      const result = calculatePreparedPopulationCompensation(
        populationTest1Input({
          employees: [
            {
              employeeId: "EMP-PROMO",
              familyCode: "F1",
              gradeCode: "G2",
              salaryFcfa: 520_000,
              hireDate: "2020-01-01",
              confirmedUnderperformer: true,
              contractType: "cdi",
              employmentStatus: "active",
              promotion: buildPromotionEvent({
                promotionDate: "2025-03-01",
                salaryBeforePromotionFcfa: 500_000n,
                salaryAfterPromotionFcfa: 520_000n,
                previousGradeCode: "G1",
                promotedGradeCode: "G2",
                previousJobFamilyCode: "F1",
                promotedJobFamilyCode: "F1",
              }),
            },
          ],
          references: {
            evaluationMode: "none",
            salaryGrid: [
              { familyCode: "F1", gradeCode: "G1", s0Fcfa: 500_000 },
              { familyCode: "F1", gradeCode: "G2", s0Fcfa: 600_000 },
            ],
            salaryPositions: positions(),
            ...factors(),
          },
          budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 360_000 },
          minimumIncreasePolicy: {
            mode: "fixed_monthly_amount",
            minimumMonthlyAmountFcfa: 30_000n,
            minimumIncreaseRate: null,
          },
        }),
      );
      const emp = result.employees[0]!;
      const dec = emp.monthlyCompensationTrajectory.find((m) => m.month === 12)!;
      expect(dec.applicablePromotionIncrementFcfa).toBe(20_000n);
      expect(dec.minimumComplementFloorFcfa).toBe(10_000n);
      expect(dec.roundedCompensatoryComplementFcfa).toBe(10_000n);
    });

    it("minimum nul avant rétroactivité", () => {
      const result = calculatePreparedPopulationCompensation(
        populationTest1Input({
          employees: [
            {
              employeeId: "EMP-R",
              familyCode: "F1",
              gradeCode: "G1",
              salaryFcfa: 400_000,
              hireDate: "2020-01-01",
              confirmedUnderperformer: true,
              contractType: "cdi",
              employmentStatus: "active",
            },
          ],
          retroactivityStartMonth: 4,
          technicalApplicationMonth: 7,
          minimumGuaranteeEffectiveMonth: 4,
          budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 90_000 },
          minimumIncreasePolicy: {
            mode: "fixed_monthly_amount",
            minimumMonthlyAmountFcfa: 10_000n,
            minimumIncreaseRate: null,
          },
        }),
      );
      const emp = result.employees[0]!;
      for (const month of emp.monthlyCompensationTrajectory) {
        if (month.month < 4) {
          expect(month.minimumComplementFloorFcfa).toBe(0n);
          expect(month.roundedCompensatoryComplementFcfa).toBe(0n);
          expect(month.coveredByCampaignPeriod).toBe(false);
        } else {
          expect(month.minimumComplementFloorFcfa).toBe(10_000n);
        }
      }
      expect(emp.minimumCompensatoryReminderFcfa).toBe(10_000n * 3n); // avr–juin
      expect(emp.minimumRemainingYearDirectCostFcfa).toBe(10_000n * 6n); // juil–déc
    });

    it("invariants minimum + au-dessus = complément ; plein effet décembre × 12", () => {
      const result = calculatePreparedPopulationCompensation(
        populationTest1Input({
          budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 8_000_000 },
          minimumIncreasePolicy: {
            mode: "fixed_monthly_amount",
            minimumMonthlyAmountFcfa: 5_000n,
            minimumIncreaseRate: null,
          },
        }),
      );
      expect(
        result.actualMinimumComplementPaidCostFcfa +
          result.actualCompensationAboveMinimumCostFcfa,
      ).toBe(result.annualActualOperationCostFcfa);
      expect(
        result.fullYearRunRateMinimumComplementCostFcfa +
          result.fullYearRunRateCompensationAboveMinimumCostFcfa,
      ).toBe(result.fullYearRunRateCompensatoryCostFcfa);
    });
  });

  describe("persistance et erreurs UI", () => {
    it("assertSimulationResultPersistable refuse contrat 4 / schema 2", () => {
      expect(() =>
        assertSimulationResultPersistable({
          calculationContractVersion: 4,
          resultSchemaVersion: 2,
        }),
      ).toThrow(/consolidat/i);
    });

    it("findDedicatedSimulationBusinessError pour MINIMUM_GUARANTEE_EXCEEDS_BUDGET", () => {
      const dedicated = findDedicatedSimulationBusinessError([
        {
          code: "MINIMUM_GUARANTEE_EXCEEDS_BUDGET",
          message: "L’enveloppe ne permet pas de financer les promotions et le minimum garanti.",
          details: {
            annualBudgetTargetFcfa: "100000/1",
            totalAnnualPromotionBudgetCostFcfa: "60000",
            totalMinimumComplementFloorCostFcfa: "80000",
            overrunFcfa: "40000/1",
          },
        },
      ]);
      expect(dedicated?.code).toBe("MINIMUM_GUARANTEE_EXCEEDS_BUDGET");
      expect(dedicated?.message).not.toMatch(/augmenter le minimum/i);
      expect(dedicated?.message).toMatch(/Augmentez l’enveloppe/i);
    });
  });
});
