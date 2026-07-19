import { computeReferenceCompleteness } from "../../../domain/compensationReference/completeness";
import type {
  CompensationReferenceSet,
  LevelFactorInput,
  NineBoxFactorInput,
  NineBoxMode,
  ReferenceCompleteness,
  SalaryGridCellInput,
  SalaryPositionFactorInput,
  StructureItemInput,
} from "../../../domain/compensationReference/models";
import { getDatabase, utcNowIso } from "../connection";
import {
  assembleReferenceSet,
  mapGrade,
  mapJobFamily,
  mapNineBoxFactor,
  mapPerformanceFactor,
  mapPotentialFactor,
  mapReferenceConfig,
  mapSalaryGridCell,
  mapSalaryPosition,
} from "../referenceMappers";
import type {
  GradeRow,
  JobFamilyRow,
  LevelFactorRow,
  NineBoxFactorRow,
  ReferenceConfigRow,
  SalaryGridRow,
  SalaryPositionRow,
} from "../referenceTypes";
import { seedCampaignReferences } from "../seedCampaignReferences";
import type { CompensationReferenceRepository } from "./compensationReferenceRepository";

export class SqliteCompensationReferenceRepository
  implements CompensationReferenceRepository
{
  async initializeForCampaign(campaignId: number): Promise<void> {
    const db = await getDatabase();
    await seedCampaignReferences(db, campaignId, utcNowIso());
  }

  async getReferenceSet(
    campaignId: number,
  ): Promise<CompensationReferenceSet | null> {
    const db = await getDatabase();
    const configs = await db.select<ReferenceConfigRow[]>(
      `SELECT campaign_id, nine_box_mode, created_at, updated_at
       FROM campaign_reference_config
       WHERE campaign_id = $1`,
      [campaignId],
    );
    const configRow = configs[0];
    if (!configRow) {
      return null;
    }

    const [families, grades, grid, positions, performance, potential, nineBox] =
      await Promise.all([
        db.select<JobFamilyRow[]>(
          `SELECT id, campaign_id, code, label, sort_order, created_at, updated_at
           FROM campaign_job_families
           WHERE campaign_id = $1
           ORDER BY sort_order`,
          [campaignId],
        ),
        db.select<GradeRow[]>(
          `SELECT id, campaign_id, code, label, sort_order, created_at, updated_at
           FROM campaign_grades
           WHERE campaign_id = $1
           ORDER BY sort_order`,
          [campaignId],
        ),
        db.select<SalaryGridRow[]>(
          `SELECT campaign_id, job_family_id, grade_id, s0_amount, created_at, updated_at
           FROM campaign_salary_grid
           WHERE campaign_id = $1`,
          [campaignId],
        ),
        db.select<SalaryPositionRow[]>(
          `SELECT id, campaign_id, code, label, sort_order, reference_ratio_bps,
                  position_factor_milli, created_at, updated_at
           FROM campaign_salary_positions
           WHERE campaign_id = $1
           ORDER BY sort_order`,
          [campaignId],
        ),
        db.select<LevelFactorRow[]>(
          `SELECT campaign_id, level, label, sort_order, factor_milli, created_at, updated_at
           FROM campaign_performance_factors
           WHERE campaign_id = $1
           ORDER BY sort_order`,
          [campaignId],
        ),
        db.select<LevelFactorRow[]>(
          `SELECT campaign_id, level, label, sort_order, factor_milli, created_at, updated_at
           FROM campaign_potential_factors
           WHERE campaign_id = $1
           ORDER BY sort_order`,
          [campaignId],
        ),
        db.select<NineBoxFactorRow[]>(
          `SELECT campaign_id, box_code, performance_level, potential_level,
                  factor_milli, created_at, updated_at
           FROM campaign_nine_box_factors
           WHERE campaign_id = $1
           ORDER BY box_code`,
          [campaignId],
        ),
      ]);

    return assembleReferenceSet(
      campaignId,
      mapReferenceConfig(configRow),
      families.map(mapJobFamily),
      grades.map(mapGrade),
      grid.map(mapSalaryGridCell),
      positions.map(mapSalaryPosition),
      performance.map(mapPerformanceFactor),
      potential.map(mapPotentialFactor),
      nineBox.map(mapNineBoxFactor),
    );
  }

  async updateStructure(
    campaignId: number,
    jobFamilies: StructureItemInput[],
    grades: StructureItemInput[],
  ): Promise<CompensationReferenceSet> {
    const db = await getDatabase();
    const now = utcNowIso();

    // Pas de BEGIN via le pool plugin SQL (risque de transaction orpheline).
    for (const family of jobFamilies) {
      await db.execute(
        `UPDATE campaign_job_families
         SET code = $1, label = $2, updated_at = $3
         WHERE id = $4 AND campaign_id = $5`,
        [family.code, family.label, now, family.id, campaignId],
      );
    }
    for (const grade of grades) {
      await db.execute(
        `UPDATE campaign_grades
         SET code = $1, label = $2, updated_at = $3
         WHERE id = $4 AND campaign_id = $5`,
        [grade.code, grade.label, now, grade.id, campaignId],
      );
    }
    await db.execute(
      `UPDATE campaign_reference_config
       SET updated_at = $1
       WHERE campaign_id = $2`,
      [now, campaignId],
    );

    const set = await this.getReferenceSet(campaignId);
    if (!set) {
      throw new Error("Référentiel introuvable après mise à jour structure.");
    }
    return set;
  }

  async updateSalaryGrid(
    campaignId: number,
    cells: SalaryGridCellInput[],
  ): Promise<CompensationReferenceSet> {
    const db = await getDatabase();
    const now = utcNowIso();

    for (const cell of cells) {
      await db.execute(
        `UPDATE campaign_salary_grid
         SET s0_amount = $1, updated_at = $2
         WHERE campaign_id = $3
           AND job_family_id = $4
           AND grade_id = $5`,
        [cell.s0Amount, now, campaignId, cell.jobFamilyId, cell.gradeId],
      );
    }
    await db.execute(
      `UPDATE campaign_reference_config
       SET updated_at = $1
       WHERE campaign_id = $2`,
      [now, campaignId],
    );

    const set = await this.getReferenceSet(campaignId);
    if (!set) {
      throw new Error("Référentiel introuvable après mise à jour grille S0.");
    }
    return set;
  }

  async updateSalaryPositionFactors(
    campaignId: number,
    updates: SalaryPositionFactorInput[],
  ): Promise<CompensationReferenceSet> {
    const db = await getDatabase();
    const now = utcNowIso();

    for (const update of updates) {
      await db.execute(
        `UPDATE campaign_salary_positions
         SET position_factor_milli = $1, updated_at = $2
         WHERE id = $3 AND campaign_id = $4`,
        [update.positionFactorMilli, now, update.id, campaignId],
      );
    }
    await db.execute(
      `UPDATE campaign_reference_config
       SET updated_at = $1
       WHERE campaign_id = $2`,
      [now, campaignId],
    );

    const set = await this.getReferenceSet(campaignId);
    if (!set) {
      throw new Error("Référentiel introuvable après mise à jour positions.");
    }
    return set;
  }

  async updatePerformanceFactors(
    campaignId: number,
    updates: LevelFactorInput[],
  ): Promise<CompensationReferenceSet> {
    const db = await getDatabase();
    const now = utcNowIso();

    for (const update of updates) {
      await db.execute(
        `UPDATE campaign_performance_factors
         SET factor_milli = $1, updated_at = $2
         WHERE campaign_id = $3 AND level = $4`,
        [update.factorMilli, now, campaignId, update.level],
      );
    }
    await db.execute(
      `UPDATE campaign_reference_config
       SET updated_at = $1
       WHERE campaign_id = $2`,
      [now, campaignId],
    );

    const set = await this.getReferenceSet(campaignId);
    if (!set) {
      throw new Error(
        "Référentiel introuvable après mise à jour Performance.",
      );
    }
    return set;
  }

  async updatePotentialFactors(
    campaignId: number,
    updates: LevelFactorInput[],
  ): Promise<CompensationReferenceSet> {
    const db = await getDatabase();
    const now = utcNowIso();

    for (const update of updates) {
      await db.execute(
        `UPDATE campaign_potential_factors
         SET factor_milli = $1, updated_at = $2
         WHERE campaign_id = $3 AND level = $4`,
        [update.factorMilli, now, campaignId, update.level],
      );
    }
    await db.execute(
      `UPDATE campaign_reference_config
       SET updated_at = $1
       WHERE campaign_id = $2`,
      [now, campaignId],
    );

    const set = await this.getReferenceSet(campaignId);
    if (!set) {
      throw new Error("Référentiel introuvable après mise à jour Potentiel.");
    }
    return set;
  }

  async updateNineBoxFactors(
    campaignId: number,
    updates: NineBoxFactorInput[],
  ): Promise<CompensationReferenceSet> {
    const db = await getDatabase();
    const now = utcNowIso();

    for (const update of updates) {
      await db.execute(
        `UPDATE campaign_nine_box_factors
         SET factor_milli = $1, updated_at = $2
         WHERE campaign_id = $3 AND box_code = $4`,
        [update.factorMilli, now, campaignId, update.boxCode],
      );
    }
    await db.execute(
      `UPDATE campaign_reference_config
       SET updated_at = $1
       WHERE campaign_id = $2`,
      [now, campaignId],
    );

    const set = await this.getReferenceSet(campaignId);
    if (!set) {
      throw new Error("Référentiel introuvable après mise à jour 9-Box.");
    }
    return set;
  }

  async updateNineBoxMode(
    campaignId: number,
    mode: NineBoxMode,
  ): Promise<CompensationReferenceSet> {
    const db = await getDatabase();
    const now = utcNowIso();
    await db.execute(
      `UPDATE campaign_reference_config
       SET nine_box_mode = $1, updated_at = $2
       WHERE campaign_id = $3`,
      [mode, now, campaignId],
    );

    const set = await this.getReferenceSet(campaignId);
    if (!set) {
      throw new Error("Référentiel introuvable après changement de mode.");
    }
    return set;
  }

  async getCompleteness(
    campaignId: number,
  ): Promise<ReferenceCompleteness | null> {
    const set = await this.getReferenceSet(campaignId);
    if (!set) return null;
    return computeReferenceCompleteness(set);
  }
}
