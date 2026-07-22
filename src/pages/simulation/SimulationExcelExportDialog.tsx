/** Dialogue d’export Excel RH d’une simulation persistée (Lot 2B-E1). */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { PersistedSimulationRunSummary } from "../../application/campaignSimulation/simulationPersistenceModels";
import {
  EXPORT_UNPROTECTED_CONFIRMATION_MESSAGE,
  EXPORT_UNPROTECTED_WARNING,
  validateExportPasswordOptions,
} from "../../application/campaignSimulation/hrExcelExportErrorMessages";

export interface SimulationExcelExportSubmitOptions {
  protect: boolean;
  password: string;
  confirmUnprotected: boolean;
}

interface SimulationExcelExportDialogProps {
  open: boolean;
  run: PersistedSimulationRunSummary;
  exporting: boolean;
  onClose: () => void;
  onExport: (options: SimulationExcelExportSubmitOptions) => void | Promise<void>;
  onGeneratePassword: () => Promise<string>;
  statusMessage?: string | null;
  statusTone?: "success" | "error" | null;
  initialFocusRef?: RefObject<HTMLInputElement | null>;
}

export function SimulationExcelExportDialog({
  open,
  run,
  exporting,
  onClose,
  onExport,
  onGeneratePassword,
  statusMessage,
  statusTone,
  initialFocusRef,
}: SimulationExcelExportDialogProps) {
  const [protect, setProtect] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [confirmUnprotected, setConfirmUnprotected] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(
    null,
  );

  const baseId = useId();
  const protectId = `${baseId}-protect`;
  const passwordId = `${baseId}-password`;
  const confirmId = `${baseId}-confirm`;
  const unprotectedId = `${baseId}-unprotected`;
  const titleId = `${baseId}-title`;

  const fallbackFocusRef = useRef<HTMLInputElement | null>(null);
  const protectFocusRef = initialFocusRef ?? fallbackFocusRef;

  const resetState = useCallback(() => {
    setProtect(true);
    setPassword("");
    setConfirmation("");
    setConfirmUnprotected(false);
    setShowPassword(false);
    setValidationMessage(null);
  }, []);

  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open, resetState]);

  useEffect(() => {
    if (open) {
      protectFocusRef.current?.focus();
    }
  }, [open, protectFocusRef]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !exporting) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, exporting, onClose]);

  if (!open) {
    return null;
  }

  const handleGeneratePassword = async () => {
    const generated = await onGeneratePassword();
    if (generated) {
      setPassword(generated);
      setConfirmation(generated);
      setShowPassword(true);
      setValidationMessage(null);
    }
  };

  const handleSubmit = async () => {
    if (exporting) return;

    if (protect) {
      const validation = validateExportPasswordOptions({
        protect: true,
        password,
        confirmation,
      });
      if (!validation.ok) {
        setValidationMessage(validation.message);
        return;
      }
    } else if (!confirmUnprotected) {
      setValidationMessage(EXPORT_UNPROTECTED_CONFIRMATION_MESSAGE);
      return;
    }

    setValidationMessage(null);
    await onExport({
      protect,
      password: protect ? password : "",
      confirmUnprotected: protect ? false : confirmUnprotected,
    });
  };

  return (
    <div
      className="app-modal-backdrop"
      role="presentation"
      data-testid="simulation-excel-export-dialog"
      onClick={() => {
        if (!exporting) onClose();
      }}
    >
      <div
        className="app-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="app-modal__header">
          <h2 id={titleId}>Exporter le rapport RH</h2>
        </div>

        <div className="app-modal__body">
          <p className="muted">
            Simulation n°{run.runNumber} — {run.campaignName} ({run.campaignYear})
          </p>

          <label className="field field--checkbox" htmlFor={protectId}>
            <input
              ref={protectFocusRef}
              id={protectId}
              type="checkbox"
              data-testid="simulation-excel-export-protect"
              checked={protect}
              disabled={exporting}
              onChange={(event) => {
                setProtect(event.target.checked);
                setValidationMessage(null);
              }}
            />
            Protéger le fichier par mot de passe
          </label>

          {protect ? (
            <>
              <label className="field" htmlFor={passwordId}>
                Mot de passe
                <div className="app-modal__password-row">
                  <input
                    id={passwordId}
                    type={showPassword ? "text" : "password"}
                    data-testid="simulation-excel-export-password"
                    value={password}
                    disabled={exporting}
                    autoComplete="new-password"
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setValidationMessage(null);
                    }}
                  />
                  <button
                    type="button"
                    className="button button--secondary"
                    data-testid="simulation-excel-export-toggle-visibility"
                    aria-label={
                      showPassword
                        ? "Masquer le mot de passe"
                        : "Afficher le mot de passe"
                    }
                    aria-pressed={showPassword}
                    disabled={exporting}
                    onClick={() => {
                      setShowPassword((current) => !current);
                    }}
                  >
                    {showPassword ? "Masquer" : "Afficher"}
                  </button>
                </div>
              </label>

              <label className="field" htmlFor={confirmId}>
                Confirmer le mot de passe
                <input
                  id={confirmId}
                  type={showPassword ? "text" : "password"}
                  data-testid="simulation-excel-export-password-confirm"
                  value={confirmation}
                  disabled={exporting}
                  autoComplete="new-password"
                  onChange={(event) => {
                    setConfirmation(event.target.value);
                    setValidationMessage(null);
                  }}
                />
              </label>

              <button
                type="button"
                className="button button--secondary"
                data-testid="simulation-excel-export-generate"
                disabled={exporting}
                onClick={() => {
                  void handleGeneratePassword();
                }}
              >
                Générer un mot de passe
              </button>
            </>
          ) : (
            <>
              <p
                className="form-feedback form-feedback--warning"
                role="alert"
                data-testid="simulation-excel-export-warning"
              >
                {EXPORT_UNPROTECTED_WARNING}
              </p>
              <label className="field field--checkbox" htmlFor={unprotectedId}>
                <input
                  id={unprotectedId}
                  type="checkbox"
                  data-testid="simulation-excel-export-confirm-unprotected"
                  checked={confirmUnprotected}
                  disabled={exporting}
                  onChange={(event) => {
                    setConfirmUnprotected(event.target.checked);
                    setValidationMessage(null);
                  }}
                />
                Je confirme l’export sans protection
              </label>
            </>
          )}

          {validationMessage ? (
            <p
              className="form-feedback form-feedback--error"
              role="alert"
              data-testid="simulation-excel-export-validation"
            >
              {validationMessage}
            </p>
          ) : null}

          <p
            className="form-feedback"
            role="status"
            aria-live="polite"
            data-testid="simulation-excel-export-status"
            data-tone={statusTone ?? undefined}
          >
            {statusMessage ?? ""}
          </p>
        </div>

        <div className="app-modal__footer">
          <button
            type="button"
            className="button button--secondary"
            data-testid="simulation-excel-export-cancel"
            disabled={exporting}
            onClick={onClose}
          >
            Annuler
          </button>
          <button
            type="button"
            className="button button--primary"
            data-testid="simulation-excel-export-submit"
            aria-busy={exporting}
            disabled={exporting}
            onClick={() => {
              void handleSubmit();
            }}
          >
            {exporting ? "Export en cours…" : "Exporter"}
          </button>
        </div>
      </div>
    </div>
  );
}
