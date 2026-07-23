import type { CampaignRepository } from "../infrastructure/database/repositories/campaignRepository";
import type { CompensationReferenceRepository } from "../infrastructure/database/repositories/compensationReferenceRepository";
import type {
  Campaign,
  CampaignDraftInput,
} from "../infrastructure/database/types";
import {
  MAX_REFERENCE_YEAR,
  MIN_REFERENCE_YEAR,
} from "../infrastructure/database/types";
import { AppError } from "./errors";

export type CampaignListFilter = "current" | "archived" | "all";

export class CampaignService {
  constructor(
    private readonly repository: CampaignRepository,
    private readonly referenceRepository?: CompensationReferenceRepository,
  ) {}

  listCampaigns(): Promise<Campaign[]> {
    return this.repository.listCampaigns();
  }

  getActiveCampaign(): Promise<Campaign | null> {
    return this.repository.getActiveCampaign();
  }

  /** Lecture seule pour la préparation de simulation (Lot 2B-1). */
  getCampaign(id: number): Promise<Campaign | null> {
    return this.repository.getCampaign(id);
  }

  async listFiltered(filter: CampaignListFilter): Promise<Campaign[]> {
    const campaigns = await this.repository.listCampaigns();
    if (filter === "all") return campaigns;
    if (filter === "archived") {
      return campaigns.filter((campaign) => campaign.status === "archived");
    }
    return campaigns.filter((campaign) => campaign.status !== "archived");
  }

  async createCampaign(input: CampaignDraftInput): Promise<Campaign> {
    const normalized = normalizeCampaignInput(input);
    validateCampaignInput(normalized);
    const campaign = await this.repository.createCampaign(normalized);
    // SQLite initialise déjà dans la transaction de création ;
    // le dépôt mémoire (et tout fallback) s’appuie sur ce point unique.
    if (this.referenceRepository) {
      await this.referenceRepository.initializeForCampaign(campaign.id);
    }
    return campaign;
  }

  async updateCampaign(
    id: number,
    input: CampaignDraftInput,
  ): Promise<Campaign> {
    const campaign = await this.requireCampaign(id);
    assertEditable(campaign);
    const normalized = normalizeCampaignInput(input);
    validateCampaignInput(normalized);
    return this.repository.updateCampaign(id, normalized);
  }

  async activateCampaign(id: number): Promise<Campaign> {
    const campaign = await this.requireCampaign(id);
    if (campaign.status === "archived") {
      throw new AppError(
        "INVALID_STATE",
        "Une campagne archivée doit d’abord être restaurée avant d’être activée.",
      );
    }
    if (campaign.status === "active") {
      return campaign;
    }
    return this.repository.activateCampaign(id);
  }

  async archiveCampaign(id: number): Promise<Campaign> {
    const campaign = await this.requireCampaign(id);
    if (campaign.status === "archived") {
      return campaign;
    }
    return this.repository.archiveCampaign(id);
  }

  async restoreCampaign(id: number): Promise<Campaign> {
    const campaign = await this.requireCampaign(id);
    if (campaign.status !== "archived") {
      throw new AppError(
        "INVALID_STATE",
        "Seule une campagne archivée peut être restaurée.",
      );
    }
    return this.repository.restoreCampaign(id);
  }

  private async requireCampaign(id: number): Promise<Campaign> {
    const campaign = await this.repository.getCampaign(id);
    if (!campaign) {
      throw new AppError("NOT_FOUND", "Campagne introuvable.");
    }
    return campaign;
  }
}

export function normalizeCampaignInput(
  input: CampaignDraftInput,
): CampaignDraftInput {
  return {
    name: input.name.trim(),
    referenceYear: Number(input.referenceYear),
    notes: input.notes.trim(),
  };
}

export function validateCampaignInput(input: CampaignDraftInput): void {
  if (!input.name) {
    throw new AppError("VALIDATION", "Le nom de la campagne est obligatoire.");
  }

  if (
    !Number.isInteger(input.referenceYear) ||
    input.referenceYear < MIN_REFERENCE_YEAR ||
    input.referenceYear > MAX_REFERENCE_YEAR
  ) {
    throw new AppError(
      "VALIDATION",
      `L’année de référence doit être un entier entre ${MIN_REFERENCE_YEAR} et ${MAX_REFERENCE_YEAR}.`,
    );
  }
}

function assertEditable(campaign: Campaign): void {
  if (campaign.status === "archived") {
    throw new AppError(
      "INVALID_STATE",
      "Une campagne archivée ne peut pas être modifiée.",
    );
  }
}
