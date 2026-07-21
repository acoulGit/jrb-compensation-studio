/** Normalisation des lignes brutes d’un import RH en lignes exploitables. */

import type {
  ContractType,
  EmploymentStatus,
  HrImportColumnKey,
  HrImportColumnMappingEntry,
  HrImportIssue,
  NormalizedImportRow,
} from "../../domain/hrImport/models";
import {
  cellToText,
  isFormulaCell,
  readBooleanFlag,
  readContractType,
  readEmployeeNumber,
  readEmploymentStatus,
  readHireDate,
  readNineBox,
  readNonNegativeFcfa,
  readPositiveFcfa,
} from "./cellReaders";
import { readPromotionImportGroup, resolveCanonicalPromotionAmount } from "./promotionImportValidation";

interface CodeReferenceItem {
  id: number;
  code: string;
  label: string;
}

interface DraftRow {
  sourceRowNumber: number;
  employeeNumber: string;
  employeeLabel: string;
  jobFamilyId: number | null;
  jobFamilyCode: string | null;
  jobFamilyLabel: string | null;
  gradeId: number | null;
  gradeCode: string | null;
  gradeLabel: string | null;
  contractType: ContractType | null;
  employmentStatus: EmploymentStatus | null;
  hireDate: string | null;
  decemberBaseSalary: number | null;
  nineBoxCode: number | null;
  confirmedUnderperformer: boolean;
  promotionAmount: number;
  correctionAmount: number;
  socialMeasureAmount: number;
  promotionDate: string | null;
  salaryBeforePromotion: number | null;
  salaryAfterPromotion: number | null;
  previousGradeId: number | null;
  previousGradeCode: string | null;
  promotedGradeId: number | null;
  promotedGradeCode: string | null;
  previousJobFamilyId: number | null;
  previousJobFamilyCode: string | null;
  promotedJobFamilyId: number | null;
  promotedJobFamilyCode: string | null;
  isValid: boolean;
  issues: HrImportIssue[];
}

export function normalizeImportRows(input: {
  rows: unknown[][];
  headerRowIndex: number;
  mapping: HrImportColumnMappingEntry[];
  jobFamilies: CodeReferenceItem[];
  grades: CodeReferenceItem[];
  todayIsoDate: string;
  /** Année de référence de la campagne (N) — fenêtre de promotion N-1/N. */
  campaignReferenceYear: number;
  referenceIncomplete?: boolean;
}): {
  normalized: NormalizedImportRow[];
  issues: HrImportIssue[];
  validCount: number;
  errorCount: number;
  warningCount: number;
  duplicateNumbers: number;
} {
  const {
    rows,
    headerRowIndex,
    mapping,
    jobFamilies,
    grades,
    todayIsoDate,
    campaignReferenceYear,
  } = input;
  const referenceIncomplete = input.referenceIncomplete ?? false;

  const mappingByField = buildMappingIndex(mapping);
  const jobFamilyByCode = buildCodeIndex(jobFamilies);
  const gradeByCode = buildCodeIndex(grades);

  const draftRows: DraftRow[] = [];
  const rowIndexesByNumberKey = new Map<string, number[]>();

  for (let index = headerRowIndex + 1; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    if (isRowEmpty(row)) {
      continue;
    }

    const sourceRowNumber = index + 1;
    const rowIssues: HrImportIssue[] = [];

    const employeeNumberRaw = readCell(row, mappingByField, "employeeNumber");
    const employeeNumberIsFormula = pushFormulaErrorIfNeeded(
      rowIssues,
      employeeNumberRaw,
      sourceRowNumber,
      "employeeNumber",
    );
    const { value: employeeNumber, leadingZeroWarning } = employeeNumberIsFormula
      ? { value: "", leadingZeroWarning: false }
      : readEmployeeNumber(employeeNumberRaw);
    if (!employeeNumberIsFormula && !employeeNumber) {
      pushError(
        rowIssues,
        "missing_employee_number",
        sourceRowNumber,
        "employeeNumber",
        "Le matricule est obligatoire.",
      );
    } else if (leadingZeroWarning) {
      pushWarning(
        rowIssues,
        "employee_number_leading_zero",
        sourceRowNumber,
        "employeeNumber",
        "Le matricule a été lu comme un nombre : d’éventuels zéros de tête peuvent avoir été perdus.",
      );
    }

    const employeeLabelRaw = readCell(row, mappingByField, "employeeLabel");
    const employeeLabelIsFormula = pushFormulaErrorIfNeeded(
      rowIssues,
      employeeLabelRaw,
      sourceRowNumber,
      "employeeLabel",
    );
    const employeeLabel = employeeLabelIsFormula
      ? ""
      : cellToText(employeeLabelRaw);
    if (!employeeLabelIsFormula && !employeeLabel) {
      pushError(
        rowIssues,
        "missing_employee_label",
        sourceRowNumber,
        "employeeLabel",
        "Le nom du salarié est obligatoire.",
      );
    }

    const jobFamilyCodeRaw = readCell(row, mappingByField, "jobFamilyCode");
    const jobFamilyCodeIsFormula = pushFormulaErrorIfNeeded(
      rowIssues,
      jobFamilyCodeRaw,
      sourceRowNumber,
      "jobFamilyCode",
    );
    const jobFamilyCode = jobFamilyCodeIsFormula
      ? ""
      : cellToText(jobFamilyCodeRaw).toUpperCase();
    let jobFamilyId: number | null = null;
    let resolvedJobFamilyCode: string | null = null;
    let jobFamilyLabel: string | null = null;
    if (jobFamilyCodeIsFormula) {
      // Erreur déjà signalée : la formule empêche toute résolution fiable.
    } else if (!jobFamilyCode) {
      pushError(
        rowIssues,
        "missing_job_family",
        sourceRowNumber,
        "jobFamilyCode",
        "La famille de métiers est obligatoire.",
      );
    } else {
      const family = jobFamilyByCode.get(jobFamilyCode) ?? null;
      if (family === null) {
        pushError(
          rowIssues,
          "unknown_job_family",
          sourceRowNumber,
          "jobFamilyCode",
          `Famille de métiers inconnue dans le référentiel de la campagne : « ${jobFamilyCode} ».`,
        );
      } else {
        jobFamilyId = family.id;
        resolvedJobFamilyCode = family.code;
        jobFamilyLabel = family.label;
      }
    }

    const gradeCodeRaw = readCell(row, mappingByField, "gradeCode");
    const gradeCodeIsFormula = pushFormulaErrorIfNeeded(
      rowIssues,
      gradeCodeRaw,
      sourceRowNumber,
      "gradeCode",
    );
    const gradeCode = gradeCodeIsFormula ? "" : cellToText(gradeCodeRaw).toUpperCase();
    let gradeId: number | null = null;
    let resolvedGradeCode: string | null = null;
    let gradeLabel: string | null = null;
    if (gradeCodeIsFormula) {
      // Erreur déjà signalée : la formule empêche toute résolution fiable.
    } else if (!gradeCode) {
      pushError(
        rowIssues,
        "missing_grade",
        sourceRowNumber,
        "gradeCode",
        "Le grade est obligatoire.",
      );
    } else {
      const grade = gradeByCode.get(gradeCode) ?? null;
      if (grade === null) {
        pushError(
          rowIssues,
          "unknown_grade",
          sourceRowNumber,
          "gradeCode",
          `Grade inconnu dans le référentiel de la campagne : « ${gradeCode} ».`,
        );
      } else {
        gradeId = grade.id;
        resolvedGradeCode = grade.code;
        gradeLabel = grade.label;
      }
    }

    const contractTypeRaw = readCell(row, mappingByField, "contractType");
    const contractTypeIsFormula = pushFormulaErrorIfNeeded(
      rowIssues,
      contractTypeRaw,
      sourceRowNumber,
      "contractType",
    );
    const contractType = contractTypeIsFormula
      ? null
      : readContractType(contractTypeRaw);
    if (!contractTypeIsFormula && contractType === null) {
      pushError(
        rowIssues,
        "invalid_contract_type",
        sourceRowNumber,
        "contractType",
        "Le type de contrat est obligatoire et doit être une valeur reconnue.",
      );
    }

    const employmentStatusRaw = readCell(row, mappingByField, "employmentStatus");
    const employmentStatusIsFormula = pushFormulaErrorIfNeeded(
      rowIssues,
      employmentStatusRaw,
      sourceRowNumber,
      "employmentStatus",
    );
    const employmentStatus = employmentStatusIsFormula
      ? null
      : readEmploymentStatus(employmentStatusRaw);
    if (!employmentStatusIsFormula && employmentStatus === null) {
      pushError(
        rowIssues,
        "invalid_employment_status",
        sourceRowNumber,
        "employmentStatus",
        "Le statut d’emploi est obligatoire et doit être une valeur reconnue.",
      );
    }

    const hireDateRaw = readCell(row, mappingByField, "hireDate");
    const hireDateIsFormula = pushFormulaErrorIfNeeded(
      rowIssues,
      hireDateRaw,
      sourceRowNumber,
      "hireDate",
    );
    const hireDate = hireDateIsFormula
      ? null
      : readHireDate(hireDateRaw, todayIsoDate);
    if (!hireDateIsFormula && hireDate === null) {
      pushError(
        rowIssues,
        "invalid_hire_date",
        sourceRowNumber,
        "hireDate",
        "La date d’entrée est obligatoire, doit être une date valide et ne peut pas être postérieure à aujourd’hui.",
      );
    }

    const decemberSalaryRaw = readCell(
      row,
      mappingByField,
      "decemberBaseSalary",
    );
    const decemberSalaryIsFormula = pushFormulaErrorIfNeeded(
      rowIssues,
      decemberSalaryRaw,
      sourceRowNumber,
      "decemberBaseSalary",
    );
    const decemberBaseSalary = decemberSalaryIsFormula
      ? null
      : readPositiveFcfa(decemberSalaryRaw);
    if (!decemberSalaryIsFormula && decemberBaseSalary === null) {
      pushError(
        rowIssues,
        "invalid_december_salary",
        sourceRowNumber,
        "decemberBaseSalary",
        "Le salaire de base de décembre N-1 est obligatoire et doit être un entier strictement positif en FCFA.",
      );
    }

    const nineBoxRaw = readCell(row, mappingByField, "nineBoxCode");
    const nineBoxResult = readNineBox(nineBoxRaw);
    let nineBoxCode: number | null = null;
    if (nineBoxResult === "invalid") {
      pushWarning(
        rowIssues,
        "invalid_nine_box",
        sourceRowNumber,
        "nineBoxCode",
        "Le code 9-Box est ignoré : valeur non reconnue (attendu un entier de 1 à 9).",
      );
    } else {
      nineBoxCode = nineBoxResult;
    }

    const confirmedRaw = readCell(
      row,
      mappingByField,
      "confirmedUnderperformer",
    );
    const confirmedResult = readBooleanFlag(confirmedRaw);
    let confirmedUnderperformer = false;
    if (confirmedResult === "invalid") {
      pushWarning(
        rowIssues,
        "invalid_underperformer_flag",
        sourceRowNumber,
        "confirmedUnderperformer",
        "Le statut de sous-performant confirmé est ignoré (valeur par défaut appliquée) : valeur non reconnue.",
      );
    } else {
      confirmedUnderperformer = confirmedResult;
    }

    const historicalPromotionAmount = readOptionalAmountWithPresence(
      row,
      mappingByField,
      "promotionAmount",
      "Le montant de promotion est ignoré (valeur par défaut appliquée) : valeur non reconnue.",
      sourceRowNumber,
      rowIssues,
    );
    let promotionAmount = historicalPromotionAmount.value;
    const correctionAmount = readOptionalAmount(
      row,
      mappingByField,
      "correctionAmount",
      "Le montant de correction est ignoré (valeur par défaut appliquée) : valeur non reconnue.",
      sourceRowNumber,
      rowIssues,
    );
    const socialMeasureAmount = readOptionalAmount(
      row,
      mappingByField,
      "socialMeasureAmount",
      "Le montant de mesure RH / sociale est ignoré (valeur par défaut appliquée) : valeur non reconnue.",
      sourceRowNumber,
      rowIssues,
    );

    const promotionFields = readPromotionImportGroup({
      row,
      mappingByField,
      sourceRowNumber,
      rowIssues,
      jobFamilies,
      grades,
      campaignReferenceYear,
      currentJobFamilyId: jobFamilyId,
      currentJobFamilyCode: resolvedJobFamilyCode,
      currentGradeId: gradeId,
      currentGradeCode: resolvedGradeCode,
      decemberBaseSalary,
    });
    if (
      promotionFields.promotionDate !== null &&
      promotionFields.salaryBeforePromotion !== null &&
      promotionFields.salaryAfterPromotion !== null
    ) {
      const derivedPromotionAmount =
        promotionFields.salaryAfterPromotion -
        promotionFields.salaryBeforePromotion;
      const reconciled = resolveCanonicalPromotionAmount({
        historicalPresent: historicalPromotionAmount.present,
        historicalAmount: historicalPromotionAmount.value,
        derivedAmount: derivedPromotionAmount,
      });
      if (!reconciled.ok) {
        pushError(
          rowIssues,
          reconciled.code,
          sourceRowNumber,
          "promotionAmount",
          reconciled.message,
        );
      } else {
        promotionAmount = reconciled.amount;
      }
    }

    if (employeeNumber) {
      const key = employeeNumber.toUpperCase();
      const indexes = rowIndexesByNumberKey.get(key) ?? [];
      indexes.push(draftRows.length);
      rowIndexesByNumberKey.set(key, indexes);
    }

    draftRows.push({
      sourceRowNumber,
      employeeNumber,
      employeeLabel,
      jobFamilyId,
      jobFamilyCode: resolvedJobFamilyCode,
      jobFamilyLabel,
      gradeId,
      gradeCode: resolvedGradeCode,
      gradeLabel,
      contractType,
      employmentStatus,
      hireDate,
      decemberBaseSalary,
      nineBoxCode,
      confirmedUnderperformer,
      promotionAmount,
      correctionAmount,
      socialMeasureAmount,
      ...promotionFields,
      isValid: !rowIssues.some((issue) => issue.severity === "error"),
      issues: rowIssues,
    });
  }

  let duplicateNumbers = 0;
  for (const [key, indexes] of rowIndexesByNumberKey) {
    if (indexes.length <= 1) {
      continue;
    }
    duplicateNumbers += indexes.length;
    for (const rowIndex of indexes) {
      const draft = draftRows[rowIndex];
      draft.isValid = false;
      pushError(
        draft.issues,
        "duplicate_employee_number",
        draft.sourceRowNumber,
        "employeeNumber",
        `Matricule en doublon dans le fichier : « ${key} ».`,
      );
    }
  }

  const issues: HrImportIssue[] = [];
  if (referenceIncomplete) {
    pushWarning(
      issues,
      "reference_incomplete",
      null,
      null,
      "Le référentiel de la campagne est incomplet. L’import reste possible si toutes les familles et grades utilisés existent.",
    );
  }

  const normalized: NormalizedImportRow[] = [];
  let validCount = 0;

  for (const draft of draftRows) {
    for (const issue of draft.issues) {
      issues.push(issue);
    }
    if (draft.isValid) {
      validCount += 1;
    }
    normalized.push({
      sourceRowNumber: draft.sourceRowNumber,
      isValid: draft.isValid,
      employeeNumber: draft.employeeNumber || null,
      employeeLabel: draft.employeeLabel || null,
      jobFamilyId: draft.jobFamilyId,
      jobFamilyCode: draft.jobFamilyCode,
      jobFamilyLabel: draft.jobFamilyLabel,
      gradeId: draft.gradeId,
      gradeCode: draft.gradeCode,
      gradeLabel: draft.gradeLabel,
      contractType: draft.contractType,
      employmentStatus: draft.employmentStatus,
      hireDate: draft.hireDate,
      decemberBaseSalary: draft.decemberBaseSalary,
      nineBoxCode: draft.nineBoxCode,
      confirmedUnderperformer: draft.confirmedUnderperformer,
      promotionAmount: draft.promotionAmount,
      correctionAmount: draft.correctionAmount,
      socialMeasureAmount: draft.socialMeasureAmount,
      promotionDate: draft.promotionDate,
      salaryBeforePromotion: draft.salaryBeforePromotion,
      salaryAfterPromotion: draft.salaryAfterPromotion,
      previousGradeId: draft.previousGradeId,
      previousGradeCode: draft.previousGradeCode,
      promotedGradeId: draft.promotedGradeId,
      promotedGradeCode: draft.promotedGradeCode,
      previousJobFamilyId: draft.previousJobFamilyId,
      previousJobFamilyCode: draft.previousJobFamilyCode,
      promotedJobFamilyId: draft.promotedJobFamilyId,
      promotedJobFamilyCode: draft.promotedJobFamilyCode,
    });
  }

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter(
    (issue) => issue.severity === "warning",
  ).length;

  return { normalized, issues, validCount, errorCount, warningCount, duplicateNumbers };
}

function buildMappingIndex(
  mapping: HrImportColumnMappingEntry[],
): Map<HrImportColumnKey, number | null> {
  const index = new Map<HrImportColumnKey, number | null>();
  for (const entry of mapping) {
    index.set(entry.targetField, entry.sourceIndex);
  }
  return index;
}

function buildCodeIndex(
  items: CodeReferenceItem[],
): Map<string, CodeReferenceItem> {
  const index = new Map<string, CodeReferenceItem>();
  for (const item of items) {
    index.set(item.code.trim().toUpperCase(), item);
  }
  return index;
}

function readCell(
  row: unknown[],
  mappingByField: Map<HrImportColumnKey, number | null>,
  field: HrImportColumnKey,
): unknown {
  const sourceIndex = mappingByField.get(field) ?? null;
  if (sourceIndex === null) {
    return null;
  }
  return row[sourceIndex] ?? null;
}

function isRowEmpty(row: unknown[]): boolean {
  return row.every((cell) => cellToText(cell) === "");
}

function readOptionalAmount(
  row: unknown[],
  mappingByField: Map<HrImportColumnKey, number | null>,
  field: HrImportColumnKey,
  invalidMessage: string,
  sourceRowNumber: number,
  rowIssues: HrImportIssue[],
): number {
  return readOptionalAmountWithPresence(
    row,
    mappingByField,
    field,
    invalidMessage,
    sourceRowNumber,
    rowIssues,
  ).value;
}

/** Distingue cellule absente/vide d’une valeur explicitement saisie. */
function readOptionalAmountWithPresence(
  row: unknown[],
  mappingByField: Map<HrImportColumnKey, number | null>,
  field: HrImportColumnKey,
  invalidMessage: string,
  sourceRowNumber: number,
  rowIssues: HrImportIssue[],
): { present: boolean; value: number } {
  const raw = readCell(row, mappingByField, field);
  if (cellToText(raw) === "") {
    return { present: false, value: 0 };
  }
  if (isFormulaCell(raw)) {
    pushError(
      rowIssues,
      "formula_not_allowed",
      sourceRowNumber,
      field,
      "Les formules ne sont pas autorisées dans le fichier importé : saisissez une valeur fixe.",
    );
    return { present: true, value: 0 };
  }
  const amount = readNonNegativeFcfa(raw);
  if (amount === null) {
    pushError(
      rowIssues,
      `invalid_${field}`,
      sourceRowNumber,
      field,
      invalidMessage,
    );
    return { present: true, value: 0 };
  }
  return { present: true, value: amount };
}

function pushIssue(
  issues: HrImportIssue[],
  severity: HrImportIssue["severity"],
  code: string,
  sourceRowNumber: number | null,
  field: string | null,
  message: string,
): void {
  issues.push({ severity, code, sourceRowNumber, field, message });
}

function pushError(
  issues: HrImportIssue[],
  code: string,
  sourceRowNumber: number | null,
  field: string | null,
  message: string,
): void {
  pushIssue(issues, "error", code, sourceRowNumber, field, message);
}

function pushWarning(
  issues: HrImportIssue[],
  code: string,
  sourceRowNumber: number | null,
  field: string | null,
  message: string,
): void {
  pushIssue(issues, "warning", code, sourceRowNumber, field, message);
}

/**
 * Les formules ne sont jamais exécutées. Si une cellule obligatoire contient
 * une formule, la ligne est bloquée plutôt que d’utiliser une valeur mise en
 * cache potentiellement obsolète.
 */
function pushFormulaErrorIfNeeded(
  issues: HrImportIssue[],
  raw: unknown,
  sourceRowNumber: number,
  field: HrImportColumnKey,
): boolean {
  if (!isFormulaCell(raw)) {
    return false;
  }
  pushError(
    issues,
    "formula_not_allowed",
    sourceRowNumber,
    field,
    "Les formules ne sont pas autorisées dans le fichier importé : saisissez une valeur fixe.",
  );
  return true;
}
