import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CampaignService } from "../services/campaignService";
import { AppError } from "../services/errors";
import { MemoryCampaignRepository } from "../infrastructure/database/repositories/memoryCampaignRepository";
import { createMemoryAppServices } from "../services/createAppServices";
import { branding } from "../config/branding";
import App from "../App";

async function renderApp(
  services = createMemoryAppServices(),
  initializeErrorFactory?: () => Error | null,
) {
  const user = userEvent.setup();
  render(
    <App
      services={services}
      initializeErrorFactory={initializeErrorFactory}
    />,
  );
  if (!initializeErrorFactory) {
    await screen.findByRole("navigation", { name: "Navigation principale" });
  }
  return { user, services };
}

describe("socle applicatif", () => {
  it("affiche le shell et ses composants principaux", async () => {
    await renderApp();

    expect(
      screen.getByRole("navigation", { name: "Navigation principale" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Tableau de bord" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Campagne active")).toBeInTheDocument();
    expect(screen.getByText("Budget annoncé")).toBeInTheDocument();
    expect(screen.getByText("Population importée")).toBeInTheDocument();
  });

  it("navigue vers chacune des pages", async () => {
    const { user } = await renderApp();

    for (const page of [
      "Campagnes",
      "Référentiels",
      "Import RH",
      "Simulations",
      "Revue individuelle",
      "Rapports",
      "Paramètres",
      "À propos",
    ]) {
      await user.click(screen.getByRole("button", { name: page }));
      const headingName =
        page === "Référentiels"
          ? "Référentiels de rémunération"
          : page === "Import RH"
            ? "Import RH"
            : page;
      expect(
        screen.getByRole("heading", { name: headingName, level: 1 }),
      ).toBeInTheDocument();
    }
  });

  it("affiche l’organisation dans l’en-tête et la page À propos", async () => {
    const { user } = await renderApp();

    expect(screen.getByTestId("header-organization")).toHaveTextContent(
      branding.organizationShortName,
    );
    await user.click(screen.getByRole("button", { name: "À propos" }));
    expect(screen.getByTestId("about-organization")).toHaveTextContent(
      branding.organizationName,
    );
  });

  it("affiche les garanties de confidentialité", async () => {
    const { user } = await renderApp();

    await user.click(screen.getByRole("button", { name: "À propos" }));
    expect(
      screen.getByText("Application locale et confidentielle"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Aucune donnée transmise sur Internet"),
    ).toBeInTheDocument();
  });

  it("réduit et déploie la barre latérale", async () => {
    const { user } = await renderApp();
    const toggle = screen.getByRole("button", {
      name: "Réduire la barre latérale",
    });

    await user.click(toggle);
    expect(
      screen.getByRole("button", { name: "Déployer la barre latérale" }),
    ).toHaveAttribute("aria-expanded", "false");
  });
});

describe("organisation persistée", () => {
  it("charge les valeurs initiales de l’organisation", async () => {
    await renderApp();
    expect(screen.getByTestId("header-organization")).toHaveTextContent(
      "Organisation",
    );
  });

  it("modifie l’organisation et actualise l’en-tête", async () => {
    const { user } = await renderApp();

    await user.click(screen.getByRole("button", { name: "Paramètres" }));
    await user.clear(screen.getByLabelText("Nom complet de l’organisation"));
    await user.type(
      screen.getByLabelText("Nom complet de l’organisation"),
      "Organisation Démonstration",
    );
    await user.clear(screen.getByLabelText("Nom court"));
    await user.type(screen.getByLabelText("Nom court"), "Org Démo");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(
      await screen.findByText("Identité de l’organisation enregistrée."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("header-organization")).toHaveTextContent(
      "Org Démo",
    );

    await user.click(screen.getByRole("button", { name: "À propos" }));
    expect(screen.getByTestId("about-organization")).toHaveTextContent(
      "Organisation Démonstration",
    );
  });
});

describe("campagnes", () => {
  it("affiche l’état vide puis crée une campagne", async () => {
    const { user } = await renderApp();

    await user.click(screen.getByRole("button", { name: "Campagnes" }));
    expect(screen.getByText("Aucune campagne")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Nouvelle campagne" }));
    await user.type(
      screen.getByLabelText("Nom de la campagne"),
      "Revue salariale 2026",
    );
    await user.clear(screen.getByLabelText("Année de référence"));
    await user.type(screen.getByLabelText("Année de référence"), "2026");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    expect(await screen.findByText("Campagne créée.")).toBeInTheDocument();
    expect(screen.getByText("Revue salariale 2026")).toBeInTheDocument();
  });

  it("refuse un nom vide et une année invalide via le service", async () => {
    const service = new CampaignService(new MemoryCampaignRepository());

    await expect(
      service.createCampaign({ name: "   ", referenceYear: 2026, notes: "" }),
    ).rejects.toBeInstanceOf(AppError);

    await expect(
      service.createCampaign({ name: "Test", referenceYear: 1999, notes: "" }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("2000"),
    });
  });

  it("active une campagne, remplace l’active et met à jour le shell", async () => {
    const { user } = await renderApp();

    await user.click(screen.getByRole("button", { name: "Campagnes" }));
    await user.click(screen.getByRole("button", { name: "Nouvelle campagne" }));
    await user.type(
      screen.getByLabelText("Nom de la campagne"),
      "Revue salariale 2026",
    );
    await user.clear(screen.getByLabelText("Année de référence"));
    await user.type(screen.getByLabelText("Année de référence"), "2026");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await screen.findByText("Campagne créée.");

    await user.click(screen.getByRole("button", { name: "Nouvelle campagne" }));
    await user.type(
      screen.getByLabelText("Nom de la campagne"),
      "Simulation 2027",
    );
    await user.clear(screen.getByLabelText("Année de référence"));
    await user.type(screen.getByLabelText("Année de référence"), "2027");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await screen.findByText("Campagne créée.");

    const firstRow = screen.getByText("Revue salariale 2026").closest("tr");
    expect(firstRow).not.toBeNull();
    await user.click(
      within(firstRow as HTMLElement).getByRole("button", { name: "Activer" }),
    );
    await screen.findByText("Campagne activée.");
    expect(screen.getByTestId("active-campaign-name")).toHaveTextContent(
      "Revue salariale 2026",
    );

    const secondRow = screen.getByText("Simulation 2027").closest("tr");
    expect(secondRow).not.toBeNull();
    await user.click(
      within(secondRow as HTMLElement).getByRole("button", { name: "Activer" }),
    );
    await screen.findByText("Campagne activée.");
    expect(screen.getByTestId("active-campaign-name")).toHaveTextContent(
      "Simulation 2027",
    );

    expect(screen.getByTestId("active-campaign-year")).toHaveTextContent(
      "2027",
    );
  });

  it("refuse la modification et l’activation d’une campagne archivée, puis restaure", async () => {
    const service = new CampaignService(new MemoryCampaignRepository());
    const created = await service.createCampaign({
      name: "Revue salariale 2026",
      referenceYear: 2026,
      notes: "",
    });
    await service.archiveCampaign(created.id);

    await expect(
      service.updateCampaign(created.id, {
        name: "Nouveau nom",
        referenceYear: 2026,
        notes: "",
      }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("archivée"),
    });

    await expect(service.activateCampaign(created.id)).rejects.toMatchObject({
      message: expect.stringContaining("restaurée"),
    });

    const restored = await service.restoreCampaign(created.id);
    expect(restored.status).toBe("draft");
    expect(restored.archivedAt).toBeNull();
  });

  it("archive et restaure depuis l’interface", async () => {
    const { user } = await renderApp();

    await user.click(screen.getByRole("button", { name: "Campagnes" }));
    await user.click(screen.getByRole("button", { name: "Nouvelle campagne" }));
    await user.type(
      screen.getByLabelText("Nom de la campagne"),
      "Revue salariale 2026",
    );
    await user.clear(screen.getByLabelText("Année de référence"));
    await user.type(screen.getByLabelText("Année de référence"), "2026");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await screen.findByText("Campagne créée.");

    window.confirm = () => true;
    const row = screen.getByText("Revue salariale 2026").closest("tr");
    expect(row).not.toBeNull();
    await user.click(
      within(row as HTMLElement).getByRole("button", { name: "Archiver" }),
    );
    await screen.findByText("Campagne archivée.");

    expect(screen.getByTestId("active-campaign-name")).toHaveTextContent(
      "Aucune campagne active",
    );

    await user.click(screen.getByRole("button", { name: "Archives" }));
    const archivedRow = screen.getByText("Revue salariale 2026").closest("tr");
    expect(archivedRow).not.toBeNull();
    expect(
      within(archivedRow as HTMLElement).queryByRole("button", {
        name: "Modifier",
      }),
    ).toBeNull();
    expect(
      within(archivedRow as HTMLElement).queryByRole("button", {
        name: "Activer",
      }),
    ).toBeNull();

    await user.click(
      within(archivedRow as HTMLElement).getByRole("button", {
        name: "Restaurer",
      }),
    );
    await screen.findByText("Campagne restaurée.");
    await user.click(
      screen.getByRole("button", { name: "Campagnes en cours" }),
    );
    expect(screen.getByText("Revue salariale 2026")).toBeInTheDocument();
  });
});

describe("initialisation", () => {
  it("affiche une erreur d’initialisation et permet de réessayer", async () => {
    const services = createMemoryAppServices();
    const user = userEvent.setup();
    let shouldFail = true;
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    render(
      <App
        services={services}
        initializeErrorFactory={() =>
          shouldFail ? new Error("db unavailable") : null
        }
      />,
    );

    expect(
      await screen.findByRole("heading", { name: "Base locale indisponible" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/base locale n’a pas pu être ouverte/i),
    ).toBeInTheDocument();

    shouldFail = false;
    await user.click(screen.getByRole("button", { name: "Réessayer" }));

    await waitFor(() => {
      expect(
        screen.getByRole("navigation", { name: "Navigation principale" }),
      ).toBeInTheDocument();
    });
    consoleError.mockRestore();
  });
});
