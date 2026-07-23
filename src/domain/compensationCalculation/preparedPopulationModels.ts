/** Modèles orchestrateur population préparée (Lot 2A-4). */

import type { BudgetTargetInput, ResolvedBudgetTarget } from "./budgetTargetModels";
import type { ExactAmount } from "./exactFraction";
import type {
  CalculationExplanationStep,
  EvaluationFactorResult,
  IndividualWeightResult,
  LevelFactorRef,
  MatrixBlockingReason,
  NineBoxFactorRef,
  SalaryPositionInputRow,
  SalaryPositionResult,
} from "./models";
import type { NineBoxTreatmentKind } from "./nineBoxTreatment";
import type { NineBoxMode, PerformanceLevel, PotentialLevel } from "../compensationReference/models";
import type {
  PromotionCampaignCostPreview,
  PromotionEvent,
  PromotionInclusionStatus,
} from "./promotionTrajectory";
import type { MinimumIncreaseExclusionReason } from "./minimumIncreasePopulation";
import type { MinimumIncreaseMode, MinimumIncreasePolicy } from "./minimumIncrease";
import type { PromotionBudgetEmploymentStatus } from "./promotionBudgetPopulation";
import type { RoundingPolicy } from "./populationAllocationModels";

/**
 * Convention JRB : répartition du budget ANNUEL proportionnelle au
 * salaire MENSUEL × poids matriciel.
 * Le facteur commun 12 s’annule dans la répartition ; annualiser le poids
 * ne change pas les parts relatives.
 * Même poids matriciel ⇒ même taux théorique d’augmentation mensuel.
 */
export const ALLOCATION_BASIS_SALARY_TIMES_MATRIX_WEIGHT =
  "salary_times_effective_matrix_weight" as const;

export type AllocationBasis =
  typeof ALLOCATION_BASIS_SALARY_TIMES_MATRIX_WEIGHT;

/** Cellule S0 fournie à l’orchestrateur (indépendante de l’import RH). */
export interface PreparedSalaryGridCell {
  familyCode: string;
  gradeCode: string;
  familyLabel?: string;
  gradeLabel?: string;
  s0Fcfa: number | bigint | null;
}

export interface PreparedEmployeeCalculationInput {
  employeeId: string;
  familyCode: string;
  gradeCode: string;
  salaryFcfa: number | bigint;
  /**
   * Date d’embauche canonique ISO `YYYY-MM-DD` (champ import `hireDate`).
   * Obligatoire pour l’incidence d’ancienneté (Lot 2A-H2B).
   */
  hireDate: string;
  performanceLevel?: PerformanceLevel;
  potentialLevel?: PotentialLevel;
  confirmedUnderperformer: boolean;
  /**
   * Neutralisation individuelle de l’effet 9-Box (Lot 2B-RC1-H1).
   * Défaut métier = false. Si true, le facteur d’évaluation effectif vaut 1.
   */
  neutralizeNineBoxEffect?: boolean;
  /**
   * Code 9-Box source (import), conservé pour traçabilité même si neutralisé.
   */
  sourceNineBoxCode?: number | null;
  /** Promotion structurée importée (Lot 2A-H2C-1) — null si absent. */
  promotion?: PromotionEvent | null;
  /**
   * Type de contrat (Lot 2A-H2C-2A) — alimente `isCompensatoryMeasureEligible`.
   * Absent/undefined : compatibilité fixtures techniques uniquement ;
   * l’import RH réel impose toujours un contrat.
   */
  contractType?: string | null;
  /**
   * Statut d'emploi (Lot 2A-H2C-2) — déterminant pour la consommation du
   * budget promotion. Absent/undefined ⇒ traité comme "active" pour la
   * population promotion (compat fixtures) ; l’import RH impose le statut.
   */
  employmentStatus?: PromotionBudgetEmploymentStatus | null;
  /**
   * Override d’éligibilité à la mesure compensatoire.
   * Préférer laisser le prédicat `isCompensatoryMeasureEligible` calculer.
   * `false` force l’inéligibilité (tests / préparation manuelle).
   */
  compensatoryMeasureEligible?: boolean;
}

export interface PopulationCalculationReferences {
  evaluationMode: NineBoxMode;
  salaryGrid: readonly PreparedSalaryGridCell[];
  salaryPositions: readonly SalaryPositionInputRow[];
  performanceFactors: readonly LevelFactorRef[];
  potentialFactors: readonly LevelFactorRef[];
  nineBoxFactors: readonly NineBoxFactorRef[];
  /**
   * Coefficient provisoire 9-Box (millièmes, 500–1000).
   * Appliqué aux salariés avec neutralizeNineBoxEffect (contrat ≥ 6).
   */
  nineBoxConfirmationFactorMilli: number;
}

export interface PreparedPopulationCalculationInput {
  employees: readonly PreparedEmployeeCalculationInput[];
  references: PopulationCalculationReferences;
  budgetTarget: BudgetTargetInput;
  roundingPolicy: RoundingPolicy;
  /** Année de campagne explicite (déterministe — jamais Date.now() dans le moteur). */
  campaignYear: number;
  /**
   * Début de rétroactivité (1 = janvier … 12 = décembre).
   * Défaut métier = 1 pour parité des simulations historiques (contrat v3).
   */
  retroactivityStartMonth?: number;
  /** Mois d’application technique (1 = janvier … 12 = décembre). */
  technicalApplicationMonth: number;
  /**
   * Mois d’effet du minimum garanti (1–12).
   * Défaut métier = `technicalApplicationMonth` (contrat v8 / Lot 2B-RC1-H4).
   */
  minimumGuaranteeEffectiveMonth?: number;
  /**
   * Politique de minimum garanti d’augmentation (Lot 2A-H2D-2).
   * Défaut métier = aucun minimum (parité H2D-1).
   */
  minimumIncreasePolicy?: MinimumIncreasePolicy;
}

export interface PopulationCalculationIssue {
  employeeId?: string;
  code: string;
  field?: string;
  message: string;
  step?: string;
  details?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface PopulationCalculationValidationResult {
  isValid: boolean;
  issues: PopulationCalculationIssue[];
}

export interface EmployeeS0Resolution {
  familyCode: string;
  gradeCode: string;
  familyLabel?: string;
  gradeLabel?: string;
  s0Fcfa: bigint;
  explanationSteps: CalculationExplanationStep[];
}

export interface PreparedEmployeeCalculationResult {
  employeeId: string;
  familyCode: string;
  gradeCode: string;
  salaryFcfa: bigint;
  /** Date d’embauche ISO (propagée depuis l’entrée préparée). */
  hireDate: string;
  s0Resolution: EmployeeS0Resolution;
  salaryPositionResult: SalaryPositionResult;
  evaluationFactorResult: EvaluationFactorResult;
  individualMatrixWeightResult: IndividualWeightResult;
  theoreticalMatrixWeight: ExactAmount;
  effectiveMatrixWeight: ExactAmount;
  allocationWeight: ExactAmount;
  blockingReason?: MatrixBlockingReason;
  explanationSteps: CalculationExplanationStep[];
}

export interface EmployeeCompensationCalculationResult {
  employeeId: string;
  familyCode: string;
  gradeCode: string;
  /** Salaire de base mensuel. */
  salaryFcfa: bigint;
  /** Médiane S0 mensuelle. */
  s0Fcfa: bigint;
  salaryRatioBasisPoints: number;
  salaryPositionCode: string;
  salaryPositionLabel: string;
  positionFactorMilli: number;
  evaluationMode: NineBoxMode;
  performanceLevel?: PerformanceLevel;
  potentialLevel?: PotentialLevel;
  evaluationFactorNumerator: number;
  evaluationFactorScale: number;
  /** Neutralisation individuelle de l’effet 9-Box (Lot 2B-RC1-H1). */
  neutralizeNineBoxEffect: boolean;
  /** Code 9-Box source (import) — null si absent. */
  sourceNineBoxCode: number | null;
  /** Traitement d’évaluation 9-Box retenu. */
  nineBoxTreatmentKind: NineBoxTreatmentKind;
  theoreticalMatrixWeight: ExactAmount;
  effectiveMatrixWeight: ExactAmount;
  allocationWeight: ExactAmount;
  /**
   * Coefficient de calibrage annuel :
   * annualBudgetTarget / Σ(monthlySalary × effectiveMatrixWeight).
   */
  calibrationCoefficient: ExactAmount;
  /** Part annuelle exacte du budget cible. */
  annualTheoreticalAllocation: ExactAmount;
  /** Augmentation mensuelle théorique = annualTheoreticalAllocation / 12. */
  monthlyTheoreticalIncrease: ExactAmount;
  /**
   * Taux d’augmentation du salaire mensuel =
   * monthlyTheoreticalIncrease / monthlyBaseSalary.
   */
  monthlyTheoreticalIncreaseRate: ExactAmount;
  /** Augmentation mensuelle finale après arrondi. */
  monthlyFinalRoundedIncreaseFcfa: bigint;
  /** Écart mensuel d’arrondi = final − théorique mensuel. */
  monthlyRoundingDelta: ExactAmount;
  /** Coût annuel réel = monthlyFinalRoundedIncrease × 12. */
  annualActualCostFcfa: bigint;
  /** Écart annuel d’arrondi = annualActualCost − annualTheoreticalAllocation. */
  annualRoundingDelta: ExactAmount;
  /** Nouveau salaire mensuel = salaire mensuel + augmentation mensuelle finale. */
  monthlyFinalSalaryFcfa: bigint;
  /** Année de campagne (calendrier d’application). */
  campaignYear: number;
  /** Début de rétroactivité (1–12). */
  retroactivityStartMonth: number;
  /** Mois d’application technique (1–12). */
  technicalApplicationMonth: number;
  /** Mois d’effet du minimum garanti (1–12) — contrat v8. */
  minimumGuaranteeEffectiveMonth: number;
  /** Nombre de mois couverts par la campagne (13 − rétroactivité). */
  campaignCoveredMonthCount: number;
  /** Mois de rappel = technicalApplicationMonth − retroactivityStartMonth. */
  retroactiveMonths: number;
  /** Mois restants payés directement = 13 − technicalApplicationMonth. */
  remainingDirectPaymentMonths: number;
  /** Rappel de salaire de base versé au mois d’application. */
  baseSalaryReminderFcfa: bigint;
  /** Coût des augmentations payées directement sur le reste de l’année. */
  remainingYearDirectIncreaseCostFcfa: bigint;
  /**
   * Coût annuel réel de l’augmentation de base (= monthlyFinal × 12).
   * Alias sémantique de annualActualCostFcfa (même valeur).
   */
  annualActualBaseIncreaseCostFcfa: bigint;
  /** Date d’embauche ISO (Lot 2A-H2B). */
  hireDate: string;
  /** Taux d’ancienneté au mois d’application technique (%). */
  technicalApplicationMonthSeniorityRatePercent: number;
  /** Calendrier mensuel janvier–décembre (déterministe). */
  monthlySeniorityImpactSchedule: readonly {
    month: number;
    ratePercent: number;
    monthlySeniorityImpactFcfa: bigint;
    paymentTiming: "outside_campaign" | "reminder" | "direct";
  }[];
  /** Rappel d’incidence d’ancienneté (hors budget). */
  seniorityReminderFcfa: bigint;
  /** Incidence d’ancienneté payée directement sur le reste de l’année. */
  remainingYearDirectSeniorityImpactFcfa: bigint;
  /** Incidence annuelle totale d’ancienneté (hors budget). */
  annualSeniorityImpactFcfa: bigint;
  /** Statut d'emploi propagé (Lot 2A-H2C-2). Null si absent à l'entrée. */
  employmentStatus: PromotionBudgetEmploymentStatus | null;
  /** Type de contrat propagé (affichage motifs d’inéligibilité — Lot 2A-H2C-2B). */
  contractType: string | null;
  /** Éligibilité effective à la mesure compensatoire (Lot 2A-H2C-2). */
  compensatoryMeasureEligible: boolean;
  /** Appartenance à la population de consommation du budget promotion. */
  isPromotionBudgetPopulationEmployee: boolean;
  /** Promotion structurée retenue à l'entrée — null si absente. */
  promotion: PromotionEvent | null;
  /** Année ISO de la promotion (N-1 ou N) — null si absente. */
  promotionYear: number | null;
  /** Mois ISO de la promotion — null si absente. */
  promotionMonth: number | null;
  /** Aperçu d'inclusion/coût de la promotion dans la simulation courante. */
  promotionInclusion: PromotionCampaignCostPreview;
  /**
   * Coût annuel de promotion **imputable à l’enveloppe** uniquement :
   * `includedInSimulation && isPromotionBudgetPopulationEmployee`
   * ? `promotionInclusion.promotionCampaignCostFcfa` : 0.
   * Le coût brut informatif reste dans `promotionInclusion.promotionCampaignCostFcfa`.
   */
  annualPromotionBudgetCostFcfa: bigint;
  /** Coût promo imputable déjà payé avant le mois technique. */
  promotionCostAlreadyPaidBeforeTechnicalMonthFcfa: bigint;
  /** Coût promo imputable du mois technique à décembre. */
  promotionCostFromTechnicalMonthToDecemberFcfa: bigint;
  /** Trajectoire mensuelle complète janvier–décembre (Lot 2A-H2C-2). */
  monthlyCompensationTrajectory: readonly MonthlyCompensationTrajectoryEntry[];
  /** Coût annuel combiné = compensatoire réel + promotion imputable. */
  combinedAnnualActualCostFcfa: bigint;
  /** Incidence annuelle d'ancienneté attribuable à la promotion (hors budget). */
  annualPromotionSeniorityImpactFcfa: bigint;
  /** Incidence annuelle d'ancienneté combinée (compensatoire + promotion). */
  combinedAnnualSeniorityImpactFcfa: bigint;
  /** Incidence ancienneté promo déjà payée avant le mois technique. */
  promotionSeniorityAlreadyPaidBeforeTechnicalMonthFcfa: bigint;
  /** Incidence ancienneté promo du mois technique à décembre. */
  promotionSeniorityFromTechnicalMonthToDecemberFcfa: bigint;
  /** Indicateurs informatifs plein effet (décembre × 12) — hors calibrage. */
  fullYearRunRatePromotionCostFcfa: bigint;
  fullYearRunRateCompensatoryCostFcfa: bigint;
  fullYearRunRateCombinedBaseMeasureCostFcfa: bigint;
  fullYearRunRateSeniorityImpactFcfa: bigint;
  /** Appartenance à la population du minimum garanti (Lot 2A-H2D-2). */
  isMinimumIncreasePopulationEmployee: boolean;
  /** Motif d’exclusion du minimum — null si inclus. */
  minimumIncreaseExclusionReason: MinimumIncreaseExclusionReason;
  /** Σ planchers de complément sur la période de campagne. */
  campaignPeriodMinimumComplementFloorCostFcfa: bigint;
  /** Σ (complément arrondi − plancher) sur la période de campagne. */
  campaignPeriodCompensationAboveMinimumCostFcfa: bigint;
  /** Part minimum du rappel compensatoire. */
  minimumCompensatoryReminderFcfa: bigint;
  /** Part au-dessus du minimum du rappel compensatoire. */
  aboveMinimumCompensatoryReminderFcfa: bigint;
  /** Part minimum du paiement direct compensatoire. */
  minimumRemainingYearDirectCostFcfa: bigint;
  /** Part au-dessus du minimum du paiement direct compensatoire. */
  aboveMinimumRemainingYearDirectCostFcfa: bigint;
  /** Plein effet décembre : plancher × 12. */
  fullYearRunRateMinimumComplementCostFcfa: bigint;
  /** Plein effet décembre : au-dessus du minimum × 12. */
  fullYearRunRateCompensationAboveMinimumCostFcfa: bigint;
  blockingReason?: MatrixBlockingReason;
  explanationSteps: CalculationExplanationStep[];
}

/**
 * Entrée mensuelle de la trajectoire de rémunération consciente des
 * promotions (Lot 2A-H2C-2). Une entrée par mois (1 = janvier … 12 = décembre).
 */
export interface MonthlyCompensationTrajectoryEntry {
  month: number;
  /** Salaire de base du mois (post-promotion si active ce mois). */
  baseSalaryFcfa: bigint;
  gradeCode: string;
  jobFamilyCode: string;
  promotionActive: boolean;
  promotionStatus: PromotionInclusionStatus;
  /** Médiane S0 résolue pour (famille, grade) du mois. */
  s0Fcfa: bigint;
  /** Facteur matriciel théorique du mois (avant blocages/exclusions). */
  theoreticalCompensationFactor: ExactAmount;
  /**
   * Facteur matriciel effectif du mois utilisé pour la mesure compensatoire
   * (0 si sous-performant confirmé OU compensatoryMeasureEligible === false).
   */
  effectiveCompensationFactor: ExactAmount;
  /**
   * Part de taux déjà consommée par la promotion incluse ce mois-ci
   * (0 si aucune promotion active/incluse ce mois).
   */
  promotionRateOffset: ExactAmount;
  /** Taux cible = calibrationRate × effectiveCompensationFactor. */
  targetCompensatoryRate: ExactAmount;
  /** max(0, targetCompensatoryRate − promotionRateOffset). */
  compensatoryComplementRate: ExactAmount;
  /** Complément compensatoire exact avant arrondi = salaire × taux. */
  theoreticalCompensatoryComplement: ExactAmount;
  /** Complément compensatoire arrondi au pas de la politique d'arrondi. */
  roundedCompensatoryComplementFcfa: bigint;
  /** Salaire final du mois = baseSalaryFcfa + roundedCompensatoryComplementFcfa. */
  finalSalaryFcfa: bigint;
  /** Coût de promotion imputable au mois (0 hors mois actif inclus ou hors période). */
  promotionBudgetCostFcfa: bigint;
  /** promotionBudgetCostFcfa + roundedCompensatoryComplementFcfa. */
  combinedIncreaseFcfa: bigint;
  /** Mois couvert par la période budgétaire [rétro … décembre]. */
  coveredByCampaignPeriod: boolean;
  /** Coût du mois inclus dans l’enveloppe de campagne. */
  includedInCampaignEnvelope: boolean;
  paymentTiming: "outside_campaign" | "reminder" | "direct";
  seniorityRatePercent: number;
  /** Incidence d'ancienneté sur l'augmentation combinée du mois. */
  totalSeniorityImpactFcfa: bigint;
  /** Part de l'incidence d'ancienneté attribuable à la promotion seule. */
  promotionSeniorityImpactFcfa: bigint;
  /** Part de l'incidence d'ancienneté attribuable au complément compensatoire. */
  compensatorySeniorityImpactFcfa: bigint;
  /** Appartenance à la population du minimum (propagée pour audit). */
  isMinimumIncreasePopulationEmployee: boolean;
  /** Montant total garanti exact (avant déduction promo / ceil). */
  guaranteedTotalIncreaseExact: ExactAmount;
  /** Incrément de promotion applicable ce mois (contribue au minimum). */
  applicablePromotionIncrementFcfa: bigint;
  /** Complément minimum exact requis après contribution promo. */
  requiredMinimumComplementExact: ExactAmount;
  /** Plancher payable (multiple du pas d’arrondi). */
  minimumComplementFloorFcfa: bigint;
  /** Complément pondéré exact = salaire × max(0, rate×f − o). */
  weightedComplementExact: ExactAmount;
  /**
   * Complément théorique exact = max(plancher exact, weighted).
   * (Le plancher est un entier exact.)
   */
  theoreticalComplementExact: ExactAmount;
  /** Complément arrondi au-dessus du plancher (= rounded − floor). */
  actualComplementAboveMinimumFcfa: bigint;
}

export interface PopulationCalculationSummary {
  employeeCount: number;
  positiveWeightEmployeeCount: number;
  zeroWeightEmployeeCount: number;
  confirmedUnderperformerCount: number;
  /** Nombre de salariés avec effet 9-Box neutralisé (Lot 2B-RC1-H1). */
  neutralizeNineBoxEffectEmployeeCount: number;
  /** Coefficient provisoire global utilisé pour ce run (millièmes). */
  nineBoxConfirmationFactorMilli: number;
  /** Budget annuel cible exact. */
  annualBudgetTarget: ExactAmount;
  totalAllocationWeight: ExactAmount;
  calibrationCoefficient: ExactAmount;
  /** Σ allocations théoriques annuelles (= budget annuel si poids > 0). */
  annualTheoreticalAllocatedTotal: ExactAmount;
  /** annualTheoreticalAllocatedTotal / 12. */
  monthlyTheoreticalIncreaseTotal: ExactAmount;
  /** Σ (augmentations mensuelles finales × 12). */
  annualActualOperationCostFcfa: bigint;
  /** annualActualOperationCost − annualBudgetTarget. */
  annualTotalRoundingDelta: ExactAmount;
  roundingStepFcfa: bigint;
  evaluationMode: NineBoxMode;
  allocationBasis: AllocationBasis;
  isTheoreticalBudgetExactlyAllocated: boolean;
  /** Somme des salaires MENSUELS de la population (trace informative). */
  populationSalarySumFcfa: bigint;
  campaignYear: number;
  retroactivityStartMonth: number;
  technicalApplicationMonth: number;
  /** Mois d’effet du minimum garanti (1–12) — contrat v8. */
  minimumGuaranteeEffectiveMonth: number;
  campaignCoveredMonthCount: number;
  totalBaseSalaryReminderFcfa: bigint;
  totalRemainingYearDirectIncreaseCostFcfa: bigint;
  totalAnnualActualBaseIncreaseCostFcfa: bigint;
  /** Totaux incidence d’ancienneté de période (hors budget — Lot 2A-H2B / H2D-1). */
  totalSeniorityReminderFcfa: bigint;
  totalRemainingYearDirectSeniorityImpactFcfa: bigint;
  totalAnnualSeniorityImpactFcfa: bigint;
  /** Indicateurs informatifs plein effet (décembre × 12) — hors calibrage. */
  fullYearRunRatePromotionCostFcfa: bigint;
  fullYearRunRateCompensatoryCostFcfa: bigint;
  fullYearRunRateCombinedBaseMeasureCostFcfa: bigint;
  fullYearRunRateSeniorityImpactFcfa: bigint;
  /** Nombre de salariés porteurs d'une promotion incluse dans la simulation. */
  promotedIncludedEmployeeCount: number;
  /** Taux mensuel de calibrage compensatoire résolu (Lot 2A-H2C-2). */
  compensatoryCalibrationRate: ExactAmount;
  /** Σ coûts annuels de promotion imputables (population budget promotion). */
  totalAnnualPromotionBudgetCostFcfa: bigint;
  /** annualBudgetTarget − totalAnnualPromotionBudgetCostFcfa. */
  availableAnnualCompensatoryBudget: ExactAmount;
  /** Σ (coût compensatoire réel + coût promotion imputable) par salarié. */
  totalCombinedAnnualActualCostFcfa: bigint;
  /**
   * Écart d’arrondi combiné vs budget cible :
   * totalCombinedAnnualActualCostFcfa − annualBudgetTarget.
   */
  annualCombinedRoundingDeltaFcfa: ExactAmount;
  /** Σ coûts promo imputables déjà payés avant le mois technique. */
  totalPromotionCostAlreadyPaidBeforeTechnicalMonthFcfa: bigint;
  /** Σ coûts promo imputables du mois technique à décembre. */
  totalPromotionCostFromTechnicalMonthToDecemberFcfa: bigint;
  /** Σ incidence annuelle d'ancienneté attribuable aux promotions. */
  totalAnnualPromotionSeniorityImpactFcfa: bigint;
  /** Σ incidence annuelle d'ancienneté combinée (compensatoire + promotion). */
  totalCombinedAnnualSeniorityImpactFcfa: bigint;
  /** Σ incidence ancienneté promo déjà payée avant le mois technique. */
  totalPromotionSeniorityAlreadyPaidBeforeTechnicalMonthFcfa: bigint;
  /** Σ incidence ancienneté promo du mois technique à décembre. */
  totalPromotionSeniorityFromTechnicalMonthToDecemberFcfa: bigint;
  /** Mode de minimum garanti résolu (Lot 2A-H2D-2). */
  minimumIncreaseMode: MinimumIncreaseMode;
  /** Montant forfaitaire résolu — null hors mode forfaitaire. */
  minimumMonthlyAmountFcfa: bigint | null;
  /** Taux minimum résolu — null hors mode pourcentage. */
  minimumIncreaseRate: ExactAmount | null;
  /** Nombre de salariés de la population du minimum. */
  minimumIncreasePopulationEmployeeCount: number;
  /** Nombre d’expositions mensuelles avec plancher > 0. */
  minimumIncreaseExposureCount: number;
  /** Σ planchers de complément réservés sur la période. */
  totalMinimumComplementFloorCostFcfa: bigint;
  /**
   * Budget restant après promotions et planchers :
   * availableAnnualCompensatoryBudget − totalMinimumComplementFloorCost.
   */
  availableBudgetAfterPromotionsAndMinimumFcfa: ExactAmount;
  /** Σ part minimum réellement payée (planchers). */
  actualMinimumComplementPaidCostFcfa: bigint;
  /** Σ part au-dessus du minimum réellement payée. */
  actualCompensationAboveMinimumCostFcfa: bigint;
  /** Σ part minimum du rappel. */
  minimumCompensatoryReminderFcfa: bigint;
  /** Σ part au-dessus du minimum du rappel. */
  aboveMinimumCompensatoryReminderFcfa: bigint;
  /** Σ part minimum du paiement direct. */
  minimumRemainingYearDirectCostFcfa: bigint;
  /** Σ part au-dessus du minimum du paiement direct. */
  aboveMinimumRemainingYearDirectCostFcfa: bigint;
  /** Plein effet : Σ planchers décembre × 12. */
  fullYearRunRateMinimumComplementCostFcfa: bigint;
  /** Plein effet : Σ au-dessus du minimum décembre × 12. */
  fullYearRunRateCompensationAboveMinimumCostFcfa: bigint;
}

export interface PreparedPopulationCalculationResult {
  budgetTargetResult: ResolvedBudgetTarget;
  evaluationMode: NineBoxMode;
  roundingPolicy: {
    mode: RoundingPolicy["mode"];
    stepFcfa: bigint;
  };
  allocationBasis: AllocationBasis;
  totalAllocationWeight: ExactAmount;
  calibrationCoefficient: ExactAmount;
  employees: EmployeeCompensationCalculationResult[];
  /** Alias explicite : total théorique ANNUEL. */
  annualTheoreticalAllocatedTotal: ExactAmount;
  annualActualOperationCostFcfa: bigint;
  annualTotalRoundingDelta: ExactAmount;
  campaignYear: number;
  retroactivityStartMonth: number;
  technicalApplicationMonth: number;
  /** Mois d’effet du minimum garanti (1–12) — contrat v8. */
  minimumGuaranteeEffectiveMonth: number;
  campaignCoveredMonthCount: number;
  totalBaseSalaryReminderFcfa: bigint;
  totalRemainingYearDirectIncreaseCostFcfa: bigint;
  totalAnnualActualBaseIncreaseCostFcfa: bigint;
  totalSeniorityReminderFcfa: bigint;
  totalRemainingYearDirectSeniorityImpactFcfa: bigint;
  totalAnnualSeniorityImpactFcfa: bigint;
  fullYearRunRatePromotionCostFcfa: bigint;
  fullYearRunRateCompensatoryCostFcfa: bigint;
  fullYearRunRateCombinedBaseMeasureCostFcfa: bigint;
  fullYearRunRateSeniorityImpactFcfa: bigint;
  promotedIncludedEmployeeCount: number;
  compensatoryCalibrationRate: ExactAmount;
  totalAnnualPromotionBudgetCostFcfa: bigint;
  availableAnnualCompensatoryBudget: ExactAmount;
  totalCombinedAnnualActualCostFcfa: bigint;
  annualCombinedRoundingDeltaFcfa: ExactAmount;
  totalPromotionCostAlreadyPaidBeforeTechnicalMonthFcfa: bigint;
  totalPromotionCostFromTechnicalMonthToDecemberFcfa: bigint;
  totalAnnualPromotionSeniorityImpactFcfa: bigint;
  totalCombinedAnnualSeniorityImpactFcfa: bigint;
  totalPromotionSeniorityAlreadyPaidBeforeTechnicalMonthFcfa: bigint;
  totalPromotionSeniorityFromTechnicalMonthToDecemberFcfa: bigint;
  minimumIncreaseMode: MinimumIncreaseMode;
  minimumMonthlyAmountFcfa: bigint | null;
  minimumIncreaseRate: ExactAmount | null;
  minimumIncreasePopulationEmployeeCount: number;
  minimumIncreaseExposureCount: number;
  totalMinimumComplementFloorCostFcfa: bigint;
  availableBudgetAfterPromotionsAndMinimumFcfa: ExactAmount;
  actualMinimumComplementPaidCostFcfa: bigint;
  actualCompensationAboveMinimumCostFcfa: bigint;
  minimumCompensatoryReminderFcfa: bigint;
  aboveMinimumCompensatoryReminderFcfa: bigint;
  minimumRemainingYearDirectCostFcfa: bigint;
  aboveMinimumRemainingYearDirectCostFcfa: bigint;
  fullYearRunRateMinimumComplementCostFcfa: bigint;
  fullYearRunRateCompensationAboveMinimumCostFcfa: bigint;
  populationSummary: PopulationCalculationSummary;
  explanationSteps: CalculationExplanationStep[];
}

/** Comparaison lexicographique stable (unités de code UTF-16), sans locale. */
export function compareEmployeeIdAsc(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
