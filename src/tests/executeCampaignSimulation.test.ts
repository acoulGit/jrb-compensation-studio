import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_NINE_BOX_CONFIRMATION_FACTOR_MILLI,
  DEFAULT_NINE_BOX_FACTORS,
  DEFAULT_PERFORMANCE_FACTORS,
  DEFAULT_POTENTIAL_FACTORS,
  DEFAULT_SALARY_POSITIONS,
} from "../domain/compensationReference/defaults";
import * as calculation from "../domain/compensationCalculation";
import type {
  PreparedEmployeeCalculationInput,
  PopulationCalculationReferences,
  PreparedSalaryGridCell,
} from "../domain/compensationCalculation";
import {
  MINIMUM_INCREASE_CONTRACT_VERSION,
  NO_MINIMUM_INCREASE_POLICY,
  NO_UNIVERSAL_FIXED_AMOUNT_POLICY,
  UNIVERSAL_FIXED_AMOUNT_CONTRACT_VERSION,
} from "../domain/compensationCalculation";
import { executeCampaignSimulation } from "../application/campaignSimulation/executeCampaignSimulation";
import { buildSimulationSourceFingerprint } from "../application/campaignSimulation/buildSimulationSourceFingerprint";
import { buildConfigurationFingerprint } from "../application/campaignSimulation/formatExactBudgetDisplay";
import type { CampaignSimulationReadinessPorts } from "../application/campaignSimulation/campaignSimulationModels";
import type { ValidatedCampaignSimulationConfiguration } from "../application/campaignSimulation/simulationConfigurationModels";
import type { Campaign } from "../infrastructure/database/types";

function gridCell(
  familyCode: string,
  gradeCode: string,
  s0Fcfa: number,
): PreparedSalaryGridCell {
  return {
    familyCode,
    gradeCode,
    familyLabel: `Famille ${familyCode}`,
    gradeLabel: `Grade ${gradeCode}`,
    s0Fcfa,
  };
}

function baseReferences(
  overrides: Partial<PopulationCalculationReferences> = {},
): PopulationCalculationReferences {
  return {
    evaluationMode: "performance_potential",
    salaryGrid: [
      gridCell("F1", "G1", 1_000_000),
      gridCell("F1", "G2", 1_200_000),
      gridCell("F2", "G1", 900_000),
    ],
    salaryPositions: DEFAULT_SALARY_POSITIONS.map((p) => ({
      code: p.code,
      label: p.label,
      referenceRatioBps: p.referenceRatioBps,
      positionFactorMilli: p.positionFactorMilli,
    })),
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
    ...overrides,
  };
}

function employeesScenario(): PreparedEmployeeCalculationInput[] {
  return [
    {
      employeeId: "E1",
      familyCode: "F1",
      gradeCode: "G1",
      salaryFcfa: 1_000_000,
      performanceLevel: "high",
      potentialLevel: "medium",
      hireDate: "2020-07-15",
      confirmedUnderperformer: false,
    },
    {
      employeeId: "E2",
      familyCode: "F2",
      gradeCode: "G1",
      salaryFcfa: 900_000,
      performanceLevel: "medium",
      potentialLevel: "high",
      hireDate: "2020-07-15",
      confirmedUnderperformer: false,
    },
    {
      employeeId: "E3",
      familyCode: "F1",
      gradeCode: "G2",
      salaryFcfa: 1_100_000,
      performanceLevel: "low",
      potentialLevel: "low",
      hireDate: "2020-07-15",
      confirmedUnderperformer: true,
    },
  ];
}

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 1,
    name: "Simulation 2027",
    referenceYear: 2027,
    status: "active",
    notes: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
    ...overrides,
  };
}

function makePorts(options: {
  campaign?: Campaign | null;
  employees?: PreparedEmployeeCalculationInput[];
  references?: PopulationCalculationReferences;
  batchId?: number;
}): CampaignSimulationReadinessPorts {
  const campaign = options.campaign === undefined ? makeCampaign() : options.campaign;
  const employees = options.employees ?? employeesScenario();
  const batchId = options.batchId ?? 10;

  return {
    getCampaign: async () => campaign,
    getReferenceSet: async () => {
      throw new Error("unused in mocked readiness path — overridden via spy");
    },
    getCompleteness: async () => {
      throw new Error("unused");
    },
    getCurrentBatch: async () =>
      campaign
        ? {
            id: batchId,
            campaignId: campaign.id,
            status: "current",
            sourceFileName: "pop.xlsx",
            sourceFormat: "xlsx",
            sourceSheetName: "Population",
            fileSizeBytes: 100,
            sourceRowCount: employees.length,
            importedRowCount: employees.length,
            warningCount: 0,
            importedAt: "2026-01-01T00:00:00.000Z",
            createdAt: "2026-01-01T00:00:00.000Z",
          }
        : null,
    listCurrentPopulation: async (_campaignId, query) => ({
      items: employees.map((employee, index) => ({
        id: index + 1,
        importBatchId: batchId,
        campaignId: campaign?.id ?? 1,
        employeeNumber: employee.employeeId,
        employeeLabel: `Salarié ${employee.employeeId}`,
        jobFamilyId: 1,
        gradeId: 1,
        contractType: "cdi",
        employmentStatus: "active",
        hireDate: "2020-01-01",
        decemberBaseSalary:
          typeof employee.salaryFcfa === "bigint"
            ? Number(employee.salaryFcfa)
            : employee.salaryFcfa,
        nineBoxCode: 5,
        confirmedUnderperformer: employee.confirmedUnderperformer,
        neutralizeNineBoxEffect: employee.neutralizeNineBoxEffect === true,
        promotionAmount: 0,
        correctionAmount: 0,
        socialMeasureAmount: 0,
        promotionDate: null,
        salaryBeforePromotion: null,
        salaryAfterPromotion: null,
        previousGradeId: null,
        promotedGradeId: null,
        previousJobFamilyId: null,
        promotedJobFamilyId: null,
        sourceRowNumber: index + 2,
        createdAt: "2026-01-01T00:00:00.000Z",
      })),
      total: employees.length,
      limit: query.limit,
      offset: query.offset,
    }),
  };
}
async function buildValidated(options?: {
  campaign?: Campaign | null;
  employees?: PreparedEmployeeCalculationInput[];
  references?: PopulationCalculationReferences;
  batchId?: number;
  budgetTarget?: ValidatedCampaignSimulationConfiguration["budgetTarget"];
  roundingPolicy?: ValidatedCampaignSimulationConfiguration["roundingPolicy"];
  mutateFingerprint?: boolean;
}): Promise<{
  ports: CampaignSimulationReadinessPorts;
  validated: ValidatedCampaignSimulationConfiguration;
  restoreReadiness: () => void;
}> {
  const employees = options?.employees ?? employeesScenario();
  const references = options?.references ?? baseReferences();
  const campaign =
    options?.campaign === undefined ? makeCampaign() : options.campaign;
  const batchId = options?.batchId ?? 10;
  const budgetTarget = options?.budgetTarget ?? {
    mode: "manual_amount" as const,
    manualBudgetFcfa: 25_000_003n,
  };
  const roundingPolicy = options?.roundingPolicy ?? {
    mode: "nearest_half_up" as const,
    stepFcfa: 100n,
  };

  const ports = makePorts({ campaign, employees, batchId });

  const readinessModule = await import(
    "../application/campaignSimulation/buildCampaignSimulationReadiness"
  );
  const spy = vi
    .spyOn(readinessModule, "buildCampaignSimulationReadiness")
    .mockImplementation(async () => ({
      campaignId: campaign?.id ?? 1,
      campaignName: campaign?.name ?? null,
      campaignStatus: campaign?.status ?? "unknown",
      isReady: Boolean(campaign && campaign.status !== "archived"),
      currentImportBatchId: batchId,
      importedEmployeeCount: employees.length,
      validEmployeeCount: employees.length,
      blockedEmployeeCount: 0,
      evaluationMode: references.evaluationMode,
      nineBoxOrientation: null,
      referenceReadiness: { isReady: true, blockingIssueCount: 0, warningIssueCount: 0 },
      populationReadiness: { isReady: true, blockingIssueCount: 0, warningIssueCount: 0 },
      configurationReadiness: {
        budgetTargetModeSelected: true,
        manualBudgetProvided: true,
        eligiblePayrollProvided: false,
        budgetRateProvided: false,
        roundingPolicyProvided: true,
        isComplete: true,
        missingFields: [],
      },
      issues:
        campaign?.status === "archived"
          ? [
              {
                scope: "campaign" as const,
                code: "CAMPAIGN_ARCHIVED",
                severity: "blocking" as const,
                message: "archivée",
              },
            ]
          : [],
      warnings: [],
      summary: {
        campaignStatus: campaign?.status ?? "unknown",
        employeeCount: employees.length,
        mappedEmployeeCount: employees.length,
        blockingEmployeeCount: 0,
        warningEmployeeCount: 0,
        missingS0Count: 0,
        missingPerformanceCount: 0,
        missingPotentialCount: 0,
        missingUnderperformerStatusCount: 0,
        referenceBlockingIssueCount: 0,
        configurationBlockingIssueCount: 0,
        isReadyForCalculation: Boolean(campaign && campaign.status !== "archived"),
      },
      preparedEmployees: employees,
      preparedReferences: references,
      budgetTarget,
      roundingPolicy,
    }));

  const sourceFingerprint = buildSimulationSourceFingerprint({
    campaignId: campaign?.id ?? 1,
    campaignStatus: campaign?.status ?? "unknown",
    evaluationMode: references.evaluationMode,
    currentImportBatchId: batchId,
    preparedEmployees: employees,
    preparedReferences: references,
    budgetTarget,
    roundingPolicy,
    campaignYear: 2027,
    retroactivityStartMonth: 1,
    technicalApplicationMonth: 1,
    minimumGuaranteeEffectiveMonth: 1,
    minimumIncreasePolicy: NO_MINIMUM_INCREASE_POLICY,
    socialMechanismKind: "none",
    universalFixedAmountPolicy: NO_UNIVERSAL_FIXED_AMOUNT_POLICY,
  });

  const configurationFingerprint = buildConfigurationFingerprint({
    campaignId: campaign?.id ?? 1,
    budgetMode: budgetTarget.mode,
    manualBudget:
      budgetTarget.mode === "manual_amount"
        ? BigInt(budgetTarget.manualBudgetFcfa ?? 0)
        : undefined,
    eligiblePayroll:
      budgetTarget.mode === "percentage_of_eligible_payroll"
        ? BigInt(budgetTarget.eligiblePayrollFcfa ?? 0)
        : undefined,
    budgetRateBps:
      budgetTarget.mode === "percentage_of_eligible_payroll"
        ? BigInt(budgetTarget.budgetRateBasisPoints ?? 0)
        : undefined,
    roundingMode: roundingPolicy.mode,
    roundingStep: BigInt(roundingPolicy.stepFcfa),
    campaignYear: 2027,
    retroactivityStartMonth: 1,
    technicalApplicationMonth: 1,
    minimumGuaranteeEffectiveMonth: 1,
    minimumIncreaseMode: NO_MINIMUM_INCREASE_POLICY.mode,
    minimumMonthlyAmountFcfa:
      NO_MINIMUM_INCREASE_POLICY.minimumMonthlyAmountFcfa,
    minimumIncreaseRateNumerator:
      NO_MINIMUM_INCREASE_POLICY.minimumIncreaseRate?.numerator ?? null,
    minimumIncreaseRateDenominator:
      NO_MINIMUM_INCREASE_POLICY.minimumIncreaseRate?.denominator ?? null,
    minimumIncreaseContractVersion: MINIMUM_INCREASE_CONTRACT_VERSION,
    socialMechanismKind: "none",
    universalFixedAmountMonthlyAmount: null,
    universalFixedAmountEffectiveMonth: null,
    universalFixedAmountMinimumSeniorityMonths: null,
    universalFixedAmountSeniorityReferenceDate: null,
    universalFixedAmountContractVersion: UNIVERSAL_FIXED_AMOUNT_CONTRACT_VERSION,
  });

  const validated: ValidatedCampaignSimulationConfiguration = {
    campaignId: campaign?.id ?? 1,
    budgetTarget,
    roundingPolicy,
    campaignYear: 2027,
    retroactivityStartMonth: 1,
    technicalApplicationMonth: 1,
    minimumGuaranteeEffectiveMonth: 1,
    minimumIncreasePolicy: NO_MINIMUM_INCREASE_POLICY,
    socialMechanismKind: "none",
    universalFixedAmountPolicy: NO_UNIVERSAL_FIXED_AMOUNT_POLICY,
    employerCostPolicy: { kind: "neutral" },
    readinessReport: await readinessModule.buildCampaignSimulationReadiness(
      { campaignId: campaign?.id ?? 1 },
      ports,
    ),
    validatedAtSessionSequence: 1,
    configurationFingerprint: options?.mutateFingerprint
      ? `${configurationFingerprint}|mutated`
      : configurationFingerprint,
    sourceFingerprint: options?.mutateFingerprint
      ? `${sourceFingerprint}|mutated`
      : sourceFingerprint,
  };

  return {
    ports,
    validated,
    restoreReadiness: () => {
      spy.mockRestore();
    },
  };
}

describe("Lot 2B-3 — executeCampaignSimulation", () => {
  it("refuse une configuration non validée (campagne mismatch)", async () => {
    const { ports, validated, restoreReadiness } = await buildValidated();
    const outcome = await executeCampaignSimulation({
      campaignId: 99,
      validatedConfiguration: validated,
      expectedSourceFingerprint: validated.sourceFingerprint,
      ports,
      runSequence: 1,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("SIMULATION_CONFIGURATION_NOT_VALIDATED");
    }
    restoreReadiness();
  });

  it("refuse une campagne introuvable", async () => {
    const { ports, validated, restoreReadiness } = await buildValidated({
      campaign: null,
    });
    // force getCampaign null while keeping validated
    ports.getCampaign = async () => null;
    const outcome = await executeCampaignSimulation({
      campaignId: 1,
      validatedConfiguration: validated,
      expectedSourceFingerprint: validated.sourceFingerprint,
      ports,
      runSequence: 1,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("CAMPAIGN_NOT_FOUND");
    }
    restoreReadiness();
  });

  it("refuse une campagne archivée", async () => {
    const { ports, validated, restoreReadiness } = await buildValidated({
      campaign: makeCampaign({ status: "archived", archivedAt: "2026-01-02T00:00:00.000Z" }),
    });
    const outcome = await executeCampaignSimulation({
      campaignId: 1,
      validatedConfiguration: validated,
      expectedSourceFingerprint: validated.sourceFingerprint,
      ports,
      runSequence: 1,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("CAMPAIGN_ARCHIVED");
    }
    restoreReadiness();
  });

  it("refuse si readiness bloqué", async () => {
    const readinessModule = await import(
      "../application/campaignSimulation/buildCampaignSimulationReadiness"
    );
    const { ports, validated, restoreReadiness } = await buildValidated();
    restoreReadiness();
    const spy = vi
      .spyOn(readinessModule, "buildCampaignSimulationReadiness")
      .mockResolvedValue({
        ...validated.readinessReport,
        isReady: false,
        issues: [
          {
            scope: "references",
            code: "INCOMPLETE_COMPENSATION_REFERENCES",
            severity: "blocking",
            message: "référentiels incomplets",
          },
        ],
        summary: {
          ...validated.readinessReport.summary,
          isReadyForCalculation: false,
        },
      });

    const outcome = await executeCampaignSimulation({
      campaignId: 1,
      validatedConfiguration: validated,
      expectedSourceFingerprint: validated.sourceFingerprint,
      ports,
      runSequence: 1,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("SIMULATION_NOT_READY");
    }
    spy.mockRestore();
  });

  it("détecte un fingerprint stale / sources changées", async () => {
    const { ports, validated, restoreReadiness } = await buildValidated();
    const outcome = await executeCampaignSimulation({
      campaignId: 1,
      validatedConfiguration: validated,
      expectedSourceFingerprint: "stale-fingerprint",
      ports,
      runSequence: 1,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("SIMULATION_INPUTS_CHANGED_AFTER_VALIDATION");
      expect(outcome.message).toMatch(/données ont changé/);
    }
    restoreReadiness();
  });

  it("détecte un lot RH remplacé", async () => {
    const { ports, validated, restoreReadiness } = await buildValidated({
      batchId: 10,
    });
    restoreReadiness();
    const readinessModule = await import(
      "../application/campaignSimulation/buildCampaignSimulationReadiness"
    );
    const employees = employeesScenario();
    const references = baseReferences();
    const spy = vi
      .spyOn(readinessModule, "buildCampaignSimulationReadiness")
      .mockResolvedValue({
        ...validated.readinessReport,
        currentImportBatchId: 99,
        preparedEmployees: employees,
        preparedReferences: references,
      });

    const outcome = await executeCampaignSimulation({
      campaignId: 1,
      validatedConfiguration: validated,
      expectedSourceFingerprint: validated.sourceFingerprint,
      ports,
      runSequence: 1,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("SIMULATION_INPUTS_CHANGED_AFTER_VALIDATION");
    }
    spy.mockRestore();
  });

  it("détecte un référentiel modifié", async () => {
    const { ports, validated, restoreReadiness } = await buildValidated();
    restoreReadiness();
    const readinessModule = await import(
      "../application/campaignSimulation/buildCampaignSimulationReadiness"
    );
    const mutated = baseReferences({
      salaryGrid: [gridCell("F1", "G1", 2_000_000), ...baseReferences().salaryGrid.slice(1)],
    });
    const spy = vi
      .spyOn(readinessModule, "buildCampaignSimulationReadiness")
      .mockResolvedValue({
        ...validated.readinessReport,
        preparedReferences: mutated,
      });
    const outcome = await executeCampaignSimulation({
      campaignId: 1,
      validatedConfiguration: validated,
      expectedSourceFingerprint: validated.sourceFingerprint,
      ports,
      runSequence: 1,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("SIMULATION_INPUTS_CHANGED_AFTER_VALIDATION");
    }
    spy.mockRestore();
  });

  it("détecte budget / pas d’arrondi modifié via fingerprint config", async () => {
    const { ports, validated, restoreReadiness } = await buildValidated({
      mutateFingerprint: true,
    });
    const outcome = await executeCampaignSimulation({
      campaignId: 1,
      validatedConfiguration: validated,
      expectedSourceFingerprint: validated.sourceFingerprint,
      ports,
      runSequence: 1,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("SIMULATION_INPUTS_CHANGED_AFTER_VALIDATION");
    }
    restoreReadiness();
  });

  it("appelle le moteur exactement une fois si sources inchangées", async () => {
    const spy = vi.spyOn(calculation, "calculatePreparedPopulationCompensation");
    const { ports, validated, restoreReadiness } = await buildValidated();
    const outcome = await executeCampaignSimulation({
      campaignId: 1,
      validatedConfiguration: validated,
      expectedSourceFingerprint: validated.sourceFingerprint,
      ports,
      runSequence: 1,
    });
    expect(outcome.ok).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    restoreReadiness();
    spy.mockRestore();
  });

  it("n’appelle jamais le moteur en cas de blocage", async () => {
    const spy = vi.spyOn(calculation, "calculatePreparedPopulationCompensation");
    const { ports, validated, restoreReadiness } = await buildValidated();
    await executeCampaignSimulation({
      campaignId: 1,
      validatedConfiguration: validated,
      expectedSourceFingerprint: "changed",
      ports,
      runSequence: 1,
    });
    expect(spy).not.toHaveBeenCalled();
    restoreReadiness();
    spy.mockRestore();
  });

  it("produit un résultat complet avec monthlyFinalSalaryFcfa exact et sous-performant à 0", async () => {
    const { ports, validated, restoreReadiness } = await buildValidated({
      budgetTarget: { mode: "manual_amount", manualBudgetFcfa: 25_000_003n },
      roundingPolicy: { mode: "nearest_half_up", stepFcfa: 100n },
    });
    const outcome = await executeCampaignSimulation({
      campaignId: 1,
      validatedConfiguration: validated,
      expectedSourceFingerprint: validated.sourceFingerprint,
      ports,
      runSequence: 3,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.employees).toHaveLength(3);
    expect(outcome.result.runSequence).toBe(3);
    for (const employee of outcome.result.employees) {
      expect(employee.monthlyFinalSalaryFcfa).toBe(
        employee.salaryFcfa + employee.monthlyFinalRoundedIncreaseFcfa,
      );
    }
    const under = outcome.result.employees.find((e) => e.employeeId === "E3");
    expect(under?.blockingReason).toBe("CONFIRMED_UNDERPERFORMER");
    expect(under?.monthlyFinalRoundedIncreaseFcfa).toBe(0n);
    expect(outcome.result.populationSummary.confirmedUnderperformerCount).toBe(1);
    restoreReadiness();
  });

  it("mappe une erreur moteur structurée sans résultat partiel", async () => {
    const spy = vi
      .spyOn(calculation, "calculatePreparedPopulationCompensation")
      .mockImplementation(() => {
        throw new calculation.CompensationCalculationError(
          "POPULATION_CALCULATION_FAILED",
          "échec",
          [
            {
              employeeId: "E1",
              code: "INVALID_SALARY",
              message: "salaire invalide",
              field: "salaryFcfa",
            },
          ],
        );
      });
    const { ports, validated, restoreReadiness } = await buildValidated();
    const outcome = await executeCampaignSimulation({
      campaignId: 1,
      validatedConfiguration: validated,
      expectedSourceFingerprint: validated.sourceFingerprint,
      ports,
      runSequence: 1,
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.code).toBe("SIMULATION_ENGINE_FAILED");
      expect(outcome.issues.some((i) => i.employeeId === "E1")).toBe(true);
    }
    restoreReadiness();
    spy.mockRestore();
  });

  it("ne mute pas les entrées et reste déterministe", async () => {
    const { ports, validated, restoreReadiness } = await buildValidated();
    const snapshotEmployees = structuredClone(validated.readinessReport.preparedEmployees);
    const first = await executeCampaignSimulation({
      campaignId: 1,
      validatedConfiguration: validated,
      expectedSourceFingerprint: validated.sourceFingerprint,
      ports,
      runSequence: 1,
    });
    const second = await executeCampaignSimulation({
      campaignId: 1,
      validatedConfiguration: validated,
      expectedSourceFingerprint: validated.sourceFingerprint,
      ports,
      runSequence: 1,
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.result.budgetSummary.annualActualOperationCostFcfa).toBe(
        second.result.budgetSummary.annualActualOperationCostFcfa,
      );
      expect(
        first.result.employees.map((e) => e.monthlyFinalRoundedIncreaseFcfa.toString()),
      ).toEqual(
        second.result.employees.map((e) => e.monthlyFinalRoundedIncreaseFcfa.toString()),
      );
    }
    expect(validated.readinessReport.preparedEmployees).toEqual(snapshotEmployees);
    restoreReadiness();
  });

  it("reste stable si l’ordre d’entrée des salariés change", async () => {
    const ordered = employeesScenario();
    const reversed = [...ordered].reverse();
    const firstPack = await buildValidated({ employees: ordered });
    const secondPack = await buildValidated({ employees: reversed });
    const first = await executeCampaignSimulation({
      campaignId: 1,
      validatedConfiguration: firstPack.validated,
      expectedSourceFingerprint: firstPack.validated.sourceFingerprint,
      ports: firstPack.ports,
      runSequence: 1,
    });
    const second = await executeCampaignSimulation({
      campaignId: 1,
      validatedConfiguration: secondPack.validated,
      expectedSourceFingerprint: secondPack.validated.sourceFingerprint,
      ports: secondPack.ports,
      runSequence: 1,
    });
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      const map = (result: typeof first.result) =>
        Object.fromEntries(
          result.employees.map((e) => [
            e.employeeId,
            e.monthlyFinalRoundedIncreaseFcfa.toString(),
          ]),
        );
      expect(map(first.result)).toEqual(map(second.result));
    }
    firstPack.restoreReadiness();
    secondPack.restoreReadiness();
  });

  it("supporte budget pourcentage fractionnaire et pas personnalisé", async () => {
    const { ports, validated, restoreReadiness } = await buildValidated({
      budgetTarget: {
        mode: "percentage_of_eligible_payroll",
        eligiblePayrollFcfa: 250_623n,
        budgetRateBasisPoints: 400n,
      },
      roundingPolicy: { mode: "nearest_half_up", stepFcfa: 7n },
    });
    const outcome = await executeCampaignSimulation({
      campaignId: 1,
      validatedConfiguration: validated,
      expectedSourceFingerprint: validated.sourceFingerprint,
      ports,
      runSequence: 1,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.result.budgetSummary.budgetTargetMode).toBe(
        "percentage_of_eligible_payroll",
      );
      expect(outcome.result.budgetSummary.roundingStepFcfa).toBe(7n);
    }
    restoreReadiness();
  });

  it("supporte pas 1 et pas 100", async () => {
    for (const step of [1n, 100n]) {
      const pack = await buildValidated({
        roundingPolicy: { mode: "nearest_half_up", stepFcfa: step },
      });
      const outcome = await executeCampaignSimulation({
        campaignId: 1,
        validatedConfiguration: pack.validated,
        expectedSourceFingerprint: pack.validated.sourceFingerprint,
        ports: pack.ports,
        runSequence: 1,
      });
      expect(outcome.ok).toBe(true);
      pack.restoreReadiness();
    }
  });

  it("ignore l’orientation 9-Box (hors clé de calcul)", async () => {
    const { ports, validated, restoreReadiness } = await buildValidated();
    // orientation n’est pas dans le fingerprint ni le moteur
    const outcome = await executeCampaignSimulation({
      campaignId: 1,
      validatedConfiguration: validated,
      expectedSourceFingerprint: validated.sourceFingerprint,
      ports,
      runSequence: 1,
    });
    expect(outcome.ok).toBe(true);
    restoreReadiness();
  });

  it("gère de gros montants BigInt", async () => {
    const bigEmployees: PreparedEmployeeCalculationInput[] = [
      {
        employeeId: "BIG-1",
        familyCode: "F1",
        gradeCode: "G1",
        salaryFcfa: 9_000_000_000_000n,
        performanceLevel: "high",
        potentialLevel: "high",
        hireDate: "2020-07-15",
        confirmedUnderperformer: false,
      },
    ];
    const { ports, validated, restoreReadiness } = await buildValidated({
      employees: bigEmployees,
      references: baseReferences({
        salaryGrid: [gridCell("F1", "G1", 8_000_000_000_000)],
      }),
      budgetTarget: {
        mode: "manual_amount",
        manualBudgetFcfa: 1_000_000_000n,
      },
    });
    const outcome = await executeCampaignSimulation({
      campaignId: 1,
      validatedConfiguration: validated,
      expectedSourceFingerprint: validated.sourceFingerprint,
      ports,
      runSequence: 1,
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      const employee = outcome.result.employees[0];
      expect(employee.monthlyFinalSalaryFcfa).toBe(
        employee.salaryFcfa + employee.monthlyFinalRoundedIncreaseFcfa,
      );
    }
    restoreReadiness();
  });
});
