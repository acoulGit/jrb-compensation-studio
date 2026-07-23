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
import { TECHNICAL_APPLICATION_MONTH_LABELS_FR } from "../../../domain/compensationCalculation";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { levelOrNotRequired } from "./simulationViewUtils";

interface SimulationEmployeeDetailDrawerProps {
  employee: SimulationEmployeeViewModel;
  mode: SimulationViewMode;
  roundingMode: string;
  roundingStepLabel: string;
  /** Libellé du coefficient provisoire 9-Box (« 0,900 » ou « Non disponible »). */
  nineBoxConfirmationFactorLabel?: string | null;
  onClose: () => void;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  testIdPrefix?: string;
}

export function SimulationEmployeeDetailDrawer({
  employee,
  mode,
  roundingMode,
  roundingStepLabel,
  nineBoxConfirmationFactorLabel,
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
        className="simulation-drawer simulation-drawer--max"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${testIdPrefix}-employee-drawer-title`}
        data-drawer-width="max"
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
              <dt>
                {employee.nineBoxTreatmentKind === "nine_box_effect_neutralized"
                  ? "Effet 9-Box neutralisé"
                  : "Performance à confirmer"}
              </dt>
              <dd data-testid={`${testIdPrefix}-detail-nine-box-neutralized`}>
                {employee.neutralizeNineBoxEffect === null ||
                employee.neutralizeNineBoxEffect === undefined
                  ? "Non disponible"
                  : employee.neutralizeNineBoxEffect
                    ? "Oui"
                    : "Non"}
              </dd>
            </div>
            <div>
              <dt>Code 9-Box source</dt>
              <dd data-testid={`${testIdPrefix}-detail-source-nine-box`}>
                {employee.sourceNineBoxCode == null
                  ? employee.neutralizeNineBoxEffect === null ||
                    employee.neutralizeNineBoxEffect === undefined
                    ? "Non disponible"
                    : "—"
                  : String(employee.sourceNineBoxCode)}
              </dd>
            </div>
            <div>
              <dt>Traitement 9-Box appliqué</dt>
              <dd data-testid={`${testIdPrefix}-detail-nine-box-treatment`}>
                {employee.nineBoxTreatmentLabel ??
                  (employee.neutralizeNineBoxEffect === null ||
                  employee.neutralizeNineBoxEffect === undefined
                    ? "Non disponible"
                    : "—")}
              </dd>
            </div>
            {employee.nineBoxTreatmentKind === "performance_pending_confirmation" ? (
              <>
                <div>
                  <dt>Coefficient provisoire 9-Box</dt>
                  <dd data-testid={`${testIdPrefix}-detail-nine-box-confirmation-factor`}>
                    {nineBoxConfirmationFactorLabel ?? "Non disponible"}
                  </dd>
                </div>
                <div>
                  <dt>Coefficient appliqué</dt>
                  <dd data-testid={`${testIdPrefix}-detail-nine-box-applied-factor`}>
                    {employee.evaluationFactorLabel}
                  </dd>
                </div>
              </>
            ) : null}
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
            <div data-testid={`${testIdPrefix}-detail-minimum-temporality`}>
              <dt>Mois de rétroactivité générale</dt>
              <dd>
                {employee.retroactivityStartMonth != null
                  ? TECHNICAL_APPLICATION_MONTH_LABELS_FR[
                      employee.retroactivityStartMonth - 1
                    ]
                  : "Non disponible"}
              </dd>
            </div>
            <div>
              <dt>Mois technique</dt>
              <dd>
                {employee.technicalApplicationMonth != null
                  ? TECHNICAL_APPLICATION_MONTH_LABELS_FR[
                      employee.technicalApplicationMonth - 1
                    ]
                  : "Non disponible"}
              </dd>
            </div>
            {employee.socialMechanismKind === "minimum_guaranteed" ? (
              <>
                <div>
                  <dt>Mois d’effet du minimum garanti</dt>
                  <dd data-testid={`${testIdPrefix}-detail-minimum-effective-month`}>
                    {employee.minimumGuaranteeEffectiveMonthLabel
                      ? employee.minimumGuaranteeEffectiveMonthOrigin ===
                        "legacy_retroactivity"
                        ? `${employee.minimumGuaranteeEffectiveMonthLabel} — historique aligné sur la rétroactivité`
                        : employee.minimumGuaranteeEffectiveMonthLabel
                      : "Non disponible"}
                  </dd>
                </div>
                <div>
                  <dt>Rappel du minimum garanti</dt>
                  <dd data-testid={`${testIdPrefix}-detail-minimum-reminder`}>
                    {employee.minimumCompensatoryReminderLabel ?? "Non disponible"}
                  </dd>
                </div>
                <div>
                  <dt>Rappel au-dessus du minimum</dt>
                  <dd data-testid={`${testIdPrefix}-detail-above-minimum-reminder`}>
                    {employee.aboveMinimumCompensatoryReminderLabel ??
                      "Non disponible"}
                  </dd>
                </div>
              </>
            ) : null}
            {employee.socialMechanismKind === "universal_fixed_amount" ? (
              <>
                <div>
                  <dt>Éligibilité au forfait social universel</dt>
                  <dd data-testid={`${testIdPrefix}-detail-forfait-eligibility`}>
                    {employee.universalFixedAmountEligibilityLabel ??
                      "Non disponible"}
                  </dd>
                </div>
                <div>
                  <dt>Montant mensuel du forfait</dt>
                  <dd data-testid={`${testIdPrefix}-detail-forfait-amount`}>
                    {employee.universalFixedAmountMonthlyAmountLabel ??
                      "Non disponible"}
                  </dd>
                </div>
                <div>
                  <dt>Mois d’effet du forfait</dt>
                  <dd data-testid={`${testIdPrefix}-detail-forfait-effective-month`}>
                    {employee.universalFixedAmountEffectiveMonthLabel ??
                      "Non disponible"}
                  </dd>
                </div>
                <div>
                  <dt>Date de référence de l’ancienneté</dt>
                  <dd
                    data-testid={`${testIdPrefix}-detail-forfait-seniority-reference-date`}
                  >
                    {employee.universalFixedAmountSeniorityReferenceDateLabel ??
                      "Non disponible"}
                  </dd>
                </div>
                <div>
                  <dt>Coût forfait sur la période</dt>
                  <dd data-testid={`${testIdPrefix}-detail-forfait-period-cost`}>
                    {employee.campaignPeriodUniversalFixedAmountCostLabel ??
                      "Non disponible"}
                  </dd>
                </div>
                <div>
                  <dt>Rappel du forfait social universel</dt>
                  <dd data-testid={`${testIdPrefix}-detail-forfait-reminder`}>
                    {employee.universalFixedAmountReminderLabel ?? "Non disponible"}
                  </dd>
                </div>
                <div>
                  <dt>Paiement direct restant du forfait</dt>
                  <dd
                    data-testid={`${testIdPrefix}-detail-forfait-remaining-direct`}
                  >
                    {employee.universalFixedAmountRemainingYearDirectCostLabel ??
                      "Non disponible"}
                  </dd>
                </div>
              </>
            ) : null}
            <div>
              <dt>Rappel compensatoire total</dt>
              <dd data-testid={`${testIdPrefix}-detail-total-reminder`}>
                {employee.baseSalaryReminderLabel ?? "Non disponible"}
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
                  className="data-table data-table--compact data-table--trajectory"
                  data-testid={`${testIdPrefix}-detail-months-table`}
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
                        title="Coût promotion"
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
                        title="Incidence d’ancienneté totale"
                      >
                        Anc. totale
                      </th>
                      <th scope="col" title="Mois couvert par la période de campagne">
                        Couvert
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {employee.months.map((month) => (
                      <tr
                        key={month.month}
                        data-testid={`${testIdPrefix}-detail-month-${month.month}`}
                      >
                        <td className="data-table__month">{month.monthLabel}</td>
                        <td className="data-table__num">{month.baseSalaryLabel}</td>
                        <td>{month.gradeCode}</td>
                        <td>{month.jobFamilyCode}</td>
                        <td className="data-table__num">
                          {month.compensatoryComplementRateLabel}
                        </td>
                        <td className="data-table__num">
                          {month.theoreticalCompensatoryComplementLabel}
                        </td>
                        <td className="data-table__num">
                          {month.minimumComplementFloorLabel}
                        </td>
                        <td className="data-table__num">
                          {month.actualComplementAboveMinimumLabel}
                        </td>
                        <td className="data-table__num">
                          {month.roundedCompensatoryComplementLabel}
                        </td>
                        <td className="data-table__num">
                          {month.promotionBudgetCostLabel}
                        </td>
                        <td className="data-table__num">{month.finalSalaryLabel}</td>
                        <td className="data-table__num">{month.seniorityRateLabel}</td>
                        <td className="data-table__num">
                          {month.totalSeniorityImpactLabel}
                        </td>
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
