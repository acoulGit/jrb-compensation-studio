import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  HrImportBatch,
  HrImportColumnKey,
  HrImportColumnMappingEntry,
  HrImportPreview,
  PaginatedPopulation,
  PopulationSummary,
} from "../domain/hrImport/models";
import { cellToText } from "../infrastructure/imports/cellReaders";
import { DEFAULT_POPULATION_PAGE_SIZE } from "../infrastructure/imports/importLimits";
import type { ParsedImportFile } from "../infrastructure/imports/workbookTypes";
import type { Campaign } from "../infrastructure/database/types";
import { toUserMessage } from "../services/errors";
import { sanitizeTechnicalError } from "../services/sanitizeTechnicalError";
import { useAppData } from "./AppDataProvider";

export type HrImportWizardStatus = "idle" | "loading" | "ready" | "error";
export type HrImportPopulationStatus = "idle" | "loading" | "ready" | "error";

interface HrImportContextValue {
  selectedCampaignId: number | null;
  selectedCampaign: Campaign | null;
  isReadOnly: boolean;

  workbook: ParsedImportFile | null;
  sheetName: string | null;
  headerRowIndex: number;
  mapping: HrImportColumnMappingEntry[];
  preview: HrImportPreview | null;
  wizardStatus: HrImportWizardStatus;
  wizardErrorMessage: string | null;

  currentBatch: HrImportBatch | null;
  batches: HrImportBatch[];
  historyStatus: HrImportPopulationStatus;

  population: PaginatedPopulation | null;
  populationSummary: PopulationSummary | null;
  populationStatus: HrImportPopulationStatus;
  populationErrorMessage: string | null;
  populationSearch: string;
  populationPage: number;
  populationPageSize: number;

  activeCampaignPopulationCount: number | null;
  activeCampaignLastImportAt: string | null;

  selectCampaign: (campaignId: number | null) => void;
  selectFile: (file: File) => Promise<void>;
  selectSheet: (sheetName: string) => void;
  setHeaderRow: (index: number) => void;
  setMapping: (
    targetField: HrImportColumnKey,
    sourceIndex: number | null,
  ) => void;
  rebuildPreview: () => Promise<void>;
  confirmImport: () => Promise<void>;
  resetImport: () => void;
  loadPopulation: () => Promise<void>;
  loadHistory: () => Promise<void>;
  setSearch: (value: string) => void;
  setPage: (page: number) => void;
}

const HrImportContext = createContext<HrImportContextValue | null>(null);

function pickDefaultCampaign(campaigns: Campaign[]): Campaign | null {
  const active = campaigns.find((campaign) => campaign.status === "active");
  if (active) return active;
  const drafts = campaigns
    .filter((campaign) => campaign.status === "draft")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  if (drafts[0]) return drafts[0];
  const remaining = [...campaigns].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
  return remaining[0] ?? null;
}

function headerRowToText(rows: unknown[][], headerRowIndex: number): string[] {
  const row = rows[headerRowIndex] ?? [];
  return row.map((cell) => cellToText(cell));
}

interface HrImportProviderProps {
  children: ReactNode;
}

export function HrImportProvider({ children }: HrImportProviderProps) {
  const { status: appStatus, campaigns, activeCampaign, services } =
    useAppData();

  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(
    null,
  );
  const [hasUserSelected, setHasUserSelected] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const [workbook, setWorkbook] = useState<ParsedImportFile | null>(null);
  const [sheetName, setSheetName] = useState<string | null>(null);
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [mapping, setMappingState] = useState<HrImportColumnMappingEntry[]>(
    [],
  );
  const [preview, setPreview] = useState<HrImportPreview | null>(null);
  const [wizardStatus, setWizardStatus] = useState<HrImportWizardStatus>(
    "idle",
  );
  const [wizardErrorMessage, setWizardErrorMessage] = useState<
    string | null
  >(null);

  const [currentBatch, setCurrentBatch] = useState<HrImportBatch | null>(
    null,
  );
  const [batches, setBatches] = useState<HrImportBatch[]>([]);
  const [historyStatus, setHistoryStatus] = useState<HrImportPopulationStatus>(
    "idle",
  );

  const [population, setPopulation] = useState<PaginatedPopulation | null>(
    null,
  );
  const [populationSummary, setPopulationSummary] =
    useState<PopulationSummary | null>(null);
  const [populationStatus, setPopulationStatus] =
    useState<HrImportPopulationStatus>("idle");
  const [populationErrorMessage, setPopulationErrorMessage] = useState<
    string | null
  >(null);
  const [populationSearch, setPopulationSearch] = useState("");
  const [populationPage, setPopulationPage] = useState(0);
  const populationPageSize = DEFAULT_POPULATION_PAGE_SIZE;

  const [activeCampaignPopulationCount, setActiveCampaignPopulationCount] =
    useState<number | null>(null);
  const [activeCampaignLastImportAt, setActiveCampaignLastImportAt] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (appStatus !== "ready" || hasUserSelected) {
      return;
    }
    const preferred = pickDefaultCampaign(campaigns);
    setSelectedCampaignId(preferred?.id ?? null);
  }, [appStatus, campaigns, hasUserSelected]);

  const selectedCampaign = useMemo(
    () =>
      campaigns.find((campaign) => campaign.id === selectedCampaignId) ??
      null,
    [campaigns, selectedCampaignId],
  );

  const isReadOnly = selectedCampaign?.status === "archived";

  const resetWizardState = useCallback(() => {
    setWorkbook(null);
    setSheetName(null);
    setHeaderRowIndex(0);
    setMappingState([]);
    setPreview(null);
    setWizardStatus("idle");
    setWizardErrorMessage(null);
  }, []);

  const loadPopulation = useCallback(async () => {
    if (appStatus !== "ready" || selectedCampaignId === null) {
      setPopulation(null);
      setPopulationSummary(null);
      setPopulationStatus("idle");
      setPopulationErrorMessage(null);
      return;
    }
    setPopulationStatus("loading");
    setPopulationErrorMessage(null);
    try {
      const [page, summary] = await Promise.all([
        services.hrImport.listCurrentPopulation(selectedCampaignId, {
          limit: populationPageSize,
          offset: populationPage * populationPageSize,
          search: populationSearch || undefined,
        }),
        services.hrImport.getPopulationSummary(selectedCampaignId),
      ]);
      setPopulation(page);
      setPopulationSummary(summary);
      setPopulationStatus("ready");
    } catch (error) {
      setPopulation(null);
      setPopulationSummary(null);
      setPopulationStatus("error");
      setPopulationErrorMessage(
        toUserMessage(error, "La population n’a pas pu être chargée."),
      );
    }
  }, [
    appStatus,
    populationPage,
    populationPageSize,
    populationSearch,
    selectedCampaignId,
    services,
  ]);

  const loadHistory = useCallback(async () => {
    if (appStatus !== "ready" || selectedCampaignId === null) {
      setCurrentBatch(null);
      setBatches([]);
      setHistoryStatus("idle");
      return;
    }
    setHistoryStatus("loading");
    try {
      const [batch, list] = await Promise.all([
        services.hrImport.getCurrentBatch(selectedCampaignId),
        services.hrImport.listBatches(selectedCampaignId),
      ]);
      setCurrentBatch(batch);
      setBatches(list);
      setHistoryStatus("ready");
    } catch {
      setCurrentBatch(null);
      setBatches([]);
      setHistoryStatus("error");
    }
  }, [appStatus, selectedCampaignId, services]);

  const refreshActiveCampaignPopulationCount = useCallback(async () => {
    if (appStatus !== "ready" || !activeCampaign) {
      setActiveCampaignPopulationCount(null);
      setActiveCampaignLastImportAt(null);
      return;
    }
    try {
      const [count, batch] = await Promise.all([
        services.hrImport.getCurrentPopulationCount(activeCampaign.id),
        services.hrImport.getCurrentBatch(activeCampaign.id),
      ]);
      setActiveCampaignPopulationCount(count);
      setActiveCampaignLastImportAt(batch?.importedAt ?? null);
    } catch {
      setActiveCampaignPopulationCount(null);
      setActiveCampaignLastImportAt(null);
    }
  }, [activeCampaign, appStatus, services]);

  useEffect(() => {
    void loadPopulation();
  }, [loadPopulation, reloadToken]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory, reloadToken]);

  useEffect(() => {
    void refreshActiveCampaignPopulationCount();
  }, [refreshActiveCampaignPopulationCount, reloadToken]);

  const rebuildPreview = useCallback(async () => {
    if (selectedCampaignId === null || !workbook || !sheetName) {
      setPreview(null);
      return;
    }
    const sheet = workbook.sheets.find((item) => item.name === sheetName);
    if (!sheet) {
      setPreview(null);
      return;
    }
    setWizardStatus("loading");
    setWizardErrorMessage(null);
    try {
      const nextPreview = await services.hrImport.buildPreview({
        campaignId: selectedCampaignId,
        fileName: workbook.fileName,
        format: workbook.format,
        sheetName,
        rows: sheet.rows,
        headerRowIndex,
        mapping,
      });
      setPreview(nextPreview);
      setWizardStatus("ready");
    } catch (error) {
      setPreview(null);
      setWizardStatus("error");
      setWizardErrorMessage(
        toUserMessage(error, "L’aperçu de l’import n’a pas pu être calculé."),
      );
    }
  }, [headerRowIndex, mapping, selectedCampaignId, services, sheetName, workbook]);

  useEffect(() => {
    void rebuildPreview();
  }, [rebuildPreview]);

  const selectCampaign = useCallback(
    (campaignId: number | null) => {
      setHasUserSelected(true);
      setSelectedCampaignId(campaignId);
      resetWizardState();
      setPopulationPage(0);
      setPopulationSearch("");
    },
    [resetWizardState],
  );

  const selectFile = useCallback(
    async (file: File) => {
      setWizardStatus("loading");
      setWizardErrorMessage(null);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const parsed = await services.hrImport.parseFile({
          arrayBuffer,
          fileName: file.name,
          fileSizeBytes: file.size,
        });
        const firstSheet =
          parsed.sheets.find((sheet) =>
            sheet.rows.some((row) =>
              row.some((cell) => String(cell ?? "").trim() !== ""),
            ),
          ) ??
          parsed.sheets[0] ??
          null;
        const detectedHeaderRowIndex = firstSheet
          ? services.hrImport.detectHeaderRowIndex(firstSheet.rows)
          : 0;
        const autoMapping = firstSheet
          ? services.hrImport.buildAutoMapping(
              headerRowToText(firstSheet.rows, detectedHeaderRowIndex),
            )
          : [];

        setWorkbook(parsed);
        setSheetName(firstSheet?.name ?? null);
        setHeaderRowIndex(detectedHeaderRowIndex);
        setMappingState(autoMapping);
        setPreview(null);
        setWizardStatus("idle");
      } catch (error) {
        setWorkbook(null);
        setSheetName(null);
        setHeaderRowIndex(0);
        setMappingState([]);
        setPreview(null);
        setWizardStatus("error");
        setWizardErrorMessage(
          toUserMessage(error, "Le fichier importé n’a pas pu être lu."),
        );
      }
    },
    [services],
  );

  const selectSheet = useCallback(
    (nextSheetName: string) => {
      if (!workbook) {
        return;
      }
      const sheet = workbook.sheets.find((item) => item.name === nextSheetName);
      if (!sheet) {
        return;
      }
      const detectedHeaderRowIndex = services.hrImport.detectHeaderRowIndex(
        sheet.rows,
      );
      const autoMapping = services.hrImport.buildAutoMapping(
        headerRowToText(sheet.rows, detectedHeaderRowIndex),
      );
      setSheetName(nextSheetName);
      setHeaderRowIndex(detectedHeaderRowIndex);
      setMappingState(autoMapping);
    },
    [services, workbook],
  );

  const setHeaderRow = useCallback(
    (index: number) => {
      if (!workbook || !sheetName) {
        return;
      }
      const sheet = workbook.sheets.find((item) => item.name === sheetName);
      if (!sheet) {
        return;
      }
      const autoMapping = services.hrImport.buildAutoMapping(
        headerRowToText(sheet.rows, index),
      );
      setHeaderRowIndex(index);
      setMappingState(autoMapping);
    },
    [services, sheetName, workbook],
  );

  const setMapping = useCallback(
    (targetField: HrImportColumnKey, sourceIndex: number | null) => {
      if (!workbook || !sheetName) {
        return;
      }
      const sheet = workbook.sheets.find((item) => item.name === sheetName);
      if (!sheet) {
        return;
      }
      const headers = headerRowToText(sheet.rows, headerRowIndex);
      setMappingState((current) =>
        services.hrImport.updateMappingEntry(
          current,
          targetField,
          sourceIndex,
          headers,
        ),
      );
    },
    [headerRowIndex, services, sheetName, workbook],
  );

  const confirmImport = useCallback(async () => {
    if (selectedCampaignId === null || !workbook || !sheetName) {
      throw new Error(
        "Sélectionnez une campagne et un fichier avant de confirmer l’import.",
      );
    }
    const sheet = workbook.sheets.find((item) => item.name === sheetName);
    if (!sheet) {
      throw new Error("La feuille sélectionnée est introuvable dans le classeur.");
    }

    setWizardStatus("loading");
    setWizardErrorMessage(null);
    try {
      await services.hrImport.confirmImport({
        campaignId: selectedCampaignId,
        fileName: workbook.fileName,
        format: workbook.format,
        sheetName,
        fileSizeBytes: workbook.fileSizeBytes,
        rows: sheet.rows,
        headerRowIndex,
        mapping,
      });
      resetWizardState();
      setReloadToken((token) => token + 1);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error(
          "[HR_IMPORT_CONFIRM_FAILED]",
          sanitizeTechnicalError(error),
        );
      }
      const message = toUserMessage(
        error,
        "La confirmation de l’import a échoué.",
      );
      setWizardStatus("error");
      setWizardErrorMessage(message);
      throw new Error(message);
    }
  }, [headerRowIndex, mapping, resetWizardState, selectedCampaignId, services, sheetName, workbook]);

  const resetImport = useCallback(() => {
    resetWizardState();
  }, [resetWizardState]);

  const setSearch = useCallback((value: string) => {
    setPopulationSearch(value);
    setPopulationPage(0);
  }, []);

  const setPage = useCallback((page: number) => {
    setPopulationPage(Math.max(0, Math.trunc(page)));
  }, []);

  const value = useMemo<HrImportContextValue>(
    () => ({
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
      historyStatus,
      population,
      populationSummary,
      populationStatus,
      populationErrorMessage,
      populationSearch,
      populationPage,
      populationPageSize,
      activeCampaignPopulationCount,
      activeCampaignLastImportAt,
      selectCampaign,
      selectFile,
      selectSheet,
      setHeaderRow,
      setMapping,
      rebuildPreview,
      confirmImport,
      resetImport,
      loadPopulation,
      loadHistory,
      setSearch,
      setPage,
    }),
    [
      activeCampaignLastImportAt,
      activeCampaignPopulationCount,
      batches,
      confirmImport,
      currentBatch,
      headerRowIndex,
      historyStatus,
      isReadOnly,
      loadHistory,
      loadPopulation,
      mapping,
      population,
      populationErrorMessage,
      populationPage,
      populationPageSize,
      populationSearch,
      populationStatus,
      populationSummary,
      preview,
      rebuildPreview,
      resetImport,
      selectCampaign,
      selectFile,
      selectSheet,
      selectedCampaign,
      selectedCampaignId,
      setHeaderRow,
      setMapping,
      setPage,
      setSearch,
      sheetName,
      wizardErrorMessage,
      wizardStatus,
      workbook,
    ],
  );

  return (
    <HrImportContext.Provider value={value}>
      {children}
    </HrImportContext.Provider>
  );
}

export function useHrImport(): HrImportContextValue {
  const context = useContext(HrImportContext);
  if (!context) {
    throw new Error("useHrImport doit être utilisé dans HrImportProvider.");
  }
  return context;
}
