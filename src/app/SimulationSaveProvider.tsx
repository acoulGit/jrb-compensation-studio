/**
 * État de sauvegarde explicite de simulation en session (Lot 2B-4B).
 * Isolé par campaignId — non restauré au redémarrage.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { buildSimulationResultIdentity } from "../application/campaignSimulation/buildSimulationResultIdentity";
import { createCampaignSimulationReadinessPortsFromServices } from "../application/campaignSimulation/buildCampaignSimulationReadiness";
import { saveCurrentCampaignSimulation } from "../application/campaignSimulation/saveCurrentCampaignSimulation";
import { saveErrorMessageForCode } from "../application/campaignSimulation/simulationSaveErrorMessages";
import type { SimulationPersistenceCode } from "../application/campaignSimulation/simulationPersistenceCodes";
import { useAppData } from "./AppDataProvider";
import { useSimulationConfiguration } from "./SimulationConfigurationProvider";
import { useSimulationExecution } from "./SimulationExecutionProvider";
import { useSimulationHistoryRefresh } from "./SimulationHistoryRefreshProvider";

export type CampaignSimulationSaveStatus =
  | "idle"
  | "saving"
  | "success"
  | "error"
  | "stale";

export interface CampaignSimulationSaveState {
  status: CampaignSimulationSaveStatus;
  campaignId: number | null;
  executionRunSequence: number | null;
  persistedRunId: number | null;
  persistedRunNumber: number | null;
  createdAt: string | null;
  issues: readonly { code: SimulationPersistenceCode; message: string }[];
  resultIdentity: string | null;
  isAlreadySaved: boolean;
  errorMessage: string | null;
}

interface SavedRunInfo {
  runId: number;
  runNumber: number;
  createdAt: string;
}

function createIdleSaveState(): CampaignSimulationSaveState {
  return {
    status: "idle",
    campaignId: null,
    executionRunSequence: null,
    persistedRunId: null,
    persistedRunNumber: null,
    createdAt: null,
    issues: [],
    resultIdentity: null,
    isAlreadySaved: false,
    errorMessage: null,
  };
}

interface SimulationSaveContextValue {
  saveState: CampaignSimulationSaveState;
  canSave: boolean;
  currentResultIdentity: string | null;
  savedRunForCurrentResult: SavedRunInfo | null;
  saveCurrentResult: () => Promise<boolean>;
}

const SimulationSaveContext = createContext<SimulationSaveContextValue | null>(
  null,
);

export function SimulationSaveProvider({ children }: { children: ReactNode }) {
  const { services } = useAppData();
  const {
    selectedCampaignId,
    isReadOnly,
    validatedConfiguration,
    validationStatus,
  } = useSimulationConfiguration();
  const { execution } = useSimulationExecution();
  const { bumpRevision } = useSimulationHistoryRefresh();

  const [statesByCampaignId, setStatesByCampaignId] = useState<
    Record<number, CampaignSimulationSaveState>
  >({});
  const [savedRunsByIdentity, setSavedRunsByIdentity] = useState<
    Record<string, SavedRunInfo>
  >({});
  const savingRef = useRef(false);

  const currentResultIdentity = useMemo(() => {
    if (
      selectedCampaignId === null ||
      execution.status !== "success" ||
      !execution.result ||
      execution.isStale
    ) {
      return null;
    }
    return buildSimulationResultIdentity({
      campaignId: selectedCampaignId,
      runSequence: execution.result.runSequence,
      sourceFingerprint: execution.result.sourceFingerprint,
      configurationFingerprint: execution.result.configurationFingerprint,
    });
  }, [selectedCampaignId, execution]);

  const saveState = useMemo(() => {
    if (selectedCampaignId === null) {
      return createIdleSaveState();
    }
    return statesByCampaignId[selectedCampaignId] ?? createIdleSaveState();
  }, [selectedCampaignId, statesByCampaignId]);

  const savedRunForCurrentResult = useMemo(() => {
    if (!currentResultIdentity) return null;
    return savedRunsByIdentity[currentResultIdentity] ?? null;
  }, [currentResultIdentity, savedRunsByIdentity]);

  const isAlreadySaved = savedRunForCurrentResult !== null;

  const canSave =
    selectedCampaignId !== null &&
    execution.status === "success" &&
    execution.result !== null &&
    !execution.isStale &&
    validationStatus === "validated" &&
    validatedConfiguration !== null &&
    !isReadOnly &&
    saveState.status !== "saving" &&
    !isAlreadySaved &&
    !savingRef.current;

  const updateCampaignSaveState = useCallback(
    (
      campaignId: number,
      updater: (current: CampaignSimulationSaveState) => CampaignSimulationSaveState,
    ) => {
      setStatesByCampaignId((prev) => ({
        ...prev,
        [campaignId]: updater(prev[campaignId] ?? createIdleSaveState()),
      }));
    },
    [],
  );

  const saveCurrentResult = useCallback(async (): Promise<boolean> => {
    if (
      selectedCampaignId === null ||
      !canSave ||
      !execution.result ||
      savingRef.current
    ) {
      return false;
    }

    savingRef.current = true;
    const identity = buildSimulationResultIdentity({
      campaignId: selectedCampaignId,
      runSequence: execution.result.runSequence,
      sourceFingerprint: execution.result.sourceFingerprint,
      configurationFingerprint: execution.result.configurationFingerprint,
    });

    updateCampaignSaveState(selectedCampaignId, (current) => ({
      ...current,
      status: "saving",
      campaignId: selectedCampaignId,
      executionRunSequence: execution.result!.runSequence,
      resultIdentity: identity,
      errorMessage: null,
      issues: [],
    }));

    const ports = createCampaignSimulationReadinessPortsFromServices(services);
    const outcome = await saveCurrentCampaignSimulation({
      campaignId: selectedCampaignId,
      executionStatus: execution.status,
      isStale: execution.isStale,
      result: execution.result,
      validatedConfiguration,
      ports,
      repository: services.simulationHistory,
    });

    savingRef.current = false;

    if (outcome.ok) {
      const savedInfo: SavedRunInfo = {
        runId: outcome.saved.simulationRunId,
        runNumber: outcome.saved.runNumber,
        createdAt: outcome.saved.createdAt,
      };
      setSavedRunsByIdentity((prev) => ({
        ...prev,
        [identity]: savedInfo,
      }));
      bumpRevision(selectedCampaignId);
      updateCampaignSaveState(selectedCampaignId, () => ({
        status: "success",
        campaignId: selectedCampaignId,
        executionRunSequence: execution.result!.runSequence,
        persistedRunId: outcome.saved.simulationRunId,
        persistedRunNumber: outcome.saved.runNumber,
        createdAt: outcome.saved.createdAt,
        issues: [],
        resultIdentity: identity,
        isAlreadySaved: true,
        errorMessage: null,
      }));
      return true;
    }

    updateCampaignSaveState(selectedCampaignId, () => ({
      status: "error",
      campaignId: selectedCampaignId,
      executionRunSequence: execution.result!.runSequence,
      persistedRunId: null,
      persistedRunNumber: null,
      createdAt: null,
      issues: [
        {
          code: outcome.code,
          message: saveErrorMessageForCode(outcome.code),
        },
      ],
      resultIdentity: identity,
      isAlreadySaved: false,
      errorMessage: saveErrorMessageForCode(outcome.code),
    }));
    return false;
  }, [
    selectedCampaignId,
    canSave,
    execution,
    validatedConfiguration,
    services,
    updateCampaignSaveState,
    bumpRevision,
  ]);

  const effectiveSaveState = useMemo(
    (): CampaignSimulationSaveState => ({
      ...saveState,
      isAlreadySaved,
      persistedRunId:
        savedRunForCurrentResult?.runId ?? saveState.persistedRunId,
      persistedRunNumber:
        savedRunForCurrentResult?.runNumber ?? saveState.persistedRunNumber,
      createdAt: savedRunForCurrentResult?.createdAt ?? saveState.createdAt,
      resultIdentity: currentResultIdentity,
      status:
        execution.isStale && saveState.status === "success"
          ? "stale"
          : isAlreadySaved && saveState.status !== "error"
            ? "success"
            : saveState.status,
    }),
    [
      saveState,
      isAlreadySaved,
      savedRunForCurrentResult,
      currentResultIdentity,
      execution.isStale,
    ],
  );

  const value = useMemo(
    () => ({
      saveState: effectiveSaveState,
      canSave,
      currentResultIdentity,
      savedRunForCurrentResult,
      saveCurrentResult,
    }),
    [
      effectiveSaveState,
      canSave,
      currentResultIdentity,
      savedRunForCurrentResult,
      saveCurrentResult,
    ],
  );

  return (
    <SimulationSaveContext.Provider value={value}>
      {children}
    </SimulationSaveContext.Provider>
  );
}

export function useSimulationSave(): SimulationSaveContextValue {
  const context = useContext(SimulationSaveContext);
  if (!context) {
    throw new Error(
      "useSimulationSave doit être utilisé dans SimulationSaveProvider.",
    );
  }
  return context;
}
