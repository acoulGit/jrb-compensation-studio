/**
 * Lot 2A-H2C-2 — moteur budget promotion + calibrage compensatoire.
 * Couvre le solveur exact, la population de consommation du budget
 * promotion et l'intégration bout-en-bout dans l'orchestrateur population.
 */

import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_NINE_BOX_CONFIRMATION_FACTOR_MILLI,
  DEFAULT_NINE_BOX_FACTORS,
  DEFAULT_PERFORMANCE_FACTORS,
  DEFAULT_POTENTIAL_FACTORS,
  DEFAULT_SALARY_POSITIONS,
} from "../domain/compensationReference/defaults";
import {
  CompensationCalculationError,
  buildEmployeePromotionAwareExposures,
  buildPromotionEvent,
  calculatePreparedPopulationCompensation,
  exactAmountFromInteger,
  fractionsEqual,
  hasMinimumSeniorityAtDecemberNMinus1,
  isCompensatoryMeasureEligible,
  isPromotionBudgetPopulationEmployee,
  NEUTRAL_EMPLOYER_COST_POLICY,
  promotionAnnualBudgetCostFcfa,
  reduceFraction,
  solvePromotionAwareCompensatoryCalibrationRate,
  type PopulationCalculationReferences,
  type PreparedEmployeeCalculationInput,
  type PreparedPopulationCalculationInput,
  type PromotionCompensatoryExposure,
} from "../domain/compensationCalculation";
import * as promotionCompensatoryCalibration from "../domain/compensationCalculation/promotionCompensatoryCalibration";

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
        hireDate: "2020-07-15",
        confirmedUnderperformer: false,
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
      manualBudgetFcfa: 120_000,
    },
    roundingPolicy: overrides.roundingPolicy ?? {
      mode: "nearest_half_up",
      stepFcfa: 5,
    },
    campaignYear: overrides.campaignYear ?? 2026,
    technicalApplicationMonth: overrides.technicalApplicationMonth ?? 7,
    employerCostPolicy:
      overrides.employerCostPolicy ?? NEUTRAL_EMPLOYER_COST_POLICY,
  };
}

function expectCode(run: () => void, code: string): void {
  try {
    run();
    expect.fail(`Attendu code ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(CompensationCalculationError);
    expect((error as CompensationCalculationError).code).toBe(code);
  }
}

describe("Lot 2A-H2C-2 — promotionBudgetPopulation", () => {
  it("statuts payables inclus ; départ/suspension/disponibilité/autre exclus", () => {
    expect(isPromotionBudgetPopulationEmployee({ employmentStatus: "active" })).toBe(true);
    expect(
      isPromotionBudgetPopulationEmployee({ employmentStatus: "group_detachment" }),
    ).toBe(true);
    expect(isPromotionBudgetPopulationEmployee({ employmentStatus: "legal_leave" })).toBe(
      true,
    );
    expect(isPromotionBudgetPopulationEmployee({ employmentStatus: "departed" })).toBe(
      false,
    );
    expect(isPromotionBudgetPopulationEmployee({ employmentStatus: "suspended" })).toBe(
      false,
    );
    expect(
      isPromotionBudgetPopulationEmployee({ employmentStatus: "external_availability" }),
    ).toBe(false);
    expect(isPromotionBudgetPopulationEmployee({ employmentStatus: "other" })).toBe(false);
  });

  it("statut absent (undefined/null) traité comme actif — rétro-compatibilité", () => {
    expect(isPromotionBudgetPopulationEmployee({})).toBe(true);
    expect(isPromotionBudgetPopulationEmployee({ employmentStatus: null })).toBe(true);
    expect(isPromotionBudgetPopulationEmployee({ employmentStatus: undefined })).toBe(
      true,
    );
  });

  it("promotionAnnualBudgetCostFcfa filtre par population et inclusion", () => {
    const included = {
      promotionAmountFcfa: 10_000n,
      promotionApplicableMonths: 6,
      promotionCampaignCostFcfa: 60_000n,
      includedInSimulation: true,
      exclusionReason: null,
    } as const;
    const excluded = {
      ...included,
      includedInSimulation: false,
      promotionCampaignCostFcfa: 0n,
    };
    expect(
      promotionAnnualBudgetCostFcfa({
        costPreview: included,
        isPromotionBudgetPopulationEmployee: true,
      }),
    ).toBe(60_000n);
    expect(
      promotionAnnualBudgetCostFcfa({
        costPreview: included,
        isPromotionBudgetPopulationEmployee: false,
      }),
    ).toBe(0n);
    expect(
      promotionAnnualBudgetCostFcfa({
        costPreview: excluded,
        isPromotionBudgetPopulationEmployee: true,
      }),
    ).toBe(0n);
  });
});

describe("Lot 2A-H2C-2 — solvePromotionAwareCompensatoryCalibrationRate", () => {
  const noOffset = exactAmountFromInteger(0n);

  it("budget nul → taux nul sans résolution", () => {
    const rate = solvePromotionAwareCompensatoryCalibrationRate({
      availableBudget: exactAmountFromInteger(0n),
      exposures: [{ salary: 1_000_000n, factor: exactAmountFromInteger(1n), promotionRateOffset: noOffset }],
    });
    expect(rate).toEqual({ numerator: 0n, denominator: 1n });
  });

  it("exposition unique sans décalage : taux = budget / (salaire×facteur)", () => {
    const rate = solvePromotionAwareCompensatoryCalibrationRate({
      availableBudget: exactAmountFromInteger(50_000n),
      exposures: [
        { salary: 1_000_000n, factor: reduceFraction(1n, 2n), promotionRateOffset: noOffset },
      ],
    });
    // budget = salaire × taux × facteur ⇒ taux = 50000 / (1000000 × 0.5) = 0.1
    expect(fractionsEqual(rate, reduceFraction(1n, 10n))).toBe(true);
  });

  it("facteurs nuls exclus ; population entièrement nulle + budget positif → erreur", () => {
    expectCode(
      () =>
        solvePromotionAwareCompensatoryCalibrationRate({
          availableBudget: exactAmountFromInteger(1_000n),
          exposures: [
            { salary: 1_000_000n, factor: exactAmountFromInteger(0n), promotionRateOffset: noOffset },
          ],
        }),
      "NO_COMPENSATORY_ALLOCATION_CAPACITY",
    );
  });

  it("segments piecewise : un décalage de promotion neutralise le taux jusqu'à son seuil", () => {
    // Deux expositions de même salaire/facteur ; l'une a un décalage
    // (promotion déjà accordée) supérieur au taux cible naïf → complément nul
    // pour elle tant que le taux résolu ne dépasse pas son seuil.
    const exposures: PromotionCompensatoryExposure[] = [
      { salary: 1_000_000n, factor: exactAmountFromInteger(1n), promotionRateOffset: noOffset },
      {
        salary: 1_000_000n,
        factor: exactAmountFromInteger(1n),
        promotionRateOffset: reduceFraction(1n, 10n), // seuil = 0.1
      },
    ];
    // Budget faible : seule la première exposition (seuil 0) doit être active.
    const smallRate = solvePromotionAwareCompensatoryCalibrationRate({
      availableBudget: exactAmountFromInteger(50_000n),
      exposures,
    });
    // taux = 50000 / 1000000 = 0.05 < seuil de la seconde exposition (0.1) → cohérent
    expect(fractionsEqual(smallRate, reduceFraction(1n, 20n))).toBe(true);

    // Budget plus grand : les deux expositions doivent être actives, en tenant
    // compte du décalage de la seconde dans l'équation exacte.
    // Σ salaire×max(0, taux − décalage) = budget
    // Si taux > 0.1 : 1e6×taux + 1e6×(taux − 0.1) = budget ⇒ 2e6×taux − 1e5 = budget
    const bigBudget = 500_000n;
    const bigRate = solvePromotionAwareCompensatoryCalibrationRate({
      availableBudget: exactAmountFromInteger(bigBudget),
      exposures,
    });
    const expected = reduceFraction(bigBudget + 100_000n, 2_000_000n);
    expect(fractionsEqual(bigRate, expected)).toBe(true);
    expect(fractionsEqual(bigRate, reduceFraction(3n, 10n))).toBe(true);
  });
});

describe("Lot 2A-H2C-2A — éligibilité compensatoire (règles documentées)", () => {
  it("salarié éligible sans promotion : facteur positif, complément possible", () => {
    const input = baseInput({
      employees: [
        {
          employeeId: "ELIG",
          familyCode: "F1",
          gradeCode: "G1",
          salaryFcfa: 500_000,
          hireDate: "2020-01-15",
          contractType: "cdi",
          employmentStatus: "active",
          confirmedUnderperformer: false,
        },
      ],
      budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 60_000 },
    });
    const result = calculatePreparedPopulationCompensation(input);
    const employee = result.employees[0]!;
    expect(employee.compensatoryMeasureEligible).toBe(true);
    expect(employee.annualActualCostFcfa).toBe(60_000n);
    expect(
      employee.monthlyCompensationTrajectory.every(
        (m) => m.effectiveCompensationFactor.numerator > 0n,
      ),
    ).toBe(true);
  });

  it("non éligible par type de contrat (intérimaire) : complément nul", () => {
    const input = baseInput({
      employees: [
        {
          employeeId: "TEMP",
          familyCode: "F1",
          gradeCode: "G1",
          salaryFcfa: 500_000,
          hireDate: "2020-01-15",
          contractType: "temporary",
          employmentStatus: "active",
          confirmedUnderperformer: false,
        },
        {
          employeeId: "CDI",
          familyCode: "F1",
          gradeCode: "G1",
          salaryFcfa: 500_000,
          hireDate: "2020-01-15",
          contractType: "cdi",
          employmentStatus: "active",
          confirmedUnderperformer: false,
        },
      ],
      budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 60_000 },
    });
    const result = calculatePreparedPopulationCompensation(input);
    const temp = result.employees.find((e) => e.employeeId === "TEMP")!;
    expect(temp.compensatoryMeasureEligible).toBe(false);
    expect(temp.annualActualCostFcfa).toBe(0n);
    for (const month of temp.monthlyCompensationTrajectory) {
      expect(month.effectiveCompensationFactor).toEqual({
        numerator: 0n,
        denominator: 1n,
      });
    }
  });

  it("non éligible par ancienneté < 12 mois au 31/12 N-1", () => {
    expect(
      isCompensatoryMeasureEligible({
        contractType: "cdi",
        hireDate: "2025-06-01",
        campaignYear: 2026,
        employmentStatus: "active",
      }),
    ).toBe(false);
    expect(
      hasMinimumSeniorityAtDecemberNMinus1("2024-12-31", 2026),
    ).toBe(true);
    expect(
      hasMinimumSeniorityAtDecemberNMinus1("2025-01-01", 2026),
    ).toBe(false);

    const input = baseInput({
      employees: [
        {
          employeeId: "JUNIOR",
          familyCode: "F1",
          gradeCode: "G1",
          salaryFcfa: 500_000,
          hireDate: "2025-06-01",
          contractType: "cdi",
          employmentStatus: "active",
          confirmedUnderperformer: false,
        },
        {
          employeeId: "SENIOR",
          familyCode: "F1",
          gradeCode: "G1",
          salaryFcfa: 500_000,
          hireDate: "2020-01-15",
          contractType: "cdi",
          employmentStatus: "active",
          confirmedUnderperformer: false,
        },
      ],
      campaignYear: 2026,
      budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 60_000 },
    });
    const result = calculatePreparedPopulationCompensation(input);
    expect(
      result.employees.find((e) => e.employeeId === "JUNIOR")!.annualActualCostFcfa,
    ).toBe(0n);
    expect(
      result.employees.find((e) => e.employeeId === "SENIOR")!.annualActualCostFcfa,
    ).toBe(60_000n);
  });

  it("gel external_availability : inéligible au complément", () => {
    expect(
      isCompensatoryMeasureEligible({
        contractType: "cdi",
        hireDate: "2020-01-15",
        campaignYear: 2026,
        employmentStatus: "external_availability",
      }),
    ).toBe(false);
  });

  it("promu + intérimaire : coût promo inclus, complément nul, pas d’exposition solveur", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2025-03-01",
      salaryBeforePromotionFcfa: 400_000n,
      salaryAfterPromotionFcfa: 500_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const input = baseInput({
      employees: [
        {
          employeeId: "PROMO-TEMP",
          familyCode: "F1",
          gradeCode: "G2",
          salaryFcfa: 500_000,
          hireDate: "2015-01-01",
          contractType: "temporary",
          employmentStatus: "active",
          confirmedUnderperformer: false,
          promotion,
        },
        {
          employeeId: "OTHER",
          familyCode: "F1",
          gradeCode: "G1",
          salaryFcfa: 500_000,
          hireDate: "2015-01-01",
          contractType: "cdi",
          employmentStatus: "active",
          confirmedUnderperformer: false,
        },
      ],
      budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 1_500_000 },
    });
    const result = calculatePreparedPopulationCompensation(input);
    const promoTemp = result.employees.find((e) => e.employeeId === "PROMO-TEMP")!;
    expect(promoTemp.isPromotionBudgetPopulationEmployee).toBe(true);
    expect(promoTemp.compensatoryMeasureEligible).toBe(false);
    expect(promoTemp.annualPromotionBudgetCostFcfa).toBe(100_000n * 12n);
    expect(result.totalAnnualPromotionBudgetCostFcfa).toBe(100_000n * 12n);
    expect(promoTemp.annualActualCostFcfa).toBe(0n);
    for (const month of promoTemp.monthlyCompensationTrajectory) {
      expect(month.effectiveCompensationFactor.numerator).toBe(0n);
      expect(month.roundedCompensatoryComplementFcfa).toBe(0n);
      expect(month.compensatorySeniorityImpactFcfa).toBe(0n);
    }
    expect(promoTemp.annualPromotionSeniorityImpactFcfa).toBeGreaterThan(0n);
  });

  it("fixture sans statut/contrat : fallback compat, éligible si ancienneté OK", () => {
    const input = baseInput();
    const result = calculatePreparedPopulationCompensation(input);
    expect(result.employees[0]!.compensatoryMeasureEligible).toBe(true);
    expect(isPromotionBudgetPopulationEmployee({})).toBe(true);
  });

  it("aucune exposition positive pour non éligible dans le solveur", () => {
    const exposures = buildEmployeePromotionAwareExposures({
      employeeId: "X",
      hireDate: "2020-01-01",
      decemberBaseSalaryFcfa: 500_000n,
      currentGradeCode: "G1",
      currentJobFamilyCode: "F1",
      promotion: null,
      contractType: "contractor",
      employmentStatus: "active",
      confirmedUnderperformer: false,
      campaignYear: 2026,
      technicalApplicationMonth: 7,
      evaluationMode: "none",
      salaryGrid: [
        { familyCode: "F1", gradeCode: "G1", s0Fcfa: 500_000 },
      ],
      salaryPositions: positions(),
      ...factors(),
    });
    expect(exposures.compensatoryMeasureEligible).toBe(false);
    expect(
      exposures.months.every((m) => m.effectiveCompensationFactor.numerator === 0n),
    ).toBe(true);
  });
});

describe("Lot 2A-H2C-2 — orchestrateur population avec promotions structurées", () => {
  it("sans promotion : parité stricte avec le moteur historique (référentiel commun)", () => {
    const input = baseInput();
    const result = calculatePreparedPopulationCompensation(input);
    expect(result.employees[0].promotion).toBeNull();
    expect(result.employees[0].promotionInclusion.includedInSimulation).toBe(false);
    expect(result.employees[0].annualPromotionBudgetCostFcfa).toBe(0n);
    expect(result.totalAnnualPromotionBudgetCostFcfa).toBe(0n);
    expect(
      fractionsEqual(result.availableAnnualCompensatoryBudget, result.budgetTargetResult.exactAmount),
    ).toBe(true);
    // Tous les mois identiques sans promotion : décembre = tout autre mois.
    const jan = result.employees[0].monthlyCompensationTrajectory.find((m) => m.month === 1)!;
    const dec = result.employees[0].monthlyCompensationTrajectory.find((m) => m.month === 12)!;
    expect(jan.roundedCompensatoryComplementFcfa).toBe(dec.roundedCompensatoryComplementFcfa);
  });

  it("promotion N-1 : coût annuel × 12, active toute l'année, décalage constant", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2025-06-10",
      salaryBeforePromotionFcfa: 400_000n,
      salaryAfterPromotionFcfa: 500_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const input = baseInput({
      employees: [
        {
          employeeId: "PROMO",
          familyCode: "F1",
          gradeCode: "G2",
          salaryFcfa: 500_000,
          hireDate: "2015-03-01",
          confirmedUnderperformer: false,
          promotion,
        },
      ],
      budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 2_000_000 },
    });
    const result = calculatePreparedPopulationCompensation(input);
    const employee = result.employees[0];
    expect(employee.promotionInclusion.includedInSimulation).toBe(true);
    expect(employee.promotionInclusion.promotionApplicableMonths).toBe(12);
    expect(employee.annualPromotionBudgetCostFcfa).toBe(100_000n * 12n);
    expect(result.totalAnnualPromotionBudgetCostFcfa).toBe(100_000n * 12n);
    for (const month of employee.monthlyCompensationTrajectory) {
      expect(month.promotionActive).toBe(true);
      expect(month.promotionRateOffset).toEqual(promotion.promotionRate);
      expect(month.promotionBudgetCostFcfa).toBe(100_000n);
    }
  });

  it("promotion N excluant les mois avant l'effet : décalage nul avant, appliqué après", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2026-04-15",
      salaryBeforePromotionFcfa: 500_000n,
      salaryAfterPromotionFcfa: 550_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const input = baseInput({
      employees: [
        {
          employeeId: "PROMO-N",
          familyCode: "F1",
          gradeCode: "G1",
          salaryFcfa: 500_000,
          hireDate: "2015-03-01",
          confirmedUnderperformer: false,
          promotion,
        },
      ],
      technicalApplicationMonth: 7,
      budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 700_000 },
    });
    const result = calculatePreparedPopulationCompensation(input);
    const employee = result.employees[0];
    expect(employee.promotionInclusion.includedInSimulation).toBe(true);
    expect(employee.promotionInclusion.promotionApplicableMonths).toBe(9);

    const march = employee.monthlyCompensationTrajectory.find((m) => m.month === 3)!;
    const april = employee.monthlyCompensationTrajectory.find((m) => m.month === 4)!;
    expect(march.promotionActive).toBe(false);
    expect(march.promotionRateOffset).toEqual({ numerator: 0n, denominator: 1n });
    expect(april.promotionActive).toBe(true);
    expect(fractionsEqual(april.promotionRateOffset, promotion.promotionRate)).toBe(true);
  });

  it("promotion exclue (après le mois d'application) : coût nul, décalage nul, complément régulier", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2026-08-01",
      salaryBeforePromotionFcfa: 500_000n,
      salaryAfterPromotionFcfa: 560_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const input = baseInput({
      employees: [
        {
          employeeId: "EXCLUDED",
          familyCode: "F1",
          gradeCode: "G1",
          salaryFcfa: 500_000,
          hireDate: "2015-03-01",
          confirmedUnderperformer: false,
          promotion,
        },
      ],
      technicalApplicationMonth: 7,
    });
    const result = calculatePreparedPopulationCompensation(input);
    const employee = result.employees[0];
    expect(employee.promotionInclusion.includedInSimulation).toBe(false);
    expect(employee.annualPromotionBudgetCostFcfa).toBe(0n);
    expect(result.totalAnnualPromotionBudgetCostFcfa).toBe(0n);
    for (const month of employee.monthlyCompensationTrajectory) {
      expect(month.promotionRateOffset).toEqual({ numerator: 0n, denominator: 1n });
      expect(month.promotionBudgetCostFcfa).toBe(0n);
    }
  });

  it("salarié départ (hors population budget promotion) : coût promotion non imputé, budget compensatoire préservé", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2025-01-10",
      salaryBeforePromotionFcfa: 400_000n,
      salaryAfterPromotionFcfa: 500_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const input = baseInput({
      employees: [
        {
          employeeId: "DEPARTED",
          familyCode: "F1",
          gradeCode: "G2",
          salaryFcfa: 500_000,
          hireDate: "2015-03-01",
          confirmedUnderperformer: false,
          promotion,
          employmentStatus: "departed",
        },
      ],
      budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 120_000 },
    });
    const result = calculatePreparedPopulationCompensation(input);
    const employee = result.employees[0];
    expect(employee.isPromotionBudgetPopulationEmployee).toBe(false);
    // Coût brut informatif H2C-1 conservé...
    expect(employee.promotionInclusion.promotionCampaignCostFcfa).toBe(100_000n * 12n);
    // ...coût imputable salarié et total population à 0.
    expect(employee.annualPromotionBudgetCostFcfa).toBe(0n);
    expect(result.totalAnnualPromotionBudgetCostFcfa).toBe(0n);
    expect(
      fractionsEqual(result.availableAnnualCompensatoryBudget, result.budgetTargetResult.exactAmount),
    ).toBe(true);
  });

  it("external_availability : coût brut informatif, coût imputable = 0", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2025-01-10",
      salaryBeforePromotionFcfa: 400_000n,
      salaryAfterPromotionFcfa: 500_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const input = baseInput({
      employees: [
        {
          employeeId: "EXT",
          familyCode: "F1",
          gradeCode: "G2",
          salaryFcfa: 500_000,
          hireDate: "2015-03-01",
          confirmedUnderperformer: false,
          promotion,
          employmentStatus: "external_availability",
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
      budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 120_000 },
    });
    const result = calculatePreparedPopulationCompensation(input);
    const employee = result.employees.find((e) => e.employeeId === "EXT")!;
    expect(employee.promotionInclusion.promotionCampaignCostFcfa).toBe(100_000n * 12n);
    expect(employee.annualPromotionBudgetCostFcfa).toBe(0n);
    expect(result.totalAnnualPromotionBudgetCostFcfa).toBe(0n);
  });

  it("actif avec promotion incluse : coût brut = coût imputable ; total = somme salariés", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2025-01-10",
      salaryBeforePromotionFcfa: 400_000n,
      salaryAfterPromotionFcfa: 500_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const input = baseInput({
      employees: [
        {
          employeeId: "A1",
          familyCode: "F1",
          gradeCode: "G2",
          salaryFcfa: 500_000,
          hireDate: "2015-03-01",
          confirmedUnderperformer: false,
          promotion,
          employmentStatus: "active",
          contractType: "cdi",
        },
        {
          employeeId: "A2",
          familyCode: "F1",
          gradeCode: "G1",
          salaryFcfa: 500_000,
          hireDate: "2015-03-01",
          confirmedUnderperformer: false,
          employmentStatus: "active",
          contractType: "cdi",
        },
      ],
      budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 2_000_000 },
    });
    const result = calculatePreparedPopulationCompensation(input);
    const a1 = result.employees.find((e) => e.employeeId === "A1")!;
    expect(a1.promotionInclusion.promotionCampaignCostFcfa).toBe(100_000n * 12n);
    expect(a1.annualPromotionBudgetCostFcfa).toBe(100_000n * 12n);
    expect(result.totalAnnualPromotionBudgetCostFcfa).toBe(
      result.employees.reduce((sum, e) => sum + e.annualPromotionBudgetCostFcfa, 0n),
    );
  });

  it("NO_COMPENSATORY_ALLOCATION_CAPACITY non masqué par POPULATION_CALCULATION_FAILED", () => {
    const input = baseInput({
      employees: [
        {
          employeeId: "ONLY-TEMP",
          familyCode: "F1",
          gradeCode: "G1",
          salaryFcfa: 500_000,
          hireDate: "2015-03-01",
          confirmedUnderperformer: false,
          contractType: "temporary",
          employmentStatus: "active",
        },
      ],
      budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 60_000 },
    });
    expectCode(
      () => calculatePreparedPopulationCompensation(input),
      "NO_COMPENSATORY_ALLOCATION_CAPACITY",
    );
  });

  it("NO_COMPENSATORY_ALLOCATION_CAPACITY transporte le contexte budgétaire structuré", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2025-01-10",
      salaryBeforePromotionFcfa: 400_000n,
      salaryAfterPromotionFcfa: 437_500n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    // 37_500 × 12 = 450_000 de coût promo ; budget 1_000_003 → disponible 550_003
    const input = baseInput({
      employees: [
        {
          employeeId: "PROMO-TEMP",
          familyCode: "F1",
          gradeCode: "G2",
          salaryFcfa: 437_500,
          hireDate: "2015-03-01",
          confirmedUnderperformer: false,
          contractType: "temporary",
          employmentStatus: "active",
          promotion,
        },
      ],
      budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 1_000_003 },
    });
    try {
      calculatePreparedPopulationCompensation(input);
      expect.fail("Attendu NO_COMPENSATORY_ALLOCATION_CAPACITY");
    } catch (error) {
      expect(error).toBeInstanceOf(CompensationCalculationError);
      const typed = error as CompensationCalculationError;
      expect(typed.code).toBe("NO_COMPENSATORY_ALLOCATION_CAPACITY");
      expect(typed.message).not.toMatch(/Augmentez le budget/i);
      expect(typed.message).toMatch(/Réduisez l'enveloppe|éligibilité/i);
      const issue = typed.issues?.[0];
      expect(issue?.code).toBe("NO_COMPENSATORY_ALLOCATION_CAPACITY");
      expect(issue?.details?.annualBudgetTargetFcfa).toBeDefined();
      expect(issue?.details?.totalAnnualPromotionBudgetCostFcfa).toBe("450000");
      expect(issue?.details?.availableAnnualCompensatoryBudgetFcfa).toBeDefined();
      expect(String(issue?.details?.eligibleExposureCount)).toBe("0");
      expect(String(issue?.details?.availableAnnualCompensatoryBudgetFcfa)).toMatch(
        /550003/,
      );
      expect(String(issue?.message ?? typed.message)).not.toMatch(
        /Augmentez le budget/i,
      );
    }
  });

  it("erreur technique inattendue du calibrage → POPULATION_CALCULATION_FAILED", () => {
    const spy = vi
      .spyOn(
        promotionCompensatoryCalibration,
        "solvePromotionAwareCompensatoryCalibrationRate",
      )
      .mockImplementation(() => {
        throw new Error("panne technique inattendue du solveur");
      });
    try {
      expectCode(
        () =>
          calculatePreparedPopulationCompensation(
            baseInput({
              budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 60_000 },
            }),
          ),
        "POPULATION_CALCULATION_FAILED",
      );
    } finally {
      spy.mockRestore();
    }
  });

  it("PROMOTION_COST_EXCEEDS_BUDGET conserve son code exact", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2025-01-10",
      salaryBeforePromotionFcfa: 400_000n,
      salaryAfterPromotionFcfa: 900_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const input = baseInput({
      employees: [
        {
          employeeId: "COSTLY",
          familyCode: "F1",
          gradeCode: "G2",
          salaryFcfa: 900_000,
          hireDate: "2015-03-01",
          confirmedUnderperformer: false,
          promotion,
          employmentStatus: "active",
          contractType: "cdi",
        },
      ],
      budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 1_000 },
    });
    expectCode(() => calculatePreparedPopulationCompensation(input), "PROMOTION_COST_EXCEEDS_BUDGET");
  });

  it("compensatoryMeasureEligible=false : complément compensatoire nul tous les mois", () => {
    const input = baseInput({
      employees: [
        {
          employeeId: "INELIGIBLE",
          familyCode: "F1",
          gradeCode: "G1",
          salaryFcfa: 500_000,
          hireDate: "2015-03-01",
          confirmedUnderperformer: false,
          compensatoryMeasureEligible: false,
        },
        {
          employeeId: "ELIGIBLE",
          familyCode: "F1",
          gradeCode: "G1",
          salaryFcfa: 500_000,
          hireDate: "2015-03-01",
          confirmedUnderperformer: false,
        },
      ],
      budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 60_000 },
    });
    const result = calculatePreparedPopulationCompensation(input);
    const ineligible = result.employees.find((e) => e.employeeId === "INELIGIBLE")!;
    const eligible = result.employees.find((e) => e.employeeId === "ELIGIBLE")!;
    expect(ineligible.annualActualCostFcfa).toBe(0n);
    for (const month of ineligible.monthlyCompensationTrajectory) {
      expect(month.effectiveCompensationFactor).toEqual({ numerator: 0n, denominator: 1n });
      expect(month.roundedCompensatoryComplementFcfa).toBe(0n);
    }
    // Le budget entier revient au seul salarié éligible.
    expect(eligible.annualActualCostFcfa).toBe(60_000n);
  });

  it("ventilation d'ancienneté : impact total = impact promotion + impact compensatoire", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2026-04-15",
      salaryBeforePromotionFcfa: 500_000n,
      salaryAfterPromotionFcfa: 550_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const input = baseInput({
      employees: [
        {
          employeeId: "SENIOR-PROMO",
          familyCode: "F1",
          gradeCode: "G1",
          salaryFcfa: 500_000,
          hireDate: "2015-01-01",
          confirmedUnderperformer: false,
          promotion,
        },
      ],
      technicalApplicationMonth: 7,
      budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 700_000 },
    });
    const result = calculatePreparedPopulationCompensation(input);
    const employee = result.employees[0];
    for (const month of employee.monthlyCompensationTrajectory) {
      expect(month.totalSeniorityImpactFcfa).toBe(
        month.promotionSeniorityImpactFcfa + month.compensatorySeniorityImpactFcfa,
      );
    }
    expect(employee.combinedAnnualSeniorityImpactFcfa).toBe(
      employee.annualSeniorityImpactFcfa + employee.annualPromotionSeniorityImpactFcfa,
    );
  });

  it("invariants population : rappel + direct = annuel (compensatoire et combiné)", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2026-05-01",
      salaryBeforePromotionFcfa: 500_000n,
      salaryAfterPromotionFcfa: 540_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const input = baseInput({
      employees: [
        {
          employeeId: "A",
          familyCode: "F1",
          gradeCode: "G1",
          salaryFcfa: 500_000,
          hireDate: "2015-01-01",
          confirmedUnderperformer: false,
          promotion,
        },
        {
          employeeId: "B",
          familyCode: "F1",
          gradeCode: "G1",
          salaryFcfa: 700_000,
          hireDate: "2018-06-01",
          confirmedUnderperformer: false,
        },
      ],
      technicalApplicationMonth: 9,
      budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 900_000 },
    });
    const result = calculatePreparedPopulationCompensation(input);
    expect(result.totalBaseSalaryReminderFcfa + result.totalRemainingYearDirectIncreaseCostFcfa).toBe(
      result.totalAnnualActualBaseIncreaseCostFcfa,
    );
    expect(
      result.employees.reduce((sum, e) => sum + e.combinedAnnualActualCostFcfa, 0n),
    ).toBe(result.totalCombinedAnnualActualCostFcfa);
    for (const employee of result.employees) {
      expect(employee.baseSalaryReminderFcfa + employee.remainingYearDirectIncreaseCostFcfa).toBe(
        employee.annualActualBaseIncreaseCostFcfa,
      );
    }
  });

  it("budget pourcentage : assiette décembre N-1, promotions N hors assiette", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2026-04-15",
      salaryBeforePromotionFcfa: 500_000n,
      salaryAfterPromotionFcfa: 550_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const input = baseInput({
      employees: [
        {
          employeeId: "PCT",
          familyCode: "F1",
          gradeCode: "G1",
          salaryFcfa: 500_000,
          hireDate: "2015-01-01",
          confirmedUnderperformer: false,
          promotion,
        },
      ],
      budgetTarget: {
        mode: "percentage_of_eligible_payroll",
        eligiblePayrollFcfa: 500_000,
        budgetRateBasisPoints: 1_000, // 10 %
      },
    });
    const result = calculatePreparedPopulationCompensation(input);
    // Masse mensuelle 500_000 × 12 × 10 % = 600_000 (pas le salaire promu).
    expect(result.budgetTargetResult.exactAmount).toEqual({
      numerator: 600_000n,
      denominator: 1n,
    });
    expect(result.totalAnnualPromotionBudgetCostFcfa).toBe(50_000n * 9n);
  });

  it("promotion N en juillet (mois technique) : incluse dès juillet", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2026-07-20",
      salaryBeforePromotionFcfa: 500_000n,
      salaryAfterPromotionFcfa: 560_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const input = baseInput({
      employees: [
        {
          employeeId: "JULY",
          familyCode: "F1",
          gradeCode: "G1",
          salaryFcfa: 500_000,
          hireDate: "2015-01-01",
          confirmedUnderperformer: false,
          promotion,
        },
      ],
      technicalApplicationMonth: 7,
      budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 1_000_000 },
    });
    const result = calculatePreparedPopulationCompensation(input);
    const employee = result.employees[0]!;
    expect(employee.promotionInclusion.includedInSimulation).toBe(true);
    expect(employee.promotionInclusion.promotionApplicableMonths).toBe(6);
    const june = employee.monthlyCompensationTrajectory.find((m) => m.month === 6)!;
    const july = employee.monthlyCompensationTrajectory.find((m) => m.month === 7)!;
    expect(june.baseSalaryFcfa).toBe(500_000n);
    expect(july.baseSalaryFcfa).toBe(560_000n);
    expect(july.gradeCode).toBe("G2");
  });

  it("sous-performant avec promotion : coût promo inclus, complément nul", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2025-03-01",
      salaryBeforePromotionFcfa: 400_000n,
      salaryAfterPromotionFcfa: 500_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const input = baseInput({
      employees: [
        {
          employeeId: "UNDER-PROMO",
          familyCode: "F1",
          gradeCode: "G2",
          salaryFcfa: 500_000,
          hireDate: "2015-01-01",
          confirmedUnderperformer: true,
          promotion,
        },
        {
          employeeId: "OTHER",
          familyCode: "F1",
          gradeCode: "G1",
          salaryFcfa: 500_000,
          hireDate: "2015-01-01",
          confirmedUnderperformer: false,
        },
      ],
      budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 1_500_000 },
    });
    const result = calculatePreparedPopulationCompensation(input);
    const under = result.employees.find((e) => e.employeeId === "UNDER-PROMO")!;
    expect(under.annualPromotionBudgetCostFcfa).toBe(100_000n * 12n);
    expect(result.totalAnnualPromotionBudgetCostFcfa).toBe(100_000n * 12n);
    expect(under.annualActualCostFcfa).toBe(0n);
    for (const month of under.monthlyCompensationTrajectory) {
      expect(month.roundedCompensatoryComplementFcfa).toBe(0n);
    }
  });

  it("coût promotions = budget → compléments nuls, simulation valide", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2025-01-10",
      salaryBeforePromotionFcfa: 400_000n,
      salaryAfterPromotionFcfa: 450_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const promoCost = 50_000n * 12n;
    const input = baseInput({
      employees: [
        {
          employeeId: "EQ",
          familyCode: "F1",
          gradeCode: "G2",
          salaryFcfa: 450_000,
          hireDate: "2015-01-01",
          confirmedUnderperformer: false,
          promotion,
        },
      ],
      budgetTarget: { mode: "manual_amount", manualBudgetFcfa: promoCost },
    });
    const result = calculatePreparedPopulationCompensation(input);
    expect(result.totalAnnualPromotionBudgetCostFcfa).toBe(promoCost);
    expect(result.availableAnnualCompensatoryBudget).toEqual({
      numerator: 0n,
      denominator: 1n,
    });
    expect(result.employees[0]!.annualActualCostFcfa).toBe(0n);
  });

  it("salaire promu comme assiette ; pas de double ajout au salaire final ; trajectoire 12 mois", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2026-04-15",
      salaryBeforePromotionFcfa: 500_000n,
      salaryAfterPromotionFcfa: 550_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const input = baseInput({
      employees: [
        {
          employeeId: "BASE",
          familyCode: "F1",
          gradeCode: "G1",
          salaryFcfa: 500_000,
          hireDate: "2015-01-01",
          confirmedUnderperformer: false,
          promotion,
        },
      ],
      budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 800_000 },
    });
    const result = calculatePreparedPopulationCompensation(input);
    const employee = result.employees[0]!;
    expect(employee.monthlyCompensationTrajectory).toHaveLength(12);
    expect(employee.monthlyCompensationTrajectory.map((m) => m.month)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    const april = employee.monthlyCompensationTrajectory.find((m) => m.month === 4)!;
    expect(april.baseSalaryFcfa).toBe(550_000n);
    expect(april.finalSalaryFcfa).toBe(
      april.baseSalaryFcfa + april.roundedCompensatoryComplementFcfa,
    );
    expect(april.finalSalaryFcfa).not.toBe(
      april.baseSalaryFcfa +
        april.roundedCompensatoryComplementFcfa +
        50_000n,
    );
  });

  it("somme théorique promotions + compléments = budget exact", () => {
    const promotion = buildPromotionEvent({
      promotionDate: "2026-04-15",
      salaryBeforePromotionFcfa: 500_000n,
      salaryAfterPromotionFcfa: 550_000n,
      previousGradeCode: "G1",
      promotedGradeCode: "G2",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const input = baseInput({
      employees: [
        {
          employeeId: "SUM",
          familyCode: "F1",
          gradeCode: "G1",
          salaryFcfa: 500_000,
          hireDate: "2015-01-01",
          confirmedUnderperformer: false,
          promotion,
        },
      ],
      budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 900_000 },
      roundingPolicy: { mode: "nearest_half_up", stepFcfa: 1 },
    });
    const result = calculatePreparedPopulationCompensation(input);
    const theoComp = result.annualTheoreticalAllocatedTotal;
    const promo = exactAmountFromInteger(result.totalAnnualPromotionBudgetCostFcfa);
    const combined = {
      numerator:
        theoComp.numerator * promo.denominator + promo.numerator * theoComp.denominator,
      denominator: theoComp.denominator * promo.denominator,
    };
    expect(fractionsEqual(combined, result.budgetTargetResult.exactAmount)).toBe(true);
  });
});
