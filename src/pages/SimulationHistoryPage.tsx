/** Page Historique des simulations persistées (Lot 2B-4B). */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatExactAmountAsFcfa,
  formatFcfaInteger,
} from "../application/campaignSimulation/formatExactBudgetDisplay";
import { getPersistedSimulationRun } from "../application/campaignSimulation/getPersistedSimulationRun";
import { listCampaignSimulationHistory } from "../application/campaignSimulation/listCampaignSimulationHistory";
import type { PersistedSimulationRunSummary } from "../application/campaignSimulation/simulationPersistenceModels";
import type { SimulationResultViewModel } from "../application/campaignSimulation/simulationViewModels";
import {
  canPresentResultSchemaVersion,
  classifyResultSchemaVersion,
} from "../application/campaignSimulation/resultSchemaCompatibility";
import { buildSuggestedFileName } from "../application/campaignSimulation/hrExcelExportModels";
import {
  EXPORT_UNKNOWN_DISABLED_HINT,
  EXPORT_V1_DISABLED_HINT,
  EXPORT_V2_DISABLED_HINT,
} from "../application/campaignSimulation/hrExcelExportErrorMessages";
import {
  exportSimulationRunExcel,
  pickExcelSavePath,
} from "../application/campaignSimulation/exportSimulationRunExcel";
import { generateHrExportPassword } from "../application/campaignSimulation/generateHrExportPassword";
import { SimulationExcelExportDialog } from "./simulation/SimulationExcelExportDialog";
import type { SimulationExcelExportSubmitOptions } from "./simulation/SimulationExcelExportDialog";
import { useAppNavigation } from "../app/AppNavigationProvider";
import { useAppData } from "../app/AppDataProvider";
import { useSimulationHistoryRefresh } from "../app/SimulationHistoryRefreshProvider";
import {
  campaignStatusLabel,
  formatDateTime,
} from "../app/formatters";
import { PageHeader } from "../components/ui/PageHeader";
import { SectionCard } from "../components/ui/SectionCard";
import { StatusBadge } from "../components/ui/StatusBadge";
import { nineBoxModeLabel } from "../domain/compensationReference/conversions";
import { SimulationEmployeeDetailDrawer } from "./simulation/components/SimulationEmployeeDetailDrawer";
import { SimulationEmployeeTable } from "./simulation/components/SimulationEmployeeTable";
import { SimulationSummaryPanel } from "./simulation/components/SimulationSummaryPanel";
import { SIMULATION_HISTORY_PAGE_SIZE_OPTIONS } from "./simulation/components/simulationViewUtils";

type HistoryListStatus = "idle" | "loading" | "success" | "empty" | "error";

function fcfaOrDash(value: bigint | null | undefined): string {
  return value === null || value === undefined ? "—" : formatFcfaInteger(value);
}

function monthOrDash(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : String(value);
}

/** Message d’indisponibilité de l’export selon la version de schéma. */
function exportDisabledHint(resultSchemaVersion: number): string {
  switch (classifyResultSchemaVersion(resultSchemaVersion)) {
    case "incomplete":
      return EXPORT_V2_DISABLED_HINT;
    case "incompatible":
      return EXPORT_V1_DISABLED_HINT;
    default:
      return EXPORT_UNKNOWN_DISABLED_HINT;
  }
}

export function SimulationHistoryPage() {
  const { campaigns, services } = useAppData();
  const { getRevision } = useSimulationHistoryRefresh();
  const { navigationState, clearNavigationState } = useAppNavigation();

  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(
    null,
  );
  const [listStatus, setListStatus] = useState<HistoryListStatus>("idle");
  const [listError, setListError] = useState<string | null>(null);
  const [items, setItems] = useState<PersistedSimulationRunSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] =
    useState<(typeof SIMULATION_HISTORY_PAGE_SIZE_OPTIONS)[number]>(20);
  const [pageIndex, setPageIndex] = useState(0);

  const [detailRunId, setDetailRunId] = useState<number | null>(null);
  const [detailView, setDetailView] = useState<SimulationResultViewModel | null>(
    null,
  );
  const [detailStatus, setDetailStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [detailError, setDetailError] = useState<string | null>(null);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
    null,
  );
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const [exportRun, setExportRun] = useState<PersistedSimulationRunSummary | null>(
    null,
  );
  const [exportingRunId, setExportingRunId] = useState<number | null>(null);
  const [exportStatus, setExportStatus] = useState<{
    message: string;
    tone: "success" | "error";
  } | null>(null);
  const exportButtonRefs = useRef(new Map<number, HTMLButtonElement | null>());

  const listRequestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);

  const sortedCampaigns = useMemo(
    () =>
      [...campaigns].sort((left, right) =>
        left.name.localeCompare(right.name, "fr"),
      ),
    [campaigns],
  );

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.id === selectedCampaignId) ?? null,
    [campaigns, selectedCampaignId],
  );

  const historyRevision = selectedCampaignId
    ? getRevision(selectedCampaignId)
    : 0;

  useEffect(() => {
    const nav = navigationState?.simulationHistory;
    if (!nav) return;

    if (nav.campaignId !== undefined) {
      setSelectedCampaignId(nav.campaignId);
    }

    if (nav.runId !== undefined) {
      setDetailRunId(nav.runId);
      if (nav.campaignId === undefined) {
        void getPersistedSimulationRun(
          services.simulationHistory,
          nav.runId,
        ).then((outcome) => {
          if (outcome.ok) {
            setSelectedCampaignId(outcome.detail.summary.campaignId);
          }
        });
      }
    }

    clearNavigationState();
  }, [navigationState, clearNavigationState, services.simulationHistory]);

  const loadList = useCallback(async () => {
    if (selectedCampaignId === null) {
      setListStatus("idle");
      setItems([]);
      setTotal(0);
      return;
    }

    const requestId = ++listRequestIdRef.current;
    setListStatus("loading");
    setListError(null);

    const outcome = await listCampaignSimulationHistory(
      services.simulationHistory,
      selectedCampaignId,
      { limit: pageSize, offset: pageIndex * pageSize },
    );

    if (requestId !== listRequestIdRef.current) return;

    if (!outcome.ok) {
      setListStatus("error");
      setListError(outcome.message);
      setItems([]);
      setTotal(0);
      return;
    }

    setTotal(outcome.page.total);
    setItems(outcome.page.items);
    if (outcome.page.total === 0) {
      setListStatus("empty");
    } else {
      setListStatus("success");
    }
  }, [
    selectedCampaignId,
    pageSize,
    pageIndex,
    services.simulationHistory,
  ]);

  useEffect(() => {
    void loadList();
  }, [loadList, historyRevision]);

  useEffect(() => {
    setPageIndex(0);
    setDetailRunId(null);
    setDetailView(null);
    setDetailStatus("idle");
    setSelectedEmployeeId(null);
    setExportRun(null);
    setExportingRunId(null);
    setExportStatus(null);
  }, [selectedCampaignId]);

  useEffect(() => {
    if (detailRunId === null) {
      setDetailView(null);
      setDetailStatus("idle");
      setDetailError(null);
      return;
    }

    const requestId = ++detailRequestIdRef.current;
    setDetailStatus("loading");
    setDetailError(null);
    setSelectedEmployeeId(null);

    void getPersistedSimulationRun(services.simulationHistory, detailRunId).then(
      (outcome) => {
        if (requestId !== detailRequestIdRef.current) return;
        if (!outcome.ok) {
          setDetailStatus("error");
          setDetailError(outcome.message);
          setDetailView(null);
          return;
        }
        if (
          selectedCampaignId !== null &&
          outcome.detail.summary.campaignId !== selectedCampaignId
        ) {
          setDetailStatus("error");
          setDetailError("Cette simulation n’appartient pas à la campagne sélectionnée.");
          setDetailView(null);
          return;
        }
        setDetailView(outcome.view);
        setDetailStatus("success");
      },
    );
  }, [detailRunId, services.simulationHistory, selectedCampaignId]);

  const openExportDialog = useCallback((run: PersistedSimulationRunSummary) => {
    setExportStatus(null);
    setExportRun(run);
  }, []);

  const closeExportDialog = useCallback(() => {
    if (exportingRunId !== null) return;
    setExportRun(null);
  }, [exportingRunId]);

  const handleGenerateExportPassword = useCallback(async () => {
    const outcome = await generateHrExportPassword();
    if (outcome.ok) {
      return outcome.password;
    }
    setExportStatus({ message: outcome.message, tone: "error" });
    return "";
  }, []);

  const handleExportSubmit = useCallback(
    async (options: SimulationExcelExportSubmitOptions) => {
      const run = exportRun;
      if (!run || exportingRunId !== null) return;

      const suggestedName = buildSuggestedFileName({
        campaignName: run.campaignName,
        runNumber: run.runNumber,
        createdAtIso: run.createdAt,
      });

      let outputPath: string | null = null;
      try {
        outputPath = await pickExcelSavePath(suggestedName);
      } catch {
        outputPath = null;
      }

      if (outputPath === null) {
        setExportRun(null);
        return;
      }

      setExportingRunId(run.id);
      setExportStatus(null);

      const outcome = await exportSimulationRunExcel({
        simulationRunId: run.id,
        outputPath,
        password: options.protect ? options.password : null,
        confirmUnprotectedExport: options.protect
          ? false
          : options.confirmUnprotected,
      });

      setExportingRunId(null);
      setExportRun(null);

      if (outcome.ok) {
        setExportStatus({
          message: `Rapport RH exporté : ${outcome.result.fileName}${
            outcome.result.protected ? " (protégé)" : ""
          }.`,
          tone: "success",
        });
        exportButtonRefs.current.get(run.id)?.focus();
        return;
      }

      if (outcome.cancelled) {
        exportButtonRefs.current.get(run.id)?.focus();
        return;
      }

      setExportStatus({ message: outcome.message, tone: "error" });
      exportButtonRefs.current.get(run.id)?.focus();
    },
    [exportRun, exportingRunId],
  );

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);

  const selectedEmployee = useMemo(() => {
    if (!detailView || !selectedEmployeeId) return null;
    return (
      detailView.employees.find(
        (employee) => employee.employeeId === selectedEmployeeId,
      ) ?? null
    );
  }, [detailView, selectedEmployeeId]);

  if (detailRunId !== null && detailStatus === "success" && detailView) {
    return (
      <>
        <PageHeader
          title="Simulation historique — lecture seule"
          description="Consultation d’un snapshot enregistré, sans recalcul."
        />
        <div className="form-actions">
          <button
            type="button"
            className="button button--secondary"
            data-testid="simulation-history-back"
            onClick={() => {
              setDetailRunId(null);
              setDetailView(null);
              setDetailStatus("idle");
            }}
          >
            Retour à la liste
          </button>
          <StatusBadge tone="neutral" data-testid="simulation-history-readonly-badge">
            Snapshot enregistré — non recalculé
          </StatusBadge>
        </div>
        {detailView.summary.schemaCompatibilityMessage ? (
          <p
            className="form-feedback form-feedback--warning"
            role="status"
            data-testid="simulation-history-detail-compat"
            data-compatibility={detailView.summary.schemaCompatibility}
          >
            {detailView.summary.schemaCompatibilityMessage}
          </p>
        ) : null}
        <SectionCard title="Identification">
          <SimulationSummaryPanel
            summary={detailView.summary}
            testIdPrefix="simulation-history"
          />
        </SectionCard>
        <SectionCard title="Résultats individuels enregistrés">
          <SimulationEmployeeTable
            employees={detailView.employees}
            testIdPrefix="simulation-history"
            onOpenEmployee={setSelectedEmployeeId}
          />
        </SectionCard>
        {selectedEmployee ? (
          <SimulationEmployeeDetailDrawer
            employee={selectedEmployee}
            mode="persisted-readonly"
            roundingMode={detailView.summary.roundingMode}
            roundingStepLabel={detailView.summary.roundingStepLabel}
            closeButtonRef={closeButtonRef}
            testIdPrefix="simulation-history"
            onClose={() => {
              setSelectedEmployeeId(null);
            }}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Historique des simulations"
        description="Consultation en lecture seule des simulations enregistrées par campagne."
      />

      <SectionCard title="Campagne">
        <label className="field" htmlFor="simulation-history-campaign">
          Campagne
          <select
            id="simulation-history-campaign"
            data-testid="simulation-history-campaign"
            value={selectedCampaignId ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              setSelectedCampaignId(value ? Number(value) : null);
            }}
          >
            <option value="">Sélectionner une campagne</option>
            {sortedCampaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name} ({campaign.referenceYear})
                {campaign.status === "archived" ? " — Archivée" : ""}
              </option>
            ))}
          </select>
        </label>
        {selectedCampaign?.status === "archived" ? (
          <StatusBadge tone="warning" data-testid="simulation-history-archived-badge">
            Campagne archivée — consultation uniquement
          </StatusBadge>
        ) : null}
      </SectionCard>

      {selectedCampaignId === null ? (
        <SectionCard title="Historique">
          <p className="muted">Sélectionnez une campagne pour afficher son historique.</p>
        </SectionCard>
      ) : null}

      {selectedCampaignId !== null && listStatus === "loading" ? (
        <SectionCard title="Historique">
          <p role="status" aria-live="polite" data-testid="simulation-history-loading">
            Chargement de l’historique…
          </p>
        </SectionCard>
      ) : null}

      {selectedCampaignId !== null && listStatus === "error" ? (
        <SectionCard title="Historique">
          <p
            className="form-feedback form-feedback--error"
            role="alert"
            data-testid="simulation-history-error"
          >
            {listError ?? "L’historique des simulations n’a pas pu être chargé."}
          </p>
        </SectionCard>
      ) : null}

      {selectedCampaignId !== null && listStatus === "empty" ? (
        <SectionCard title="Historique">
          <p data-testid="simulation-history-empty">
            Aucune simulation enregistrée pour cette campagne.
          </p>
        </SectionCard>
      ) : null}

      {selectedCampaignId !== null && listStatus === "success" ? (
        <SectionCard title="Simulations enregistrées">
          <div className="references-toolbar">
            <label className="field" htmlFor="simulation-history-page-size">
              Lignes par page
              <select
                id="simulation-history-page-size"
                data-testid="simulation-history-page-size"
                value={pageSize}
                onChange={(event) => {
                  setPageSize(
                    Number(event.target.value) as (typeof SIMULATION_HISTORY_PAGE_SIZE_OPTIONS)[number],
                  );
                  setPageIndex(0);
                }}
              >
                {SIMULATION_HISTORY_PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p
            className={
              exportStatus?.tone === "error"
                ? "form-feedback form-feedback--error"
                : exportStatus?.tone === "success"
                  ? "form-feedback form-feedback--success"
                  : "form-feedback"
            }
            role="status"
            aria-live="polite"
            data-testid="simulation-history-export-status"
            data-tone={exportStatus?.tone ?? undefined}
          >
            {exportStatus?.message ?? ""}
          </p>

          <div
            className="data-table-wrap"
            data-testid="simulation-history-table-wrap"
          >
            <table className="data-table" data-testid="simulation-history-table">
              <thead>
                <tr>
                  <th scope="col">N°</th>
                  <th scope="col">Campagne</th>
                  <th scope="col">Année</th>
                  <th scope="col">Enregistrée le</th>
                  <th scope="col">Statut campagne</th>
                  <th scope="col">Mode éval.</th>
                  <th scope="col">Lot RH</th>
                  <th scope="col">Salariés</th>
                  <th scope="col">Budget cible</th>
                  <th scope="col">Coût réel</th>
                  <th scope="col">Écart arrondi</th>
                  <th scope="col">Schéma</th>
                  <th scope="col">Mois tech.</th>
                  <th scope="col">Mois couverts</th>
                  <th scope="col">Promo (période)</th>
                  <th scope="col">Minimum (période)</th>
                  <th scope="col">Au-dessus min. (période)</th>
                  <th scope="col">Combiné (période)</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((run) => (
                  <tr key={run.id} data-testid={`simulation-history-row-${run.runNumber}`}>
                    <td>{run.runNumber}</td>
                    <td>{run.campaignName}</td>
                    <td>{run.campaignYear}</td>
                    <td>{formatDateTime(run.createdAt)}</td>
                    <td>{campaignStatusLabel(run.campaignStatusAtRun)}</td>
                    <td>{nineBoxModeLabel(run.evaluationMode)}</td>
                    <td>
                      {run.sourceImportFileName ??
                        (run.sourceImportBatchId !== null
                          ? `#${run.sourceImportBatchId}`
                          : "—")}
                    </td>
                    <td>{run.employeeCount}</td>
                    <td data-testid={`simulation-history-budget-${run.runNumber}`}>
                      {formatExactAmountAsFcfa(run.exactBudgetTarget)}
                    </td>
                    <td data-testid={`simulation-history-actual-${run.runNumber}`}>
                      {formatFcfaInteger(run.actualOperationAmountFcfa)}
                    </td>
                    <td data-testid={`simulation-history-delta-${run.runNumber}`}>
                      {formatExactAmountAsFcfa(run.totalRoundingDelta)}
                    </td>
                    <td data-testid={`simulation-history-schema-${run.runNumber}`}>
                      v{run.resultSchemaVersion}
                    </td>
                    <td>{monthOrDash(run.technicalApplicationMonth)}</td>
                    <td>{monthOrDash(run.campaignCoveredMonthCount)}</td>
                    <td data-testid={`simulation-history-promo-${run.runNumber}`}>
                      {fcfaOrDash(run.promotionCampaignPeriodBudgetCostFcfa)}
                    </td>
                    <td data-testid={`simulation-history-minimum-${run.runNumber}`}>
                      {fcfaOrDash(run.totalMinimumComplementFloorCostFcfa)}
                    </td>
                    <td
                      data-testid={`simulation-history-above-minimum-${run.runNumber}`}
                    >
                      {fcfaOrDash(run.actualCompensationAboveMinimumCostFcfa)}
                    </td>
                    <td
                      data-testid={`simulation-history-combined-${run.runNumber}`}
                    >
                      {fcfaOrDash(run.actualCombinedCampaignPeriodCostFcfa)}
                    </td>
                    <td>
                      <div className="history-row-actions">
                        <button
                          type="button"
                          className="link-button"
                          data-testid={`simulation-history-open-${run.runNumber}`}
                          onClick={() => {
                            setDetailRunId(run.id);
                          }}
                        >
                          Consulter
                        </button>
                        {(() => {
                          const canExport = canPresentResultSchemaVersion(
                            run.resultSchemaVersion,
                          );
                          const isExporting = exportingRunId === run.id;
                          const hint = canExport
                            ? undefined
                            : exportDisabledHint(run.resultSchemaVersion);
                          const hintId = `simulation-history-export-hint-${run.runNumber}`;
                          return (
                            <>
                              <button
                                ref={(node) => {
                                  exportButtonRefs.current.set(run.id, node);
                                }}
                                type="button"
                                className="link-button"
                                data-testid={`simulation-history-export-${run.runNumber}`}
                                disabled={!canExport || exportingRunId !== null}
                                aria-busy={isExporting}
                                aria-describedby={hint ? hintId : undefined}
                                title={hint}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (!canExport || exportingRunId !== null) {
                                    return;
                                  }
                                  openExportDialog(run);
                                }}
                              >
                                {isExporting ? (
                                  <span
                                    data-testid={`simulation-history-exporting-${run.runNumber}`}
                                  >
                                    Export en cours…
                                  </span>
                                ) : (
                                  "Exporter Excel"
                                )}
                              </button>
                              {hint ? (
                                <span id={hintId} className="sr-only">
                                  {hint}
                                </span>
                              ) : null}
                            </>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="form-actions" data-testid="simulation-history-pagination">
            <button
              type="button"
              disabled={safePageIndex <= 0}
              data-testid="simulation-history-prev"
              onClick={() => {
                setPageIndex((current) => Math.max(0, current - 1));
              }}
            >
              Précédent
            </button>
            <span data-testid="simulation-history-total">
              Page {safePageIndex + 1} / {pageCount} — {total} simulation
              {total > 1 ? "s" : ""}
            </span>
            <button
              type="button"
              disabled={safePageIndex >= pageCount - 1}
              data-testid="simulation-history-next"
              onClick={() => {
                setPageIndex((current) => Math.min(pageCount - 1, current + 1));
              }}
            >
              Suivant
            </button>
          </div>
        </SectionCard>
      ) : null}

      {detailRunId !== null && detailStatus === "loading" ? (
        <SectionCard title="Détail">
          <p role="status" aria-live="polite" data-testid="simulation-history-detail-loading">
            Chargement du snapshot…
          </p>
        </SectionCard>
      ) : null}

      {detailRunId !== null && detailStatus === "error" ? (
        <SectionCard title="Détail">
          <p
            className="form-feedback form-feedback--error"
            role="alert"
            data-testid="simulation-history-detail-error"
          >
            {detailError ??
              "Cette simulation enregistrée contient une donnée illisible."}
          </p>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => {
              setDetailRunId(null);
              setDetailStatus("idle");
            }}
          >
            Retour à la liste
          </button>
        </SectionCard>
      ) : null}

      {exportRun ? (
        <SimulationExcelExportDialog
          open={exportRun !== null}
          run={exportRun}
          exporting={exportingRunId === exportRun.id}
          onClose={closeExportDialog}
          onExport={handleExportSubmit}
          onGeneratePassword={handleGenerateExportPassword}
        />
      ) : null}
    </>
  );
}
