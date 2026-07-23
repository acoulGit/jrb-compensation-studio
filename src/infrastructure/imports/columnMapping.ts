/** Construction et validation du mapping colonnes source → champs cibles. */

import {
  OPTIONAL_IMPORT_COLUMNS,
  REQUIRED_IMPORT_COLUMNS,
  type HrImportColumnKey,
  type HrImportColumnMappingEntry,
  type HrImportIssue,
} from "../../domain/hrImport/models";
import { resolveColumnAlias } from "./columnAliases";

const ALL_COLUMNS = [...REQUIRED_IMPORT_COLUMNS, ...OPTIONAL_IMPORT_COLUMNS];

/**
 * Propose un mapping automatique à partir des en-têtes détectées. Chaque
 * champ cible est associé à la première colonne source reconnue ; les
 * colonnes déjà utilisées ou les alias déjà résolus ne sont pas réutilisés.
 */
export function buildAutoMapping(
  headers: string[],
): HrImportColumnMappingEntry[] {
  const resolvedIndexByField = new Map<HrImportColumnKey, number>();
  const usedIndexes = new Set<number>();

  headers.forEach((header, index) => {
    const field = resolveColumnAlias(header);
    if (field && !resolvedIndexByField.has(field) && !usedIndexes.has(index)) {
      resolvedIndexByField.set(field, index);
      usedIndexes.add(index);
    }
  });

  return ALL_COLUMNS.map((column) => {
    const sourceIndex = resolvedIndexByField.get(column.key) ?? null;
    return {
      targetField: column.key,
      sourceHeader: sourceIndex !== null ? headers[sourceIndex] ?? null : null,
      sourceIndex,
    };
  });
}

/**
 * Vérifie qu’une même colonne source n’est pas associée à plusieurs champs
 * et que toutes les colonnes obligatoires sont associées.
 */
export function validateMapping(mapping: HrImportColumnMappingEntry[]): {
  errors: HrImportIssue[];
} {
  const errors: HrImportIssue[] = [];
  const fieldsByIndex = new Map<number, HrImportColumnKey[]>();

  for (const entry of mapping) {
    if (entry.sourceIndex === null) {
      continue;
    }
    const fields = fieldsByIndex.get(entry.sourceIndex) ?? [];
    fields.push(entry.targetField);
    fieldsByIndex.set(entry.sourceIndex, fields);
  }

  for (const fields of fieldsByIndex.values()) {
    if (fields.length <= 1) {
      continue;
    }
    for (const field of fields) {
      errors.push({
        severity: "error",
        code: "duplicate_column_mapping",
        sourceRowNumber: null,
        field,
        message:
          "La même colonne source est associée à plusieurs champs cibles.",
        employeeNumber: null,
      });
    }
  }

  const mappedFields = new Set(
    mapping
      .filter((entry) => entry.sourceIndex !== null)
      .map((entry) => entry.targetField),
  );

  for (const column of REQUIRED_IMPORT_COLUMNS) {
    if (!mappedFields.has(column.key)) {
      errors.push({
        severity: "error",
        code: "missing_required_column",
        sourceRowNumber: null,
        field: column.key,
        message: `La colonne obligatoire « ${column.label} » n’est associée à aucune colonne source.`,
        employeeNumber: null,
      });
    }
  }

  return { errors };
}
