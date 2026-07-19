import type {
  CompensationReferenceSet,
  LevelFactorInput,
  NineBoxFactorInput,
  NineBoxMode,
  NineBoxOrientation,
  ReferenceCompleteness,
  SalaryGridCellInput,
  SalaryPositionFactorInput,
  StructureItemInput,
} from "../../../domain/compensationReference/models";

export interface CompensationReferenceRepository {
  initializeForCampaign(campaignId: number): Promise<void>;
  getReferenceSet(campaignId: number): Promise<CompensationReferenceSet | null>;
  updateStructure(
    campaignId: number,
    jobFamilies: StructureItemInput[],
    grades: StructureItemInput[],
  ): Promise<CompensationReferenceSet>;
  updateSalaryGrid(
    campaignId: number,
    cells: SalaryGridCellInput[],
  ): Promise<CompensationReferenceSet>;
  updateSalaryPositionFactors(
    campaignId: number,
    updates: SalaryPositionFactorInput[],
  ): Promise<CompensationReferenceSet>;
  updatePerformanceFactors(
    campaignId: number,
    updates: LevelFactorInput[],
  ): Promise<CompensationReferenceSet>;
  updatePotentialFactors(
    campaignId: number,
    updates: LevelFactorInput[],
  ): Promise<CompensationReferenceSet>;
  updateNineBoxFactors(
    campaignId: number,
    updates: NineBoxFactorInput[],
  ): Promise<CompensationReferenceSet>;
  updateNineBoxMode(
    campaignId: number,
    mode: NineBoxMode,
  ): Promise<CompensationReferenceSet>;
  updateNineBoxOrientation(
    campaignId: number,
    orientation: NineBoxOrientation,
  ): Promise<CompensationReferenceSet>;
  getCompleteness(campaignId: number): Promise<ReferenceCompleteness | null>;
}
