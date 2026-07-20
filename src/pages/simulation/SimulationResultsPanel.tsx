/**
 * Synthèse, tableau et détail des résultats de simulation (Lot 2B-3).
 */

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type {
  CampaignSimulationExecutionIssue,
  CampaignSimulationExecutionResult,
  EmployeeSimulationResultView,
} from "../../application/campaignSimulation/campaignSimulationExecutionModels";
import {
  formatFcfaInteger,
  formatFactorMilli,
} from "../../application/campaignSimulation/formatExactBudgetDisplay";
import { technicalApplicationMonthLabelFr } from "../../domain/compensationCalculation";
import { nineBoxModeLabel } from "../../domain/compensationReference/conversions";
import { SectionCard } from "../../components/ui/SectionCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import type { CampaignSimulationExecutionState } from "../../app/SimulationExecutionProvider";

const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

const EXEC_SCOPE_ORDER = [
  "campaign",
  "population",
  "employee",
  "references",
  "budget",
  "rounding",
  "engine",
] as const;

const EXEC_SCOPE_LABELS: Record<(typeof EXEC_SCOPE_ORDER)[number], string> = {
  campaign: "Campagne",
  population: "Population",
  employee: "Salarié",
  references: "Référentiels",
  budget: "Budget",
  rounding: "Arrondi",
  engine: "Moteur",
};

function levelOrNotRequired(
  level: string | null,
  required: boolean,
): string {
  if (!required) return "Non requis";
  return level ?? "—";
}

function compareEmployeeId(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

interface SimulationResultsPanelProps {
  execution: CampaignSimulationExecutionState;
  isArchived: boolean;
}

export function SimulationResultsPanel({
  execution,
  isArchived,
}: SimulationResultsPanelProps) {
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] =
    useState<(typeof PAGE_SIZE_OPTIONS)[number]>(25);
  const [pageIndex, setPageIndex] = useState(0);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
    null,
  );
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const result = execution.result;
  const showStaleBanner = execution.isStale || execution.status === "stale";

  useEffect(() => {
    setSearch("");
    setPageIndex(0);
    setSelectedEmployeeId(null);
  }, [result?.runSequence, result?.campaignId]);

  const filteredEmployees = useMemo(() => {
    if (!result) return [];
    const needle = search.trim().toLowerCase();
    const sorted = [...result.employees].sort((left, right) =>
      compareEmployeeId(left.employeeId, right.employeeId),
    );
    if (!needle) return sorted;
    return sorted.filter((employee) => {
      const idMatch = employee.employeeId.toLowerCase().includes(needle);
      const nameMatch = employee.employeeDisplayName
        ?.toLowerCase()
        .includes(needle);
      return idMatch || Boolean(nameMatch);
    });
  }, [result, search]);

  const pageCount = Math.max(1, Math.ceil(filteredEmployees.length / pageSize));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const pageItems = filteredEmployees.slice(
    safePageIndex * pageSize,
    safePageIndex * pageSize + pageSize,
  );

  const selectedEmployee = useMemo(() => {
    if (!result || !selectedEmployeeId) return null;
    return (
      result.employees.find(
        (employee) => employee.employeeId === selectedEmployeeId,
      ) ?? null
    );
  }, [result, selectedEmployeeId]);

  useEffect(() => {
    if (!selectedEmployee) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeButtonRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedEmployeeId(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [selectedEmployee]);

  if (execution.status === "error" && execution.issues.length > 0) {
    return (
      <SectionCard title="La simulation n’a pas pu être calculée">
        <p className="form-feedback form-feedback--error" role="alert" data-testid="simulation-execution-error">
          {execution.errorMessage ?? "La simulation n’a pas pu être calculée."}
        </p>
        <ExecutionIssuesList issues={execution.issues} />
      </SectionCard>
    );
  }

  if (showStaleBanner && !result) {
    return (
      <SectionCard title="Résultat de simulation">
        <p
          className="form-feedback form-feedback--error"
          role="status"
          data-testid="simulation-result-stale"
        >
          Résultat obsolète — les données ou la configuration ont changé.
        </p>
        {execution.staleResult ? (
          <p className="muted" data-testid="simulation-stale-diagnostic">
            Un résultat précédent (séquence #
            {execution.staleResult.runSequence}) est conservé en mémoire pour
            diagnostic uniquement — il n’est pas le résultat courant.
          </p>
        ) : null}
      </SectionCard>
    );
  }

  if (!result) {
    return null;
  }

  return (
    <>
      {showStaleBanner ? (
        <p
          className="form-feedback form-feedback--error"
          role="status"
          data-testid="simulation-result-stale"
        >
          Résultat obsolète — les données ou la configuration ont changé.
        </p>
      ) : null}

      <SectionCard title="Synthèse de la simulation">
        {isArchived ? (
          <StatusBadge tone="neutral" data-testid="simulation-result-readonly">
            Lecture seule
          </StatusBadge>
        ) : null}
        <SimulationSummary result={result} />
      </SectionCard>

      <SectionCard title="Résultats individuels">
        <div className="references-toolbar">
          <label className="field" htmlFor="simulation-results-search">
            Recherche (matricule ou nom)
            <input
              id="simulation-results-search"
              data-testid="simulation-results-search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPageIndex(0);
              }}
            />
          </label>
          <label className="field" htmlFor="simulation-results-page-size">
            Lignes par page
            <select
              id="simulation-results-page-size"
              data-testid="simulation-results-page-size"
              value={pageSize}
              onChange={(event) => {
                setPageSize(
                  Number(event.target.value) as (typeof PAGE_SIZE_OPTIONS)[number],
                );
                setPageIndex(0);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="data-table-wrap" data-testid="simulation-results-table-wrap">
          <table className="data-table" data-testid="simulation-results-table">
            <thead>
              <tr>
                <th scope="col">Matricule</th>
                <th scope="col">Salarié</th>
                <th scope="col">Famille / Grade</th>
                <th scope="col">Salaire mensuel</th>
                <th scope="col">S0 mensuel</th>
                <th scope="col">Position</th>
                <th scope="col">Performance</th>
                <th scope="col">Potentiel</th>
                <th scope="col">Taux d’augmentation</th>
                <th scope="col">Allocation théorique annuelle</th>
                <th scope="col">Augmentation mensuelle théorique</th>
                <th scope="col">Augmentation mensuelle finale</th>
                <th scope="col">Mois de rappel</th>
                <th scope="col">Rappel salaire de base</th>
                <th scope="col">Mois restants</th>
                <th scope="col">Coût direct reste d’année</th>
                <th scope="col">Taux ancienneté (mois appl.)</th>
                <th scope="col">Rappel ancienneté</th>
                <th scope="col">Incidence annuelle ancienneté</th>
                <th scope="col">Nouveau salaire mensuel</th>
                <th scope="col">Coût annuel réel</th>
                <th scope="col">Statut</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((employee) => (
                <tr key={employee.employeeId}>
                  <td>
                    <button
                      type="button"
                      className="link-button"
                      data-testid={`simulation-employee-open-${employee.employeeId}`}
                      onClick={() => {
                        setSelectedEmployeeId(employee.employeeId);
                      }}
                    >
                      {employee.employeeId}
                    </button>
                  </td>
                  <td>{employee.employeeDisplayName ?? "—"}</td>
                  <td>
                    {employee.familyCode} / {employee.gradeCode}
                  </td>
                  <td>{formatFcfaInteger(employee.salaryFcfa)}</td>
                  <td>{formatFcfaInteger(employee.s0Fcfa)}</td>
                  <td>{employee.salaryPositionLabel}</td>
                  <td>
                    {levelOrNotRequired(
                      employee.performanceLevel,
                      employee.evaluationMode !== "none",
                    )}
                  </td>
                  <td>
                    {levelOrNotRequired(
                      employee.potentialLevel,
                      employee.evaluationMode === "performance_potential" ||
                        employee.evaluationMode === "full_nine_box",
                    )}
                  </td>
                  <td>{employee.monthlyTheoreticalIncreaseRateLabel}</td>
                  <td>{employee.annualTheoreticalAllocationLabel}</td>
                  <td>{employee.monthlyTheoreticalIncreaseLabel}</td>
                  <td>
                    {formatFcfaInteger(employee.monthlyFinalRoundedIncreaseFcfa)}
                  </td>
                  <td data-testid={`simulation-retro-months-${employee.employeeId}`}>
                    {employee.retroactiveMonths}
                  </td>
                  <td data-testid={`simulation-base-reminder-${employee.employeeId}`}>
                    {formatFcfaInteger(employee.baseSalaryReminderFcfa)}
                  </td>
                  <td data-testid={`simulation-remaining-months-${employee.employeeId}`}>
                    {employee.remainingDirectPaymentMonths}
                  </td>
                  <td data-testid={`simulation-remaining-direct-${employee.employeeId}`}>
                    {formatFcfaInteger(
                      employee.remainingYearDirectIncreaseCostFcfa,
                    )}
                  </td>
                  <td
                    data-testid={`simulation-seniority-rate-${employee.employeeId}`}
                  >
                    {employee.technicalApplicationMonthSeniorityRatePercent} %
                  </td>
                  <td
                    data-testid={`simulation-seniority-reminder-${employee.employeeId}`}
                  >
                    {formatFcfaInteger(employee.seniorityReminderFcfa)}
                  </td>
                  <td
                    data-testid={`simulation-seniority-annual-${employee.employeeId}`}
                  >
                    {formatFcfaInteger(employee.annualSeniorityImpactFcfa)}
                  </td>
                  <td data-testid={`simulation-final-salary-${employee.employeeId}`}>
                    {formatFcfaInteger(employee.monthlyFinalSalaryFcfa)}
                  </td>
                  <td data-testid={`simulation-annual-cost-${employee.employeeId}`}>
                    {formatFcfaInteger(employee.annualActualBaseIncreaseCostFcfa)}
                  </td>
                  <td>
                    {employee.blockingReason === "CONFIRMED_UNDERPERFORMER" ? (
                      <StatusBadge
                        tone="warning"
                        data-testid={`simulation-underperformer-${employee.employeeId}`}
                      >
                        Sous-performant confirmé
                      </StatusBadge>
                    ) : employee.blockingReason ? (
                      employee.blockingReason
                    ) : (
                      "OK"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="form-actions" data-testid="simulation-results-pagination">
          <button
            type="button"
            disabled={safePageIndex <= 0}
            data-testid="simulation-results-prev"
            onClick={() => {
              setPageIndex((current) => Math.max(0, current - 1));
            }}
          >
            Précédent
          </button>
          <span>
            Page {safePageIndex + 1} / {pageCount} ({filteredEmployees.length}{" "}
            salarié
            {filteredEmployees.length > 1 ? "s" : ""})
          </span>
          <button
            type="button"
            disabled={safePageIndex >= pageCount - 1}
            data-testid="simulation-results-next"
            onClick={() => {
              setPageIndex((current) => Math.min(pageCount - 1, current + 1));
            }}
          >
            Suivant
          </button>
        </div>
      </SectionCard>

      {selectedEmployee ? (
        <EmployeeDetailDrawer
          employee={selectedEmployee}
          result={result}
          closeButtonRef={closeButtonRef}
          onClose={() => {
            setSelectedEmployeeId(null);
          }}
        />
      ) : null}
    </>
  );
}

function SimulationSummary({
  result,
}: {
  result: CampaignSimulationExecutionResult;
}) {
  const budget = result.budgetSummary;
  const population = result.populationSummary;
  return (
    <dl className="detail-list" data-testid="simulation-summary">
      <div>
        <dt>Campagne</dt>
        <dd>
          {result.campaignName ?? `Campagne #${result.campaignId}`}
          {result.campaignYear ? ` (${result.campaignYear})` : ""}
        </dd>
      </div>
      <div>
        <dt>Mode d’évaluation</dt>
        <dd>{nineBoxModeLabel(result.evaluationMode)}</dd>
      </div>
      <div>
        <dt>Population calculée</dt>
        <dd data-testid="simulation-summary-employee-count">
          {population.employeeCount}
        </dd>
      </div>
      <div>
        <dt>Budget annuel cible</dt>
        <dd data-testid="simulation-summary-budget-target">
          {budget.exactBudgetTargetLabel}
        </dd>
      </div>
      <div>
        <dt>Allocation théorique annuelle totale</dt>
        <dd data-testid="simulation-summary-theoretical">
          {budget.annualTheoreticalAllocatedTotalLabel}
        </dd>
      </div>
      <div>
        <dt>Augmentation mensuelle théorique totale</dt>
        <dd data-testid="simulation-summary-monthly-theoretical">
          {budget.monthlyTheoreticalIncreaseTotalLabel}
        </dd>
      </div>
      <div>
        <dt>Mois d’application technique</dt>
        <dd data-testid="simulation-summary-application-month">
          {population.technicalApplicationMonth
            ? technicalApplicationMonthLabelFr(
                population.technicalApplicationMonth,
              )
            : "—"}
        </dd>
      </div>
      <div>
        <dt>Coût annuel réel de l’augmentation de base</dt>
        <dd data-testid="simulation-summary-annual-base-increase">
          {formatFcfaInteger(population.totalAnnualActualBaseIncreaseCostFcfa)}
        </dd>
      </div>
      <div>
        <dt>Rappel total de salaire de base</dt>
        <dd data-testid="simulation-summary-base-reminder">
          {formatFcfaInteger(population.totalBaseSalaryReminderFcfa)}
        </dd>
      </div>
      <div>
        <dt>Augmentations payées directement (reste de l’année)</dt>
        <dd data-testid="simulation-summary-remaining-direct">
          {formatFcfaInteger(
            population.totalRemainingYearDirectIncreaseCostFcfa,
          )}
        </dd>
      </div>
      <div>
        <dt>Coût annuel réel après arrondi</dt>
        <dd data-testid="simulation-summary-actual">
          {budget.annualActualOperationCostLabel}
        </dd>
      </div>
      <div data-testid="simulation-summary-off-budget">
        <dt>Impacts hors budget</dt>
        <dd>
          <p className="form-help">
            Incidence calculée uniquement sur l’augmentation du salaire de base.
            Elle n’est pas incluse dans le budget de la mesure.
          </p>
          <dl className="detail-list">
            <div>
              <dt>Rappel total d’ancienneté</dt>
              <dd data-testid="simulation-summary-seniority-reminder">
                {formatFcfaInteger(population.totalSeniorityReminderFcfa)}
              </dd>
            </div>
            <div>
              <dt>Incidence d’ancienneté payée directement (reste de l’année)</dt>
              <dd data-testid="simulation-summary-seniority-direct">
                {formatFcfaInteger(
                  population.totalRemainingYearDirectSeniorityImpactFcfa,
                )}
              </dd>
            </div>
            <div>
              <dt>Incidence annuelle totale d’ancienneté</dt>
              <dd data-testid="simulation-summary-seniority-annual">
                {formatFcfaInteger(population.totalAnnualSeniorityImpactFcfa)}
              </dd>
            </div>
          </dl>
        </dd>
      </div>
      <div>
        <dt>Écart annuel d’arrondi</dt>
        <dd data-testid="simulation-summary-rounding-delta">
          {budget.annualTotalRoundingDeltaLabel}
        </dd>
      </div>
      <div>
        <dt>Pas d’arrondi mensuel</dt>
        <dd data-testid="simulation-summary-rounding-step">
          {formatFcfaInteger(budget.roundingStepFcfa)}
        </dd>
      </div>
      <div>
        <dt>Salariés à poids positif</dt>
        <dd data-testid="simulation-summary-positive-weight">
          {population.positiveWeightEmployeeCount}
        </dd>
      </div>
      <div>
        <dt>Salariés à poids nul</dt>
        <dd data-testid="simulation-summary-zero-weight">
          {population.zeroWeightEmployeeCount}
        </dd>
      </div>
      <div>
        <dt>Sous-performants confirmés</dt>
        <dd data-testid="simulation-summary-underperformers">
          {population.confirmedUnderperformerCount}
        </dd>
      </div>
      <div>
        <dt>Séquence d’exécution</dt>
        <dd data-testid="simulation-summary-run-sequence">{result.runSequence}</dd>
      </div>
    </dl>
  );
}

function ExecutionIssuesList({
  issues,
}: {
  issues: readonly CampaignSimulationExecutionIssue[];
}) {
  const grouped = new Map<string, CampaignSimulationExecutionIssue[]>();
  for (const scope of EXEC_SCOPE_ORDER) {
    grouped.set(scope, []);
  }
  for (const issue of issues) {
    const scope = EXEC_SCOPE_ORDER.includes(
      issue.scope as (typeof EXEC_SCOPE_ORDER)[number],
    )
      ? (issue.scope as (typeof EXEC_SCOPE_ORDER)[number])
      : "engine";
    const list = grouped.get(scope) ?? [];
    list.push(issue);
    grouped.set(scope, list);
  }

  return (
    <div data-testid="simulation-execution-issues">
      {EXEC_SCOPE_ORDER.map((scope) => {
        const items = grouped.get(scope) ?? [];
        if (items.length === 0) return null;
        return (
          <div key={scope}>
            <h4>{EXEC_SCOPE_LABELS[scope]}</h4>
            <ul>
              {items.map((issue, index) => (
                <li key={`${issue.code}-${issue.employeeId ?? ""}-${index}`}>
                  {issue.employeeId ? <strong>{issue.employeeId} — </strong> : null}
                  {issue.message}
                  <details>
                    <summary>Code technique</summary>
                    <code>{issue.code}</code>
                    {issue.field ? <p>Champ : {issue.field}</p> : null}
                  </details>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function EmployeeDetailDrawer({
  employee,
  result,
  onClose,
  closeButtonRef,
}: {
  employee: EmployeeSimulationResultView;
  result: CampaignSimulationExecutionResult;
  onClose: () => void;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div
      className="simulation-drawer-backdrop"
      data-testid="simulation-employee-drawer"
      role="presentation"
      onClick={onClose}
    >
      <aside
        className="simulation-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="simulation-employee-drawer-title"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="simulation-drawer__header">
          <h2 id="simulation-employee-drawer-title">
            Détail — {employee.employeeId}
            {employee.employeeDisplayName
              ? ` · ${employee.employeeDisplayName}`
              : ""}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            data-testid="simulation-employee-drawer-close"
            aria-label="Fermer le détail salarié"
            onClick={onClose}
          >
            Fermer
          </button>
        </div>
        <div className="simulation-drawer__body">
          <dl className="detail-list">
            <div>
              <dt>Identification</dt>
              <dd>
                {employee.employeeId}
                {employee.employeeDisplayName
                  ? ` — ${employee.employeeDisplayName}`
                  : ""}
              </dd>
            </div>
            <div>
              <dt>Famille / Grade</dt>
              <dd>
                {employee.familyLabel ?? employee.familyCode} /{" "}
                {employee.gradeLabel ?? employee.gradeCode}
              </dd>
            </div>
            <div>
              <dt>Salaire mensuel actuel</dt>
              <dd>{formatFcfaInteger(employee.salaryFcfa)}</dd>
            </div>
            <div>
              <dt>S0 mensuel</dt>
              <dd data-testid="simulation-detail-s0">
                {formatFcfaInteger(employee.s0Fcfa)}
              </dd>
            </div>
            <div>
              <dt>Ratio et position</dt>
              <dd data-testid="simulation-detail-position">
                {employee.salaryRatioBasisPoints} bps —{" "}
                {employee.salaryPositionLabel} ({employee.salaryPositionCode})
              </dd>
            </div>
            <div>
              <dt>Facteur de position</dt>
              <dd data-testid="simulation-detail-position-factor">
                {formatFactorMilli(employee.positionFactorMilli)}
              </dd>
            </div>
            <div>
              <dt>Mode d’évaluation</dt>
              <dd>{nineBoxModeLabel(employee.evaluationMode)}</dd>
            </div>
            <div>
              <dt>Performance</dt>
              <dd>
                {levelOrNotRequired(
                  employee.performanceLevel,
                  employee.evaluationMode !== "none",
                )}
              </dd>
            </div>
            <div>
              <dt>Potentiel</dt>
              <dd>
                {levelOrNotRequired(
                  employee.potentialLevel,
                  employee.evaluationMode === "performance_potential" ||
                    employee.evaluationMode === "full_nine_box",
                )}
              </dd>
            </div>
            <div>
              <dt>Facteur d’évaluation</dt>
              <dd data-testid="simulation-detail-eval-factor">
                {employee.evaluationFactorLabel}
              </dd>
            </div>
            <div>
              <dt>Poids théorique</dt>
              <dd data-testid="simulation-detail-theo-weight">
                {employee.theoreticalMatrixWeightLabel}
              </dd>
            </div>
            <div>
              <dt>Poids effectif</dt>
              <dd data-testid="simulation-detail-eff-weight">
                {employee.effectiveMatrixWeightLabel}
              </dd>
            </div>
            <div>
              <dt>Poids d’allocation</dt>
              <dd data-testid="simulation-detail-alloc-weight">
                {employee.allocationWeightLabel}
              </dd>
            </div>
            <div>
              <dt>Allocation théorique annuelle</dt>
              <dd data-testid="simulation-detail-annual-allocation">
                {employee.annualTheoreticalAllocationLabel}
              </dd>
            </div>
            <div>
              <dt>Augmentation mensuelle théorique</dt>
              <dd data-testid="simulation-detail-theo-amount">
                {employee.monthlyTheoreticalIncreaseLabel}
              </dd>
            </div>
            <div>
              <dt>Taux d’augmentation mensuel</dt>
              <dd data-testid="simulation-detail-theo-rate">
                {employee.monthlyTheoreticalIncreaseRateLabel}
              </dd>
            </div>
            <div>
              <dt>Politique d’arrondi mensuel</dt>
              <dd data-testid="simulation-detail-rounding">
                {result.budgetSummary.roundingMode} / pas{" "}
                {formatFcfaInteger(result.budgetSummary.roundingStepFcfa)}
              </dd>
            </div>
            <div>
              <dt>Augmentation mensuelle finale</dt>
              <dd data-testid="simulation-detail-final-increase">
                {formatFcfaInteger(employee.monthlyFinalRoundedIncreaseFcfa)}
              </dd>
            </div>
            <div>
              <dt>Mois de rappel</dt>
              <dd data-testid="simulation-detail-retro-months">
                {employee.retroactiveMonths}
              </dd>
            </div>
            <div>
              <dt>Rappel de salaire de base</dt>
              <dd data-testid="simulation-detail-base-reminder">
                {formatFcfaInteger(employee.baseSalaryReminderFcfa)}
              </dd>
            </div>
            <div>
              <dt>Mois restants (paiement direct)</dt>
              <dd data-testid="simulation-detail-remaining-months">
                {employee.remainingDirectPaymentMonths}
              </dd>
            </div>
            <div>
              <dt>Coût payé directement (reste de l’année)</dt>
              <dd data-testid="simulation-detail-remaining-direct">
                {formatFcfaInteger(
                  employee.remainingYearDirectIncreaseCostFcfa,
                )}
              </dd>
            </div>
            <div>
              <dt>Écart mensuel d’arrondi</dt>
              <dd>{employee.monthlyRoundingDeltaLabel}</dd>
            </div>
            <div>
              <dt>Nouveau salaire mensuel</dt>
              <dd data-testid="simulation-detail-final-salary">
                {formatFcfaInteger(employee.monthlyFinalSalaryFcfa)}
              </dd>
            </div>
            <div>
              <dt>Coût annuel total de l’augmentation de base</dt>
              <dd data-testid="simulation-detail-annual-cost">
                {formatFcfaInteger(employee.annualActualBaseIncreaseCostFcfa)}
              </dd>
            </div>
            <div>
              <dt>Date d’embauche</dt>
              <dd data-testid="simulation-detail-hire-date">
                {employee.hireDate}
              </dd>
            </div>
            <div>
              <dt>Taux d’ancienneté au mois d’application</dt>
              <dd data-testid="simulation-detail-seniority-rate">
                {employee.technicalApplicationMonthSeniorityRatePercent} %
              </dd>
            </div>
            <div>
              <dt>Calendrier mensuel des taux d’ancienneté</dt>
              <dd data-testid="simulation-detail-seniority-schedule">
                <ul>
                  {employee.monthlySeniorityImpactSchedule.map((entry) => (
                    <li key={entry.month}>
                      {technicalApplicationMonthLabelFr(entry.month)} :{" "}
                      {entry.ratePercent} % —{" "}
                      {formatFcfaInteger(entry.monthlySeniorityImpactFcfa)} (
                      {entry.paymentTiming === "reminder"
                        ? "rappel"
                        : "direct"}
                      )
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
            <div>
              <dt>Rappel d’ancienneté (hors budget)</dt>
              <dd data-testid="simulation-detail-seniority-reminder">
                {formatFcfaInteger(employee.seniorityReminderFcfa)}
              </dd>
            </div>
            <div>
              <dt>Incidence directe restante (hors budget)</dt>
              <dd data-testid="simulation-detail-seniority-direct">
                {formatFcfaInteger(
                  employee.remainingYearDirectSeniorityImpactFcfa,
                )}
              </dd>
            </div>
            <div>
              <dt>Incidence annuelle totale d’ancienneté (hors budget)</dt>
              <dd data-testid="simulation-detail-seniority-annual">
                {formatFcfaInteger(employee.annualSeniorityImpactFcfa)}
              </dd>
            </div>
            <div>
              <dt>Écart annuel d’arrondi</dt>
              <dd data-testid="simulation-detail-annual-delta">
                {employee.annualRoundingDeltaLabel}
              </dd>
            </div>
            <div>
              <dt>Raison de blocage</dt>
              <dd>
                {employee.blockingReason === "CONFIRMED_UNDERPERFORMER"
                  ? "Sous-performant confirmé (augmentation mensuelle = 0)"
                  : (employee.blockingReason ?? "Aucune")}
              </dd>
            </div>
          </dl>

          <details data-testid="simulation-detail-trace">
            <summary>Étapes d’explication</summary>
            <ol>
              {employee.explanationSteps.map((step, index) => (
                <li key={`${step.step}-${index}`}>
                  <strong>{step.step}</strong>
                  {step.formula ? <div>{step.formula}</div> : null}
                  {step.outputValue ? (
                    <div>
                      <code>{step.outputValue}</code>
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          </details>
        </div>
      </aside>
    </div>
  );
}
