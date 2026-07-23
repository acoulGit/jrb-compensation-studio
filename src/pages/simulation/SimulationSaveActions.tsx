/** Actions d’enregistrement explicite sur la page Simulation (Lot 2B-4B). */

import { useEffect, useRef } from "react";
import { useAppNavigation } from "../../app/AppNavigationProvider";
import { useSimulationConfiguration } from "../../app/SimulationConfigurationProvider";
import { useSimulationSave } from "../../app/SimulationSaveProvider";

export function SimulationSaveActions() {
  const { saveState, canSave, savedRunForCurrentResult, saveCurrentResult } =
    useSimulationSave();
  const { selectedCampaignId } = useSimulationConfiguration();
  const { navigateTo } = useAppNavigation();
  const successMessageRef = useRef<HTMLParagraphElement>(null);
  const errorMessageRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (saveState.status === "success" && successMessageRef.current) {
      successMessageRef.current.focus();
    }
  }, [saveState.status, saveState.persistedRunNumber]);

  useEffect(() => {
    if (saveState.status === "error" && errorMessageRef.current) {
      errorMessageRef.current.focus();
    }
  }, [saveState.status, saveState.errorMessage]);

  if (saveState.isAlreadySaved && savedRunForCurrentResult) {
    return (
      <div className="form-actions" data-testid="simulation-save-already-saved">
        <p
          ref={successMessageRef}
          className="form-feedback form-feedback--success"
          role="status"
          aria-live="polite"
          tabIndex={-1}
          data-testid="simulation-save-success"
        >
          Simulation n°{savedRunForCurrentResult.runNumber} enregistrée avec
          succès.
        </p>
        <p className="muted" role="status">
          Déjà enregistrée comme simulation n°
          {savedRunForCurrentResult.runNumber}.
        </p>
        <button
          type="button"
          className="button button--secondary"
          data-testid="simulation-save-open-history"
          onClick={() => {
            navigateTo("simulation-history", {
              simulationHistory: {
                campaignId: selectedCampaignId ?? undefined,
                runId: savedRunForCurrentResult.runId,
              },
            });
          }}
        >
          Consulter dans l’historique
        </button>
      </div>
    );
  }

  if (!canSave && saveState.status === "idle") {
    return null;
  }

  return (
    <div className="form-actions" data-testid="simulation-save-actions">
      {canSave ? (
        <button
          type="button"
          className="button button--secondary"
          data-testid="simulation-save"
          disabled={saveState.status === "saving"}
          onClick={() => {
            void saveCurrentResult();
          }}
        >
          Enregistrer la simulation
        </button>
      ) : null}

      {saveState.status === "saving" ? (
        <p
          className="muted"
          role="status"
          aria-live="polite"
          data-testid="simulation-save-saving"
        >
          Enregistrement en cours…
        </p>
      ) : null}

      {saveState.status === "success" && saveState.persistedRunNumber ? (
        <>
          <p
            ref={successMessageRef}
            className="form-feedback form-feedback--success"
            role="status"
            aria-live="polite"
            tabIndex={-1}
            data-testid="simulation-save-success"
          >
            Simulation n°{saveState.persistedRunNumber} enregistrée avec succès.
          </p>
          <button
            type="button"
            className="button button--secondary"
            data-testid="simulation-save-open-history-after-success"
            onClick={() => {
              navigateTo("simulation-history", {
                simulationHistory: {
                  campaignId: selectedCampaignId ?? undefined,
                  runId: saveState.persistedRunId ?? undefined,
                },
              });
            }}
          >
            Consulter dans l’historique
          </button>
        </>
      ) : null}

      {saveState.status === "error" ? (
        <>
          <p
            ref={errorMessageRef}
            className="form-feedback form-feedback--error"
            role="alert"
            tabIndex={-1}
            data-testid="simulation-save-error"
          >
            {saveState.errorMessage ?? "La simulation n’a pas pu être enregistrée."}
          </p>
          {saveState.issues.length > 0 ? (
            <ul data-testid="simulation-save-error-reasons">
              {saveState.issues.map((issue) => (
                <li key={issue.code}>{issue.message}</li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
