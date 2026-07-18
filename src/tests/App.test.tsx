import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../App";
import { branding } from "../config/branding";

describe("socle applicatif", () => {
  it("affiche le shell et ses composants principaux", () => {
    render(<App />);

    expect(
      screen.getByRole("navigation", { name: "Navigation principale" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tableau de bord" })).toBeInTheDocument();
    expect(screen.getByLabelText("Campagne active")).toBeInTheDocument();
    expect(screen.getByText("Budget annoncé")).toBeInTheDocument();
    expect(screen.getByText("Population importée")).toBeInTheDocument();
  });

  it("navigue vers chacune des pages", async () => {
    const user = userEvent.setup();
    render(<App />);

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
      expect(screen.getByRole("heading", { name: page, level: 1 })).toBeInTheDocument();
    }
  });

  it("affiche l’organisation dans l’en-tête et la page À propos", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText(branding.organizationName)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "À propos" }));
    expect(screen.getAllByText(branding.organizationName)).toHaveLength(2);
  });

  it("affiche les garanties de confidentialité", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "À propos" }));
    expect(
      screen.getByText("Application locale et confidentielle"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Aucune donnée transmise sur Internet"),
    ).toBeInTheDocument();
  });

  it("réduit et déploie la barre latérale", async () => {
    const user = userEvent.setup();
    render(<App />);
    const toggle = screen.getByRole("button", {
      name: "Réduire la barre latérale",
    });

    await user.click(toggle);
    expect(
      screen.getByRole("button", { name: "Déployer la barre latérale" }),
    ).toHaveAttribute("aria-expanded", "false");
  });
});
