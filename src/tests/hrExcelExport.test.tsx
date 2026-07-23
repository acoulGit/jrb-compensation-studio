/** Tests frontend de l’export Excel RH (Lot 2B-E1). */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppDataProvider } from "../app/AppDataProvider";
import { AppNavigationProvider } from "../app/AppNavigationProvider";
import { SimulationHistoryRefreshProvider } from "../app/SimulationHistoryRefreshProvider";
import { SimulationHistoryPage } from "../pages/SimulationHistoryPage";
import { SimulationExcelExportDialog } from "../pages/simulation/SimulationExcelExportDialog";
import { createMemoryAppServices } from "../services/createAppServices";
import {
  buildSuggestedFileName,
  formatExportDate,
  sanitizeFileComponent,
} from "../application/campaignSimulation/hrExcelExportModels";
import {
  isCancelledMessage,
  looksLikePasswordLeak,
  validateExportPasswordOptions,
} from "../application/campaignSimulation/hrExcelExportErrorMessages";
import { canPresentResultSchemaVersion } from "../application/campaignSimulation/resultSchemaCompatibility";
import type { PersistedSimulationRunSummary } from "../application/campaignSimulation/simulationPersistenceModels";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

const invokeMock = vi.mocked(invoke);
const saveMock = vi.mocked(save);

const GENERATED_PASSWORD = "GenMdp24Carac@resXY7";

function defaultInvoke(command: string, args?: unknown) {
  if (command === "generate_hr_export_password") {
    return Promise.resolve({
      password: GENERATED_PASSWORD,
      length: GENERATED_PASSWORD.length,
    });
  }
  if (command === "export_simulation_run_excel") {
    const input = ((args as Record<string, unknown>)?.input ?? {}) as {
      outputPath?: string;
      password?: string | null;
    };
    return Promise.resolve({
      outputPath: input.outputPath ?? "C:/tmp/export.xlsx",
      fileName: "export.xlsx",
      sizeBytes: 2048,
      protected: input.password != null,
      employeeCount: 1,
      monthRowCount: 12,
    });
  }
  return Promise.reject(new Error(`Commande inattendue : ${command}`));
}

beforeEach(() => {
  invokeMock.mockReset();
  saveMock.mockReset();
  invokeMock.mockImplementation((command: string, args?: unknown) =>
    defaultInvoke(command, args),
  );
  saveMock.mockResolvedValue("C:/tmp/JRB_Compensation_Test_Run_1_2027-01-01.xlsx");
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1) Unités : validation & noms de fichier
// ---------------------------------------------------------------------------

describe("validateExportPasswordOptions", () => {
  it("valide un mot de passe conforme", () => {
    expect(
      validateExportPasswordOptions({
        protect: true,
        password: "MotDePasse123!",
        confirmation: "MotDePasse123!",
      }),
    ).toEqual({ ok: true });
  });

  it("rejette un mot de passe vide", () => {
    const result = validateExportPasswordOptions({
      protect: true,
      password: "",
      confirmation: "",
    });
    expect(result.ok).toBe(false);
  });

  it("rejette un mot de passe uniquement composé d’espaces", () => {
    const result = validateExportPasswordOptions({
      protect: true,
      password: "              ",
      confirmation: "              ",
    });
    expect(result).toEqual({
      ok: false,
      message: expect.stringMatching(/espaces/),
    });
  });

  it("rejette un mot de passe trop court", () => {
    const result = validateExportPasswordOptions({
      protect: true,
      password: "court",
      confirmation: "court",
    });
    expect(result).toEqual({
      ok: false,
      message: expect.stringMatching(/12 caractères/),
    });
  });

  it("rejette une confirmation différente", () => {
    const result = validateExportPasswordOptions({
      protect: true,
      password: "MotDePasse123!",
      confirmation: "AutreMotDePasse!",
    });
    expect(result).toEqual({
      ok: false,
      message: expect.stringMatching(/confirmation/),
    });
  });

  it("ignore la validation quand protect est faux", () => {
    expect(
      validateExportPasswordOptions({
        protect: false,
        password: "",
        confirmation: "",
      }),
    ).toEqual({ ok: true });
  });
});

describe("buildSuggestedFileName / sanitizeFileComponent", () => {
  it("construit un nom conforme au format Rust", () => {
    expect(
      buildSuggestedFileName({
        campaignName: "Campagne 2027",
        runNumber: 3,
        createdAtIso: "2027-05-10T08:30:00.000Z",
      }),
    ).toBe("JRB_Compensation_Campagne_2027_Run_3_2027-05-10.xlsx");
  });

  it("neutralise les caractères réservés Windows", () => {
    expect(sanitizeFileComponent('a<b>c:d"e/f\\g|h?i*j')).toBe(
      "a_b_c_d_e_f_g_h_i_j",
    );
  });

  it("retire les points et underscores en bordure et gère le vide", () => {
    expect(sanitizeFileComponent("...__")).toBe("NA");
    expect(sanitizeFileComponent("  .nom.  ")).toBe("nom");
  });

  it("formate la date du jour quand createdAt est absent", () => {
    expect(formatExportDate(null)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(formatExportDate("valeur-invalide")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("détecteurs défensifs", () => {
  it("détecte les messages d’annulation", () => {
    expect(isCancelledMessage("L’export a été annulé.")).toBe(true);
    expect(isCancelledMessage("cancelled by user")).toBe(true);
    expect(isCancelledMessage("Une erreur de disque.")).toBe(false);
  });

  it("détecte une fuite de mot de passe", () => {
    const pwd = "MotDePasseTresLong123";
    expect(looksLikePasswordLeak(`Erreur ${pwd}`, pwd)).toBe(true);
    expect(looksLikePasswordLeak("Erreur générique", pwd)).toBe(false);
    expect(looksLikePasswordLeak("Erreur", null)).toBe(false);
  });
});

describe("canPresentResultSchemaVersion", () => {
  it("autorise v3 uniquement", () => {
    expect(canPresentResultSchemaVersion(3)).toBe(true);
    expect(canPresentResultSchemaVersion(2)).toBe(false);
    expect(canPresentResultSchemaVersion(1)).toBe(false);
    expect(canPresentResultSchemaVersion(99)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2) Composant : SimulationExcelExportDialog isolé
// ---------------------------------------------------------------------------

const FAKE_RUN: PersistedSimulationRunSummary = {
  id: 42,
  campaignId: 1,
  runNumber: 1,
  resultSchemaVersion: 3,
  campaignName: "Campagne Démo",
  campaignYear: 2027,
  campaignStatusAtRun: "active",
  evaluationMode: "none",
  sourceImportBatchId: null,
  sourceImportFileName: null,
  sourceFingerprint: "fp",
  configurationFingerprint: "cfg",
  budgetTargetMode: "manual_amount",
  manualBudgetFcfa: null,
  eligiblePayrollFcfa: null,
  budgetRateBasisPoints: null,
  exactBudgetTarget: { numerator: 0n, denominator: 1n },
  roundingMode: "nearest_half_up",
  roundingStepFcfa: 100n,
  employeeCount: 1,
  positiveWeightEmployeeCount: 1,
  zeroWeightEmployeeCount: 0,
  confirmedUnderperformerCount: 0,
  theoreticalAllocatedTotal: { numerator: 0n, denominator: 1n },
  actualOperationAmountFcfa: 0n,
  totalRoundingDelta: { numerator: 0n, denominator: 1n },
  createdAt: "2027-01-01T00:00:00.000Z",
};

function renderDialog(
  overrides: Partial<
    Parameters<typeof SimulationExcelExportDialog>[0]
  > = {},
) {
  const onExport = vi.fn();
  const onClose = vi.fn();
  const onGeneratePassword = vi.fn().mockResolvedValue(GENERATED_PASSWORD);
  render(
    <SimulationExcelExportDialog
      open
      run={FAKE_RUN}
      exporting={false}
      onClose={onClose}
      onExport={onExport}
      onGeneratePassword={onGeneratePassword}
      {...overrides}
    />,
  );
  return { onExport, onClose, onGeneratePassword };
}

describe("SimulationExcelExportDialog", () => {
  it("coche la protection par défaut et affiche les champs mot de passe", () => {
    renderDialog();
    expect(screen.getByTestId("simulation-excel-export-protect")).toBeChecked();
    expect(
      screen.getByTestId("simulation-excel-export-password"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("simulation-excel-export-password-confirm"),
    ).toBeInTheDocument();
  });

  it("valide côté client avant d’exporter (trop court)", async () => {
    const user = userEvent.setup();
    const { onExport } = renderDialog();
    await user.type(
      screen.getByTestId("simulation-excel-export-password"),
      "court",
    );
    await user.type(
      screen.getByTestId("simulation-excel-export-password-confirm"),
      "court",
    );
    await user.click(screen.getByTestId("simulation-excel-export-submit"));
    expect(
      screen.getByTestId("simulation-excel-export-validation"),
    ).toHaveTextContent(/12 caractères/);
    expect(onExport).not.toHaveBeenCalled();
  });

  it("appelle onExport avec un mot de passe valide", async () => {
    const user = userEvent.setup();
    const { onExport } = renderDialog();
    await user.type(
      screen.getByTestId("simulation-excel-export-password"),
      "MotDePasse123!",
    );
    await user.type(
      screen.getByTestId("simulation-excel-export-password-confirm"),
      "MotDePasse123!",
    );
    await user.click(screen.getByTestId("simulation-excel-export-submit"));
    expect(onExport).toHaveBeenCalledWith({
      protect: true,
      password: "MotDePasse123!",
      confirmUnprotected: false,
    });
  });

  it("génère et remplit le mot de passe", async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByTestId("simulation-excel-export-generate"));
    await waitFor(() => {
      expect(
        screen.getByTestId("simulation-excel-export-password"),
      ).toHaveValue(GENERATED_PASSWORD);
    });
    expect(
      screen.getByTestId("simulation-excel-export-password-confirm"),
    ).toHaveValue(GENERATED_PASSWORD);
  });

  it("bascule l’affichage du mot de passe", async () => {
    const user = userEvent.setup();
    renderDialog();
    const field = screen.getByTestId("simulation-excel-export-password");
    expect(field).toHaveAttribute("type", "password");
    await user.click(
      screen.getByTestId("simulation-excel-export-toggle-visibility"),
    );
    expect(field).toHaveAttribute("type", "text");
  });

  it("exige la confirmation d’export sans protection", async () => {
    const user = userEvent.setup();
    const { onExport } = renderDialog();
    await user.click(screen.getByTestId("simulation-excel-export-protect"));
    expect(
      screen.getByTestId("simulation-excel-export-warning"),
    ).toBeInTheDocument();
    await user.click(screen.getByTestId("simulation-excel-export-submit"));
    expect(
      screen.getByTestId("simulation-excel-export-validation"),
    ).toBeInTheDocument();
    expect(onExport).not.toHaveBeenCalled();

    await user.click(
      screen.getByTestId("simulation-excel-export-confirm-unprotected"),
    );
    await user.click(screen.getByTestId("simulation-excel-export-submit"));
    expect(onExport).toHaveBeenCalledWith({
      protect: false,
      password: "",
      confirmUnprotected: true,
    });
  });

  it("ferme via Échap lorsque non occupé", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("ne ferme pas via Échap pendant un export", async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog({ exporting: true });
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3) Intégration : SimulationHistoryPage
// ---------------------------------------------------------------------------

type MemoryServices = ReturnType<typeof createMemoryAppServices>;

async function seedRun(
  services: MemoryServices,
  campaignId: number,
  resultSchemaVersion: number,
) {
  return services.simulationHistory.saveSimulationRun({
    campaignId,
    expectedCampaignStatus: "active",
    expectedCurrentImportBatchId: null,
    campaignName: "Campagne Export",
    campaignYear: 2027,
    campaignStatusAtRun: "active",
    evaluationMode: "none",
    sourceImportBatchId: null,
    sourceImportFileName: "pop.xlsx",
    sourceFingerprint: "fp",
    configurationFingerprint: "cfg",
    budgetTargetMode: "manual_amount",
    manualBudgetFcfaText: "25000000",
    eligiblePayrollFcfaText: null,
    budgetRateBasisPoints: null,
    budgetTargetNumeratorText: "25000000",
    budgetTargetDenominatorText: "1",
    roundingMode: "nearest_half_up",
    roundingStepFcfaText: "100",
    employeeCount: 1,
    positiveWeightEmployeeCount: 1,
    zeroWeightEmployeeCount: 0,
    confirmedUnderperformerCount: 0,
    theoreticalTotalNumeratorText: "25000000",
    theoreticalTotalDenominatorText: "1",
    actualOperationAmountFcfaText: "25000000",
    totalRoundingDeltaNumeratorText: "0",
    totalRoundingDeltaDenominatorText: "1",
    resultSchemaVersion,
    employees: [],
  });
}

async function setupPage(schemaVersions: number[]) {
  const services = createMemoryAppServices();
  const campaign = await services.campaign.createCampaign({
    name: "Campagne Export",
    referenceYear: 2027,
    notes: "",
  });
  for (const version of schemaVersions) {
    await seedRun(services, campaign.id, version);
  }
  const user = userEvent.setup();
  render(
    <AppDataProvider services={services}>
      <AppNavigationProvider
        activePage="simulation-history"
        onActivePageChange={() => {}}
      >
        <SimulationHistoryRefreshProvider>
          <SimulationHistoryPage />
        </SimulationHistoryRefreshProvider>
      </AppNavigationProvider>
    </AppDataProvider>,
  );
  await user.selectOptions(
    await screen.findByTestId("simulation-history-campaign"),
    String(campaign.id),
  );
  await screen.findByTestId("simulation-history-table");
  return { services, campaign, user };
}

describe("SimulationHistoryPage — export RH", () => {
  it("active l’export pour un snapshot v3", async () => {
    const { user } = await setupPage([3]);
    const button = screen.getByTestId("simulation-history-export-1");
    expect(button).toBeEnabled();
    await user.click(button);
    expect(
      screen.getByTestId("simulation-excel-export-dialog"),
    ).toBeInTheDocument();
  });

  it("désactive l’export pour un snapshot v2 avec indication", async () => {
    await setupPage([2]);
    const button = screen.getByTestId("simulation-history-export-1");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", expect.stringMatching(/indisponible/));
  });

  it("n’ouvre pas le détail lors du clic sur Export", async () => {
    const { user } = await setupPage([3]);
    await user.click(screen.getByTestId("simulation-history-export-1"));
    expect(
      screen.queryByTestId("simulation-history-readonly-badge"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTestId("simulation-excel-export-dialog"),
    ).toBeInTheDocument();
  });

  it("n’affiche pas d’erreur si l’utilisateur annule la destination", async () => {
    saveMock.mockResolvedValueOnce(null);
    const { user } = await setupPage([3]);
    await user.click(screen.getByTestId("simulation-history-export-1"));
    await user.type(
      screen.getByTestId("simulation-excel-export-password"),
      "MotDePasse123!",
    );
    await user.type(
      screen.getByTestId("simulation-excel-export-password-confirm"),
      "MotDePasse123!",
    );
    await user.click(screen.getByTestId("simulation-excel-export-submit"));
    await waitFor(() => {
      expect(
        screen.queryByTestId("simulation-excel-export-dialog"),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.getByTestId("simulation-history-export-status"),
    ).toHaveTextContent("");
    expect(invokeMock).not.toHaveBeenCalledWith(
      "export_simulation_run_excel",
      expect.anything(),
    );
  });

  it("exporte avec succès et ne conserve pas le mot de passe", async () => {
    const { user } = await setupPage([3]);
    await user.click(screen.getByTestId("simulation-history-export-1"));
    await user.type(
      screen.getByTestId("simulation-excel-export-password"),
      "MotDePasse123!",
    );
    await user.type(
      screen.getByTestId("simulation-excel-export-password-confirm"),
      "MotDePasse123!",
    );
    await user.click(screen.getByTestId("simulation-excel-export-submit"));

    await waitFor(() => {
      expect(
        screen.getByTestId("simulation-history-export-status"),
      ).toHaveTextContent(/exporté/);
    });
    await waitFor(() => {
      expect(
        screen.queryByTestId("simulation-excel-export-dialog"),
      ).not.toBeInTheDocument();
    });

    const exportCall = invokeMock.mock.calls.find(
      (call) => call[0] === "export_simulation_run_excel",
    );
    expect(exportCall).toBeDefined();
    expect((exportCall?.[1] as { input: { password: string | null } }).input.password).toBe(
      "MotDePasse123!",
    );

    // Réouverture : champs vierges (aucun mot de passe conservé).
    await user.click(screen.getByTestId("simulation-history-export-1"));
    expect(
      screen.getByTestId("simulation-excel-export-password"),
    ).toHaveValue("");
  });

  it("empêche un double export simultané", async () => {
    let resolveExport: (value: unknown) => void = () => {};
    invokeMock.mockImplementation((command: string, args?: unknown) => {
      if (command === "export_simulation_run_excel") {
        return new Promise((resolve) => {
          resolveExport = resolve;
        });
      }
      return defaultInvoke(command, args);
    });

    const { user } = await setupPage([3]);
    await user.click(screen.getByTestId("simulation-history-export-1"));
    await user.type(
      screen.getByTestId("simulation-excel-export-password"),
      "MotDePasse123!",
    );
    await user.type(
      screen.getByTestId("simulation-excel-export-password-confirm"),
      "MotDePasse123!",
    );
    const submit = screen.getByTestId("simulation-excel-export-submit");
    await user.click(submit);

    await waitFor(() => {
      expect(submit).toHaveAttribute("aria-busy", "true");
    });
    expect(submit).toBeDisabled();
    await user.click(submit);

    const exportCalls = invokeMock.mock.calls.filter(
      (call) => call[0] === "export_simulation_run_excel",
    );
    expect(exportCalls).toHaveLength(1);

    resolveExport({
      outputPath: "C:/tmp/export.xlsx",
      fileName: "export.xlsx",
      sizeBytes: 2048,
      protected: true,
      employeeCount: 1,
      monthRowCount: 12,
    });
    await waitFor(() => {
      expect(
        screen.getByTestId("simulation-history-export-status"),
      ).toHaveTextContent(/exporté/);
    });
  });
});
