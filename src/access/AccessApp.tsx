import { useCallback, useEffect, useState, type FormEvent } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  getLocalAccessStatus,
  setupLocalAccess,
  unlockLocalAccess,
  type LocalAccessStatusDto,
} from "../application/localAccess";
import "../styles/global.css";

type AccessScreen = "loading" | "setup" | "unlock" | "expired" | "clockAnomaly" | "error";

function screenForStatus(status: LocalAccessStatusDto): AccessScreen {
  if (status.clockAnomalyDetected) return "clockAnomaly";
  if (!status.isSetUp) return "setup";
  if (status.isExpired) return "expired";
  return "unlock";
}

function formatValidUntil(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

async function quitApplication() {
  try {
    await getCurrentWindow().close();
  } catch {
    // Fenêtre déjà fermée ou API indisponible hors Tauri.
  }
}

/**
 * Application de la fenêtre « access » : verrou local par mot de passe.
 *
 * N’importe JAMAIS `AppDataProvider` ni `getDatabase` : cette fenêtre ne doit
 * jamais précharger la base SQLite métier (voir `docs/LOCAL_ACCESS_SECURITY.md`).
 */
export function AccessApp() {
  const [screen, setScreen] = useState<AccessScreen>("loading");
  const [status, setStatus] = useState<LocalAccessStatusDto | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const nextStatus = await getLocalAccessStatus();
      setStatus(nextStatus);
      setScreen(screenForStatus(nextStatus));
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setScreen("error");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (screen === "loading") {
    return (
      <div className="boot-screen" role="status" aria-live="polite">
        <div className="boot-screen__card">
          <p className="boot-screen__eyebrow">JRB Compensation Studio</p>
          <h1>Vérification de l’accès local…</h1>
        </div>
      </div>
    );
  }

  if (screen === "error") {
    return (
      <div className="boot-screen" role="alert">
        <div className="boot-screen__card boot-screen__card--error">
          <p className="boot-screen__eyebrow">Accès local</p>
          <h1>Impossible de vérifier l’accès</h1>
          <p>{errorMessage ?? "Une erreur inattendue est survenue. Réessayez."}</p>
          <button type="button" className="button button--primary" onClick={() => void refresh()}>
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  if (screen === "clockAnomaly") {
    return (
      <div className="boot-screen" role="alert">
        <div className="boot-screen__card boot-screen__card--error">
          <p className="boot-screen__eyebrow">Anomalie détectée</p>
          <h1>Horloge système suspecte</h1>
          <p>
            La date système semble avoir été modifiée. Vérifiez l’horloge ou contactez JRB
            XSolutions.
          </p>
          {status?.installationId && (
            <p>
              Identifiant d’installation : <strong>{status.installationId}</strong>
            </p>
          )}
          <div className="form-actions">
            <button type="button" className="button button--secondary" onClick={() => void refresh()}>
              Vérifier à nouveau
            </button>
            <button type="button" className="button button--secondary" onClick={() => void quitApplication()}>
              Quitter
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "expired") {
    return (
      <div className="boot-screen" role="alert">
        <div className="boot-screen__card boot-screen__card--error">
          <p className="boot-screen__eyebrow">Période initiale terminée</p>
          <h1>Licence requise</h1>
          <p>Le droit d’utilisation a expiré. Une licence est nécessaire.</p>
          <p>
            L’activation par licence signée sera disponible dans une prochaine version (mécanisme
            de licence).
          </p>
          {status?.currentValidUntil && (
            <p>Droit valide jusqu’au {formatValidUntil(status.currentValidUntil)}.</p>
          )}
          {status?.installationId && (
            <p>
              Identifiant d’installation : <strong>{status.installationId}</strong>
            </p>
          )}
          <div className="form-actions">
            <button type="button" className="button button--secondary" onClick={() => void refresh()}>
              Vérifier à nouveau
            </button>
            <button type="button" className="button button--secondary" onClick={() => void quitApplication()}>
              Quitter
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (screen === "setup") {
    return <SetupScreen onCompleted={refresh} />;
  }

  return <UnlockScreen status={status} onCompleted={refresh} />;
}

function SetupScreen({ onCompleted }: { onCompleted: () => void }) {
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErrorMessage(null);

    const outcome = await setupLocalAccess({
      password,
      passwordConfirmation,
    });
    setPassword("");
    setPasswordConfirmation("");
    setSubmitting(false);

    if (!outcome.ok) {
      setErrorMessage(outcome.message);
      return;
    }
    onCompleted();
  }

  return (
    <div className="boot-screen" role="main">
      <div className="boot-screen__card">
        <p className="boot-screen__eyebrow">JRB Compensation Studio</p>
        <h1>Bienvenue dans JRB Compensation Studio</h1>
        <p>Créez le mot de passe local qui protégera l’accès à cette installation.</p>
        <ul className="boot-screen__hints">
          <li>Minimum 8 caractères (maximum 128).</li>
          <li>Mot de passe local : aucun envoi sur Internet.</li>
          <li>Aucune fonction automatique de récupération dans cette version.</li>
        </ul>
        <form className="form-grid" onSubmit={handleSubmit} noValidate>
          <label className="field field--full">
            <span>Mot de passe</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              maxLength={128}
              required
            />
          </label>
          <label className="field field--full">
            <span>Confirmer le mot de passe</span>
            <input
              type="password"
              autoComplete="new-password"
              value={passwordConfirmation}
              onChange={(event) => setPasswordConfirmation(event.target.value)}
              minLength={8}
              maxLength={128}
              required
            />
          </label>

          {errorMessage && (
            <p className="form-feedback form-feedback--error field--full" role="alert">
              {errorMessage}
            </p>
          )}

          <div className="form-actions field--full">
            <button type="submit" className="button button--primary" disabled={submitting}>
              {submitting ? "Initialisation…" : "Initialiser l’application"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function UnlockScreen({
  status,
  onCompleted,
}: {
  status: LocalAccessStatusDto | null;
  onCompleted: () => void;
}) {
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErrorMessage(null);

    const outcome = await unlockLocalAccess({ password });
    setPassword("");
    setSubmitting(false);

    if (!outcome.ok) {
      setErrorMessage(outcome.message);
      return;
    }
    onCompleted();
  }

  return (
    <div className="boot-screen" role="main">
      <div className="boot-screen__card">
        <p className="boot-screen__eyebrow">Accès local</p>
        <h1>JRB Compensation Studio</h1>
        <p>Saisissez votre mot de passe local pour déverrouiller l’application.</p>
        {status?.installationId && (
          <p>
            Identifiant d’installation : <strong>{status.installationId}</strong>
          </p>
        )}
        {status?.currentValidUntil && (
          <p>Droit valide jusqu’au {formatValidUntil(status.currentValidUntil)}.</p>
        )}
        {typeof status?.remainingDays === "number" && (
          <p>
            {status.remainingDays === 0
              ? "Aucun jour restant."
              : status.remainingDays === 1
                ? "1 jour restant."
                : `${status.remainingDays} jours restants.`}
          </p>
        )}
        <form className="form-grid" onSubmit={handleSubmit} noValidate>
          <label className="field field--full">
            <span>Mot de passe</span>
            <input
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {errorMessage && (
            <p className="form-feedback form-feedback--error field--full" role="alert">
              {errorMessage}
            </p>
          )}

          <div className="form-actions field--full">
            <button type="submit" className="button button--primary" disabled={submitting}>
              {submitting ? "Déverrouillage…" : "Déverrouiller"}
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => void quitApplication()}
            >
              Quitter
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AccessApp;
