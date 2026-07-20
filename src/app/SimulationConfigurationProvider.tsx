/**
 * État de configuration de simulation en mémoire de session (Lot 2B-2).
 * Aucune persistance localStorage / SQLite / AppData.
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
import {
  buildCampaignSimulationReadiness,
  createCampaignSimulationReadinessPortsFromServices,
} from "../application/campaignSimulation/buildCampaignSimulationReadiness";
import { buildSimulationSourceFingerprint } from "../application/campaignSimulation/buildSimulationSourceFingerprint";
import {
  buildConfigurationFingerprint,
  formatBasisPointsAsPercent,
  formatExactAmountAsFcfa,
} from "../application/campaignSimulation/formatExactBudgetDisplay";
import type { CampaignSimulationReadinessReport } from "../application/campaignSimulation/campaignSimulationModels";
import {
  parseSimulationConfigurationDraft,
  type ParsedSimulationConfiguration,
} from "../application/campaignSimulation/parseSimulationConfiguration";
import {
  createEmptyConfigurationDraft,
  type CampaignSimulationConfigurationDraft,
  type ValidatedCampaignSimulationConfiguration,
  type BudgetTargetModeChoice,
} from "../application/campaignSimulation/simulationConfigurationModels";
import { resolveBudgetTarget } from "../domain/compensationCalculation";
import type { Campaign } from "../infrastructure/database/types";
import { toUserMessage } from "../services/errors";
import { useAppData } from "./AppDataProvider";
import { useCompensationReference } from "./CompensationReferenceProvider";

export type SimulationReadinessLoadStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error";

export type SimulationValidationStatus =
  | "none"
  | "validated"
  | "stale";

interface SimulationConfigurationContextValue {
  selectedCampaignId: number | null;
  selectedCampaign: Campaign | null;
  isReadOnly: boolean;
  draft: CampaignSimulationConfigurationDraft | null;
  parsed: ParsedSimulationConfiguration | null;
  readinessReport: CampaignSimulationReadinessReport | null;
  readinessStatus: SimulationReadinessLoadStatus;
  readinessErrorMessage: string | null;
  validatedConfiguration: ValidatedCampaignSimulationConfiguration | null;
  validationStatus: SimulationValidationStatus;
  resolvedBudgetLabel: string | null;
  resolvedBudgetDetails: {
    mode: BudgetTargetModeChoice;
    lines: string[];
  } | null;
  canValidate: boolean;
  selectCampaign: (campaignId: number | null) => void;
  setBudgetTargetMode: (mode: BudgetTargetModeChoice | null) => void;
  setManualBudgetInput: (value: string) => void;
  setEligiblePayrollInput: (value: string) => void;
  setBudgetRatePercentInput: (value: string) => void;
  setRoundingStepInput: (value: string) => void;
  applyRoundingStepSuggestion: (value: string) => void;
  setCampaignYearInput: (value: string) => void;
  setTechnicalApplicationMonthInput: (value: string) => void;
  validateConfiguration: () => Promise<boolean>;
  refreshReadiness: () => Promise<void>;
  /** Marque le snapshot validé de la campagne courante comme stale. */
  markValidationStale: () => void;
}

const SimulationConfigurationContext =
  createContext<SimulationConfigurationContextValue | null>(null);

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

function cloneDraft(
  draft: CampaignSimulationConfigurationDraft,
): CampaignSimulationConfigurationDraft {
  return { ...draft };
}

interface SimulationConfigurationProviderProps {
  children: ReactNode;
}

export function SimulationConfigurationProvider({
  children,
}: SimulationConfigurationProviderProps) {
  const { status: appStatus, campaigns, services } = useAppData();
  const {
    referenceSet,
    completeness: referenceCompleteness,
    selectedCampaignId: referenceSelectedCampaignId,
  } = useCompensationReference();

  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(
    null,
  );
  const [hasUserSelected, setHasUserSelected] = useState(false);
  const [draftsByCampaignId, setDraftsByCampaignId] = useState<
    Record<number, CampaignSimulationConfigurationDraft>
  >({});
  const [validatedByCampaignId, setValidatedByCampaignId] = useState<
    Record<number, ValidatedCampaignSimulationConfiguration>
  >({});
  const [validationStatusByCampaignId, setValidationStatusByCampaignId] =
    useState<Record<number, SimulationValidationStatus>>({});
  const [sessionSequence, setSessionSequence] = useState(0);

  const [readinessReport, setReadinessReport] =
    useState<CampaignSimulationReadinessReport | null>(null);
  const [readinessStatus, setReadinessStatus] =
    useState<SimulationReadinessLoadStatus>("idle");
  const [readinessErrorMessage, setReadinessErrorMessage] = useState<
    string | null
  >(null);

  const reloadTokenRef = useRef(0);

  const selectedCampaign = useMemo(
    () =>
      campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId],
  );

  const isReadOnly = selectedCampaign?.status === "archived";

  const draft = useMemo(() => {
    if (selectedCampaignId === null) return null;
    return (
      draftsByCampaignId[selectedCampaignId] ??
      createEmptyConfigurationDraft(selectedCampaignId, {
        campaignYear: selectedCampaign?.referenceYear,
      })
    );
  }, [draftsByCampaignId, selectedCampaign?.referenceYear, selectedCampaignId]);

  const parsed = useMemo(
    () => (draft ? parseSimulationConfigurationDraft(draft) : null),
    [draft],
  );

  const validatedConfiguration =
    selectedCampaignId !== null
      ? (validatedByCampaignId[selectedCampaignId] ?? null)
      : null;

  const validationStatus: SimulationValidationStatus =
    selectedCampaignId !== null
      ? (validationStatusByCampaignId[selectedCampaignId] ?? "none")
      : "none";

  const ensureDraft = useCallback(
    (campaignId: number) => {
      const campaign = campaigns.find((item) => item.id === campaignId);
      setDraftsByCampaignId((prev) => {
        if (prev[campaignId]) return prev;
        return {
          ...prev,
          [campaignId]: createEmptyConfigurationDraft(campaignId, {
            campaignYear: campaign?.referenceYear,
          }),
        };
      });
    },
    [campaigns],
  );

  useEffect(() => {
    if (appStatus !== "ready") return;
    if (hasUserSelected) return;
    const preferred = pickDefaultCampaign(campaigns);
    const preferredId = preferred?.id ?? null;
    setSelectedCampaignId((current) =>
      current === preferredId ? current : preferredId,
    );
    if (preferred) {
      ensureDraft(preferred.id);
    }
  }, [appStatus, campaigns, ensureDraft, hasUserSelected]);

  const selectCampaign = useCallback(
    (campaignId: number | null) => {
      setHasUserSelected(true);
      setSelectedCampaignId(campaignId);
      if (campaignId !== null) {
        ensureDraft(campaignId);
      }
    },
    [ensureDraft],
  );

  const patchDraft = useCallback(
    (
      updater: (
        current: CampaignSimulationConfigurationDraft,
      ) => CampaignSimulationConfigurationDraft,
    ) => {
      if (selectedCampaignId === null) return;
      setDraftsByCampaignId((prev) => {
        const current =
          prev[selectedCampaignId] ??
          createEmptyConfigurationDraft(selectedCampaignId, {
            campaignYear: selectedCampaign?.referenceYear,
          });
        return {
          ...prev,
          [selectedCampaignId]: updater(cloneDraft(current)),
        };
      });
      setValidationStatusByCampaignId((prev) => {
        if ((prev[selectedCampaignId] ?? "none") === "validated") {
          return { ...prev, [selectedCampaignId]: "stale" };
        }
        return prev;
      });
    },
    [selectedCampaign?.referenceYear, selectedCampaignId],
  );

  const setBudgetTargetMode = useCallback(
    (mode: BudgetTargetModeChoice | null) => {
      patchDraft((current) => ({ ...current, budgetTargetMode: mode }));
    },
    [patchDraft],
  );

  const setManualBudgetInput = useCallback(
    (value: string) => {
      patchDraft((current) => ({ ...current, manualBudgetInput: value }));
    },
    [patchDraft],
  );

  const setEligiblePayrollInput = useCallback(
    (value: string) => {
      patchDraft((current) => ({ ...current, eligiblePayrollInput: value }));
    },
    [patchDraft],
  );

  const setBudgetRatePercentInput = useCallback(
    (value: string) => {
      patchDraft((current) => ({
        ...current,
        budgetRatePercentInput: value,
      }));
    },
    [patchDraft],
  );

  const setRoundingStepInput = useCallback(
    (value: string) => {
      patchDraft((current) => ({
        ...current,
        roundingStepInput: value,
        roundingMode: "nearest_half_up",
      }));
    },
    [patchDraft],
  );

  const applyRoundingStepSuggestion = useCallback(
    (value: string) => {
      setRoundingStepInput(value);
    },
    [setRoundingStepInput],
  );

  const setCampaignYearInput = useCallback(
    (value: string) => {
      patchDraft((current) => ({ ...current, campaignYearInput: value }));
    },
    [patchDraft],
  );

  const setTechnicalApplicationMonthInput = useCallback(
    (value: string) => {
      patchDraft((current) => ({
        ...current,
        technicalApplicationMonthInput: value,
      }));
    },
    [patchDraft],
  );

  const draftFingerprint = draft
    ? [
        draft.campaignId,
        draft.budgetTargetMode ?? "",
        draft.manualBudgetInput,
        draft.eligiblePayrollInput,
        draft.budgetRatePercentInput,
        draft.roundingMode ?? "",
        draft.roundingStepInput,
        draft.campaignYearInput,
        draft.technicalApplicationMonthInput,
      ].join("|")
    : "";

  const referenceRevision = [
    selectedCampaignId ?? "",
    referenceSelectedCampaignId ?? "",
    referenceSet?.campaignId ?? "",
    referenceSet?.config.updatedAt ?? "",
    referenceSet?.config.nineBoxMode ?? "",
    referenceCompleteness?.ready ?? "",
    referenceCompleteness?.percent ?? "",
    referenceCompleteness?.salaryGridFilledCount ?? "",
  ].join("|");

  const refreshReadiness = useCallback(async () => {
    if (selectedCampaignId === null) {
      setReadinessReport(null);
      setReadinessStatus("idle");
      setReadinessErrorMessage(null);
      return;
    }

    const token = ++reloadTokenRef.current;
    setReadinessStatus("loading");
    setReadinessErrorMessage(null);

    try {
      const currentDraft =
        draftsByCampaignId[selectedCampaignId] ??
        createEmptyConfigurationDraft(selectedCampaignId, {
          campaignYear: selectedCampaign?.referenceYear,
        });
      const currentParsed = parseSimulationConfigurationDraft(currentDraft);
      const ports = createCampaignSimulationReadinessPortsFromServices(services);
      const report = await buildCampaignSimulationReadiness(
        {
          campaignId: selectedCampaignId,
          ...(currentParsed.budgetTarget
            ? { budgetTarget: currentParsed.budgetTarget }
            : {}),
          ...(currentParsed.roundingPolicy
            ? { roundingPolicy: currentParsed.roundingPolicy }
            : {}),
        },
        ports,
      );
      if (token !== reloadTokenRef.current) return;
      setReadinessReport(report);
      setReadinessStatus("ready");
    } catch (error) {
      if (token !== reloadTokenRef.current) return;
      setReadinessReport(null);
      setReadinessStatus("error");
      setReadinessErrorMessage(
        toUserMessage(
          error,
          "Impossible de charger l’état de préparation de la simulation.",
        ),
      );
    }
  }, [draftsByCampaignId, selectedCampaign?.referenceYear, selectedCampaignId, services]);

  useEffect(() => {
    if (selectedCampaignId === null) {
      setReadinessReport(null);
      setReadinessStatus("idle");
      setReadinessErrorMessage(null);
      return;
    }

    const handle = window.setTimeout(() => {
      void refreshReadiness();
    }, 40);

    return () => {
      window.clearTimeout(handle);
    };
  }, [draftFingerprint, referenceRevision, refreshReadiness, selectedCampaignId]);

  // Invalide le snapshot si les sources rechargées ne correspondent plus à l’empreinte.
  useEffect(() => {
    if (selectedCampaignId === null) return;
    if (validationStatus !== "validated") return;
    if (!validatedConfiguration || !readinessReport) return;
    if (readinessStatus !== "ready") return;

    const currentFingerprint = buildSimulationSourceFingerprint({
      campaignId: selectedCampaignId,
      campaignStatus: readinessReport.campaignStatus,
      evaluationMode: readinessReport.evaluationMode,
      currentImportBatchId: readinessReport.currentImportBatchId,
      preparedEmployees: readinessReport.preparedEmployees,
      preparedReferences: readinessReport.preparedReferences,
      budgetTarget: validatedConfiguration.budgetTarget,
      roundingPolicy: validatedConfiguration.roundingPolicy,
      campaignYear: validatedConfiguration.campaignYear,
      technicalApplicationMonth: validatedConfiguration.technicalApplicationMonth,
    });

    if (currentFingerprint !== validatedConfiguration.sourceFingerprint) {
      setValidationStatusByCampaignId((prev) => ({
        ...prev,
        [selectedCampaignId]: "stale",
      }));
    }
  }, [
    readinessReport,
    readinessStatus,
    selectedCampaignId,
    validatedConfiguration,
    validationStatus,
  ]);

  const resolvedBudgetDetails = useMemo(() => {
    if (!parsed?.budgetTarget) return null;
    try {
      const resolved = resolveBudgetTarget(parsed.budgetTarget);
      const label = formatExactAmountAsFcfa(resolved.exactAmount);
      if (resolved.mode === "manual_amount") {
        return {
          mode: "manual_amount" as const,
          lines: [`Budget annuel cible exact : ${label}`],
        };
      }
      const payroll = resolved.eligiblePayrollFcfa ?? 0n;
      const rate = resolved.budgetRateBasisPoints ?? 0n;
      return {
        mode: "percentage_of_eligible_payroll" as const,
        lines: [
          `Assiette mensuelle : ${formatExactAmountAsFcfa({ numerator: payroll, denominator: 1n })}`,
          `Taux : ${formatBasisPointsAsPercent(rate)}`,
          `Budget annuel cible exact : ${label}`,
        ],
      };
    } catch {
      return null;
    }
  }, [parsed]);

  const resolvedBudgetLabel =
    resolvedBudgetDetails && resolvedBudgetDetails.lines.length > 0
      ? resolvedBudgetDetails.lines[resolvedBudgetDetails.lines.length - 1]
      : null;

  const canValidate = Boolean(
    selectedCampaign &&
      !isReadOnly &&
      readinessReport?.isReady &&
      parsed?.isConfigurationComplete &&
      readinessStatus === "ready",
  );

  const validateConfiguration = useCallback(async () => {
    if (selectedCampaignId === null || !selectedCampaign) return false;
    if (isReadOnly) return false;

    await refreshReadiness();
    const currentDraft =
      draftsByCampaignId[selectedCampaignId] ??
      createEmptyConfigurationDraft(selectedCampaignId, {
        campaignYear: selectedCampaign.referenceYear,
      });
    const currentParsed = parseSimulationConfigurationDraft(currentDraft);
    if (
      !currentParsed.isConfigurationComplete ||
      !currentParsed.budgetTarget ||
      !currentParsed.roundingPolicy ||
      currentParsed.campaignYear === null ||
      currentParsed.technicalApplicationMonth === null
    ) {
      return false;
    }

    const ports = createCampaignSimulationReadinessPortsFromServices(services);
    const report = await buildCampaignSimulationReadiness(
      {
        campaignId: selectedCampaignId,
        budgetTarget: currentParsed.budgetTarget,
        roundingPolicy: currentParsed.roundingPolicy,
      },
      ports,
    );

    if (!report.isReady) {
      setReadinessReport(report);
      setReadinessStatus("ready");
      return false;
    }

    const nextSequence = sessionSequence + 1;
    setSessionSequence(nextSequence);
    const fingerprint = buildConfigurationFingerprint({
      campaignId: selectedCampaignId,
      budgetMode: currentParsed.budgetTarget.mode,
      manualBudget:
        currentParsed.budgetTarget.mode === "manual_amount"
          ? BigInt(currentParsed.budgetTarget.manualBudgetFcfa ?? 0)
          : undefined,
      eligiblePayroll:
        currentParsed.budgetTarget.mode === "percentage_of_eligible_payroll"
          ? BigInt(currentParsed.budgetTarget.eligiblePayrollFcfa ?? 0)
          : undefined,
      budgetRateBps:
        currentParsed.budgetTarget.mode === "percentage_of_eligible_payroll"
          ? BigInt(currentParsed.budgetTarget.budgetRateBasisPoints ?? 0)
          : undefined,
      roundingMode: currentParsed.roundingPolicy.mode,
      roundingStep: BigInt(currentParsed.roundingPolicy.stepFcfa),
      campaignYear: currentParsed.campaignYear,
      technicalApplicationMonth: currentParsed.technicalApplicationMonth,
    });
    const sourceFingerprint = buildSimulationSourceFingerprint({
      campaignId: selectedCampaignId,
      campaignStatus: report.campaignStatus,
      evaluationMode: report.evaluationMode,
      currentImportBatchId: report.currentImportBatchId,
      preparedEmployees: report.preparedEmployees,
      preparedReferences: report.preparedReferences,
      budgetTarget: currentParsed.budgetTarget,
      roundingPolicy: currentParsed.roundingPolicy,
      campaignYear: currentParsed.campaignYear,
      technicalApplicationMonth: currentParsed.technicalApplicationMonth,
    });

    const snapshot: ValidatedCampaignSimulationConfiguration = {
      campaignId: selectedCampaignId,
      budgetTarget: currentParsed.budgetTarget,
      roundingPolicy: currentParsed.roundingPolicy,
      campaignYear: currentParsed.campaignYear,
      technicalApplicationMonth: currentParsed.technicalApplicationMonth,
      readinessReport: report,
      validatedAtSessionSequence: nextSequence,
      configurationFingerprint: fingerprint,
      sourceFingerprint,
    };

    setValidatedByCampaignId((prev) => ({
      ...prev,
      [selectedCampaignId]: snapshot,
    }));
    setValidationStatusByCampaignId((prev) => ({
      ...prev,
      [selectedCampaignId]: "validated",
    }));
    setReadinessReport(report);
    setReadinessStatus("ready");
    return true;
  }, [
    draftsByCampaignId,
    isReadOnly,
    refreshReadiness,
    selectedCampaign,
    selectedCampaignId,
    services,
    sessionSequence,
  ]);

  const markValidationStale = useCallback(() => {
    if (selectedCampaignId === null) return;
    setValidationStatusByCampaignId((prev) => {
      if ((prev[selectedCampaignId] ?? "none") === "none") return prev;
      return { ...prev, [selectedCampaignId]: "stale" };
    });
  }, [selectedCampaignId]);

  const value = useMemo<SimulationConfigurationContextValue>(
    () => ({
      selectedCampaignId,
      selectedCampaign,
      isReadOnly,
      draft,
      parsed,
      readinessReport,
      readinessStatus,
      readinessErrorMessage,
      validatedConfiguration,
      validationStatus,
      resolvedBudgetLabel,
      resolvedBudgetDetails,
      canValidate,
      selectCampaign,
      setBudgetTargetMode,
      setManualBudgetInput,
      setEligiblePayrollInput,
      setBudgetRatePercentInput,
      setRoundingStepInput,
      applyRoundingStepSuggestion,
      setCampaignYearInput,
      setTechnicalApplicationMonthInput,
      validateConfiguration,
      refreshReadiness,
      markValidationStale,
    }),
    [
      applyRoundingStepSuggestion,
      canValidate,
      draft,
      isReadOnly,
      markValidationStale,
      parsed,
      readinessErrorMessage,
      readinessReport,
      readinessStatus,
      refreshReadiness,
      resolvedBudgetDetails,
      resolvedBudgetLabel,
      selectCampaign,
      selectedCampaign,
      selectedCampaignId,
      setBudgetRatePercentInput,
      setBudgetTargetMode,
      setCampaignYearInput,
      setEligiblePayrollInput,
      setManualBudgetInput,
      setRoundingStepInput,
      setTechnicalApplicationMonthInput,
      validateConfiguration,
      validatedConfiguration,
      validationStatus,
    ],
  );

  return (
    <SimulationConfigurationContext.Provider value={value}>
      {children}
    </SimulationConfigurationContext.Provider>
  );
}

export function useSimulationConfiguration(): SimulationConfigurationContextValue {
  const context = useContext(SimulationConfigurationContext);
  if (!context) {
    throw new Error(
      "useSimulationConfiguration doit être utilisé dans SimulationConfigurationProvider.",
    );
  }
  return context;
}
