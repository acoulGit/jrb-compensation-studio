import { useEffect, useState, type FormEvent } from "react";
import { useAppData } from "../app/AppDataProvider";
import { PageHeader } from "../components/ui/PageHeader";
import { SectionCard } from "../components/ui/SectionCard";
import type { OrganizationProfileInput } from "../infrastructure/database/types";
import { pageDefinitions } from "./pageDefinitions";
import { changeLocalPassword, lockLocalAccess } from "../application/localAccess";

function toFormValues(
  organization: OrganizationProfileInput,
): OrganizationProfileInput {
  return {
    productName: organization.productName,
    organizationName: organization.organizationName,
    organizationShortName: organization.organizationShortName,
    applicationSubtitle: organization.applicationSubtitle,
    reportFooter: organization.reportFooter,
  };
}

export function SettingsPage() {
  const { organization, saveOrganization } = useAppData();
  const definition = pageDefinitions.settings;
  const [form, setForm] = useState<OrganizationProfileInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (organization) {
      setForm(toFormValues(organization));
    }
  }, [organization]);

  if (!organization || !form) {
    return null;
  }

  const isDirty =
    form.productName !== organization.productName ||
    form.organizationName !== organization.organizationName ||
    form.organizationShortName !== organization.organizationShortName ||
    form.applicationSubtitle !== organization.applicationSubtitle ||
    form.reportFooter !== organization.reportFooter;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !form) return;

    const payload = form;
    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      await saveOrganization(payload);
      setSuccessMessage("Identité de l’organisation enregistrée.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "L’enregistrement a échoué.",
      );
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    if (!organization) return;
    setForm(toFormValues(organization));
    setSuccessMessage(null);
    setErrorMessage(null);
  }

  return (
    <>
      <PageHeader title={definition.title} description={definition.description} />
      <SectionCard
        title="Identité de l’organisation"
        description="Ces informations sont stockées localement et utilisées dans l’en-tête, les rapports et la page À propos."
      >
        <form className="form-grid" onSubmit={handleSubmit} noValidate>
          <label className="field">
            <span>Nom du produit</span>
            <input
              value={form.productName}
              onChange={(event) =>
                setForm({ ...form, productName: event.target.value })
              }
              required
            />
          </label>
          <label className="field">
            <span>Nom complet de l’organisation</span>
            <input
              value={form.organizationName}
              onChange={(event) =>
                setForm({ ...form, organizationName: event.target.value })
              }
              required
            />
          </label>
          <label className="field">
            <span>Nom court</span>
            <input
              value={form.organizationShortName}
              onChange={(event) =>
                setForm({ ...form, organizationShortName: event.target.value })
              }
              required
            />
          </label>
          <label className="field">
            <span>Sous-titre de l’application</span>
            <input
              value={form.applicationSubtitle}
              onChange={(event) =>
                setForm({ ...form, applicationSubtitle: event.target.value })
              }
              required
            />
          </label>
          <label className="field field--full">
            <span>Pied de page des rapports</span>
            <input
              value={form.reportFooter}
              onChange={(event) =>
                setForm({ ...form, reportFooter: event.target.value })
              }
              required
            />
          </label>

          {successMessage && (
            <p className="form-feedback form-feedback--success" role="status">
              {successMessage}
            </p>
          )}
          {errorMessage && (
            <p className="form-feedback form-feedback--error" role="alert">
              {errorMessage}
            </p>
          )}

          <div className="form-actions field--full">
            <button
              type="submit"
              className="button button--primary"
              disabled={saving || !isDirty}
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={handleReset}
              disabled={saving || !isDirty}
            >
              Annuler
            </button>
          </div>
        </form>
      </SectionCard>
      <SecuritySection />
    </>
  );
}

function SecuritySection() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState("");
  const [changing, setChanging] = useState(false);
  const [changeSuccess, setChangeSuccess] = useState<string | null>(null);
  const [changeError, setChangeError] = useState<string | null>(null);

  const [locking, setLocking] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (changing) return;
    setChanging(true);
    setChangeSuccess(null);
    setChangeError(null);

    const outcome = await changeLocalPassword({
      oldPassword,
      newPassword,
      newPasswordConfirmation,
    });
    setOldPassword("");
    setNewPassword("");
    setNewPasswordConfirmation("");
    setChanging(false);

    if (!outcome.ok) {
      setChangeError(outcome.message);
      return;
    }
    setChangeSuccess("Le mot de passe a été modifié.");
  }

  async function handleLock() {
    if (locking) return;
    setLocking(true);
    setLockError(null);

    const outcome = await lockLocalAccess();
    setLocking(false);

    if (!outcome.ok) {
      setLockError(outcome.message);
    }
  }

  return (
    <SectionCard
      title="Sécurité"
      description="Le mot de passe local protège l’accès à l’application sur ce poste. Il n’est jamais transmis en dehors de cet ordinateur."
    >
      <form className="form-grid" onSubmit={handleChangePassword} noValidate>
        <label className="field field--full">
          <span>Ancien mot de passe</span>
          <input
            type="password"
            autoComplete="current-password"
            value={oldPassword}
            onChange={(event) => setOldPassword(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Nouveau mot de passe</span>
          <input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            minLength={8}
            maxLength={128}
            required
          />
        </label>
        <label className="field">
          <span>Confirmer le nouveau mot de passe</span>
          <input
            type="password"
            autoComplete="new-password"
            value={newPasswordConfirmation}
            onChange={(event) => setNewPasswordConfirmation(event.target.value)}
            minLength={8}
            maxLength={128}
            required
          />
        </label>

        {changeSuccess && (
          <p className="form-feedback form-feedback--success field--full" role="status">
            {changeSuccess}
          </p>
        )}
        {changeError && (
          <p className="form-feedback form-feedback--error field--full" role="alert">
            {changeError}
          </p>
        )}

        <div className="form-actions field--full">
          <button type="submit" className="button button--primary" disabled={changing}>
            {changing ? "Modification…" : "Modifier le mot de passe"}
          </button>
        </div>
      </form>

      <div className="form-actions" style={{ marginTop: 8 }}>
        {lockError && (
          <p className="form-feedback form-feedback--error" role="alert">
            {lockError}
          </p>
        )}
        <button
          type="button"
          className="button button--secondary"
          onClick={() => void handleLock()}
          disabled={locking}
        >
          {locking ? "Verrouillage…" : "Verrouiller l’application"}
        </button>
      </div>
    </SectionCard>
  );
}
