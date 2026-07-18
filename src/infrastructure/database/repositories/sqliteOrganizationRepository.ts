import { getDatabase, utcNowIso } from "../connection";
import { mapOrganizationProfile } from "../mappers";
import type {
  OrganizationProfile,
  OrganizationProfileInput,
  OrganizationProfileRow,
} from "../types";
import type { OrganizationRepository } from "./organizationRepository";

export class SqliteOrganizationRepository implements OrganizationRepository {
  async getProfile(): Promise<OrganizationProfile> {
    const db = await getDatabase();
    const rows = await db.select<OrganizationProfileRow[]>(
      `SELECT id, product_name, organization_name, organization_short_name,
              application_subtitle, report_footer, created_at, updated_at
       FROM organization_profile
       WHERE id = 1`,
    );

    const row = rows[0];
    if (!row) {
      throw new Error("Profil organisation introuvable dans la base locale.");
    }

    return mapOrganizationProfile(row);
  }

  async updateProfile(
    input: OrganizationProfileInput,
  ): Promise<OrganizationProfile> {
    const db = await getDatabase();
    const updatedAt = utcNowIso();

    await db.execute(
      `UPDATE organization_profile
       SET product_name = $1,
           organization_name = $2,
           organization_short_name = $3,
           application_subtitle = $4,
           report_footer = $5,
           updated_at = $6
       WHERE id = 1`,
      [
        input.productName,
        input.organizationName,
        input.organizationShortName,
        input.applicationSubtitle,
        input.reportFooter,
        updatedAt,
      ],
    );

    return this.getProfile();
  }
}
