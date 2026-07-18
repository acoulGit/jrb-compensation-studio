import { useEffect, useState, type FormEvent } from "react";
import { useAppData } from "../app/AppDataProvider";
import { PageHeader } from "../components/ui/PageHeader";
import { SectionCard } from "../components/ui/SectionCard";
import type { OrganizationProfileInput } from "../infrastructure/database/types";
import { pageDefinitions } from "./pageDefinitions";

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
    </>
  );
}
