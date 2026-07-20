import { useEffect, useMemo, useState } from "react";
import {
  campaignStatusLabel,
  campaignStatusTone,
  formatDateTime,
} from "../app/formatters";
import { useAppData } from "../app/AppDataProvider";
import { useCompensationReference } from "../app/CompensationReferenceProvider";
import { useHrImport } from "../app/HrImportProvider";
import { useSimulationConfiguration } from "../app/SimulationConfigurationProvider";
import { useSimulationExecution } from "../app/SimulationExecutionProvider";
import { ROUNDING_STEP_SUGGESTIONS } from "../application/campaignSimulation/simulationConfigurationModels";
import type { CampaignSimulationReadinessIssue } from "../application/campaignSimulation/campaignSimulationModels";
import type { ReadinessScope } from "../application/campaignSimulation/campaignSimulationCodes";
import { nineBoxModeLabel } from "../domain/compensationReference/conversions";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { SectionCard } from "../components/ui/SectionCard";
import { StatusBadge } from "../components/ui/StatusBadge";
import { pageDefinitions } from "./pageDefinitions";
import { SimulationResultsPanel } from "./simulation/SimulationResultsPanel";

const SCOPE_ORDER: ReadinessScope[] = [
  "campaign",
  "import",
  "employee",
  "references",
  "evaluation",
  "budget",
  "rounding",
];

const SCOPE_LABELS: Record<ReadinessScope, string> = {
  campaign: "Campagne",
  import: "Import",
  employee: "Salariés",
  references: "Référentiels",
  evaluation: "Évaluation",
  budget: "Budget",
  rounding: "Arrondi",
};

function sectionTone(
  ready: boolean,
  blockingCount: number,
): "success" | "warning" | "neutral" {
  if (ready) return "success";
  if (blockingCount > 0) return "warning";
  return "neutral";
}

function sectionLabel(ready: boolean, blockingCount: number): string {
  if (ready) return "Prêt";
  if (blockingCount > 0) return "Bloqué";
  return "Incomplet";
}

function groupIssues(
  issues: readonly CampaignSimulationReadinessIssue[],
): Map<ReadinessScope, CampaignSimulationReadinessIssue[]> {
  const map = new Map<ReadinessScope, CampaignSimulationReadinessIssue[]>();
  for (const scope of SCOPE_ORDER) {
    map.set(scope, []);
  }
  for (const issue of issues) {
    const scope = (SCOPE_ORDER.includes(issue.scope as ReadinessScope)
      ? issue.scope
      : "campaign") as ReadinessScope;
    const list = map.get(scope) ?? [];
    list.push(issue);
    map.set(scope, list);
  }
  return map;
}

export function SimulationPage() {
  const { campaigns } = useAppData();
  const {
    selectedCampaignId: referenceCampaignId,
    selectCampaign: selectReferenceCampaign,
  } = useCompensationReference();
  const {
    selectedCampaignId: importCampaignId,
    selectCampaign: selectImportCampaign,
    currentBatch,
  } = useHrImport();
  const {
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
    resolvedBudgetDetails,
    canValidate,
    selectCampaign,
    setBudgetTargetMode,
    setManualBudgetInput,
    setEligiblePayrollInput,
    setBudgetRatePercentInput,
    setRoundingStepInput,
    applyRoundingStepSuggestion,
    validateConfiguration,
    refreshReadiness,
  } = useSimulationConfiguration();
  const { execution, canLaunch, launchSimulation } = useSimulationExecution();

  const [busy, setBusy] = useState(false);
  const [launchBusy, setLaunchBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (
      selectedCampaignId !== null &&
      selectedCampaignId !== referenceCampaignId
    ) {
      selectReferenceCampaign(selectedCampaignId);
    }
  }, [referenceCampaignId, selectReferenceCampaign, selectedCampaignId]);

  useEffect(() => {
    if (
      selectedCampaignId !== null &&
      selectedCampaignId !== importCampaignId
    ) {
      selectImportCampaign(selectedCampaignId);
    }
  }, [importCampaignId, selectImportCampaign, selectedCampaignId]);

  // Recharge toujours le readiness à l’entrée sur la page (évite un cache obsolète
  // après modification des référentiels hors de cette vue).
  useEffect(() => {
    void refreshReadiness();
  }, [refreshReadiness]);

  const definition = pageDefinitions.simulations;

  const blockingByScope = useMemo(
    () => groupIssues(readinessReport?.issues ?? []),
    [readinessReport],
  );
  const warningsByScope = useMemo(
    () => groupIssues(readinessReport?.warnings ?? []),
    [readinessReport],
  );

  const handleValidate = async () => {
    setBusy(true);
    setFormError(null);
    try {
      const ok = await validateConfiguration();
      if (!ok) {
        setFormError(
          "La configuration n’est pas prête. Corrigez les blocages avant de valider.",
        );
      }
    } catch {
      setFormError("Impossible de valider la configuration pour le moment.");
    } finally {
      setBusy(false);
    }
  };

  const handleLaunch = async () => {
    setLaunchBusy(true);
    setFormError(null);
    try {
      await launchSimulation();
    } catch {
      setFormError("Impossible de lancer la simulation pour le moment.");
    } finally {
      setLaunchBusy(false);
    }
  };

  if (campaigns.length === 0) {
    return (
      <>
        <PageHeader title={definition.title} description={definition.description} />
        <SectionCard title="Campagne">
          <EmptyState
            title="Aucune campagne"
            description="Créez une campagne pour préparer une simulation de rémunération."
            plannedFeatures={[]}
          />
        </SectionCard>
      </>
    );
  }

  if (selectedCampaignId === null || !selectedCampaign || !draft) {
    return (
      <>
        <PageHeader title={definition.title} description={definition.description} />
        <SectionCard title="Campagne">
          <EmptyState
            title="Aucune campagne sélectionnée"
            description="Sélectionnez une campagne pour consulter sa préparation et configurer le budget."
            plannedFeatures={[]}
          />
          <label className="field field--full" htmlFor="simulation-campaign-select">
            Campagne
            <select
              id="simulation-campaign-select"
              data-testid="simulation-campaign-select"
              value=""
              onChange={(event) => {
                const value = event.target.value;
                selectCampaign(value ? Number(value) : null);
              }}
            >
              <option value="">Sélectionner…</option>
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name} ({campaign.referenceYear}) —{" "}
                  {campaignStatusLabel(campaign.status)}
                </option>
              ))}
            </select>
          </label>
        </SectionCard>
      </>
    );
  }

  const population = readinessReport?.populationReadiness;
  const references = readinessReport?.referenceReadiness;
  const configuration = readinessReport?.configurationReadiness;

  return (
    <>
      <PageHeader title={definition.title} description={definition.description} />

      <SectionCard title="Campagne">
        <div className="references-toolbar">
          <label
            className="field references-toolbar__select"
            htmlFor="simulation-campaign-select"
          >
            Campagne
            <select
              id="simulation-campaign-select"
              data-testid="simulation-campaign-select"
              value={selectedCampaignId}
              onChange={(event) => {
                setFormError(null);
                selectCampaign(Number(event.target.value));
              }}
            >
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name} ({campaign.referenceYear}) —{" "}
                  {campaignStatusLabel(campaign.status)}
                </option>
              ))}
            </select>
          </label>
          <StatusBadge
            tone={campaignStatusTone(selectedCampaign.status)}
            data-testid="simulation-campaign-status"
          >
            {campaignStatusLabel(selectedCampaign.status)}
          </StatusBadge>
        </div>

        <dl className="detail-list" data-testid="simulation-campaign-summary">
          <div>
            <dt>Nom</dt>
            <dd>{selectedCampaign.name}</dd>
          </div>
          <div>
            <dt>Année</dt>
            <dd>{selectedCampaign.referenceYear}</dd>
          </div>
          <div>
            <dt>Mode d’évaluation</dt>
            <dd>
              {readinessReport?.evaluationMode
                ? nineBoxModeLabel(readinessReport.evaluationMode)
                : "—"}
            </dd>
          </div>
          <div>
            <dt>Salariés (population courante)</dt>
            <dd data-testid="simulation-employee-count">
              {readinessReport?.importedEmployeeCount ?? "—"}
            </dd>
          </div>
          <div>
            <dt>Import courant</dt>
            <dd data-testid="simulation-current-import">
              {currentBatch
                ? `${currentBatch.sourceFileName} — ${formatDateTime(currentBatch.importedAt)}`
                : readinessReport?.currentImportBatchId
                  ? `Lot #${readinessReport.currentImportBatchId}`
                  : "Aucun"}
            </dd>
          </div>
        </dl>

        {isReadOnly ? (
          <p className="form-feedback" role="status" data-testid="simulation-readonly">
            Campagne archivée : consultation du readiness autorisée, validation
            d’une nouvelle configuration interdite.
          </p>
        ) : null}
      </SectionCard>

      <SectionCard title="État de préparation">
        {readinessStatus === "loading" ? (
          <p role="status">Chargement de la préparation…</p>
        ) : null}
        {readinessStatus === "error" ? (
          <p className="form-feedback form-feedback--error" role="alert">
            {readinessErrorMessage ?? "Erreur de lecture de la préparation."}
          </p>
        ) : null}

        {readinessReport ? (
          <div className="form-grid" data-testid="simulation-readiness-sections">
            <div>
              <h3>Population</h3>
              <StatusBadge
                tone={sectionTone(
                  population?.isReady ?? false,
                  population?.blockingIssueCount ?? 0,
                )}
                data-testid="simulation-population-badge"
              >
                {sectionLabel(
                  population?.isReady ?? false,
                  population?.blockingIssueCount ?? 0,
                )}
              </StatusBadge>
              <ul>
                <li>
                  Lot courant :{" "}
                  {readinessReport.currentImportBatchId
                    ? `présent (#${readinessReport.currentImportBatchId})`
                    : "absent"}
                </li>
                <li>Salariés : {readinessReport.importedEmployeeCount}</li>
                <li>Convertibles : {readinessReport.validEmployeeCount}</li>
                <li>Bloqués : {readinessReport.blockedEmployeeCount}</li>
              </ul>
            </div>
            <div>
              <h3>Référentiels</h3>
              <StatusBadge
                tone={sectionTone(
                  references?.isReady ?? false,
                  references?.blockingIssueCount ?? 0,
                )}
                data-testid="simulation-references-badge"
              >
                {sectionLabel(
                  references?.isReady ?? false,
                  references?.blockingIssueCount ?? 0,
                )}
              </StatusBadge>
              <ul>
                <li>
                  Mode :{" "}
                  {readinessReport.evaluationMode
                    ? nineBoxModeLabel(readinessReport.evaluationMode)
                    : "—"}
                </li>
                <li>
                  Grille S0 / positions / facteurs :{" "}
                  {references?.isReady
                    ? "complets pour le calcul"
                    : "voir les issues détaillées ci-dessous"}
                </li>
                {!references?.isReady
                  ? (
                      readinessReport.issues.filter(
                        (issue) =>
                          issue.scope === "references" ||
                          issue.scope === "evaluation",
                      ) as typeof readinessReport.issues
                    )
                      .slice(0, 5)
                      .map((issue) => (
                        <li key={`${issue.code}-${issue.field}-${issue.message}`}>
                          <strong>{issue.code}</strong> — {issue.message}
                        </li>
                      ))
                  : null}
              </ul>
            </div>
            <div>
              <h3>Configuration</h3>
              <StatusBadge
                tone={sectionTone(
                  configuration?.isComplete ?? false,
                  configuration && !configuration.isComplete ? 1 : 0,
                )}
                data-testid="simulation-configuration-badge"
              >
                {configuration?.isComplete
                  ? "Prêt"
                  : configuration?.missingFields.length
                    ? "Incomplet"
                    : "Bloqué"}
              </StatusBadge>
              <ul>
                <li>
                  Mode budget :{" "}
                  {draft.budgetTargetMode === "manual_amount"
                    ? "Montant saisi"
                    : draft.budgetTargetMode ===
                        "percentage_of_eligible_payroll"
                      ? "Pourcentage de la masse éligible"
                      : "non choisi"}
                </li>
                <li>
                  Champs manquants :{" "}
                  {configuration?.missingFields.length
                    ? configuration.missingFields.join(", ")
                    : "aucun"}
                </li>
                <li>
                  Arrondi :{" "}
                  {parsed?.roundingPolicy
                    ? `nearest_half_up / pas ${parsed.roundingPolicy.stepFcfa.toString()} FCFA`
                    : "non configuré"}
                </li>
              </ul>
            </div>
          </div>
        ) : null}

        {readinessReport &&
        (readinessReport.issues.length > 0 ||
          readinessReport.warnings.length > 0) ? (
          <div data-testid="simulation-issues">
            <h3>Blocages</h3>
            {SCOPE_ORDER.map((scope) => {
              const items = blockingByScope.get(scope) ?? [];
              if (items.length === 0) return null;
              return (
                <div key={`blocking-${scope}`}>
                  <h4>{SCOPE_LABELS[scope]}</h4>
                  <ul>
                    {items.map((issue, index) => (
                      <li key={`${issue.code}-${issue.employeeId ?? ""}-${index}`}>
                        {issue.employeeId ? (
                          <strong>{issue.employeeId} — </strong>
                        ) : null}
                        {issue.field ? (
                          <span>
                            [{issue.field}]{" "}
                          </span>
                        ) : null}
                        {issue.message}
                        <details>
                          <summary>Code technique</summary>
                          <code>{issue.code}</code>
                        </details>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}

            <h3>Avertissements</h3>
            {SCOPE_ORDER.every(
              (scope) => (warningsByScope.get(scope) ?? []).length === 0,
            ) ? (
              <p>Aucun avertissement.</p>
            ) : (
              SCOPE_ORDER.map((scope) => {
                const items = warningsByScope.get(scope) ?? [];
                if (items.length === 0) return null;
                return (
                  <div key={`warning-${scope}`}>
                    <h4>{SCOPE_LABELS[scope]}</h4>
                    <ul>
                      {items.map((issue, index) => (
                        <li
                          key={`w-${issue.code}-${issue.employeeId ?? ""}-${index}`}
                        >
                          {issue.message}
                          <details>
                            <summary>Code technique</summary>
                            <code>{issue.code}</code>
                          </details>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            )}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Budget cible">
        <fieldset disabled={isReadOnly} className="form-grid">
          <legend className="visually-hidden">Mode de budget</legend>
          <label className="field">
            <input
              type="radio"
              name="budget-mode"
              data-testid="simulation-budget-mode-manual"
              checked={draft.budgetTargetMode === "manual_amount"}
              onChange={() => {
                setBudgetTargetMode("manual_amount");
              }}
            />{" "}
            Montant saisi
          </label>
          <label className="field">
            <input
              type="radio"
              name="budget-mode"
              data-testid="simulation-budget-mode-percent"
              checked={
                draft.budgetTargetMode === "percentage_of_eligible_payroll"
              }
              onChange={() => {
                setBudgetTargetMode("percentage_of_eligible_payroll");
              }}
            />{" "}
            Pourcentage de la masse salariale éligible
          </label>
        </fieldset>

        {draft.budgetTargetMode === null ? (
          <p className="form-feedback" role="status">
            Aucun mode de budget sélectionné.
          </p>
        ) : null}

        {draft.budgetTargetMode === "manual_amount" ? (
          <label className="field field--full" htmlFor="simulation-manual-budget">
            Budget cible — FCFA
            <input
              id="simulation-manual-budget"
              data-testid="simulation-manual-budget"
              inputMode="numeric"
              autoComplete="off"
              disabled={isReadOnly}
              value={draft.manualBudgetInput}
              aria-invalid={Boolean(parsed?.fieldErrors.manualBudgetInput)}
              aria-describedby={
                parsed?.fieldErrors.manualBudgetInput
                  ? "simulation-manual-budget-error"
                  : undefined
              }
              onChange={(event) => {
                setManualBudgetInput(event.target.value);
              }}
            />
          </label>
        ) : null}
        {parsed?.fieldErrors.manualBudgetInput ? (
          <p
            id="simulation-manual-budget-error"
            className="form-feedback form-feedback--error"
            role="alert"
          >
            {parsed.fieldErrors.manualBudgetInput.message}
          </p>
        ) : null}

        {draft.budgetTargetMode === "percentage_of_eligible_payroll" ? (
          <div className="form-grid">
            <label
              className="field field--full"
              htmlFor="simulation-eligible-payroll"
            >
              Masse salariale éligible — FCFA
              <input
                id="simulation-eligible-payroll"
                data-testid="simulation-eligible-payroll"
                inputMode="numeric"
                autoComplete="off"
                disabled={isReadOnly}
                value={draft.eligiblePayrollInput}
                aria-invalid={Boolean(parsed?.fieldErrors.eligiblePayrollInput)}
                onChange={(event) => {
                  setEligiblePayrollInput(event.target.value);
                }}
              />
            </label>
            <label
              className="field field--full"
              htmlFor="simulation-budget-rate"
            >
              Taux du budget — %
              <input
                id="simulation-budget-rate"
                data-testid="simulation-budget-rate"
                inputMode="decimal"
                autoComplete="off"
                disabled={isReadOnly}
                value={draft.budgetRatePercentInput}
                aria-invalid={Boolean(
                  parsed?.fieldErrors.budgetRatePercentInput,
                )}
                onChange={(event) => {
                  setBudgetRatePercentInput(event.target.value);
                }}
              />
            </label>
          </div>
        ) : null}
        {parsed?.fieldErrors.eligiblePayrollInput ? (
          <p className="form-feedback form-feedback--error" role="alert">
            {parsed.fieldErrors.eligiblePayrollInput.message}
          </p>
        ) : null}
        {parsed?.fieldErrors.budgetRatePercentInput ? (
          <p className="form-feedback form-feedback--error" role="alert">
            {parsed.fieldErrors.budgetRatePercentInput.message}
          </p>
        ) : null}

        {resolvedBudgetDetails ? (
          <div data-testid="simulation-budget-preview" role="status">
            {resolvedBudgetDetails.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Arrondi individuel">
        <p data-testid="simulation-rounding-mode">
          Mode : Au multiple le plus proche — half-up (
          <code>nearest_half_up</code>)
        </p>
        <label className="field field--full" htmlFor="simulation-rounding-step">
          Pas d’arrondi — FCFA
          <input
            id="simulation-rounding-step"
            data-testid="simulation-rounding-step"
            inputMode="numeric"
            autoComplete="off"
            disabled={isReadOnly}
            value={draft.roundingStepInput}
            aria-invalid={Boolean(parsed?.fieldErrors.roundingStepInput)}
            onChange={(event) => {
              setRoundingStepInput(event.target.value);
            }}
          />
        </label>
        {parsed?.fieldErrors.roundingStepInput ? (
          <p className="form-feedback form-feedback--error" role="alert">
            {parsed.fieldErrors.roundingStepInput.message}
          </p>
        ) : null}
        <div className="filter-group" role="group" aria-label="Suggestions de pas">
          {ROUNDING_STEP_SUGGESTIONS.map((step) => (
            <button
              key={step}
              type="button"
              className={`filter-chip${
                draft.roundingStepInput === step ? " filter-chip--active" : ""
              }`}
              data-testid={`simulation-rounding-suggest-${step}`}
              disabled={isReadOnly}
              onClick={() => {
                applyRoundingStepSuggestion(step);
              }}
            >
              {Number(step).toLocaleString("fr-FR")}
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Validation de la configuration">
        {validationStatus === "stale" ? (
          <p
            className="form-feedback form-feedback--error"
            role="status"
            data-testid="simulation-validation-stale"
          >
            Configuration modifiée — nouvelle validation requise.
          </p>
        ) : null}
        {validationStatus === "validated" && validatedConfiguration ? (
          <p
            className="form-feedback form-feedback--success"
            role="status"
            aria-live="polite"
            data-testid="simulation-validation-success"
          >
            Configuration validée pour le calcul.
            {execution.status === "idle" ||
            (execution.status !== "success" &&
              execution.status !== "running" &&
              !execution.result)
              ? " Aucun calcul n’a encore été lancé."
              : ""}{" "}
            (séquence validation #
            {validatedConfiguration.validatedAtSessionSequence})
          </p>
        ) : null}
        {formError ? (
          <p className="form-feedback form-feedback--error" role="alert">
            {formError}
          </p>
        ) : null}

        <div className="form-actions">
          <button
            type="button"
            className="button button--primary"
            data-testid="simulation-validate"
            disabled={!canValidate || busy || isReadOnly}
            onClick={() => {
              void handleValidate();
            }}
          >
            Valider la configuration
          </button>
          {validationStatus === "validated" && !isReadOnly ? (
            <button
              type="button"
              className="button button--primary"
              data-testid="simulation-launch"
              disabled={!canLaunch || launchBusy || execution.status === "running"}
              onClick={() => {
                void handleLaunch();
              }}
            >
              Lancer la simulation
            </button>
          ) : null}
        </div>

        <p
          className="muted"
          role="status"
          aria-live="polite"
          data-testid="simulation-execution-status"
        >
          {execution.status === "running" || launchBusy
            ? "Calcul en cours…"
            : execution.status === "success" && execution.result
              ? `Simulation réussie (séquence #${execution.result.runSequence}).`
              : validationStatus === "validated"
                ? "Prêt à lancer la simulation."
                : "Validez la configuration pour activer le lancement."}
        </p>
      </SectionCard>

      <SimulationResultsPanel
        execution={execution}
        isArchived={isReadOnly}
      />
    </>
  );
}
