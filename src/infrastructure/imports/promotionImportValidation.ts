/** Validation groupe promotion à l’import (Lot 2A-H2C-1). */

import {
  PromotionValidationError,
  buildPromotionEvent,
  validatePromotionAgainstDecemberSnapshot,
} from "../../domain/compensationCalculation";
import type { HrImportIssue } from "../../domain/hrImport/models";
import { cellToText, isFormulaCell, readPromotionDate, readStrictPositiveFcfa } from "./cellReaders";
import type { HrImportColumnKey } from "../../domain/hrImport/models";

interface CodeReferenceItem {
  id: number;
  code: string;
  label: string;
}

export interface ResolvedPromotionImport {
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
}

/**
 * Réconcilie le montant historique `promotionAmount` avec le delta dérivé
 * (après − avant) lorsqu’une promotion structurée est présente.
 *
 * - cellule absente / vide / 0 → accepter, utiliser le dérivé ;
 * - valeur explicite égale au dérivé → accepter ;
 * - valeur explicite différente → rejeter (pas de correction silencieuse).
 */
export function resolveCanonicalPromotionAmount(input: {
  historicalPresent: boolean;
  historicalAmount: number;
  derivedAmount: number;
}):
  | { ok: true; amount: number }
  | { ok: false; code: "PROMOTION_AMOUNT_MISMATCH"; message: string } {
  const derived = input.derivedAmount;
  if (
    !input.historicalPresent ||
    input.historicalAmount === 0 ||
    input.historicalAmount === derived
  ) {
    return { ok: true, amount: derived };
  }
  return {
    ok: false,
    code: "PROMOTION_AMOUNT_MISMATCH",
    message: `Le montant de promotion saisi (${input.historicalAmount.toLocaleString("fr-FR")} FCFA) diffère du montant calculé (${derived.toLocaleString("fr-FR")} FCFA = salaire après − salaire avant).`,
  };
}

export function readPromotionImportGroup(input: {
  row: unknown[];
  mappingByField: Map<HrImportColumnKey, number | null>;
  sourceRowNumber: number;
  rowIssues: HrImportIssue[];
  jobFamilies: CodeReferenceItem[];
  grades: CodeReferenceItem[];
  campaignReferenceYear: number;
  currentJobFamilyId: number | null;
  currentJobFamilyCode: string | null;
  currentGradeId: number | null;
  currentGradeCode: string | null;
  decemberBaseSalary: number | null;
}): ResolvedPromotionImport {
  const empty: ResolvedPromotionImport = {
    promotionDate: null,
    salaryBeforePromotion: null,
    salaryAfterPromotion: null,
    previousGradeId: null,
    previousGradeCode: null,
    promotedGradeId: null,
    promotedGradeCode: null,
    previousJobFamilyId: null,
    previousJobFamilyCode: null,
    promotedJobFamilyId: null,
    promotedJobFamilyCode: null,
  };

  const jobFamilyByCode = buildCodeIndex(input.jobFamilies);
  const gradeByCode = buildCodeIndex(input.grades);

  const dateRaw = readCell(input.row, input.mappingByField, "promotionDate");
  const dateHasContent = cellToText(dateRaw) !== "";
  const dateIsFormula = pushFormulaErrorIfNeeded(
    input.rowIssues,
    dateRaw,
    input.sourceRowNumber,
    "promotionDate",
  );
  let promotionDate: string | null = null;
  if (dateIsFormula) {
    // Erreur déjà signalée.
  } else if (dateHasContent) {
    promotionDate = readPromotionDate(dateRaw);
    if (!promotionDate) {
      pushError(
        input.rowIssues,
        "invalid_promotion_date",
        input.sourceRowNumber,
        "promotionDate",
        "La date de promotion doit être une date valide (ISO YYYY-MM-DD ou format JJ/MM/AAAA).",
      );
    }
  }

  const salaryBefore = readOptionalPromotionSalary(
    input.row,
    input.mappingByField,
    "salaryBeforePromotion",
    input.sourceRowNumber,
    input.rowIssues,
  );
  const salaryAfter = readOptionalPromotionSalary(
    input.row,
    input.mappingByField,
    "salaryAfterPromotion",
    input.sourceRowNumber,
    input.rowIssues,
  );

  const previousGrade = readOptionalPromotionCode(
    input.row,
    input.mappingByField,
    "previousGradeCode",
    input.sourceRowNumber,
    input.rowIssues,
  );
  const promotedGrade = readOptionalPromotionCode(
    input.row,
    input.mappingByField,
    "promotedGradeCode",
    input.sourceRowNumber,
    input.rowIssues,
  );
  const previousFamily = readOptionalPromotionCode(
    input.row,
    input.mappingByField,
    "previousJobFamilyCode",
    input.sourceRowNumber,
    input.rowIssues,
  );
  const promotedFamily = readOptionalPromotionCode(
    input.row,
    input.mappingByField,
    "promotedJobFamilyCode",
    input.sourceRowNumber,
    input.rowIssues,
  );

  const otherFieldsPresent =
    salaryBefore.present ||
    salaryAfter.present ||
    previousGrade.present ||
    promotedGrade.present ||
    previousFamily.present ||
    promotedFamily.present;

  if (!promotionDate && !otherFieldsPresent) {
    return empty;
  }

  if (!promotionDate && otherFieldsPresent) {
    pushError(
      input.rowIssues,
      "promotion_partial_without_date",
      input.sourceRowNumber,
      "promotionDate",
      "Des champs de promotion sont renseignés sans date de promotion : complétez la date ou videz le groupe.",
    );
    return empty;
  }

  if (!promotionDate) {
    return empty;
  }

  const requireField = (
    present: boolean,
    field: HrImportColumnKey,
    label: string,
  ): void => {
    if (!present) {
      pushError(
        input.rowIssues,
        "promotion_incomplete_group",
        input.sourceRowNumber,
        field,
        `La date de promotion exige ${label}.`,
      );
    }
  };

  requireField(
    salaryBefore.present,
    "salaryBeforePromotion",
    "le salaire avant promotion",
  );
  requireField(
    salaryAfter.present,
    "salaryAfterPromotion",
    "le salaire après promotion",
  );
  // Lot 2B-RC1-H3 : nouveau grade facultatif — fallback vers ancien grade
  // (sinon grade courant de la ligne). L’ancien grade reste obligatoire,
  // sauf s’il peut être déduit du grade courant.
  const resolvedPreviousGradeCode =
    previousGrade.value || input.currentGradeCode || "";
  if (!resolvedPreviousGradeCode) {
    pushError(
      input.rowIssues,
      "promotion_incomplete_group",
      input.sourceRowNumber,
      "previousGradeCode",
      "La date de promotion exige l’ancien grade (ou un grade courant résolu sur la ligne).",
    );
  }
  const resolvedPromotedGradeCode =
    promotedGrade.value || resolvedPreviousGradeCode || input.currentGradeCode || "";

  if (
    !salaryBefore.value ||
    !salaryAfter.value ||
    !resolvedPreviousGradeCode ||
    !resolvedPromotedGradeCode
  ) {
    return empty;
  }

  const resolvedPreviousFamilyCode =
    previousFamily.value || input.currentJobFamilyCode || "";
  const resolvedPromotedFamilyCode =
    promotedFamily.value ||
    previousFamily.value ||
    input.currentJobFamilyCode ||
    "";

  if (!resolvedPreviousFamilyCode) {
    pushError(
      input.rowIssues,
      "promotion_incomplete_group",
      input.sourceRowNumber,
      "previousJobFamilyCode",
      "Famille avant promotion requise (ou famille courante résolue sur la ligne).",
    );
  }
  if (!resolvedPromotedFamilyCode) {
    pushError(
      input.rowIssues,
      "promotion_incomplete_group",
      input.sourceRowNumber,
      "promotedJobFamilyCode",
      "Famille après promotion requise (ou famille courante / précédente résolue).",
    );
  }

  const previousFamilyRef =
    resolvedPreviousFamilyCode
      ? jobFamilyByCode.get(resolvedPreviousFamilyCode.toUpperCase()) ?? null
      : null;
  const promotedFamilyRef =
    resolvedPromotedFamilyCode
      ? jobFamilyByCode.get(resolvedPromotedFamilyCode.toUpperCase()) ?? null
      : null;
  const previousGradeRef =
    gradeByCode.get(resolvedPreviousGradeCode.toUpperCase()) ?? null;
  const promotedGradeRef =
    gradeByCode.get(resolvedPromotedGradeCode.toUpperCase()) ?? null;

  if (!previousGradeRef) {
    pushError(
      input.rowIssues,
      "unknown_previous_grade",
      input.sourceRowNumber,
      "previousGradeCode",
      `Ancien grade inconnu dans le référentiel : « ${resolvedPreviousGradeCode} ».`,
    );
  }
  if (!promotedGradeRef) {
    // Uniquement si une valeur explicite invalide a été fournie (pas le fallback).
    if (promotedGrade.present && promotedGrade.value) {
      pushError(
        input.rowIssues,
        "unknown_promoted_grade",
        input.sourceRowNumber,
        "promotedGradeCode",
        `Nouveau grade inconnu dans le référentiel : « ${promotedGrade.value} ».`,
      );
    } else {
      pushError(
        input.rowIssues,
        "unknown_promoted_grade",
        input.sourceRowNumber,
        "promotedGradeCode",
        `Grade après promotion introuvable après fallback : « ${resolvedPromotedGradeCode} ».`,
      );
    }
  }
  if (resolvedPreviousFamilyCode && !previousFamilyRef) {
    pushError(
      input.rowIssues,
      "unknown_previous_job_family",
      input.sourceRowNumber,
      "previousJobFamilyCode",
      `Ancienne famille inconnue dans le référentiel : « ${resolvedPreviousFamilyCode} ».`,
    );
  }
  if (resolvedPromotedFamilyCode && !promotedFamilyRef) {
    pushError(
      input.rowIssues,
      "unknown_promoted_job_family",
      input.sourceRowNumber,
      "promotedJobFamilyCode",
      `Nouvelle famille inconnue dans le référentiel : « ${resolvedPromotedFamilyCode} ».`,
    );
  }

  if (
    !previousGradeRef ||
    !promotedGradeRef ||
    !previousFamilyRef ||
    !promotedFamilyRef
  ) {
    return empty;
  }

  try {
    const event = buildPromotionEvent({
      promotionDate,
      salaryBeforePromotionFcfa: BigInt(salaryBefore.value),
      salaryAfterPromotionFcfa: BigInt(salaryAfter.value),
      previousGradeCode: previousGradeRef.code,
      promotedGradeCode: promotedGradeRef.code,
      previousJobFamilyCode: previousFamilyRef.code,
      promotedJobFamilyCode: promotedFamilyRef.code,
    });

    if (
      input.decemberBaseSalary !== null &&
      input.currentGradeCode &&
      input.currentJobFamilyCode
    ) {
      validatePromotionAgainstDecemberSnapshot({
        event,
        campaignYear: input.campaignReferenceYear,
        decemberBaseSalaryFcfa: BigInt(input.decemberBaseSalary),
        currentGradeCode: input.currentGradeCode,
        currentJobFamilyCode: input.currentJobFamilyCode,
      });
    }
  } catch (error) {
    if (error instanceof PromotionValidationError) {
      pushError(
        input.rowIssues,
        error.code,
        input.sourceRowNumber,
        "promotionDate",
        error.message,
      );
      return empty;
    }
    throw error;
  }

  return {
    promotionDate,
    salaryBeforePromotion: salaryBefore.value,
    salaryAfterPromotion: salaryAfter.value,
    previousGradeId: previousGradeRef.id,
    previousGradeCode: previousGradeRef.code,
    promotedGradeId: promotedGradeRef.id,
    promotedGradeCode: promotedGradeRef.code,
    previousJobFamilyId: previousFamilyRef.id,
    previousJobFamilyCode: previousFamilyRef.code,
    promotedJobFamilyId: promotedFamilyRef.id,
    promotedJobFamilyCode: promotedFamilyRef.code,
  };
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

function readOptionalPromotionSalary(
  row: unknown[],
  mappingByField: Map<HrImportColumnKey, number | null>,
  field: HrImportColumnKey,
  sourceRowNumber: number,
  rowIssues: HrImportIssue[],
): { present: boolean; value: number | null } {
  const raw = readCell(row, mappingByField, field);
  const present = cellToText(raw) !== "";
  if (!present) {
    return { present: false, value: null };
  }
  if (isFormulaCell(raw)) {
    pushError(
      rowIssues,
      "formula_not_allowed",
      sourceRowNumber,
      field,
      "Les formules ne sont pas autorisées dans le fichier importé : saisissez une valeur fixe.",
    );
    return { present: true, value: null };
  }
  const amount = readStrictPositiveFcfa(raw);
  if (amount === null) {
    pushError(
      rowIssues,
      `invalid_${field}`,
      sourceRowNumber,
      field,
      "Le montant doit être un entier FCFA strictement positif.",
    );
    return { present: true, value: null };
  }
  return { present: true, value: amount };
}

function readOptionalPromotionCode(
  row: unknown[],
  mappingByField: Map<HrImportColumnKey, number | null>,
  field: HrImportColumnKey,
  sourceRowNumber: number,
  rowIssues: HrImportIssue[],
): { present: boolean; value: string | null } {
  const raw = readCell(row, mappingByField, field);
  const present = cellToText(raw) !== "";
  if (!present) {
    return { present: false, value: null };
  }
  if (isFormulaCell(raw)) {
    pushError(
      rowIssues,
      "formula_not_allowed",
      sourceRowNumber,
      field,
      "Les formules ne sont pas autorisées dans le fichier importé : saisissez une valeur fixe.",
    );
    return { present: true, value: null };
  }
  const value = cellToText(raw).toUpperCase();
  return { present: true, value: value || null };
}

function pushError(
  issues: HrImportIssue[],
  code: string,
  sourceRowNumber: number | null,
  field: string | null,
  message: string,
): void {
  issues.push({
    severity: "error",
    code,
    sourceRowNumber,
    field,
    message,
    employeeNumber: null,
  });
}

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
