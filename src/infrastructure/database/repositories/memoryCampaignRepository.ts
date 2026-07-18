import type { Campaign, CampaignDraftInput, CampaignStatus } from "../types";
import type { CampaignRepository } from "./campaignRepository";

export class MemoryCampaignRepository implements CampaignRepository {
  private campaigns: Campaign[] = [];
  private nextId = 1;

  constructor(seed: Campaign[] = []) {
    this.campaigns = seed.map((campaign) => ({ ...campaign }));
    this.nextId =
      this.campaigns.reduce((max, campaign) => Math.max(max, campaign.id), 0) +
      1;
  }

  async listCampaigns(): Promise<Campaign[]> {
    const rank: Record<CampaignStatus, number> = {
      active: 0,
      draft: 1,
      archived: 2,
    };

    return [...this.campaigns]
      .sort((left, right) => {
        const byStatus = rank[left.status] - rank[right.status];
        if (byStatus !== 0) return byStatus;
        const byUpdated = right.updatedAt.localeCompare(left.updatedAt);
        if (byUpdated !== 0) return byUpdated;
        return right.id - left.id;
      })
      .map((campaign) => ({ ...campaign }));
  }

  async getCampaign(id: number): Promise<Campaign | null> {
    const campaign = this.campaigns.find((item) => item.id === id);
    return campaign ? { ...campaign } : null;
  }

  async getActiveCampaign(): Promise<Campaign | null> {
    const campaign = this.campaigns.find((item) => item.status === "active");
    return campaign ? { ...campaign } : null;
  }

  async createCampaign(input: CampaignDraftInput): Promise<Campaign> {
    const now = new Date().toISOString();
    const campaign: Campaign = {
      id: this.nextId++,
      name: input.name,
      referenceYear: input.referenceYear,
      status: "draft",
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    this.campaigns.push(campaign);
    return { ...campaign };
  }

  async updateCampaign(
    id: number,
    input: CampaignDraftInput,
  ): Promise<Campaign> {
    const index = this.campaigns.findIndex((item) => item.id === id);
    if (index < 0) {
      throw new Error("La campagne modifiée est introuvable.");
    }

    const current = this.campaigns[index];
    const updated: Campaign = {
      ...current,
      name: input.name,
      referenceYear: input.referenceYear,
      notes: input.notes,
      updatedAt: new Date().toISOString(),
    };
    this.campaigns[index] = updated;
    return { ...updated };
  }

  async activateCampaign(id: number): Promise<Campaign> {
    const target = this.campaigns.find((item) => item.id === id);
    if (!target) {
      throw new Error("La campagne à activer est introuvable.");
    }

    const now = new Date().toISOString();
    this.campaigns = this.campaigns.map((campaign) => {
      if (campaign.id === id) {
        return {
          ...campaign,
          status: "active",
          archivedAt: null,
          updatedAt: now,
        };
      }
      if (campaign.status === "active") {
        return { ...campaign, status: "draft", updatedAt: now };
      }
      return campaign;
    });

    const activated = await this.getCampaign(id);
    if (!activated) {
      throw new Error("L’activation de la campagne a échoué.");
    }
    return activated;
  }

  async archiveCampaign(id: number): Promise<Campaign> {
    const index = this.campaigns.findIndex((item) => item.id === id);
    if (index < 0) {
      throw new Error("La campagne à archiver est introuvable.");
    }

    const now = new Date().toISOString();
    this.campaigns[index] = {
      ...this.campaigns[index],
      status: "archived",
      archivedAt: now,
      updatedAt: now,
    };
    return { ...this.campaigns[index] };
  }

  async restoreCampaign(id: number): Promise<Campaign> {
    const index = this.campaigns.findIndex((item) => item.id === id);
    if (index < 0) {
      throw new Error("La campagne à restaurer est introuvable.");
    }

    this.campaigns[index] = {
      ...this.campaigns[index],
      status: "draft",
      archivedAt: null,
      updatedAt: new Date().toISOString(),
    };
    return { ...this.campaigns[index] };
  }
}
