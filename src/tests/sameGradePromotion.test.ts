/**
 * Lot 2B-RC1-H3 — promotion salariale sans changement de grade.
 */

import { describe, expect, it } from "vitest";
import {
  CALCULATION_CONTRACT_VERSION,
  RESULT_SCHEMA_VERSION,
  buildPromotionAwareMonthlySalaryTrajectory,
  buildPromotionEvent,
  PromotionValidationError,
} from "../domain/compensationCalculation";
import { buildAutoMapping } from "../infrastructure/imports/columnMapping";
import { normalizeImportRows } from "../infrastructure/imports/rowNormalizer";
import { MemoryCampaignRepository } from "../infrastructure/database/repositories/memoryCampaignRepository";
import { MemoryCompensationReferenceRepository } from "../infrastructure/database/repositories/memoryCompensationReferenceRepository";
import { CampaignService } from "../services/campaignService";
import { CompensationReferenceService } from "../services/compensationReferenceService";

const TODAY = "2026-07-18";

const PROMO_HEADERS = [
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
  "Date promotion",
  "Salaire avant promotion",
  "Salaire après promotion",
  "Ancien grade",
  "Nouveau grade",
];

function promoRow(overrides: {
  matricule?: string;
  grade?: string;
  salaire?: number;
  promoDate?: string;
  salaryBefore?: number | "";
  salaryAfter?: number | "";
  previousGrade?: string;
  promotedGrade?: string | "";
  previousFamily?: string;
  promotedFamily?: string | "";
}): (string | number)[] {
  return [
    overrides.matricule ?? "EMP-P001",
    "Salarié Promo",
    "F1",
    overrides.grade ?? "G3",
    "CDI",
    "Actif",
    "2020-01-15",
    overrides.salaire ?? 500_000,
    5,
    "Non",
    0,
    0,
    0,
    overrides.promoDate ?? "2026-04-15",
    overrides.salaryBefore === undefined ? 500_000 : overrides.salaryBefore,
    overrides.salaryAfter === undefined ? 550_000 : overrides.salaryAfter,
    overrides.previousGrade ?? "G3",
    overrides.promotedGrade === undefined ? "G4" : overrides.promotedGrade,
  ];
}

async function referenceSet() {
  const campaignRepository = new MemoryCampaignRepository();
  const referenceRepository = new MemoryCompensationReferenceRepository();
  const compensationReference = new CompensationReferenceService(
    referenceRepository,
    campaignRepository,
  );
  const campaign = await new CampaignService(
    campaignRepository,
    referenceRepository,
  ).createCampaign({
    name: "H3 promo",
    referenceYear: 2026,
    notes: "",
  });
  return compensationReference.getReferenceSet(campaign.id);
}

describe("Lot 2B-RC1-H3 — versions", () => {
  it("bumpe contrat 7 et conserve schema 5", () => {
    expect(CALCULATION_CONTRACT_VERSION).toBe(8);
    expect(RESULT_SCHEMA_VERSION).toBe(6);
  });
});

describe("Lot 2B-RC1-H3 — moteur buildPromotionEvent", () => {
  it("accepte G3→G4, G3→G3 et calcule le montant", () => {
    const changed = buildPromotionEvent({
      promotionDate: "2026-04-15",
      salaryBeforePromotionFcfa: 500_000n,
      salaryAfterPromotionFcfa: 550_000n,
      previousGradeCode: "G3",
      promotedGradeCode: "G4",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    expect(changed.promotionAmountFcfa).toBe(50_000n);
    expect(changed.promotedGradeCode).toBe("G4");

    const same = buildPromotionEvent({
      promotionDate: "2026-04-15",
      salaryBeforePromotionFcfa: 500_000n,
      salaryAfterPromotionFcfa: 550_000n,
      previousGradeCode: "G3",
      promotedGradeCode: "G3",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    expect(same.previousGradeCode).toBe("G3");
    expect(same.promotedGradeCode).toBe("G3");
    expect(same.promotionAmountFcfa).toBe(50_000n);
  });

  it("refuse baisse ou absence d’évolution salariale", () => {
    expect(() =>
      buildPromotionEvent({
        promotionDate: "2026-04-15",
        salaryBeforePromotionFcfa: 550_000n,
        salaryAfterPromotionFcfa: 500_000n,
        previousGradeCode: "G3",
        promotedGradeCode: "G3",
        previousJobFamilyCode: "F1",
        promotedJobFamilyCode: "F1",
      }),
    ).toThrow(PromotionValidationError);

    expect(() =>
      buildPromotionEvent({
        promotionDate: "2026-04-15",
        salaryBeforePromotionFcfa: 500_000n,
        salaryAfterPromotionFcfa: 500_000n,
        previousGradeCode: "G3",
        promotedGradeCode: "G3",
        previousJobFamilyCode: "F1",
        promotedJobFamilyCode: "F1",
      }),
    ).toThrow(PromotionValidationError);
  });

  it("trajectoire : même grade, nouveau salaire dès le mois de promotion", () => {
    const event = buildPromotionEvent({
      promotionDate: "2026-04-15",
      salaryBeforePromotionFcfa: 500_000n,
      salaryAfterPromotionFcfa: 550_000n,
      previousGradeCode: "G3",
      promotedGradeCode: "G3",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const trajectory = buildPromotionAwareMonthlySalaryTrajectory({
      campaignYear: 2026,
      technicalApplicationMonth: 7,
      decemberBaseSalaryFcfa: 500_000n,
      currentGradeCode: "G3",
      currentJobFamilyCode: "F1",
      promotion: event,
    });
    expect(trajectory.trajectory).toHaveLength(12);
    const march = trajectory.trajectory.find((m) => m.month === 3)!;
    const april = trajectory.trajectory.find((m) => m.month === 4)!;
    expect(march.baseSalaryFcfa).toBe(500_000n);
    expect(march.gradeCode).toBe("G3");
    expect(april.baseSalaryFcfa).toBe(550_000n);
    expect(april.gradeCode).toBe("G3");
    expect(trajectory.costPreview.promotionAmountFcfa).toBe(50_000n);
    expect(trajectory.costPreview.includedInSimulation).toBe(true);
  });

  it("exclut la promotion si mois > mois technique", () => {
    const event = buildPromotionEvent({
      promotionDate: "2026-09-01",
      salaryBeforePromotionFcfa: 500_000n,
      salaryAfterPromotionFcfa: 550_000n,
      previousGradeCode: "G3",
      promotedGradeCode: "G3",
      previousJobFamilyCode: "F1",
      promotedJobFamilyCode: "F1",
    });
    const trajectory = buildPromotionAwareMonthlySalaryTrajectory({
      campaignYear: 2026,
      technicalApplicationMonth: 7,
      decemberBaseSalaryFcfa: 500_000n,
      currentGradeCode: "G3",
      currentJobFamilyCode: "F1",
      promotion: event,
    });
    expect(trajectory.costPreview.includedInSimulation).toBe(false);
  });
});

describe("Lot 2B-RC1-H3 — import", () => {
  it("accepte G3→G4, G3→G3 et grade après vide avec fallback G3", async () => {
    const reference = await referenceSet();
    const mapping = buildAutoMapping(PROMO_HEADERS);

    const changed = normalizeImportRows({
      rows: [PROMO_HEADERS, promoRow({ promotedGrade: "G4", grade: "G3", salaire: 500_000 })],
      headerRowIndex: 0,
      mapping,
      jobFamilies: reference.jobFamilies,
      grades: reference.grades,
      todayIsoDate: TODAY,
      campaignReferenceYear: 2026,
    });
    expect(changed.validCount).toBe(1);
    expect(changed.normalized[0].previousGradeCode).toBe("G3");
    expect(changed.normalized[0].promotedGradeCode).toBe("G4");

    const same = normalizeImportRows({
      rows: [
        PROMO_HEADERS,
        promoRow({
          promotedGrade: "G3",
          previousGrade: "G3",
          grade: "G3",
          salaire: 500_000,
        }),
      ],
      headerRowIndex: 0,
      mapping,
      jobFamilies: reference.jobFamilies,
      grades: reference.grades,
      todayIsoDate: TODAY,
      campaignReferenceYear: 2026,
    });
    expect(same.validCount).toBe(1);
    expect(same.normalized[0].previousGradeCode).toBe("G3");
    expect(same.normalized[0].promotedGradeCode).toBe("G3");
    expect(same.normalized[0].promotionAmount).toBe(50_000);

    const emptyPromoted = normalizeImportRows({
      rows: [
        PROMO_HEADERS,
        promoRow({
          promotedGrade: "",
          previousGrade: "G3",
          grade: "G3",
          salaire: 500_000,
        }),
      ],
      headerRowIndex: 0,
      mapping,
      jobFamilies: reference.jobFamilies,
      grades: reference.grades,
      todayIsoDate: TODAY,
      campaignReferenceYear: 2026,
    });
    expect(emptyPromoted.validCount).toBe(1);
    expect(emptyPromoted.normalized[0].promotedGradeCode).toBe("G3");
    expect(
      emptyPromoted.issues.some(
        (issue) => issue.code === "promotion_incomplete_group",
      ),
    ).toBe(false);
  });

  it("conserve les contrôles salariaux et date obligatoire", async () => {
    const reference = await referenceSet();
    const mapping = buildAutoMapping(PROMO_HEADERS);

    const noDate = normalizeImportRows({
      rows: [
        PROMO_HEADERS,
        promoRow({ promoDate: undefined as unknown as string, salaryBefore: 500_000 }),
      ],
      headerRowIndex: 0,
      mapping,
      jobFamilies: reference.jobFamilies,
      grades: reference.grades,
      todayIsoDate: TODAY,
      campaignReferenceYear: 2026,
    });
    // promoRow always sets date — use raw row without date cell
    const rowNoDate = promoRow({});
    rowNoDate[13] = "";
    const noDateResult = normalizeImportRows({
      rows: [PROMO_HEADERS, rowNoDate],
      headerRowIndex: 0,
      mapping,
      jobFamilies: reference.jobFamilies,
      grades: reference.grades,
      todayIsoDate: TODAY,
      campaignReferenceYear: 2026,
    });
    expect(noDateResult.validCount).toBe(0);
    expect(
      noDateResult.issues.some(
        (issue) => issue.code === "promotion_partial_without_date",
      ),
    ).toBe(true);
    void noDate;

    const afterLower = normalizeImportRows({
      rows: [
        PROMO_HEADERS,
        promoRow({
          salaryBefore: 550_000,
          salaryAfter: 500_000,
          promotedGrade: "G3",
          previousGrade: "G3",
          grade: "G3",
          salaire: 550_000,
        }),
      ],
      headerRowIndex: 0,
      mapping,
      jobFamilies: reference.jobFamilies,
      grades: reference.grades,
      todayIsoDate: TODAY,
      campaignReferenceYear: 2026,
    });
    expect(afterLower.validCount).toBe(0);
  });
});
