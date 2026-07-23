/** Tests frontend de l’écran d’accès local (Lot 2B-RC1-SEC1-A). */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalAccessStatusDto } from "../application/localAccess";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({ close: vi.fn(), label: "access" }),
}));
vi.mock("@tauri-apps/plugin-sql", () => ({
  default: { load: vi.fn() },
}));

import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import { AccessApp } from "../access/AccessApp";

const invokeMock = vi.mocked(invoke);
const databaseLoadMock = vi.mocked(Database.load);

const NOT_SET_UP_STATUS: LocalAccessStatusDto = {
  isSetUp: false,
  isUnlocked: false,
  isExpired: false,
  clockAnomalyDetected: false,
  installationId: null,
  initialValidUntil: null,
  currentValidUntil: null,
  remainingDays: null,
};

const LOCKED_STATUS: LocalAccessStatusDto = {
  isSetUp: true,
  isUnlocked: false,
  isExpired: false,
  clockAnomalyDetected: false,
  installationId: "JRB-CS-aaaaaaaa-bbbbbbbb",
  initialValidUntil: "2027-05-01T00:00:00Z",
  currentValidUntil: "2027-05-01T00:00:00Z",
  remainingDays: 120,
};

const EXPIRED_STATUS: LocalAccessStatusDto = {
  ...LOCKED_STATUS,
  isExpired: true,
  remainingDays: 0,
};

const CLOCK_ANOMALY_STATUS: LocalAccessStatusDto = {
  ...LOCKED_STATUS,
  clockAnomalyDetected: true,
};

beforeEach(() => {
  invokeMock.mockReset();
  databaseLoadMock.mockReset();
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("AccessApp — ne charge jamais la base métier", () => {
  it("ne déclenche aucun chargement de base de données SQLite", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_local_access_status") {
        return Promise.resolve(LOCKED_STATUS);
      }
      return Promise.reject(new Error(`Commande inattendue : ${command}`));
    });

    render(<AccessApp />);
    await screen.findByRole("heading", { name: "JRB Compensation Studio" });

    expect(databaseLoadMock).not.toHaveBeenCalled();
  });

  it("n’écrit aucun secret dans localStorage ni sessionStorage", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_local_access_status") {
        return Promise.resolve(LOCKED_STATUS);
      }
      if (command === "unlock_local_access") {
        return Promise.reject("Mot de passe incorrect.");
      }
      return Promise.reject(new Error(`Commande inattendue : ${command}`));
    });

    const user = userEvent.setup();
    render(<AccessApp />);
    const passwordField = await screen.findByLabelText("Mot de passe");
    await user.type(passwordField, "secret-local-123");
    await user.click(screen.getByRole("button", { name: "Déverrouiller" }));
    await screen.findByText("Mot de passe incorrect.");

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key) {
        expect(localStorage.getItem(key)).not.toContain("secret-local-123");
      }
    }
  });
});

describe("AccessApp — sélection de l’écran", () => {
  it("affiche l’écran de configuration quand l’accès n’est pas encore configuré", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_local_access_status") {
        return Promise.resolve(NOT_SET_UP_STATUS);
      }
      return Promise.reject(new Error(`Commande inattendue : ${command}`));
    });

    render(<AccessApp />);
    expect(
      await screen.findByRole("heading", {
        name: "Bienvenue dans JRB Compensation Studio",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Créez le mot de passe local qui protégera l’accès à cette installation.",
      ),
    ).toBeInTheDocument();
  });

  it("affiche l’écran de déverrouillage quand l’accès est configuré et verrouillé", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_local_access_status") {
        return Promise.resolve(LOCKED_STATUS);
      }
      return Promise.reject(new Error(`Commande inattendue : ${command}`));
    });

    render(<AccessApp />);
    expect(
      await screen.findByRole("heading", { name: "JRB Compensation Studio" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/JRB-CS-aaaaaaaa-bbbbbbbb/)).toBeInTheDocument();
    expect(screen.getByText(/120 jours restants/)).toBeInTheDocument();
  });

  it("affiche l’écran d’expiration quand la période initiale est terminée", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_local_access_status") {
        return Promise.resolve(EXPIRED_STATUS);
      }
      return Promise.reject(new Error(`Commande inattendue : ${command}`));
    });

    render(<AccessApp />);
    expect(
      await screen.findByRole("heading", { name: "Licence requise" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Le droit d’utilisation a expiré. Une licence est nécessaire."),
    ).toBeInTheDocument();
    expect(screen.getByText(/JRB-CS-aaaaaaaa-bbbbbbbb/)).toBeInTheDocument();
  });

  it("affiche l’écran d’anomalie d’horloge en priorité sur les autres états", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_local_access_status") {
        return Promise.resolve(CLOCK_ANOMALY_STATUS);
      }
      return Promise.reject(new Error(`Commande inattendue : ${command}`));
    });

    render(<AccessApp />);
    expect(
      await screen.findByRole("heading", { name: "Horloge système suspecte" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "La date système semble avoir été modifiée. Vérifiez l’horloge ou contactez JRB XSolutions.",
      ),
    ).toBeInTheDocument();
  });
});

describe("AccessApp — saisie du mot de passe", () => {
  it("efface le mot de passe après une tentative de déverrouillage refusée", async () => {
    const user = userEvent.setup();
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_local_access_status") {
        return Promise.resolve(LOCKED_STATUS);
      }
      if (command === "unlock_local_access") {
        return Promise.reject("Mot de passe incorrect.");
      }
      return Promise.reject(new Error(`Commande inattendue : ${command}`));
    });

    render(<AccessApp />);
    const passwordField = await screen.findByLabelText("Mot de passe");
    await user.type(passwordField, "mauvais-mot-de-passe");
    await user.click(screen.getByRole("button", { name: "Déverrouiller" }));

    expect(await screen.findByText("Mot de passe incorrect.")).toBeInTheDocument();
    expect(passwordField).toHaveValue("");
  });

  it("efface les champs après une configuration initiale refusée", async () => {
    const user = userEvent.setup();
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_local_access_status") {
        return Promise.resolve(NOT_SET_UP_STATUS);
      }
      if (command === "setup_local_access") {
        return Promise.reject("Les mots de passe ne correspondent pas.");
      }
      return Promise.reject(new Error(`Commande inattendue : ${command}`));
    });

    render(<AccessApp />);
    const passwordField = await screen.findByLabelText("Mot de passe");
    const confirmationField = screen.getByLabelText("Confirmer le mot de passe");
    await user.type(passwordField, "motdepasse1");
    await user.type(confirmationField, "motdepasse2");
    await user.click(screen.getByRole("button", { name: "Initialiser l’application" }));

    expect(
      await screen.findByText("Les mots de passe ne correspondent pas."),
    ).toBeInTheDocument();
    expect(passwordField).toHaveValue("");
    expect(confirmationField).toHaveValue("");
  });
});
