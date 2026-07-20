import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import App from "../App";
import * as calculation from "../domain/compensationCalculation";
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
  return {
    arrayBuffer,
    fileName,
    fileSizeBytes: arrayBuffer.byteLength,
  };
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
    [FR_HEADERS, validRow({ matricule: "A-1" }), validRow({ matricule: "B-2", famille: "F2" })],
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
  name = "Campagne simulation",
) {
  const campaign = await services.campaign.createCampaign({
    name,
    referenceYear: 2026,
    notes: "",
  });
  await fillAllS0(services, campaign.id);
  await services.compensationReference.updateNineBoxMode(campaign.id, "none");
  await importPopulation(services, campaign.id);
  await services.campaign.activateCampaign(campaign.id);
  return campaign;
}

async function openSimulation(
  services = createMemoryAppServices(),
) {
  const user = userEvent.setup();
  render(<App services={services} />);
  await screen.findByRole("navigation", { name: "Navigation principale" });
  await user.click(screen.getByRole("button", { name: "Simulation" }));
  await screen.findByRole("heading", { name: "Simulation", level: 1 });
  return { user, services };
}

describe("Lot 2B-2 — page Simulation", () => {
  it("est accessible depuis la navigation", async () => {
    await openSimulation();
    expect(
      screen.getByRole("heading", { name: "Simulation", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Campagne", level: 2 })).toBeInTheDocument();
  });

  it("affiche un état vide sans campagne", async () => {
    await openSimulation();
    expect(screen.getByText("Aucune campagne")).toBeInTheDocument();
  });

  it("autorise draft et active, lecture seule pour archivée", async () => {
    const services = createMemoryAppServices();
    const draft = await services.campaign.createCampaign({
      name: "Brouillon sim",
      referenceYear: 2026,
      notes: "",
    });
    await fillAllS0(services, draft.id);
    await services.compensationReference.updateNineBoxMode(draft.id, "none");
    await importPopulation(services, draft.id);

    const active = await prepareReadyCampaign(services, "Active sim");
    const archived = await services.campaign.createCampaign({
      name: "Archivée sim",
      referenceYear: 2025,
      notes: "",
    });
    await fillAllS0(services, archived.id);
    await services.compensationReference.updateNineBoxMode(archived.id, "none");
    await importPopulation(services, archived.id);
    await services.campaign.archiveCampaign(archived.id);

    const { user } = await openSimulation(services);
    const select = await screen.findByTestId("simulation-campaign-select");

    await user.selectOptions(select, String(draft.id));
    await waitFor(() => {
      expect(screen.getByTestId("simulation-campaign-status")).toHaveTextContent(
        "Brouillon",
      );
    });
    expect(screen.getByTestId("simulation-validate")).toBeDisabled();

    await user.selectOptions(select, String(active.id));
    await waitFor(() => {
      expect(screen.getByTestId("simulation-campaign-status")).toHaveTextContent(
        "Active",
      );
    });

    await user.selectOptions(select, String(archived.id));
    await waitFor(() => {
      expect(screen.getByTestId("simulation-readonly")).toBeInTheDocument();
    });
    expect(screen.getByTestId("simulation-validate")).toBeDisabled();
  });

  it("isole les brouillons par campagne et invalide après modification", async () => {
    const services = createMemoryAppServices();
    const first = await prepareReadyCampaign(services, "Campagne A");
    const second = await prepareReadyCampaign(services, "Campagne B");
    const { user } = await openSimulation(services);
    const select = await screen.findByTestId("simulation-campaign-select");

    await user.selectOptions(select, String(first.id));
    await user.click(screen.getByTestId("simulation-budget-mode-manual"));
    await user.type(screen.getByTestId("simulation-manual-budget"), "25000003");
    await user.click(screen.getByTestId("simulation-rounding-suggest-100"));

    await waitFor(() => {
      expect(screen.getByTestId("simulation-budget-preview")).toHaveTextContent(
        "25",
      );
    });
    expect(screen.getByTestId("simulation-budget-preview").textContent).toMatch(
      /25[\s\u202F]?000[\s\u202F]?003/,
    );

    await waitFor(() => {
      expect(screen.getByTestId("simulation-validate")).not.toBeDisabled();
    });
    await user.click(screen.getByTestId("simulation-validate"));
    await screen.findByTestId("simulation-validation-success");
    expect(
      screen.getByText(/Aucun calcul n’a encore été lancé/),
    ).toBeInTheDocument();

    await user.clear(screen.getByTestId("simulation-manual-budget"));
    await user.type(screen.getByTestId("simulation-manual-budget"), "30000000");
    await screen.findByTestId("simulation-validation-stale");

    await user.selectOptions(select, String(second.id));
    await waitFor(() => {
      expect(
        screen.getByTestId("simulation-budget-mode-manual"),
      ).not.toBeChecked();
    });
    expect(screen.queryByTestId("simulation-manual-budget")).not.toBeInTheDocument();
    expect(screen.queryByTestId("simulation-validation-success")).not.toBeInTheDocument();

    await user.selectOptions(select, String(first.id));
    await waitFor(() => {
      expect(screen.getByTestId("simulation-manual-budget")).toHaveValue(
        "30000000",
      );
    });
  });

  it("calcule un budget fractionnaire sans arrondi et sans lancer le moteur", async () => {
    const spy = vi.spyOn(
      calculation,
      "calculatePreparedPopulationCompensation",
    );
    const services = createMemoryAppServices();
    await prepareReadyCampaign(services);
    const { user } = await openSimulation(services);

    await user.click(screen.getByTestId("simulation-budget-mode-percent"));
    await user.type(screen.getByTestId("simulation-eligible-payroll"), "250623");
    await user.type(screen.getByTestId("simulation-budget-rate"), "4");
    await user.click(screen.getByTestId("simulation-rounding-suggest-5"));

    await waitFor(() => {
      expect(screen.getByTestId("simulation-budget-preview")).toHaveTextContent(
        "10",
      );
    });
    expect(screen.getByTestId("simulation-budget-preview").textContent).toMatch(
      /10[\s\u202F]?024,92/,
    );
    expect(screen.getByTestId("simulation-rounding-mode")).toHaveTextContent(
      "nearest_half_up",
    );
    expect(spy).not.toHaveBeenCalled();
    expect(
      screen.queryByText(/finalRoundedIncreaseAmountFcfa/),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("simulation-next-lot-hint")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("désactive la validation si configuration incomplète", async () => {
    const services = createMemoryAppServices();
    await prepareReadyCampaign(services);
    await openSimulation(services);
    await waitFor(() => {
      expect(screen.getByTestId("simulation-population-badge")).toHaveTextContent(
        "Prêt",
      );
    });
    expect(screen.getByTestId("simulation-validate")).toBeDisabled();
  });

  it("réinitialise la configuration au remontage du provider", async () => {
    const services = createMemoryAppServices();
    await prepareReadyCampaign(services);
    const user = userEvent.setup();
    const view = render(<App services={services} />);
    await screen.findByRole("navigation", { name: "Navigation principale" });
    await user.click(screen.getByRole("button", { name: "Simulation" }));
    await user.click(await screen.findByTestId("simulation-budget-mode-manual"));
    await user.type(screen.getByTestId("simulation-manual-budget"), "1000");
    expect(screen.getByTestId("simulation-manual-budget")).toHaveValue("1000");

    view.unmount();
    render(<App services={services} />);
    await screen.findByRole("navigation", { name: "Navigation principale" });
    await user.click(screen.getByRole("button", { name: "Simulation" }));
    await waitFor(() => {
      expect(
        screen.getByTestId("simulation-budget-mode-manual"),
      ).not.toBeChecked();
    });
    expect(screen.queryByTestId("simulation-manual-budget")).not.toBeInTheDocument();
  });

  it("regroupe les issues et préserve les labels accessibles", async () => {
    const services = createMemoryAppServices();
    const campaign = await services.campaign.createCampaign({
      name: "Incomplète",
      referenceYear: 2026,
      notes: "",
    });
    const { user } = await openSimulation(services);
    await user.selectOptions(
      await screen.findByTestId("simulation-campaign-select"),
      String(campaign.id),
    );
    await waitFor(() => {
      expect(screen.getByTestId("simulation-issues")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Pas d’arrondi — FCFA")).toBeInTheDocument();
    expect(screen.getByLabelText("Campagne")).toBeInTheDocument();
  });
});
