/**
 * Lot 2A-H2C-2B — modèles de vue, formatage et erreurs métier dédiées.
 */

import { describe, expect, it } from "vitest";
import { buildSimulationResultView } from "../application/campaignSimulation/buildSimulationResultView";
import { findDedicatedSimulationBusinessError } from "../application/campaignSimulation/findDedicatedSimulationBusinessError";
import {
  formatExactRateAsPercent,
  formatSeniorityRatePercent,
  formatSignedExactAmountAsFcfa,
  formatSignedFcfaInteger,
} from "../application/campaignSimulation/formatExactBudgetDisplay";
import {
  formatCompensatoryIneligibilityReasonLabel,
  formatPromotionStatusLabel,
  resolveCompensatoryIneligibilityReason,
} from "../application/campaignSimulation/promotionAwareResultLabels";
import {
  DEFAULT_NINE_BOX_FACTORS,
  DEFAULT_PERFORMANCE_FACTORS,
  DEFAULT_POTENTIAL_FACTORS,
  DEFAULT_SALARY_POSITIONS,
} from "../domain/compensationReference/defaults";
import {
  RESULT_SCHEMA_VERSION,
  CALCULATION_CONTRACT_VERSION,
  SENIORITY_IMPACT_CONTRACT_VERSION,
  buildPromotionEvent,
  calculatePreparedPopulationCompensation,
  exactAmountFromInteger,
  fractionsEqual,
  type PopulationCalculationReferences,
  type PreparedEmployeeCalculationInput,
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

function factors(): Pick<
  PopulationCalculationReferences,
  "performanceFactors" | "potentialFactors" | "nineBoxFactors"
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
  };
}

function baseInput(
  overrides: Partial<PreparedPopulationCalculationInput> & {
    employees?: PreparedEmployeeCalculationInput[];
  } = {},
): PreparedPopulationCalculationInput {
  return {
    employees: overrides.employees ?? [
      {
        employeeId: "E1",
        familyCode: "F1",
        gradeCode: "G1",
        salaryFcfa: 500_000,
        hireDate: "2015-03-01",
        confirmedUnderperformer: false,
        employmentStatus: "active",
        contractType: "cdi",
      },
    ],
    references: overrides.references ?? {
      evaluationMode: "none",
      salaryGrid: [
        { familyCode: "F1", gradeCode: "G1", s0Fcfa: 500_000 },
        { familyCode: "F1", gradeCode: "G2", s0Fcfa: 600_000 },
      ],
      salaryPositions: positions(),
      ...factors(),
    },
    budgetTarget: overrides.budgetTarget ?? {
      mode: "manual_amount",
      manualBudgetFcfa: 2_000_000,
    },
    roundingPolicy: overrides.roundingPolicy ?? {
      mode: "nearest_half_up",
      stepFcfa: 5,
    },
    campaignYear: overrides.campaignYear ?? 2026,
    technicalApplicationMonth: overrides.technicalApplicationMonth ?? 7,
  };
}

function toView(
  engineResult: ReturnType<typeof calculatePreparedPopulationCompensation>,
) {
  return buildSimulationResultView({
    campaignId: 1,
    campaignName: "H2C-2B",
    campaignYear: engineResult.campaignYear,
    campaignStatus: "active",
    evaluationMode: engineResult.evaluationMode,
    currentImportBatchId: 1,
    runSequence: 1,
    sourceFingerprint: "fp",
    configurationFingerprint: "cfg",
    engineResult,
    employeeLabelsById: new Map(
      engineResult.employees.map((e) => [e.employeeId, e.employeeId]),
    ),
  });
}

describe("Lot 2A-H2C-2B — formatage", () => {
  it("formate les taux sans fraction interne visible", () => {
    expect(formatExactRateAsPercent({ numerator: 1n, denominator: 10n }, 2)).toBe(
      "10,00 %",
    );
    expect(
      formatExactRateAsPercent({ numerator: 24375n, denominator: 1_000_000n }, 4),
    ).toBe("2,4375 %");
    expect(formatSeniorityRatePercent(9)).toBe("9 %");
    expect(formatSignedFcfaInteger(-163n)).toBe("\u2212163 FCFA");
    expect(
      formatSignedExactAmountAsFcfa({ numerator: -163n, denominator: 1n }),
    ).toMatch(/\u2212163/);
  });
});

describe("Lot 2A-H2C-2B — libellés", () => {
  it("formate motifs d’inéligibilité", () => {
    expect(
      formatCompensatoryIneligibilityReasonLabel("ineligible_contract_type"),
    ).toBe("Type de contrat non éligible");
    expect(
      resolveCompensatoryIneligibilityReason({
        compensatoryMeasureEligible: false,
        blockingReason: null,
        contractType: "temporary",
        hireDate: "2015-01-01",
        campaignYear: 2026,
        employmentStatus: "active",
      }),
    ).toBe("ineligible_contract_type");
  });

  it("libellés promotion N-1 / exclue", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2025-06-01",
      salaryBeforePromotionFcfa: 500_000n,
      salaryAfterPromotionFcfa: 550_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    expect(
      formatPromotionStatusLabel({
        promotion,
        promotionYear: 2025,
        promotionMonth: 6,
        campaignYear: 2026,
        promotionInclusion: {
          promotionAmountFcfa: 50_000n,
          promotionApplicableMonths: 12,
          promotionCampaignCostFcfa: 600_000n,
          includedInSimulation: true,
          exclusionReason: null,
        },
        isPromotionBudgetPopulationEmployee: true,
      }),
    ).toBe("N-1");
    expect(
      formatPromotionStatusLabel({
        promotion,
        promotionYear: 2026,
        promotionMonth: 8,
        campaignYear: 2026,
        promotionInclusion: {
          promotionAmountFcfa: 50_000n,
          promotionApplicableMonths: 0,
          promotionCampaignCostFcfa: 0n,
          includedInSimulation: false,
          exclusionReason: "EXCLUDED_AFTER_TECHNICAL_APPLICATION_MONTH",
        },
        isPromotionBudgetPopulationEmployee: true,
      }),
    ).toBe("Exclue après application");
  });
});

describe("Lot 2A-H2C-2B — mapping vue sans promotion", () => {
  it("mapping population sans promotion + invariant rappel/direct", () => {
    const engine = calculatePreparedPopulationCompensation(baseInput());
    const view = toView(engine);
    expect(view.budgetSummary.hasStructuredPromotions).toBe(false);
    expect(view.budgetSummary.hasImputedPromotionBudgetCost).toBe(false);
    expect(
      view.budgetSummary.envelopeSummary.totalAnnualPromotionBudgetCostFcfa,
    ).toBe(0n);
    expect(
      view.budgetSummary.paymentCalendar.compensatoryReminderPlusDirectEqualsAnnual,
    ).toBe(true);
    const employee = view.employees[0]!;
    expect(employee.promotionStatusLabel).toBe("Aucune");
    expect(employee.monthlyCompensationTrajectory).toHaveLength(12);
    expect(employee.monthlyCompensationTrajectory.map((m) => m.month)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(employee.monthlyCompensationTrajectory[0]!.monthLabel).toBe("Janvier");
    expect(employee.monthlyCompensationTrajectory[11]!.monthLabel).toBe(
      "Décembre",
    );
    const rateLabels = employee.monthlyCompensationTrajectory
      .flatMap((m) => [
        m.targetCompensatoryRateLabel,
        m.promotionRateOffsetLabel,
        m.compensatoryComplementRateLabel,
      ])
      .join(" ");
    expect(rateLabels).not.toMatch(/\//);
    expect(rateLabels).not.toMatch(/numerator/);
    expect(CALCULATION_CONTRACT_VERSION).toBe(3);
    expect(RESULT_SCHEMA_VERSION).toBe(2);
    expect(SENIORITY_IMPACT_CONTRACT_VERSION).toBe(1);
  });
});

describe("Lot 2A-H2C-2B — mapping vue avec promotion", () => {
  it("distingue coût brut informatif et coût imputable", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2026-04-15",
      salaryBeforePromotionFcfa: 500_000n,
      salaryAfterPromotionFcfa: 550_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const engine = calculatePreparedPopulationCompensation(
      baseInput({
        employees: [
          {
            employeeId: "PROMO-N",
            familyCode: "F1",
            gradeCode: "G1",
            salaryFcfa: 500_000,
            hireDate: "2015-03-01",
            confirmedUnderperformer: false,
            promotion,
            employmentStatus: "active",
            contractType: "cdi",
          },
        ],
      }),
    );
    const view = toView(engine);
    const employee = view.employees[0]!;
    expect(view.budgetSummary.hasStructuredPromotions).toBe(true);
    expect(employee.promotionCampaignCostInformativeFcfa).toBe(
      employee.annualPromotionBudgetCostFcfa,
    );
    expect(employee.annualPromotionBudgetCostFcfa).toBeGreaterThan(0n);
    expect(
      employee.monthlyCompensationTrajectory[3]!.promotionPaymentStatusLabel,
    ).toBe("Déjà payée");
    expect(
      employee.monthlyCompensationTrajectory[6]!.promotionPaymentStatusLabel,
    ).toBe("Période courante");
    expect(
      employee.monthlyCompensationTrajectory[0]!.compensatoryPaymentStatusLabel,
    ).toBe("Rappel");
  });

  it("promu non éligible : coût promo imputé, complément nul, motif visible", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2025-03-01",
      salaryBeforePromotionFcfa: 400_000n,
      salaryAfterPromotionFcfa: 500_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const engine = calculatePreparedPopulationCompensation(
      baseInput({
        employees: [
          {
            employeeId: "TEMP-PROMO",
            familyCode: "F1",
            gradeCode: "G2",
            salaryFcfa: 500_000,
            hireDate: "2015-01-01",
            confirmedUnderperformer: false,
            promotion,
            employmentStatus: "active",
            contractType: "temporary",
          },
          {
            employeeId: "ACTIVE",
            familyCode: "F1",
            gradeCode: "G1",
            salaryFcfa: 500_000,
            hireDate: "2015-01-01",
            confirmedUnderperformer: false,
            employmentStatus: "active",
            contractType: "cdi",
          },
        ],
        budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 1_500_000 },
      }),
    );
    const view = toView(engine);
    const promo = view.employees.find((e) => e.employeeId === "TEMP-PROMO")!;
    expect(promo.annualPromotionBudgetCostFcfa).toBeGreaterThan(0n);
    expect(promo.annualActualBaseIncreaseCostFcfa).toBe(0n);
    expect(promo.compensatoryIneligibilityReasonLabel).toBe(
      "Type de contrat non éligible",
    );
  });

  it("sous-performant promu : complément nul, statut visible", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2025-01-10",
      salaryBeforePromotionFcfa: 400_000n,
      salaryAfterPromotionFcfa: 500_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const engine = calculatePreparedPopulationCompensation(
      baseInput({
        employees: [
          {
            employeeId: "UNDER",
            familyCode: "F1",
            gradeCode: "G2",
            salaryFcfa: 500_000,
            hireDate: "2015-03-01",
            confirmedUnderperformer: true,
            promotion,
            employmentStatus: "active",
            contractType: "cdi",
          },
          {
            employeeId: "ACTIVE",
            familyCode: "F1",
            gradeCode: "G1",
            salaryFcfa: 500_000,
            hireDate: "2015-03-01",
            confirmedUnderperformer: false,
            employmentStatus: "active",
            contractType: "cdi",
          },
        ],
        budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 1_500_000 },
      }),
    );
    const view = toView(engine);
    const under = view.employees.find((e) => e.employeeId === "UNDER")!;
    expect(under.annualPromotionBudgetCostFcfa).toBeGreaterThan(0n);
    expect(under.annualActualBaseIncreaseCostFcfa).toBe(0n);
    expect(under.compensatoryEligibilityLabel).toBe("Sous-performant confirmé");
  });

  it("promotion exclue après mois technique", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2026-08-10",
      salaryBeforePromotionFcfa: 500_000n,
      salaryAfterPromotionFcfa: 550_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const engine = calculatePreparedPopulationCompensation(
      baseInput({
        employees: [
          {
            employeeId: "EXCL",
            familyCode: "F1",
            gradeCode: "G1",
            salaryFcfa: 500_000,
            hireDate: "2015-03-01",
            confirmedUnderperformer: false,
            promotion,
            employmentStatus: "active",
            contractType: "cdi",
          },
        ],
      }),
    );
    const view = toView(engine);
    expect(view.employees[0]!.promotionStatusLabel).toBe(
      "Exclue après application",
    );
    expect(view.employees[0]!.annualPromotionBudgetCostFcfa).toBe(0n);
  });

  it("promotion hors population budgétaire : brut informatif, imputable 0", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2025-01-10",
      salaryBeforePromotionFcfa: 400_000n,
      salaryAfterPromotionFcfa: 500_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const engine = calculatePreparedPopulationCompensation(
      baseInput({
        employees: [
          {
            employeeId: "DEP",
            familyCode: "F1",
            gradeCode: "G2",
            salaryFcfa: 500_000,
            hireDate: "2015-03-01",
            confirmedUnderperformer: false,
            promotion,
            employmentStatus: "departed",
            contractType: "cdi",
          },
        ],
        budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 120_000 },
      }),
    );
    const view = toView(engine);
    const employee = view.employees[0]!;
    expect(employee.promotionStatusLabel).toBe("Hors population budgétaire");
    expect(employee.promotionCampaignCostInformativeFcfa).toBeGreaterThan(0n);
    expect(employee.annualPromotionBudgetCostFcfa).toBe(0n);
  });
});

describe("Lot 2A-H2C-2B — parité fixture vue", () => {
  it("affiche le budget 5 000 023 et reflète fidèlement le moteur (EMP-2002)", () => {
    const recipeEmployees: PreparedEmployeeCalculationInput[] = [];
    for (let i = 1; i <= 14; i += 1) {
      recipeEmployees.push({
        employeeId: `EMP-${2000 + i}`,
        familyCode: "F1",
        gradeCode: "G1",
        salaryFcfa: i === 2 ? 536_000 : 400_000 + i * 10_000,
        hireDate: "2020-07-15",
        confirmedUnderperformer: false,
      });
    }
    recipeEmployees.push({
      employeeId: "EMP-UNDER",
      familyCode: "F1",
      gradeCode: "G1",
      salaryFcfa: 450_000,
      hireDate: "2020-07-15",
      confirmedUnderperformer: true,
    });

    const engine = calculatePreparedPopulationCompensation({
      employees: recipeEmployees,
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
    });
    const view = toView(engine);
    expect(view.budgetSummary.envelopeSummary.annualBudgetTargetLabel).toMatch(
      /5[\s\u202F]?000[\s\u202F]?023/,
    );
    expect(
      view.budgetSummary.envelopeSummary.totalAnnualActualCompensatoryCostFcfa,
    ).toBe(5_000_040n);
    expect(engine.annualActualOperationCostFcfa).toBe(5_000_040n);
    expect(
      fractionsEqual(
        engine.annualTotalRoundingDelta,
        exactAmountFromInteger(17n),
      ),
    ).toBe(true);
    const empEngine = engine.employees.find((e) => e.employeeId === "EMP-2002")!;
    const empView = view.employees.find((e) => e.employeeId === "EMP-2002")!;
    expect(empView.technicalMonthCompensatoryComplementFcfa).toBe(
      empEngine.monthlyFinalRoundedIncreaseFcfa,
    );
    expect(empView.technicalMonthCompensatoryComplementFcfa).toBe(30_205n);
    expect(
      view.budgetSummary.envelopeSummary.annualCombinedRoundingDeltaLabel,
    ).toMatch(/\+17|17/);
    expect(view.budgetSummary.hasStructuredPromotions).toBe(false);
  });
});

describe("Lot 2A-H2C-2B — erreurs métier dédiées", () => {
  it("PROMOTION_COST_EXCEEDS_BUDGET", () => {
    const dedicated = findDedicatedSimulationBusinessError([
      {
        code: "PROMOTION_COST_EXCEEDS_BUDGET",
        message: "dépassement",
        scope: "engine",
        details: {
          annualBudgetTargetFcfa: "1000/1",
          totalAnnualPromotionBudgetCostFcfa: "500000",
          overrunFcfa: "499000/1",
        },
      },
    ]);
    expect(dedicated?.code).toBe("PROMOTION_COST_EXCEEDS_BUDGET");
    expect(dedicated?.title).toMatch(/dépasse l’enveloppe/);
  });

  it("NO_COMPENSATORY_ALLOCATION_CAPACITY", () => {
    const dedicated = findDedicatedSimulationBusinessError([
      {
        code: "NO_COMPENSATORY_ALLOCATION_CAPACITY",
        message: "aucune capacité",
        scope: "engine",
        details: {
          annualBudgetTargetFcfa: "1000003/1",
          totalAnnualPromotionBudgetCostFcfa: "450000",
          availableAnnualCompensatoryBudgetFcfa: "550003/1",
          eligibleExposureCount: 0,
        },
      },
    ]);
    expect(dedicated?.code).toBe("NO_COMPENSATORY_ALLOCATION_CAPACITY");
    expect(dedicated?.title).toMatch(/reliquat/);
    expect(dedicated?.message).not.toMatch(/Augmentez le budget/i);
    expect(dedicated?.message).toMatch(/Réduisez l’enveloppe|éligibilité/);
    const byLabel = Object.fromEntries(
      (dedicated?.details ?? []).map((d) => [d.label, d.value]),
    );
    expect(byLabel["Budget cible"]).toMatch(/1[\s\u202F]?000[\s\u202F]?003/);
    expect(byLabel["Coût des promotions"]).toMatch(/450[\s\u202F]?000/);
    expect(byLabel["Budget disponible pour le complément"]).toMatch(
      /550[\s\u202F]?003/,
    );
    expect(byLabel["Expositions éligibles"]).toBe("0");
    expect(Object.values(byLabel).join(" ")).not.toMatch(/—/);
  });

  it("PROMOTION_COST_EXCEEDS_BUDGET conserve le conseil d’augmenter le budget", () => {
    const dedicated = findDedicatedSimulationBusinessError([
      {
        code: "PROMOTION_COST_EXCEEDS_BUDGET",
        message: "dépassement",
        scope: "engine",
        details: {
          annualBudgetTargetFcfa: "1000/1",
          totalAnnualPromotionBudgetCostFcfa: "500000",
          overrunFcfa: "499000/1",
        },
      },
    ]);
    expect(dedicated?.message).toMatch(/Augmentez le budget/);
  });
});

describe("Lot 2A-H2C-2B — absence libellé interdit", () => {
  it("aucune mention « rappel de promotion » dans les libellés vue", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2026-04-15",
      salaryBeforePromotionFcfa: 500_000n,
      salaryAfterPromotionFcfa: 550_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const view = toView(
      calculatePreparedPopulationCompensation(
        baseInput({
          employees: [
            {
              employeeId: "P1",
              familyCode: "F1",
              gradeCode: "G1",
              salaryFcfa: 500_000,
              hireDate: "2015-03-01",
              confirmedUnderperformer: false,
              promotion,
              employmentStatus: "active",
              contractType: "cdi",
            },
          ],
        }),
      ),
    );
    const labels = [
      ...view.employees.flatMap((e) => [
        e.promotionStatusLabel,
        e.compensatoryEligibilityLabel,
        e.compensatoryIneligibilityReasonLabel,
        e.promotionInclusionStatusLabel,
        ...e.monthlyCompensationTrajectory.map((m) => m.promotionPaymentStatusLabel),
        ...e.monthlyCompensationTrajectory.map((m) => m.compensatoryPaymentStatusLabel),
      ]),
      view.budgetSummary.envelopeSummary.annualBudgetTargetLabel,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    expect(labels).not.toMatch(/rappel de promotion/);
    expect(
      fractionsEqual(
        view.budgetSummary.envelopeSummary.availableAnnualCompensatoryBudgetFcfa,
        exactAmountFromInteger(
          2_000_000n -
            view.budgetSummary.envelopeSummary.totalAnnualPromotionBudgetCostFcfa,
        ),
      ),
    ).toBe(true);
  });
});

describe("Lot 2A-H2C-2B — agrégats transmis depuis le moteur (pas recomposés)", () => {
  it("restitue annualCombinedRoundingDeltaFcfa du moteur même s’il diverge d’une recomposition locale", () => {
    const engine = calculatePreparedPopulationCompensation(baseInput());
    const forgedDelta = { numerator: -42_424n, denominator: 1n };
    const forged: typeof engine = {
      ...engine,
      annualCombinedRoundingDeltaFcfa: forgedDelta,
      populationSummary: {
        ...engine.populationSummary,
        annualCombinedRoundingDeltaFcfa: forgedDelta,
      },
      // Valeurs volontairement incohérentes avec le delta forgé :
      totalCombinedAnnualActualCostFcfa: 999_999_999n,
    };
    const view = toView(forged);
    expect(view.budgetSummary.envelopeSummary.annualCombinedRoundingDeltaFcfa).toEqual(
      forgedDelta,
    );
    expect(view.budgetSummary.envelopeSummary.annualCombinedRoundingDeltaLabel).toMatch(
      /\u221242[\s\u202F]?424/,
    );
    // Preuve : ce n’est pas combined − budget (qui serait positif/énorme ici).
    expect(
      view.budgetSummary.envelopeSummary.annualCombinedRoundingDeltaFcfa.numerator,
    ).not.toBe(
      forged.totalCombinedAnnualActualCostFcfa -
        forged.budgetTargetResult.exactAmount.numerator,
    );
  });

  it("restitue les ventilations promotion du moteur sans resommer les 12 mois", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2026-04-15",
      salaryBeforePromotionFcfa: 500_000n,
      salaryAfterPromotionFcfa: 550_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const engine = calculatePreparedPopulationCompensation(
      baseInput({
        employees: [
          {
            employeeId: "PROMO-N",
            familyCode: "F1",
            gradeCode: "G1",
            salaryFcfa: 500_000,
            hireDate: "2015-03-01",
            confirmedUnderperformer: false,
            promotion,
            employmentStatus: "active",
            contractType: "cdi",
          },
        ],
      }),
    );
    const forgedAlready = 12_345n;
    const forgedRemaining = 67_890n;
    const forged: typeof engine = {
      ...engine,
      totalPromotionCostAlreadyPaidBeforeTechnicalMonthFcfa: forgedAlready,
      totalPromotionCostFromTechnicalMonthToDecemberFcfa: forgedRemaining,
      populationSummary: {
        ...engine.populationSummary,
        totalPromotionCostAlreadyPaidBeforeTechnicalMonthFcfa: forgedAlready,
        totalPromotionCostFromTechnicalMonthToDecemberFcfa: forgedRemaining,
      },
      employees: engine.employees.map((employee) => ({
        ...employee,
        promotionCostAlreadyPaidBeforeTechnicalMonthFcfa: forgedAlready,
        promotionCostFromTechnicalMonthToDecemberFcfa: forgedRemaining,
      })),
    };
    const view = toView(forged);
    expect(
      view.budgetSummary.paymentCalendar.totalPromotionCostAlreadyPaidBeforeTechnicalMonthFcfa,
    ).toBe(forgedAlready);
    expect(
      view.budgetSummary.paymentCalendar.totalPromotionCostFromTechnicalMonthToDecemberFcfa,
    ).toBe(forgedRemaining);
    expect(view.employees[0]!.promotionCostAlreadyPaidBeforeTechnicalMonthFcfa).toBe(
      forgedAlready,
    );
  });

  it("restitue les totaux d’ancienneté promotion ventilés depuis le moteur", () => {
    const engine = calculatePreparedPopulationCompensation(baseInput());
    const forgedPaid = 111n;
    const forgedRest = 222n;
    const forged: typeof engine = {
      ...engine,
      totalPromotionSeniorityAlreadyPaidBeforeTechnicalMonthFcfa: forgedPaid,
      totalPromotionSeniorityFromTechnicalMonthToDecemberFcfa: forgedRest,
      populationSummary: {
        ...engine.populationSummary,
        totalPromotionSeniorityAlreadyPaidBeforeTechnicalMonthFcfa: forgedPaid,
        totalPromotionSeniorityFromTechnicalMonthToDecemberFcfa: forgedRest,
      },
    };
    const view = toView(forged);
    expect(
      view.budgetSummary.seniorityImpactSummary
        .totalPromotionSeniorityAlreadyPaidBeforeTechnicalMonthFcfa,
    ).toBe(forgedPaid);
    expect(
      view.budgetSummary.seniorityImpactSummary
        .totalPromotionSeniorityFromTechnicalMonthToDecemberFcfa,
    ).toBe(forgedRest);
  });

  it("reconnaît les erreurs métier uniquement par leur code exact", () => {
    expect(
      findDedicatedSimulationBusinessError([
        {
          code: "POPULATION_CALCULATION_FAILED",
          message:
            "Le coût des promotions dépasse l’enveloppe / aucun salarié ne peut recevoir le reliquat",
          scope: "engine",
        },
      ]),
    ).toBeNull();
    expect(
      findDedicatedSimulationBusinessError([
        {
          code: "PROMOTION_COST_EXCEEDS_BUDGET",
          message: "message quelconque",
          scope: "engine",
        },
      ])?.code,
    ).toBe("PROMOTION_COST_EXCEEDS_BUDGET");
  });
});
