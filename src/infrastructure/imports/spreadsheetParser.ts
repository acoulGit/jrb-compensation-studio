/** Analyse d’un classeur (xlsx/xls/csv) en matrice de valeurs, sans SheetJS
 * exposé au reste de l’application. Aucune formule n’est exécutée : les
 * cellules contenant une formule sont remplacées par un marqueur dédié. */

import type { HrImportFileFormat } from "../../domain/hrImport/models";
import {
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_SHEETS,
} from "./importLimits";
import { isFormulaCell } from "./cellReaders";
import type {
  FormulaCell,
  ParsedImportFile,
  SheetCellValue,
  WorkbookSheet,
} from "./workbookTypes";
import type * as XLSXNamespace from "xlsx";

const SUPPORTED_EXTENSIONS: Readonly<Record<string, HrImportFileFormat>> = {
  xlsx: "xlsx",
  xls: "xls",
  csv: "csv",
};

export function extractBaseFileName(fileName: string): string {
  const segments = fileName.split(/[\\/]/);
  const base = segments[segments.length - 1] ?? fileName;
  return base.trim();
}

function detectImportFileFormat(baseFileName: string): HrImportFileFormat {
  const match = /\.([a-z0-9]+)$/i.exec(baseFileName);
  const extension = match ? match[1].toLowerCase() : "";
  const format = SUPPORTED_EXTENSIONS[extension];
  if (!format) {
    throw new Error(
      `Format de fichier non pris en charge (« .${extension || "?"} »). Utilisez un fichier .xlsx, .xls ou .csv.`,
    );
  }
  return format;
}

export async function parseSpreadsheetBuffer(input: {
  arrayBuffer: ArrayBuffer;
  fileName: string;
  fileSizeBytes: number;
}): Promise<ParsedImportFile> {
  const fileName = extractBaseFileName(input.fileName);
  const format = detectImportFileFormat(fileName);

  if (input.fileSizeBytes <= 0 || input.arrayBuffer.byteLength === 0) {
    throw new Error("Le fichier importé est vide.");
  }
  if (input.fileSizeBytes > MAX_IMPORT_FILE_BYTES) {
    const maxMegabytes = Math.floor(MAX_IMPORT_FILE_BYTES / (1024 * 1024));
    throw new Error(
      `Le fichier dépasse la taille maximale autorisée (${maxMegabytes} Mo).`,
    );
  }

  const XLSX = await import("xlsx");
  const workbook = XLSX.read(input.arrayBuffer, {
    type: "array",
    cellDates: true,
    cellFormula: true,
    cellText: true,
  });

  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) {
    throw new Error("Le fichier importé ne contient aucune feuille exploitable.");
  }
  if (sheetNames.length > MAX_IMPORT_SHEETS) {
    throw new Error(
      `Le fichier contient trop de feuilles (maximum ${MAX_IMPORT_SHEETS}).`,
    );
  }

  const sheets: WorkbookSheet[] = [];
  for (const name of sheetNames) {
    const { rows } = await extractSheetMatrix(workbook, name);
    sheets.push({ name, rows });
  }

  return {
    format,
    fileName,
    fileSizeBytes: input.fileSizeBytes,
    sheets,
  };
}

function cellDisplayText(cell: XLSXNamespace.CellObject): string {
  if (typeof cell.w === "string" && cell.w.length > 0) {
    return cell.w;
  }
  if (typeof cell.f === "string" && cell.f.length > 0) {
    return `=${cell.f}`;
  }
  return "";
}

function cellObjectToValue(
  cell: XLSXNamespace.CellObject | undefined,
): SheetCellValue {
  if (!cell) {
    return null;
  }
  if (typeof cell.f === "string" && cell.f.length > 0) {
    const formula: FormulaCell = { kind: "formula", display: cellDisplayText(cell) };
    return formula;
  }
  if (cell.v === undefined || cell.v === null) {
    return null;
  }
  if (cell.t === "d") {
    return cell.v instanceof Date ? cell.v : null;
  }
  if (cell.t === "n") {
    return typeof cell.v === "number" ? cell.v : null;
  }
  if (cell.t === "b") {
    return typeof cell.v === "boolean" ? cell.v : null;
  }
  return typeof cell.v === "string" ? cell.v : String(cell.v);
}

/** Extrait une feuille en matrice de valeurs, formules marquées à part. */
export async function extractSheetMatrix(
  workbook: XLSXNamespace.WorkBook,
  sheetName: string,
): Promise<{ rows: SheetCellValue[][] }> {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Feuille introuvable dans le classeur : ${sheetName}`);
  }
  const ref = sheet["!ref"];
  if (!ref) {
    return { rows: [] };
  }

  const XLSX = await import("xlsx");
  const range = XLSX.utils.decode_range(ref);
  const rows: SheetCellValue[][] = [];
  for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
    const row: SheetCellValue[] = [];
    for (let colIndex = range.s.c; colIndex <= range.e.c; colIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
      row.push(cellObjectToValue(sheet[address] as XLSXNamespace.CellObject | undefined));
    }
    rows.push(row);
  }
  return { rows };
}

/** Indique si une feuille déjà extraite contient au moins une formule. */
export function sheetHasFormulaInUsedRange(sheet: WorkbookSheet): boolean {
  return sheet.rows.some((row) => row.some((cell) => isFormulaCell(cell)));
}
