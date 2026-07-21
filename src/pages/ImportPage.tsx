import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import {
  campaignStatusLabel,
  campaignStatusTone,
  formatDateTime,
} from "../app/formatters";
import { useAppData } from "../app/AppDataProvider";
import { useCompensationReference } from "../app/CompensationReferenceProvider";
import { useHrImport } from "../app/HrImportProvider";
import {
  CONTRACT_TYPE_LABELS,
  EMPLOYMENT_STATUS_LABELS,
  OPTIONAL_IMPORT_COLUMNS,
  REQUIRED_IMPORT_COLUMNS,
  type HrImportColumnKey,
  type NormalizedImportRow,
} from "../domain/hrImport/models";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { SectionCard } from "../components/ui/SectionCard";
import { StatusBadge } from "../components/ui/StatusBadge";
import { pageDefinitions } from "./pageDefinitions";

type ImportTab = "new" | "population" | "history";
type PreviewFilter = "all" | "valid" | "errors" | "warnings";

const ALL_COLUMNS = [...REQUIRED_IMPORT_COLUMNS, ...OPTIONAL_IMPORT_COLUMNS];

export function ImportPage() {
  const { campaigns } = useAppData();
  const {
    referenceSet,
    selectedCampaignId: referenceCampaignId,
    selectCampaign: selectReferenceCampaign,
  } = useCompensationReference();
  const {
    selectedCampaignId,
    selectedCampaign,
    isReadOnly,
    workbook,
    sheetName,
    headerRowIndex,
    mapping,
    preview,
    wizardStatus,
    wizardErrorMessage,
    currentBatch,
    batches,
    population,
    populationSummary,
    populationStatus,
    populationSearch,
    populationPage,
    populationPageSize,
    selectCampaign,
    selectFile,
    selectSheet,
    setHeaderRow,
    setMapping,
    rebuildPreview,
    confirmImport,
    resetImport,
    setSearch,
    setPage,
  } = useHrImport();

  const familyDisplayById = useMemo(() => {
    const map = new Map<number, string>();
    for (const family of referenceSet?.jobFamilies ?? []) {
      map.set(family.id, `${family.code} / ${family.label}`);
    }
    return map;
  }, [referenceSet]);

  const gradeDisplayById = useMemo(() => {
    const map = new Map<number, string>();
    for (const grade of referenceSet?.grades ?? []) {
      map.set(grade.id, `${grade.code} / ${grade.label}`);
    }
    return map;
  }, [referenceSet]);

  const [tab, setTab] = useState<ImportTab>("new");
  const [previewFilter, setPreviewFilter] = useState<PreviewFilter>("all");
  const [busy, setBusy] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (
      selectedCampaignId !== null &&
      selectedCampaignId !== referenceCampaignId
    ) {
      selectReferenceCampaign(selectedCampaignId);
    }
  }, [referenceCampaignId, selectReferenceCampaign, selectedCampaignId]);

  const definition = pageDefinitions.imports;
  const selectedSheet = workbook?.sheets.find((sheet) => sheet.name === sheetName);
  const headerOptions = useMemo(() => {
    if (!selectedSheet) return [];
    return selectedSheet.rows
      .slice(0, 20)
      .map((row, index) => ({
        index,
        label: row.map((cell) => String(cell ?? "")).filter(Boolean).join(" | "),
      }));
  }, [selectedSheet]);

  const filteredPreviewRows = useMemo(() => {
    if (!preview) return [];
    const rows = preview.sampleRows;
    if (previewFilter === "valid") {
      return rows.filter((row) => row.isValid);
    }
    if (previewFilter === "errors") {
      return rows.filter((row) => !row.isValid);
    }
    if (previewFilter === "warnings") {
      const warningRows = new Set(
        preview.issues
          .filter((issue) => issue.severity === "warning" && issue.sourceRowNumber)
          .map((issue) => issue.sourceRowNumber),
      );
      return rows.filter((row) => warningRows.has(row.sourceRowNumber));
    }
    return rows;
  }, [preview, previewFilter]);

  const canConfirm =
    !isReadOnly &&
    !busy &&
    preview !== null &&
    preview.errorCount === 0 &&
    preview.validCount > 0;

  if (campaigns.length === 0) {
    return (
      <>
        <PageHeader
          title="Import RH"
          description={definition.description}
        />
        <SectionCard title="Aucune campagne">
          <EmptyState
            title="Créez d’abord une campagne"
            description="L’import RH est rattaché à une campagne. Créez une campagne pour importer une population fictive de démonstration."
            plannedFeatures={[
              "Lecture locale Excel / CSV",
              "Validation et prévisualisation",
              "Population versionnée par campagne",
            ]}
          />
        </SectionCard>
      </>
    );
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setSuccessMessage(null);
    setFormError(null);
    setBusy(true);
    try {
      await selectFile(file);
      await rebuildPreview();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Lecture du fichier impossible.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!canConfirm || !preview) return;
    const confirmed = window.confirm(
      `Cette opération créera une nouvelle version de la population de la campagne. La population courante précédente sera conservée dans l’historique mais ne sera plus utilisée comme population active.\n\nCampagne : ${selectedCampaign?.name ?? ""}\nSalariés à importer : ${preview.validCount}\nSalariés remplacés : ${currentBatch?.importedRowCount ?? 0}\nAvertissements : ${preview.warningCount}\nFichier : ${preview.fileName}`,
    );
    if (!confirmed) return;
    setBusy(true);
    setFormError(null);
    setSuccessMessage(null);
    try {
      await confirmImport();
      setSuccessMessage("Import confirmé. La population courante a été mise à jour.");
      setTab("population");
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "La confirmation de l’import a échoué.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Import RH"
        description="Importez localement une population RH pour la campagne sélectionnée."
      />

      <p className="form-feedback" role="note" data-testid="import-privacy-note">
        Le fichier est analysé localement. Il n’est transmis à aucun service
        externe et son contenu brut n’est pas conservé après l’import.
      </p>

      <SectionCard title="Campagne">
        <div className="references-toolbar">
          <label className="field references-toolbar__select">
            <span>Campagne</span>
            <select
              data-testid="import-campaign-select"
              value={selectedCampaignId ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                selectCampaign(value ? Number(value) : null);
                setSuccessMessage(null);
                setFormError(null);
              }}
            >
              {campaigns.map((campaign) => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name} ({campaignStatusLabel(campaign.status)})
                </option>
              ))}
            </select>
          </label>
          {selectedCampaign ? (
            <StatusBadge tone={campaignStatusTone(selectedCampaign.status)}>
              {campaignStatusLabel(selectedCampaign.status)}
            </StatusBadge>
          ) : null}
          {isReadOnly ? (
            <p className="form-feedback form-feedback--error" role="status">
              Campagne archivée : nouvel import désactivé. Restaurez-la pour
              importer une population.
            </p>
          ) : null}
        </div>
      </SectionCard>

      <div className="filter-group references-tabs" role="tablist">
        {(
          [
            ["new", "Nouvel import"],
            ["population", "Population actuelle"],
            ["history", "Historique"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`filter-chip${tab === id ? " filter-chip--active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {successMessage ? (
        <p className="form-feedback form-feedback--success" role="status">
          {successMessage}
        </p>
      ) : null}
      {formError || wizardErrorMessage ? (
        <p className="form-feedback form-feedback--error" role="alert">
          {formError ?? wizardErrorMessage}
        </p>
      ) : null}

      {tab === "new" ? (
        <>
          <SectionCard
            title="Étape 2 — Fichier"
            description="Formats acceptés : .xlsx, .xls, .csv. Taille maximale 20 Mo."
          >
            <div className="references-actions">
              <label className="button button--secondary">
                Sélectionner un fichier
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  hidden
                  disabled={isReadOnly || busy}
                  data-testid="import-file-input"
                  onChange={onFileChange}
                />
              </label>
              {workbook ? (
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => {
                    resetImport();
                    setSuccessMessage(null);
                  }}
                >
                  Réinitialiser
                </button>
              ) : null}
            </div>
            {workbook ? (
              <ul className="references-completeness">
                <li>Fichier : {workbook.fileName}</li>
                <li>Format : {workbook.format.toUpperCase()}</li>
                <li>
                  Taille : {Math.round(workbook.fileSizeBytes / 1024)} Ko
                </li>
              </ul>
            ) : null}
          </SectionCard>

          {workbook ? (
            <SectionCard title="3. Feuille et en-tête">
              {workbook.format !== "csv" ? (
                <label className="field" style={{ padding: "0 22px 12px" }}>
                  <span>Feuille</span>
                  <select
                    data-testid="import-sheet-select"
                    value={sheetName ?? ""}
                    disabled={isReadOnly || busy}
                    onChange={(event) => {
                      selectSheet(event.target.value);
                      void rebuildPreview();
                    }}
                  >
                    {workbook.sheets.map((sheet) => (
                      <option key={sheet.name} value={sheet.name}>
                        {sheet.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label className="field" style={{ padding: "0 22px 22px" }}>
                <span>Ligne d’en-tête (1 = première ligne)</span>
                <select
                  data-testid="import-header-select"
                  value={headerRowIndex}
                  disabled={isReadOnly || busy}
                  onChange={(event) => {
                    setHeaderRow(Number(event.target.value));
                    void rebuildPreview();
                  }}
                >
                  {headerOptions.map((option) => (
                    <option key={option.index} value={option.index}>
                      Ligne {option.index + 1}
                      {option.label ? ` — ${option.label.slice(0, 80)}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </SectionCard>
          ) : null}

          {workbook && mapping.length > 0 ? (
            <SectionCard title="4. Correspondance des colonnes">
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Champ</th>
                      <th>Obligatoire</th>
                      <th>Colonne source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ALL_COLUMNS.map((column) => {
                      const entry = mapping.find(
                        (item) => item.targetField === column.key,
                      );
                      const headers =
                        selectedSheet?.rows[headerRowIndex]?.map((cell, index) => ({
                          index,
                          label: String(cell ?? `Colonne ${index + 1}`),
                        })) ?? [];
                      return (
                        <tr key={column.key}>
                          <td>{column.label}</td>
                          <td>{column.required ? "Oui" : "Non"}</td>
                          <td>
                            <select
                              aria-label={`Mapping ${column.label}`}
                              value={entry?.sourceIndex ?? ""}
                              disabled={isReadOnly || busy}
                              onChange={(event) => {
                                const raw = event.target.value;
                                setMapping(
                                  column.key as HrImportColumnKey,
                                  raw === "" ? null : Number(raw),
                                );
                                void rebuildPreview();
                              }}
                            >
                              <option value="">— Non mappé —</option>
                              {headers.map((header) => (
                                <option key={header.index} value={header.index}>
                                  {header.label || `Colonne ${header.index + 1}`}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          ) : null}

          {preview ? (
            <SectionCard title="5. Validation et prévisualisation">
              <ul className="references-completeness" data-testid="import-preview-summary">
                <li>Lignes lues : {preview.sourceRowCount}</li>
                <li>Lignes valides : {preview.validCount}</li>
                <li>Erreurs : {preview.errorCount}</li>
                <li>Avertissements : {preview.warningCount}</li>
                <li>Matricules dupliqués : {preview.duplicateNumbers}</li>
              </ul>

              <div className="filter-group" style={{ margin: "0 22px 12px" }}>
                {(
                  [
                    ["all", "Toutes"],
                    ["valid", "Valides"],
                    ["errors", "Erreurs"],
                    ["warnings", "Avertissements"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`filter-chip${previewFilter === id ? " filter-chip--active" : ""}`}
                    onClick={() => setPreviewFilter(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="data-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Ligne</th>
                      <th>Matricule</th>
                      <th>Nom</th>
                      <th>Famille</th>
                      <th>Grade</th>
                      <th>Contrat</th>
                      <th>Statut</th>
                      <th>Embauche</th>
                      <th>Salaire</th>
                      <th>Promo</th>
                      <th>Δ promo</th>
                      <th>9-Box</th>
                      <th>Validation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPreviewRows.map((row) => (
                      <PreviewRow key={row.sourceRowNumber} row={row} />
                    ))}
                  </tbody>
                </table>
              </div>

              {preview.issues.length > 0 ? (
                <>
                  <h3 className="references-subtitle">Problèmes détectés</h3>
                  <div className="data-table-wrap">
                    <table className="data-table" data-testid="import-issues-table">
                      <thead>
                        <tr>
                          <th>Ligne</th>
                          <th>Champ</th>
                          <th>Niveau</th>
                          <th>Message</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.issues.slice(0, 100).map((issue, index) => (
                          <tr key={`${issue.code}-${issue.sourceRowNumber}-${index}`}>
                            <td>{issue.sourceRowNumber ?? "—"}</td>
                            <td>{issue.field ?? "—"}</td>
                            <td>
                              {issue.severity === "error" ? "Erreur" : "Avertissement"}
                            </td>
                            <td>{issue.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </SectionCard>
          ) : null}

          {preview ? (
            <SectionCard title="6. Confirmation">
              <div className="form-actions references-actions">
                <button
                  type="button"
                  className="button button--primary"
                  data-testid="confirm-import-button"
                  disabled={!canConfirm || wizardStatus === "loading"}
                  onClick={() => void handleConfirm()}
                >
                  Confirmer l’import
                </button>
              </div>
            </SectionCard>
          ) : null}
        </>
      ) : null}

      {tab === "population" ? (
        <SectionCard title="Population actuelle">
          {currentBatch ? (
            <ul className="references-completeness" data-testid="population-summary">
              <li>
                Salariés :{" "}
                {populationSummary?.employeeCount ??
                  population?.total ??
                  currentBatch.importedRowCount}
              </li>
              <li>Fichier : {currentBatch.sourceFileName}</li>
              <li>Importé le : {formatDateTime(currentBatch.importedAt)}</li>
              <li>
                Lignes avec 9-Box : {populationSummary?.nineBoxCount ?? 0}
              </li>
              <li>
                Sous-performants confirmés :{" "}
                {populationSummary?.underperformerCount ?? 0}
              </li>
              <li>
                Familles représentées :{" "}
                {(populationSummary?.representedJobFamilyIds ?? [])
                  .map((id) => familyDisplayById.get(id) ?? "—")
                  .join(", ") || "—"}
              </li>
              <li>
                Grades représentés :{" "}
                {(populationSummary?.representedGradeIds ?? [])
                  .map((id) => gradeDisplayById.get(id) ?? "—")
                  .join(", ") || "—"}
              </li>
            </ul>
          ) : (
            <EmptyState
              title="Aucune population importée"
              description="Importez un fichier depuis l’onglet Nouvel import."
              plannedFeatures={[]}
            />
          )}

          {currentBatch ? (
            <>
              <div className="toolbar" style={{ padding: "0 22px" }}>
                <label className="field" style={{ minWidth: 260 }}>
                  <span>Recherche matricule / nom</span>
                  <input
                    data-testid="population-search"
                    value={populationSearch}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </label>
              </div>
              {populationStatus === "loading" ? <p>Chargement…</p> : null}
              <div className="data-table-wrap">
                <table className="data-table" data-testid="population-table">
                  <thead>
                    <tr>
                      <th>Matricule</th>
                      <th>Nom</th>
                      <th>Famille</th>
                      <th>Grade</th>
                      <th>Contrat</th>
                      <th>Statut</th>
                      <th>Embauche</th>
                      <th>Salaire déc. N-1</th>
                      <th>9-Box</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(population?.items ?? []).map((employee) => (
                      <tr key={employee.id}>
                        <td>{employee.employeeNumber}</td>
                        <td>{employee.employeeLabel}</td>
                        <td>
                          {familyDisplayById.get(employee.jobFamilyId) ?? "—"}
                        </td>
                        <td>
                          {gradeDisplayById.get(employee.gradeId) ?? "—"}
                        </td>
                        <td>{CONTRACT_TYPE_LABELS[employee.contractType]}</td>
                        <td>
                          {EMPLOYMENT_STATUS_LABELS[employee.employmentStatus]}
                        </td>
                        <td>{employee.hireDate}</td>
                        <td>
                          {employee.decemberBaseSalary.toLocaleString("fr-FR")}
                        </td>
                        <td>{employee.nineBoxCode ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="form-actions references-actions">
                <button
                  type="button"
                  className="button button--secondary"
                  disabled={populationPage <= 0}
                  onClick={() => setPage(populationPage - 1)}
                >
                  Précédent
                </button>
                <span>
                  Page {populationPage + 1}
                  {population
                    ? ` / ${Math.max(1, Math.ceil(population.total / populationPageSize))}`
                    : ""}
                </span>
                <button
                  type="button"
                  className="button button--secondary"
                  disabled={
                    !population ||
                    (populationPage + 1) * populationPageSize >= population.total
                  }
                  onClick={() => setPage(populationPage + 1)}
                >
                  Suivant
                </button>
              </div>
            </>
          ) : null}
        </SectionCard>
      ) : null}

      {tab === "history" ? (
        <SectionCard title="Historique des imports">
          {batches.length === 0 ? (
            <EmptyState
              title="Aucun import"
              description="Les lots confirmés apparaîtront ici."
              plannedFeatures={[]}
            />
          ) : (
            <div className="data-table-wrap">
              <table className="data-table" data-testid="import-history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Fichier</th>
                    <th>Format</th>
                    <th>Feuille</th>
                    <th>Lignes</th>
                    <th>Avertissements</th>
                    <th>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => (
                    <tr key={batch.id}>
                      <td>{formatDateTime(batch.importedAt)}</td>
                      <td>{batch.sourceFileName}</td>
                      <td>{batch.sourceFormat.toUpperCase()}</td>
                      <td>{batch.sourceSheetName ?? "—"}</td>
                      <td>{batch.importedRowCount}</td>
                      <td>{batch.warningCount}</td>
                      <td>
                        <StatusBadge
                          tone={batch.status === "current" ? "success" : "neutral"}
                        >
                          {batch.status === "current" ? "Courant" : "Remplacé"}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      ) : null}
    </>
  );
}

function formatReferenceDisplay(
  code: string | null,
  label: string | null,
): string {
  if (code && label) {
    return `${code} / ${label}`;
  }
  if (code) {
    return code;
  }
  if (label) {
    return label;
  }
  return "—";
}

function PreviewRow({ row }: { row: NormalizedImportRow }) {
  return (
    <tr>
      <td>{row.sourceRowNumber}</td>
      <td>{row.employeeNumber ?? "—"}</td>
      <td>{row.employeeLabel ?? "—"}</td>
      <td>{formatReferenceDisplay(row.jobFamilyCode, row.jobFamilyLabel)}</td>
      <td>{formatReferenceDisplay(row.gradeCode, row.gradeLabel)}</td>
      <td>
        {row.contractType ? CONTRACT_TYPE_LABELS[row.contractType] : "—"}
      </td>
      <td>
        {row.employmentStatus
          ? EMPLOYMENT_STATUS_LABELS[row.employmentStatus]
          : "—"}
      </td>
      <td>{row.hireDate ?? "—"}</td>
      <td>
        {row.decemberBaseSalary === null
          ? "—"
          : row.decemberBaseSalary.toLocaleString("fr-FR")}
      </td>
      <td>{row.promotionDate ?? "—"}</td>
      <td>
        {row.promotionDate
          ? row.promotionAmount.toLocaleString("fr-FR")
          : "—"}
      </td>
      <td>{row.nineBoxCode ?? "—"}</td>
      <td>{row.isValid ? "Valide" : "Erreur"}</td>
    </tr>
  );
}
