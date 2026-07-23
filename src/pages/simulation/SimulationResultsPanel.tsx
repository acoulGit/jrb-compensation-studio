/**
 * Synthèse, calendrier, ancienneté, tableau et détail des résultats
 * (Lot 2B-3 / Lot 2A-H2C-2B) + actions d'enregistrement explicite (Lot 2B-4B).
 * Aucune logique métier de calcul : affichage des vues formatées uniquement ;
 * la sauvegarde est déléguée à `SimulationSaveActions`.
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
  formatSeniorityRatePercent,
} from "../../application/campaignSimulation/formatExactBudgetDisplay";
import { findDedicatedSimulationBusinessError } from "../../application/campaignSimulation/findDedicatedSimulationBusinessError";
import { technicalApplicationMonthLabelFr } from "../../domain/compensationCalculation";
import { nineBoxModeLabel } from "../../domain/compensationReference/conversions";
import { SectionCard } from "../../components/ui/SectionCard";
import { StatusBadge } from "../../components/ui/StatusBadge";
import type { CampaignSimulationExecutionState } from "../../app/SimulationExecutionProvider";
import { SimulationSaveActions } from "./SimulationSaveActions";

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
    const dedicated = findDedicatedSimulationBusinessError(execution.issues);
    return (
      <SectionCard
        title={
          dedicated?.title ?? "La simulation n’a pas pu être calculée"
        }
      >
        {dedicated ? (
          <div
            className="form-feedback form-feedback--error"
            role="alert"
            data-testid="simulation-business-error"
            data-error-code={dedicated.code}
          >
            <p data-testid="simulation-business-error-message">
              {dedicated.message}
            </p>
            <dl
              className="detail-list"
              data-testid="simulation-business-error-details"
            >
              {dedicated.details.map((detail) => (
                <div key={detail.label}>
                  <dt>{detail.label}</dt>
                  <dd>{detail.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <p
            className="form-feedback form-feedback--error"
            role="alert"
            data-testid="simulation-execution-error"
          >
            {execution.errorMessage ?? "La simulation n’a pas pu être calculée."}
          </p>
        )}
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

  const showPromotionColumns = result.budgetSummary.hasStructuredPromotions;
  const showMinimumColumns =
    result.populationSummary.minimumIncreaseMode !== "none" ||
    result.populationSummary.totalMinimumComplementFloorCostFcfa > 0n;

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

      {!showStaleBanner && !isArchived ? <SimulationSaveActions /> : null}

      <SectionCard title="Synthèse de l’enveloppe">
        {isArchived ? (
          <StatusBadge tone="neutral" data-testid="simulation-result-readonly">
            Lecture seule
          </StatusBadge>
        ) : null}
        <EnvelopeSummary result={result} />
      </SectionCard>

      <SectionCard title="Calendrier de paiement">
        <PaymentCalendarSection result={result} />
      </SectionCard>

      <SectionCard title="Incidences d’ancienneté — hors budget">
        <SeniorityImpactSection result={result} />
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

        <div
          className="data-table-wrap"
          data-testid="simulation-results-table-wrap"
        >
          <table className="data-table" data-testid="simulation-results-table">
            <thead>
              <tr>
                <th scope="col">Matricule</th>
                <th scope="col">Salarié</th>
                {showPromotionColumns ? (
                  <th scope="col">Promotion</th>
                ) : null}
                <th scope="col">Éligibilité complément</th>
                <th scope="col">Salaire décembre N-1</th>
                {showPromotionColumns ? (
                  <th scope="col">Salaire promu</th>
                ) : null}
                {showPromotionColumns ? (
                  <th scope="col">Coût promotion imputable</th>
                ) : null}
                {showMinimumColumns ? (
                  <th scope="col">Complément minimum (période)</th>
                ) : null}
                {showMinimumColumns ? (
                  <th scope="col">Complément au-dessus du minimum</th>
                ) : null}
                <th scope="col">Complément mensuel au mois d’application</th>
                <th scope="col">Rappel complément</th>
                <th scope="col">Coût annuel complément</th>
                <th scope="col">Incidence annuelle d’ancienneté</th>
                <th scope="col">Salaire final au mois d’application</th>
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
                      aria-expanded={selectedEmployeeId === employee.employeeId}
                      aria-controls="simulation-employee-drawer"
                      onClick={() => {
                        setSelectedEmployeeId(employee.employeeId);
                      }}
                    >
                      {employee.employeeId}
                    </button>
                  </td>
                  <td>{employee.employeeDisplayName ?? "—"}</td>
                  {showPromotionColumns ? (
                    <td
                      title={
                        employee.hasStructuredPromotion
                          ? [
                              employee.promotionDate,
                              employee.previousGradeCode &&
                              employee.promotedGradeCode
                                ? `${employee.previousGradeCode} → ${employee.promotedGradeCode}`
                                : null,
                              employee.promotionRateLabel,
                              `brut ${employee.promotionCampaignCostInformativeLabel}`,
                              `imputé ${employee.annualPromotionBudgetCostLabel}`,
                            ]
                              .filter(Boolean)
                              .join(" · ")
                          : undefined
                      }
                      data-testid={`simulation-promo-status-${employee.employeeId}`}
                    >
                      {employee.promotionStatusLabel}
                    </td>
                  ) : null}
                  <td
                    data-testid={`simulation-eligibility-${employee.employeeId}`}
                  >
                    {employee.compensatoryEligibilityLabel}
                    {employee.compensatoryIneligibilityReasonLabel ? (
                      <span className="muted">
                        {" "}
                        ({employee.compensatoryIneligibilityReasonLabel})
                      </span>
                    ) : null}
                  </td>
                  <td>{formatFcfaInteger(employee.salaryFcfa)}</td>
                  {showPromotionColumns ? (
                    <td>
                      {employee.salaryAfterPromotionFcfa !== null
                        ? formatFcfaInteger(employee.salaryAfterPromotionFcfa)
                        : "—"}
                    </td>
                  ) : null}
                  {showPromotionColumns ? (
                    <td
                      data-testid={`simulation-promo-budget-${employee.employeeId}`}
                    >
                      {employee.annualPromotionBudgetCostLabel}
                    </td>
                  ) : null}
                  {showMinimumColumns ? (
                    <td
                      data-testid={`simulation-minimum-floor-${employee.employeeId}`}
                    >
                      {employee.campaignPeriodMinimumComplementFloorCostLabel}
                    </td>
                  ) : null}
                  {showMinimumColumns ? (
                    <td
                      data-testid={`simulation-above-minimum-${employee.employeeId}`}
                    >
                      {employee.campaignPeriodCompensationAboveMinimumCostLabel}
                    </td>
                  ) : null}
                  <td
                    data-testid={`simulation-final-increase-${employee.employeeId}`}
                  >
                    {employee.technicalMonthCompensatoryComplementLabel}
                  </td>
                  <td
                    data-testid={`simulation-base-reminder-${employee.employeeId}`}
                  >
                    {formatFcfaInteger(employee.baseSalaryReminderFcfa)}
                  </td>
                  <td
                    data-testid={`simulation-annual-cost-${employee.employeeId}`}
                  >
                    {formatFcfaInteger(employee.annualActualBaseIncreaseCostFcfa)}
                  </td>
                  <td
                    data-testid={`simulation-seniority-annual-${employee.employeeId}`}
                  >
                    {employee.combinedAnnualSeniorityImpactLabel}
                  </td>
                  <td
                    data-testid={`simulation-final-salary-${employee.employeeId}`}
                  >
                    {employee.technicalMonthFinalSalaryLabel}
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

        <div
          className="form-actions"
          data-testid="simulation-results-pagination"
        >
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

function EnvelopeSummary({
  result,
}: {
  result: CampaignSimulationExecutionResult;
}) {
  const envelope = result.budgetSummary.envelopeSummary;
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
        <dt>Enveloppe de la période d’effet</dt>
        <dd data-testid="simulation-summary-budget-target">
          {envelope.annualBudgetTargetLabel}
        </dd>
      </div>
      <div>
        <dt>Coût des promotions imputé à l’enveloppe</dt>
        <dd data-testid="simulation-summary-promotion-budget-cost">
          {result.budgetSummary.hasImputedPromotionBudgetCost
            ? envelope.totalAnnualPromotionBudgetCostLabel
            : "Aucune promotion incluse"}
        </dd>
      </div>
      <div>
        <dt>Minimum garanti réservé</dt>
        <dd data-testid="simulation-summary-minimum-floor-cost">
          {envelope.totalMinimumComplementFloorCostLabel}
        </dd>
      </div>
      <div>
        <dt>Budget disponible après promotions et minimum</dt>
        <dd data-testid="simulation-summary-available-after-minimum">
          {envelope.availableBudgetAfterPromotionsAndMinimumLabel}
        </dd>
      </div>
      <div>
        <dt>Budget disponible pour le complément compensatoire</dt>
        <dd data-testid="simulation-summary-available-compensatory">
          {envelope.availableAnnualCompensatoryBudgetLabel}
        </dd>
      </div>
      <div>
        <dt>Complément compensatoire théorique (période)</dt>
        <dd data-testid="simulation-summary-theoretical">
          {envelope.totalAnnualTheoreticalCompensatoryCostLabel}
        </dd>
      </div>
      <div>
        <dt>Coût effectif de campagne — complément</dt>
        <dd data-testid="simulation-summary-actual">
          {envelope.totalAnnualActualCompensatoryCostLabel}
        </dd>
      </div>
      <div>
        <dt>Part minimum du complément</dt>
        <dd data-testid="simulation-summary-minimum-paid">
          {envelope.actualMinimumComplementPaidCostLabel}
        </dd>
      </div>
      <div>
        <dt>Part au-dessus du minimum</dt>
        <dd data-testid="simulation-summary-above-minimum">
          {envelope.actualCompensationAboveMinimumCostLabel}
        </dd>
      </div>
      <div>
        <dt>Coût effectif de campagne — promotions + complément</dt>
        <dd data-testid="simulation-summary-combined-actual">
          {envelope.totalAnnualActualCombinedBaseMeasureCostLabel}
        </dd>
      </div>
      <div>
        <dt>Delta de période</dt>
        <dd data-testid="simulation-summary-rounding-delta">
          {envelope.annualCombinedRoundingDeltaLabel}
        </dd>
      </div>
      <div>
        <dt>Coût à plein effet sur 12 mois — combiné</dt>
        <dd data-testid="simulation-summary-full-year-run-rate">
          {result.budgetSummary.fullYearRunRateCombinedBaseMeasureCostLabel}
        </dd>
      </div>
      <div>
        <dt>Taux de calibrage compensatoire</dt>
        <dd data-testid="simulation-summary-calibration-rate">
          {envelope.compensatoryCalibrationRateLabel}
        </dd>
      </div>
      <div>
        <dt>Pas d’arrondi mensuel</dt>
        <dd data-testid="simulation-summary-rounding-step">
          {formatFcfaInteger(result.budgetSummary.roundingStepFcfa)}
        </dd>
      </div>
      <div>
        <dt>Séquence d’exécution</dt>
        <dd data-testid="simulation-summary-run-sequence">
          {result.runSequence}
        </dd>
      </div>
    </dl>
  );
}

function PaymentCalendarSection({
  result,
}: {
  result: CampaignSimulationExecutionResult;
}) {
  const calendar = result.budgetSummary.paymentCalendar;
  const showPromo = result.budgetSummary.hasImputedPromotionBudgetCost;
  return (
    <div data-testid="simulation-payment-calendar">
      {showPromo ? (
        <div data-testid="simulation-payment-calendar-promotions">
          <h3>Promotions</h3>
          <dl className="detail-list">
            <div>
              <dt>Promotions déjà payées avant le mois d’application</dt>
              <dd data-testid="simulation-promo-already-paid">
                {calendar.totalPromotionCostAlreadyPaidBeforeTechnicalMonthLabel}
              </dd>
            </div>
            <div>
              <dt>Coût des promotions du mois d’application à décembre</dt>
              <dd data-testid="simulation-promo-remaining">
                {calendar.totalPromotionCostFromTechnicalMonthToDecemberLabel}
              </dd>
            </div>
            <div>
              <dt>Coût total des promotions (période d’effet)</dt>
              <dd data-testid="simulation-promo-annual-total">
                {calendar.totalAnnualPromotionBudgetCostLabel}
              </dd>
            </div>
          </dl>
          <p className="form-help">
            Les montants de promotions déjà payées ne sont pas à verser de
            nouveau.
          </p>
        </div>
      ) : (
        <p className="muted" data-testid="simulation-no-promotion-banner">
          Aucune promotion incluse
        </p>
      )}

      <div data-testid="simulation-payment-calendar-compensatory">
        <h3>Complément compensatoire</h3>
        <dl className="detail-list">
          <div>
            <dt>Rappel du complément compensatoire</dt>
            <dd data-testid="simulation-summary-base-reminder">
              {calendar.totalCompensatoryReminderLabel}
            </dd>
          </div>
          <div>
            <dt>Paiement direct du mois d’application à décembre</dt>
            <dd data-testid="simulation-summary-remaining-direct">
              {calendar.totalRemainingYearDirectCompensatoryCostLabel}
            </dd>
          </div>
          <div>
            <dt>Coût effectif de campagne du complément</dt>
            <dd data-testid="simulation-summary-annual-base-increase">
              {calendar.totalAnnualActualCompensatoryCostLabel}
            </dd>
          </div>
        </dl>
        <p
          className="form-help"
          data-testid="simulation-compensatory-invariant"
          data-holds={
            calendar.compensatoryReminderPlusDirectEqualsAnnual
              ? "true"
              : "false"
          }
        >
          Rappel du complément + paiement direct = coût effectif de campagne du
          complément
          {calendar.compensatoryReminderPlusDirectEqualsAnnual
            ? " (vérifié)"
            : ""}
          .
        </p>
      </div>
    </div>
  );
}

function SeniorityImpactSection({
  result,
}: {
  result: CampaignSimulationExecutionResult;
}) {
  const seniority = result.budgetSummary.seniorityImpactSummary;
  const showPromo = result.budgetSummary.hasImputedPromotionBudgetCost;
  return (
    <div data-testid="simulation-seniority-summary">
      <p className="form-help">
        Ces incidences sont présentées hors enveloppe de la mesure de base.
      </p>
      <dl className="detail-list">
        {showPromo ? (
          <div>
            <dt>Incidence annuelle liée aux promotions</dt>
            <dd data-testid="simulation-summary-seniority-promotion">
              {seniority.totalAnnualPromotionSeniorityImpactLabel}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Incidence annuelle liée au complément compensatoire</dt>
          <dd data-testid="simulation-summary-seniority-compensatory">
            {seniority.totalAnnualCompensatorySeniorityImpactLabel}
          </dd>
        </div>
        <div>
          <dt>Incidence annuelle totale d’ancienneté</dt>
          <dd data-testid="simulation-summary-seniority-annual">
            {seniority.totalAnnualSeniorityImpactLabel}
          </dd>
        </div>
      </dl>
      {showPromo ? (
        <details data-testid="simulation-seniority-breakdown">
          <summary>Ventilation temporelle</summary>
          <dl className="detail-list">
            <div>
              <dt>
                Incidence d’ancienneté liée aux promotions déjà payée (avant
                mois technique)
              </dt>
              <dd>
                {
                  seniority.totalPromotionSeniorityAlreadyPaidBeforeTechnicalMonthLabel
                }
              </dd>
            </div>
            <div>
              <dt>
                Incidence d’ancienneté promotions du mois technique à décembre
              </dt>
              <dd>
                {
                  seniority.totalPromotionSeniorityFromTechnicalMonthToDecemberLabel
                }
              </dd>
            </div>
            <div>
              <dt>Rappel d’ancienneté (complément)</dt>
              <dd data-testid="simulation-summary-seniority-reminder">
                {seniority.totalCompensatorySeniorityReminderLabel}
              </dd>
            </div>
            <div>
              <dt>
                Incidence directe d’ancienneté (complément, mois technique →
                décembre)
              </dt>
              <dd data-testid="simulation-summary-seniority-direct">
                {
                  seniority.totalRemainingYearDirectCompensatorySeniorityImpactLabel
                }
              </dd>
            </div>
          </dl>
        </details>
      ) : (
        <dl className="detail-list">
          <div>
            <dt>Rappel total d’ancienneté</dt>
            <dd data-testid="simulation-summary-seniority-reminder">
              {seniority.totalCompensatorySeniorityReminderLabel}
            </dd>
          </div>
          <div>
            <dt>
              Incidence d’ancienneté payée directement (reste de l’année)
            </dt>
            <dd data-testid="simulation-summary-seniority-direct">
              {
                seniority.totalRemainingYearDirectCompensatorySeniorityImpactLabel
              }
            </dd>
          </div>
        </dl>
      )}
    </div>
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
                  {issue.employeeId ? (
                    <strong>{issue.employeeId} — </strong>
                  ) : null}
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
        id="simulation-employee-drawer"
        className="simulation-drawer simulation-drawer--max"
        data-drawer-width="max"
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
          <section data-testid="simulation-detail-promotion">
            <h3>Promotion</h3>
            {employee.hasStructuredPromotion ? (
              <dl className="detail-list">
                <div>
                  <dt>Date de promotion</dt>
                  <dd>{employee.promotionDate ?? "—"}</dd>
                </div>
                <div>
                  <dt>Statut d’inclusion</dt>
                  <dd>{employee.promotionInclusionStatusLabel}</dd>
                </div>
                <div>
                  <dt>Ancien → nouveau grade</dt>
                  <dd>
                    {employee.previousGradeCode} → {employee.promotedGradeCode}
                    {employee.previousGradeCode &&
                    employee.promotedGradeCode &&
                    employee.previousGradeCode === employee.promotedGradeCode
                      ? " (grade conservé)"
                      : ""}
                  </dd>
                </div>
                <div>
                  <dt>Ancienne → nouvelle famille</dt>
                  <dd>
                    {employee.previousJobFamilyCode ===
                    employee.promotedJobFamilyCode
                      ? employee.previousJobFamilyCode
                      : `${employee.previousJobFamilyCode} → ${employee.promotedJobFamilyCode}`}
                  </dd>
                </div>
                <div>
                  <dt>Salaire avant → après</dt>
                  <dd>
                    {employee.salaryBeforePromotionFcfa !== null
                      ? formatFcfaInteger(employee.salaryBeforePromotionFcfa)
                      : "—"}{" "}
                    →{" "}
                    {employee.salaryAfterPromotionFcfa !== null
                      ? formatFcfaInteger(employee.salaryAfterPromotionFcfa)
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Montant / taux</dt>
                  <dd>
                    {employee.promotionAmountFcfa !== null
                      ? formatFcfaInteger(employee.promotionAmountFcfa)
                      : "—"}{" "}
                    · {employee.promotionRateLabel ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt>Coût brut annuel / campagne (informatif)</dt>
                  <dd data-testid="simulation-detail-promo-brut">
                    {employee.promotionCampaignCostInformativeLabel}
                  </dd>
                </div>
                <div>
                  <dt>Coût imputé à l’enveloppe</dt>
                  <dd data-testid="simulation-detail-promo-imputed">
                    {employee.annualPromotionBudgetCostLabel}
                  </dd>
                </div>
                <div>
                  <dt>
                    Montant déjà payé avant le mois technique
                  </dt>
                  <dd>
                    {employee.promotionCostAlreadyPaidBeforeTechnicalMonthLabel}
                  </dd>
                </div>
                <div>
                  <dt>Montant restant de l’année</dt>
                  <dd>
                    {employee.promotionCostFromTechnicalMonthToDecemberLabel}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="muted">Aucune promotion structurée</p>
            )}
          </section>

          <section data-testid="simulation-detail-compensatory">
            <h3>Complément compensatoire</h3>
            <dl className="detail-list">
              <div>
                <dt>Éligibilité</dt>
                <dd>{employee.compensatoryEligibilityLabel}</dd>
              </div>
              <div>
                <dt>Motif d’inéligibilité</dt>
                <dd data-testid="simulation-detail-ineligibility">
                  {employee.compensatoryIneligibilityReasonLabel ?? "Aucun"}
                </dd>
              </div>
              <div>
                <dt>Taux de calibrage</dt>
                <dd>
                  {
                    result.budgetSummary.envelopeSummary
                      .compensatoryCalibrationRateLabel
                  }
                </dd>
              </div>
              <div data-testid="simulation-detail-minimum-temporality">
                <dt>Mois de rétroactivité générale</dt>
                <dd>
                  {technicalApplicationMonthLabelFr(employee.retroactivityStartMonth)}
                </dd>
              </div>
              <div>
                <dt>Mois technique</dt>
                <dd>
                  {technicalApplicationMonthLabelFr(
                    employee.technicalApplicationMonth,
                  )}
                </dd>
              </div>
              <div>
                <dt>Mois d’effet du minimum garanti</dt>
                <dd data-testid="simulation-detail-minimum-effective-month">
                  {technicalApplicationMonthLabelFr(
                    employee.minimumGuaranteeEffectiveMonth ??
                      employee.technicalApplicationMonth,
                  )}
                </dd>
              </div>
              <div>
                <dt>Complément au mois d’application</dt>
                <dd data-testid="simulation-detail-final-increase">
                  {employee.technicalMonthCompensatoryComplementLabel}
                </dd>
              </div>
              <div>
                <dt>Coût théorique annuel</dt>
                <dd data-testid="simulation-detail-annual-allocation">
                  {employee.annualTheoreticalAllocationLabel}
                </dd>
              </div>
              <div>
                <dt>Coût réel annuel</dt>
                <dd data-testid="simulation-detail-annual-cost">
                  {formatFcfaInteger(employee.annualActualBaseIncreaseCostFcfa)}
                </dd>
              </div>
              <div>
                <dt>Rappel du minimum garanti</dt>
                <dd data-testid="simulation-detail-minimum-reminder">
                  {employee.minimumCompensatoryReminderLabel}
                </dd>
              </div>
              <div>
                <dt>Rappel au-dessus du minimum</dt>
                <dd data-testid="simulation-detail-above-minimum-reminder">
                  {employee.aboveMinimumCompensatoryReminderLabel}
                </dd>
              </div>
              <div>
                <dt>Rappel compensatoire total</dt>
                <dd data-testid="simulation-detail-base-reminder">
                  {formatFcfaInteger(employee.baseSalaryReminderFcfa)}
                </dd>
              </div>
              <div>
                <dt>Paiement direct restant</dt>
                <dd data-testid="simulation-detail-remaining-direct">
                  {formatFcfaInteger(
                    employee.remainingYearDirectIncreaseCostFcfa,
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <section data-testid="simulation-detail-seniority">
            <h3>Ancienneté (hors budget)</h3>
            <dl className="detail-list">
              <div>
                <dt>Incidence promotion</dt>
                <dd>{employee.annualPromotionSeniorityImpactLabel}</dd>
              </div>
              <div>
                <dt>Incidence complément</dt>
                <dd data-testid="simulation-detail-seniority-annual">
                  {formatFcfaInteger(employee.annualSeniorityImpactFcfa)}
                </dd>
              </div>
              <div>
                <dt>Incidence totale</dt>
                <dd>{employee.combinedAnnualSeniorityImpactLabel}</dd>
              </div>
              <div>
                <dt>Rappel d’ancienneté (complément)</dt>
                <dd data-testid="simulation-detail-seniority-reminder">
                  {formatFcfaInteger(employee.seniorityReminderFcfa)}
                </dd>
              </div>
              <div>
                <dt>Incidence directe restante (complément)</dt>
                <dd data-testid="simulation-detail-seniority-direct">
                  {formatFcfaInteger(
                    employee.remainingYearDirectSeniorityImpactFcfa,
                  )}
                </dd>
              </div>
              <div>
                <dt>Taux d’ancienneté au mois d’application</dt>
                <dd data-testid="simulation-detail-seniority-rate">
                  {formatSeniorityRatePercent(
                    employee.technicalApplicationMonthSeniorityRatePercent,
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <section data-testid="simulation-detail-trajectory">
            <h3>Trajectoire mensuelle</h3>
            <div className="data-table-wrap data-table-wrap--scroll-x">
              <table
                className="data-table data-table--compact data-table--trajectory"
                data-testid="simulation-trajectory-table"
              >
                <thead>
                  <tr>
                    <th scope="col" className="data-table__month" title="Mois">
                      Mois
                    </th>
                    <th
                      scope="col"
                      className="data-table__num"
                      title="Salaire de base"
                    >
                      Base
                    </th>
                    <th scope="col" title="Grade">
                      Grade
                    </th>
                    <th scope="col" title="Famille d’emploi">
                      Fam.
                    </th>
                    <th
                      scope="col"
                      className="data-table__num"
                      title="Taux cible compensatoire"
                    >
                      Taux cible
                    </th>
                    <th
                      scope="col"
                      className="data-table__num"
                      title="Taux promotion déduit"
                    >
                      Taux promo
                    </th>
                    <th
                      scope="col"
                      className="data-table__num"
                      title="Taux complémentaire"
                    >
                      Taux compl.
                    </th>
                    <th
                      scope="col"
                      className="data-table__num"
                      title="Complément théorique"
                    >
                      Compl. théo.
                    </th>
                    <th
                      scope="col"
                      className="data-table__num"
                      title="Plancher minimum"
                    >
                      Min. plancher
                    </th>
                    <th
                      scope="col"
                      className="data-table__num"
                      title="Complément au-dessus du minimum"
                    >
                      Au-dessus min.
                    </th>
                    <th
                      scope="col"
                      className="data-table__num"
                      title="Complément arrondi total"
                    >
                      Compl. arrondi
                    </th>
                    <th
                      scope="col"
                      className="data-table__num"
                      title="Coût promotion du mois"
                    >
                      Coût promo
                    </th>
                    <th
                      scope="col"
                      className="data-table__num"
                      title="Salaire final"
                    >
                      Salaire final
                    </th>
                    <th
                      scope="col"
                      className="data-table__num"
                      title="Taux d’ancienneté"
                    >
                      Tx anc.
                    </th>
                    <th
                      scope="col"
                      className="data-table__num"
                      title="Incidence d’ancienneté promotion"
                    >
                      Anc. promo
                    </th>
                    <th
                      scope="col"
                      className="data-table__num"
                      title="Incidence d’ancienneté complément"
                    >
                      Anc. compl.
                    </th>
                    <th
                      scope="col"
                      className="data-table__num"
                      title="Incidence d’ancienneté totale"
                    >
                      Anc. totale
                    </th>
                    <th scope="col" title="Paiement promotion">
                      Paiement promo
                    </th>
                    <th scope="col" title="Paiement complément">
                      Paiement compl.
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {employee.monthlyCompensationTrajectory.map((entry) => (
                    <tr key={entry.month}>
                      <td className="data-table__month">{entry.monthLabel}</td>
                      <td className="data-table__num">{entry.baseSalaryLabel}</td>
                      <td>{entry.gradeCode}</td>
                      <td>{entry.jobFamilyCode}</td>
                      <td className="data-table__num">
                        {entry.targetCompensatoryRateLabel}
                      </td>
                      <td className="data-table__num">
                        {entry.promotionRateOffsetLabel}
                      </td>
                      <td className="data-table__num">
                        {entry.compensatoryComplementRateLabel}
                      </td>
                      <td className="data-table__num">
                        {entry.theoreticalCompensatoryComplementLabel}
                      </td>
                      <td className="data-table__num">
                        {entry.minimumComplementFloorLabel}
                      </td>
                      <td className="data-table__num">
                        {entry.actualComplementAboveMinimumLabel}
                      </td>
                      <td className="data-table__num">
                        {entry.roundedCompensatoryComplementLabel}
                      </td>
                      <td className="data-table__num">
                        {entry.promotionBudgetCostLabel}
                      </td>
                      <td className="data-table__num">{entry.finalSalaryLabel}</td>
                      <td className="data-table__num">{entry.seniorityRateLabel}</td>
                      <td className="data-table__num">
                        {entry.promotionSeniorityImpactLabel}
                      </td>
                      <td className="data-table__num">
                        {entry.compensatorySeniorityImpactLabel}
                      </td>
                      <td className="data-table__num">
                        {entry.totalSeniorityImpactLabel}
                      </td>
                      <td>{entry.promotionPaymentStatusLabel}</td>
                      <td>{entry.compensatoryPaymentStatusLabel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <details data-testid="simulation-detail-identity">
            <summary>Identification et facteurs</summary>
            <dl className="detail-list">
              <div>
                <dt>Famille / Grade (décembre)</dt>
                <dd>
                  {employee.familyLabel ?? employee.familyCode} /{" "}
                  {employee.gradeLabel ?? employee.gradeCode}
                </dd>
              </div>
              <div>
                <dt>S0 mensuel</dt>
                <dd data-testid="simulation-detail-s0">
                  {formatFcfaInteger(employee.s0Fcfa)}
                </dd>
              </div>
              <div>
                <dt>Position</dt>
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
                <dt>Facteur d’évaluation</dt>
                <dd data-testid="simulation-detail-eval-factor">
                  {employee.evaluationFactorLabel}
                </dd>
              </div>
              <div>
                <dt>Poids théorique / effectif / allocation</dt>
                <dd>
                  <span data-testid="simulation-detail-theo-weight">
                    {employee.theoreticalMatrixWeightLabel}
                  </span>
                  {" / "}
                  <span data-testid="simulation-detail-eff-weight">
                    {employee.effectiveMatrixWeightLabel}
                  </span>
                  {" / "}
                  <span data-testid="simulation-detail-alloc-weight">
                    {employee.allocationWeightLabel}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Date d’embauche</dt>
                <dd data-testid="simulation-detail-hire-date">
                  {employee.hireDate}
                </dd>
              </div>
              <div>
                <dt>Nouveau salaire mensuel (réf. décembre)</dt>
                <dd data-testid="simulation-detail-final-salary">
                  {employee.technicalMonthFinalSalaryLabel}
                </dd>
              </div>
              <div>
                <dt>Écart annuel d’arrondi (complément)</dt>
                <dd data-testid="simulation-detail-annual-delta">
                  {employee.annualRoundingDeltaLabel}
                </dd>
              </div>
            </dl>
          </details>

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
