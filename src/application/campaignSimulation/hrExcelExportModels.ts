/**
 * Modèles frontend de l’export Excel RH (Lot 2B-E1).
 *
 * Ces types reflètent le contrat de la commande Tauri `export_simulation_run_excel`
 * et de `generate_hr_export_password`. Aucun mot de passe n’est journalisé et
 * aucune donnée sensible n’est conservée hors du flux d’export.
 */

/** Longueur minimale d’un mot de passe fourni par l’utilisateur (contrat Rust). */
export const MIN_PASSWORD_LENGTH = 12;

/** Longueur minimale garantie d’un mot de passe généré (contrat Rust >= 20). */
export const GENERATED_PASSWORD_MIN_LENGTH = 20;

/** Options envoyées à la commande d’export (camelCase, contrat Rust). */
export interface ExportSimulationRunExcelInput {
  simulationRunId: number;
  outputPath: string;
  password: string | null;
  confirmUnprotectedExport: boolean;
}

/** Résultat de succès renvoyé par la commande d’export. */
export interface ExportSimulationRunExcelResult {
  outputPath: string;
  fileName: string;
  sizeBytes: number;
  protected: boolean;
  employeeCount: number;
  monthRowCount: number;
}

/** Résultat de la génération d’un mot de passe RH robuste. */
export interface GenerateHrExportPasswordResult {
  password: string;
  length: number;
}

const WINDOWS_RESERVED_CHARS = /[<>:"/\\|?*]/;

/**
 * Neutralise un composant de nom de fichier pour Windows.
 *
 * Miroir de `sanitize_file_component` (Rust) :
 * - remplace `<>:"/\|?*` et les caractères de contrôle par `_` ;
 * - remplace chaque caractère d’espacement par `_` ;
 * - retire les `.` et `_` en début et fin ;
 * - renvoie `NA` si le résultat est vide.
 */
export function sanitizeFileComponent(component: string): string {
  const mapped = Array.from(component)
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      const isControl = code <= 0x1f || (code >= 0x7f && code <= 0x9f);
      if (WINDOWS_RESERVED_CHARS.test(char) || isControl) {
        return "_";
      }
      if (/\s/.test(char)) {
        return "_";
      }
      return char;
    })
    .join("");

  const trimmed = mapped.replace(/^[._]+/, "").replace(/[._]+$/, "");
  return trimmed.length === 0 ? "NA" : trimmed;
}

/** Formate une date ISO (ou aujourd’hui) au format `YYYY-MM-DD`. */
export function formatExportDate(createdAtIso?: string | null): string {
  let date: Date | null = null;
  if (createdAtIso) {
    const parsed = new Date(createdAtIso);
    if (!Number.isNaN(parsed.getTime())) {
      date = parsed;
    }
  }
  if (!date) {
    date = new Date();
  }
  const year = date.getFullYear().toString().padStart(4, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export interface SuggestedFileNameInput {
  campaignName: string;
  runNumber: number;
  createdAtIso?: string | null;
}

/**
 * Construit le nom de fichier suggéré (sanitisé pour Windows).
 *
 * Format miroir du backend Rust :
 * `JRB_Compensation_<Campagne>_Run_<Numero>_<Date>.xlsx`.
 */
export function buildSuggestedFileName(input: SuggestedFileNameInput): string {
  const campaign = sanitizeFileComponent(input.campaignName);
  const date = sanitizeFileComponent(formatExportDate(input.createdAtIso));
  return `JRB_Compensation_${campaign}_Run_${input.runNumber}_${date}.xlsx`;
}
