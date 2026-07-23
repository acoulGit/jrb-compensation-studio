/**
 * Tests Lot 2B-RC1-H1 — neutralisation individuelle de l’effet 9-Box.
 */

import { describe, expect, it } from "vitest";
import {
  CALCULATION_CONTRACT_VERSION,
  RESULT_SCHEMA_VERSION_V3,
  RESULT_SCHEMA_VERSION_V4,
  calculateIndividualMatrixWeight,
  resolveEvaluationFactor,
  resolveNineBoxTreatmentKind,
} from "../domain/compensationCalculation";
import { readBooleanFlag } from "../infrastructure/imports/cellReaders";
import { OPTIONAL_IMPORT_COLUMNS } from "../domain/hrImport/models";
import { canPresentResultSchemaVersion } from "../application/campaignSimulation/resultSchemaCompatibility";
import { mapImportedEmployeeToPreparedInput } from "../application/campaignSimulation/mapImportedEmployeeToPreparedInput";
import type { EmployeeSnapshot } from "../domain/hrImport/models";
import type { NineBoxFactor } from "../domain/compensationReference/models";

describe("Lot 2B-RC1-H1 — versions", () => {
  it("expose le contrat v5/schema v4 historiques (Lot 2B-RC1-H2 : contrat courant = 6)", () => {
    expect(CALCULATION_CONTRACT_VERSION).toBe(9);
    expect(RESULT_SCHEMA_VERSION_V4).toBe(4);
    expect(RESULT_SCHEMA_VERSION_V3).toBe(3);
  });

  it("conserve la consultation des snapshots v3 et v4", () => {
    expect(canPresentResultSchemaVersion(3)).toBe(true);
    expect(canPresentResultSchemaVersion(4)).toBe(true);
    expect(canPresentResultSchemaVersion(2)).toBe(false);
  });
});

describe("Lot 2B-RC1-H1 — import booléen", () => {
  it("parse Oui/Non/true/false/1/0 et vide→false", () => {
    expect(readBooleanFlag("Oui")).toBe(true);
    expect(readBooleanFlag("NON")).toBe(false);
    expect(readBooleanFlag("true")).toBe(true);
    expect(readBooleanFlag("false")).toBe(false);
    expect(readBooleanFlag("1")).toBe(true);
    expect(readBooleanFlag("0")).toBe(false);
    expect(readBooleanFlag("")).toBe(false);
    expect(readBooleanFlag("peut-être")).toBe("invalid");
  });

  it("place la colonne après Sous-performant confirmé", () => {
    const keys = OPTIONAL_IMPORT_COLUMNS.map((c) => c.key);
    const confirmedIdx = keys.indexOf("confirmedUnderperformer");
    const neutralizeIdx = keys.indexOf("neutralizeNineBoxEffect");
    expect(neutralizeIdx).toBe(confirmedIdx + 1);
    expect(
      OPTIONAL_IMPORT_COLUMNS.find((c) => c.key === "neutralizeNineBoxEffect")
        ?.label,
    ).toBe("Neutraliser effet 9-Box");
  });
});

describe("Lot 2B-RC1-H1 — moteur", () => {
  const nineBoxFactors = [
    {
      performanceLevel: "medium" as const,
      potentialLevel: "medium" as const,
      factorMilli: 1200,
      boxCode: 5,
    },
  ];

  it("neutralisation Oui → facteur d’évaluation = coefficient provisoire (contrat 6)", () => {
    const result = resolveEvaluationFactor({
      mode: "full_nine_box",
      performanceLevel: "medium",
      potentialLevel: "medium",
      performanceFactors: [],
      potentialFactors: [],
      nineBoxFactors,
      neutralizeNineBoxEffect: true,
      nineBoxConfirmationFactorMilli: 900,
    });
    expect(result.exactFactorNumerator).toBe(900_000);
  });

  it("neutralisation Oui + sous-performance confirmée → poids effectif 0", () => {
    const result = calculateIndividualMatrixWeight({
      salaryFcfa: 500_000n,
      s0Fcfa: 500_000n,
      salaryPositions: [
        {
          code: "Sout-",
          label: "Sout-",
          referenceRatioBps: null,
          positionFactorMilli: 800,
        },
        {
          code: "mid",
          label: "Milieu",
          referenceRatioBps: 10000,
          positionFactorMilli: 1000,
        },
        {
          code: "Sout+",
          label: "Sout+",
          referenceRatioBps: null,
          positionFactorMilli: 1200,
        },
      ],
      mode: "full_nine_box",
      performanceLevel: "medium",
      potentialLevel: "medium",
      performanceFactors: [],
      potentialFactors: [],
      nineBoxFactors,
      neutralizeNineBoxEffect: true,
      nineBoxConfirmationFactorMilli: 900,
      confirmedUnderperformer: true,
    });
    expect(result.evaluationFactor.exactFactorNumerator).toBe(900_000);
    expect(result.exactWeightNumerator).toBe(0n);
    expect(result.blockingReason).toBe("CONFIRMED_UNDERPERFORMER");
  });

  it("neutralisation Non + code présent → facteur 9-Box appliqué", () => {
    const result = resolveEvaluationFactor({
      mode: "full_nine_box",
      performanceLevel: "medium",
      potentialLevel: "medium",
      performanceFactors: [],
      potentialFactors: [],
      nineBoxFactors,
      neutralizeNineBoxEffect: false,
    });
    expect(result.exactFactorNumerator).toBe(1_200_000);
    expect(resolveNineBoxTreatmentKind({
      neutralizeNineBoxEffect: false,
      sourceNineBoxCode: 5,
    })).toBe("nine_box_code_applied");
  });

  it("traitement confirmation (contrat 6) vs neutralisé (sémantique v4) vs manquant", () => {
    expect(
      resolveNineBoxTreatmentKind({
        neutralizeNineBoxEffect: true,
        sourceNineBoxCode: null,
      }),
    ).toBe("performance_pending_confirmation");
    expect(
      resolveNineBoxTreatmentKind({
        neutralizeNineBoxEffect: true,
        sourceNineBoxCode: null,
        usePendingConfirmationSemantics: false,
      }),
    ).toBe("nine_box_effect_neutralized");
    expect(
      resolveNineBoxTreatmentKind({
        neutralizeNineBoxEffect: false,
        sourceNineBoxCode: null,
      }),
    ).toBe("missing_nine_box_data_treatment");
  });
});

describe("Lot 2B-RC1-H1 — mapping import → préparé", () => {
  const nineBox: NineBoxFactor = {
    campaignId: 1,
    boxCode: 5,
    performanceLevel: "medium",
    potentialLevel: "medium",
    factorMilli: 1200,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  const baseEmployee = {
    id: 1,
    importBatchId: 1,
    campaignId: 1,
    employeeNumber: "E-1",
    employeeLabel: "Ada",
    jobFamilyId: 1,
    gradeId: 1,
    contractType: "cdi" as const,
    employmentStatus: "active" as const,
    hireDate: "2018-01-01",
    decemberBaseSalary: 500_000,
    nineBoxCode: null as number | null,
    confirmedUnderperformer: false,
    neutralizeNineBoxEffect: false,
    promotionAmount: 0,
    correctionAmount: 0,
    socialMeasureAmount: 0,
    promotionDate: null,
    salaryBeforePromotion: null,
    salaryAfterPromotion: null,
    previousGradeId: null,
    promotedGradeId: null,
    previousJobFamilyId: null,
    promotedJobFamilyId: null,
    sourceRowNumber: 2,
    createdAt: "2026-01-01T00:00:00.000Z",
  } satisfies EmployeeSnapshot;

  const context = {
    evaluationMode: "full_nine_box" as const,
    campaignYear: 2026,
    familiesById: new Map([
      [
        1,
        {
          id: 1,
          campaignId: 1,
          code: "TECH",
          label: "Technique",
          sortOrder: 1,
          createdAt: "",
          updatedAt: "",
        },
      ],
    ]),
    gradesById: new Map([
      [
        1,
        {
          id: 1,
          campaignId: 1,
          code: "G1",
          label: "Grade 1",
          sortOrder: 1,
          createdAt: "",
          updatedAt: "",
        },
      ],
    ]),
    nineBoxFactorsByCode: new Map([[5, nineBox]]),
  };

  it("code absent + Non → blocage historique", () => {
    const mapped = mapImportedEmployeeToPreparedInput(baseEmployee, context);
    expect(mapped.ok).toBe(false);
    if (!mapped.ok) {
      expect(mapped.issues.some((i) => i.code === "MISSING_EMPLOYEE_PERFORMANCE")).toBe(
        true,
      );
    }
  });

  it("code absent + Oui → facteur neutre autorisé", () => {
    const mapped = mapImportedEmployeeToPreparedInput(
      { ...baseEmployee, neutralizeNineBoxEffect: true },
      context,
    );
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.prepared.neutralizeNineBoxEffect).toBe(true);
      expect(mapped.prepared.sourceNineBoxCode).toBeNull();
      expect(mapped.prepared.performanceLevel).toBeUndefined();
    }
  });

  it("code présent + Oui → avertissement non bloquant", () => {
    const mapped = mapImportedEmployeeToPreparedInput(
      {
        ...baseEmployee,
        nineBoxCode: 5,
        neutralizeNineBoxEffect: true,
      },
      context,
    );
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.warnings.length).toBeGreaterThan(0);
      expect(mapped.prepared.sourceNineBoxCode).toBe(5);
      expect(mapped.prepared.neutralizeNineBoxEffect).toBe(true);
    }
  });
});
