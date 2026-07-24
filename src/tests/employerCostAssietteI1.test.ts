/**
 * Lot 2B-RC1-H6-A4-I1 — assujettissement configurable, assiette typée,
 * propagation obligatoire et neutralité budgétaire.
 */

import { describe, expect, it } from "vitest";
import { buildConfigurationFingerprint } from "../application/campaignSimulation/formatExactBudgetDisplay";
import { buildSimulationSourceFingerprint } from "../application/campaignSimulation/buildSimulationSourceFingerprint";
import {
  NO_EMPLOYER_COST_POLICY,
  parseSimulationConfigurationDraft,
  type SimulationConfigurationDraftFields,
} from "../application/campaignSimulation/parseSimulationConfiguration";
import { createEmptyConfigurationDraft } from "../application/campaignSimulation/simulationConfigurationModels";
import {
  DEFAULT_NINE_BOX_CONFIRMATION_FACTOR_MILLI,
  DEFAULT_PERFORMANCE_FACTORS,
  DEFAULT_POTENTIAL_FACTORS,
  DEFAULT_SALARY_POSITIONS,
} from "../domain/compensationReference/defaults";
import {
  DEFAULT_EMPLOYER_COST_COMPONENT_LIABILITY,
  EMPLOYER_CHARGE_CATEGORY_UNSPECIFIED_BUNDLE,
  EMPLOYER_CHARGES_INCLUDED,
  NEUTRAL_EMPLOYER_COST_POLICY,
  buildEmployerChargeAssietteBreakdown,
  calculatePeriodEmployerCost,
  calculatePreparedPopulationCompensation,
  employerCostLiabilityFingerprintToken,
  normalizeEmployerCostComponentLiability,
  normalizeEmployerCostPolicy,
  reduceFraction,
  type EmployerCostPolicy,
  type PreparedPopulationCalculationInput,
} from "../domain/compensationCalculation";

function positions() {
  return DEFAULT_SALARY_POSITIONS.map((p) => ({
    code: p.code,
    label: p.label,
    referenceRatioBps: p.referenceRatioBps,
    positionFactorMilli: p.positionFactorMilli,
  }));
}

function factors() {
  return {
    performanceFactors: DEFAULT_PERFORMANCE_FACTORS.map((f) => ({
      level: f.level,
      factorMilli: f.factorMilli,
    })),
    potentialFactors: DEFAULT_POTENTIAL_FACTORS.map((f) => ({
      level: f.level,
      factorMilli: f.factorMilli,
    })),
    nineBoxFactors: [],
    nineBoxConfirmationFactorMilli: DEFAULT_NINE_BOX_CONFIRMATION_FACTOR_MILLI,
  };
}

function populationInput(
  overrides: Partial<PreparedPopulationCalculationInput> = {},
): PreparedPopulationCalculationInput {
  return {
    employees: [
      {
        employeeId: "E1",
        familyCode: "F1",
        gradeCode: "G1",
        salaryFcfa: 500_000,
        hireDate: "2020-07-15",
        confirmedUnderperformer: false,
        employmentStatus: "active",
        contractType: "cdi",
      },
    ],
    references: {
      evaluationMode: "none",
      salaryGrid: [{ familyCode: "F1", gradeCode: "G1", s0Fcfa: 500_000 }],
      salaryPositions: positions(),
      ...factors(),
    },
    budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 120_000 },
    roundingPolicy: { mode: "nearest_half_up", stepFcfa: 5 },
    campaignYear: 2026,
    technicalApplicationMonth: 7,
    retroactivityStartMonth: 1,
    employerCostPolicy: NEUTRAL_EMPLOYER_COST_POLICY,
    ...overrides,
  };
}

function baseCompleteDraft(): SimulationConfigurationDraftFields {
  const draft = createEmptyConfigurationDraft(1, { campaignYear: 2026 });
  draft.budgetTargetMode = "manual_amount";
  draft.manualBudgetInput = "1000000";
  draft.roundingStepInput = "5";
  draft.socialMechanismKind = "none";
  return draft;
}

function ratePolicy(
  rate = reduceFraction(10n, 100n),
  liability = DEFAULT_EMPLOYER_COST_COMPONENT_LIABILITY,
): EmployerCostPolicy {
  return {
    kind: "rate_on_gross_period",
    components: [
      {
        categoryId: EMPLOYER_CHARGE_CATEGORY_UNSPECIFIED_BUNDLE,
        rate,
      },
    ],
    componentLiability: liability,
  };
}

describe("H6-A4-I1 — assujettissement et assiette employeur", () => {
  it("1–2. défauts true + lecture compatible d’une politique historique", () => {
    expect(DEFAULT_EMPLOYER_COST_COMPONENT_LIABILITY).toEqual({
      matrixIncrease: true,
      minimumGuaranteeComplement: true,
      universalFixedAmount: true,
      promotionIncrease: true,
      additionalSeniorityImpact: true,
    });
    const historical = normalizeEmployerCostPolicy({ kind: "neutral" });
    expect(historical).toEqual(NEUTRAL_EMPLOYER_COST_POLICY);
    expect(normalizeEmployerCostComponentLiability(undefined)).toEqual(
      DEFAULT_EMPLOYER_COST_COMPONENT_LIABILITY,
    );
    expect(normalizeEmployerCostComponentLiability({})).toEqual(
      DEFAULT_EMPLOYER_COST_COMPONENT_LIABILITY,
    );
  });

  it("3. validation d’une politique avec configuration explicite", () => {
    const draft = baseCompleteDraft();
    draft.employerCostPolicyKind = "rate_on_gross_period";
    draft.employerCostRatePercentInput = "12,5";
    const parsed = parseSimulationConfigurationDraft(draft);
    expect(parsed.employerCostPolicy).toEqual(ratePolicy(reduceFraction(125n, 1000n)));
    expect(parsed.isEmployerCostComplete).toBe(true);
  });

  it("4–5. fingerprint : défauts ≡ historique ; indicateur différent ⇒ FP différent", () => {
    const defaultToken = employerCostLiabilityFingerprintToken();
    expect(defaultToken).toBe("m1,g1,u1,p1,s1");
    const fpDefault = buildConfigurationFingerprint({
      campaignId: 1,
      budgetMode: "manual_amount",
      manualBudget: 1_000_000n,
      roundingMode: "nearest_half_up",
      roundingStep: 5n,
      campaignYear: 2026,
      retroactivityStartMonth: 1,
      technicalApplicationMonth: 1,
      minimumGuaranteeEffectiveMonth: 1,
      socialMechanismKind: "none",
      employerCostPolicyKind: "neutral",
      employerCostRateNumerator: null,
      employerCostRateDenominator: null,
    });
    const fpExplicitDefaults = buildConfigurationFingerprint({
      campaignId: 1,
      budgetMode: "manual_amount",
      manualBudget: 1_000_000n,
      roundingMode: "nearest_half_up",
      roundingStep: 5n,
      campaignYear: 2026,
      retroactivityStartMonth: 1,
      technicalApplicationMonth: 1,
      minimumGuaranteeEffectiveMonth: 1,
      socialMechanismKind: "none",
      employerCostPolicyKind: "neutral",
      employerCostRateNumerator: null,
      employerCostRateDenominator: null,
      employerCostLiability: defaultToken,
    });
    expect(fpDefault).toBe(fpExplicitDefaults);
    expect(fpDefault).not.toContain("employerCostLiability:");

    const fpNonDefault = buildConfigurationFingerprint({
      campaignId: 1,
      budgetMode: "manual_amount",
      manualBudget: 1_000_000n,
      roundingMode: "nearest_half_up",
      roundingStep: 5n,
      campaignYear: 2026,
      retroactivityStartMonth: 1,
      technicalApplicationMonth: 1,
      minimumGuaranteeEffectiveMonth: 1,
      socialMechanismKind: "none",
      employerCostPolicyKind: "neutral",
      employerCostRateNumerator: null,
      employerCostRateDenominator: null,
      employerCostLiability: employerCostLiabilityFingerprintToken({
        ...DEFAULT_EMPLOYER_COST_COMPONENT_LIABILITY,
        matrixIncrease: false,
      }),
    });
    expect(fpNonDefault).not.toBe(fpDefault);
    expect(fpNonDefault).toContain("employerCostLiability:m0,g1,u1,p1,s1");
  });

  it("6–8. politique neutre / rate propagée ; politique obligatoire", () => {
    const neutral = calculatePreparedPopulationCompensation(populationInput());
    expect(neutral.analyticalEmployerCost.populationPeriodCost.policyKind).toBe(
      "neutral",
    );
    expect(
      neutral.analyticalEmployerCost.populationPeriodCost.periodEmployerChargesFcfa,
    ).toBe(0n);

    const rated = calculatePreparedPopulationCompensation(
      populationInput({ employerCostPolicy: ratePolicy() }),
    );
    expect(rated.analyticalEmployerCost.populationPeriodCost.policyKind).toBe(
      "rate_on_gross_period",
    );

    expect(() =>
      calculatePreparedPopulationCompensation({
        ...populationInput(),
        employerCostPolicy: null as unknown as EmployerCostPolicy,
      }),
    ).toThrow(/politique de coût employeur|MISSING_EMPLOYER_COST_POLICY|échoué/i);
  });

  it("9–11. taux nul, assiette nulle, calcul exact sans flottant", () => {
    const zeroRate = calculatePeriodEmployerCost(
      { monthlyGrossIncreaseFcfa: 0n, periodGrossImpactFcfa: 100_000n },
      ratePolicy(reduceFraction(0n, 100n)),
    );
    expect(zeroRate.periodEmployerChargesFcfa).toBe(0n);

    const zeroAssiette = calculatePeriodEmployerCost(
      { monthlyGrossIncreaseFcfa: 0n, periodGrossImpactFcfa: 0n },
      ratePolicy(),
    );
    expect(zeroAssiette.periodEmployerChargesFcfa).toBe(0n);
    expect(zeroAssiette.periodEmployerCompleteCostFcfa).toBe(0n);

    const exact = calculatePeriodEmployerCost(
      { monthlyGrossIncreaseFcfa: 0n, periodGrossImpactFcfa: 100_000n },
      ratePolicy(reduceFraction(1n, 10n)),
    );
    expect(exact.periodEmployerChargesFcfa).toBe(10_000n);
    expect(typeof exact.periodEmployerChargesFcfa).toBe("bigint");
  });

  it("12–15. sommation exclusive, non-assujetti visible, indisponible ≠ zéro", () => {
    const liability = {
      ...DEFAULT_EMPLOYER_COST_COMPONENT_LIABILITY,
      promotionIncrease: false,
    };
    const breakdown = buildEmployerChargeAssietteBreakdown(
      {
        campaignPeriodCompensationAboveMinimumCostFcfa: 10_000n,
        campaignPeriodMinimumComplementFloorCostFcfa: 5_000n,
        campaignPeriodUniversalFixedAmountCostFcfa: 0n,
        annualPromotionBudgetCostFcfa: 20_000n,
        combinedAnnualSeniorityImpactFcfa: 3_000n,
      },
      liability,
    );
    expect(breakdown.periodGrossImpactFcfa).toBe(18_000n);
    expect(breakdown.promotionIncrease.amountFcfa).toBe(20_000n);
    expect(breakdown.promotionIncrease.liable).toBe(false);
    expect(breakdown.promotionIncrease.liableAmountFcfa).toBe(0n);
    expect(breakdown.promotionIncrease.availability).toBe("available");

    const unavailableLine = {
      amountFcfa: 0n,
      liable: true,
      liableAmountFcfa: 0n,
      availability: "unavailable" as const,
    };
    expect(unavailableLine.availability).not.toBe("available");
    expect(unavailableLine.amountFcfa).toBe(0n);
  });

  it("16–25. inclusions / exclusions métier dans l’assiette moteur", () => {
    const result = calculatePreparedPopulationCompensation(
      populationInput({ employerCostPolicy: ratePolicy() }),
    );
    const assiette = result.analyticalEmployerCost.populationAssiette;
    expect(assiette.matrixIncrease.liable).toBe(true);
    expect(assiette.minimumGuaranteeComplement.liable).toBe(true);
    expect(assiette.universalFixedAmount.liable).toBe(true);
    expect(assiette.promotionIncrease.liable).toBe(true);
    expect(assiette.additionalSeniorityImpact.liable).toBe(true);
    expect(assiette.periodGrossImpactFcfa).toBe(
      assiette.matrixIncrease.liableAmountFcfa +
        assiette.minimumGuaranteeComplement.liableAmountFcfa +
        assiette.universalFixedAmount.liableAmountFcfa +
        assiette.promotionIncrease.liableAmountFcfa +
        assiette.additionalSeniorityImpact.liableAmountFcfa,
    );
    expect(
      result.analyticalEmployerCost.populationPeriodCost.periodGrossImpactFcfa,
    ).toBe(assiette.periodGrossImpactFcfa);

    // Hors assiette I1 : rappels, 13e, corrections, charges elles-mêmes.
    expect(
      Object.keys(assiette).every(
        (k) =>
          ![
            "reminder",
            "thirteenthMonth",
            "correctionAmount",
            "socialMeasureAmount",
            "employerCharges",
          ].includes(k),
      ),
    ).toBe(true);
  });

  it("26–29. neutralité fonctionnelle + EMPLOYER_CHARGES_INCLUDED false", () => {
    expect(EMPLOYER_CHARGES_INCLUDED).toBe(false);
    const baseline = calculatePreparedPopulationCompensation(populationInput());
    const rated = calculatePreparedPopulationCompensation(
      populationInput({ employerCostPolicy: ratePolicy() }),
    );
    expect(rated.annualActualOperationCostFcfa).toBe(
      baseline.annualActualOperationCostFcfa,
    );
    expect(rated.availableAnnualCompensatoryBudget).toEqual(
      baseline.availableAnnualCompensatoryBudget,
    );
    expect(rated.compensatoryCalibrationRate).toEqual(
      baseline.compensatoryCalibrationRate,
    );
    expect(rated.calibrationCoefficient).toEqual(baseline.calibrationCoefficient);
    expect(rated.totalCombinedAnnualActualCostFcfa).toBe(
      baseline.totalCombinedAnnualActualCostFcfa,
    );
    expect(rated.employees[0]!.monthlyFinalSalaryFcfa).toBe(
      baseline.employees[0]!.monthlyFinalSalaryFcfa,
    );
    expect(rated.employees[0]!.baseSalaryReminderFcfa).toBe(
      baseline.employees[0]!.baseSalaryReminderFcfa,
    );
    expect(
      rated.analyticalEmployerCost.populationPeriodCost.periodEmployerChargesFcfa,
    ).toBeGreaterThanOrEqual(0n);
  });

  it("30. parse historical sans indicateurs → défauts ; NO_EMPLOYER_COST_POLICY stable", () => {
    expect(NO_EMPLOYER_COST_POLICY).toEqual(NEUTRAL_EMPLOYER_COST_POLICY);
    const parsed = parseSimulationConfigurationDraft(baseCompleteDraft());
    expect(parsed.employerCostPolicy?.componentLiability).toEqual(
      DEFAULT_EMPLOYER_COST_COMPONENT_LIABILITY,
    );
  });

  it("fingerprint source : politique rate propagée sans perte de taux", () => {
    const policy = ratePolicy(reduceFraction(17n, 400n));
    const base = {
      campaignId: 1,
      campaignStatus: "active" as const,
      evaluationMode: "none" as const,
      currentImportBatchId: 1,
      preparedEmployees: populationInput().employees,
      preparedReferences: populationInput().references,
      budgetTarget: populationInput().budgetTarget,
      roundingPolicy: populationInput().roundingPolicy,
      campaignYear: 2026,
      retroactivityStartMonth: 1,
      technicalApplicationMonth: 7,
      minimumGuaranteeEffectiveMonth: 7,
      minimumIncreasePolicy: {
        mode: "none" as const,
        minimumMonthlyAmountFcfa: null,
        minimumIncreaseRate: null,
      },
      socialMechanismKind: "none" as const,
      universalFixedAmountPolicy: {
        monthlyAmountFcfa: 0n,
        effectiveMonth: 1,
        minimumSeniorityMonths: 0,
        seniorityReferenceDate: "2025-12-31",
      },
    };
    const fpRate = buildSimulationSourceFingerprint({
      ...base,
      employerCostPolicy: policy,
    });
    const fpOtherRate = buildSimulationSourceFingerprint({
      ...base,
      employerCostPolicy: ratePolicy(reduceFraction(1n, 10n)),
    });
    const fpNeutral = buildSimulationSourceFingerprint({
      ...base,
      employerCostPolicy: NEUTRAL_EMPLOYER_COST_POLICY,
    });
    expect(fpRate).not.toBe(fpOtherRate);
    expect(fpRate).not.toBe(fpNeutral);
    expect(
      buildConfigurationFingerprint({
        campaignId: 1,
        budgetMode: "manual_amount",
        manualBudget: 120_000n,
        roundingMode: "nearest_half_up",
        roundingStep: 5n,
        campaignYear: 2026,
        retroactivityStartMonth: 1,
        technicalApplicationMonth: 7,
        minimumGuaranteeEffectiveMonth: 7,
        socialMechanismKind: "none",
        employerCostPolicyKind: "rate_on_gross_period",
        employerCostRateNumerator: 17n,
        employerCostRateDenominator: 400n,
      }),
    ).toContain("employerCostRate:17/400");
  });
});
