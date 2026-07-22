import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  campaignStatusLabel,
  campaignStatusTone,
} from "../app/formatters";
import { useAppData } from "../app/AppDataProvider";
import { useCompensationReference } from "../app/CompensationReferenceProvider";
import {
  ConversionError,
  formatFactorDisplay,
  formatRatioBpsDisplay,
  nineBoxModeLabel,
  parseFactorDisplayInput,
  parseFcfaAmountInput,
  salaryPositionInterpretation,
} from "../domain/compensationReference/conversions";
import type {
  CompensationReferenceSet,
  FactorLevel,
  NineBoxMode,
  NineBoxOrientation,
  StructureItemInput,
} from "../domain/compensationReference/models";
import {
  getNineBoxFactorAtCell,
  getNineBoxMatrixAxes,
  nineBoxOrientationLabel,
  NINE_BOX_ORIENTATIONS,
  type NineBoxAxisDimension,
} from "../domain/compensationReference/nineBoxOrientation";
import { EmptyState } from "../components/ui/EmptyState";
import { PageHeader } from "../components/ui/PageHeader";
import { SectionCard } from "../components/ui/SectionCard";
import { StatusBadge } from "../components/ui/StatusBadge";
import { pageDefinitions } from "./pageDefinitions";

type ReferenceTab =
  | "structure"
  | "salary_grid"
  | "positions"
  | "performance"
  | "completeness";

const TABS: { id: ReferenceTab; label: string }[] = [
  { id: "structure", label: "Structure" },
  { id: "salary_grid", label: "Grille S0" },
  { id: "positions", label: "Positions salariales" },
  { id: "performance", label: "Performance et 9-Box" },
  { id: "completeness", label: "Complétude" },
];

const MODE_OPTIONS: { value: NineBoxMode; label: string }[] = [
  { value: "none", label: "Aucun effet" },
  { value: "performance_only", label: "Performance uniquement" },
  { value: "full_nine_box", label: "9-Box complète" },
  { value: "performance_potential", label: "Performance × Potentiel" },
];

export function ReferencesPage() {
  const { campaigns } = useAppData();
  const {
    selectedCampaignId,
    selectedCampaign,
    referenceSet,
    completeness,
    status,
    errorMessage,
    isReadOnly,
    selectCampaign,
    retry,
    updateStructure,
    updateSalaryGrid,
    updateSalaryPositionFactors,
    updatePerformanceFactors,
    updatePotentialFactors,
    updateNineBoxFactors,
    updateNineBoxMode,
    updateNineBoxOrientation,
    updateNineBoxConfirmationFactorMilli,
  } = useCompensationReference();

  const definition = pageDefinitions.references;
  const [tab, setTab] = useState<ReferenceTab>("structure");
  const [busy, setBusy] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [familyDraft, setFamilyDraft] = useState<StructureItemInput[]>([]);
  const [gradeDraft, setGradeDraft] = useState<StructureItemInput[]>([]);
  const [gridDraft, setGridDraft] = useState<Record<string, string>>({});
  const [positionDraft, setPositionDraft] = useState<Record<number, string>>(
    {},
  );
  const [performanceDraft, setPerformanceDraft] = useState<
    Record<FactorLevel, string>
  >({ low: "", medium: "", high: "" });
  const [potentialDraft, setPotentialDraft] = useState<
    Record<FactorLevel, string>
  >({ low: "", medium: "", high: "" });
  const [nineBoxDraft, setNineBoxDraft] = useState<Record<number, string>>({});
  const [modeDraft, setModeDraft] = useState<NineBoxMode>("none");
  const [orientationDraft, setOrientationDraft] =
    useState<NineBoxOrientation>("performance_rows_potential_columns");
  const [confirmationFactorDraft, setConfirmationFactorDraft] =
    useState<string>("");

  useEffect(() => {
    if (!referenceSet) return;
    setFamilyDraft(
      referenceSet.jobFamilies.map((item) => ({
        id: item.id,
        code: item.code,
        label: item.label,
      })),
    );
    setGradeDraft(
      referenceSet.grades.map((item) => ({
        id: item.id,
        code: item.code,
        label: item.label,
      })),
    );
    const grid: Record<string, string> = {};
    for (const cell of referenceSet.salaryGrid) {
      grid[`${cell.jobFamilyId}:${cell.gradeId}`] =
        cell.s0Amount === null ? "" : String(cell.s0Amount);
    }
    setGridDraft(grid);
    const positions: Record<number, string> = {};
    for (const position of referenceSet.salaryPositions) {
      positions[position.id] = formatFactorDisplay(position.positionFactorMilli);
    }
    setPositionDraft(positions);
    const perf: Record<FactorLevel, string> = { low: "", medium: "", high: "" };
    for (const factor of referenceSet.performanceFactors) {
      perf[factor.level] = formatFactorDisplay(factor.factorMilli);
    }
    setPerformanceDraft(perf);
    const pot: Record<FactorLevel, string> = { low: "", medium: "", high: "" };
    for (const factor of referenceSet.potentialFactors) {
      pot[factor.level] = formatFactorDisplay(factor.factorMilli);
    }
    setPotentialDraft(pot);
    const boxes: Record<number, string> = {};
    for (const factor of referenceSet.nineBoxFactors) {
      boxes[factor.boxCode] = formatFactorDisplay(factor.factorMilli);
    }
    setNineBoxDraft(boxes);
    setModeDraft(referenceSet.config.nineBoxMode);
    setOrientationDraft(referenceSet.config.nineBoxOrientation);
    setConfirmationFactorDraft(
      formatFactorDisplay(referenceSet.config.nineBoxConfirmationFactorMilli),
    );
  }, [referenceSet]);

  const nineBoxAxes = useMemo(
    () => getNineBoxMatrixAxes(orientationDraft),
    [orientationDraft],
  );

  const filledGridCount = useMemo(() => {
    return Object.values(gridDraft).filter((value) => value.trim() !== "")
      .length;
  }, [gridDraft]);

  if (campaigns.length === 0) {
    return (
      <>
        <PageHeader
          title="Référentiels de rémunération"
          description={definition.description}
        />
        <SectionCard title="Aucune campagne">
          <EmptyState
            title="Créez d’abord une campagne"
            description="Les référentiels sont rattachés à une campagne. Créez une campagne depuis la page Campagnes pour commencer la configuration."
            plannedFeatures={[
              "Familles et grades par campagne",
              "Grille S0 et positions salariales",
              "Coefficients Performance et 9-Box",
            ]}
          />
        </SectionCard>
      </>
    );
  }

  async function runSave(
    action: () => Promise<unknown>,
    success: string,
  ): Promise<void> {
    if (busy || isReadOnly) return;
    setBusy(true);
    setSuccessMessage(null);
    setFormError(null);
    try {
      await action();
      setSuccessMessage(success);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "L’enregistrement a échoué.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveStructure(event: FormEvent) {
    event.preventDefault();
    await runSave(
      () => updateStructure(familyDraft, gradeDraft),
      "Structure enregistrée.",
    );
  }

  async function handleSaveGrid(event: FormEvent) {
    event.preventDefault();
    if (!referenceSet) return;
    await runSave(async () => {
      const cells = referenceSet.salaryGrid.map((cell) => {
        const raw = gridDraft[`${cell.jobFamilyId}:${cell.gradeId}`] ?? "";
        try {
          return {
            jobFamilyId: cell.jobFamilyId,
            gradeId: cell.gradeId,
            s0Amount: parseFcfaAmountInput(raw),
          };
        } catch (error) {
          if (error instanceof ConversionError) {
            throw new Error(error.message);
          }
          throw error;
        }
      });
      return updateSalaryGrid(cells);
    }, "Grille S0 enregistrée.");
  }

  async function handleSavePositions(event: FormEvent) {
    event.preventDefault();
    if (!referenceSet) return;
    await runSave(async () => {
      const updates = referenceSet.salaryPositions.map((position) => {
        try {
          return {
            id: position.id,
            positionFactorMilli: parseFactorDisplayInput(
              positionDraft[position.id] ?? "",
            ),
          };
        } catch (error) {
          if (error instanceof ConversionError) {
            throw new Error(
              `${error.message} (position ${position.code}).`,
            );
          }
          throw error;
        }
      });
      return updateSalaryPositionFactors(updates);
    }, "Coefficients de position enregistrés.");
  }

  async function handleSavePerformanceBlock(event: FormEvent) {
    event.preventDefault();
    if (!referenceSet) return;
    await runSave(async () => {
      try {
        await updateNineBoxMode(modeDraft);
        await updateNineBoxOrientation(orientationDraft);
        await updateNineBoxConfirmationFactorMilli(
          parseFactorDisplayInput(confirmationFactorDraft),
        );
        await updatePerformanceFactors(
          (["low", "medium", "high"] as const).map((level) => ({
            level,
            factorMilli: parseFactorDisplayInput(performanceDraft[level]),
          })),
        );
        await updatePotentialFactors(
          (["low", "medium", "high"] as const).map((level) => ({
            level,
            factorMilli: parseFactorDisplayInput(potentialDraft[level]),
          })),
        );
        await updateNineBoxFactors(
          referenceSet.nineBoxFactors.map((factor) => ({
            boxCode: factor.boxCode,
            factorMilli: parseFactorDisplayInput(
              nineBoxDraft[factor.boxCode] ?? "",
            ),
          })),
        );
      } catch (error) {
        if (error instanceof ConversionError) {
          throw new Error(error.message);
        }
        throw error;
      }
    }, "Paramètres Performance et 9-Box enregistrés.");
  }

  function resetStructure() {
    if (!referenceSet) return;
    setFamilyDraft(
      referenceSet.jobFamilies.map((item) => ({
        id: item.id,
        code: item.code,
        label: item.label,
      })),
    );
    setGradeDraft(
      referenceSet.grades.map((item) => ({
        id: item.id,
        code: item.code,
        label: item.label,
      })),
    );
    setFormError(null);
    setSuccessMessage(null);
  }

  function resetGrid() {
    if (!referenceSet) return;
    const grid: Record<string, string> = {};
    for (const cell of referenceSet.salaryGrid) {
      grid[`${cell.jobFamilyId}:${cell.gradeId}`] =
        cell.s0Amount === null ? "" : String(cell.s0Amount);
    }
    setGridDraft(grid);
    setFormError(null);
    setSuccessMessage(null);
  }

  return (
    <>
      <PageHeader
        title="Référentiels de rémunération"
        description="Paramètres de grille, positions et coefficients propres à chaque campagne."
      />

      <SectionCard title="Campagne et statut">
        <div className="references-toolbar">
          <label className="field references-toolbar__select">
            <span>Campagne</span>
            <select
              data-testid="references-campaign-select"
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
          {completeness ? (
            <StatusBadge
              tone={completeness.ready ? "success" : "warning"}
              data-testid="references-completeness-badge"
            >
              {completeness.badge}
            </StatusBadge>
          ) : null}
          {isReadOnly ? (
            <p className="form-feedback form-feedback--error" role="status">
              Campagne archivée : référentiels en lecture seule. Restaurez la
              campagne pour la modifier.
            </p>
          ) : null}
        </div>
      </SectionCard>

      {status === "loading" ? (
        <SectionCard title="Chargement">
          <p>Chargement du référentiel…</p>
        </SectionCard>
      ) : null}

      {status === "error" ? (
        <SectionCard title="Erreur">
          <p className="form-feedback form-feedback--error">{errorMessage}</p>
          <button type="button" className="button button--secondary" onClick={retry}>
            Réessayer
          </button>
        </SectionCard>
      ) : null}

      {status === "ready" && referenceSet ? (
        <>
          <div className="filter-group references-tabs" role="tablist">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                className={`filter-chip${tab === item.id ? " filter-chip--active" : ""}`}
                onClick={() => {
                  setTab(item.id);
                  setSuccessMessage(null);
                  setFormError(null);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          {successMessage ? (
            <p className="form-feedback form-feedback--success" role="status">
              {successMessage}
            </p>
          ) : null}
          {formError ? (
            <p className="form-feedback form-feedback--error" role="alert">
              {formError}
            </p>
          ) : null}

          {tab === "structure" ? (
            <SectionCard
              title="Structure"
              description="Cinq familles et six grades. Les directeurs restent hors grille."
            >
              <form onSubmit={handleSaveStructure}>
                <h3 className="references-subtitle">Familles de métiers</h3>
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Ordre</th>
                        <th>Code</th>
                        <th>Libellé</th>
                      </tr>
                    </thead>
                    <tbody>
                      {familyDraft.map((family, index) => (
                        <tr key={family.id}>
                          <td>{index + 1}</td>
                          <td>
                            <input
                              aria-label={`Code famille ${index + 1}`}
                              value={family.code}
                              disabled={isReadOnly || busy}
                              onChange={(event) => {
                                const next = [...familyDraft];
                                next[index] = {
                                  ...family,
                                  code: event.target.value,
                                };
                                setFamilyDraft(next);
                              }}
                            />
                          </td>
                          <td>
                            <input
                              aria-label={`Libellé famille ${index + 1}`}
                              value={family.label}
                              disabled={isReadOnly || busy}
                              onChange={(event) => {
                                const next = [...familyDraft];
                                next[index] = {
                                  ...family,
                                  label: event.target.value,
                                };
                                setFamilyDraft(next);
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <h3 className="references-subtitle">Grades</h3>
                <p className="references-help">
                  Les directeurs restent hors grille.
                </p>
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Ordre</th>
                        <th>Code</th>
                        <th>Libellé</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gradeDraft.map((grade, index) => (
                        <tr key={grade.id}>
                          <td>{index + 1}</td>
                          <td>
                            <input
                              aria-label={`Code grade ${index + 1}`}
                              value={grade.code}
                              disabled={isReadOnly || busy}
                              onChange={(event) => {
                                const next = [...gradeDraft];
                                next[index] = {
                                  ...grade,
                                  code: event.target.value,
                                };
                                setGradeDraft(next);
                              }}
                            />
                          </td>
                          <td>
                            <input
                              aria-label={`Libellé grade ${index + 1}`}
                              value={grade.label}
                              disabled={isReadOnly || busy}
                              onChange={(event) => {
                                const next = [...gradeDraft];
                                next[index] = {
                                  ...grade,
                                  label: event.target.value,
                                };
                                setGradeDraft(next);
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="form-actions references-actions">
                  <button
                    type="submit"
                    className="button button--primary"
                    disabled={isReadOnly || busy}
                  >
                    Enregistrer
                  </button>
                  <button
                    type="button"
                    className="button button--secondary"
                    disabled={isReadOnly || busy}
                    onClick={resetStructure}
                  >
                    Annuler
                  </button>
                </div>
              </form>
            </SectionCard>
          ) : null}

          {tab === "salary_grid" ? (
            <SectionCard
              title="Grille S0"
              description="Médianes mensuelles S0 en FCFA. Cellule vide = non configuré."
            >
              <form onSubmit={handleSaveGrid}>
                <p className="references-help" data-testid="salary-grid-count">
                  Cellules renseignées : {filledGridCount}/30
                </p>
                <div className="data-table-wrap salary-grid-wrap">
                  <table className="data-table salary-grid-table">
                    <thead>
                      <tr>
                        <th>Famille</th>
                        {referenceSet.grades.map((grade) => (
                          <th key={grade.id}>
                            {grade.code}
                            <br />
                            <span className="salary-grid-sub">{grade.label}</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {referenceSet.jobFamilies.map((family) => (
                        <tr key={family.id}>
                          <th scope="row">
                            {family.code}
                            <br />
                            <span className="salary-grid-sub">{family.label}</span>
                          </th>
                          {referenceSet.grades.map((grade) => {
                            const key = `${family.id}:${grade.id}`;
                            return (
                              <td key={key}>
                                <input
                                  aria-label={`S0 ${family.code} ${grade.code}`}
                                  inputMode="numeric"
                                  placeholder="—"
                                  value={gridDraft[key] ?? ""}
                                  disabled={isReadOnly || busy}
                                  onChange={(event) => {
                                    setGridDraft((current) => ({
                                      ...current,
                                      [key]: event.target.value,
                                    }));
                                  }}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="form-actions references-actions">
                  <button
                    type="submit"
                    className="button button--primary"
                    disabled={isReadOnly || busy}
                  >
                    Enregistrer
                  </button>
                  <button
                    type="button"
                    className="button button--secondary"
                    disabled={isReadOnly || busy}
                    onClick={resetGrid}
                  >
                    Annuler
                  </button>
                </div>
              </form>
            </SectionCard>
          ) : null}

          {tab === "positions" ? (
            <SectionCard
              title="Positions salariales"
              description="Les ratios de référence sont fixes. Les coefficients d’augmentation sont reparamétrables."
            >
              <p className="references-help">
                Le coefficient de position pondérera ultérieurement la
                recommandation matricielle. Aucun calcul individuel n’est
                exécuté dans ce lot.
              </p>
              <form onSubmit={handleSavePositions}>
                <div className="data-table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Ratio</th>
                        <th>Interprétation</th>
                        <th>Coefficient</th>
                      </tr>
                    </thead>
                    <tbody>
                      {referenceSet.salaryPositions.map((position) => (
                        <tr key={position.id}>
                          <td>{position.code}</td>
                          <td>
                            {formatRatioBpsDisplay(
                              position.code,
                              position.referenceRatioBps,
                            )}
                          </td>
                          <td>
                            {salaryPositionInterpretation(
                              position.code,
                              position.referenceRatioBps,
                            )}
                          </td>
                          <td>
                            <input
                              aria-label={`Coefficient ${position.code}`}
                              value={positionDraft[position.id] ?? ""}
                              disabled={isReadOnly || busy}
                              onChange={(event) => {
                                setPositionDraft((current) => ({
                                  ...current,
                                  [position.id]: event.target.value,
                                }));
                              }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="form-actions references-actions">
                  <button
                    type="submit"
                    className="button button--primary"
                    disabled={isReadOnly || busy}
                  >
                    Enregistrer
                  </button>
                </div>
              </form>
            </SectionCard>
          ) : null}

          {tab === "performance" ? (
            <SectionCard
              title="Performance et 9-Box"
              description="Choisissez le mode applicable à la campagne. Les groupes non actifs restent configurables."
            >
              <form onSubmit={handleSavePerformanceBlock}>
                <label className="field">
                  <span>Mode 9-Box</span>
                  <select
                    data-testid="nine-box-mode-select"
                    value={modeDraft}
                    disabled={isReadOnly || busy}
                    onChange={(event) =>
                      setModeDraft(event.target.value as NineBoxMode)
                    }
                  >
                    {MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Orientation de la matrice 9-Box</span>
                  <select
                    data-testid="nine-box-orientation-select"
                    value={orientationDraft}
                    disabled={isReadOnly || busy}
                    onChange={(event) =>
                      setOrientationDraft(
                        event.target.value as NineBoxOrientation,
                      )
                    }
                  >
                    {NINE_BOX_ORIENTATIONS.map((orientation) => (
                      <option key={orientation} value={orientation}>
                        {nineBoxOrientationLabel(orientation)}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="references-help">
                  L’orientation change uniquement la présentation. Le facteur
                  d’un couple Performance / Potentiel reste identique.
                </p>

                <label className="field">
                  <span>Coefficient provisoire 9-Box (« Performance à confirmer »)</span>
                  <input
                    type="text"
                    data-testid="nine-box-confirmation-factor-input"
                    value={confirmationFactorDraft}
                    disabled={isReadOnly || busy}
                    onChange={(event) =>
                      setConfirmationFactorDraft(event.target.value)
                    }
                  />
                </label>
                <p className="references-help">
                  Coefficient global appliqué, indépendamment du code 9-Box
                  source, lorsqu’un salarié est importé avec « Neutraliser
                  effet 9-Box » activé : sa performance est en cours de
                  confirmation et son coefficient d’évaluation devient ce
                  taux provisoire (ex. 0,900) plutôt que le facteur 9-Box
                  habituel. Plage autorisée : 0,500 à 1,000.
                </p>

                <FactorGroup
                  title="Performance"
                  active={
                    modeDraft === "performance_only" ||
                    modeDraft === "performance_potential"
                  }
                  levels={referenceSet.performanceFactors.map((factor) => ({
                    level: factor.level,
                    label: factor.label,
                    value: performanceDraft[factor.level],
                  }))}
                  disabled={isReadOnly || busy}
                  onChange={(level, value) =>
                    setPerformanceDraft((current) => ({
                      ...current,
                      [level]: value,
                    }))
                  }
                />

                <FactorGroup
                  title="Potentiel"
                  active={modeDraft === "performance_potential"}
                  levels={referenceSet.potentialFactors.map((factor) => ({
                    level: factor.level,
                    label: factor.label,
                    value: potentialDraft[factor.level],
                  }))}
                  disabled={isReadOnly || busy}
                  onChange={(level, value) =>
                    setPotentialDraft((current) => ({
                      ...current,
                      [level]: value,
                    }))
                  }
                />

                <h3 className="references-subtitle">
                  Matrice 9-Box{" "}
                  <span className="references-active-tag">
                    {modeDraft === "full_nine_box"
                      ? "Actif pour le mode courant"
                      : "Non actif pour le mode courant"}
                  </span>
                </h3>
                <p className="references-help" data-testid="nine-box-axes-help">
                  {nineBoxAxes.rowAxisLabel} en lignes (
                  {nineBoxAxes.rowLevels.join(" → ")}),{" "}
                  {nineBoxAxes.columnAxisLabel} en colonnes (
                  {nineBoxAxes.columnLevels.join(" → ")}). Cases historiques
                  1 à 9 conservées.
                </p>
                <div className="data-table-wrap">
                  <table
                    className="data-table nine-box-table"
                    data-testid="nine-box-matrix"
                    data-orientation={orientationDraft}
                  >
                    <thead>
                      <tr>
                        <th>{nineBoxAxes.cornerLabel}</th>
                        {nineBoxAxes.columnLevels.map((level) => (
                          <th key={level}>
                            {levelLabel(
                              nineBoxAxes.columnDimension,
                              level,
                              referenceSet,
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {nineBoxAxes.rowLevels.map((rowLevel) => (
                        <tr key={rowLevel}>
                          <th scope="row">
                            {levelLabel(
                              nineBoxAxes.rowDimension,
                              rowLevel,
                              referenceSet,
                            )}
                          </th>
                          {nineBoxAxes.columnLevels.map((columnLevel) => {
                            let factor;
                            try {
                              factor = getNineBoxFactorAtCell(
                                referenceSet.nineBoxFactors,
                                orientationDraft,
                                rowLevel,
                                columnLevel,
                              );
                            } catch {
                              return (
                                <td key={`${rowLevel}-${columnLevel}`}>—</td>
                              );
                            }
                            return (
                              <td
                                key={`${rowLevel}-${columnLevel}`}
                                data-performance={factor.performanceLevel}
                                data-potential={factor.potentialLevel}
                                data-box-code={factor.boxCode}
                              >
                                <div className="nine-box-cell">
                                  <span>Case {factor.boxCode}</span>
                                  <input
                                    aria-label={`Coefficient 9-Box ${factor.performanceLevel}/${factor.potentialLevel}`}
                                    value={nineBoxDraft[factor.boxCode] ?? ""}
                                    disabled={isReadOnly || busy}
                                    onChange={(event) =>
                                      setNineBoxDraft((current) => ({
                                        ...current,
                                        [factor.boxCode]: event.target.value,
                                      }))
                                    }
                                  />
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="form-actions references-actions">
                  <button
                    type="submit"
                    className="button button--primary"
                    disabled={isReadOnly || busy}
                  >
                    Enregistrer
                  </button>
                </div>
              </form>
            </SectionCard>
          ) : null}

          {tab === "completeness" && completeness ? (
            <SectionCard title="Complétude du référentiel">
              <div className="references-completeness" data-testid="completeness-panel">
                <StatusBadge tone={completeness.ready ? "success" : "warning"}>
                  {completeness.badge}
                </StatusBadge>
                <ul>
                  <li>
                    Structure :{" "}
                    {completeness.structureComplete
                      ? "complète"
                      : "incomplète"}
                  </li>
                  <li>
                    Grille S0 : {completeness.salaryGridFilledCount}/
                    {completeness.salaryGridTotal}
                  </li>
                  <li>
                    Positions :{" "}
                    {completeness.positionsComplete
                      ? "complète"
                      : "incomplète"}
                  </li>
                  <li>
                    Mode sélectionné :{" "}
                    {nineBoxModeLabel(completeness.nineBoxMode)}
                  </li>
                  <li>
                    Performance :{" "}
                    {statusLabel(completeness.performanceStatus)}
                  </li>
                  <li>
                    Potentiel : {statusLabel(completeness.potentialStatus)}
                  </li>
                  <li>9-Box : {statusLabel(completeness.nineBoxStatus)}</li>
                  <li>
                    Sections complètes : {completeness.completedSections}/
                    {completeness.totalSections} ({completeness.percent} %)
                  </li>
                </ul>
                {completeness.issues.length > 0 ? (
                  <>
                    <h3 className="references-subtitle">Actions restantes</h3>
                    <ul data-testid="completeness-issues">
                      {completeness.issues.map((issue) => (
                        <li key={issue.code}>{issue.message}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p>Aucune action restante.</p>
                )}
              </div>
            </SectionCard>
          ) : null}
        </>
      ) : null}
    </>
  );
}

function levelLabel(
  dimension: NineBoxAxisDimension,
  level: FactorLevel,
  referenceSet: CompensationReferenceSet,
): string {
  const source =
    dimension === "performance"
      ? referenceSet.performanceFactors
      : referenceSet.potentialFactors;
  return source.find((item) => item.level === level)?.label ?? level;
}

function FactorGroup({
  title,
  active,
  levels,
  disabled,
  onChange,
}: {
  title: string;
  active: boolean;
  levels: { level: FactorLevel; label: string; value: string }[];
  disabled: boolean;
  onChange: (level: FactorLevel, value: string) => void;
}) {
  return (
    <div className="references-factor-group">
      <h3 className="references-subtitle">
        {title}{" "}
        <span className="references-active-tag">
          {active
            ? "Actif pour le mode courant"
            : "Non actif pour le mode courant"}
        </span>
      </h3>
      <div className="form-grid">
        {levels.map((item) => (
          <label key={item.level} className="field">
            <span>{item.label}</span>
            <input
              aria-label={`Coefficient ${title} ${item.label}`}
              value={item.value}
              disabled={disabled}
              onChange={(event) => onChange(item.level, event.target.value)}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function statusLabel(
  status: "complete" | "incomplete" | "not_required",
): string {
  switch (status) {
    case "complete":
      return "complète";
    case "incomplete":
      return "incomplète";
    case "not_required":
      return "non exigée";
  }
}
