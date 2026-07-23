import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { AppDataProvider } from "../app/AppDataProvider";
import { CompensationReferenceProvider } from "../app/CompensationReferenceProvider";
import { HrImportProvider } from "../app/HrImportProvider";
import { SimulationConfigurationProvider } from "../app/SimulationConfigurationProvider";
import {
  SimulationExecutionProvider,
  useSimulationExecution,
} from "../app/SimulationExecutionProvider";
import { useSimulationConfiguration } from "../app/SimulationConfigurationProvider";
import { createMemoryAppServices } from "../services/createAppServices";
import * as calculation from "../domain/compensationCalculation";
import * as XLSX from "xlsx";

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

async function prepareReadyCampaign(
  services: ReturnType<typeof createMemoryAppServices>,
  name = "Campagne exec",
) {
  const campaign = await services.campaign.createCampaign({
    name,
    referenceYear: 2027,
    notes: "",
  });
  await fillAllS0(services, campaign.id);
  await services.compensationReference.updateNineBoxMode(campaign.id, "none");
  const file = sheetToBuffer(
    [
      FR_HEADERS,
      validRow({ matricule: "A-1", nom: "Alice" }),
      validRow({ matricule: "B-2", nom: "Bob", famille: "F2" }),
    ],
    "pop.xlsx",
  );
  const parsed = await services.hrImport.parseFile(file);
  const mapping = services.hrImport.buildAutoMapping(FR_HEADERS);
  await services.hrImport.confirmImport({
    campaignId: campaign.id,
    fileName: parsed.fileName,
    format: parsed.format,
    sheetName: parsed.sheets[0].name,
    fileSizeBytes: file.fileSizeBytes,
    rows: parsed.sheets[0].rows,
    headerRowIndex: 0,
    mapping,
  });
  await services.campaign.activateCampaign(campaign.id);
  return campaign;
}

function createWrapper(services: ReturnType<typeof createMemoryAppServices>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <AppDataProvider services={services}>
        <CompensationReferenceProvider>
          <HrImportProvider>
            <SimulationConfigurationProvider>
              <SimulationExecutionProvider>
                {children}
              </SimulationExecutionProvider>
            </SimulationConfigurationProvider>
          </HrImportProvider>
        </CompensationReferenceProvider>
      </AppDataProvider>
    );
  };
}

describe("Lot 2B-3 — SimulationExecutionProvider", () => {
  it("passe idle → success, isole par campagne et marque stale", async () => {
    const services = createMemoryAppServices();
    const first = await prepareReadyCampaign(services, "Campagne A");
    const second = await prepareReadyCampaign(services, "Campagne B");

    const { result } = renderHook(
      () => ({
        config: useSimulationConfiguration(),
        exec: useSimulationExecution(),
      }),
      { wrapper: createWrapper(services) },
    );

    await waitFor(() => {
      expect(result.current.config.selectedCampaignId).not.toBeNull();
    });

    await act(async () => {
      result.current.config.selectCampaign(first.id);
    });
    await waitFor(() => {
      expect(result.current.config.readinessStatus).toBe("ready");
    });

    await act(async () => {
      result.current.config.setBudgetTargetMode("manual_amount");
      result.current.config.setManualBudgetInput("25000003");
      result.current.config.applyRoundingStepSuggestion("100");
    });
    await waitFor(() => {
      expect(result.current.config.canValidate).toBe(true);
    });

    expect(result.current.exec.execution.status).toBe("idle");

    await act(async () => {
      await result.current.config.validateConfiguration();
    });
    await waitFor(() => {
      expect(result.current.config.validationStatus).toBe("validated");
    });

    const spy = vi.spyOn(
      calculation,
      "calculatePreparedPopulationCompensation",
    );
    await act(async () => {
      const ok = await result.current.exec.launchSimulation();
      expect(ok).toBe(true);
    });
    await waitFor(() => {
      expect(result.current.exec.execution.status).toBe("success");
    });
    expect(result.current.exec.execution.runSequence).toBe(1);
    expect(result.current.exec.execution.result?.campaignId).toBe(first.id);
    expect(spy).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.config.selectCampaign(second.id);
    });
    await waitFor(() => {
      expect(result.current.exec.execution.status).toBe("idle");
    });
    expect(result.current.exec.execution.result).toBeNull();

    await act(async () => {
      result.current.config.selectCampaign(first.id);
    });
    await waitFor(() => {
      expect(result.current.exec.execution.status).toBe("success");
    });
    expect(result.current.exec.execution.result?.campaignId).toBe(first.id);

    await act(async () => {
      result.current.config.setManualBudgetInput("30000000");
    });
    await waitFor(() => {
      expect(result.current.exec.execution.status).toBe("stale");
    });
    expect(result.current.exec.execution.result).toBeNull();
    expect(result.current.exec.execution.staleResult).not.toBeNull();

    spy.mockRestore();
  });

  it("incrémente runSequence et empêche un second lancement concurrent", async () => {
    const services = createMemoryAppServices();
    await prepareReadyCampaign(services);
    const { result } = renderHook(
      () => ({
        config: useSimulationConfiguration(),
        exec: useSimulationExecution(),
      }),
      { wrapper: createWrapper(services) },
    );

    await waitFor(() => {
      expect(result.current.config.readinessStatus).toBe("ready");
    });
    await act(async () => {
      result.current.config.setBudgetTargetMode("manual_amount");
      result.current.config.setManualBudgetInput("100000");
      result.current.config.applyRoundingStepSuggestion("100");
    });
    await waitFor(() => expect(result.current.config.canValidate).toBe(true));
    await act(async () => {
      await result.current.config.validateConfiguration();
    });

    const spy = vi.spyOn(
      calculation,
      "calculatePreparedPopulationCompensation",
    );

    let firstOk = false;
    let secondOk = true;
    await act(async () => {
      const firstPromise = result.current.exec.launchSimulation();
      const secondPromise = result.current.exec.launchSimulation();
      const [a, b] = await Promise.all([firstPromise, secondPromise]);
      firstOk = a;
      secondOk = b;
    });

    expect(firstOk).toBe(true);
    expect(secondOk).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(result.current.exec.execution.status).toBe("success");
    });
    const firstSeq = result.current.exec.execution.runSequence;

    await act(async () => {
      await result.current.exec.launchSimulation();
    });
    await waitFor(() => {
      expect(result.current.exec.execution.runSequence).toBe(firstSeq + 1);
    });
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it("efface les résultats au remontage (redémarrage simulé)", async () => {
    const services = createMemoryAppServices();
    await prepareReadyCampaign(services);
    const first = renderHook(
      () => ({
        config: useSimulationConfiguration(),
        exec: useSimulationExecution(),
      }),
      { wrapper: createWrapper(services) },
    );
    await waitFor(() => {
      expect(first.result.current.config.readinessStatus).toBe("ready");
    });
    await act(async () => {
      first.result.current.config.setBudgetTargetMode("manual_amount");
      first.result.current.config.setManualBudgetInput("100000");
      first.result.current.config.applyRoundingStepSuggestion("5");
    });
    await waitFor(() => {
      expect(first.result.current.config.canValidate).toBe(true);
    });
    await act(async () => {
      const validated = await first.result.current.config.validateConfiguration();
      expect(validated).toBe(true);
    });
    await waitFor(() => {
      expect(first.result.current.config.validationStatus).toBe("validated");
    });
    await act(async () => {
      const ok = await first.result.current.exec.launchSimulation();
      expect(ok).toBe(true);
    });
    await waitFor(() => {
      expect(first.result.current.exec.execution.status).toBe("success");
    });
    first.unmount();

    const second = renderHook(
      () => ({
        exec: useSimulationExecution(),
      }),
      { wrapper: createWrapper(services) },
    );
    await waitFor(() => {
      expect(second.result.current.exec.execution.status).toBe("idle");
    });
    expect(second.result.current.exec.execution.result).toBeNull();
  });
});
