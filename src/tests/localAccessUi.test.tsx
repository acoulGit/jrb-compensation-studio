/** Tests frontend accès local (restauration SEC1-A/HF1 + conservation SEC1-B). */

import { render, screen, waitFor } from "@testing-library/react";
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
import { AppDataProvider } from "../app/AppDataProvider";
import { SettingsPage } from "../pages/SettingsPage";
import { createMemoryAppServices } from "../services/createAppServices";
import accessAppSource from "../access/AccessApp.tsx?raw";

function renderSettingsPage() {
  return render(
    <AppDataProvider services={createMemoryAppServices()}>
      <SettingsPage />
    </AppDataProvider>,
  );
}

const invokeMock = vi.mocked(invoke);
const databaseLoadMock = vi.mocked(Database.load);

function baseStatus(
  overrides: Partial<LocalAccessStatusDto> = {},
): LocalAccessStatusDto {
  return {
    isSetUp: true,
    isUnlocked: false,
    isExpired: false,
    clockAnomalyDetected: false,
    installationId: "JRB-CS-aaaaaaaa-bbbbbbbb",
    initialValidUntil: "2027-05-01T00:00:00Z",
    currentValidUntil: "2027-05-01T00:00:00Z",
    remainingDays: 120,
    canActivateLicense: false,
    lastLicenseId: null,
    lastLicenseActivatedAt: null,
    ...overrides,
  };
}

const NOT_SET_UP_STATUS = baseStatus({
  isSetUp: false,
  installationId: null,
  initialValidUntil: null,
  currentValidUntil: null,
  remainingDays: null,
});

const LOCKED_STATUS = baseStatus();

const EXPIRED_STATUS = baseStatus({
  isExpired: true,
  remainingDays: 0,
  canActivateLicense: true,
});

const CLOCK_ANOMALY_STATUS = baseStatus({
  clockAnomalyDetected: true,
  canActivateLicense: true,
});

const UNLOCKED_STATUS = baseStatus({
  isUnlocked: true,
  canActivateLicense: true,
  remainingDays: 90,
});

beforeEach(() => {
  invokeMock.mockReset();
  databaseLoadMock.mockReset();
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("AccessApp — isolation SEC1-A", () => {
  it("1. AccessApp ne charge jamais AppDataProvider", () => {
    expect(accessAppSource).not.toMatch(
      /import\s+.*AppDataProvider|from\s+["'].*AppDataProvider["']/,
    );
    expect(accessAppSource).not.toMatch(
      /import\s+.*getDatabase|from\s+["'].*getDatabase["']/,
    );
  });

  it("2. AccessApp ne contient aucun appel Database.load", async () => {
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
});

describe("AccessApp — mot de passe SEC1-A", () => {
  it("3. premier lancement affiche le formulaire de création du mot de passe", async () => {
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
    expect(screen.getByLabelText("Mot de passe")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirmer le mot de passe")).toBeInTheDocument();
  });

  it("4. confirmation du mot de passe obligatoire", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_local_access_status") {
        return Promise.resolve(NOT_SET_UP_STATUS);
      }
      return Promise.reject(new Error(`Commande inattendue : ${command}`));
    });
    render(<AccessApp />);
    const confirmation = await screen.findByLabelText("Confirmer le mot de passe");
    expect(confirmation).toBeRequired();
  });

  it("5. échec du setup vide les champs de mot de passe", async () => {
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

  it("6. installation initialisée et valide affiche l’écran nominal de déverrouillage", async () => {
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
    expect(screen.getByLabelText("Mot de passe")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Déverrouiller" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Code de licence")).not.toBeInTheDocument();
  });

  it("7. mauvais mot de passe affiche une erreur française générique", async () => {
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
    await user.type(await screen.findByLabelText("Mot de passe"), "mauvais");
    await user.click(screen.getByRole("button", { name: "Déverrouiller" }));
    expect(await screen.findByText("Mot de passe incorrect.")).toBeInTheDocument();
    expect(screen.queryByText(/argon2/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/hash/i)).not.toBeInTheDocument();
  });

  it("8. échec du déverrouillage vide le champ du mot de passe", async () => {
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
    await screen.findByText("Mot de passe incorrect.");
    expect(passwordField).toHaveValue("");
  });
});

describe("AccessApp — expiration et horloge SEC1-A + licence SEC1-B", () => {
  it("9. expiration affiche l’écran bloqué et aucune UI métier", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_local_access_status") {
        return Promise.resolve(EXPIRED_STATUS);
      }
      return Promise.reject(new Error(`Commande inattendue : ${command}`));
    });
    render(<AccessApp />);
    expect(
      await screen.findByRole("heading", { name: "Droit d’utilisation expiré" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/AppShell/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByText(/Campagnes/i)).not.toBeInTheDocument();
  });

  it("10. anomalie d’horloge affiche l’écran bloqué et aucune UI métier", async () => {
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
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByText(/Simulation/i)).not.toBeInTheDocument();
  });

  it("11. aucun mot de passe n’est stocké dans localStorage", async () => {
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
    await user.type(await screen.findByLabelText("Mot de passe"), "secret-local-123");
    await user.click(screen.getByRole("button", { name: "Déverrouiller" }));
    await screen.findByText("Mot de passe incorrect.");
    expect(localStorage.length).toBe(0);
  });

  it("12. aucun mot de passe n’est stocké dans sessionStorage", async () => {
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
    await user.type(await screen.findByLabelText("Mot de passe"), "secret-session-456");
    await user.click(screen.getByRole("button", { name: "Déverrouiller" }));
    await screen.findByText("Mot de passe incorrect.");
    expect(sessionStorage.length).toBe(0);
  });

  it("13. aucun code technique anglais n’est visible pour l’utilisateur", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_local_access_status") {
        return Promise.resolve(EXPIRED_STATUS);
      }
      return Promise.reject(new Error(`Commande inattendue : ${command}`));
    });
    render(<AccessApp />);
    await screen.findByRole("heading", { name: "Droit d’utilisation expiré" });
    expect(screen.queryByText(/INVALID_/)).not.toBeInTheDocument();
    expect(screen.queryByText(/SessionLocked/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ed25519/i)).not.toBeInTheDocument();
  });

  it("14. formulaire de licence visible après expiration", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_local_access_status") {
        return Promise.resolve(EXPIRED_STATUS);
      }
      return Promise.reject(new Error(`Commande inattendue : ${command}`));
    });
    render(<AccessApp />);
    await screen.findByRole("heading", { name: "Droit d’utilisation expiré" });
    expect(screen.getByLabelText("Code de licence")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Activer la licence" })).toBeInTheDocument();
  });

  it("15. formulaire de licence visible en cas d’anomalie d’horloge", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_local_access_status") {
        return Promise.resolve(CLOCK_ANOMALY_STATUS);
      }
      return Promise.reject(new Error(`Commande inattendue : ${command}`));
    });
    render(<AccessApp />);
    await screen.findByRole("heading", { name: "Horloge système suspecte" });
    expect(screen.getByLabelText("Code de licence")).toBeInTheDocument();
  });

  it("16. activation réussie affiche le message français et revient à la saisie du mot de passe", async () => {
    const user = userEvent.setup();
    let statusCalls = 0;
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_local_access_status") {
        statusCalls += 1;
        if (statusCalls === 1) {
          return Promise.resolve(EXPIRED_STATUS);
        }
        return Promise.resolve(LOCKED_STATUS);
      }
      if (command === "activate_offline_license") {
        return Promise.resolve({
          licenseId: "LIC-20260723-AABBCCDD",
          durationMonths: 12,
          previousValidUntil: "2027-01-01T00:00:00Z",
          newValidUntil: "2028-02-15T00:00:00Z",
          customer: null,
          activatedAt: "2026-07-23T12:00:00Z",
        });
      }
      return Promise.reject(new Error(`Commande inattendue : ${command}`));
    });
    render(<AccessApp />);
    await screen.findByRole("heading", { name: "Droit d’utilisation expiré" });
    await user.type(screen.getByLabelText("Code de licence"), "JRB1.payload.signature");
    await user.click(screen.getByRole("button", { name: "Activer la licence" }));
    await waitFor(() => {
      expect(
        screen.getByText(/Licence activée\. Le droit d’utilisation est prolongé jusqu’au/),
      ).toBeInTheDocument();
    });
    expect(
      await screen.findByRole("heading", { name: "JRB Compensation Studio" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Mot de passe")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Déverrouiller" })).toBeInTheDocument();
  });

  it("17. l’activation depuis access ne rend pas la session automatiquement déverrouillée", async () => {
    const user = userEvent.setup();
    let statusCalls = 0;
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_local_access_status") {
        statusCalls += 1;
        if (statusCalls === 1) {
          return Promise.resolve(EXPIRED_STATUS);
        }
        return Promise.resolve({ ...LOCKED_STATUS, isUnlocked: false });
      }
      if (command === "activate_offline_license") {
        return Promise.resolve({
          licenseId: "LIC-20260723-AABBCCDD",
          durationMonths: 12,
          previousValidUntil: "2027-01-01T00:00:00Z",
          newValidUntil: "2028-02-15T00:00:00Z",
          customer: null,
          activatedAt: "2026-07-23T12:00:00Z",
        });
      }
      return Promise.reject(new Error(`Commande inattendue : ${command}`));
    });
    render(<AccessApp />);
    await screen.findByRole("heading", { name: "Droit d’utilisation expiré" });
    await user.type(screen.getByLabelText("Code de licence"), "JRB1.x.y");
    await user.click(screen.getByRole("button", { name: "Activer la licence" }));
    await screen.findByRole("heading", { name: "JRB Compensation Studio" });
    expect(screen.getByRole("button", { name: "Déverrouiller" })).toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalledWith("unlock_local_access", expect.anything());
    expect(databaseLoadMock).not.toHaveBeenCalled();
  });

  it("18. erreur de licence affichée sans détail cryptographique", async () => {
    const user = userEvent.setup();
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_local_access_status") {
        return Promise.resolve(EXPIRED_STATUS);
      }
      if (command === "activate_offline_license") {
        return Promise.reject("La signature du code de licence est invalide.");
      }
      return Promise.reject(new Error(`Commande inattendue : ${command}`));
    });
    render(<AccessApp />);
    await screen.findByRole("heading", { name: "Droit d’utilisation expiré" });
    await user.type(screen.getByLabelText("Code de licence"), "mauvais-code");
    await user.click(screen.getByRole("button", { name: "Activer la licence" }));
    expect(
      await screen.findByText("La signature du code de licence est invalide."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/ed25519/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/signature bytes/i)).not.toBeInTheDocument();
  });
});

describe("SettingsPage — renouvellement SEC1-B", () => {
  it("19. formulaire de renouvellement présent dans SettingsPage", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_local_access_status") {
        return Promise.resolve(UNLOCKED_STATUS);
      }
      return Promise.reject(new Error(`Commande inattendue : ${command}`));
    });
    renderSettingsPage();
    expect(
      await screen.findByRole("heading", { name: "Licence d’utilisation" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Code de licence")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Renouveler la licence" })).toBeInTheDocument();
  });

  it("20. renouvellement réussi maintient la session main ouverte", async () => {
    const user = userEvent.setup();
    let unlockedCalls = 0;
    invokeMock.mockImplementation((command: string) => {
      if (command === "get_local_access_status") {
        unlockedCalls += 1;
        return Promise.resolve({
          ...UNLOCKED_STATUS,
          remainingDays: unlockedCalls === 1 ? 90 : 455,
          currentValidUntil:
            unlockedCalls === 1 ? "2027-05-01T00:00:00Z" : "2028-05-01T00:00:00Z",
          lastLicenseId: unlockedCalls === 1 ? null : "LIC-20260723-AABBCCDD",
        });
      }
      if (command === "activate_offline_license") {
        return Promise.resolve({
          licenseId: "LIC-20260723-AABBCCDD",
          durationMonths: 12,
          previousValidUntil: "2027-05-01T00:00:00Z",
          newValidUntil: "2028-05-01T00:00:00Z",
          customer: "Client A",
          activatedAt: "2026-07-23T12:00:00Z",
        });
      }
      return Promise.reject(new Error(`Commande inattendue : ${command}`));
    });
    renderSettingsPage();
    expect(
      await screen.findByRole("heading", { name: "Licence d’utilisation" }),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Code de licence"), "JRB1.payload.signature");
    await user.click(screen.getByRole("button", { name: "Renouveler la licence" }));
    expect(
      await screen.findByText(/Licence renouvelée\. Le droit d’utilisation est prolongé/),
    ).toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalledWith("lock_local_access");
    expect(
      screen.getByRole("heading", { name: "Licence d’utilisation" }),
    ).toBeInTheDocument();
  });
});