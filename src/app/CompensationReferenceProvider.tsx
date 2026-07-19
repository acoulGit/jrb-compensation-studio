import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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
} from "../domain/compensationReference/models";
import type { Campaign } from "../infrastructure/database/types";
import { toUserMessage } from "../services/errors";
import { useAppData } from "./AppDataProvider";

export type ReferenceLoadStatus = "idle" | "loading" | "ready" | "error";

interface CompensationReferenceContextValue {
  selectedCampaignId: number | null;
  selectedCampaign: Campaign | null;
  referenceSet: CompensationReferenceSet | null;
  completeness: ReferenceCompleteness | null;
  activeCampaignCompleteness: ReferenceCompleteness | null;
  status: ReferenceLoadStatus;
  errorMessage: string | null;
  isReadOnly: boolean;
  selectCampaign: (campaignId: number | null) => void;
  retry: () => void;
  refresh: () => Promise<void>;
  updateStructure: (
    jobFamilies: StructureItemInput[],
    grades: StructureItemInput[],
  ) => Promise<CompensationReferenceSet>;
  updateSalaryGrid: (
    cells: SalaryGridCellInput[],
  ) => Promise<CompensationReferenceSet>;
  updateSalaryPositionFactors: (
    updates: SalaryPositionFactorInput[],
  ) => Promise<CompensationReferenceSet>;
  updatePerformanceFactors: (
    updates: LevelFactorInput[],
  ) => Promise<CompensationReferenceSet>;
  updatePotentialFactors: (
    updates: LevelFactorInput[],
  ) => Promise<CompensationReferenceSet>;
  updateNineBoxFactors: (
    updates: NineBoxFactorInput[],
  ) => Promise<CompensationReferenceSet>;
  updateNineBoxMode: (mode: NineBoxMode) => Promise<CompensationReferenceSet>;
  updateNineBoxOrientation: (
    orientation: NineBoxOrientation,
  ) => Promise<CompensationReferenceSet>;
}

const CompensationReferenceContext =
  createContext<CompensationReferenceContextValue | null>(null);

function pickDefaultCampaign(campaigns: Campaign[]): Campaign | null {
  const active = campaigns.find((campaign) => campaign.status === "active");
  if (active) return active;
  const drafts = campaigns
    .filter((campaign) => campaign.status === "draft")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  if (drafts[0]) return drafts[0];
  const remaining = [...campaigns].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
  return remaining[0] ?? null;
}

interface CompensationReferenceProviderProps {
  children: ReactNode;
}

export function CompensationReferenceProvider({
  children,
}: CompensationReferenceProviderProps) {
  const { status: appStatus, campaigns, activeCampaign, services } =
    useAppData();
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(
    null,
  );
  const [referenceSet, setReferenceSet] =
    useState<CompensationReferenceSet | null>(null);
  const [completeness, setCompleteness] =
    useState<ReferenceCompleteness | null>(null);
  const [activeCampaignCompleteness, setActiveCampaignCompleteness] =
    useState<ReferenceCompleteness | null>(null);
  const [status, setStatus] = useState<ReferenceLoadStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [hasUserSelected, setHasUserSelected] = useState(false);

  useEffect(() => {
    if (appStatus !== "ready" || hasUserSelected) {
      return;
    }
    const preferred = pickDefaultCampaign(campaigns);
    setSelectedCampaignId(preferred?.id ?? null);
  }, [appStatus, campaigns, hasUserSelected]);

  const selectedCampaign = useMemo(
    () =>
      campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId],
  );

  const loadSelected = useCallback(async () => {
    if (appStatus !== "ready") {
      return;
    }
    if (selectedCampaignId === null) {
      setReferenceSet(null);
      setCompleteness(null);
      setStatus("idle");
      setErrorMessage(null);
      return;
    }

    setStatus("loading");
    setErrorMessage(null);
    try {
      const set =
        await services.compensationReference.getReferenceSet(selectedCampaignId);
      const complete =
        await services.compensationReference.getCompleteness(selectedCampaignId);
      setReferenceSet(set);
      setCompleteness(complete);
      setStatus("ready");
    } catch (error) {
      setReferenceSet(null);
      setCompleteness(null);
      setStatus("error");
      setErrorMessage(
        toUserMessage(error, "Le référentiel n’a pas pu être chargé."),
      );
    }
  }, [appStatus, selectedCampaignId, services]);

  const loadActiveCompleteness = useCallback(async () => {
    if (appStatus !== "ready" || !activeCampaign) {
      setActiveCampaignCompleteness(null);
      return;
    }
    try {
      const complete = await services.compensationReference.getCompleteness(
        activeCampaign.id,
      );
      setActiveCampaignCompleteness(complete);
    } catch {
      setActiveCampaignCompleteness(null);
    }
  }, [activeCampaign, appStatus, services]);

  useEffect(() => {
    void loadSelected();
  }, [loadSelected, reloadToken]);

  useEffect(() => {
    void loadActiveCompleteness();
  }, [loadActiveCompleteness, reloadToken, campaigns]);

  const selectCampaign = useCallback((campaignId: number | null) => {
    setHasUserSelected(true);
    setSelectedCampaignId(campaignId);
  }, []);

  const refresh = useCallback(async () => {
    await loadSelected();
    await loadActiveCompleteness();
  }, [loadActiveCompleteness, loadSelected]);

  const wrapMutation = useCallback(
    async (
      action: () => Promise<CompensationReferenceSet>,
    ): Promise<CompensationReferenceSet> => {
      try {
        const set = await action();
        const complete = await services.compensationReference.getCompleteness(
          set.campaignId,
        );
        setReferenceSet(set);
        setCompleteness(complete);
        if (activeCampaign && set.campaignId === activeCampaign.id) {
          setActiveCampaignCompleteness(complete);
        }
        setStatus("ready");
        return set;
      } catch (error) {
        throw new Error(
          toUserMessage(error, "L’enregistrement du référentiel a échoué."),
        );
      }
    },
    [activeCampaign, services],
  );

  const value = useMemo<CompensationReferenceContextValue>(
    () => ({
      selectedCampaignId,
      selectedCampaign,
      referenceSet,
      completeness,
      activeCampaignCompleteness,
      status,
      errorMessage,
      isReadOnly: selectedCampaign?.status === "archived",
      selectCampaign,
      retry: () => setReloadToken((token) => token + 1),
      refresh,
      updateStructure: (jobFamilies, grades) => {
        if (selectedCampaignId === null) {
          return Promise.reject(new Error("Aucune campagne sélectionnée."));
        }
        return wrapMutation(() =>
          services.compensationReference.updateStructure(
            selectedCampaignId,
            jobFamilies,
            grades,
          ),
        );
      },
      updateSalaryGrid: (cells) => {
        if (selectedCampaignId === null) {
          return Promise.reject(new Error("Aucune campagne sélectionnée."));
        }
        return wrapMutation(() =>
          services.compensationReference.updateSalaryGrid(
            selectedCampaignId,
            cells,
          ),
        );
      },
      updateSalaryPositionFactors: (updates) => {
        if (selectedCampaignId === null) {
          return Promise.reject(new Error("Aucune campagne sélectionnée."));
        }
        return wrapMutation(() =>
          services.compensationReference.updateSalaryPositionFactors(
            selectedCampaignId,
            updates,
          ),
        );
      },
      updatePerformanceFactors: (updates) => {
        if (selectedCampaignId === null) {
          return Promise.reject(new Error("Aucune campagne sélectionnée."));
        }
        return wrapMutation(() =>
          services.compensationReference.updatePerformanceFactors(
            selectedCampaignId,
            updates,
          ),
        );
      },
      updatePotentialFactors: (updates) => {
        if (selectedCampaignId === null) {
          return Promise.reject(new Error("Aucune campagne sélectionnée."));
        }
        return wrapMutation(() =>
          services.compensationReference.updatePotentialFactors(
            selectedCampaignId,
            updates,
          ),
        );
      },
      updateNineBoxFactors: (updates) => {
        if (selectedCampaignId === null) {
          return Promise.reject(new Error("Aucune campagne sélectionnée."));
        }
        return wrapMutation(() =>
          services.compensationReference.updateNineBoxFactors(
            selectedCampaignId,
            updates,
          ),
        );
      },
      updateNineBoxMode: (mode) => {
        if (selectedCampaignId === null) {
          return Promise.reject(new Error("Aucune campagne sélectionnée."));
        }
        return wrapMutation(() =>
          services.compensationReference.updateNineBoxMode(
            selectedCampaignId,
            mode,
          ),
        );
      },
      updateNineBoxOrientation: (orientation) => {
        if (selectedCampaignId === null) {
          return Promise.reject(new Error("Aucune campagne sélectionnée."));
        }
        return wrapMutation(() =>
          services.compensationReference.updateNineBoxOrientation(
            selectedCampaignId,
            orientation,
          ),
        );
      },
    }),
    [
      activeCampaignCompleteness,
      completeness,
      errorMessage,
      refresh,
      referenceSet,
      selectCampaign,
      selectedCampaign,
      selectedCampaignId,
      services,
      status,
      wrapMutation,
    ],
  );

  return (
    <CompensationReferenceContext.Provider value={value}>
      {children}
    </CompensationReferenceContext.Provider>
  );
}

export function useCompensationReference(): CompensationReferenceContextValue {
  const context = useContext(CompensationReferenceContext);
  if (!context) {
    throw new Error(
      "useCompensationReference doit être utilisé dans CompensationReferenceProvider.",
    );
  }
  return context;
}
