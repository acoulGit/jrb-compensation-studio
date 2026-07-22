/** Drawer de détail salarié partagé courant / historique (Lot 2B-4B). */

import { useEffect, type RefObject } from "react";
import {
  formatFcfaInteger,
  formatFactorMilli,
} from "../../../application/campaignSimulation/formatExactBudgetDisplay";
import type {
  SimulationEmployeeViewModel,
  SimulationViewMode,
} from "../../../application/campaignSimulation/simulationViewModels";
import { nineBoxModeLabel } from "../../../domain/compensationReference/conversions";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { levelOrNotRequired } from "./simulationViewUtils";

interface SimulationEmployeeDetailDrawerProps {
  employee: SimulationEmployeeViewModel;
  mode: SimulationViewMode;
  roundingMode: string;
  roundingStepLabel: string;
  onClose: () => void;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  testIdPrefix?: string;
}

export function SimulationEmployeeDetailDrawer({
  employee,
  mode,
  roundingMode,
  roundingStepLabel,
  onClose,
  closeButtonRef,
  testIdPrefix = "simulation",
}: SimulationEmployeeDetailDrawerProps) {
  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeButtonRef, onClose]);

  return (
    <div
      className="simulation-drawer-backdrop"
      data-testid={`${testIdPrefix}-employee-drawer`}
      role="presentation"
      onClick={onClose}
    >
      <aside
        className="simulation-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${testIdPrefix}-employee-drawer-title`}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="simulation-drawer__header">
          <h2 id={`${testIdPrefix}-employee-drawer-title`}>
            Détail — {employee.employeeId}
            {employee.employeeDisplayName
              ? ` · ${employee.employeeDisplayName}`
              : ""}
          </h2>
          {mode === "persisted-readonly" ? (
            <StatusBadge tone="neutral" data-testid={`${testIdPrefix}-persisted-badge`}>
              Snapshot enregistré — non recalculé
            </StatusBadge>
          ) : null}
          <button
            ref={closeButtonRef}
            type="button"
            data-testid={`${testIdPrefix}-employee-drawer-close`}
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
              <dt>Salaire</dt>
              <dd>{formatFcfaInteger(employee.salaryFcfa)}</dd>
            </div>
            <div>
              <dt>S0</dt>
              <dd data-testid={`${testIdPrefix}-detail-s0`}>
                {formatFcfaInteger(employee.s0Fcfa)}
              </dd>
            </div>
            <div>
              <dt>Ratio et position</dt>
              <dd data-testid={`${testIdPrefix}-detail-position`}>
                {employee.salaryRatioBasisPoints} bps —{" "}
                {employee.salaryPositionLabel} ({employee.salaryPositionCode})
              </dd>
            </div>
            <div>
              <dt>Facteur de position</dt>
              <dd data-testid={`${testIdPrefix}-detail-position-factor`}>
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
              <dd data-testid={`${testIdPrefix}-detail-eval-factor`}>
                {employee.evaluationFactorLabel}
              </dd>
            </div>
            <div>
              <dt>Poids théorique</dt>
              <dd data-testid={`${testIdPrefix}-detail-theo-weight`}>
                {employee.theoreticalMatrixWeightLabel}
              </dd>
            </div>
            <div>
              <dt>Poids effectif</dt>
              <dd data-testid={`${testIdPrefix}-detail-eff-weight`}>
                {employee.effectiveMatrixWeightLabel}
              </dd>
            </div>
            <div>
              <dt>Poids d’allocation</dt>
              <dd data-testid={`${testIdPrefix}-detail-alloc-weight`}>
                {employee.allocationWeightLabel}
              </dd>
            </div>
            <div>
              <dt>Taux théorique</dt>
              <dd data-testid={`${testIdPrefix}-detail-theo-rate`}>
                {employee.theoreticalIncreaseRateLabel}
              </dd>
            </div>
            <div>
              <dt>Montant théorique</dt>
              <dd data-testid={`${testIdPrefix}-detail-theo-amount`}>
                {employee.theoreticalIncreaseAmountLabel}
              </dd>
            </div>
            <div>
              <dt>Politique d’arrondi</dt>
              <dd data-testid={`${testIdPrefix}-detail-rounding`}>
                {roundingMode} / pas {roundingStepLabel}
              </dd>
            </div>
            <div>
              <dt>Montant final</dt>
              <dd data-testid={`${testIdPrefix}-detail-final-increase`}>
                {formatFcfaInteger(employee.finalRoundedIncreaseAmountFcfa)}
              </dd>
            </div>
            <div>
              <dt>Écart individuel</dt>
              <dd>{employee.individualRoundingDeltaLabel}</dd>
            </div>
            <div>
              <dt>Nouveau salaire</dt>
              <dd data-testid={`${testIdPrefix}-detail-final-salary`}>
                {formatFcfaInteger(employee.finalSalaryFcfa)}
              </dd>
            </div>
            <div>
              <dt>Raison de blocage</dt>
              <dd>
                {employee.blockingReason === "CONFIRMED_UNDERPERFORMER"
                  ? "Sous-performant confirmé (montant final = 0)"
                  : (employee.blockingReason ?? "Aucune")}
              </dd>
            </div>
          </dl>

          {employee.months && employee.months.length > 0 ? (
            <details
              data-testid={`${testIdPrefix}-detail-months`}
              open
            >
              <summary>Trajectoire mensuelle (janvier → décembre)</summary>
              <div className="data-table-wrap data-table-wrap--scroll-x">
                <table
                  className="data-table data-table--compact"
                  data-testid={`${testIdPrefix}-detail-months-table`}
                >
                  <thead>
                    <tr>
                      <th scope="col">Mois</th>
                      <th scope="col">Salaire de base</th>
                      <th scope="col">Grade</th>
                      <th scope="col">Famille</th>
                      <th scope="col">Taux complément</th>
                      <th scope="col">Complément théorique</th>
                      <th scope="col">Plancher minimum</th>
                      <th scope="col">Au-dessus du minimum</th>
                      <th scope="col">Complément arrondi</th>
                      <th scope="col">Coût promotion</th>
                      <th scope="col">Salaire final</th>
                      <th scope="col">Taux ancienneté</th>
                      <th scope="col">Ancienneté totale</th>
                      <th scope="col">Période couverte</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employee.months.map((month) => (
                      <tr
                        key={month.month}
                        data-testid={`${testIdPrefix}-detail-month-${month.month}`}
                      >
                        <td>{month.monthLabel}</td>
                        <td>{month.baseSalaryLabel}</td>
                        <td>{month.gradeCode}</td>
                        <td>{month.jobFamilyCode}</td>
                        <td>{month.compensatoryComplementRateLabel}</td>
                        <td>{month.theoreticalCompensatoryComplementLabel}</td>
                        <td>{month.minimumComplementFloorLabel}</td>
                        <td>{month.actualComplementAboveMinimumLabel}</td>
                        <td>{month.roundedCompensatoryComplementLabel}</td>
                        <td>{month.promotionBudgetCostLabel}</td>
                        <td>{month.finalSalaryLabel}</td>
                        <td>{month.seniorityRateLabel}</td>
                        <td>{month.totalSeniorityImpactLabel}</td>
                        <td>{month.coveredByCampaignPeriod ? "Oui" : "Non"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : mode === "persisted-readonly" ? (
            <p
              className="muted"
              data-testid={`${testIdPrefix}-detail-months-unavailable`}
            >
              Trajectoire mensuelle non disponible pour ce snapshot.
            </p>
          ) : null}

          <details data-testid={`${testIdPrefix}-detail-trace`}>
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
