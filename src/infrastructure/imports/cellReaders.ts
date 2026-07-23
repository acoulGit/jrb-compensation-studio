/** Lecteurs de cellules : conversion valeur brute → valeur métier typée. */

import type {
  ContractType,
  EmploymentStatus,
} from "../../domain/hrImport/models";
import { normalizeHeaderKey } from "../../domain/hrImport/normalizeKey";
import type { FormulaCell } from "./workbookTypes";

const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);

export function isFormulaCell(value: unknown): value is FormulaCell {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "formula"
  );
}

export function cellToText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (isFormulaCell(value)) {
    return value.display.trim();
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value).trim();
}

/**
 * Un matricule lu depuis une cellule numérique peut avoir perdu ses zéros de
 * tête (Excel convertit « 0012 » en 12) : la conversion est irréversible,
 * donc on se contente de signaler ce cas plutôt que de tenter de le corriger.
 */
export function readEmployeeNumber(value: unknown): {
  value: string;
  leadingZeroWarning: boolean;
} {
  if (typeof value === "number") {
    return { value: cellToText(value), leadingZeroWarning: true };
  }
  return { value: cellToText(value), leadingZeroWarning: false };
}

const CONTRACT_TYPE_ALIASES: Readonly<Record<string, ContractType>> =
  buildAliasLookup({
    cdi: ["cdi", "permanent", "permanent contract"],
    cdd: ["cdd", "fixed term", "fixed-term"],
    temporary: [
      "interim",
      "intérim",
      "interimaire",
      "intérimaire",
      "temporaire",
      "temporary",
      "temp",
    ],
    contractor: [
      "prestataire",
      "consultant externe",
      "contractor",
      "external contractor",
      "consultant",
    ],
    other: ["autre", "other"],
  });

export function readContractType(raw: unknown): ContractType | null {
  const text = cellToText(raw);
  if (!text) {
    return null;
  }
  return CONTRACT_TYPE_ALIASES[normalizeHeaderKey(text)] ?? null;
}

const EMPLOYMENT_STATUS_ALIASES: Readonly<Record<string, EmploymentStatus>> =
  buildAliasLookup({
    active: ["actif", "active", "en poste"],
    group_detachment: [
      "detachement groupe",
      "detachement",
      "group detachment",
      "detache",
    ],
    legal_leave: [
      "conge legal",
      "conge",
      "legal leave",
      "conge maternite",
      "conge maladie longue duree",
    ],
    external_availability: [
      "disponibilite hors groupe",
      "disponibilite",
      "external availability",
      "availability",
    ],
    suspended: ["suspendu", "suspended"],
    departed: ["sorti", "sortie", "parti", "departed", "depart"],
    other: ["autre", "other"],
  });

export function readEmploymentStatus(raw: unknown): EmploymentStatus | null {
  const text = cellToText(raw);
  if (!text) {
    return null;
  }
  return EMPLOYMENT_STATUS_ALIASES[normalizeHeaderKey(text)] ?? null;
}

function buildAliasLookup<TValue extends string>(
  aliasesByValue: Readonly<Record<TValue, readonly string[]>>,
): Record<string, TValue> {
  const map: Record<string, TValue> = {};
  for (const [value, aliases] of Object.entries(aliasesByValue) as Array<
    [TValue, readonly string[]]
  >) {
    for (const alias of aliases) {
      const normalized = normalizeHeaderKey(alias);
      if (normalized) {
        map[normalized] = value;
      }
    }
  }
  return map;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return false;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function formatIsoDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateToIso(date: Date): string | null {
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return formatIsoDate(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

/** Convention SheetJS : jour 0 = 1899-12-30, sans décalage de fuseau horaire. */
function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial <= 0) {
    return null;
  }
  const wholeDays = Math.trunc(serial);
  const date = new Date(EXCEL_EPOCH_UTC_MS + wholeDays * 86_400_000);
  return dateToIso(date);
}

function parseDateString(text: string): string | null {
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    return isValidCalendarDate(year, month, day)
      ? formatIsoDate(year, month, day)
      : null;
  }
  const dmyMatch = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(text);
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]);
    const year = Number(dmyMatch[3]);
    return isValidCalendarDate(year, month, day)
      ? formatIsoDate(year, month, day)
      : null;
  }
  return null;
}

/**
 * Retourne une date ISO (`YYYY-MM-DD`) calendairement valide, sans contrôle
 * « aujourd’hui / futur » (utile pour date de promotion N-1/N).
 * `null` si absente, formule, mal formée ou ambiguë (année sur deux chiffres).
 */
export function readIsoDate(value: unknown): string | null {
  if (isFormulaCell(value)) {
    return null;
  }
  if (value instanceof Date) {
    return dateToIso(value);
  }
  if (typeof value === "number") {
    return excelSerialToIso(value);
  }
  if (typeof value === "string") {
    return parseDateString(value.trim());
  }
  return null;
}

/** Alias sémantique de `readIsoDate` pour la date de promotion. */
export function readPromotionDate(value: unknown): string | null {
  return readIsoDate(value);
}

/**
 * Retourne une date ISO (`YYYY-MM-DD`) valide et non postérieure à
 * `todayIsoDate`, ou `null` si la valeur est absente, mal formée, ambiguë
 * (année sur deux chiffres) ou future.
 */
export function readHireDate(
  value: unknown,
  todayIsoDate: string,
): string | null {
  const iso = readIsoDate(value);
  if (!iso) {
    return null;
  }
  return iso > todayIsoDate ? null : iso;
}

function parseFcfaNumber(raw: unknown): number | null {
  if (isFormulaCell(raw)) {
    return null;
  }
  if (typeof raw === "number") {
    return Number.isInteger(raw) ? raw : null;
  }
  if (typeof raw === "string") {
    const trimmed = raw
      .trim()
      .replace(/\s/g, "")
      .replace(/fcfa/gi, "")
      .replace(/,00$/, "");
    if (!trimmed || !/^-?\d+$/.test(trimmed)) {
      return null;
    }
    return Number(trimmed);
  }
  return null;
}

/** Montant strictement positif ; cellule vide = absent (`null`), invalide = `null`. */
export function readStrictPositiveFcfa(raw: unknown): number | null {
  if (!cellToText(raw)) {
    return null;
  }
  return readPositiveFcfa(raw);
}

/** Montant obligatoire strictement positif (ex. salaire de base décembre). */
export function readPositiveFcfa(raw: unknown): number | null {
  const amount = parseFcfaNumber(raw);
  if (amount === null || amount <= 0) {
    return null;
  }
  return amount;
}

/** Montant optionnel non négatif ; une cellule vide vaut 0. */
export function readNonNegativeFcfa(raw: unknown): number | null {
  if (!cellToText(raw)) {
    return 0;
  }
  const amount = parseFcfaNumber(raw);
  if (amount === null || amount < 0) {
    return null;
  }
  return amount;
}

/** Code 9-Box optionnel (1 à 9) ; une cellule vide vaut `null`. */
export function readNineBox(raw: unknown): number | null | "invalid" {
  if (isFormulaCell(raw)) {
    return "invalid";
  }
  const text = cellToText(raw);
  if (!text) {
    return null;
  }
  if (!/^\d+$/.test(text)) {
    return "invalid";
  }
  const value = Number(text);
  return value >= 1 && value <= 9 ? value : "invalid";
}

const TRUE_FLAG_TOKENS = new Set(["1", "oui", "yes", "true", "vrai", "x"]);
const FALSE_FLAG_TOKENS = new Set(["0", "non", "no", "false", "faux"]);

/** Booléen optionnel ; une cellule vide vaut `false`. */
export function readBooleanFlag(raw: unknown): boolean | "invalid" {
  if (isFormulaCell(raw)) {
    return "invalid";
  }
  if (typeof raw === "boolean") {
    return raw;
  }
  const text = cellToText(raw);
  if (!text) {
    return false;
  }
  const normalized = normalizeHeaderKey(text);
  if (TRUE_FLAG_TOKENS.has(normalized)) {
    return true;
  }
  if (FALSE_FLAG_TOKENS.has(normalized)) {
    return false;
  }
  return "invalid";
}
