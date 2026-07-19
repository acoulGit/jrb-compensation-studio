import { describe, expect, it } from "vitest";
import { createMemoryAppServices } from "../services/createAppServices";
import { sanitizeTechnicalError } from "../services/sanitizeTechnicalError";

describe("archivage campagne", () => {
  it("archive une campagne draft puis la restaure avec référentiels préservés", async () => {
    const services = createMemoryAppServices();
    const campaign = await services.campaign.createCampaign({
      name: "Campagne recette Lot 1B",
      referenceYear: 2028,
      notes: "recette",
    });

    const before = await services.compensationReference.getReferenceSet(
      campaign.id,
    );
    expect(before.jobFamilies).toHaveLength(5);
    expect(before.grades).toHaveLength(6);

    const archived = await services.campaign.archiveCampaign(campaign.id);
    expect(archived.status).toBe("archived");
    expect(archived.archivedAt).toBeTruthy();

    // Import RH lecture seule : toute confirmation est refusée sur campagne archivée.
    await expect(
      services.hrImport.confirmImport({
        campaignId: campaign.id,
        fileName: "noop.xlsx",
        format: "xlsx",
        sheetName: "Feuil1",
        fileSizeBytes: 10,
        rows: [["Matricule"]],
        headerRowIndex: 0,
        mapping: [],
      }),
    ).rejects.toMatchObject({ message: expect.stringMatching(/archiv/i) });

    const restored = await services.campaign.restoreCampaign(campaign.id);
    expect(restored.status).toBe("draft");
    expect(restored.archivedAt).toBeNull();

    const after = await services.compensationReference.getReferenceSet(
      campaign.id,
    );
    expect(after.jobFamilies).toHaveLength(5);
    expect(after.grades).toHaveLength(6);
    expect(after.jobFamilies.map((item) => item.code)).toEqual(
      before.jobFamilies.map((item) => item.code),
    );
  });

  it("journalise [CAMPAIGN_ARCHIVE_FAILED] avec type/name/message/code uniquement", () => {
    const error = Object.assign(new Error("database is locked"), {
      name: "SqliteError",
      code: "SQLITE_BUSY",
    });
    const sanitized = sanitizeTechnicalError(error);
    const payload = {
      type: sanitized.detectedType,
      name: sanitized.name,
      message: sanitized.message,
      code: sanitized.code,
    };

    expect(Object.keys(payload).sort()).toEqual([
      "code",
      "message",
      "name",
      "type",
    ]);
    expect(payload.type).toBe("Error");
    expect(payload.name).toBe("SqliteError");
    expect(payload.message).toBe("database is locked");
    expect(payload.code).toBe("SQLITE_BUSY");
  });
});
