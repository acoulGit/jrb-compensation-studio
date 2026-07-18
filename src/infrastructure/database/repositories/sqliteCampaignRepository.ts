import { getDatabase, utcNowIso } from "../connection";
import { mapCampaign } from "../mappers";
import { seedCampaignReferences } from "../seedCampaignReferences";
import type { Campaign, CampaignDraftInput, CampaignRow } from "../types";
import type { CampaignRepository } from "./campaignRepository";

const CAMPAIGN_SELECT = `SELECT id, name, reference_year, status, notes,
                                created_at, updated_at, archived_at
                         FROM campaigns`;

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
    let campaignId: number;

    try {
      await db.execute("BEGIN IMMEDIATE");
      const result = (await db.execute(
        `INSERT INTO campaigns (name, reference_year, status, notes, created_at, updated_at, archived_at)
         VALUES ($1, $2, 'draft', $3, $4, $5, NULL)`,
        [input.name, input.referenceYear, input.notes, now, now],
      )) as { lastInsertId: number };
      campaignId = result.lastInsertId;
      await seedCampaignReferences(db, campaignId, now);
      await db.execute("COMMIT");
    } catch (error) {
      try {
        await db.execute("ROLLBACK");
      } catch {
        // La connexion peut déjà être hors transaction.
      }
      throw error;
    }

    const created = await this.getCampaign(campaignId);
    if (!created) {
      throw new Error("La campagne créée est introuvable.");
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
      throw new Error("La campagne modifiée est introuvable.");
    }
    return updated;
  }

  async activateCampaign(id: number): Promise<Campaign> {
    const db = await getDatabase();
    const now = utcNowIso();

    try {
      await db.execute("BEGIN IMMEDIATE");
      await db.execute(
        `UPDATE campaigns
         SET status = 'draft', updated_at = $1
         WHERE status = 'active'`,
        [now],
      );
      await db.execute(
        `UPDATE campaigns
         SET status = 'active', archived_at = NULL, updated_at = $1
         WHERE id = $2`,
        [now, id],
      );
      await db.execute("COMMIT");
    } catch (error) {
      try {
        await db.execute("ROLLBACK");
      } catch {
        // La connexion peut déjà être hors transaction.
      }
      throw error;
    }

    const activated = await this.getCampaign(id);
    if (!activated || activated.status !== "active") {
      throw new Error("L’activation de la campagne a échoué.");
    }
    return activated;
  }

  async archiveCampaign(id: number): Promise<Campaign> {
    const db = await getDatabase();
    const now = utcNowIso();
    await db.execute(
      `UPDATE campaigns
       SET status = 'archived', archived_at = $1, updated_at = $2
       WHERE id = $3`,
      [now, now, id],
    );

    const archived = await this.getCampaign(id);
    if (!archived || archived.status !== "archived") {
      throw new Error("L’archivage de la campagne a échoué.");
    }
    return archived;
  }

  async restoreCampaign(id: number): Promise<Campaign> {
    const db = await getDatabase();
    await db.execute(
      `UPDATE campaigns
       SET status = 'draft', archived_at = NULL, updated_at = $1
       WHERE id = $2`,
      [utcNowIso(), id],
    );

    const restored = await this.getCampaign(id);
    if (!restored || restored.status !== "draft") {
      throw new Error("La restauration de la campagne a échoué.");
    }
    return restored;
  }
}
