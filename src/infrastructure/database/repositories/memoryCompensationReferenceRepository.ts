import { computeReferenceCompleteness } from "../../../domain/compensationReference/completeness";
import {
  DEFAULT_GRADES,
  DEFAULT_JOB_FAMILIES,
  DEFAULT_NINE_BOX_CONFIRMATION_FACTOR_MILLI,
  DEFAULT_NINE_BOX_FACTORS,
  DEFAULT_NINE_BOX_MODE,
  DEFAULT_NINE_BOX_ORIENTATION,
  DEFAULT_PERFORMANCE_FACTORS,
  DEFAULT_POTENTIAL_FACTORS,
  DEFAULT_SALARY_POSITIONS,
} from "../../../domain/compensationReference/defaults";
import type {
  CompensationReferenceConfig,
  CompensationReferenceSet,
  Grade,
  JobFamily,
  LevelFactorInput,
  NineBoxFactor,
  NineBoxFactorInput,
  NineBoxMode,
  NineBoxOrientation,
  PerformanceFactor,
  PotentialFactor,
  ReferenceCompleteness,
  SalaryGridCell,
  SalaryGridCellInput,
  SalaryPosition,
  SalaryPositionFactorInput,
  StructureItemInput,
} from "../../../domain/compensationReference/models";
import { assembleReferenceSet } from "../referenceMappers";
import type { CompensationReferenceRepository } from "./compensationReferenceRepository";

interface CampaignReferenceStore {
  config: CompensationReferenceConfig;
  jobFamilies: JobFamily[];
  grades: Grade[];
  salaryGrid: SalaryGridCell[];
  salaryPositions: SalaryPosition[];
  performanceFactors: PerformanceFactor[];
  potentialFactors: PotentialFactor[];
  nineBoxFactors: NineBoxFactor[];
}

export class MemoryCompensationReferenceRepository
  implements CompensationReferenceRepository
{
  private readonly byCampaign = new Map<number, CampaignReferenceStore>();
  private nextFamilyId = 1;
  private nextGradeId = 1;
  private nextPositionId = 1;

  async initializeForCampaign(campaignId: number): Promise<void> {
    if (this.byCampaign.has(campaignId)) {
      return;
    }

    const now = new Date().toISOString();
    const jobFamilies: JobFamily[] = DEFAULT_JOB_FAMILIES.map((seed) => ({
      id: this.nextFamilyId++,
      campaignId,
      code: seed.code,
      label: seed.label,
      sortOrder: seed.sortOrder,
      createdAt: now,
      updatedAt: now,
    }));

    const grades: Grade[] = DEFAULT_GRADES.map((seed) => ({
      id: this.nextGradeId++,
      campaignId,
      code: seed.code,
      label: seed.label,
      sortOrder: seed.sortOrder,
      createdAt: now,
      updatedAt: now,
    }));

    const salaryGrid: SalaryGridCell[] = [];
    for (const family of jobFamilies) {
      for (const grade of grades) {
        salaryGrid.push({
          campaignId,
          jobFamilyId: family.id,
          gradeId: grade.id,
          s0Amount: null,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    const salaryPositions: SalaryPosition[] = DEFAULT_SALARY_POSITIONS.map(
      (seed) => ({
        id: this.nextPositionId++,
        campaignId,
        code: seed.code,
        label: seed.label,
        sortOrder: seed.sortOrder,
        referenceRatioBps: seed.referenceRatioBps,
        positionFactorMilli: seed.positionFactorMilli,
        createdAt: now,
        updatedAt: now,
      }),
    );

    const performanceFactors: PerformanceFactor[] =
      DEFAULT_PERFORMANCE_FACTORS.map((seed) => ({
        campaignId,
        level: seed.level,
        label: seed.label,
        sortOrder: seed.sortOrder,
        factorMilli: seed.factorMilli,
        createdAt: now,
        updatedAt: now,
      }));

    const potentialFactors: PotentialFactor[] = DEFAULT_POTENTIAL_FACTORS.map(
      (seed) => ({
        campaignId,
        level: seed.level,
        label: seed.label,
        sortOrder: seed.sortOrder,
        factorMilli: seed.factorMilli,
        createdAt: now,
        updatedAt: now,
      }),
    );

    const nineBoxFactors: NineBoxFactor[] = DEFAULT_NINE_BOX_FACTORS.map(
      (seed) => ({
        campaignId,
        boxCode: seed.boxCode,
        performanceLevel: seed.performanceLevel,
        potentialLevel: seed.potentialLevel,
        factorMilli: seed.factorMilli,
        createdAt: now,
        updatedAt: now,
      }),
    );

    this.byCampaign.set(campaignId, {
      config: {
        campaignId,
        nineBoxMode: DEFAULT_NINE_BOX_MODE,
        nineBoxOrientation: DEFAULT_NINE_BOX_ORIENTATION,
        nineBoxConfirmationFactorMilli: DEFAULT_NINE_BOX_CONFIRMATION_FACTOR_MILLI,
        createdAt: now,
        updatedAt: now,
      },
      jobFamilies,
      grades,
      salaryGrid,
      salaryPositions,
      performanceFactors,
      potentialFactors,
      nineBoxFactors,
    });
  }

  async getReferenceSet(
    campaignId: number,
  ): Promise<CompensationReferenceSet | null> {
    const store = this.byCampaign.get(campaignId);
    if (!store) return null;
    return this.cloneSet(campaignId, store);
  }

  async updateStructure(
    campaignId: number,
    jobFamilies: StructureItemInput[],
    grades: StructureItemInput[],
  ): Promise<CompensationReferenceSet> {
    const store = this.requireStore(campaignId);
    const now = new Date().toISOString();

    store.jobFamilies = store.jobFamilies.map((family) => {
      const update = jobFamilies.find((item) => item.id === family.id);
      if (!update) return family;
      return {
        ...family,
        code: update.code,
        label: update.label,
        updatedAt: now,
      };
    });

    store.grades = store.grades.map((grade) => {
      const update = grades.find((item) => item.id === grade.id);
      if (!update) return grade;
      return {
        ...grade,
        code: update.code,
        label: update.label,
        updatedAt: now,
      };
    });

    store.config = { ...store.config, updatedAt: now };
    return this.cloneSet(campaignId, store);
  }

  async updateSalaryGrid(
    campaignId: number,
    cells: SalaryGridCellInput[],
  ): Promise<CompensationReferenceSet> {
    const store = this.requireStore(campaignId);
    const now = new Date().toISOString();

    store.salaryGrid = store.salaryGrid.map((cell) => {
      const update = cells.find(
        (item) =>
          item.jobFamilyId === cell.jobFamilyId &&
          item.gradeId === cell.gradeId,
      );
      if (!update) return cell;
      return {
        ...cell,
        s0Amount: update.s0Amount,
        updatedAt: now,
      };
    });

    store.config = { ...store.config, updatedAt: now };
    return this.cloneSet(campaignId, store);
  }

  async updateSalaryPositionFactors(
    campaignId: number,
    updates: SalaryPositionFactorInput[],
  ): Promise<CompensationReferenceSet> {
    const store = this.requireStore(campaignId);
    const now = new Date().toISOString();

    store.salaryPositions = store.salaryPositions.map((position) => {
      const update = updates.find((item) => item.id === position.id);
      if (!update) return position;
      return {
        ...position,
        positionFactorMilli: update.positionFactorMilli,
        updatedAt: now,
      };
    });

    store.config = { ...store.config, updatedAt: now };
    return this.cloneSet(campaignId, store);
  }

  async updatePerformanceFactors(
    campaignId: number,
    updates: LevelFactorInput[],
  ): Promise<CompensationReferenceSet> {
    const store = this.requireStore(campaignId);
    const now = new Date().toISOString();

    store.performanceFactors = store.performanceFactors.map((factor) => {
      const update = updates.find((item) => item.level === factor.level);
      if (!update) return factor;
      return {
        ...factor,
        factorMilli: update.factorMilli,
        updatedAt: now,
      };
    });

    store.config = { ...store.config, updatedAt: now };
    return this.cloneSet(campaignId, store);
  }

  async updatePotentialFactors(
    campaignId: number,
    updates: LevelFactorInput[],
  ): Promise<CompensationReferenceSet> {
    const store = this.requireStore(campaignId);
    const now = new Date().toISOString();

    store.potentialFactors = store.potentialFactors.map((factor) => {
      const update = updates.find((item) => item.level === factor.level);
      if (!update) return factor;
      return {
        ...factor,
        factorMilli: update.factorMilli,
        updatedAt: now,
      };
    });

    store.config = { ...store.config, updatedAt: now };
    return this.cloneSet(campaignId, store);
  }

  async updateNineBoxFactors(
    campaignId: number,
    updates: NineBoxFactorInput[],
  ): Promise<CompensationReferenceSet> {
    const store = this.requireStore(campaignId);
    const now = new Date().toISOString();

    store.nineBoxFactors = store.nineBoxFactors.map((factor) => {
      const update = updates.find((item) => item.boxCode === factor.boxCode);
      if (!update) return factor;
      return {
        ...factor,
        factorMilli: update.factorMilli,
        updatedAt: now,
      };
    });

    store.config = { ...store.config, updatedAt: now };
    return this.cloneSet(campaignId, store);
  }

  async updateNineBoxMode(
    campaignId: number,
    mode: NineBoxMode,
  ): Promise<CompensationReferenceSet> {
    const store = this.requireStore(campaignId);
    const now = new Date().toISOString();
    store.config = {
      ...store.config,
      nineBoxMode: mode,
      updatedAt: now,
    };
    return this.cloneSet(campaignId, store);
  }

  async updateNineBoxOrientation(
    campaignId: number,
    orientation: NineBoxOrientation,
  ): Promise<CompensationReferenceSet> {
    const store = this.requireStore(campaignId);
    const now = new Date().toISOString();
    store.config = {
      ...store.config,
      nineBoxOrientation: orientation,
      updatedAt: now,
    };
    return this.cloneSet(campaignId, store);
  }

  async updateNineBoxConfirmationFactorMilli(
    campaignId: number,
    factorMilli: number,
  ): Promise<CompensationReferenceSet> {
    const store = this.requireStore(campaignId);
    const now = new Date().toISOString();
    store.config = {
      ...store.config,
      nineBoxConfirmationFactorMilli: factorMilli,
      updatedAt: now,
    };
    return this.cloneSet(campaignId, store);
  }

  async getCompleteness(
    campaignId: number,
  ): Promise<ReferenceCompleteness | null> {
    const set = await this.getReferenceSet(campaignId);
    if (!set) return null;
    return computeReferenceCompleteness(set);
  }

  private requireStore(campaignId: number): CampaignReferenceStore {
    const store = this.byCampaign.get(campaignId);
    if (!store) {
      throw new Error(
        `Référentiel introuvable pour la campagne ${campaignId}.`,
      );
    }
    return store;
  }

  private cloneSet(
    campaignId: number,
    store: CampaignReferenceStore,
  ): CompensationReferenceSet {
    return assembleReferenceSet(
      campaignId,
      { ...store.config },
      store.jobFamilies.map((item) => ({ ...item })),
      store.grades.map((item) => ({ ...item })),
      store.salaryGrid.map((item) => ({ ...item })),
      store.salaryPositions.map((item) => ({ ...item })),
      store.performanceFactors.map((item) => ({ ...item })),
      store.potentialFactors.map((item) => ({ ...item })),
      store.nineBoxFactors.map((item) => ({ ...item })),
    );
  }
}
