/**
 * Lot 2B-RC1-H5 — forfait social universel + mécanisme social exclusif.
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
  CompensationCalculationError,
  RESULT_SCHEMA_VERSION,
  RESULT_SCHEMA_VERSION_V6,
  UNIVERSAL_FIXED_AMOUNT_CONTRACT_VERSION,
  calculatePreparedPopulationCompensation,
  ceilFcfaPercentOfAmount,
  deriveSocialMechanismKindFromMinimumIncreaseMode,
  hasUniversalFixedAmountSeniority,
  isUniversalFixedAmountEligible,
  parseHireDateIso,
  resolveUniversalFixedAmountExclusionReason,
  seniorityMonthsAtDecemberNMinus1,
  seniorityMonthsAtReferenceDate,
  seniorityRatePercentAt,
  type PreparedEmployeeCalculationInput,
  type PreparedPopulationCalculationInput,
  type PopulationCalculationReferences,
  type UniversalFixedAmountPolicy,
} from "../domain/compensationCalculation";
import {
  parseSimulationConfigurationDraft as parseDraft,
  parseUniversalFixedAmountMinimumSeniorityMonthsInput,
  parseUniversalFixedAmountMonthlyAmountInput,
  parseUniversalFixedAmountSeniorityReferenceDateInput,
} from "../application/campaignSimulation/parseSimulationConfiguration";
import { createEmptyConfigurationDraft } from "../application/campaignSimulation/simulationConfigurationModels";
import { assertSimulationResultPersistable } from "../application/campaignSimulation/mapExecutionResultToSaveDto";
import { buildConfigurationFingerprint } from "../application/campaignSimulation/formatExactBudgetDisplay";

const REF_2025_12_31 = "2025-12-31";

function forfaitPolicy(
  overrides: Partial<UniversalFixedAmountPolicy> = {},
): UniversalFixedAmountPolicy {
  return {
    monthlyAmountFcfa: 10_000n,
    effectiveMonth: 1,
    minimumSeniorityMonths: 0,
    seniorityReferenceDate: REF_2025_12_31,
    ...overrides,
  };
}

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
  const employees: PreparedEmployeeCalculationInput[] = [
    {
      employeeId: "EMP-A",
      familyCode: "F1",
      gradeCode: "G1",
      salaryFcfa: 400_000,
      hireDate: "2020-01-15",
      confirmedUnderperformer: false,
      contractType: "cdi",
      employmentStatus: "active",
    },
    {
      employeeId: "EMP-B",
      familyCode: "F1",
      gradeCode: "G1",
      salaryFcfa: 500_000,
      hireDate: "2020-06-01",
      confirmedUnderperformer: false,
      contractType: "cdi",
      employmentStatus: "active",
    },
  ];

  return {
    employees,
    references: {
      evaluationMode: "none",
      salaryGrid: [{ familyCode: "F1", gradeCode: "G1", s0Fcfa: 500_000 }],
      salaryPositions: positions(),
      ...factors(),
    },
    budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 2_400_000n },
    roundingPolicy: { mode: "nearest_half_up", stepFcfa: 5n },
    campaignYear: 2026,
    technicalApplicationMonth: 1,
    retroactivityStartMonth: 1,
    socialMechanismKind: "none",
    ...overrides,
  };
}

describe("Lot 2B-RC1-H5 — forfait social universel", () => {
  describe("versions contrat / schema", () => {
    it("bumpe contrat v9 et schema v7 ; conserve v8/v6", () => {
      expect(CALCULATION_CONTRACT_VERSION).toBe(9);
      expect(CALCULATION_CONTRACT_VERSION_V8).toBe(8);
      expect(RESULT_SCHEMA_VERSION).toBe(7);
      expect(RESULT_SCHEMA_VERSION_V6).toBe(6);
      expect(UNIVERSAL_FIXED_AMOUNT_CONTRACT_VERSION).toBe(2);
    });

    it("exige schema ≥ 7 pour persister un résultat contrat 9", () => {
      expect(() =>
        assertSimulationResultPersistable({
          calculationContractVersion: 9,
          resultSchemaVersion: 6,
        }),
      ).toThrow(/schema/i);
      expect(() =>
        assertSimulationResultPersistable({
          calculationContractVersion: 9,
          resultSchemaVersion: 7,
        }),
      ).not.toThrow();
    });
  });

  describe("mécanisme social exclusif", () => {
    it("dérive minimum_guaranteed / none depuis l’ancien mode — jamais forfait", () => {
      expect(
        deriveSocialMechanismKindFromMinimumIncreaseMode("fixed_monthly_amount"),
      ).toBe("minimum_guaranteed");
      expect(
        deriveSocialMechanismKindFromMinimumIncreaseMode(
          "percentage_of_base_salary",
        ),
      ).toBe("minimum_guaranteed");
      expect(deriveSocialMechanismKindFromMinimumIncreaseMode("none")).toBe(
        "none",
      );
      expect(deriveSocialMechanismKindFromMinimumIncreaseMode(null)).toBe(
        "none",
      );
    });

    it("parse : aucun / minimum / forfait ; exclusivité", () => {
      const noneDraft = createEmptyConfigurationDraft(1);
      noneDraft.budgetTargetMode = "manual_amount";
      noneDraft.manualBudgetInput = "1000000";
      noneDraft.roundingStepInput = "5";
      noneDraft.socialMechanismKind = "none";
      const noneParsed = parseDraft(noneDraft);
      expect(noneParsed.socialMechanismKind).toBe("none");
      expect(noneParsed.minimumIncreasePolicy?.mode).toBe("none");
      expect(noneParsed.isConfigurationComplete).toBe(true);

      const minDraft = { ...noneDraft };
      minDraft.socialMechanismKind = "minimum_guaranteed";
      minDraft.minimumIncreaseMode = "fixed_monthly_amount";
      minDraft.minimumMonthlyAmountInput = "10000";
      const minParsed = parseDraft(minDraft);
      expect(minParsed.socialMechanismKind).toBe("minimum_guaranteed");
      expect(minParsed.minimumIncreasePolicy?.mode).toBe("fixed_monthly_amount");
      expect(minParsed.universalFixedAmountPolicy?.monthlyAmountFcfa).toBe(0n);

      const forfaitDraft = { ...noneDraft };
      forfaitDraft.socialMechanismKind = "universal_fixed_amount";
      forfaitDraft.universalFixedAmountMonthlyAmountInput = "10000";
      forfaitDraft.universalFixedAmountEffectiveMonthInput = "1";
      forfaitDraft.universalFixedAmountMinimumSeniorityMonthsInput = "0";
      // Valeurs minimum mémorisées ne doivent pas empêcher le forfait.
      forfaitDraft.minimumIncreaseMode = "fixed_monthly_amount";
      forfaitDraft.minimumMonthlyAmountInput = "99999";
      const forfaitParsed = parseDraft(forfaitDraft);
      expect(forfaitParsed.socialMechanismKind).toBe("universal_fixed_amount");
      expect(forfaitParsed.minimumIncreasePolicy?.mode).toBe("none");
      expect(forfaitParsed.universalFixedAmountPolicy?.monthlyAmountFcfa).toBe(
        10_000n,
      );
      expect(
        forfaitParsed.universalFixedAmountPolicy?.minimumSeniorityMonths,
      ).toBe(0);
      expect(
        forfaitParsed.universalFixedAmountPolicy?.seniorityReferenceDate,
      ).toBe("2025-12-31");
    });

    it("refuse un montant de forfait négatif ; accepte zéro", () => {
      expect(parseUniversalFixedAmountMonthlyAmountInput("-1").ok).toBe(false);
      expect(parseUniversalFixedAmountMonthlyAmountInput("0")).toEqual({
        ok: true,
        value: 0n,
      });
      expect(parseUniversalFixedAmountMinimumSeniorityMonthsInput("-1").ok).toBe(
        false,
      );
      expect(parseUniversalFixedAmountMinimumSeniorityMonthsInput("0")).toEqual({
        ok: true,
        value: 0,
      });
    });
  });

  describe("éligibilité / ancienneté / exclusions", () => {
    it("seuil 0 mois : nouvellement recruté éligible", () => {
      expect(
        hasUniversalFixedAmountSeniority("2025-12-01", REF_2025_12_31, 0),
      ).toBe(true);
      expect(
        isUniversalFixedAmountEligible({
          hireDate: "2025-12-01",
          seniorityReferenceDate: REF_2025_12_31,
          minimumSeniorityMonths: 0,
          contractType: "cdi",
          employmentStatus: "active",
        }),
      ).toBe(true);
    });

    it("seuil > 0 : juste en dessous / exact / au-dessus", () => {
      // Au 31/12/2025 : embauche 01/07/2025 → 5 mois
      expect(seniorityMonthsAtDecemberNMinus1("2025-07-01", 2026)).toBe(5);
      expect(
        hasUniversalFixedAmountSeniority("2025-07-01", REF_2025_12_31, 6),
      ).toBe(false);
      expect(
        hasUniversalFixedAmountSeniority("2025-07-01", REF_2025_12_31, 5),
      ).toBe(true);
      expect(
        hasUniversalFixedAmountSeniority("2025-06-01", REF_2025_12_31, 6),
      ).toBe(true);
    });

    it("exclut disponibilité hors groupe et contrats non CDI/CDD", () => {
      expect(
        resolveUniversalFixedAmountExclusionReason({
          hireDate: "2020-01-01",
          seniorityReferenceDate: REF_2025_12_31,
          minimumSeniorityMonths: 0,
          contractType: "cdi",
          employmentStatus: "external_availability",
        }),
      ).toBe("EMPLOYMENT_STATUS_EXCLUDED");
      expect(
        resolveUniversalFixedAmountExclusionReason({
          hireDate: "2020-01-01",
          seniorityReferenceDate: REF_2025_12_31,
          minimumSeniorityMonths: 0,
          contractType: "contractor",
          employmentStatus: "active",
        }),
      ).toBe("CONTRACT_TYPE_EXCLUDED");
    });

    it("sous-performant à matrice 0 reste éligible au forfait (seuil 0)", () => {
      expect(
        isUniversalFixedAmountEligible({
          hireDate: "2020-01-01",
          seniorityReferenceDate: REF_2025_12_31,
          minimumSeniorityMonths: 0,
          contractType: "cdi",
          employmentStatus: "active",
        }),
      ).toBe(true);
    });
  });

  describe("date de référence d’ancienneté", () => {
    it("défaut parse : 31/12 N−1 quand saisie vide", () => {
      const draft = createEmptyConfigurationDraft(1, { campaignYear: 2026 });
      draft.budgetTargetMode = "manual_amount";
      draft.manualBudgetInput = "1000000";
      draft.roundingStepInput = "5";
      draft.socialMechanismKind = "universal_fixed_amount";
      draft.universalFixedAmountMonthlyAmountInput = "10000";
      draft.universalFixedAmountSeniorityReferenceDateInput = "";
      const parsed = parseDraft(draft);
      expect(parsed.universalFixedAmountPolicy?.seniorityReferenceDate).toBe(
        "2025-12-31",
      );
    });

    it("accepte une date en année N (camp. 2026)", () => {
      const parsed = parseUniversalFixedAmountSeniorityReferenceDateInput(
        "2026-06-30",
        2026,
      );
      expect(parsed).toEqual({ ok: true, value: "2026-06-30" });
    });

    it("embauche en N : ancienneté à la date de référence en N", () => {
      expect(seniorityMonthsAtReferenceDate("2026-01-15", "2026-06-30")).toBe(
        5,
      );
      expect(
        hasUniversalFixedAmountSeniority("2026-01-15", "2026-06-30", 6),
      ).toBe(false);
      expect(
        hasUniversalFixedAmountSeniority("2026-01-15", "2026-06-30", 5),
      ).toBe(true);
    });

    it("seuil exact à la date de référence", () => {
      expect(
        hasUniversalFixedAmountSeniority("2025-07-01", REF_2025_12_31, 5),
      ).toBe(true);
      expect(
        hasUniversalFixedAmountSeniority("2025-08-01", REF_2025_12_31, 5),
      ).toBe(false);
    });

    it("indépendant du mois d’effet budgétaire", () => {
      const jan = calculatePreparedPopulationCompensation(
        baseInput({
          socialMechanismKind: "universal_fixed_amount",
          universalFixedAmountPolicy: forfaitPolicy({ effectiveMonth: 1 }),
        }),
      );
      const dec = calculatePreparedPopulationCompensation(
        baseInput({
          socialMechanismKind: "universal_fixed_amount",
          universalFixedAmountPolicy: forfaitPolicy({ effectiveMonth: 12 }),
          technicalApplicationMonth: 12,
        }),
      );
      expect(jan.employees[0]!.isUniversalFixedAmountEligible).toBe(
        dec.employees[0]!.isUniversalFixedAmountEligible,
      );
      expect(
        jan.populationSummary.universalFixedAmountEligibleEmployeeCount,
      ).toBe(dec.populationSummary.universalFixedAmountEligibleEmployeeCount);
    });

    it("changement de date de référence sans modifier les mois budgétaires", () => {
      const defaultRef = calculatePreparedPopulationCompensation(
        baseInput({
          socialMechanismKind: "universal_fixed_amount",
          universalFixedAmountPolicy: forfaitPolicy({
            effectiveMonth: 7,
            seniorityReferenceDate: "2025-12-31",
          }),
          technicalApplicationMonth: 7,
          budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 5_000_000n },
        }),
      );
      const customRef = calculatePreparedPopulationCompensation(
        baseInput({
          socialMechanismKind: "universal_fixed_amount",
          universalFixedAmountPolicy: forfaitPolicy({
            effectiveMonth: 7,
            seniorityReferenceDate: "2026-06-30",
          }),
          technicalApplicationMonth: 7,
          budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 5_000_000n },
        }),
      );
      // Même mois d’effet → même coût forfait (2 salariés × 6 mois × 10 000)
      expect(defaultRef.populationSummary.totalUniversalFixedAmountCostFcfa).toBe(
        120_000n,
      );
      expect(customRef.populationSummary.totalUniversalFixedAmountCostFcfa).toBe(
        120_000n,
      );
      expect(
        defaultRef.populationSummary.universalFixedAmountSeniorityReferenceDate,
      ).toBe("2025-12-31");
      expect(
        customRef.populationSummary.universalFixedAmountSeniorityReferenceDate,
      ).toBe("2026-06-30");
    });

    it("conserve la date au basculement de mécanisme social", () => {
      const draft = createEmptyConfigurationDraft(1, { campaignYear: 2026 });
      draft.budgetTargetMode = "manual_amount";
      draft.manualBudgetInput = "1000000";
      draft.roundingStepInput = "5";
      draft.socialMechanismKind = "universal_fixed_amount";
      draft.universalFixedAmountMonthlyAmountInput = "10000";
      draft.universalFixedAmountSeniorityReferenceDateInput = "2026-03-15";
      draft.minimumIncreaseMode = "fixed_monthly_amount";
      draft.minimumMonthlyAmountInput = "5000";

      draft.socialMechanismKind = "minimum_guaranteed";
      parseDraft(draft);
      expect(draft.universalFixedAmountSeniorityReferenceDateInput).toBe(
        "2026-03-15",
      );

      draft.socialMechanismKind = "universal_fixed_amount";
      const reparsed = parseDraft(draft);
      expect(reparsed.universalFixedAmountPolicy?.seniorityReferenceDate).toBe(
        "2026-03-15",
      );
    });

    it("fingerprint distinct si la date de référence change ; identique sinon", () => {
      const baseParts = {
        campaignId: 1,
        budgetMode: "manual_amount" as const,
        roundingMode: "nearest_half_up" as const,
        roundingStep: 5n,
        campaignYear: 2026,
        retroactivityStartMonth: 1,
        technicalApplicationMonth: 1,
        minimumGuaranteeEffectiveMonth: 1,
        socialMechanismKind: "universal_fixed_amount" as const,
        universalFixedAmountMonthlyAmount: 10_000n,
        universalFixedAmountEffectiveMonth: 1,
        universalFixedAmountMinimumSeniorityMonths: 0,
        universalFixedAmountContractVersion: 2,
      };
      const fpA = buildConfigurationFingerprint({
        ...baseParts,
        universalFixedAmountSeniorityReferenceDate: "2025-12-31",
      });
      const fpB = buildConfigurationFingerprint({
        ...baseParts,
        universalFixedAmountSeniorityReferenceDate: "2026-06-30",
      });
      const fpA2 = buildConfigurationFingerprint({
        ...baseParts,
        universalFixedAmountSeniorityReferenceDate: "2025-12-31",
      });
      expect(fpA).not.toBe(fpB);
      expect(fpA).toBe(fpA2);
      expect(fpA).toContain("forfaitSeniorityRef:2025-12-31");
      expect(fpB).toContain("forfaitSeniorityRef:2026-06-30");
    });
  });

  describe("caractère additif du forfait", () => {
    it("matrice + forfait 10 000 = total additif (pas un plancher)", () => {
      const result = calculatePreparedPopulationCompensation(
        baseInput({
          socialMechanismKind: "universal_fixed_amount",
          universalFixedAmountPolicy: forfaitPolicy(),
          budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 5_000_000n },
        }),
      );

      expect(result.populationSummary.socialMechanismKind).toBe(
        "universal_fixed_amount",
      );
      expect(result.populationSummary.minimumIncreaseMode).toBe("none");

      for (const employee of result.employees) {
        expect(employee.isUniversalFixedAmountEligible).toBe(true);
        const december = employee.monthlyCompensationTrajectory.find(
          (m) => m.month === 12,
        )!;
        expect(december.universalFixedAmountFcfa).toBe(10_000n);
        expect(december.minimumComplementFloorFcfa).toBe(0n);
        // Additif : total = part matrice (above floor=0) + forfait
        expect(december.roundedCompensatoryComplementFcfa).toBe(
          december.actualComplementAboveMinimumFcfa + 10_000n,
        );
      }

      // Deux salariés × 12 mois × 10 000
      expect(result.populationSummary.totalUniversalFixedAmountCostFcfa).toBe(
        240_000n,
      );
      expect(
        result.populationSummary.universalFixedAmountEligibleEmployeeCount,
      ).toBe(2);
    });

    it("matrice 0 + forfait 10 000 = 10 000 (sous-performant)", () => {
      const result = calculatePreparedPopulationCompensation(
        baseInput({
          employees: [
            {
              employeeId: "EMP-UNDER",
              familyCode: "F1",
              gradeCode: "G1",
              salaryFcfa: 400_000,
              hireDate: "2020-01-15",
              confirmedUnderperformer: true,
              contractType: "cdi",
              employmentStatus: "active",
            },
          ],
          socialMechanismKind: "universal_fixed_amount",
          universalFixedAmountPolicy: forfaitPolicy(),
          budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 200_000n },
        }),
      );
      const employee = result.employees[0]!;
      const december = employee.monthlyCompensationTrajectory.find(
        (m) => m.month === 12,
      )!;
      expect(employee.isUniversalFixedAmountEligible).toBe(true);
      expect(december.actualComplementAboveMinimumFcfa).toBe(0n);
      expect(december.universalFixedAmountFcfa).toBe(10_000n);
      expect(december.roundedCompensatoryComplementFcfa).toBe(10_000n);
    });

    it("non éligible matrice (<12 mois) mais éligible forfait (seuil 0)", () => {
      const result = calculatePreparedPopulationCompensation(
        baseInput({
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
          ],
          socialMechanismKind: "universal_fixed_amount",
          universalFixedAmountPolicy: forfaitPolicy(),
          budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 200_000n },
        }),
      );
      const employee = result.employees[0]!;
      expect(employee.compensatoryMeasureEligible).toBe(false);
      expect(employee.isUniversalFixedAmountEligible).toBe(true);
      const december = employee.monthlyCompensationTrajectory.find(
        (m) => m.month === 12,
      )!;
      expect(december.universalFixedAmountFcfa).toBe(10_000n);
      expect(december.roundedCompensatoryComplementFcfa).toBe(10_000n);
    });

    it("forfait 0 et aucun bénéficiaire (seuil trop haut)", () => {
      const zero = calculatePreparedPopulationCompensation(
        baseInput({
          socialMechanismKind: "universal_fixed_amount",
          universalFixedAmountPolicy: forfaitPolicy({
            monthlyAmountFcfa: 0n,
          }),
        }),
      );
      expect(zero.populationSummary.totalUniversalFixedAmountCostFcfa).toBe(0n);

      const noneEligible = calculatePreparedPopulationCompensation(
        baseInput({
          socialMechanismKind: "universal_fixed_amount",
          universalFixedAmountPolicy: forfaitPolicy({
            minimumSeniorityMonths: 120,
          }),
        }),
      );
      expect(
        noneEligible.populationSummary.universalFixedAmountEligibleEmployeeCount,
      ).toBe(0);
      expect(
        noneEligible.populationSummary.totalUniversalFixedAmountCostFcfa,
      ).toBe(0n);
    });
  });

  describe("mois d’effet et budget résiduel", () => {
    it("janvier = 12 mois ; juillet = 6 ; décembre = 1", () => {
      const jan = calculatePreparedPopulationCompensation(
        baseInput({
          socialMechanismKind: "universal_fixed_amount",
          universalFixedAmountPolicy: forfaitPolicy(),
          budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 5_000_000n },
        }),
      );
      expect(jan.populationSummary.totalUniversalFixedAmountCostFcfa).toBe(
        2n * 12n * 10_000n,
      );

      const jul = calculatePreparedPopulationCompensation(
        baseInput({
          socialMechanismKind: "universal_fixed_amount",
          universalFixedAmountPolicy: forfaitPolicy({ effectiveMonth: 7 }),
          retroactivityStartMonth: 1,
          technicalApplicationMonth: 7,
          budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 5_000_000n },
        }),
      );
      expect(jul.populationSummary.totalUniversalFixedAmountCostFcfa).toBe(
        2n * 6n * 10_000n,
      );

      const dec = calculatePreparedPopulationCompensation(
        baseInput({
          socialMechanismKind: "universal_fixed_amount",
          universalFixedAmountPolicy: forfaitPolicy({ effectiveMonth: 12 }),
          retroactivityStartMonth: 1,
          technicalApplicationMonth: 12,
          budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 5_000_000n },
        }),
      );
      expect(dec.populationSummary.totalUniversalFixedAmountCostFcfa).toBe(
        2n * 1n * 10_000n,
      );
    });

    it("budget résiduel = enveloppe − forfait ; forfait dépassant → erreur", () => {
      const ok = calculatePreparedPopulationCompensation(
        baseInput({
          socialMechanismKind: "universal_fixed_amount",
          universalFixedAmountPolicy: forfaitPolicy(),
          budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 500_000n },
        }),
      );
      // 2 × 12 × 10 000 = 240 000 ; résiduel = 500 000 − 240 000
      expect(ok.populationSummary.totalUniversalFixedAmountCostFcfa).toBe(
        240_000n,
      );
      expect(
        ok.populationSummary.availableBudgetAfterPromotionsAndSocialMechanismFcfa,
      ).toEqual({ numerator: 260_000n, denominator: 1n });

      try {
        calculatePreparedPopulationCompensation(
          baseInput({
            socialMechanismKind: "universal_fixed_amount",
            universalFixedAmountPolicy: forfaitPolicy({
              monthlyAmountFcfa: 100_000n,
            }),
            budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 100_000n },
          }),
        );
        expect.unreachable("devrait échouer");
      } catch (error) {
        expect(error).toBeInstanceOf(CompensationCalculationError);
        expect((error as CompensationCalculationError).code).toBe(
          "UNIVERSAL_FIXED_AMOUNT_EXCEEDS_BUDGET",
        );
      }
    });

    it("budget résiduel nul → taux 0, forfait conservé, pas de coefficient négatif", () => {
      const result = calculatePreparedPopulationCompensation(
        baseInput({
          socialMechanismKind: "universal_fixed_amount",
          universalFixedAmountPolicy: forfaitPolicy(),
          // Exactement le coût du forfait : 240 000
          budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 240_000n },
        }),
      );
      expect(
        result.populationSummary.availableBudgetAfterPromotionsAndSocialMechanismFcfa,
      ).toEqual({ numerator: 0n, denominator: 1n });
      expect(
        result.populationSummary.compensatoryCalibrationRate.numerator,
      ).toBe(0n);
      for (const employee of result.employees) {
        const december = employee.monthlyCompensationTrajectory.find(
          (m) => m.month === 12,
        )!;
        expect(december.universalFixedAmountFcfa).toBe(10_000n);
        expect(december.actualComplementAboveMinimumFcfa).toBe(0n);
        expect(december.roundedCompensatoryComplementFcfa).toBe(10_000n);
      }
    });
  });

  describe("assiette d’incidence d’ancienneté", () => {
    it("inclut le forfait dans l’assiette 1 % (hors enveloppe)", () => {
      const hireDate = "2010-07-15";
      const forfaitAmount = 10_000n;
      const result = calculatePreparedPopulationCompensation(
        baseInput({
          employees: [
            {
              employeeId: "EMP-SEN",
              familyCode: "F1",
              gradeCode: "G1",
              salaryFcfa: 400_000,
              hireDate,
              confirmedUnderperformer: true,
              contractType: "cdi",
              employmentStatus: "active",
            },
          ],
          socialMechanismKind: "universal_fixed_amount",
          universalFixedAmountPolicy: forfaitPolicy({
            monthlyAmountFcfa: forfaitAmount,
          }),
          budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 200_000n },
        }),
      );
      const employee = result.employees[0]!;
      const december = employee.monthlyCompensationTrajectory.find(
        (m) => m.month === 12,
      )!;
      expect(december.actualComplementAboveMinimumFcfa).toBe(0n);
      expect(december.universalFixedAmountFcfa).toBe(forfaitAmount);
      expect(december.roundedCompensatoryComplementFcfa).toBe(forfaitAmount);

      const hire = parseHireDateIso(hireDate);
      const rate = seniorityRatePercentAt(hire, 2026, 12);
      expect(rate).toBeGreaterThan(0);
      const expectedImpact = ceilFcfaPercentOfAmount(forfaitAmount, rate);
      expect(december.compensatorySeniorityImpactFcfa).toBe(expectedImpact);
      expect(december.totalSeniorityImpactFcfa).toBe(expectedImpact);
      // Hors enveloppe : le coût forfait budgétaire ne contient pas l’ancienneté.
      expect(employee.campaignPeriodUniversalFixedAmountCostFcfa).toBe(
        12n * forfaitAmount,
      );
      expect(employee.annualSeniorityImpactFcfa).toBeGreaterThan(0n);
    });
  });

  describe("non-régression minimum garanti", () => {
    it("plancher toujours actif ; aucun forfait", () => {
      const result = calculatePreparedPopulationCompensation(
        baseInput({
          socialMechanismKind: "minimum_guaranteed",
          minimumIncreasePolicy: {
            mode: "fixed_monthly_amount",
            minimumMonthlyAmountFcfa: 10_000n,
            minimumIncreaseRate: null,
          },
          minimumGuaranteeEffectiveMonth: 1,
          budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 5_000_000n },
        }),
      );
      expect(result.populationSummary.socialMechanismKind).toBe(
        "minimum_guaranteed",
      );
      expect(result.populationSummary.totalUniversalFixedAmountCostFcfa).toBe(
        0n,
      );
      for (const employee of result.employees) {
        expect(employee.isUniversalFixedAmountEligible).toBe(false);
        const december = employee.monthlyCompensationTrajectory.find(
          (m) => m.month === 12,
        )!;
        expect(december.universalFixedAmountFcfa).toBe(0n);
        expect(december.minimumComplementFloorFcfa).toBeGreaterThanOrEqual(0n);
      }
    });
  });
});
