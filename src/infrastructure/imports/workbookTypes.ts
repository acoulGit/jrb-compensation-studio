/** Types de sortie du parseur de classeur, indépendants de SheetJS. */

import type { HrImportFileFormat } from "../../domain/hrImport/models";

/** Marqueur d’une cellule contenant une formule (non exécutée). */
export interface FormulaCell {
  kind: "formula";
  display: string;
}

export type SheetCellValue =
  | string
  | number
  | boolean
  | Date
  | null
  | FormulaCell;

export interface WorkbookSheet {
  name: string;
  rows: unknown[][];
}

export interface ParsedImportFile {
  format: HrImportFileFormat;
  fileName: string;
  fileSizeBytes: number;
  sheets: WorkbookSheet[];
}
