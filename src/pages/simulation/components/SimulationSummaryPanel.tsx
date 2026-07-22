/** Synthèse de simulation partagée courant / historique (Lot 2B-4B). */

import { campaignStatusLabel, formatDateTime } from "../../../app/formatters";
import { nineBoxModeLabel } from "../../../domain/compensationReference/conversions";
import { RESULT_SCHEMA_VERSION_V4 } from "../../../domain/compensationCalculation";
import type { SimulationSummaryViewModel } from "../../../application/campaignSimulation/simulationViewModels";

interface SimulationSummaryPanelProps {
  summary: SimulationSummaryViewModel;
  testIdPrefix?: string;
}

const UNAVAILABLE_LABEL = "Non disponible";

function monthOrUnavailable(month: number | null | undefined): string {
  return month === null || month === undefined ? UNAVAILABLE_LABEL : String(month);
}

function labelOrUnavailable(label: string | null | undefined): string {
  return label ?? UNAVAILABLE_LABEL;
}

export function SimulationSummaryPanel({
  summary,
  testIdPrefix = "simulation",
}: SimulationSummaryPanelProps) {
  const showSchemaV3Section = summary.mode === "persisted-readonly";
  // Sémantique historique v4 (Lot 2B-RC1-H1) : « neutralisé » plutôt que
  // « en cours de confirmation » (aucun coefficient provisoire à l’époque).
  const isLegacyNineBoxNeutralizationSchema =
    summary.mode === "persisted-readonly" &&
    summary.resultSchemaVersion === RESULT_SCHEMA_VERSION_V4;
  return (
    <>
      {summary.schemaCompatibilityMessage ? (
        <p
          className="form-feedback form-feedback--warning"
          role="status"
          data-testid={`${testIdPrefix}-summary-compat`}
          data-compatibility={summary.schemaCompatibility}
        >
          {summary.schemaCompatibilityMessage}
        </p>
      ) : null}
      <dl className="detail-list" data-testid={`${testIdPrefix}-summary`}>
      <div>
        <dt>Campagne</dt>
        <dd>
          {summary.campaignName}
          {summary.campaignYear ? ` (${summary.campaignYear})` : ""}
        </dd>
      </div>
      {summary.campaignStatusAtRun ? (
        <div>
          <dt>Statut campagne au moment du run</dt>
          <dd data-testid={`${testIdPrefix}-summary-campaign-status`}>
            {campaignStatusLabel(summary.campaignStatusAtRun)}
          </dd>
        </div>
      ) : null}
      <div>
        <dt>Mode d’évaluation</dt>
        <dd>{nineBoxModeLabel(summary.evaluationMode)}</dd>
      </div>
      {summary.runNumber !== undefined ? (
        <div>
          <dt>N° de simulation</dt>
          <dd data-testid={`${testIdPrefix}-summary-run-number`}>
            {summary.runNumber}
          </dd>
        </div>
      ) : null}
      {summary.createdAt ? (
        <div>
          <dt>Date d’enregistrement</dt>
          <dd data-testid={`${testIdPrefix}-summary-created-at`}>
            {formatDateTime(summary.createdAt)}
          </dd>
        </div>
      ) : null}
      <div>
        <dt>Population calculée</dt>
        <dd data-testid={`${testIdPrefix}-summary-employee-count`}>
          {summary.employeeCount}
        </dd>
      </div>
      <div>
        <dt>Mode de budget</dt>
        <dd>{summary.budgetTargetMode}</dd>
      </div>
      {summary.manualBudgetLabel ? (
        <div>
          <dt>Budget manuel</dt>
          <dd>{summary.manualBudgetLabel}</dd>
        </div>
      ) : null}
      {summary.eligiblePayrollLabel ? (
        <div>
          <dt>Masse salariale éligible</dt>
          <dd>{summary.eligiblePayrollLabel}</dd>
        </div>
      ) : null}
      {summary.budgetRateLabel ? (
        <div>
          <dt>Taux budgétaire</dt>
          <dd>{summary.budgetRateLabel}</dd>
        </div>
      ) : null}
      <div>
        <dt>Budget cible exact</dt>
        <dd data-testid={`${testIdPrefix}-summary-budget-target`}>
          {summary.budgetTargetLabel}
        </dd>
      </div>
      <div>
        <dt>Politique d’arrondi</dt>
        <dd>
          {summary.roundingMode} / pas {summary.roundingStepLabel}
        </dd>
      </div>
      <div>
        <dt>Montant théorique total</dt>
        <dd data-testid={`${testIdPrefix}-summary-theoretical`}>
          {summary.theoreticalAllocatedTotalLabel}
        </dd>
      </div>
      <div>
        <dt>Coût réel après arrondi</dt>
        <dd data-testid={`${testIdPrefix}-summary-actual`}>
          {summary.actualOperationAmountLabel}
        </dd>
      </div>
      <div>
        <dt>Écart total d’arrondi</dt>
        <dd data-testid={`${testIdPrefix}-summary-rounding-delta`}>
          {summary.totalRoundingDeltaLabel}
        </dd>
      </div>
      <div>
        <dt>Salariés à poids positif</dt>
        <dd data-testid={`${testIdPrefix}-summary-positive-weight`}>
          {summary.positiveWeightEmployeeCount}
        </dd>
      </div>
      <div>
        <dt>Salariés à poids nul</dt>
        <dd data-testid={`${testIdPrefix}-summary-zero-weight`}>
          {summary.zeroWeightEmployeeCount}
        </dd>
      </div>
      <div>
        <dt>Sous-performants confirmés</dt>
        <dd data-testid={`${testIdPrefix}-summary-underperformers`}>
          {summary.confirmedUnderperformerCount}
        </dd>
      </div>
      {summary.neutralizeNineBoxEffectEmployeeCount !== undefined &&
      summary.neutralizeNineBoxEffectEmployeeCount !== null ? (
        <div>
          <dt>
            {isLegacyNineBoxNeutralizationSchema
              ? "Salariés avec effet 9-Box neutralisé"
              : "Salariés avec performance en cours de confirmation"}
          </dt>
          <dd data-testid={`${testIdPrefix}-summary-nine-box-neutralized`}>
            {summary.neutralizeNineBoxEffectEmployeeCount}
          </dd>
        </div>
      ) : null}
      {!isLegacyNineBoxNeutralizationSchema &&
      summary.neutralizeNineBoxEffectEmployeeCount !== undefined &&
      summary.neutralizeNineBoxEffectEmployeeCount !== null &&
      summary.neutralizeNineBoxEffectEmployeeCount > 0 ? (
        <div>
          <dt>Coefficient provisoire 9-Box</dt>
          <dd data-testid={`${testIdPrefix}-summary-nine-box-confirmation-factor`}>
            {summary.nineBoxConfirmationFactorLabel ?? UNAVAILABLE_LABEL}
          </dd>
        </div>
      ) : null}
      {summary.runSequence !== undefined ? (
        <div>
          <dt>Séquence d’exécution</dt>
          <dd data-testid={`${testIdPrefix}-summary-run-sequence`}>
            {summary.runSequence}
          </dd>
        </div>
      ) : null}
      {summary.sourceImportFileName || summary.sourceImportBatchId !== null ? (
        <div>
          <dt>Lot RH source</dt>
          <dd data-testid={`${testIdPrefix}-summary-import-batch`}>
            {summary.sourceImportFileName ??
              (summary.sourceImportBatchId !== null
                ? `Lot #${summary.sourceImportBatchId}`
                : "—")}
          </dd>
        </div>
      ) : null}
      {showSchemaV3Section ? (
        <>
          <div>
            <dt>Mois de rétroactivité</dt>
            <dd data-testid={`${testIdPrefix}-summary-retro-month`}>
              {monthOrUnavailable(summary.retroactivityStartMonth)}
            </dd>
          </div>
          <div>
            <dt>Mois d’application technique</dt>
            <dd data-testid={`${testIdPrefix}-summary-technical-month`}>
              {monthOrUnavailable(summary.technicalApplicationMonth)}
            </dd>
          </div>
          <div>
            <dt>Mois couverts par la période d’effet</dt>
            <dd data-testid={`${testIdPrefix}-summary-covered-months`}>
              {monthOrUnavailable(summary.campaignCoveredMonthCount)}
            </dd>
          </div>
          <div>
            <dt>Coût des promotions imputé (période)</dt>
            <dd data-testid={`${testIdPrefix}-summary-period-promotion`}>
              {labelOrUnavailable(summary.periodPromotionBudgetCostLabel)}
            </dd>
          </div>
          <div>
            <dt>Minimum garanti réservé (période)</dt>
            <dd data-testid={`${testIdPrefix}-summary-period-minimum`}>
              {labelOrUnavailable(summary.periodMinimumComplementFloorCostLabel)}
            </dd>
          </div>
          <div>
            <dt>Complément au-dessus du minimum (période)</dt>
            <dd data-testid={`${testIdPrefix}-summary-period-above-minimum`}>
              {labelOrUnavailable(
                summary.periodCompensationAboveMinimumCostLabel,
              )}
            </dd>
          </div>
          <div>
            <dt>Coût effectif combiné (période)</dt>
            <dd data-testid={`${testIdPrefix}-summary-period-combined`}>
              {labelOrUnavailable(summary.periodCombinedActualCostLabel)}
            </dd>
          </div>
          <div>
            <dt>Delta de période</dt>
            <dd data-testid={`${testIdPrefix}-summary-period-delta`}>
              {labelOrUnavailable(summary.periodCombinedRoundingDeltaLabel)}
            </dd>
          </div>
          <div>
            <dt>Coût à plein effet sur 12 mois — combiné</dt>
            <dd data-testid={`${testIdPrefix}-summary-full-year-combined`}>
              {labelOrUnavailable(
                summary.fullYearRunRateCombinedBaseMeasureCostLabel,
              )}
            </dd>
          </div>
        </>
      ) : null}
      {summary.sourceFingerprint && summary.configurationFingerprint ? (
        <details data-testid={`${testIdPrefix}-summary-fingerprints`}>
          <summary>Empreintes techniques</summary>
          <dl className="detail-list">
            <div>
              <dt>sourceFingerprint</dt>
              <dd>
                <code>{summary.sourceFingerprint}</code>
              </dd>
            </div>
            <div>
              <dt>configurationFingerprint</dt>
              <dd>
                <code>{summary.configurationFingerprint}</code>
              </dd>
            </div>
            {summary.resultSchemaVersion !== undefined ? (
              <div>
                <dt>resultSchemaVersion</dt>
                <dd>{summary.resultSchemaVersion}</dd>
              </div>
            ) : null}
          </dl>
        </details>
      ) : null}
      </dl>
    </>
  );
}
