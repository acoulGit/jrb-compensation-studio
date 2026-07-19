import { describe, expect, it } from "vitest";
import { DEFAULT_NINE_BOX_FACTORS } from "../domain/compensationReference/defaults";
import type { NineBoxFactor } from "../domain/compensationReference/models";
import {
  DEFAULT_NINE_BOX_ORIENTATION,
  getNineBoxFactor,
  getNineBoxFactorAtCell,
  getNineBoxMatrixAxes,
  NineBoxLookupError,
  NINE_BOX_COLUMN_LEVEL_ORDER,
  NINE_BOX_ROW_LEVEL_ORDER,
} from "../domain/compensationReference/nineBoxOrientation";
import { createMemoryAppServices } from "../services/createAppServices";

function toFactors(campaignId = 1): NineBoxFactor[] {
  const now = "2026-07-19T00:00:00.000Z";
  return DEFAULT_NINE_BOX_FACTORS.map((seed) => ({
    campaignId,
    boxCode: seed.boxCode,
    performanceLevel: seed.performanceLevel,
    potentialLevel: seed.potentialLevel,
    factorMilli: seed.factorMilli,
    createdAt: now,
    updatedAt: now,
  }));
}

describe("Lot 2A-1 — orientation et lookup 9-Box", () => {
  it("utilise l’orientation Orange par défaut", async () => {
    const services = createMemoryAppServices();
    const campaign = await services.campaign.createCampaign({
      name: "Campagne 9-Box défaut",
      referenceYear: 2026,
      notes: "",
    });
    const set = await services.compensationReference.getReferenceSet(
      campaign.id,
    );
    expect(set.config.nineBoxOrientation).toBe(DEFAULT_NINE_BOX_ORIENTATION);
    expect(set.config.nineBoxOrientation).toBe(
      "performance_rows_potential_columns",
    );
  });

  it("persiste le changement d’orientation et le recharge", async () => {
    const services = createMemoryAppServices();
    const campaign = await services.campaign.createCampaign({
      name: "Orientation persistée",
      referenceYear: 2026,
      notes: "",
    });

    const updated = await services.compensationReference.updateNineBoxOrientation(
      campaign.id,
      "performance_columns_potential_rows",
    );
    expect(updated.config.nineBoxOrientation).toBe(
      "performance_columns_potential_rows",
    );

    const reloaded = await services.compensationReference.getReferenceSet(
      campaign.id,
    );
    expect(reloaded.config.nineBoxOrientation).toBe(
      "performance_columns_potential_rows",
    );
  });

  it("bloque la modification d’orientation sur campagne archivée", async () => {
    const services = createMemoryAppServices();
    const campaign = await services.campaign.createCampaign({
      name: "Orientation archivée",
      referenceYear: 2026,
      notes: "",
    });
    await services.campaign.archiveCampaign(campaign.id);

    await expect(
      services.compensationReference.updateNineBoxOrientation(
        campaign.id,
        "performance_columns_potential_rows",
      ),
    ).rejects.toMatchObject({ message: expect.stringMatching(/archiv/i) });
  });

  it("conserve neuf couples Performance/Potentiel uniques sans doublon", () => {
    const factors = toFactors();
    expect(factors).toHaveLength(9);
    const keys = factors.map(
      (factor) => `${factor.performanceLevel}/${factor.potentialLevel}`,
    );
    expect(new Set(keys).size).toBe(9);
  });

  it("préserve les facteurs seed (aucun perdu, valeurs attendues)", () => {
    const factors = toFactors();
    const byBox = Object.fromEntries(
      factors.map((factor) => [factor.boxCode, factor.factorMilli]),
    );
    expect(byBox).toEqual({
      1: 200,
      2: 800,
      3: 1100,
      4: 250,
      5: 1000,
      6: 1250,
      7: 300,
      8: 1100,
      9: 1400,
    });
  });

  it("retourne le même facteur avant/après changement d’orientation", () => {
    const factors = toFactors();
    const before = getNineBoxFactor(factors, "high", "low");
    const orange = getNineBoxFactorAtCell(
      factors,
      "performance_rows_potential_columns",
      "high",
      "low",
    );
    const inverted = getNineBoxFactorAtCell(
      factors,
      "performance_columns_potential_rows",
      "low",
      "high",
    );

    expect(before.factorMilli).toBe(1100);
    expect(orange.factorMilli).toBe(before.factorMilli);
    expect(inverted.factorMilli).toBe(before.factorMilli);
    expect(orange.boxCode).toBe(before.boxCode);
    expect(inverted.boxCode).toBe(before.boxCode);
  });

  it("ne dépend pas du box_number pour le lookup métier", () => {
    const factors = toFactors().map((factor) => ({
      ...factor,
      boxCode: factor.boxCode + 100,
    }));
    const found = getNineBoxFactor(factors, "medium", "medium");
    expect(found.factorMilli).toBe(1000);
    expect(found.boxCode).toBe(105);
  });

  it("échoue explicitement si le couple est absent", () => {
    expect(() => getNineBoxFactor([], "low", "high")).toThrow(
      NineBoxLookupError,
    );
    try {
      getNineBoxFactor([], "low", "high");
    } catch (error) {
      expect(error).toMatchObject({ code: "MISSING" });
    }
  });

  it("échoue explicitement en cas de doublon sémantique", () => {
    const factors = toFactors();
    const duplicate = { ...factors[0], boxCode: 99 };
    expect(() =>
      getNineBoxFactor([...factors, duplicate], "low", "low"),
    ).toThrow(NineBoxLookupError);
    try {
      getNineBoxFactor([...factors, duplicate], "low", "low");
    } catch (error) {
      expect(error).toMatchObject({ code: "DUPLICATE" });
    }
  });

  it("transpose visuellement la matrice sans changer les axes d’ordre", () => {
    const orange = getNineBoxMatrixAxes("performance_rows_potential_columns");
    const inverted = getNineBoxMatrixAxes(
      "performance_columns_potential_rows",
    );

    expect(orange.rowDimension).toBe("performance");
    expect(orange.columnDimension).toBe("potential");
    expect(orange.rowAxisLabel).toBe("Performance");
    expect(orange.columnAxisLabel).toBe("Potentiel");

    expect(inverted.rowDimension).toBe("potential");
    expect(inverted.columnDimension).toBe("performance");
    expect(inverted.rowAxisLabel).toBe("Potentiel");
    expect(inverted.columnAxisLabel).toBe("Performance");

    expect(orange.rowLevels).toEqual(NINE_BOX_ROW_LEVEL_ORDER);
    expect(orange.columnLevels).toEqual(NINE_BOX_COLUMN_LEVEL_ORDER);
    expect(inverted.rowLevels).toEqual(NINE_BOX_ROW_LEVEL_ORDER);
    expect(inverted.columnLevels).toEqual(NINE_BOX_COLUMN_LEVEL_ORDER);
  });

  it("place high en haut des lignes et low à gauche des colonnes", () => {
    expect(NINE_BOX_ROW_LEVEL_ORDER).toEqual(["high", "medium", "low"]);
    expect(NINE_BOX_COLUMN_LEVEL_ORDER).toEqual(["low", "medium", "high"]);
  });
});
