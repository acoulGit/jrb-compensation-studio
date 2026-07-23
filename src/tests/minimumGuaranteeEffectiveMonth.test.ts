/**
 * Lot 2B-RC1-H4 — mois d’effet configurable du minimum garanti.
 *
 * Le moteur conserve theoretical = max(plancher, weighted) (pas une somme).
 * Les scénarios valident la temporalité du plancher et des rappels.
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
  CALCULATION_CONTRACT_VERSION_V8,
  MINIMUM_INCREASE_CONTRACT_VERSION,
  MINIMUM_INCREASE_CONTRACT_VERSION_V1,
  RESULT_SCHEMA_VERSION,
  RESULT_SCHEMA_VERSION_V6,
  calculatePreparedPopulationCompensation,
  type PreparedPopulationCalculationInput,
  type PopulationCalculationReferences,
} from "../domain/compensationCalculation";
import {
  createEmptyConfigurationDraft,
  parseMinimumGuaranteeEffectiveMonthInput,
  parseSimulationConfigurationDraft,
} from "../application/campaignSimulation";
import { buildConfigurationFingerprint } from "../application/campaignSimulation/formatExactBudgetDisplay";
import { resolveMinimumGuaranteeEffectiveMonth } from "../application/campaignSimulation/resolveMinimumGuaranteeEffectiveMonth";

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
  | "performanceFactors"
  | "potentialFactors"
  | "nineBoxFactors"
  | "nineBoxConfirmationFactorMilli"
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

function baseInput(
  overrides: Partial<PreparedPopulationCalculationInput> = {},
): PreparedPopulationCalculationInput {
  return {
    campaignYear: 2026,
    technicalApplicationMonth: 7,
    retroactivityStartMonth: 1,
    minimumGuaranteeEffectiveMonth: 7,
    roundingPolicy: { mode: "nearest_half_up", stepFcfa: 1n },
    budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 120_000 },
    minimumIncreasePolicy: {
      mode: "fixed_monthly_amount",
      minimumMonthlyAmountFcfa: 10_000n,
      minimumIncreaseRate: null,
    },
    references: {
      evaluationMode: "none",
      salaryGrid: [{ familyCode: "F1", gradeCode: "G1", s0Fcfa: 400_000 }],
      salaryPositions: positions(),
      ...factors(),
    },
    employees: [
      {
        employeeId: "EMP-H4",
        familyCode: "F1",
        gradeCode: "G1",
        salaryFcfa: 400_000,
        hireDate: "2020-07-15",
        confirmedUnderperformer: true,
        contractType: "cdi",
        employmentStatus: "active",
      },
    ],
    ...overrides,
  };
}

describe("Lot 2B-RC1-H4 — mois d’effet du minimum garanti", () => {
  it("bump de versions contrat 9 / minimum 2 / schema 7", () => {
    expect(CALCULATION_CONTRACT_VERSION).toBe(9);
    expect(CALCULATION_CONTRACT_VERSION_V8).toBe(8);
    expect(MINIMUM_INCREASE_CONTRACT_VERSION).toBe(2);
    expect(MINIMUM_INCREASE_CONTRACT_VERSION_V1).toBe(1);
    expect(RESULT_SCHEMA_VERSION).toBe(7);
    expect(RESULT_SCHEMA_VERSION_V6).toBe(6);
  });

  describe("paramètre de configuration", () => {
    it("nouvelle simulation → mois minimum = mois technique", () => {
      const draft = createEmptyConfigurationDraft(1, { campaignYear: 2026 });
      expect(draft.minimumGuaranteeEffectiveMonthInput).toBe(
        draft.technicalApplicationMonthInput,
      );
      const parsed = parseSimulationConfigurationDraft(draft);
      expect(parsed.minimumGuaranteeEffectiveMonth).toBe(
        parsed.technicalApplicationMonth,
      );
    });

    it("accepte 1 et 12 ; refuse 0, 13 et non-entier", () => {
      expect(parseMinimumGuaranteeEffectiveMonthInput("1").ok).toBe(true);
      expect(parseMinimumGuaranteeEffectiveMonthInput("12").ok).toBe(true);
      expect(parseMinimumGuaranteeEffectiveMonthInput("0").ok).toBe(false);
      expect(parseMinimumGuaranteeEffectiveMonthInput("13").ok).toBe(false);
      expect(parseMinimumGuaranteeEffectiveMonthInput("7.5").ok).toBe(false);
      const bad = parseMinimumGuaranteeEffectiveMonthInput("0");
      if (!bad.ok) {
        expect(bad.code).toBe("INVALID_MINIMUM_GUARANTEE_EFFECTIVE_MONTH");
        expect(bad.message).toMatch(/janvier et décembre/i);
      }
    });

    it("fingerprint modifié lorsque le mois change", () => {
      const base = {
        campaignId: 1,
        budgetMode: "manual_amount",
        manualBudget: 100n,
        roundingMode: "nearest_half_up",
        roundingStep: 1n,
        campaignYear: 2026,
        retroactivityStartMonth: 1,
        technicalApplicationMonth: 7,
        minimumGuaranteeEffectiveMonth: 7,
        minimumIncreaseMode: "none",
        minimumIncreaseContractVersion: 2,
      };
      const a = buildConfigurationFingerprint(base);
      const b = buildConfigurationFingerprint({
        ...base,
        minimumGuaranteeEffectiveMonth: 4,
      });
      expect(a).not.toBe(b);
    });

    it("changement du mois technique n’écrase pas le mois minimum du brouillon", () => {
      const draft = createEmptyConfigurationDraft(1, { campaignYear: 2026 });
      draft.minimumGuaranteeEffectiveMonthInput = "4";
      draft.technicalApplicationMonthInput = "7";
      const parsed = parseSimulationConfigurationDraft(draft);
      expect(parsed.minimumGuaranteeEffectiveMonth).toBe(4);
      expect(parsed.technicalApplicationMonth).toBe(7);
    });
  });

  describe("compatibilité historique schema 5", () => {
    it("résout vers retroactivityStartMonth, jamais le mois technique", () => {
      const resolved = resolveMinimumGuaranteeEffectiveMonth({
        resultSchemaVersion: 5,
        storedMonth: null,
        retroactivityStartMonth: 1,
      });
      expect(resolved.month).toBe(1);
      expect(resolved.origin).toBe("legacy_retroactivity");
      expect(resolved.historicalNote).toMatch(/rétroactivité/i);
    });

    it("schema 6 conserve la valeur explicite", () => {
      const resolved = resolveMinimumGuaranteeEffectiveMonth({
        resultSchemaVersion: 6,
        storedMonth: 7,
        retroactivityStartMonth: 1,
      });
      expect(resolved.month).toBe(7);
      expect(resolved.origin).toBe("explicit");
      expect(resolved.historicalNote).toBeNull();
    });
  });

  describe("moteur — scénarios temporels (plancher seul)", () => {
    it("B / référence : min = technique juillet → aucun rappel minimum ; actif juil–déc", () => {
      // 10 000 × 6 mois (juil–déc) = 60 000
      const result = calculatePreparedPopulationCompensation(
        baseInput({
          budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 60_000 },
          minimumGuaranteeEffectiveMonth: 7,
          technicalApplicationMonth: 7,
          retroactivityStartMonth: 1,
        }),
      );
      const emp = result.employees[0]!;
      expect(emp.minimumGuaranteeEffectiveMonth).toBe(7);
      for (const month of emp.monthlyCompensationTrajectory) {
        if (month.month < 7) {
          expect(month.minimumComplementFloorFcfa).toBe(0n);
          expect(month.roundedCompensatoryComplementFcfa).toBe(0n);
        } else {
          expect(month.minimumComplementFloorFcfa).toBe(10_000n);
          expect(month.roundedCompensatoryComplementFcfa).toBe(10_000n);
        }
      }
      expect(emp.minimumCompensatoryReminderFcfa).toBe(0n);
      expect(emp.aboveMinimumCompensatoryReminderFcfa).toBe(0n);
      expect(emp.baseSalaryReminderFcfa).toBe(0n);
      expect(emp.campaignPeriodMinimumComplementFloorCostFcfa).toBe(60_000n);
      expect(result.totalMinimumComplementFloorCostFcfa).toBe(60_000n);
    });

    it("A : min avril, technique juillet → rappel minimum avril–juin", () => {
      // Floor avr–déc = 9 mois × 10k = 90k
      const result = calculatePreparedPopulationCompensation(
        baseInput({
          budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 90_000 },
          minimumGuaranteeEffectiveMonth: 4,
          technicalApplicationMonth: 7,
          retroactivityStartMonth: 1,
        }),
      );
      const emp = result.employees[0]!;
      for (const month of emp.monthlyCompensationTrajectory) {
        if (month.month < 4) {
          expect(month.minimumComplementFloorFcfa).toBe(0n);
        } else {
          expect(month.minimumComplementFloorFcfa).toBe(10_000n);
        }
      }
      expect(emp.minimumCompensatoryReminderFcfa).toBe(10_000n * 3n); // avr–juin
      expect(emp.minimumRemainingYearDirectCostFcfa).toBe(10_000n * 6n); // juil–déc
    });

    it("C : min septembre > technique juillet → aucun rappel minimum", () => {
      // Floor sept–déc = 4 × 10k = 40k
      const result = calculatePreparedPopulationCompensation(
        baseInput({
          budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 40_000 },
          minimumGuaranteeEffectiveMonth: 9,
          technicalApplicationMonth: 7,
          retroactivityStartMonth: 1,
        }),
      );
      const emp = result.employees[0]!;
      for (const month of emp.monthlyCompensationTrajectory) {
        if (month.month < 9) {
          expect(month.minimumComplementFloorFcfa).toBe(0n);
        } else {
          expect(month.minimumComplementFloorFcfa).toBe(10_000n);
        }
      }
      expect(emp.minimumCompensatoryReminderFcfa).toBe(0n);
      expect(emp.minimumRemainingYearDirectCostFcfa).toBe(40_000n);
    });

    it("D : min avant rétroactivité → début réel à la rétroactivité", () => {
      // rétro=4, minEff=2 → actif dès avril ; avr–déc = 9 × 10k
      const result = calculatePreparedPopulationCompensation(
        baseInput({
          budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 90_000 },
          retroactivityStartMonth: 4,
          minimumGuaranteeEffectiveMonth: 2,
          technicalApplicationMonth: 7,
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
      expect(emp.minimumCompensatoryReminderFcfa).toBe(10_000n * 3n);
    });

    it("E : même mois partout → aucun rappel compensatoire", () => {
      const result = calculatePreparedPopulationCompensation(
        baseInput({
          budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 60_000 },
          retroactivityStartMonth: 7,
          minimumGuaranteeEffectiveMonth: 7,
          technicalApplicationMonth: 7,
        }),
      );
      const emp = result.employees[0]!;
      expect(emp.baseSalaryReminderFcfa).toBe(0n);
      expect(emp.minimumCompensatoryReminderFcfa).toBe(0n);
      expect(emp.retroactiveMonths).toBe(0);
      expect(emp.campaignPeriodMinimumComplementFloorCostFcfa).toBe(60_000n);
    });

    it("défaut moteur = technicalApplicationMonth lorsque omis", () => {
      const result = calculatePreparedPopulationCompensation(
        baseInput({
          budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 60_000 },
          minimumGuaranteeEffectiveMonth: undefined,
          technicalApplicationMonth: 7,
          retroactivityStartMonth: 1,
        }),
      );
      expect(result.minimumGuaranteeEffectiveMonth).toBe(7);
      expect(result.employees[0]!.minimumCompensatoryReminderFcfa).toBe(0n);
    });

    it("MINIMUM_GUARANTEE_EXCEEDS_BUDGET utilise le vrai nombre de mois", () => {
      // Ancien (12 mois × 10k) : 120k requis ; nouveau (6 mois juil–déc) : 60k.
      expect(() =>
        calculatePreparedPopulationCompensation(
          baseInput({
            budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 60_000 },
            minimumGuaranteeEffectiveMonth: 7,
            technicalApplicationMonth: 7,
          }),
        ),
      ).not.toThrow();

      expect(() =>
        calculatePreparedPopulationCompensation(
          baseInput({
            budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 50_000 },
            minimumGuaranteeEffectiveMonth: 7,
            technicalApplicationMonth: 7,
          }),
        ),
      ).toThrow(
        expect.objectContaining({ code: "MINIMUM_GUARANTEE_EXCEEDS_BUDGET" }),
      );
    });
  });

  describe("moteur — part au-dessus reste rétroactive", () => {
    it("avec budget au-dessus du plancher, le rappel above couvre jan–juin", () => {
      // Non sous-performant, facteur 1 (mode none).
      // Floor juil–déc = 60k. Reliquat large pour produire un above > 0 dès janvier.
      const result = calculatePreparedPopulationCompensation(
        baseInput({
          budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 500_000 },
          minimumGuaranteeEffectiveMonth: 7,
          technicalApplicationMonth: 7,
          retroactivityStartMonth: 1,
          employees: [
            {
              employeeId: "EMP-ABOVE",
              familyCode: "F1",
              gradeCode: "G1",
              salaryFcfa: 400_000,
              hireDate: "2020-07-15",
              confirmedUnderperformer: false,
              contractType: "cdi",
              employmentStatus: "active",
            },
          ],
        }),
      );
      const emp = result.employees[0]!;
      expect(emp.minimumCompensatoryReminderFcfa).toBe(0n);
      expect(emp.aboveMinimumCompensatoryReminderFcfa).toBeGreaterThan(0n);
      expect(emp.baseSalaryReminderFcfa).toBe(
        emp.aboveMinimumCompensatoryReminderFcfa,
      );
      for (const month of emp.monthlyCompensationTrajectory) {
        if (month.month >= 1 && month.month <= 6) {
          expect(month.minimumComplementFloorFcfa).toBe(0n);
          expect(month.actualComplementAboveMinimumFcfa).toBeGreaterThan(0n);
          expect(month.paymentTiming).toBe("reminder");
        }
        if (month.month >= 7) {
          expect(month.minimumComplementFloorFcfa).toBe(10_000n);
        }
      }
    });
  });
});
