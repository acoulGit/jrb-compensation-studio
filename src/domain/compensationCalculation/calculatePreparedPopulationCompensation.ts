/**
 * Orchestrateur end-to-end population préparée (Lot 2A-4 / correctif 2A-H1 /
 * Lot 2A-H2C-2 — moteur budget promotion + calibrage compensatoire).
 *
 * Pipeline H2C-2 :
 * 1. valider structurellement + résoudre le budget ANNUEL + valider le
 *    calendrier d'application (inchangé) ;
 * 2. préparer chaque salarié (snapshot décembre — position, évaluation,
 *    poids matriciel) via `calculatePreparedEmployeeCompensation`,
 *    conservé pour compatibilité d'affichage ;
 * 3. construire, pour chaque salarié, la trajectoire mensuelle consciente
 *    des promotions (12 expositions salaire/facteur/décalage) ;
 * 4. sommer le coût annuel de promotion imputable (population budget
 *    promotion uniquement) ; si ce coût dépasse le budget annuel cible,
 *    échec explicite ;
 * 5. résoudre le taux unique de calibrage compensatoire sur l'enveloppe
 *    disponible restante (budget annuel − coût promotion imputable) ;
 * 6. finaliser chaque salarié : compléments mensuels arrondis, salaire
 *    final mensuel, incidence d'ancienneté ventilée promotion/compensatoire.
 *
 * Parité stricte : en l'absence de toute promotion structurée dans la
 * population, l'arithmétique rationnelle exacte garantit des résultats
 * bit-à-bit identiques à l'ancien moteur (Lot 2A-H1).
 *
 * Atomicité fonctionnelle : aucune simulation partielle réussie si une erreur.
 */

import { technicalApplicationMonthLabelFr, validateApplicationCalendar } from "./baseSalaryReminder";
import {
  computeCampaignPeriodBreakdown,
  FULL_YEAR_MONTH_COUNT,
} from "./campaignPeriod";
import { calculatePreparedEmployeeCompensation } from "./calculatePreparedEmployeeCompensation";
import { CompensationCalculationError } from "./errors";
import {
  addFractions,
  compareFractions,
  divideFractions,
  exactAmountFromInteger,
  formatExactAmount,
  fractionsEqual,
  isZeroFraction,
  multiplyFractions,
  subtractFractions,
  type ExactAmount,
} from "./exactFraction";
import type { CalculationExplanationStep } from "./models";
import {
  NO_MINIMUM_INCREASE_POLICY,
  validateMinimumIncreasePolicy,
} from "./minimumIncrease";
import { resolveNineBoxTreatmentKind } from "./nineBoxTreatment";
import {
  deriveSocialMechanismKindFromMinimumIncreaseMode,
  isSocialMechanismKind,
  type SocialMechanismKind,
} from "./socialMechanism";
import {
  computeUniversalFixedAmountForMonth,
  NO_UNIVERSAL_FIXED_AMOUNT_POLICY,
  validateUniversalFixedAmountPolicy,
} from "./universalFixedAmount";
import {
  buildEmployeePromotionAwareExposures,
  finalizeEmployeePromotionAwareCompensation,
  type EmployeePromotionAwareExposureResult,
} from "./promotionAwareEmployeeCompensation";
import {
  solvePromotionAwareCompensatoryCalibrationRate,
  sumPromotionAnnualBudgetCostFcfa,
  type PromotionCompensatoryExposure,
} from "./promotionCompensatoryCalibration";
import { PromotionValidationError } from "./promotionTrajectory";
import type {
  EmployeeCompensationCalculationResult,
  PopulationCalculationIssue,
  PopulationCalculationSummary,
  PreparedEmployeeCalculationInput,
  PreparedEmployeeCalculationResult,
  PreparedPopulationCalculationInput,
  PreparedPopulationCalculationResult,
} from "./preparedPopulationModels";
import {
  ALLOCATION_BASIS_SALARY_TIMES_MATRIX_WEIGHT,
  compareEmployeeIdAsc,
} from "./preparedPopulationModels";
import { resolveBudgetTarget } from "./resolveBudgetTarget";
import {
  toIssueLikes,
  validatePreparedPopulationCalculationInput,
} from "./validatePreparedPopulationCalculationInput";

const ZERO: ExactAmount = exactAmountFromInteger(0n);

function wrapEmployeeError(
  employeeId: string,
  error: unknown,
  step: string,
): PopulationCalculationIssue {
  if (error instanceof CompensationCalculationError) {
    return {
      employeeId,
      code: error.code,
      message: error.message,
      step,
      details: { sourceCode: error.code },
    };
  }
  if (error instanceof PromotionValidationError) {
    return {
      employeeId,
      code: error.code,
      message: error.message,
      step,
      details: { sourceCode: error.code },
    };
  }
  return {
    employeeId,
    code: "EMPLOYEE_CALCULATION_FAILED",
    message: error instanceof Error ? error.message : "Erreur salarié inconnue.",
    step,
  };
}

/** Parse minimal du pas d'arrondi (mêmes règles que `roundPopulationAllocations`). */
function parseRoundingStepFcfa(policy: PreparedPopulationCalculationInput["roundingPolicy"]): bigint {
  const raw = policy.stepFcfa;
  if (typeof raw === "bigint") {
    if (raw <= 0n) {
      throw new CompensationCalculationError(
        "INVALID_ROUNDING_STEP",
        "Le pas d'arrondi doit être un entier FCFA strictement positif.",
      );
    }
    return raw;
  }
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw <= 0) {
    throw new CompensationCalculationError(
      "INVALID_ROUNDING_STEP",
      "Le pas d'arrondi doit être un entier FCFA strictement positif.",
    );
  }
  return BigInt(raw);
}

export function calculatePreparedPopulationCompensation(
  input: PreparedPopulationCalculationInput,
): PreparedPopulationCalculationResult {
  const validation = validatePreparedPopulationCalculationInput(input);
  const issues: PopulationCalculationIssue[] = [...validation.issues];

  let budgetTargetResult;
  const retroactivityStartMonth = input.retroactivityStartMonth ?? 1;
  let campaignPeriod;
  const minimumGuaranteeEffectiveMonth =
    input.minimumGuaranteeEffectiveMonth ?? input.technicalApplicationMonth;
  try {
    campaignPeriod = computeCampaignPeriodBreakdown({
      campaignYear: input.campaignYear,
      retroactivityStartMonth,
      technicalApplicationMonth: input.technicalApplicationMonth,
    });
  } catch (error) {
    if (error instanceof CompensationCalculationError) {
      issues.push({
        code: error.code,
        message: error.message,
        step: "application_calendar",
      });
    } else {
      issues.push({
        code: "APPLICATION_CALENDAR_INVARIANT_FAILED",
        message: "Calendrier d’application invalide.",
        step: "application_calendar",
      });
    }
  }

  if (
    !Number.isInteger(minimumGuaranteeEffectiveMonth) ||
    minimumGuaranteeEffectiveMonth < 1 ||
    minimumGuaranteeEffectiveMonth > 12
  ) {
    issues.push({
      code: "INVALID_MINIMUM_GUARANTEE_EFFECTIVE_MONTH",
      message:
        "Le mois d’effet du minimum garanti doit être compris entre janvier et décembre.",
      field: "minimumGuaranteeEffectiveMonth",
      step: "application_calendar",
    });
  }

  try {
    if (validation.isValid && campaignPeriod) {
      budgetTargetResult = resolveBudgetTarget(input.budgetTarget, {
        campaignCoveredMonthCount: campaignPeriod.campaignCoveredMonthCount,
      });
    }
  } catch (error) {
    if (error instanceof CompensationCalculationError) {
      issues.push({
        code: error.code,
        message: error.message,
        step: "resolve_budget_target",
      });
    } else {
      issues.push({
        code: "INVALID_BUDGET_TARGET",
        message: "Échec de résolution du budget cible.",
        step: "resolve_budget_target",
      });
    }
  }

  const preparedEmployees: PreparedEmployeeCalculationResult[] = [];
  if (issues.length === 0) {
    for (const employee of input.employees) {
      try {
        preparedEmployees.push(
          calculatePreparedEmployeeCompensation(employee, input.references),
        );
      } catch (error) {
        issues.push(
          wrapEmployeeError(employee.employeeId, error, "employee_calculation"),
        );
      }
    }
  }

  if (issues.length > 0) {
    throw new CompensationCalculationError(
      "POPULATION_CALCULATION_FAILED",
      "Le calcul de population a échoué ; aucun résultat global valide.",
      toIssueLikes(issues),
    );
  }

  if (!budgetTargetResult) {
    throw new CompensationCalculationError(
      "POPULATION_CALCULATION_FAILED",
      "Budget cible introuvable après validation.",
    );
  }

  if (!campaignPeriod) {
    throw new CompensationCalculationError(
      "POPULATION_CALCULATION_FAILED",
      "Période de campagne introuvable après validation.",
    );
  }

  try {
    validateApplicationCalendar({
      campaignYear: input.campaignYear,
      technicalApplicationMonth: input.technicalApplicationMonth,
      retroactivityStartMonth,
    });
  } catch (error) {
    if (error instanceof CompensationCalculationError) {
      throw new CompensationCalculationError(
        "POPULATION_CALCULATION_FAILED",
        error.message,
        toIssueLikes([
          {
            code: error.code,
            message: error.message,
            step: "application_calendar",
          },
        ]),
      );
    }
    throw error;
  }

  const stepFcfa = parseRoundingStepFcfa(input.roundingPolicy);
  const annualBudgetTarget = budgetTargetResult.exactAmount;
  const campaignCoveredMonthsExact = exactAmountFromInteger(
    BigInt(campaignPeriod.campaignCoveredMonthCount),
  );

  const minimumIncreasePolicy =
    input.minimumIncreasePolicy ?? NO_MINIMUM_INCREASE_POLICY;
  try {
    validateMinimumIncreasePolicy(minimumIncreasePolicy);
  } catch (error) {
    if (error instanceof CompensationCalculationError) {
      throw new CompensationCalculationError(
        "POPULATION_CALCULATION_FAILED",
        error.message,
        toIssueLikes([
          {
            code: error.code,
            message: error.message,
            step: "minimum_increase_policy",
          },
        ]),
      );
    }
    throw error;
  }

  const socialMechanismKind: SocialMechanismKind =
    input.socialMechanismKind ??
    deriveSocialMechanismKindFromMinimumIncreaseMode(minimumIncreasePolicy.mode);

  if (
    input.socialMechanismKind !== undefined &&
    !isSocialMechanismKind(input.socialMechanismKind)
  ) {
    throw new CompensationCalculationError(
      "POPULATION_CALCULATION_FAILED",
      `Mécanisme social non supporté : ${String(input.socialMechanismKind)}.`,
      toIssueLikes([
        {
          code: "UNSUPPORTED_SOCIAL_MECHANISM_KIND",
          message: `Mécanisme social non supporté : ${String(input.socialMechanismKind)}.`,
          step: "social_mechanism",
        },
      ]),
    );
  }

  const universalFixedAmountPolicy =
    socialMechanismKind === "universal_fixed_amount"
      ? (input.universalFixedAmountPolicy ?? NO_UNIVERSAL_FIXED_AMOUNT_POLICY)
      : NO_UNIVERSAL_FIXED_AMOUNT_POLICY;

  if (socialMechanismKind === "universal_fixed_amount") {
    if (minimumIncreasePolicy.mode !== "none") {
      throw new CompensationCalculationError(
        "POPULATION_CALCULATION_FAILED",
        "Le forfait social universel exige une politique de minimum garanti inactive (mode none).",
        toIssueLikes([
          {
            code: "INVALID_SOCIAL_MECHANISM_CONFIGURATION",
            message:
              "Le forfait social universel exige une politique de minimum garanti inactive (mode none).",
            step: "social_mechanism",
          },
        ]),
      );
    }
    try {
      validateUniversalFixedAmountPolicy(universalFixedAmountPolicy);
    } catch (error) {
      if (error instanceof CompensationCalculationError) {
        throw new CompensationCalculationError(
          "POPULATION_CALCULATION_FAILED",
          error.message,
          toIssueLikes([
            {
              code: error.code,
              message: error.message,
              step: "universal_fixed_amount_policy",
            },
          ]),
        );
      }
      throw error;
    }
  } else if (socialMechanismKind === "minimum_guaranteed") {
    if (minimumIncreasePolicy.mode === "none") {
      throw new CompensationCalculationError(
        "POPULATION_CALCULATION_FAILED",
        "Le minimum garanti exige une politique de minimum active.",
        toIssueLikes([
          {
            code: "INVALID_SOCIAL_MECHANISM_CONFIGURATION",
            message: "Le minimum garanti exige une politique de minimum active.",
            step: "social_mechanism",
          },
        ]),
      );
    }
  } else if (minimumIncreasePolicy.mode !== "none") {
    throw new CompensationCalculationError(
      "POPULATION_CALCULATION_FAILED",
      "Aucun mécanisme social actif : la politique de minimum doit être inactive.",
      toIssueLikes([
        {
          code: "INVALID_SOCIAL_MECHANISM_CONFIGURATION",
          message:
            "Aucun mécanisme social actif : la politique de minimum doit être inactive.",
          step: "social_mechanism",
        },
      ]),
    );
  }

  // Tri déterministe non mutable
  const sortedPrepared = [...preparedEmployees].sort((left, right) =>
    compareEmployeeIdAsc(left.employeeId, right.employeeId),
  );

  const rawEmployeeById = new Map<string, PreparedEmployeeCalculationInput>(
    input.employees.map((employee) => [employee.employeeId, employee]),
  );

  let totalAllocationWeight: ExactAmount = ZERO;
  for (const employee of sortedPrepared) {
    totalAllocationWeight = addFractions(totalAllocationWeight, employee.allocationWeight);
  }

  // Étape 3 — expositions mensuelles conscientes des promotions.
  const exposuresByEmployeeId = new Map<string, EmployeePromotionAwareExposureResult>();
  const exposureIssues: PopulationCalculationIssue[] = [];
  for (const prepared of sortedPrepared) {
    const raw = rawEmployeeById.get(prepared.employeeId)!;
    try {
      const exposures = buildEmployeePromotionAwareExposures({
        employeeId: prepared.employeeId,
        hireDate: prepared.hireDate,
        decemberBaseSalaryFcfa: prepared.salaryFcfa,
        currentGradeCode: prepared.gradeCode,
        currentJobFamilyCode: prepared.familyCode,
        promotion: raw.promotion ?? null,
        employmentStatus: raw.employmentStatus ?? null,
        contractType: raw.contractType ?? null,
        // Override uniquement si forcé à false (tests) ; sinon prédicat documenté.
        compensatoryMeasureEligible:
          raw.compensatoryMeasureEligible === false ? false : undefined,
        confirmedUnderperformer: raw.confirmedUnderperformer,
        performanceLevel: raw.performanceLevel,
        potentialLevel: raw.potentialLevel,
        neutralizeNineBoxEffect: raw.neutralizeNineBoxEffect === true,
        nineBoxConfirmationFactorMilli:
          input.references.nineBoxConfirmationFactorMilli,
        campaignYear: input.campaignYear,
        technicalApplicationMonth: input.technicalApplicationMonth,
        retroactivityStartMonth,
        minimumGuaranteeEffectiveMonth,
        evaluationMode: input.references.evaluationMode,
        salaryGrid: input.references.salaryGrid,
        salaryPositions: input.references.salaryPositions,
        performanceFactors: input.references.performanceFactors,
        potentialFactors: input.references.potentialFactors,
        nineBoxFactors: input.references.nineBoxFactors,
        minimumIncreasePolicy,
        socialMechanismKind,
        universalFixedAmountPolicy,
        roundingStepFcfa: stepFcfa,
      });
      exposuresByEmployeeId.set(prepared.employeeId, exposures);
    } catch (error) {
      exposureIssues.push(
        wrapEmployeeError(prepared.employeeId, error, "promotion_exposure"),
      );
    }
  }

  if (exposureIssues.length > 0) {
    throw new CompensationCalculationError(
      "POPULATION_CALCULATION_FAILED",
      "Le calcul des trajectoires de promotion a échoué ; aucun résultat global valide.",
      toIssueLikes(exposureIssues),
    );
  }

  // Étape 4 — coût annuel de promotion imputable (population budget promotion).
  const totalAnnualPromotionBudgetCostFcfa = sumPromotionAnnualBudgetCostFcfa(
    [...exposuresByEmployeeId.values()].map((exposures) => ({
      costPreview: exposures.costPreview,
      isPromotionBudgetPopulationEmployee: exposures.isPromotionBudgetPopulationEmployee,
    })),
  );

  if (
    compareFractions(
      exactAmountFromInteger(totalAnnualPromotionBudgetCostFcfa),
      annualBudgetTarget,
    ) > 0
  ) {
    const overrun = subtractFractions(
      exactAmountFromInteger(totalAnnualPromotionBudgetCostFcfa),
      annualBudgetTarget,
    );
    throw new CompensationCalculationError(
      "PROMOTION_COST_EXCEEDS_BUDGET",
      "Le coût annuel des promotions incluses dépasse l'enveloppe disponible. Augmentez le budget ou revoyez la population de la campagne.",
      toIssueLikes([
        {
          code: "PROMOTION_COST_EXCEEDS_BUDGET",
          message:
            "Le coût annuel des promotions incluses dépasse l'enveloppe disponible. Augmentez le budget ou revoyez la population de la campagne.",
          step: "promotion_budget_check",
          details: {
            annualBudgetTargetFcfa: formatExactAmount(annualBudgetTarget),
            totalAnnualPromotionBudgetCostFcfa: totalAnnualPromotionBudgetCostFcfa.toString(),
            overrunFcfa: formatExactAmount(overrun),
          },
        },
      ]),
    );
  }

  // Étape 5 — enveloppe compensatoire disponible + coûts sociaux prioritaires + taux unique.
  const availableAnnualCompensatoryBudget = subtractFractions(
    annualBudgetTarget,
    exactAmountFromInteger(totalAnnualPromotionBudgetCostFcfa),
  );

  let totalMinimumComplementFloorCostFcfa = 0n;
  let minimumIncreasePopulationEmployeeCount = 0;
  let minimumIncreaseExposureCount = 0;
  let totalUniversalFixedAmountCostFcfa = 0n;
  let universalFixedAmountEligibleEmployeeCount = 0;
  let universalFixedAmountExposureCount = 0;

  if (socialMechanismKind === "minimum_guaranteed") {
    for (const exposures of exposuresByEmployeeId.values()) {
      if (exposures.isMinimumIncreasePopulationEmployee) {
        minimumIncreasePopulationEmployeeCount += 1;
      }
      for (const month of exposures.months) {
        if (month.month < retroactivityStartMonth) {
          continue;
        }
        const floor = month.minimumComplementFloorFcfa ?? 0n;
        totalMinimumComplementFloorCostFcfa += floor;
        if (floor > 0n) {
          minimumIncreaseExposureCount += 1;
        }
      }
    }

    if (
      compareFractions(
        exactAmountFromInteger(
          totalAnnualPromotionBudgetCostFcfa + totalMinimumComplementFloorCostFcfa,
        ),
        annualBudgetTarget,
      ) > 0
    ) {
      const overrun = subtractFractions(
        exactAmountFromInteger(
          totalAnnualPromotionBudgetCostFcfa + totalMinimumComplementFloorCostFcfa,
        ),
        annualBudgetTarget,
      );
      throw new CompensationCalculationError(
        "MINIMUM_GUARANTEE_EXCEEDS_BUDGET",
        "L’enveloppe ne permet pas de financer les promotions et le minimum garanti.",
        toIssueLikes([
          {
            code: "MINIMUM_GUARANTEE_EXCEEDS_BUDGET",
            message:
              "L’enveloppe ne permet pas de financer les promotions et le minimum garanti.",
            step: "minimum_guarantee_budget_check",
            details: {
              annualBudgetTargetFcfa: formatExactAmount(annualBudgetTarget),
              totalAnnualPromotionBudgetCostFcfa:
                totalAnnualPromotionBudgetCostFcfa.toString(),
              totalMinimumComplementFloorCostFcfa:
                totalMinimumComplementFloorCostFcfa.toString(),
              overrunFcfa: formatExactAmount(overrun),
              minimumIncreasePopulationEmployeeCount,
              minimumIncreaseExposureCount,
            },
          },
        ]),
      );
    }
  } else if (socialMechanismKind === "universal_fixed_amount") {
    const eligibleEmployeeIds = new Set<string>();
    for (const [employeeId, exposures] of exposuresByEmployeeId) {
      if (exposures.isUniversalFixedAmountEligible) {
        eligibleEmployeeIds.add(employeeId);
      }
      for (const month of exposures.months) {
        if (month.month < retroactivityStartMonth) {
          continue;
        }
        const forfait = computeUniversalFixedAmountForMonth({
          policy: universalFixedAmountPolicy,
          isEligible: exposures.isUniversalFixedAmountEligible,
          month: month.month,
          retroactivityStartMonth,
          isActive: true,
        });
        totalUniversalFixedAmountCostFcfa += forfait;
        if (forfait > 0n) {
          universalFixedAmountExposureCount += 1;
        }
      }
    }
    universalFixedAmountEligibleEmployeeCount = eligibleEmployeeIds.size;

    if (
      compareFractions(
        exactAmountFromInteger(
          totalAnnualPromotionBudgetCostFcfa + totalUniversalFixedAmountCostFcfa,
        ),
        annualBudgetTarget,
      ) > 0
    ) {
      const overrun = subtractFractions(
        exactAmountFromInteger(
          totalAnnualPromotionBudgetCostFcfa + totalUniversalFixedAmountCostFcfa,
        ),
        annualBudgetTarget,
      );
      throw new CompensationCalculationError(
        "UNIVERSAL_FIXED_AMOUNT_EXCEEDS_BUDGET",
        "L’enveloppe ne permet pas de financer les promotions et le forfait social universel.",
        toIssueLikes([
          {
            code: "UNIVERSAL_FIXED_AMOUNT_EXCEEDS_BUDGET",
            message:
              "L’enveloppe ne permet pas de financer les promotions et le forfait social universel.",
            step: "universal_fixed_amount_budget_check",
            details: {
              annualBudgetTargetFcfa: formatExactAmount(annualBudgetTarget),
              totalAnnualPromotionBudgetCostFcfa:
                totalAnnualPromotionBudgetCostFcfa.toString(),
              totalUniversalFixedAmountCostFcfa:
                totalUniversalFixedAmountCostFcfa.toString(),
              overrunFcfa: formatExactAmount(overrun),
              universalFixedAmountEligibleEmployeeCount,
              universalFixedAmountExposureCount,
            },
          },
        ]),
      );
    }
  }

  const prioritySocialCostFcfa =
    socialMechanismKind === "universal_fixed_amount"
      ? totalUniversalFixedAmountCostFcfa
      : totalMinimumComplementFloorCostFcfa;

  const availableBudgetAfterPromotionsAndMinimumFcfa = subtractFractions(
    availableAnnualCompensatoryBudget,
    exactAmountFromInteger(totalMinimumComplementFloorCostFcfa),
  );
  const availableBudgetAfterPromotionsAndSocialMechanismFcfa = subtractFractions(
    availableAnnualCompensatoryBudget,
    exactAmountFromInteger(prioritySocialCostFcfa),
  );

  const solverAvailableBudget =
    socialMechanismKind === "universal_fixed_amount"
      ? availableBudgetAfterPromotionsAndSocialMechanismFcfa
      : availableAnnualCompensatoryBudget;

  const calibrationExposures: PromotionCompensatoryExposure[] = [];
  for (const [employeeId, exposures] of exposuresByEmployeeId) {
    for (const month of exposures.months) {
      if (month.month < retroactivityStartMonth) {
        continue;
      }
      calibrationExposures.push({
        employeeId,
        month: month.month,
        salary: month.baseSalaryFcfa,
        factor: month.effectiveCompensationFactor,
        promotionRateOffset: month.promotionRateOffset,
        minimumComplementFloorFcfa: month.minimumComplementFloorFcfa ?? 0n,
      });
    }
  }

  let compensatoryCalibrationRate: ExactAmount;
  try {
    compensatoryCalibrationRate = solvePromotionAwareCompensatoryCalibrationRate({
      availableBudget: solverAvailableBudget,
      exposures: calibrationExposures,
    });
  } catch (error) {
    if (error instanceof CompensationCalculationError) {
      if (error.code === "MINIMUM_GUARANTEE_EXCEEDS_BUDGET") {
        const overrun = subtractFractions(
          exactAmountFromInteger(
            totalAnnualPromotionBudgetCostFcfa +
              totalMinimumComplementFloorCostFcfa,
          ),
          annualBudgetTarget,
        );
        throw new CompensationCalculationError(
          "MINIMUM_GUARANTEE_EXCEEDS_BUDGET",
          "L’enveloppe ne permet pas de financer les promotions et le minimum garanti.",
          toIssueLikes([
            {
              code: "MINIMUM_GUARANTEE_EXCEEDS_BUDGET",
              message:
                "L’enveloppe ne permet pas de financer les promotions et le minimum garanti.",
              step: "compensatory_calibration",
              details: {
                annualBudgetTargetFcfa: formatExactAmount(annualBudgetTarget),
                totalAnnualPromotionBudgetCostFcfa:
                  totalAnnualPromotionBudgetCostFcfa.toString(),
                totalMinimumComplementFloorCostFcfa:
                  totalMinimumComplementFloorCostFcfa.toString(),
                overrunFcfa: formatExactAmount(overrun),
                minimumIncreasePopulationEmployeeCount,
                minimumIncreaseExposureCount,
              },
            },
          ]),
        );
      }
      if (error.code === "NO_COMPENSATORY_ALLOCATION_CAPACITY") {
        // Forfait seul sur une population sans capacité matricielle (ex. tous
        // sous-performants / non éligibles matrice) : le reliquat ne peut pas
        // être alloué — taux 0, forfait conservé, pas d’échec trompeur.
        if (socialMechanismKind === "universal_fixed_amount") {
          compensatoryCalibrationRate = exactAmountFromInteger(0n);
        } else {
          const eligibleExposureCount = calibrationExposures.filter(
            (exposure) => !isZeroFraction(exposure.factor),
          ).length;
          const message =
            "Un budget reste disponible après promotions et minimum garanti, mais aucune exposition ne présente de capacité d’allocation positive au-dessus du plancher. Réduisez l’enveloppe disponible ou revoyez la population et les règles d’éligibilité.";
          throw new CompensationCalculationError(
            "NO_COMPENSATORY_ALLOCATION_CAPACITY",
            message,
            toIssueLikes([
              {
                code: "NO_COMPENSATORY_ALLOCATION_CAPACITY",
                message,
                step: "compensatory_calibration",
                details: {
                  annualBudgetTargetFcfa: formatExactAmount(annualBudgetTarget),
                  totalAnnualPromotionBudgetCostFcfa:
                    totalAnnualPromotionBudgetCostFcfa.toString(),
                  totalMinimumComplementFloorCostFcfa:
                    totalMinimumComplementFloorCostFcfa.toString(),
                  availableAnnualCompensatoryBudgetFcfa: formatExactAmount(
                    availableAnnualCompensatoryBudget,
                  ),
                  availableBudgetAfterPromotionsAndMinimumFcfa:
                    formatExactAmount(
                      availableBudgetAfterPromotionsAndMinimumFcfa,
                    ),
                  eligibleExposureCount,
                },
              },
            ]),
          );
        }
      } else {
        // Conserver le code métier d’origine.
        throw error;
      }
    } else {
      throw new CompensationCalculationError(
        "POPULATION_CALCULATION_FAILED",
        error instanceof Error
          ? error.message
          : "Échec inattendu du calibrage compensatoire.",
        toIssueLikes([
          {
            code: "POPULATION_CALCULATION_FAILED",
            message:
              error instanceof Error
                ? error.message
                : "Échec inattendu du calibrage compensatoire.",
            step: "compensatory_calibration",
          },
        ]),
      );
    }
  }

  const calibrationCoefficient = multiplyFractions(
    compensatoryCalibrationRate,
    campaignCoveredMonthsExact,
  );

  // Étape 6 — finalisation par salarié.
  const finalizeIssues: PopulationCalculationIssue[] = [];
  const employees: EmployeeCompensationCalculationResult[] = [];

  for (const prepared of sortedPrepared) {
    const raw = rawEmployeeById.get(prepared.employeeId)!;
    const exposures = exposuresByEmployeeId.get(prepared.employeeId)!;

    let finalized;
    try {
      finalized = finalizeEmployeePromotionAwareCompensation({
        employeeId: prepared.employeeId,
        hireDate: prepared.hireDate,
        campaignYear: input.campaignYear,
        technicalApplicationMonth: input.technicalApplicationMonth,
        retroactivityStartMonth,
        minimumGuaranteeEffectiveMonth,
        months: exposures.months,
        calibrationRate: compensatoryCalibrationRate,
        roundingPolicy: { mode: "nearest_half_up", stepFcfa },
        costPreview: exposures.costPreview,
        isPromotionBudgetPopulationEmployee:
          exposures.isPromotionBudgetPopulationEmployee,
        minimumIncreasePolicy,
        isMinimumIncreasePopulationEmployee:
          exposures.isMinimumIncreasePopulationEmployee,
        socialMechanismKind,
        universalFixedAmountPolicy,
        isUniversalFixedAmountEligible: exposures.isUniversalFixedAmountEligible,
      });
    } catch (error) {
      finalizeIssues.push(wrapEmployeeError(prepared.employeeId, error, "finalize_compensation"));
      continue;
    }

    const decemberEntry = finalized.monthlyCompensationTrajectory.find(
      (entry) => entry.month === 12,
    )!;

    const monthlyTheoreticalIncrease = decemberEntry.theoreticalCompensatoryComplement;
    const monthlyFinalRoundedIncreaseFcfa = decemberEntry.roundedCompensatoryComplementFcfa;
    const monthlyRoundingDelta = subtractFractions(
      exactAmountFromInteger(monthlyFinalRoundedIncreaseFcfa),
      monthlyTheoreticalIncrease,
    );
    const monthlyTheoreticalIncreaseRate =
      decemberEntry.baseSalaryFcfa === 0n || isZeroFraction(monthlyTheoreticalIncrease)
        ? ZERO
        : divideFractions(
            monthlyTheoreticalIncrease,
            exactAmountFromInteger(decemberEntry.baseSalaryFcfa),
          );

    const annualTheoreticalAllocation = finalized.annualTheoreticalCompensatoryAllocation;
    const annualActualCostFcfa = finalized.annualActualCompensatoryCostFcfa;
    const annualRoundingDelta = subtractFractions(
      exactAmountFromInteger(annualActualCostFcfa),
      annualTheoreticalAllocation,
    );

    const retroactiveMonths = campaignPeriod.reminderMonthCount;
    const remainingDirectPaymentMonths = campaignPeriod.directPaymentMonthCount;

    const combinedAnnualActualCostFcfa =
      annualActualCostFcfa + finalized.annualPromotionBudgetCostFcfa;

    const employeeSteps: CalculationExplanationStep[] = [
      ...prepared.explanationSteps,
      {
        code: "EMPLOYEE_PROMOTION_INCLUSION",
        label: "Inclusion de la promotion structurée",
        inputValues: {
          hasPromotion: raw.promotion !== null && raw.promotion !== undefined,
          promotionYear: exposures.promotionYear,
          promotionMonth: exposures.promotionMonth,
          includedInSimulation: exposures.costPreview.includedInSimulation,
          exclusionReason: exposures.costPreview.exclusionReason,
        },
        outputValue: exposures.costPreview.promotionCampaignCostFcfa.toString(),
        formula: "buildPromotionAwareMonthlySalaryTrajectory",
        reason:
          "Une promotion N-1 est active toute l'année ; une promotion N est active à partir de son mois d'effet si celui-ci n'excède pas le mois d'application technique.",
      },
      {
        code: "EMPLOYEE_COMPENSATORY_CALIBRATION_RATE",
        label: "Taux de calibrage compensatoire",
        inputValues: {
          compensatoryCalibrationRate: formatExactAmount(compensatoryCalibrationRate),
          availableAnnualCompensatoryBudget: formatExactAmount(
            availableAnnualCompensatoryBudget,
          ),
        },
        outputValue: formatExactAmount(compensatoryCalibrationRate),
        formula:
          "Σ salaire×max(0, taux×facteur − décalagePromotion) = budget compensatoire disponible",
        reason: "Taux unique résolu sur l'ensemble des expositions mensuelles de la population.",
      },
      {
        code: "EMPLOYEE_MONTHLY_COMPENSATORY_COMPLEMENT",
        label: "Complément compensatoire mensuel (décembre)",
        inputValues: {
          targetCompensatoryRate: formatExactAmount(decemberEntry.targetCompensatoryRate),
          promotionRateOffset: formatExactAmount(decemberEntry.promotionRateOffset),
        },
        outputValue: formatExactAmount(monthlyTheoreticalIncrease),
        formula:
          "complément = salaire × max(0, calibrationRate×facteurEffectif − décalagePromotion)",
        reason: "Le décalage neutralise la part de taux déjà consommée par une promotion incluse.",
      },
      {
        code: "EMPLOYEE_MONTHLY_FINAL_ROUNDED",
        label: "Complément compensatoire mensuel arrondi (décembre)",
        inputValues: {
          monthlyTheoreticalIncrease: formatExactAmount(monthlyTheoreticalIncrease),
          stepFcfa: stepFcfa.toString(),
        },
        outputValue: monthlyFinalRoundedIncreaseFcfa.toString(),
        formula: "round(theoreticalCompensatoryComplement, roundingPolicy)",
        reason: "Arrondi appliqué mois par mois (pas d'arrondi annuel préalable).",
      },
      {
        code: "EMPLOYEE_ANNUAL_ACTUAL_COMPENSATORY_COST",
        label: "Coût annuel réel compensatoire",
        inputValues: {
          annualActualCostFcfa: annualActualCostFcfa.toString(),
        },
        outputValue: annualActualCostFcfa.toString(),
        formula: "Σ (12 mois) roundedCompensatoryComplementFcfa",
        reason: "Somme des compléments mensuels arrondis (hors coût de promotion).",
      },
      {
        code: "EMPLOYEE_BASE_SALARY_REMINDER",
        label: "Rappel de salaire de base (compensatoire)",
        inputValues: {
          campaignYear: input.campaignYear,
          retroactivityStartMonth,
          technicalApplicationMonth: input.technicalApplicationMonth,
          technicalApplicationMonthLabel: technicalApplicationMonthLabelFr(
            input.technicalApplicationMonth,
          ),
          retroactiveMonths,
          remainingDirectPaymentMonths,
        },
        outputValue: finalized.baseSalaryReminderFcfa.toString(),
        formula:
          "rappel = Σ compléments mensuels arrondis (rétro ≤ mois < moisApplication) ; direct = Σ (mois ≥ moisApplication)",
        reason:
          "Somme directe des mois (et non multiplication par un montant constant) car le complément peut varier avec la promotion.",
      },
      {
        code: "EMPLOYEE_SENIORITY_IMPACT",
        label: "Incidence supplémentaire d'ancienneté (part compensatoire)",
        inputValues: {
          hireDate: finalized.hireDate,
          technicalApplicationMonthSeniorityRatePercent:
            finalized.technicalApplicationMonthSeniorityRatePercent,
          annualPromotionSeniorityImpactFcfa:
            finalized.annualPromotionSeniorityImpactFcfa.toString(),
        },
        outputValue: finalized.annualSeniorityImpactFcfa.toString(),
        formula:
          "totalImpact = plafond_fcfa((promo+compensatoire)×rate/100) ; compensatoire = totalImpact − plafond_fcfa(promo×rate/100)",
        reason:
          "Hors budget — la part imputable à la promotion est isolée pour ne pas la compter deux fois.",
      },
      {
        code: "EMPLOYEE_MONTHLY_FINAL_SALARY",
        label: "Nouveau salaire mensuel (décembre)",
        inputValues: {
          decemberBaseSalaryFcfa: decemberEntry.baseSalaryFcfa.toString(),
          monthlyFinalRoundedIncreaseFcfa: monthlyFinalRoundedIncreaseFcfa.toString(),
        },
        outputValue: decemberEntry.finalSalaryFcfa.toString(),
        formula: "finalSalary = baseSalaryFcfa(mois) + roundedCompensatoryComplementFcfa(mois)",
        reason: "Le montant de la promotion n'est jamais ajouté deux fois.",
      },
    ];

    employees.push({
      employeeId: prepared.employeeId,
      familyCode: prepared.familyCode,
      gradeCode: prepared.gradeCode,
      salaryFcfa: prepared.salaryFcfa,
      s0Fcfa: prepared.s0Resolution.s0Fcfa,
      salaryRatioBasisPoints: prepared.salaryPositionResult.ratioBasisPoints,
      salaryPositionCode: prepared.salaryPositionResult.positionCode,
      salaryPositionLabel: prepared.salaryPositionResult.positionLabel,
      positionFactorMilli: prepared.salaryPositionResult.positionFactorMilli,
      evaluationMode: prepared.evaluationFactorResult.mode,
      performanceLevel: prepared.evaluationFactorResult.performanceLevel,
      potentialLevel: prepared.evaluationFactorResult.potentialLevel,
      evaluationFactorNumerator: prepared.evaluationFactorResult.exactFactorNumerator,
      evaluationFactorScale: prepared.evaluationFactorResult.exactFactorScale,
      neutralizeNineBoxEffect: raw.neutralizeNineBoxEffect === true,
      sourceNineBoxCode:
        raw.sourceNineBoxCode === undefined ? null : raw.sourceNineBoxCode,
      nineBoxTreatmentKind: resolveNineBoxTreatmentKind({
        neutralizeNineBoxEffect: raw.neutralizeNineBoxEffect === true,
        sourceNineBoxCode: raw.sourceNineBoxCode,
        usePendingConfirmationSemantics: true,
      }),
      theoreticalMatrixWeight: prepared.theoreticalMatrixWeight,
      effectiveMatrixWeight: prepared.effectiveMatrixWeight,
      allocationWeight: prepared.allocationWeight,
      calibrationCoefficient,
      annualTheoreticalAllocation,
      monthlyTheoreticalIncrease,
      monthlyTheoreticalIncreaseRate,
      monthlyFinalRoundedIncreaseFcfa,
      monthlyRoundingDelta,
      annualActualCostFcfa,
      annualRoundingDelta,
      monthlyFinalSalaryFcfa: decemberEntry.finalSalaryFcfa,
      campaignYear: input.campaignYear,
      retroactivityStartMonth,
      technicalApplicationMonth: input.technicalApplicationMonth,
      minimumGuaranteeEffectiveMonth,
      campaignCoveredMonthCount: campaignPeriod.campaignCoveredMonthCount,
      retroactiveMonths,
      remainingDirectPaymentMonths,
      baseSalaryReminderFcfa: finalized.baseSalaryReminderFcfa,
      remainingYearDirectIncreaseCostFcfa: finalized.remainingYearDirectIncreaseCostFcfa,
      annualActualBaseIncreaseCostFcfa: annualActualCostFcfa,
      hireDate: finalized.hireDate,
      technicalApplicationMonthSeniorityRatePercent:
        finalized.technicalApplicationMonthSeniorityRatePercent,
      monthlySeniorityImpactSchedule: finalized.monthlyCompensationTrajectory.map((entry) => ({
        month: entry.month,
        ratePercent: entry.seniorityRatePercent,
        monthlySeniorityImpactFcfa: entry.compensatorySeniorityImpactFcfa,
        paymentTiming: entry.paymentTiming,
      })),
      seniorityReminderFcfa: finalized.seniorityReminderFcfa,
      remainingYearDirectSeniorityImpactFcfa: finalized.remainingYearDirectSeniorityImpactFcfa,
      annualSeniorityImpactFcfa: finalized.annualSeniorityImpactFcfa,
      employmentStatus: raw.employmentStatus ?? null,
      contractType: raw.contractType ?? null,
      compensatoryMeasureEligible: exposures.compensatoryMeasureEligible,
      isPromotionBudgetPopulationEmployee: exposures.isPromotionBudgetPopulationEmployee,
      promotion: raw.promotion ?? null,
      promotionYear: exposures.promotionYear,
      promotionMonth: exposures.promotionMonth,
      promotionInclusion: exposures.costPreview,
      annualPromotionBudgetCostFcfa: finalized.annualPromotionBudgetCostFcfa,
      promotionCostAlreadyPaidBeforeTechnicalMonthFcfa:
        finalized.promotionCostAlreadyPaidBeforeTechnicalMonthFcfa,
      promotionCostFromTechnicalMonthToDecemberFcfa:
        finalized.promotionCostFromTechnicalMonthToDecemberFcfa,
      monthlyCompensationTrajectory: finalized.monthlyCompensationTrajectory,
      combinedAnnualActualCostFcfa,
      annualPromotionSeniorityImpactFcfa: finalized.annualPromotionSeniorityImpactFcfa,
      combinedAnnualSeniorityImpactFcfa: finalized.combinedAnnualSeniorityImpactFcfa,
      promotionSeniorityAlreadyPaidBeforeTechnicalMonthFcfa:
        finalized.promotionSeniorityAlreadyPaidBeforeTechnicalMonthFcfa,
      promotionSeniorityFromTechnicalMonthToDecemberFcfa:
        finalized.promotionSeniorityFromTechnicalMonthToDecemberFcfa,
      fullYearRunRatePromotionCostFcfa: finalized.fullYearRunRatePromotionCostFcfa,
      fullYearRunRateCompensatoryCostFcfa:
        finalized.fullYearRunRateCompensatoryCostFcfa,
      fullYearRunRateCombinedBaseMeasureCostFcfa:
        finalized.fullYearRunRateCombinedBaseMeasureCostFcfa,
      fullYearRunRateSeniorityImpactFcfa:
        finalized.fullYearRunRateSeniorityImpactFcfa,
      isMinimumIncreasePopulationEmployee:
        exposures.isMinimumIncreasePopulationEmployee,
      minimumIncreaseExclusionReason: exposures.minimumIncreaseExclusionReason,
      campaignPeriodMinimumComplementFloorCostFcfa:
        finalized.campaignPeriodMinimumComplementFloorCostFcfa,
      campaignPeriodCompensationAboveMinimumCostFcfa:
        finalized.campaignPeriodCompensationAboveMinimumCostFcfa,
      minimumCompensatoryReminderFcfa: finalized.minimumCompensatoryReminderFcfa,
      aboveMinimumCompensatoryReminderFcfa:
        finalized.aboveMinimumCompensatoryReminderFcfa,
      minimumRemainingYearDirectCostFcfa:
        finalized.minimumRemainingYearDirectCostFcfa,
      aboveMinimumRemainingYearDirectCostFcfa:
        finalized.aboveMinimumRemainingYearDirectCostFcfa,
      fullYearRunRateMinimumComplementCostFcfa:
        finalized.fullYearRunRateMinimumComplementCostFcfa,
      fullYearRunRateCompensationAboveMinimumCostFcfa:
        finalized.fullYearRunRateCompensationAboveMinimumCostFcfa,
      socialMechanismKind,
      isUniversalFixedAmountEligible: exposures.isUniversalFixedAmountEligible,
      universalFixedAmountExclusionReason:
        exposures.universalFixedAmountExclusionReason,
      universalFixedAmountMonthlyAmountFcfa:
        socialMechanismKind === "universal_fixed_amount"
          ? universalFixedAmountPolicy.monthlyAmountFcfa
          : 0n,
      universalFixedAmountEffectiveMonth: universalFixedAmountPolicy.effectiveMonth,
      universalFixedAmountMinimumSeniorityMonths:
        universalFixedAmountPolicy.minimumSeniorityMonths,
      universalFixedAmountSeniorityReferenceDate:
        universalFixedAmountPolicy.seniorityReferenceDate,
      campaignPeriodUniversalFixedAmountCostFcfa:
        finalized.campaignPeriodUniversalFixedAmountCostFcfa,
      universalFixedAmountReminderFcfa: finalized.universalFixedAmountReminderFcfa,
      universalFixedAmountRemainingYearDirectCostFcfa:
        finalized.universalFixedAmountRemainingYearDirectCostFcfa,
      fullYearRunRateUniversalFixedAmountCostFcfa:
        finalized.fullYearRunRateUniversalFixedAmountCostFcfa,
      blockingReason: prepared.blockingReason,
      explanationSteps: employeeSteps,
    });
  }

  if (finalizeIssues.length > 0) {
    throw new CompensationCalculationError(
      "POPULATION_CALCULATION_FAILED",
      "La finalisation de la rémunération a échoué ; aucun résultat global valide.",
      toIssueLikes(finalizeIssues),
    );
  }

  // Invariant : total population = somme exacte des coûts imputables salariés.
  const summedEmployeePromotionBudgetCostFcfa = employees.reduce(
    (sum, employee) => sum + employee.annualPromotionBudgetCostFcfa,
    0n,
  );
  if (summedEmployeePromotionBudgetCostFcfa !== totalAnnualPromotionBudgetCostFcfa) {
    throw new CompensationCalculationError(
      "PROMOTION_BUDGET_INVARIANT_FAILED",
      "Le total population des coûts de promotion imputables diverge de la somme des salariés.",
      toIssueLikes([
        {
          code: "PROMOTION_BUDGET_INVARIANT_FAILED",
          message:
            "Le total population des coûts de promotion imputables diverge de la somme des salariés.",
          step: "promotion_budget_invariant",
          details: {
            totalAnnualPromotionBudgetCostFcfa:
              totalAnnualPromotionBudgetCostFcfa.toString(),
            summedEmployeePromotionBudgetCostFcfa:
              summedEmployeePromotionBudgetCostFcfa.toString(),
          },
        },
      ]),
    );
  }

  let populationSalarySumFcfa = 0n;
  let positiveWeightEmployeeCount = 0;
  let zeroWeightEmployeeCount = 0;
  let confirmedUnderperformerCount = 0;
  let neutralizeNineBoxEffectEmployeeCount = 0;
  let totalBaseSalaryReminderFcfa = 0n;
  let totalRemainingYearDirectIncreaseCostFcfa = 0n;
  let totalAnnualActualBaseIncreaseCostFcfa = 0n;
  let totalSeniorityReminderFcfa = 0n;
  let totalRemainingYearDirectSeniorityImpactFcfa = 0n;
  let totalAnnualSeniorityImpactFcfa = 0n;
  let annualActualOperationCostFcfa = 0n;
  let annualTheoreticalAllocatedTotal: ExactAmount = ZERO;
  let promotedIncludedEmployeeCount = 0;
  let totalCombinedAnnualActualCostFcfa = 0n;
  let totalAnnualPromotionSeniorityImpactFcfa = 0n;
  let totalCombinedAnnualSeniorityImpactFcfa = 0n;
  let totalPromotionCostAlreadyPaidBeforeTechnicalMonthFcfa = 0n;
  let totalPromotionCostFromTechnicalMonthToDecemberFcfa = 0n;
  let totalPromotionSeniorityAlreadyPaidBeforeTechnicalMonthFcfa = 0n;
  let totalPromotionSeniorityFromTechnicalMonthToDecemberFcfa = 0n;
  let fullYearRunRatePromotionCostFcfa = 0n;
  let fullYearRunRateCompensatoryCostFcfa = 0n;
  let fullYearRunRateCombinedBaseMeasureCostFcfa = 0n;
  let fullYearRunRateSeniorityImpactFcfa = 0n;
  let actualMinimumComplementPaidCostFcfa = 0n;
  let actualCompensationAboveMinimumCostFcfa = 0n;
  let minimumCompensatoryReminderFcfa = 0n;
  let aboveMinimumCompensatoryReminderFcfa = 0n;
  let minimumRemainingYearDirectCostFcfa = 0n;
  let aboveMinimumRemainingYearDirectCostFcfa = 0n;
  let fullYearRunRateMinimumComplementCostFcfa = 0n;
  let fullYearRunRateCompensationAboveMinimumCostFcfa = 0n;
  let totalUniversalFixedAmountReminderFcfa = 0n;
  let totalUniversalFixedAmountRemainingYearDirectCostFcfa = 0n;
  let fullYearRunRateUniversalFixedAmountCostFcfa = 0n;

  for (const employee of employees) {
    populationSalarySumFcfa += employee.salaryFcfa;
    totalBaseSalaryReminderFcfa += employee.baseSalaryReminderFcfa;
    totalRemainingYearDirectIncreaseCostFcfa += employee.remainingYearDirectIncreaseCostFcfa;
    totalAnnualActualBaseIncreaseCostFcfa += employee.annualActualBaseIncreaseCostFcfa;
    totalSeniorityReminderFcfa += employee.seniorityReminderFcfa;
    totalRemainingYearDirectSeniorityImpactFcfa +=
      employee.remainingYearDirectSeniorityImpactFcfa;
    totalAnnualSeniorityImpactFcfa += employee.annualSeniorityImpactFcfa;
    annualActualOperationCostFcfa += employee.annualActualCostFcfa;
    annualTheoreticalAllocatedTotal = addFractions(
      annualTheoreticalAllocatedTotal,
      employee.annualTheoreticalAllocation,
    );
    totalCombinedAnnualActualCostFcfa += employee.combinedAnnualActualCostFcfa;
    totalAnnualPromotionSeniorityImpactFcfa += employee.annualPromotionSeniorityImpactFcfa;
    totalCombinedAnnualSeniorityImpactFcfa += employee.combinedAnnualSeniorityImpactFcfa;
    totalPromotionCostAlreadyPaidBeforeTechnicalMonthFcfa +=
      employee.promotionCostAlreadyPaidBeforeTechnicalMonthFcfa;
    totalPromotionCostFromTechnicalMonthToDecemberFcfa +=
      employee.promotionCostFromTechnicalMonthToDecemberFcfa;
    totalPromotionSeniorityAlreadyPaidBeforeTechnicalMonthFcfa +=
      employee.promotionSeniorityAlreadyPaidBeforeTechnicalMonthFcfa;
    totalPromotionSeniorityFromTechnicalMonthToDecemberFcfa +=
      employee.promotionSeniorityFromTechnicalMonthToDecemberFcfa;
    actualMinimumComplementPaidCostFcfa +=
      employee.campaignPeriodMinimumComplementFloorCostFcfa;
    actualCompensationAboveMinimumCostFcfa +=
      employee.campaignPeriodCompensationAboveMinimumCostFcfa;
    minimumCompensatoryReminderFcfa += employee.minimumCompensatoryReminderFcfa;
    aboveMinimumCompensatoryReminderFcfa +=
      employee.aboveMinimumCompensatoryReminderFcfa;
    minimumRemainingYearDirectCostFcfa +=
      employee.minimumRemainingYearDirectCostFcfa;
    aboveMinimumRemainingYearDirectCostFcfa +=
      employee.aboveMinimumRemainingYearDirectCostFcfa;
    fullYearRunRateMinimumComplementCostFcfa +=
      employee.fullYearRunRateMinimumComplementCostFcfa;
    fullYearRunRateCompensationAboveMinimumCostFcfa +=
      employee.fullYearRunRateCompensationAboveMinimumCostFcfa;
    totalUniversalFixedAmountReminderFcfa += employee.universalFixedAmountReminderFcfa;
    totalUniversalFixedAmountRemainingYearDirectCostFcfa +=
      employee.universalFixedAmountRemainingYearDirectCostFcfa;
    fullYearRunRateUniversalFixedAmountCostFcfa +=
      employee.fullYearRunRateUniversalFixedAmountCostFcfa;
    const december = employee.monthlyCompensationTrajectory.find(
      (entry) => entry.month === 12,
    )!;
    const decemberPromo =
      employee.promotionInclusion.includedInSimulation && december.promotionActive
        ? employee.promotionInclusion.promotionAmountFcfa
        : 0n;
    fullYearRunRatePromotionCostFcfa +=
      decemberPromo * BigInt(FULL_YEAR_MONTH_COUNT);
    fullYearRunRateCompensatoryCostFcfa +=
      december.roundedCompensatoryComplementFcfa * BigInt(FULL_YEAR_MONTH_COUNT);
    fullYearRunRateCombinedBaseMeasureCostFcfa +=
      (decemberPromo + december.roundedCompensatoryComplementFcfa) *
      BigInt(FULL_YEAR_MONTH_COUNT);
    fullYearRunRateSeniorityImpactFcfa +=
      december.totalSeniorityImpactFcfa * BigInt(FULL_YEAR_MONTH_COUNT);
    if (employee.promotionInclusion.includedInSimulation) {
      promotedIncludedEmployeeCount += 1;
    }
    if (isZeroFraction(employee.allocationWeight)) {
      zeroWeightEmployeeCount += 1;
    } else {
      positiveWeightEmployeeCount += 1;
    }
    if (employee.blockingReason === "CONFIRMED_UNDERPERFORMER") {
      confirmedUnderperformerCount += 1;
    }
    if (employee.neutralizeNineBoxEffect) {
      neutralizeNineBoxEffectEmployeeCount += 1;
    }
  }

  if (
    totalBaseSalaryReminderFcfa + totalRemainingYearDirectIncreaseCostFcfa !==
    totalAnnualActualBaseIncreaseCostFcfa
  ) {
    throw new CompensationCalculationError(
      "BASE_SALARY_REMINDER_INVARIANT_FAILED",
      "Incohérence population : rappel + paiement direct ≠ coût annuel.",
    );
  }
  if (totalAnnualActualBaseIncreaseCostFcfa !== annualActualOperationCostFcfa) {
    throw new CompensationCalculationError(
      "BASE_SALARY_REMINDER_INVARIANT_FAILED",
      "Incohérence population : coût annuel base ≠ coût annuel opération.",
    );
  }
  if (
    totalSeniorityReminderFcfa + totalRemainingYearDirectSeniorityImpactFcfa !==
    totalAnnualSeniorityImpactFcfa
  ) {
    throw new CompensationCalculationError(
      "SENIORITY_IMPACT_INVARIANT_FAILED",
      "Incohérence population : rappel ancienneté + direct ≠ annuel.",
    );
  }
  if (!fractionsEqual(annualTheoreticalAllocatedTotal, availableAnnualCompensatoryBudget)) {
    // Sous-consommation explicite du reliquat matrice : forfait actif, taux 0,
    // aucune capacité matricielle (ex. uniquement sous-performants / non
    // éligibles matrice). Le forfait reste fixe ; le surplus n’est pas alloué.
    const forfaitOnlyUnderConsumption =
      socialMechanismKind === "universal_fixed_amount" &&
      isZeroFraction(compensatoryCalibrationRate) &&
      fractionsEqual(
        annualTheoreticalAllocatedTotal,
        exactAmountFromInteger(totalUniversalFixedAmountCostFcfa),
      );
    if (!forfaitOnlyUnderConsumption) {
      throw new CompensationCalculationError(
        "THEORETICAL_ALLOCATION_RECONCILIATION_FAILED",
        "La somme théorique compensatoire annuelle ne reproduit pas l'enveloppe compensatoire disponible.",
      );
    }
  }

  const annualTotalRoundingDelta = subtractFractions(
    exactAmountFromInteger(annualActualOperationCostFcfa),
    annualTheoreticalAllocatedTotal,
  );
  const annualCombinedRoundingDeltaFcfa = subtractFractions(
    exactAmountFromInteger(totalCombinedAnnualActualCostFcfa),
    annualBudgetTarget,
  );
  const monthlyTheoreticalIncreaseTotal = divideFractions(
    annualTheoreticalAllocatedTotal,
    campaignCoveredMonthsExact,
  );

  if (
    totalPromotionCostAlreadyPaidBeforeTechnicalMonthFcfa +
      totalPromotionCostFromTechnicalMonthToDecemberFcfa !==
    totalAnnualPromotionBudgetCostFcfa
  ) {
    throw new CompensationCalculationError(
      "PROMOTION_BUDGET_INVARIANT_FAILED",
      "Incohérence population : promo déjà payée + reste ≠ coût annuel promotion imputable.",
    );
  }
  if (
    totalPromotionSeniorityAlreadyPaidBeforeTechnicalMonthFcfa +
      totalPromotionSeniorityFromTechnicalMonthToDecemberFcfa !==
    totalAnnualPromotionSeniorityImpactFcfa
  ) {
    throw new CompensationCalculationError(
      "SENIORITY_IMPACT_INVARIANT_FAILED",
      "Incohérence population : ancienneté promo déjà payée + reste ≠ annuel promo.",
    );
  }

  const populationSummary: PopulationCalculationSummary = {
    employeeCount: employees.length,
    positiveWeightEmployeeCount,
    zeroWeightEmployeeCount,
    confirmedUnderperformerCount,
    neutralizeNineBoxEffectEmployeeCount,
    nineBoxConfirmationFactorMilli:
      input.references.nineBoxConfirmationFactorMilli,
    annualBudgetTarget,
    totalAllocationWeight,
    calibrationCoefficient,
    annualTheoreticalAllocatedTotal,
    monthlyTheoreticalIncreaseTotal,
    annualActualOperationCostFcfa,
    annualTotalRoundingDelta,
    roundingStepFcfa: stepFcfa,
    evaluationMode: input.references.evaluationMode,
    allocationBasis: ALLOCATION_BASIS_SALARY_TIMES_MATRIX_WEIGHT,
    isTheoreticalBudgetExactlyAllocated: fractionsEqual(
      annualTheoreticalAllocatedTotal,
      availableAnnualCompensatoryBudget,
    ),
    populationSalarySumFcfa,
    campaignYear: input.campaignYear,
    retroactivityStartMonth,
    technicalApplicationMonth: input.technicalApplicationMonth,
    minimumGuaranteeEffectiveMonth,
    campaignCoveredMonthCount: campaignPeriod.campaignCoveredMonthCount,
    totalBaseSalaryReminderFcfa,
    totalRemainingYearDirectIncreaseCostFcfa,
    totalAnnualActualBaseIncreaseCostFcfa,
    totalSeniorityReminderFcfa,
    totalRemainingYearDirectSeniorityImpactFcfa,
    totalAnnualSeniorityImpactFcfa,
    fullYearRunRatePromotionCostFcfa,
    fullYearRunRateCompensatoryCostFcfa,
    fullYearRunRateCombinedBaseMeasureCostFcfa,
    fullYearRunRateSeniorityImpactFcfa,
    promotedIncludedEmployeeCount,
    compensatoryCalibrationRate,
    totalAnnualPromotionBudgetCostFcfa,
    availableAnnualCompensatoryBudget,
    totalCombinedAnnualActualCostFcfa,
    annualCombinedRoundingDeltaFcfa,
    totalPromotionCostAlreadyPaidBeforeTechnicalMonthFcfa,
    totalPromotionCostFromTechnicalMonthToDecemberFcfa,
    totalAnnualPromotionSeniorityImpactFcfa,
    totalCombinedAnnualSeniorityImpactFcfa,
    totalPromotionSeniorityAlreadyPaidBeforeTechnicalMonthFcfa,
    totalPromotionSeniorityFromTechnicalMonthToDecemberFcfa,
    minimumIncreaseMode: minimumIncreasePolicy.mode,
    minimumMonthlyAmountFcfa: minimumIncreasePolicy.minimumMonthlyAmountFcfa,
    minimumIncreaseRate: minimumIncreasePolicy.minimumIncreaseRate,
    minimumIncreasePopulationEmployeeCount,
    minimumIncreaseExposureCount,
    totalMinimumComplementFloorCostFcfa,
    availableBudgetAfterPromotionsAndMinimumFcfa,
    actualMinimumComplementPaidCostFcfa,
    actualCompensationAboveMinimumCostFcfa,
    minimumCompensatoryReminderFcfa,
    aboveMinimumCompensatoryReminderFcfa,
    minimumRemainingYearDirectCostFcfa,
    aboveMinimumRemainingYearDirectCostFcfa,
    fullYearRunRateMinimumComplementCostFcfa,
    fullYearRunRateCompensationAboveMinimumCostFcfa,
    socialMechanismKind,
    universalFixedAmountMonthlyAmountFcfa:
      socialMechanismKind === "universal_fixed_amount"
        ? universalFixedAmountPolicy.monthlyAmountFcfa
        : 0n,
    universalFixedAmountEffectiveMonth: universalFixedAmountPolicy.effectiveMonth,
    universalFixedAmountMinimumSeniorityMonths:
      universalFixedAmountPolicy.minimumSeniorityMonths,
    universalFixedAmountSeniorityReferenceDate:
      universalFixedAmountPolicy.seniorityReferenceDate,
    universalFixedAmountEligibleEmployeeCount,
    universalFixedAmountExposureCount,
    totalUniversalFixedAmountCostFcfa,
    availableBudgetAfterPromotionsAndSocialMechanismFcfa,
    totalUniversalFixedAmountReminderFcfa,
    totalUniversalFixedAmountRemainingYearDirectCostFcfa,
    fullYearRunRateUniversalFixedAmountCostFcfa,
  };

  const explanationSteps: CalculationExplanationStep[] = [
    ...budgetTargetResult.explanationSteps,
    {
      code: "POPULATION_ALLOCATION_BASIS",
      label: "Convention de répartition",
      inputValues: {
        allocationBasis: ALLOCATION_BASIS_SALARY_TIMES_MATRIX_WEIGHT,
        employeeCount: employees.length,
      },
      outputValue: ALLOCATION_BASIS_SALARY_TIMES_MATRIX_WEIGHT,
      formula:
        "allocationWeight = monthlySalaryFcfa × effectiveMatrixWeight (décembre, information)",
      reason: "Convention JRB conservée pour compatibilité d'affichage.",
    },
    {
      code: "POPULATION_PROMOTION_BUDGET_COST",
      label: "Coût annuel de promotion imputable",
      inputValues: {
        annualBudgetTarget: formatExactAmount(annualBudgetTarget),
        promotedIncludedEmployeeCount,
      },
      outputValue: totalAnnualPromotionBudgetCostFcfa.toString(),
      formula:
        "Σ coûtPromotion (salariés de la population budget promotion, promotion incluse)",
      reason: "Consomme l'enveloppe annuelle avant répartition de la mesure compensatoire.",
    },
    {
      code: "POPULATION_AVAILABLE_COMPENSATORY_BUDGET",
      label: "Enveloppe compensatoire disponible",
      inputValues: {
        annualBudgetTarget: formatExactAmount(annualBudgetTarget),
        totalAnnualPromotionBudgetCostFcfa: totalAnnualPromotionBudgetCostFcfa.toString(),
      },
      outputValue: formatExactAmount(availableAnnualCompensatoryBudget),
      formula: "availableAnnualCompensatoryBudget = annualBudgetTarget − coût promotion imputable",
      reason: "Répartie exactement par le taux unique de calibrage compensatoire.",
    },
    {
      code: "POPULATION_COMPENSATORY_CALIBRATION_RATE",
      label: "Taux de calibrage compensatoire résolu",
      inputValues: {
        availableAnnualCompensatoryBudget: formatExactAmount(availableAnnualCompensatoryBudget),
      },
      outputValue: formatExactAmount(compensatoryCalibrationRate),
      formula:
        "Σ salaire×max(0, taux×facteur − décalagePromotion) = enveloppe compensatoire disponible",
      reason: "Solveur exact piecewise (aucune conversion Number).",
    },
    {
      code: "POPULATION_ANNUAL_THEORETICAL_TOTAL",
      label: "Total théorique compensatoire annuel alloué",
      inputValues: {
        availableAnnualCompensatoryBudget: formatExactAmount(availableAnnualCompensatoryBudget),
      },
      outputValue: formatExactAmount(annualTheoreticalAllocatedTotal),
      formula: "Σ annualTheoreticalAllocation = availableAnnualCompensatoryBudget",
      reason: "Invariant rationnel démontré analytiquement par construction du solveur.",
    },
    {
      code: "POPULATION_ANNUAL_ACTUAL_OPERATION_COST",
      label: "Coût annuel réel compensatoire de l'opération",
      inputValues: {
        roundingMode: input.roundingPolicy.mode,
        stepFcfa: stepFcfa.toString(),
      },
      outputValue: annualActualOperationCostFcfa.toString(),
      formula: "Σ (12 mois × N salariés) roundedCompensatoryComplementFcfa",
      reason: "Coût compensatoire seul — le coût de promotion est comptabilisé séparément.",
    },
    {
      code: "POPULATION_ANNUAL_TOTAL_ROUNDING_DELTA",
      label: "Écart annuel total d'arrondi",
      inputValues: {
        annualActualOperationCostFcfa: annualActualOperationCostFcfa.toString(),
        availableAnnualCompensatoryBudget: formatExactAmount(availableAnnualCompensatoryBudget),
      },
      outputValue: formatExactAmount(annualTotalRoundingDelta),
      formula: "annualActualOperationCost − availableAnnualCompensatoryBudget",
      reason: "Peut être négatif, nul ou positif.",
    },
    {
      code: "NO_FORCED_RECONCILIATION",
      label: "Absence de réconciliation forcée",
      inputValues: { method: "none" },
      outputValue: false,
      formula: "no largest-remainder",
      reason: "Le coût annuel réel n'est pas forcé au budget cible.",
    },
  ];

  return {
    budgetTargetResult,
    evaluationMode: input.references.evaluationMode,
    roundingPolicy: { mode: input.roundingPolicy.mode, stepFcfa },
    allocationBasis: ALLOCATION_BASIS_SALARY_TIMES_MATRIX_WEIGHT,
    totalAllocationWeight,
    calibrationCoefficient,
    employees,
    annualTheoreticalAllocatedTotal,
    annualActualOperationCostFcfa,
    annualTotalRoundingDelta,
    campaignYear: input.campaignYear,
    retroactivityStartMonth,
    technicalApplicationMonth: input.technicalApplicationMonth,
    minimumGuaranteeEffectiveMonth,
    campaignCoveredMonthCount: campaignPeriod.campaignCoveredMonthCount,
    totalBaseSalaryReminderFcfa,
    totalRemainingYearDirectIncreaseCostFcfa,
    totalAnnualActualBaseIncreaseCostFcfa,
    totalSeniorityReminderFcfa,
    totalRemainingYearDirectSeniorityImpactFcfa,
    totalAnnualSeniorityImpactFcfa,
    fullYearRunRatePromotionCostFcfa,
    fullYearRunRateCompensatoryCostFcfa,
    fullYearRunRateCombinedBaseMeasureCostFcfa,
    fullYearRunRateSeniorityImpactFcfa,
    promotedIncludedEmployeeCount,
    compensatoryCalibrationRate,
    totalAnnualPromotionBudgetCostFcfa,
    availableAnnualCompensatoryBudget,
    totalCombinedAnnualActualCostFcfa,
    annualCombinedRoundingDeltaFcfa,
    totalPromotionCostAlreadyPaidBeforeTechnicalMonthFcfa,
    totalPromotionCostFromTechnicalMonthToDecemberFcfa,
    totalAnnualPromotionSeniorityImpactFcfa,
    totalCombinedAnnualSeniorityImpactFcfa,
    totalPromotionSeniorityAlreadyPaidBeforeTechnicalMonthFcfa,
    totalPromotionSeniorityFromTechnicalMonthToDecemberFcfa,
    minimumIncreaseMode: minimumIncreasePolicy.mode,
    minimumMonthlyAmountFcfa: minimumIncreasePolicy.minimumMonthlyAmountFcfa,
    minimumIncreaseRate: minimumIncreasePolicy.minimumIncreaseRate,
    minimumIncreasePopulationEmployeeCount,
    minimumIncreaseExposureCount,
    totalMinimumComplementFloorCostFcfa,
    availableBudgetAfterPromotionsAndMinimumFcfa,
    actualMinimumComplementPaidCostFcfa,
    actualCompensationAboveMinimumCostFcfa,
    minimumCompensatoryReminderFcfa,
    aboveMinimumCompensatoryReminderFcfa,
    minimumRemainingYearDirectCostFcfa,
    aboveMinimumRemainingYearDirectCostFcfa,
    fullYearRunRateMinimumComplementCostFcfa,
    fullYearRunRateCompensationAboveMinimumCostFcfa,
    populationSummary,
    explanationSteps,
  };
}
