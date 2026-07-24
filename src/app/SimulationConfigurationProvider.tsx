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
import {
  MINIMUM_INCREASE_CONTRACT_VERSION,
  UNIVERSAL_FIXED_AMOUNT_CONTRACT_VERSION,
  defaultUniversalFixedAmountSeniorityReferenceDate,
  employerCostLiabilityFingerprintToken,
  normalizeEmployerCostPolicy,
  type EmployerCostPolicy,
  type MinimumIncreaseMode,
  type SocialMechanismKind,
} from "../domain/compensationCalculation";
import type {
  EmployerCostPolicyKindChoice,
} from "../application/campaignSimulation/parseSimulationConfiguration";
import type { Campaign } from "../infrastructure/database/types";
import { toUserMessage } from "../services/errors";
import { useAppData } from "./AppDataProvider";
import { useCompensationReference } from "./CompensationReferenceProvider";

function employerCostFingerprintParts(policy: EmployerCostPolicy): {
  employerCostPolicyKind: string;
  employerCostRateNumerator: bigint | null;
  employerCostRateDenominator: bigint | null;
  employerCostLiability: string;
} {
  const normalized = normalizeEmployerCostPolicy(policy);
  if (normalized.kind === "neutral") {
    return {
      employerCostPolicyKind: "neutral",
      employerCostRateNumerator: null,
      employerCostRateDenominator: null,
      employerCostLiability: employerCostLiabilityFingerprintToken(
        normalized.componentLiability,
      ),
    };
  }
  const rate = normalized.components[0]?.rate ?? null;
  return {
    employerCostPolicyKind: "rate_on_gross_period",
    employerCostRateNumerator: rate?.numerator ?? null,
    employerCostRateDenominator: rate?.denominator ?? null,
    employerCostLiability: employerCostLiabilityFingerprintToken(
      normalized.componentLiability,
    ),
  };
}

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
  setRetroactivityStartMonthInput: (value: string) => void;
  setTechnicalApplicationMonthInput: (value: string) => void;
  setMinimumGuaranteeEffectiveMonthInput: (value: string) => void;
  /** Aligne le mois d’effet du minimum sur le mois technique courant (UI). */
  alignMinimumGuaranteeEffectiveMonthToTechnical: () => void;
  setSocialMechanismKind: (kind: SocialMechanismKind) => void;
  setUniversalFixedAmountMonthlyAmountInput: (value: string) => void;
  setUniversalFixedAmountEffectiveMonthInput: (value: string) => void;
  setUniversalFixedAmountMinimumSeniorityMonthsInput: (value: string) => void;
  setUniversalFixedAmountSeniorityReferenceDateInput: (value: string) => void;
  /** Réinitialise la date de référence d’ancienneté au 31/12 N−1. */
  resetUniversalFixedAmountSeniorityReferenceDateToDefault: () => void;
  /** Aligne le mois d’effet du forfait sur le mois technique courant (UI). */
  alignUniversalFixedAmountEffectiveMonthToTechnical: () => void;
  setMinimumIncreaseMode: (mode: MinimumIncreaseMode) => void;
  setMinimumMonthlyAmountInput: (value: string) => void;
  setMinimumIncreaseRatePercentInput: (value: string) => void;
  setEmployerCostPolicyKind: (kind: EmployerCostPolicyKindChoice) => void;
  setEmployerCostRatePercentInput: (value: string) => void;
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
      patchDraft((current) => {
        const prevYear = Number.parseInt(current.campaignYearInput.trim(), 10);
        const nextYear = Number.parseInt(value.trim(), 10);
        let seniorityDate =
          current.universalFixedAmountSeniorityReferenceDateInput;
        if (
          Number.isInteger(prevYear) &&
          prevYear >= 2000 &&
          prevYear <= 2100 &&
          Number.isInteger(nextYear) &&
          nextYear >= 2000 &&
          nextYear <= 2100
        ) {
          const oldDefault =
            defaultUniversalFixedAmountSeniorityReferenceDate(prevYear);
          if (
            seniorityDate.trim() === "" ||
            seniorityDate.trim() === oldDefault
          ) {
            seniorityDate =
              defaultUniversalFixedAmountSeniorityReferenceDate(nextYear);
          }
        }
        return {
          ...current,
          campaignYearInput: value,
          universalFixedAmountSeniorityReferenceDateInput: seniorityDate,
        };
      });
    },
    [patchDraft],
  );

  const setRetroactivityStartMonthInput = useCallback(
    (value: string) => {
      patchDraft((current) => ({
        ...current,
        retroactivityStartMonthInput: value,
      }));
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

  const setMinimumGuaranteeEffectiveMonthInput = useCallback(
    (value: string) => {
      patchDraft((current) => ({
        ...current,
        minimumGuaranteeEffectiveMonthInput: value,
      }));
    },
    [patchDraft],
  );

  const alignMinimumGuaranteeEffectiveMonthToTechnical = useCallback(() => {
    patchDraft((current) => ({
      ...current,
      minimumGuaranteeEffectiveMonthInput:
        current.technicalApplicationMonthInput,
    }));
  }, [patchDraft]);

  const setSocialMechanismKind = useCallback(
    (kind: SocialMechanismKind) => {
      patchDraft((current) => ({
        ...current,
        socialMechanismKind: kind,
        ...(kind === "minimum_guaranteed" && current.minimumIncreaseMode === "none"
          ? { minimumIncreaseMode: "fixed_monthly_amount" as const }
          : {}),
      }));
    },
    [patchDraft],
  );

  const setUniversalFixedAmountMonthlyAmountInput = useCallback(
    (value: string) => {
      patchDraft((current) => ({
        ...current,
        universalFixedAmountMonthlyAmountInput: value,
      }));
    },
    [patchDraft],
  );

  const setUniversalFixedAmountEffectiveMonthInput = useCallback(
    (value: string) => {
      patchDraft((current) => ({
        ...current,
        universalFixedAmountEffectiveMonthInput: value,
      }));
    },
    [patchDraft],
  );

  const setUniversalFixedAmountMinimumSeniorityMonthsInput = useCallback(
    (value: string) => {
      patchDraft((current) => ({
        ...current,
        universalFixedAmountMinimumSeniorityMonthsInput: value,
      }));
    },
    [patchDraft],
  );

  const setUniversalFixedAmountSeniorityReferenceDateInput = useCallback(
    (value: string) => {
      patchDraft((current) => ({
        ...current,
        universalFixedAmountSeniorityReferenceDateInput: value,
      }));
    },
    [patchDraft],
  );

  const resetUniversalFixedAmountSeniorityReferenceDateToDefault = useCallback(() => {
    patchDraft((current) => {
      const year = Number.parseInt(current.campaignYearInput.trim(), 10);
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        return current;
      }
      return {
        ...current,
        universalFixedAmountSeniorityReferenceDateInput:
          defaultUniversalFixedAmountSeniorityReferenceDate(year),
      };
    });
  }, [patchDraft]);

  const alignUniversalFixedAmountEffectiveMonthToTechnical = useCallback(() => {
    patchDraft((current) => ({
      ...current,
      universalFixedAmountEffectiveMonthInput:
        current.technicalApplicationMonthInput,
    }));
  }, [patchDraft]);

  const setMinimumIncreaseMode = useCallback(
    (mode: MinimumIncreaseMode) => {
      patchDraft((current) => ({
        ...current,
        minimumIncreaseMode: mode,
        ...(mode === "none"
          ? {
              minimumMonthlyAmountInput: "",
              minimumIncreaseRatePercentInput: "",
            }
          : mode === "fixed_monthly_amount"
            ? { minimumIncreaseRatePercentInput: "" }
            : { minimumMonthlyAmountInput: "" }),
      }));
    },
    [patchDraft],
  );

  const setMinimumMonthlyAmountInput = useCallback(
    (value: string) => {
      patchDraft((current) => ({
        ...current,
        minimumMonthlyAmountInput: value,
      }));
    },
    [patchDraft],
  );

  const setMinimumIncreaseRatePercentInput = useCallback(
    (value: string) => {
      patchDraft((current) => ({
        ...current,
        minimumIncreaseRatePercentInput: value,
      }));
    },
    [patchDraft],
  );

  const setEmployerCostPolicyKind = useCallback(
    (kind: EmployerCostPolicyKindChoice) => {
      patchDraft((current) => ({
        ...current,
        employerCostPolicyKind: kind,
        ...(kind === "neutral" ? { employerCostRatePercentInput: "" } : {}),
      }));
    },
    [patchDraft],
  );

  const setEmployerCostRatePercentInput = useCallback(
    (value: string) => {
      patchDraft((current) => ({
        ...current,
        employerCostRatePercentInput: value,
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
        draft.retroactivityStartMonthInput,
        draft.technicalApplicationMonthInput,
        draft.minimumGuaranteeEffectiveMonthInput,
        draft.socialMechanismKind,
        draft.minimumIncreaseMode,
        draft.minimumMonthlyAmountInput,
        draft.minimumIncreaseRatePercentInput,
        draft.universalFixedAmountMonthlyAmountInput,
        draft.universalFixedAmountEffectiveMonthInput,
        draft.universalFixedAmountMinimumSeniorityMonthsInput,
        draft.universalFixedAmountSeniorityReferenceDateInput,
        draft.employerCostPolicyKind,
        draft.employerCostRatePercentInput,
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
      retroactivityStartMonth: validatedConfiguration.retroactivityStartMonth,
      technicalApplicationMonth: validatedConfiguration.technicalApplicationMonth,
      minimumGuaranteeEffectiveMonth:
        validatedConfiguration.minimumGuaranteeEffectiveMonth,
      minimumIncreasePolicy: validatedConfiguration.minimumIncreasePolicy,
      socialMechanismKind: validatedConfiguration.socialMechanismKind,
      universalFixedAmountPolicy:
        validatedConfiguration.universalFixedAmountPolicy,
      employerCostPolicy: validatedConfiguration.employerCostPolicy,
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
    const coveredMonths = parsed.retroactivityStartMonth
      ? 13 - parsed.retroactivityStartMonth
      : 12;
    try {
      const resolved = resolveBudgetTarget(parsed.budgetTarget, {
        campaignCoveredMonthCount: coveredMonths,
      });
      const label = formatExactAmountAsFcfa(resolved.exactAmount);
      const periodHint =
        coveredMonths === 12
          ? "12 mois (janvier–décembre)"
          : `${coveredMonths} mois (période d’effet)`;
      if (resolved.mode === "manual_amount") {
        return {
          mode: "manual_amount" as const,
          lines: [`Enveloppe de la période d’effet (${periodHint}) : ${label}`],
        };
      }
      const payroll = resolved.eligiblePayrollFcfa ?? 0n;
      const rate = resolved.budgetRateBasisPoints ?? 0n;
      return {
        mode: "percentage_of_eligible_payroll" as const,
        lines: [
          `Assiette mensuelle : ${formatExactAmountAsFcfa({ numerator: payroll, denominator: 1n })}`,
          `Taux : ${formatBasisPointsAsPercent(rate)}`,
          `Mois couverts : ${coveredMonths}`,
          `Enveloppe de la période d’effet : ${label}`,
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
      currentParsed.retroactivityStartMonth === null ||
      currentParsed.technicalApplicationMonth === null ||
      currentParsed.minimumGuaranteeEffectiveMonth === null ||
      !currentParsed.socialMechanismKind ||
      !currentParsed.minimumIncreasePolicy ||
      !currentParsed.universalFixedAmountPolicy ||
      !currentParsed.employerCostPolicy ||
      !currentParsed.isSocialMechanismComplete ||
      !currentParsed.isEmployerCostComplete
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
    const employerCostFp = employerCostFingerprintParts(
      currentParsed.employerCostPolicy,
    );
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
      retroactivityStartMonth: currentParsed.retroactivityStartMonth,
      technicalApplicationMonth: currentParsed.technicalApplicationMonth,
      minimumGuaranteeEffectiveMonth:
        currentParsed.minimumGuaranteeEffectiveMonth,
      minimumIncreaseMode: currentParsed.minimumIncreasePolicy.mode,
      minimumMonthlyAmountFcfa:
        currentParsed.minimumIncreasePolicy.minimumMonthlyAmountFcfa,
      minimumIncreaseRateNumerator:
        currentParsed.minimumIncreasePolicy.minimumIncreaseRate?.numerator ??
        null,
      minimumIncreaseRateDenominator:
        currentParsed.minimumIncreasePolicy.minimumIncreaseRate?.denominator ??
        null,
      minimumIncreaseContractVersion: MINIMUM_INCREASE_CONTRACT_VERSION,
      socialMechanismKind: currentParsed.socialMechanismKind,
      universalFixedAmountMonthlyAmount:
        currentParsed.socialMechanismKind === "universal_fixed_amount"
          ? currentParsed.universalFixedAmountPolicy.monthlyAmountFcfa
          : null,
      universalFixedAmountEffectiveMonth:
        currentParsed.socialMechanismKind === "universal_fixed_amount"
          ? currentParsed.universalFixedAmountPolicy.effectiveMonth
          : null,
      universalFixedAmountMinimumSeniorityMonths:
        currentParsed.socialMechanismKind === "universal_fixed_amount"
          ? currentParsed.universalFixedAmountPolicy.minimumSeniorityMonths
          : null,
      universalFixedAmountSeniorityReferenceDate:
        currentParsed.socialMechanismKind === "universal_fixed_amount"
          ? currentParsed.universalFixedAmountPolicy.seniorityReferenceDate
          : null,
      universalFixedAmountContractVersion: UNIVERSAL_FIXED_AMOUNT_CONTRACT_VERSION,
      ...employerCostFp,
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
      retroactivityStartMonth: currentParsed.retroactivityStartMonth,
      technicalApplicationMonth: currentParsed.technicalApplicationMonth,
      minimumGuaranteeEffectiveMonth:
        currentParsed.minimumGuaranteeEffectiveMonth,
      minimumIncreasePolicy: currentParsed.minimumIncreasePolicy,
      socialMechanismKind: currentParsed.socialMechanismKind,
      universalFixedAmountPolicy: currentParsed.universalFixedAmountPolicy,
      employerCostPolicy: currentParsed.employerCostPolicy,
    });

    const snapshot: ValidatedCampaignSimulationConfiguration = {
      campaignId: selectedCampaignId,
      budgetTarget: currentParsed.budgetTarget,
      roundingPolicy: currentParsed.roundingPolicy,
      campaignYear: currentParsed.campaignYear,
      retroactivityStartMonth: currentParsed.retroactivityStartMonth,
      technicalApplicationMonth: currentParsed.technicalApplicationMonth,
      minimumGuaranteeEffectiveMonth:
        currentParsed.minimumGuaranteeEffectiveMonth,
      minimumIncreasePolicy: currentParsed.minimumIncreasePolicy,
      socialMechanismKind: currentParsed.socialMechanismKind,
      universalFixedAmountPolicy: currentParsed.universalFixedAmountPolicy,
      employerCostPolicy: currentParsed.employerCostPolicy,
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
      setRetroactivityStartMonthInput,
      setTechnicalApplicationMonthInput,
      setMinimumGuaranteeEffectiveMonthInput,
      alignMinimumGuaranteeEffectiveMonthToTechnical,
      setSocialMechanismKind,
      setUniversalFixedAmountMonthlyAmountInput,
      setUniversalFixedAmountEffectiveMonthInput,
      setUniversalFixedAmountMinimumSeniorityMonthsInput,
      setUniversalFixedAmountSeniorityReferenceDateInput,
      resetUniversalFixedAmountSeniorityReferenceDateToDefault,
      alignUniversalFixedAmountEffectiveMonthToTechnical,
      setMinimumIncreaseMode,
      setMinimumMonthlyAmountInput,
      setMinimumIncreaseRatePercentInput,
      setEmployerCostPolicyKind,
      setEmployerCostRatePercentInput,
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
      setEmployerCostPolicyKind,
      setEmployerCostRatePercentInput,
      setManualBudgetInput,
      setMinimumIncreaseMode,
      setMinimumIncreaseRatePercentInput,
      setMinimumMonthlyAmountInput,
      setMinimumGuaranteeEffectiveMonthInput,
      alignMinimumGuaranteeEffectiveMonthToTechnical,
      resetUniversalFixedAmountSeniorityReferenceDateToDefault,
      setSocialMechanismKind,
      setUniversalFixedAmountMonthlyAmountInput,
      setUniversalFixedAmountEffectiveMonthInput,
      setUniversalFixedAmountMinimumSeniorityMonthsInput,
      setUniversalFixedAmountSeniorityReferenceDateInput,
      alignUniversalFixedAmountEffectiveMonthToTechnical,
      setRoundingStepInput,
      setRetroactivityStartMonthInput,
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
