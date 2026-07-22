import { describe, expect, it } from "vitest";
import { buildSimulationResultIdentity } from "../application/campaignSimulation/buildSimulationResultIdentity";

describe("buildSimulationResultIdentity", () => {
  it("combine campaignId, runSequence et empreintes", () => {
    const identity = buildSimulationResultIdentity({
      campaignId: 7,
      runSequence: 2,
      sourceFingerprint: "src-fp",
      configurationFingerprint: "cfg-fp",
    });
    expect(identity).toBe("7|2|src-fp|cfg-fp");
  });

  it("distingue deux exécutions successives", () => {
    const first = buildSimulationResultIdentity({
      campaignId: 1,
      runSequence: 1,
      sourceFingerprint: "a",
      configurationFingerprint: "b",
    });
    const second = buildSimulationResultIdentity({
      campaignId: 1,
      runSequence: 2,
      sourceFingerprint: "a",
      configurationFingerprint: "b",
    });
    expect(first).not.toBe(second);
  });

  it("conserve le format historique quand aucun champ de config n'est fourni", () => {
    const identity = buildSimulationResultIdentity({
      campaignId: 3,
      runSequence: 4,
      sourceFingerprint: "s",
      configurationFingerprint: "c",
    });
    expect(identity).toBe("3|4|s|c");
  });

  it("distingue deux configurations validées différentes", () => {
    const base = {
      campaignId: 1,
      runSequence: 1,
      sourceFingerprint: "same-src",
      configurationFingerprint: "same-cfg",
    };
    const retroJanuary = buildSimulationResultIdentity({
      ...base,
      retroactivityStartMonth: 1,
      technicalApplicationMonth: 4,
      minimumIncreaseMode: "none",
    });
    const retroMarch = buildSimulationResultIdentity({
      ...base,
      retroactivityStartMonth: 3,
      technicalApplicationMonth: 4,
      minimumIncreaseMode: "none",
    });
    expect(retroJanuary).not.toBe(retroMarch);
  });

  it("est stable pour une configuration validée identique", () => {
    const config = {
      campaignId: 2,
      runSequence: 5,
      sourceFingerprint: "s",
      configurationFingerprint: "c",
      retroactivityStartMonth: 1,
      technicalApplicationMonth: 4,
      minimumIncreaseMode: "fixed_monthly_amount" as const,
      minimumMonthlyAmountFcfa: 15000n,
      roundingStepFcfa: 100n,
      campaignYear: 2027,
      evaluationMode: "none" as const,
      currentImportBatchId: 10,
    };
    expect(buildSimulationResultIdentity(config)).toBe(
      buildSimulationResultIdentity({ ...config }),
    );
  });

  it("distingue deux politiques de minimum garanti (montant vs taux)", () => {
    const base = {
      campaignId: 9,
      runSequence: 1,
      sourceFingerprint: "s",
      configurationFingerprint: "c",
    };
    const fixed = buildSimulationResultIdentity({
      ...base,
      minimumIncreaseMode: "fixed_monthly_amount",
      minimumMonthlyAmountFcfa: 15000n,
    });
    const rate = buildSimulationResultIdentity({
      ...base,
      minimumIncreaseMode: "percentage_of_base_salary",
      minimumIncreaseRate: { numerator: 1n, denominator: 100n },
    });
    expect(fixed).not.toBe(rate);
  });
});
