import {
  DEFAULT_GRADES,
  DEFAULT_JOB_FAMILIES,
  DEFAULT_NINE_BOX_FACTORS,
  DEFAULT_NINE_BOX_MODE,
  DEFAULT_NINE_BOX_ORIENTATION,
  DEFAULT_PERFORMANCE_FACTORS,
  DEFAULT_POTENTIAL_FACTORS,
  DEFAULT_SALARY_POSITIONS,
} from "../../domain/compensationReference/defaults";
import type { SqlDatabase } from "./types";

/**
 * Initialise le référentiel d’une campagne de façon idempotente.
 * Ne crée pas de doublons et n’écrase pas les valeurs déjà configurées.
 */
export async function seedCampaignReferences(
  db: SqlDatabase,
  campaignId: number,
  now: string,
): Promise<void> {
  await db.execute(
    `INSERT OR IGNORE INTO campaign_reference_config
       (campaign_id, nine_box_mode, nine_box_orientation, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      campaignId,
      DEFAULT_NINE_BOX_MODE,
      DEFAULT_NINE_BOX_ORIENTATION,
      now,
      now,
    ],
  );

  for (const family of DEFAULT_JOB_FAMILIES) {
    await db.execute(
      `INSERT OR IGNORE INTO campaign_job_families
         (campaign_id, code, label, sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [campaignId, family.code, family.label, family.sortOrder, now, now],
    );
  }

  for (const grade of DEFAULT_GRADES) {
    await db.execute(
      `INSERT OR IGNORE INTO campaign_grades
         (campaign_id, code, label, sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [campaignId, grade.code, grade.label, grade.sortOrder, now, now],
    );
  }

  await db.execute(
    `INSERT OR IGNORE INTO campaign_salary_grid
       (campaign_id, job_family_id, grade_id, s0_amount, created_at, updated_at)
     SELECT f.campaign_id, f.id, g.id, NULL, $1, $2
     FROM campaign_job_families f
     INNER JOIN campaign_grades g ON g.campaign_id = f.campaign_id
     WHERE f.campaign_id = $3`,
    [now, now, campaignId],
  );

  for (const position of DEFAULT_SALARY_POSITIONS) {
    await db.execute(
      `INSERT OR IGNORE INTO campaign_salary_positions
         (campaign_id, code, label, sort_order, reference_ratio_bps,
          position_factor_milli, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        campaignId,
        position.code,
        position.label,
        position.sortOrder,
        position.referenceRatioBps,
        position.positionFactorMilli,
        now,
        now,
      ],
    );
  }

  for (const factor of DEFAULT_PERFORMANCE_FACTORS) {
    await db.execute(
      `INSERT OR IGNORE INTO campaign_performance_factors
         (campaign_id, level, label, sort_order, factor_milli, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        campaignId,
        factor.level,
        factor.label,
        factor.sortOrder,
        factor.factorMilli,
        now,
        now,
      ],
    );
  }

  for (const factor of DEFAULT_POTENTIAL_FACTORS) {
    await db.execute(
      `INSERT OR IGNORE INTO campaign_potential_factors
         (campaign_id, level, label, sort_order, factor_milli, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        campaignId,
        factor.level,
        factor.label,
        factor.sortOrder,
        factor.factorMilli,
        now,
        now,
      ],
    );
  }

  for (const factor of DEFAULT_NINE_BOX_FACTORS) {
    await db.execute(
      `INSERT OR IGNORE INTO campaign_nine_box_factors
         (campaign_id, box_code, performance_level, potential_level,
          factor_milli, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        campaignId,
        factor.boxCode,
        factor.performanceLevel,
        factor.potentialLevel,
        factor.factorMilli,
        now,
        now,
      ],
    );
  }
}
