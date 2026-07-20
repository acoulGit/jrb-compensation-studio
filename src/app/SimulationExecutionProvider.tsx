/**
 * État d’exécution de simulation en mémoire de session (Lot 2B-3).
 * Isolé par campaignId. Aucune persistance.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createCampaignSimulationReadinessPortsFromServices } from "../application/campaignSimulation/buildCampaignSimulationReadiness";
import { executeCampaignSimulation } from "../application/campaignSimulation/executeCampaignSimulation";
import type {
  CampaignSimulationExecutionIssue,
  CampaignSimulationExecutionResult,
  SimulationExecutionStatus,
} from "../application/campaignSimulation/campaignSimulationExecutionModels";
import { useAppData } from "./AppDataProvider";
import { useSimulationConfiguration } from "./SimulationConfigurationProvider";

export interface CampaignSimulationExecutionState {
  status: SimulationExecutionStatus;
  runSequence: number;
  sourceFingerprint: string | null;
  configurationFingerprint: string | null;
  result: CampaignSimulationExecutionResult | null;
  /** Résultat précédent, conservé uniquement pour diagnostic si stale. */
  staleResult: CampaignSimulationExecutionResult | null;
  issues: CampaignSimulationExecutionIssue[];
  isStale: boolean;
  lastSuccessfulRunSequence: number | null;
  errorMessage: string | null;
  errorCode: string | null;
}

function createIdleState(): CampaignSimulationExecutionState {
  return {
    status: "idle",
    runSequence: 0,
    sourceFingerprint: null,
    configurationFingerprint: null,
    result: null,
    staleResult: null,
    issues: [],
    isStale: false,
    lastSuccessfulRunSequence: null,
    errorMessage: null,
    errorCode: null,
  };
}

interface SimulationExecutionContextValue {
  execution: CampaignSimulationExecutionState;
  canLaunch: boolean;
  launchSimulation: () => Promise<boolean>;
  markStale: (reason?: string) => void;
  clearCurrentResultPresentation: () => void;
}

const SimulationExecutionContext =
  createContext<SimulationExecutionContextValue | null>(null);

interface SimulationExecutionProviderProps {
  children: ReactNode;
}

export function SimulationExecutionProvider({
  children,
}: SimulationExecutionProviderProps) {
  const { services } = useAppData();
  const {
    selectedCampaignId,
    selectedCampaign,
    isReadOnly,
    validatedConfiguration,
    validationStatus,
    readinessReport,
    readinessStatus,
    markValidationStale,
  } = useSimulationConfiguration();

  const [statesByCampaignId, setStatesByCampaignId] = useState<
    Record<number, CampaignSimulationExecutionState>
  >({});
  const runningCampaignIdsRef = useRef(new Set<number>());

  const execution = useMemo(() => {
    if (selectedCampaignId === null) {
      return createIdleState();
    }
    return statesByCampaignId[selectedCampaignId] ?? createIdleState();
  }, [selectedCampaignId, statesByCampaignId]);

  const updateCampaignState = useCallback(
    (
      campaignId: number,
      updater: (
        current: CampaignSimulationExecutionState,
      ) => CampaignSimulationExecutionState,
    ) => {
      setStatesByCampaignId((prev) => {
        const current = prev[campaignId] ?? createIdleState();
        return {
          ...prev,
          [campaignId]: updater(current),
        };
      });
    },
    [],
  );

  const markStale = useCallback(
    (_reason?: string) => {
      if (selectedCampaignId === null) return;
      updateCampaignState(selectedCampaignId, (current) => {
        if (current.status === "idle" && !current.result && !current.staleResult) {
          return current;
        }
        if (current.status === "running") {
          return current;
        }
        const previousResult = current.result;
        return {
          ...current,
          status: "stale",
          isStale: true,
          result: null,
          staleResult: previousResult ?? current.staleResult,
          errorMessage:
            "Résultat obsolète — les données ou la configuration ont changé.",
          errorCode: "SIMULATION_RESULT_STALE",
        };
      });
    },
    [selectedCampaignId, updateCampaignState],
  );

  const clearCurrentResultPresentation = useCallback(() => {
    if (selectedCampaignId === null) return;
    updateCampaignState(selectedCampaignId, (current) => ({
      ...current,
      result: null,
      status: current.staleResult || current.issues.length > 0 ? current.status : "idle",
    }));
  }, [selectedCampaignId, updateCampaignState]);

  // Invalidation si configuration stale / sources / campagne.
  useEffect(() => {
    if (selectedCampaignId === null) return;
    if (execution.status === "running") return;
    if (execution.status !== "success" && !execution.result) return;

    const configChanged =
      validationStatus !== "validated" ||
      !validatedConfiguration ||
      validatedConfiguration.configurationFingerprint !==
        execution.configurationFingerprint ||
      validatedConfiguration.sourceFingerprint !== execution.sourceFingerprint;

    if (configChanged) {
      markStale("configuration_or_sources");
    }
  }, [
    execution.configurationFingerprint,
    execution.result,
    execution.sourceFingerprint,
    execution.status,
    markStale,
    selectedCampaignId,
    validatedConfiguration,
    validationStatus,
  ]);

  const canLaunch = Boolean(
    selectedCampaignId !== null &&
      selectedCampaign &&
      !isReadOnly &&
      (selectedCampaign.status === "draft" ||
        selectedCampaign.status === "active") &&
      readinessReport?.isReady &&
      readinessStatus === "ready" &&
      validationStatus === "validated" &&
      validatedConfiguration &&
      execution.status !== "running" &&
      !runningCampaignIdsRef.current.has(selectedCampaignId),
  );

  const launchSimulation = useCallback(async () => {
    if (selectedCampaignId === null || !validatedConfiguration) {
      return false;
    }
    if (isReadOnly) return false;
    if (validationStatus !== "validated") return false;
    if (runningCampaignIdsRef.current.has(selectedCampaignId)) {
      return false;
    }

    runningCampaignIdsRef.current.add(selectedCampaignId);
    const nextSequence = (statesByCampaignId[selectedCampaignId]?.runSequence ?? 0) + 1;

    updateCampaignState(selectedCampaignId, (current) => ({
      ...current,
      status: "running",
      runSequence: nextSequence,
      issues: [],
      errorMessage: null,
      errorCode: null,
      isStale: false,
      result: null,
      staleResult: current.result ?? current.staleResult,
    }));

    try {
      const ports = createCampaignSimulationReadinessPortsFromServices(services);
      const outcome = await executeCampaignSimulation({
        campaignId: selectedCampaignId,
        validatedConfiguration,
        expectedSourceFingerprint: validatedConfiguration.sourceFingerprint,
        ports,
        runSequence: nextSequence,
      });

      if (!outcome.ok) {
        if (
          outcome.code === "SIMULATION_INPUTS_CHANGED_AFTER_VALIDATION" ||
          outcome.code === "SIMULATION_CONFIGURATION_STALE"
        ) {
          markValidationStale();
        }
        updateCampaignState(selectedCampaignId, (current) => ({
          ...current,
          status: "error",
          result: null,
          issues: outcome.issues,
          errorMessage: outcome.message,
          errorCode: outcome.code,
          isStale:
            outcome.code === "SIMULATION_INPUTS_CHANGED_AFTER_VALIDATION" ||
            outcome.code === "SIMULATION_CONFIGURATION_STALE",
          sourceFingerprint: null,
          configurationFingerprint: null,
        }));
        return false;
      }

      updateCampaignState(selectedCampaignId, (current) => ({
        ...current,
        status: "success",
        result: outcome.result,
        staleResult: null,
        issues: [],
        errorMessage: null,
        errorCode: null,
        isStale: false,
        sourceFingerprint: outcome.result.sourceFingerprint,
        configurationFingerprint: outcome.result.configurationFingerprint,
        lastSuccessfulRunSequence: outcome.result.runSequence,
        runSequence: outcome.result.runSequence,
      }));
      return true;
    } catch {
      updateCampaignState(selectedCampaignId, (current) => ({
        ...current,
        status: "error",
        result: null,
        issues: [
          {
            code: "SIMULATION_EXECUTION_FAILED",
            message: "La simulation n’a pas pu être calculée.",
            scope: "engine",
          },
        ],
        errorMessage: "La simulation n’a pas pu être calculée.",
        errorCode: "SIMULATION_EXECUTION_FAILED",
      }));
      return false;
    } finally {
      runningCampaignIdsRef.current.delete(selectedCampaignId);
    }
  }, [
    isReadOnly,
    markValidationStale,
    selectedCampaignId,
    services,
    statesByCampaignId,
    updateCampaignState,
    validatedConfiguration,
    validationStatus,
  ]);

  const value = useMemo<SimulationExecutionContextValue>(
    () => ({
      execution,
      canLaunch,
      launchSimulation,
      markStale,
      clearCurrentResultPresentation,
    }),
    [
      canLaunch,
      clearCurrentResultPresentation,
      execution,
      launchSimulation,
      markStale,
    ],
  );

  return (
    <SimulationExecutionContext.Provider value={value}>
      {children}
    </SimulationExecutionContext.Provider>
  );
}

export function useSimulationExecution(): SimulationExecutionContextValue {
  const context = useContext(SimulationExecutionContext);
  if (!context) {
    throw new Error(
      "useSimulationExecution doit être utilisé dans SimulationExecutionProvider.",
    );
  }
  return context;
}
