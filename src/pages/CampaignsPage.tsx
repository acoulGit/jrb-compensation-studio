import { useMemo, useState, type FormEvent } from "react";
import { useAppData } from "../app/AppDataProvider";
import {
  campaignStatusLabel,
  campaignStatusTone,
  formatDateTime,
} from "../app/formatters";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { SectionCard } from "../components/ui/SectionCard";
import { StatusBadge } from "../components/ui/StatusBadge";
import type {
  Campaign,
  CampaignDraftInput,
} from "../infrastructure/database/types";
import type { CampaignListFilter } from "../services/campaignService";
import { pageDefinitions } from "./pageDefinitions";

const emptyDraft: CampaignDraftInput = {
  name: "",
  referenceYear: new Date().getFullYear(),
  notes: "",
};

type EditorMode = "closed" | "create" | "edit";

export function CampaignsPage() {
  const {
    campaigns,
    createCampaign,
    updateCampaign,
    activateCampaign,
    archiveCampaign,
    restoreCampaign,
  } = useAppData();
  const definition = pageDefinitions.campaigns;
  const [filter, setFilter] = useState<CampaignListFilter>("current");
  const [editorMode, setEditorMode] = useState<EditorMode>("closed");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<CampaignDraftInput>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const visibleCampaigns = useMemo(() => {
    if (filter === "all") return campaigns;
    if (filter === "archived") {
      return campaigns.filter((campaign) => campaign.status === "archived");
    }
    return campaigns.filter((campaign) => campaign.status !== "archived");
  }, [campaigns, filter]);

  function openCreate() {
    setEditorMode("create");
    setEditingId(null);
    setDraft({
      ...emptyDraft,
      referenceYear: new Date().getFullYear(),
    });
    setSuccessMessage(null);
    setErrorMessage(null);
  }

  function openEdit(campaign: Campaign) {
    setEditorMode("edit");
    setEditingId(campaign.id);
    setDraft({
      name: campaign.name,
      referenceYear: campaign.referenceYear,
      notes: campaign.notes,
    });
    setSuccessMessage(null);
    setErrorMessage(null);
  }

  function closeEditor() {
    setEditorMode("closed");
    setEditingId(null);
    setDraft(emptyDraft);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      if (editorMode === "create") {
        await createCampaign(draft);
        setSuccessMessage("Campagne créée.");
      } else if (editorMode === "edit" && editingId !== null) {
        await updateCampaign(editingId, draft);
        setSuccessMessage("Campagne mise à jour.");
      }
      closeEditor();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "L’opération a échoué.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function runAction(
    action: () => Promise<unknown>,
    success: string,
    confirmMessage?: string,
  ) {
    if (busy) return;
    if (confirmMessage && !window.confirm(confirmMessage)) {
      return;
    }

    setBusy(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      await action();
      setSuccessMessage(success);
      closeEditor();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "L’opération a échoué.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={definition.title} description={definition.description} />

      <div className="toolbar">
        <div className="filter-group" role="group" aria-label="Filtres campagnes">
          {(
            [
              ["current", "Campagnes en cours"],
              ["archived", "Archives"],
              ["all", "Toutes"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`filter-chip${filter === value ? " filter-chip--active" : ""}`}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="button button--primary"
          onClick={openCreate}
          disabled={busy}
        >
          Nouvelle campagne
        </button>
      </div>

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

      {editorMode !== "closed" && (
        <SectionCard
          title={
            editorMode === "create"
              ? "Nouvelle campagne"
              : "Modifier la campagne"
          }
          description="Seuls le nom, l’année de référence et les notes internes sont gérés dans ce lot."
        >
          <form className="form-grid" onSubmit={handleSubmit} noValidate>
            <label className="field">
              <span>Nom de la campagne</span>
              <input
                value={draft.name}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
                required
              />
            </label>
            <label className="field">
              <span>Année de référence</span>
              <input
                type="number"
                min={2000}
                max={2100}
                value={draft.referenceYear}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    referenceYear: Number(event.target.value),
                  })
                }
                required
              />
            </label>
            <label className="field field--full">
              <span>Notes internes (facultatif)</span>
              <textarea
                rows={3}
                value={draft.notes}
                onChange={(event) =>
                  setDraft({ ...draft, notes: event.target.value })
                }
              />
            </label>
            <div className="form-actions field--full">
              <button
                type="submit"
                className="button button--primary"
                disabled={busy}
              >
                {busy ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button
                type="button"
                className="button button--secondary"
                onClick={closeEditor}
                disabled={busy}
              >
                Annuler
              </button>
            </div>
          </form>
        </SectionCard>
      )}

      <SectionCard title="Liste des campagnes">
        {visibleCampaigns.length === 0 ? (
          <EmptyState
            title={definition.emptyTitle}
            description={
              filter === "archived"
                ? "Aucune campagne archivée pour le moment."
                : definition.emptyDescription
            }
            plannedFeatures={definition.plannedFeatures}
          />
        ) : (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Nom</th>
                  <th scope="col">Année</th>
                  <th scope="col">Statut</th>
                  <th scope="col">Dernière modification</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleCampaigns.map((campaign) => {
                  const archived = campaign.status === "archived";
                  return (
                    <tr key={campaign.id}>
                      <td>{campaign.name}</td>
                      <td>{campaign.referenceYear}</td>
                      <td>
                        <StatusBadge tone={campaignStatusTone(campaign.status)}>
                          {campaignStatusLabel(campaign.status)}
                        </StatusBadge>
                      </td>
                      <td>{formatDateTime(campaign.updatedAt)}</td>
                      <td>
                        <div className="row-actions">
                          {!archived && (
                            <>
                              <button
                                type="button"
                                className="button button--ghost"
                                disabled={busy}
                                onClick={() => openEdit(campaign)}
                              >
                                Modifier
                              </button>
                              {campaign.status !== "active" && (
                                <button
                                  type="button"
                                  className="button button--ghost"
                                  disabled={busy}
                                  onClick={() =>
                                    void runAction(
                                      () => activateCampaign(campaign.id),
                                      "Campagne activée.",
                                    )
                                  }
                                >
                                  Activer
                                </button>
                              )}
                              <button
                                type="button"
                                className="button button--ghost"
                                disabled={busy}
                                onClick={() =>
                                  void runAction(
                                    () => archiveCampaign(campaign.id),
                                    "Campagne archivée.",
                                    `Archiver la campagne « ${campaign.name} » ?`,
                                  )
                                }
                              >
                                Archiver
                              </button>
                            </>
                          )}
                          {archived && (
                            <button
                              type="button"
                              className="button button--ghost"
                              disabled={busy}
                              onClick={() =>
                                void runAction(
                                  () => restoreCampaign(campaign.id),
                                  "Campagne restaurée.",
                                )
                              }
                            >
                              Restaurer
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </>
  );
}
