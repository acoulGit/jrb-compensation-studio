import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import App from "../App";
import * as calculation from "../domain/compensationCalculation";
import * as saveService from "../application/campaignSimulation/saveCurrentCampaignSimulation";
import { createMemoryAppServices } from "../services/createAppServices";

const FR_HEADERS = [
  "Matricule",
  "Nom complet",
  "Famille",
  "Grade",
  "Type de contrat",
  "Statut d’emploi",
  "Date d’embauche",
  "Salaire de base décembre",
  "9-Box",
  "Sous-performant confirmé",
  "Montant promotion",
  "Montant correction",
  "Mesure sociale",
];

function toArrayBuffer(data: Uint8Array | number[] | ArrayBuffer): ArrayBuffer {
  if (data instanceof ArrayBuffer) return data;
  const bytes = data instanceof Uint8Array ? data : Uint8Array.from(data);
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function sheetToBuffer(rows: unknown[][], fileName: string) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Population");
  const arrayBuffer = toArrayBuffer(
    XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as Uint8Array,
  );
  return { arrayBuffer, fileName, fileSizeBytes: arrayBuffer.byteLength };
}

function validRow(
  overrides: Partial<Record<string, string | number>> = {},
): (string | number)[] {
  return [
    overrides.matricule ?? "EMP-0001",
    overrides.nom ?? "Salarié Démo 1",
    overrides.famille ?? "F1",
    overrides.grade ?? "G1",
    overrides.contrat ?? "CDI",
    overrides.statut ?? "Actif",
    overrides.date ?? "2020-01-15",
    overrides.salaire ?? 450_000,
    overrides.nineBox ?? 5,
    overrides.under ?? "non",
    overrides.promo ?? 0,
    overrides.corr ?? 0,
    overrides.social ?? 0,
  ];
}

async function fillAllS0(
  services: ReturnType<typeof createMemoryAppServices>,
  campaignId: number,
) {
  const set = await services.compensationReference.getReferenceSet(campaignId);
  await services.compensationReference.updateSalaryGrid(
    campaignId,
    set.salaryGrid.map((cell) => ({
      jobFamilyId: cell.jobFamilyId,
      gradeId: cell.gradeId,
      s0Amount: 1_000_000,
    })),
  );
}

async function importPopulation(
  services: ReturnType<typeof createMemoryAppServices>,
  campaignId: number,
) {
  const file = sheetToBuffer(
    [FR_HEADERS, validRow({ matricule: "A-1" }), validRow({ matricule: "B-2" })],
    "pop.xlsx",
  );
  const parsed = await services.hrImport.parseFile(file);
  const mapping = services.hrImport.buildAutoMapping(FR_HEADERS);
  await services.hrImport.confirmImport({
    campaignId,
    fileName: parsed.fileName,
    format: parsed.format,
    sheetName: parsed.sheets[0].name,
    fileSizeBytes: file.fileSizeBytes,
    rows: parsed.sheets[0].rows,
    headerRowIndex: 0,
    mapping,
  });
}

async function prepareReadyCampaign(
  services: ReturnType<typeof createMemoryAppServices>,
  name = "Simulation 2027",
) {
  const campaign = await services.campaign.createCampaign({
    name,
    referenceYear: 2027,
    notes: "",
  });
  await fillAllS0(services, campaign.id);
  await services.compensationReference.updateNineBoxMode(campaign.id, "none");
  await importPopulation(services, campaign.id);
  return campaign;
}

async function openSimulation(services = createMemoryAppServices()) {
  const user = userEvent.setup();
  render(<App services={services} />);
  await screen.findByRole("navigation", { name: "Navigation principale" });
  await user.click(screen.getByRole("button", { name: "Simulation" }));
  return { user, services };
}

async function selectCampaign(user: ReturnType<typeof userEvent.setup>, id: number) {
  await user.selectOptions(
    await screen.findByTestId("simulation-campaign-select"),
    String(id),
  );
}

async function validateAndLaunch(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId("simulation-budget-mode-manual"));
  await user.type(screen.getByTestId("simulation-manual-budget"), "25000003");
  await user.click(screen.getByTestId("simulation-rounding-suggest-100"));
  await waitFor(() => {
    expect(screen.getByTestId("simulation-validate")).not.toBeDisabled();
  });
  await user.click(screen.getByTestId("simulation-validate"));
  await screen.findByTestId("simulation-validation-success");
  await user.click(screen.getByTestId("simulation-launch"));
  await waitFor(() => {
    expect(screen.getByTestId("simulation-execution-status")).toHaveTextContent(
      /Simulation réussie/,
    );
  });
}

describe("Lot 2B-4B — sauvegarde explicite", () => {
  it("n’affiche pas le bouton sans résultat", async () => {
    const services = createMemoryAppServices();
    const campaign = await prepareReadyCampaign(services);
    const { user } = await openSimulation(services);
    await selectCampaign(user, campaign.id);
    expect(screen.queryByTestId("simulation-save")).not.toBeInTheDocument();
  });

  it("affiche le bouton après succès et l’enregistre une fois", async () => {
    const services = createMemoryAppServices();
    const campaign = await prepareReadyCampaign(services);
    const { user } = await openSimulation(services);
    await selectCampaign(user, campaign.id);
    await validateAndLaunch(user);
    expect(screen.getByTestId("simulation-save")).toBeEnabled();
    await user.click(screen.getByTestId("simulation-save"));
    await screen.findByTestId("simulation-save-success");
    expect(screen.getByTestId("simulation-save-success")).toHaveTextContent(
      /Simulation n°1 enregistrée avec succès/,
    );
    expect(screen.queryByTestId("simulation-save")).not.toBeInTheDocument();
    expect(screen.getByTestId("simulation-save-already-saved")).toBeInTheDocument();
  });

  it("empêche un double enregistrement session", async () => {
    const spy = vi.spyOn(saveService, "saveCurrentCampaignSimulation");
    const services = createMemoryAppServices();
    const campaign = await prepareReadyCampaign(services);
    const { user } = await openSimulation(services);
    await selectCampaign(user, campaign.id);
    await validateAndLaunch(user);
    await user.click(screen.getByTestId("simulation-save"));
    await screen.findByTestId("simulation-save-success");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("simulation-save")).not.toBeInTheDocument();
    spy.mockRestore();
  });

  it("masque le bouton pour campagne archivée", async () => {
    const services = createMemoryAppServices();
    const campaign = await prepareReadyCampaign(services);
    await services.campaign.archiveCampaign(campaign.id);
    const { user } = await openSimulation(services);
    await selectCampaign(user, campaign.id);
    expect(screen.queryByTestId("simulation-save")).not.toBeInTheDocument();
  });

  it("masque le bouten pour résultat stale", async () => {
    const services = createMemoryAppServices();
    const campaign = await prepareReadyCampaign(services);
    const { user } = await openSimulation(services);
    await selectCampaign(user, campaign.id);
    await validateAndLaunch(user);
    await user.clear(screen.getByTestId("simulation-manual-budget"));
    await user.type(screen.getByTestId("simulation-manual-budget"), "30000000");
    await screen.findByTestId("simulation-result-stale");
    expect(screen.queryByTestId("simulation-save")).not.toBeInTheDocument();
  });

  it("sanitise une erreur de sauvegarde", async () => {
    vi.spyOn(saveService, "saveCurrentCampaignSimulation").mockResolvedValue({
      ok: false,
      code: "SIMULATION_SAVE_FAILED",
      message: "L’enregistrement de la simulation a échoué.",
    });
    const services = createMemoryAppServices();
    const campaign = await prepareReadyCampaign(services);
    const { user } = await openSimulation(services);
    await selectCampaign(user, campaign.id);
    await validateAndLaunch(user);
    await user.click(screen.getByTestId("simulation-save"));
    await screen.findByTestId("simulation-save-error");
    expect(screen.getByTestId("simulation-save-error")).toHaveTextContent(
      /n’a pas pu être enregistrée/,
    );
    expect(screen.getByTestId("simulation-save-error").textContent).not.toMatch(
      /SQLITE/i,
    );
    vi.restoreAllMocks();
  });

  it("redevient enregistrable après nouvelle exécution", async () => {
    const services = createMemoryAppServices();
    const campaign = await prepareReadyCampaign(services);
    const { user } = await openSimulation(services);
    await selectCampaign(user, campaign.id);
    await validateAndLaunch(user);
    await user.click(screen.getByTestId("simulation-save"));
    await screen.findByTestId("simulation-save-already-saved");
    await user.click(screen.getByTestId("simulation-launch"));
    await waitFor(() => {
      expect(screen.getByTestId("simulation-execution-status")).toHaveTextContent(
        /séquence #2/,
      );
    });
    expect(screen.getByTestId("simulation-save")).toBeEnabled();
  });
});

describe("Lot 2B-4B — page Historique", () => {
  async function openHistory(services = createMemoryAppServices()) {
    const user = userEvent.setup();
    render(<App services={services} />);
    await screen.findByRole("navigation", { name: "Navigation principale" });
    await user.click(
      screen.getByRole("button", { name: "Historique simulations" }),
    );
    return { user, services };
  }

  it("est accessible depuis la navigation", async () => {
    await openHistory();
    expect(
      screen.getByRole("heading", {
        name: "Historique des simulations",
        level: 1,
      }),
    ).toBeInTheDocument();
  });

  it("affiche l’état vide sans enregistrement", async () => {
    const services = createMemoryAppServices();
    const campaign = await prepareReadyCampaign(services);
    const { user } = await openHistory(services);
    await user.selectOptions(
      await screen.findByTestId("simulation-history-campaign"),
      String(campaign.id),
    );
    await screen.findByTestId("simulation-history-empty");
  });

  it("liste un run après sauvegarde depuis Simulation", async () => {
    const services = createMemoryAppServices();
    const campaign = await prepareReadyCampaign(services);
    const { user } = await openSimulation(services);
    await selectCampaign(user, campaign.id);
    await validateAndLaunch(user);
    await user.click(screen.getByTestId("simulation-save"));
    await screen.findByTestId("simulation-save-success");

    await user.click(
      screen.getByRole("button", { name: "Historique simulations" }),
    );
    await user.selectOptions(
      await screen.findByTestId("simulation-history-campaign"),
      String(campaign.id),
    );
    await screen.findByTestId("simulation-history-table");
    expect(screen.getByTestId("simulation-history-row-1")).toBeInTheDocument();
    expect(screen.getByTestId("simulation-history-budget-1")).toHaveTextContent(
      /25[\s\u202F]?000[\s\u202F]?003/,
    );
  });

  it("ouvre un détail historique sans relancer le moteur", async () => {
    const engineSpy = vi.spyOn(
      calculation,
      "calculatePreparedPopulationCompensation",
    );
    const services = createMemoryAppServices();
    const campaign = await prepareReadyCampaign(services);
    const saved = await services.simulationHistory.saveSimulationRun({
      campaignId: campaign.id,
      expectedCampaignStatus: "active",
      expectedCurrentImportBatchId: 1,
      campaignName: campaign.name,
      campaignYear: 2027,
      campaignStatusAtRun: "active",
      evaluationMode: "none",
      sourceImportBatchId: 1,
      sourceImportFileName: "pop.xlsx",
      sourceFingerprint: "fp",
      configurationFingerprint: "cfg",
      budgetTargetMode: "manual_amount",
      manualBudgetFcfaText: "25000003",
      eligiblePayrollFcfaText: null,
      budgetRateBasisPoints: null,
      budgetTargetNumeratorText: "25000003",
      budgetTargetDenominatorText: "1",
      roundingMode: "nearest_half_up",
      roundingStepFcfaText: "100",
      employeeCount: 1,
      positiveWeightEmployeeCount: 1,
      zeroWeightEmployeeCount: 0,
      confirmedUnderperformerCount: 0,
      theoreticalTotalNumeratorText: "25000003",
      theoreticalTotalDenominatorText: "1",
      actualOperationAmountFcfaText: "25000000",
      totalRoundingDeltaNumeratorText: "-3",
      totalRoundingDeltaDenominatorText: "1",
      employees: [],
    });
    const { user } = await openHistory(services);
    await user.selectOptions(
      await screen.findByTestId("simulation-history-campaign"),
      String(campaign.id),
    );
    await screen.findByTestId(`simulation-history-open-${saved.runNumber}`);
    await user.click(
      screen.getByTestId(`simulation-history-open-${saved.runNumber}`),
    );
    await screen.findByTestId("simulation-history-readonly-badge");
    expect(engineSpy).not.toHaveBeenCalled();
    engineSpy.mockRestore();
  });

  it("permet de consulter une campagne archivée", async () => {
    const services = createMemoryAppServices();
    const campaign = await prepareReadyCampaign(services);
    await services.campaign.archiveCampaign(campaign.id);
    const { user } = await openHistory(services);
    await user.selectOptions(
      await screen.findByTestId("simulation-history-campaign"),
      String(campaign.id),
    );
    expect(
      screen.getByTestId("simulation-history-archived-badge"),
    ).toBeInTheDocument();
  });

  it("affiche la trajectoire mensuelle v3 dans le détail salarié", async () => {
    const services = createMemoryAppServices();
    const campaign = await prepareReadyCampaign(services);
    const { user } = await openSimulation(services);
    await selectCampaign(user, campaign.id);
    await validateAndLaunch(user);
    await user.click(screen.getByTestId("simulation-save"));
    await screen.findByTestId("simulation-save-success");

    await user.click(
      screen.getByRole("button", { name: "Historique simulations" }),
    );
    await user.selectOptions(
      await screen.findByTestId("simulation-history-campaign"),
      String(campaign.id),
    );
    await screen.findByTestId("simulation-history-open-1");
    await user.click(screen.getByTestId("simulation-history-open-1"));
    await screen.findByTestId("simulation-history-readonly-badge");
    expect(
      screen.queryByTestId("simulation-history-detail-compat"),
    ).not.toBeInTheDocument();
    await user.click(screen.getByTestId("simulation-history-employee-open-A-1"));
    await screen.findByTestId("simulation-history-detail-months-table");
  });

  it("réinitialise l’état de sauvegarde session au remontage", async () => {
    const services = createMemoryAppServices();
    const campaign = await prepareReadyCampaign(services);
    const user = userEvent.setup();
    const view = render(<App services={services} />);
    await screen.findByRole("navigation", { name: "Navigation principale" });
    await user.click(screen.getByRole("button", { name: "Simulation" }));
    await selectCampaign(user, campaign.id);
    await validateAndLaunch(user);
    await user.click(screen.getByTestId("simulation-save"));
    await screen.findByTestId("simulation-save-already-saved");
    view.unmount();
    render(<App services={services} />);
    await screen.findByRole("navigation", { name: "Navigation principale" });
    await user.click(screen.getByRole("button", { name: "Simulation" }));
    await selectCampaign(user, campaign.id);
    expect(screen.queryByTestId("simulation-save-already-saved")).not.toBeInTheDocument();
  });
});
