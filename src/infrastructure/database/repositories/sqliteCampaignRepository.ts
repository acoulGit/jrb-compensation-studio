import { invoke } from "@tauri-apps/api/core";
import { AppError } from "../../../services/errors";
import { getDatabase, utcNowIso } from "../connection";
import { mapCampaign } from "../mappers";
import { seedCampaignReferences } from "../seedCampaignReferences";
import type { Campaign, CampaignDraftInput, CampaignRow } from "../types";
import type { CampaignRepository } from "./campaignRepository";

const CAMPAIGN_SELECT = `SELECT id, name, reference_year, status, notes,
                                created_at, updated_at, archived_at
                         FROM campaigns`;

interface CampaignCommandDto {
  id: number;
  name: string;
  referenceYear: number;
  status: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

function mapCommandCampaign(dto: CampaignCommandDto): Campaign {
  return mapCampaign({
    id: dto.id,
    name: dto.name,
    reference_year: dto.referenceYear,
    status: dto.status,
    notes: dto.notes,
    created_at: dto.createdAt,
    updated_at: dto.updatedAt,
    archived_at: dto.archivedAt,
  });
}

function invokeWriteError(error: unknown, fallback: string): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (typeof error === "string" && error.trim()) {
    return new AppError("PERSISTENCE", error);
  }
  if (error instanceof Error && error.message.trim()) {
    return new AppError("PERSISTENCE", error.message);
  }
  return new AppError("PERSISTENCE", fallback);
}

export class SqliteCampaignRepository implements CampaignRepository {
  async listCampaigns(): Promise<Campaign[]> {
    const db = await getDatabase();
    const rows = await db.select<CampaignRow[]>(
      `${CAMPAIGN_SELECT}
       ORDER BY
         CASE status
           WHEN 'active' THEN 0
           WHEN 'draft' THEN 1
           ELSE 2
         END,
         updated_at DESC,
         id DESC`,
    );
    return rows.map(mapCampaign);
  }

  async getCampaign(id: number): Promise<Campaign | null> {
    const db = await getDatabase();
    const rows = await db.select<CampaignRow[]>(
      `${CAMPAIGN_SELECT} WHERE id = $1`,
      [id],
    );
    const row = rows[0];
    return row ? mapCampaign(row) : null;
  }

  async getActiveCampaign(): Promise<Campaign | null> {
    const db = await getDatabase();
    const rows = await db.select<CampaignRow[]>(
      `${CAMPAIGN_SELECT} WHERE status = 'active' LIMIT 1`,
    );
    const row = rows[0];
    return row ? mapCampaign(row) : null;
  }

  async createCampaign(input: CampaignDraftInput): Promise<Campaign> {
    const db = await getDatabase();
    const now = utcNowIso();

    // Pas de BEGIN/COMMIT via le pool plugin SQL (max_connections=10) :
    // un BEGIN IMMEDIATE peut rester ouvert sur une connexion alors que
    // COMMIT part sur une autre, ce qui verrouille ensuite les écritures.
    const result = (await db.execute(
      `INSERT INTO campaigns (name, reference_year, status, notes, created_at, updated_at, archived_at)
       VALUES ($1, $2, 'draft', $3, $4, $5, NULL)`,
      [input.name, input.referenceYear, input.notes, now, now],
    )) as { lastInsertId: number };
    const campaignId = result.lastInsertId;
    await seedCampaignReferences(db, campaignId, now);

    const created = await this.getCampaign(campaignId);
    if (!created) {
      throw new AppError("PERSISTENCE", "La campagne créée est introuvable.");
    }
    return created;
  }

  async updateCampaign(
    id: number,
    input: CampaignDraftInput,
  ): Promise<Campaign> {
    const db = await getDatabase();
    await db.execute(
      `UPDATE campaigns
       SET name = $1,
           reference_year = $2,
           notes = $3,
           updated_at = $4
       WHERE id = $5`,
      [input.name, input.referenceYear, input.notes, utcNowIso(), id],
    );

    const updated = await this.getCampaign(id);
    if (!updated) {
      throw new AppError("PERSISTENCE", "La campagne modifiée est introuvable.");
    }
    return updated;
  }

  async activateCampaign(id: number): Promise<Campaign> {
    try {
      const dto = await invoke<CampaignCommandDto>("activate_campaign", {
        input: { campaignId: id },
      });
      return mapCommandCampaign(dto);
    } catch (error) {
      throw invokeWriteError(error, "L’activation de la campagne a échoué.");
    }
  }

  async archiveCampaign(id: number): Promise<Campaign> {
    try {
      const dto = await invoke<CampaignCommandDto>("archive_campaign", {
        input: { campaignId: id },
      });
      return mapCommandCampaign(dto);
    } catch (error) {
      throw invokeWriteError(error, "L’archivage de la campagne a échoué.");
    }
  }

  async restoreCampaign(id: number): Promise<Campaign> {
    try {
      const dto = await invoke<CampaignCommandDto>("restore_campaign", {
        input: { campaignId: id },
      });
      return mapCommandCampaign(dto);
    } catch (error) {
      throw invokeWriteError(error, "La restauration de la campagne a échoué.");
    }
  }
}
