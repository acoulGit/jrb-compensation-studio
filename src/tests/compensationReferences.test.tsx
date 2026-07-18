import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_NINE_BOX_FACTORS,
  DEFAULT_PERFORMANCE_FACTORS,
  DEFAULT_POTENTIAL_FACTORS,
  DEFAULT_SALARY_POSITIONS,
} from "../domain/compensationReference/defaults";
import { computeReferenceCompleteness } from "../domain/compensationReference/completeness";
import {
  formatFactorDisplay,
  parseFactorDisplayInput,
} from "../domain/compensationReference/conversions";
import App from "../App";
import { MemoryCampaignRepository } from "../infrastructure/database/repositories/memoryCampaignRepository";
import { MemoryCompensationReferenceRepository } from "../infrastructure/database/repositories/memoryCompensationReferenceRepository";
import { MemoryOrganizationRepository } from "../infrastructure/database/repositories/memoryOrganizationRepository";
import { CampaignService } from "../services/campaignService";
import { CompensationReferenceService } from "../services/compensationReferenceService";
import { createMemoryAppServices } from "../services/createAppServices";
import { OrganizationService } from "../services/organizationService";
import { AppError } from "../services/errors";

async function renderApp(services = createMemoryAppServices()) {
  const user = userEvent.setup();
  render(<App services={services} />);
  await screen.findByRole("navigation", { name: "Navigation principale" });
  return { user, services };
}

async function openReferences(user: ReturnType<typeof userEvent.setup>) {
  const nav = screen.getByRole("navigation", { name: "Navigation principale" });
  await user.click(within(nav).getByRole("button", { name: "Référentiels" }));
}

function buildServices() {
  const campaignRepository = new MemoryCampaignRepository();
  const referenceRepository = new MemoryCompensationReferenceRepository();
  return {
    organization: new OrganizationService(new MemoryOrganizationRepository()),
    campaign: new CampaignService(campaignRepository, referenceRepository),
    compensationReference: new CompensationReferenceService(
      referenceRepository,
      campaignRepository,
    ),
    campaignRepository,
    referenceRepository,
  };
}

describe("référentiels — initialisation", () => {
  it("applique les valeurs initiales validées via le dépôt mémoire", async () => {
    const services = buildServices();
    const campaign = await services.campaign.createCampaign({
      name: "Campagne valeurs initiales",
      referenceYear: 2026,
      notes: "",
    });
    const set = await services.compensationReference.getReferenceSet(
      campaign.id,
    );

    expect(set.jobFamilies).toHaveLength(5);
    expect(set.grades).toHaveLength(6);
    expect(set.salaryGrid).toHaveLength(30);
    expect(set.salaryGrid.every((cell) => cell.s0Amount === null)).toBe(true);
    expect(set.salaryPositions).toHaveLength(17);
    expect(set.config.nineBoxMode).toBe("none");

    const byCode = Object.fromEntries(
      set.salaryPositions.map((item) => [item.code, item.positionFactorMilli]),
    );
    expect(byCode["Sout-"]).toBe(1300);
    expect(byCode["S7-"]).toBe(1250);
    expect(byCode.S0).toBe(900);
    expect(byCode["S7+"]).toBe(300);
    expect(byCode["Sout+"]).toBe(100);

    const perf = Object.fromEntries(
      set.performanceFactors.map((item) => [item.level, item.factorMilli]),
    );
    expect(perf.low).toBe(250);
    expect(perf.medium).toBe(1000);
    expect(perf.high).toBe(1250);

    const pot = Object.fromEntries(
      set.potentialFactors.map((item) => [item.level, item.factorMilli]),
    );
    expect(pot.low).toBe(950);
    expect(pot.medium).toBe(1000);
    expect(pot.high).toBe(1050);

    const boxes = Object.fromEntries(
      set.nineBoxFactors.map((item) => [item.boxCode, item.factorMilli]),
    );
    expect(boxes[1]).toBe(200);
    expect(boxes[2]).toBe(800);
    expect(boxes[3]).toBe(1100);
    expect(boxes[4]).toBe(250);
    expect(boxes[5]).toBe(1000);
    expect(boxes[6]).toBe(1250);
    expect(boxes[7]).toBe(300);
    expect(boxes[8]).toBe(1100);
    expect(boxes[9]).toBe(1400);
  });

  it("initialise 5 familles, 6 grades, 30 cellules, 17 positions et coefficients par défaut", async () => {
    const services = buildServices();
    const campaign = await services.campaign.createCampaign({
      name: "Campagne test",
      referenceYear: 2026,
      notes: "",
    });
    const set = await services.compensationReference.getReferenceSet(
      campaign.id,
    );

    expect(set.jobFamilies).toHaveLength(5);
    expect(set.jobFamilies.map((item) => item.code)).toEqual([
      "F1",
      "F2",
      "F3",
      "F4",
      "F5",
    ]);
    expect(set.grades).toHaveLength(6);
    expect(set.grades.map((item) => item.code)).toEqual([
      "G1",
      "G2",
      "G3",
      "G4",
      "G5",
      "G6",
    ]);
    expect(set.salaryGrid).toHaveLength(30);
    expect(set.salaryGrid.every((cell) => cell.s0Amount === null)).toBe(true);
    expect(set.salaryPositions).toHaveLength(17);
    expect(
      set.salaryPositions.map((item) => item.positionFactorMilli),
    ).toEqual(DEFAULT_SALARY_POSITIONS.map((item) => item.positionFactorMilli));
    expect(set.performanceFactors.map((item) => item.factorMilli)).toEqual(
      DEFAULT_PERFORMANCE_FACTORS.map((item) => item.factorMilli),
    );
    expect(set.potentialFactors.map((item) => item.factorMilli)).toEqual(
      DEFAULT_POTENTIAL_FACTORS.map((item) => item.factorMilli),
    );
    expect(set.nineBoxFactors.map((item) => item.factorMilli)).toEqual(
      DEFAULT_NINE_BOX_FACTORS.map((item) => item.factorMilli),
    );
  });

  it("initialise automatiquement le référentiel à la création d’une campagne", async () => {
    const { user, services } = await renderApp();
    await user.click(screen.getByRole("button", { name: "Campagnes" }));
    await user.click(screen.getByRole("button", { name: "Nouvelle campagne" }));
    await user.type(
      screen.getByLabelText("Nom de la campagne"),
      "Nouvelle campagne référentiel",
    );
    await user.clear(screen.getByLabelText("Année de référence"));
    await user.type(screen.getByLabelText("Année de référence"), "2028");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await screen.findByText("Campagne créée.");

    const created = (await services.campaign.listCampaigns()).find(
      (item) => item.name === "Nouvelle campagne référentiel",
    );
    expect(created).toBeDefined();
    const set = await services.compensationReference.getReferenceSet(
      created!.id,
    );
    expect(set.jobFamilies).toHaveLength(5);
    expect(set.salaryGrid).toHaveLength(30);
  });
});

describe("référentiels — formatage des coefficients", () => {
  it("formate toujours avec trois décimales et une virgule française", () => {
    expect(formatFactorDisplay(1300)).toBe("1,300");
    expect(formatFactorDisplay(1000)).toBe("1,000");
    expect(formatFactorDisplay(950)).toBe("0,950");
    expect(formatFactorDisplay(250)).toBe("0,250");
    expect(formatFactorDisplay(100)).toBe("0,100");
  });

  it("parse les saisies 1,3 / 1,300 / 1.3 / 1.300 vers factor_milli", () => {
    expect(parseFactorDisplayInput("1,3")).toBe(1300);
    expect(parseFactorDisplayInput("1,300")).toBe(1300);
    expect(parseFactorDisplayInput("1.3")).toBe(1300);
    expect(parseFactorDisplayInput("1.300")).toBe(1300);
    expect(parseFactorDisplayInput("0,950")).toBe(950);
  });
});

describe("référentiels — validations", () => {
  it("normalise les codes en majuscules", async () => {
    const services = buildServices();
    const campaign = await services.campaign.createCampaign({
      name: "Campagne normalisation",
      referenceYear: 2026,
      notes: "",
    });
    const set = await services.compensationReference.getReferenceSet(
      campaign.id,
    );

    const updated = await services.compensationReference.updateStructure(
      campaign.id,
      set.jobFamilies.map((family, index) => ({
        id: family.id,
        code: index === 0 ? "  tech  " : family.code,
        label: index === 0 ? " Famille Technique " : family.label,
      })),
      set.grades.map((grade) => ({
        id: grade.id,
        code: grade.code,
        label: grade.label,
      })),
    );
    expect(updated.jobFamilies[0].code).toBe("TECH");
    expect(updated.jobFamilies[0].label).toBe("Famille Technique");
  });

  it("refuse les codes dupliqués", async () => {
    const services = buildServices();
    const campaign = await services.campaign.createCampaign({
      name: "Campagne doublons",
      referenceYear: 2026,
      notes: "",
    });
    const set = await services.compensationReference.getReferenceSet(
      campaign.id,
    );

    await expect(
      services.compensationReference.updateStructure(
        campaign.id,
        set.jobFamilies.map((family, index) => ({
          id: family.id,
          code: index <= 1 ? "DUP" : family.code,
          label: family.label,
        })),
        set.grades.map((grade) => ({
          id: grade.id,
          code: grade.code,
          label: grade.label,
        })),
      ),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("refuse un libellé vide", async () => {
    const services = buildServices();
    const campaign = await services.campaign.createCampaign({
      name: "Campagne libellé vide",
      referenceYear: 2026,
      notes: "",
    });
    const set = await services.compensationReference.getReferenceSet(
      campaign.id,
    );

    await expect(
      services.compensationReference.updateStructure(
        campaign.id,
        set.jobFamilies.map((family, index) => ({
          id: family.id,
          code: family.code,
          label: index === 0 ? "   " : family.label,
        })),
        set.grades.map((grade) => ({
          id: grade.id,
          code: grade.code,
          label: grade.label,
        })),
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining("libellé") });
  });

  it("refuse un montant S0 égal à zéro", async () => {
    const services = buildServices();
    const campaign = await services.campaign.createCampaign({
      name: "Campagne S0 zéro",
      referenceYear: 2026,
      notes: "",
    });
    const set = await services.compensationReference.getReferenceSet(
      campaign.id,
    );
    const first = set.salaryGrid[0];

    await expect(
      services.compensationReference.updateSalaryGrid(campaign.id, [
        {
          jobFamilyId: first.jobFamilyId,
          gradeId: first.gradeId,
          s0Amount: 0,
        },
      ]),
    ).rejects.toMatchObject({ message: expect.stringContaining("zéro") });
  });

  it("refuse un montant S0 négatif", async () => {
    const services = buildServices();
    const campaign = await services.campaign.createCampaign({
      name: "Campagne S0 négatif",
      referenceYear: 2026,
      notes: "",
    });
    const set = await services.compensationReference.getReferenceSet(
      campaign.id,
    );
    const first = set.salaryGrid[0];

    await expect(
      services.compensationReference.updateSalaryGrid(campaign.id, [
        {
          jobFamilyId: first.jobFamilyId,
          gradeId: first.gradeId,
          s0Amount: -100,
        },
      ]),
    ).rejects.toMatchObject({ message: expect.stringContaining("négatif") });
  });

  it("refuse un montant S0 décimal", async () => {
    const services = buildServices();
    const campaign = await services.campaign.createCampaign({
      name: "Campagne S0 décimal",
      referenceYear: 2026,
      notes: "",
    });
    const set = await services.compensationReference.getReferenceSet(
      campaign.id,
    );
    const first = set.salaryGrid[0];

    await expect(
      services.compensationReference.updateSalaryGrid(campaign.id, [
        {
          jobFamilyId: first.jobFamilyId,
          gradeId: first.gradeId,
          s0Amount: 100.5 as unknown as number,
        },
      ]),
    ).rejects.toMatchObject({ message: expect.stringContaining("entier") });
  });

  it("accepte une sauvegarde partielle de la grille et calcule X/30", async () => {
    const services = buildServices();
    const campaign = await services.campaign.createCampaign({
      name: "Campagne grille partielle",
      referenceYear: 2026,
      notes: "",
    });
    const set = await services.compensationReference.getReferenceSet(
      campaign.id,
    );
    const first = set.salaryGrid[0];
    const second = set.salaryGrid[1];

    const partial = await services.compensationReference.updateSalaryGrid(
      campaign.id,
      [
        {
          jobFamilyId: first.jobFamilyId,
          gradeId: first.gradeId,
          s0Amount: 250000,
        },
        {
          jobFamilyId: second.jobFamilyId,
          gradeId: second.gradeId,
          s0Amount: null,
        },
      ],
    );
    const completeness = computeReferenceCompleteness(partial);
    expect(completeness.salaryGridFilledCount).toBe(1);
    expect(completeness.salaryGridTotal).toBe(30);
  });
});

describe("référentiels — complétude et coefficients", () => {
  async function createFilledCampaign() {
    const services = buildServices();
    const campaign = await services.campaign.createCampaign({
      name: "Campagne complétude",
      referenceYear: 2026,
      notes: "",
    });
    let set = await services.compensationReference.getReferenceSet(campaign.id);
    set = await services.compensationReference.updateSalaryGrid(
      campaign.id,
      set.salaryGrid.map((cell) => ({
        jobFamilyId: cell.jobFamilyId,
        gradeId: cell.gradeId,
        s0Amount: 300000,
      })),
    );
    return { services, campaign, set };
  }

  it("calcule la complétude avec mode none", async () => {
    const { set } = await createFilledCampaign();
    expect(set.config.nineBoxMode).toBe("none");
    const completeness = computeReferenceCompleteness(set);
    expect(completeness.ready).toBe(true);
    expect(completeness.badge).toBe("Prêt");
    expect(completeness.performanceStatus).toBe("not_required");
    expect(completeness.potentialStatus).toBe("not_required");
    expect(completeness.nineBoxStatus).toBe("not_required");
  });

  it("calcule la complétude avec mode performance_only", async () => {
    const { services, campaign, set: initial } = await createFilledCampaign();
    const set = await services.compensationReference.updateNineBoxMode(
      campaign.id,
      "performance_only",
    );
    expect(initial.config.nineBoxMode).toBe("none");
    const completeness = computeReferenceCompleteness(set);
    expect(completeness.ready).toBe(true);
    expect(completeness.performanceStatus).toBe("complete");
    expect(completeness.nineBoxStatus).toBe("not_required");
  });

  it("calcule la complétude avec mode full_nine_box", async () => {
    const { services, campaign } = await createFilledCampaign();
    const set = await services.compensationReference.updateNineBoxMode(
      campaign.id,
      "full_nine_box",
    );
    const completeness = computeReferenceCompleteness(set);
    expect(completeness.ready).toBe(true);
    expect(completeness.nineBoxStatus).toBe("complete");
    expect(completeness.performanceStatus).toBe("not_required");
  });

  it("calcule la complétude avec mode performance_potential", async () => {
    const { services, campaign } = await createFilledCampaign();
    const set = await services.compensationReference.updateNineBoxMode(
      campaign.id,
      "performance_potential",
    );
    const completeness = computeReferenceCompleteness(set);
    expect(completeness.ready).toBe(true);
    expect(completeness.performanceStatus).toBe("complete");
    expect(completeness.potentialStatus).toBe("complete");
    expect(completeness.nineBoxStatus).toBe("not_required");
  });

  it("modifie un coefficient de position", async () => {
    const services = buildServices();
    const campaign = await services.campaign.createCampaign({
      name: "Campagne position",
      referenceYear: 2026,
      notes: "",
    });
    const set = await services.compensationReference.getReferenceSet(
      campaign.id,
    );
    const updated =
      await services.compensationReference.updateSalaryPositionFactors(
        campaign.id,
        [{ id: set.salaryPositions[0].id, positionFactorMilli: 1400 }],
      );
    expect(updated.salaryPositions[0].positionFactorMilli).toBe(1400);
  });

  it("modifie un coefficient Performance", async () => {
    const services = buildServices();
    const campaign = await services.campaign.createCampaign({
      name: "Campagne performance",
      referenceYear: 2026,
      notes: "",
    });
    const updated =
      await services.compensationReference.updatePerformanceFactors(
        campaign.id,
        [{ level: "low", factorMilli: 300 }],
      );
    expect(
      updated.performanceFactors.find((item) => item.level === "low")
        ?.factorMilli,
    ).toBe(300);
  });

  it("modifie un coefficient Potentiel", async () => {
    const services = buildServices();
    const campaign = await services.campaign.createCampaign({
      name: "Campagne potentiel",
      referenceYear: 2026,
      notes: "",
    });
    const updated =
      await services.compensationReference.updatePotentialFactors(campaign.id, [
        { level: "high", factorMilli: 1100 },
      ]);
    expect(
      updated.potentialFactors.find((item) => item.level === "high")
        ?.factorMilli,
    ).toBe(1100);
  });

  it("modifie un coefficient 9-Box", async () => {
    const services = buildServices();
    const campaign = await services.campaign.createCampaign({
      name: "Campagne 9-Box",
      referenceYear: 2026,
      notes: "",
    });
    const updated = await services.compensationReference.updateNineBoxFactors(
      campaign.id,
      [{ boxCode: 9, factorMilli: 1500 }],
    );
    expect(
      updated.nineBoxFactors.find((item) => item.boxCode === 9)?.factorMilli,
    ).toBe(1500);
  });

  it("change le mode 9-Box", async () => {
    const services = buildServices();
    const campaign = await services.campaign.createCampaign({
      name: "Campagne mode",
      referenceYear: 2026,
      notes: "",
    });
    const updated = await services.compensationReference.updateNineBoxMode(
      campaign.id,
      "full_nine_box",
    );
    expect(updated.config.nineBoxMode).toBe("full_nine_box");
  });

  it("refuse la modification d’une campagne archivée", async () => {
    const services = buildServices();
    const campaign = await services.campaign.createCampaign({
      name: "Campagne archivée",
      referenceYear: 2026,
      notes: "",
    });
    await services.campaign.archiveCampaign(campaign.id);
    const set = await services.compensationReference.getReferenceSet(
      campaign.id,
    );

    await expect(
      services.compensationReference.updateStructure(
        campaign.id,
        set.jobFamilies.map((family) => ({
          id: family.id,
          code: family.code,
          label: family.label,
        })),
        set.grades.map((grade) => ({
          id: grade.id,
          code: grade.code,
          label: grade.label,
        })),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining("lecture seule"),
    });
  });
});

describe("référentiels — interface", () => {
  it("affiche les coefficients de position avec trois décimales françaises", async () => {
    const services = createMemoryAppServices();
    const campaign = await services.campaign.createCampaign({
      name: "Campagne format coeffs",
      referenceYear: 2026,
      notes: "",
    });
    await services.campaign.activateCampaign(campaign.id);
    const { user } = await renderApp(services);
    await openReferences(user);
    await user.click(screen.getByRole("tab", { name: "Positions salariales" }));
    expect(await screen.findByLabelText("Coefficient Sout-")).toHaveValue(
      "1,300",
    );
    expect(screen.getByLabelText("Coefficient S0")).toHaveValue("0,900");
  });

  it("affiche l’état vide sans campagne", async () => {
    const { user } = await renderApp();
    await openReferences(user);
    expect(screen.getByText("Créez d’abord une campagne")).toBeInTheDocument();
  });

  it("sélectionne la campagne active par défaut", async () => {
    const services = createMemoryAppServices();
    await services.campaign.createCampaign({
      name: "Brouillon récent",
      referenceYear: 2026,
      notes: "",
    });
    const active = await services.campaign.createCampaign({
      name: "Campagne active référentiel",
      referenceYear: 2027,
      notes: "",
    });
    await services.campaign.activateCampaign(active.id);

    const { user } = await renderApp(services);
    await openReferences(user);
    await screen.findByTestId("references-campaign-select");
    expect(screen.getByTestId("references-campaign-select")).toHaveValue(
      String(active.id),
    );
  });

  it("affiche le statut de complétude sur le tableau de bord", async () => {
    const services = createMemoryAppServices();
    const campaign = await services.campaign.createCampaign({
      name: "Campagne dashboard",
      referenceYear: 2026,
      notes: "",
    });
    await services.campaign.activateCampaign(campaign.id);
    const { user } = await renderApp(services);

    await waitFor(() => {
      expect(screen.getByText("Référentiel")).toBeInTheDocument();
    });
    expect(screen.getAllByText("À compléter").length).toBeGreaterThan(0);

    await openReferences(user);
    await screen.findByTestId("references-completeness-badge");
    expect(screen.getByTestId("references-completeness-badge")).toHaveTextContent(
      "À compléter",
    );
  });

  it("permet de modifier un libellé et affiche la lecture seule archivée", async () => {
    const services = createMemoryAppServices();
    const campaign = await services.campaign.createCampaign({
      name: "Campagne UI",
      referenceYear: 2026,
      notes: "",
    });
    await services.campaign.activateCampaign(campaign.id);
    const { user } = await renderApp(services);

    await openReferences(user);
    const familyLabel = await screen.findByLabelText("Libellé famille 1");
    await user.clear(familyLabel);
    await user.type(familyLabel, "Famille Technique");
    const structureCard = screen.getByRole("heading", { name: "Structure" })
      .closest("section");
    expect(structureCard).not.toBeNull();
    await user.click(
      within(structureCard as HTMLElement).getByRole("button", {
        name: "Enregistrer",
      }),
    );
    expect(await screen.findByText("Structure enregistrée.")).toBeInTheDocument();

    const nav = screen.getByRole("navigation", { name: "Navigation principale" });
    await user.click(within(nav).getByRole("button", { name: "Campagnes" }));
    window.confirm = () => true;
    const row = screen.getByRole("cell", { name: "Campagne UI" }).closest("tr");
    expect(row).not.toBeNull();
    await user.click(
      within(row as HTMLElement).getByRole("button", { name: "Archiver" }),
    );
    await screen.findByText("Campagne archivée.");

    await openReferences(user);
    await screen.findByText(/lecture seule/i);
    expect(screen.getByLabelText("Libellé famille 1")).toBeDisabled();
  });
});
