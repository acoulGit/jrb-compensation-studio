import { computeReferenceCompleteness } from "../domain/compensationReference/completeness";
import {
  ConversionError,
  displayToFactorMilli,
} from "../domain/compensationReference/conversions";
import {
  GRADE_COUNT,
  JOB_FAMILY_COUNT,
  MAX_CODE_LENGTH,
  MAX_LABEL_LENGTH,
  NINE_BOX_MODES,
  SALARY_GRID_CELL_COUNT,
  SALARY_POSITION_COUNT,
  type CompensationReferenceSet,
  type LevelFactorInput,
  type NineBoxFactorInput,
  type NineBoxMode,
  type NineBoxOrientation,
  type ReferenceCompleteness,
  type SalaryGridCellInput,
  type SalaryPositionFactorInput,
  type StructureItemInput,
} from "../domain/compensationReference/models";
import { NINE_BOX_ORIENTATIONS } from "../domain/compensationReference/nineBoxOrientation";
import { isValidFactorMilli } from "../domain/compensationReference/validationHelpers";
import type { CampaignRepository } from "../infrastructure/database/repositories/campaignRepository";
import type { CompensationReferenceRepository } from "../infrastructure/database/repositories/compensationReferenceRepository";
import type { Campaign } from "../infrastructure/database/types";
import { AppError } from "./errors";

export class CompensationReferenceService {
  constructor(
    private readonly referenceRepository: CompensationReferenceRepository,
    private readonly campaignRepository: CampaignRepository,
  ) {}

  async ensureInitialized(campaignId: number): Promise<CompensationReferenceSet> {
    await this.requireCampaign(campaignId);
    let set = await this.referenceRepository.getReferenceSet(campaignId);
    if (!set) {
      await this.referenceRepository.initializeForCampaign(campaignId);
      set = await this.referenceRepository.getReferenceSet(campaignId);
    }
    if (!set) {
      throw new AppError(
        "PERSISTENCE",
        "Le référentiel n’a pas pu être initialisé.",
      );
    }
    return set;
  }

  async getReferenceSet(campaignId: number): Promise<CompensationReferenceSet> {
    return this.ensureInitialized(campaignId);
  }

  async getCompleteness(campaignId: number): Promise<ReferenceCompleteness> {
    const set = await this.getReferenceSet(campaignId);
    return computeReferenceCompleteness(set);
  }

  async updateStructure(
    campaignId: number,
    jobFamilies: StructureItemInput[],
    grades: StructureItemInput[],
  ): Promise<CompensationReferenceSet> {
    const campaign = await this.requireEditableCampaign(campaignId);
    await this.ensureInitialized(campaign.id);

    const normalizedFamilies = jobFamilies.map((item) =>
      normalizeStructureItem(item),
    );
    const normalizedGrades = grades.map((item) => normalizeStructureItem(item));

    validateStructureCardinality(normalizedFamilies, normalizedGrades);
    validateStructureItems(normalizedFamilies, "famille");
    validateStructureItems(normalizedGrades, "grade");

    return this.referenceRepository.updateStructure(
      campaignId,
      normalizedFamilies,
      normalizedGrades,
    );
  }

  async updateSalaryGrid(
    campaignId: number,
    cells: SalaryGridCellInput[],
  ): Promise<CompensationReferenceSet> {
    const campaign = await this.requireEditableCampaign(campaignId);
    const current = await this.ensureInitialized(campaign.id);

    if (cells.length === 0) {
      throw new AppError(
        "VALIDATION",
        "Aucune cellule S0 à enregistrer.",
      );
    }

    const validated = cells.map((cell) => {
      validateSalaryAmount(cell.s0Amount);
      const exists = current.salaryGrid.some(
        (item) =>
          item.jobFamilyId === cell.jobFamilyId &&
          item.gradeId === cell.gradeId,
      );
      if (!exists) {
        throw new AppError(
          "VALIDATION",
          "Une cellule S0 ne correspond pas à la grille de la campagne.",
        );
      }
      return cell;
    });

    return this.referenceRepository.updateSalaryGrid(campaignId, validated);
  }

  async updateSalaryPositionFactors(
    campaignId: number,
    updates: SalaryPositionFactorInput[],
  ): Promise<CompensationReferenceSet> {
    const campaign = await this.requireEditableCampaign(campaignId);
    const current = await this.ensureInitialized(campaign.id);

    if (current.salaryPositions.length !== SALARY_POSITION_COUNT) {
      throw new AppError(
        "VALIDATION",
        "Le référentiel de positions est incomplet.",
      );
    }

    const validated = updates.map((update) => {
      if (!isValidFactorMilli(update.positionFactorMilli)) {
        throw new AppError(
          "VALIDATION",
          "Coefficient de position invalide (0 à 10 inclus).",
        );
      }
      if (!current.salaryPositions.some((item) => item.id === update.id)) {
        throw new AppError(
          "VALIDATION",
          "Position salariale introuvable dans cette campagne.",
        );
      }
      return update;
    });

    return this.referenceRepository.updateSalaryPositionFactors(
      campaignId,
      validated,
    );
  }

  async updatePerformanceFactors(
    campaignId: number,
    updates: LevelFactorInput[],
  ): Promise<CompensationReferenceSet> {
    const campaign = await this.requireEditableCampaign(campaignId);
    await this.ensureInitialized(campaign.id);
    validateLevelFactorUpdates(updates);
    return this.referenceRepository.updatePerformanceFactors(
      campaignId,
      updates,
    );
  }

  async updatePotentialFactors(
    campaignId: number,
    updates: LevelFactorInput[],
  ): Promise<CompensationReferenceSet> {
    const campaign = await this.requireEditableCampaign(campaignId);
    await this.ensureInitialized(campaign.id);
    validateLevelFactorUpdates(updates);
    return this.referenceRepository.updatePotentialFactors(campaignId, updates);
  }

  async updateNineBoxFactors(
    campaignId: number,
    updates: NineBoxFactorInput[],
  ): Promise<CompensationReferenceSet> {
    const campaign = await this.requireEditableCampaign(campaignId);
    await this.ensureInitialized(campaign.id);

    for (const update of updates) {
      if (!Number.isInteger(update.boxCode) || update.boxCode < 1 || update.boxCode > 9) {
        throw new AppError("VALIDATION", "Code 9-Box invalide (1 à 9).");
      }
      if (!isValidFactorMilli(update.factorMilli)) {
        throw new AppError(
          "VALIDATION",
          "Coefficient 9-Box invalide (0 à 10 inclus).",
        );
      }
    }

    return this.referenceRepository.updateNineBoxFactors(campaignId, updates);
  }

  async updateNineBoxMode(
    campaignId: number,
    mode: NineBoxMode,
  ): Promise<CompensationReferenceSet> {
    const campaign = await this.requireEditableCampaign(campaignId);
    await this.ensureInitialized(campaign.id);
    if (!(NINE_BOX_MODES as readonly string[]).includes(mode)) {
      throw new AppError("VALIDATION", "Mode 9-Box non reconnu.");
    }
    return this.referenceRepository.updateNineBoxMode(campaignId, mode);
  }

  async updateNineBoxOrientation(
    campaignId: number,
    orientation: NineBoxOrientation,
  ): Promise<CompensationReferenceSet> {
    const campaign = await this.requireEditableCampaign(campaignId);
    await this.ensureInitialized(campaign.id);
    if (!(NINE_BOX_ORIENTATIONS as readonly string[]).includes(orientation)) {
      throw new AppError("VALIDATION", "Orientation 9-Box non reconnue.");
    }
    return this.referenceRepository.updateNineBoxOrientation(
      campaignId,
      orientation,
    );
  }

  /** Convertit une saisie décimale conviviale vers factor_milli. */
  parseFactorInput(raw: string | number): number {
    try {
      if (typeof raw === "number") {
        return displayToFactorMilli(raw);
      }
      const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
      if (!normalized) {
        throw new AppError("VALIDATION", "Le coefficient est obligatoire.");
      }
      return displayToFactorMilli(Number(normalized));
    } catch (error) {
      if (error instanceof ConversionError) {
        throw new AppError("VALIDATION", error.message);
      }
      throw error;
    }
  }

  private async requireCampaign(id: number): Promise<Campaign> {
    const campaign = await this.campaignRepository.getCampaign(id);
    if (!campaign) {
      throw new AppError("NOT_FOUND", "Campagne introuvable.");
    }
    return campaign;
  }

  private async requireEditableCampaign(id: number): Promise<Campaign> {
    const campaign = await this.requireCampaign(id);
    if (campaign.status === "archived") {
      throw new AppError(
        "INVALID_STATE",
        "Cette campagne est archivée : ses référentiels sont en lecture seule. Restaurez-la pour la modifier.",
      );
    }
    return campaign;
  }
}

function normalizeStructureItem(item: StructureItemInput): StructureItemInput {
  return {
    id: item.id,
    code: item.code.trim().toUpperCase(),
    label: item.label.trim(),
  };
}

function validateStructureCardinality(
  families: StructureItemInput[],
  grades: StructureItemInput[],
): void {
  if (families.length !== JOB_FAMILY_COUNT) {
    throw new AppError(
      "VALIDATION",
      `Exactement ${JOB_FAMILY_COUNT} familles sont attendues.`,
    );
  }
  if (grades.length !== GRADE_COUNT) {
    throw new AppError(
      "VALIDATION",
      `Exactement ${GRADE_COUNT} grades sont attendus.`,
    );
  }
}

function validateStructureItems(
  items: StructureItemInput[],
  kind: "famille" | "grade",
): void {
  const codes = new Set<string>();
  for (const item of items) {
    if (!item.code) {
      throw new AppError(
        "VALIDATION",
        `Le code de ${kind} est obligatoire.`,
      );
    }
    if (!item.label) {
      throw new AppError(
        "VALIDATION",
        `Le libellé de ${kind} est obligatoire.`,
      );
    }
    if (item.code.length > MAX_CODE_LENGTH) {
      throw new AppError(
        "VALIDATION",
        `Le code de ${kind} est limité à ${MAX_CODE_LENGTH} caractères.`,
      );
    }
    if (item.label.length > MAX_LABEL_LENGTH) {
      throw new AppError(
        "VALIDATION",
        `Le libellé de ${kind} est limité à ${MAX_LABEL_LENGTH} caractères.`,
      );
    }
    if (codes.has(item.code)) {
      throw new AppError(
        "VALIDATION",
        `Le code « ${item.code} » est dupliqué dans la campagne.`,
      );
    }
    codes.add(item.code);
  }
}

function validateSalaryAmount(amount: number | null): void {
  if (amount === null) {
    return;
  }
  if (!Number.isInteger(amount)) {
    throw new AppError(
      "VALIDATION",
      "Le montant S0 doit être un entier en FCFA (sans décimale).",
    );
  }
  if (amount === 0) {
    throw new AppError(
      "VALIDATION",
      "Le montant S0 ne peut pas être égal à zéro. Laissez vide pour « Non configuré ».",
    );
  }
  if (amount < 0) {
    throw new AppError(
      "VALIDATION",
      "Le montant S0 ne peut pas être négatif.",
    );
  }
}

function validateLevelFactorUpdates(updates: LevelFactorInput[]): void {
  for (const update of updates) {
    if (!isValidFactorMilli(update.factorMilli)) {
      throw new AppError(
        "VALIDATION",
        "Coefficient invalide (0 à 10 inclus).",
      );
    }
  }
}

export function countConfiguredSalaryCells(
  set: CompensationReferenceSet,
): { filled: number; total: number } {
  const filled = set.salaryGrid.filter(
    (cell) => cell.s0Amount !== null && cell.s0Amount > 0,
  ).length;
  return { filled, total: SALARY_GRID_CELL_COUNT };
}
