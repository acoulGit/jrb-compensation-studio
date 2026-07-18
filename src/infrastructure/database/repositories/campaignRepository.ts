import type { Campaign, CampaignDraftInput } from "../types";

export interface CampaignRepository {
  listCampaigns(): Promise<Campaign[]>;
  getCampaign(id: number): Promise<Campaign | null>;
  getActiveCampaign(): Promise<Campaign | null>;
  createCampaign(input: CampaignDraftInput): Promise<Campaign>;
  updateCampaign(id: number, input: CampaignDraftInput): Promise<Campaign>;
  activateCampaign(id: number): Promise<Campaign>;
  archiveCampaign(id: number): Promise<Campaign>;
  restoreCampaign(id: number): Promise<Campaign>;
}
