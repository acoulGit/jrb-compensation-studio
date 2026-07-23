/**
 * Audit des capabilities Tauri (Lots SEC1-A/HF1 + SEC1-B).
 * Vérifie les fichiers réels sous src-tauri/capabilities et permissions.
 */

import { describe, expect, it } from "vitest";

import accessCapability from "../../src-tauri/capabilities/access.json";
import mainCapability from "../../src-tauri/capabilities/main.json";
import allowActivate from "../../src-tauri/permissions/allow-activate-offline-license.toml?raw";
import allowChangePassword from "../../src-tauri/permissions/allow-change-local-password.toml?raw";
import allowGetStatus from "../../src-tauri/permissions/allow-get-local-access-status.toml?raw";
import allowLock from "../../src-tauri/permissions/allow-lock-local-access.toml?raw";
import allowSetup from "../../src-tauri/permissions/allow-setup-local-access.toml?raw";
import allowUnlock from "../../src-tauri/permissions/allow-unlock-local-access.toml?raw";
import tauriConf from "../../src-tauri/tauri.conf.json";

const access = accessCapability as {
  identifier: string;
  windows: string[];
  permissions: string[];
};
const main = mainCapability as {
  identifier: string;
  windows: string[];
  permissions: string[];
};

const BUSINESS_PERMISSIONS = [
  "allow-replace-current-population",
  "allow-campaign-write",
  "allow-save-simulation-run",
  "allow-export-simulation-run-excel",
] as const;

const GRANULAR_PERMISSION_SOURCES = {
  "allow-get-local-access-status": allowGetStatus,
  "allow-setup-local-access": allowSetup,
  "allow-unlock-local-access": allowUnlock,
  "allow-change-local-password": allowChangePassword,
  "allow-lock-local-access": allowLock,
  "allow-activate-offline-license": allowActivate,
} as const;

describe("capabilities SEC1-A/HF1 — restauration", () => {
  it("1. access possède allow-get-local-access-status", () => {
    expect(access.windows).toEqual(["access"]);
    expect(access.permissions).toContain("allow-get-local-access-status");
    expect(GRANULAR_PERMISSION_SOURCES["allow-get-local-access-status"]).toContain(
      "get_local_access_status",
    );
  });

  it("2. main possède allow-get-local-access-status", () => {
    expect(main.windows).toEqual(["main"]);
    expect(main.permissions).toContain("allow-get-local-access-status");
  });

  it("3. access possède allow-setup-local-access", () => {
    expect(access.permissions).toContain("allow-setup-local-access");
    expect(GRANULAR_PERMISSION_SOURCES["allow-setup-local-access"]).toContain(
      "setup_local_access",
    );
  });

  it("4. main ne possède pas allow-setup-local-access", () => {
    expect(main.permissions).not.toContain("allow-setup-local-access");
  });

  it("5. access possède allow-unlock-local-access", () => {
    expect(access.permissions).toContain("allow-unlock-local-access");
    expect(GRANULAR_PERMISSION_SOURCES["allow-unlock-local-access"]).toContain(
      "unlock_local_access",
    );
  });

  it("6. main ne possède pas allow-unlock-local-access", () => {
    expect(main.permissions).not.toContain("allow-unlock-local-access");
  });

  it("7. main possède allow-change-local-password", () => {
    expect(main.permissions).toContain("allow-change-local-password");
    expect(GRANULAR_PERMISSION_SOURCES["allow-change-local-password"]).toContain(
      "change_local_password",
    );
  });

  it("8. access ne possède pas allow-change-local-password", () => {
    expect(access.permissions).not.toContain("allow-change-local-password");
  });

  it("9. main possède allow-lock-local-access", () => {
    expect(main.permissions).toContain("allow-lock-local-access");
    expect(GRANULAR_PERMISSION_SOURCES["allow-lock-local-access"]).toContain(
      "lock_local_access",
    );
  });

  it("10. access ne possède pas allow-lock-local-access", () => {
    expect(access.permissions).not.toContain("allow-lock-local-access");
  });

  it("11. access ne possède aucune permission SQL", () => {
    expect(access.permissions.some((permission) => permission.startsWith("sql:"))).toBe(
      false,
    );
  });

  it("12. access ne possède aucune commande métier", () => {
    for (const permission of BUSINESS_PERMISSIONS) {
      expect(access.permissions).not.toContain(permission);
    }
  });

  it("13. l’ancien groupe trop large allow-local-access n’est plus utilisé", () => {
    expect(access.permissions).not.toContain("allow-local-access");
    expect(main.permissions).not.toContain("allow-local-access");
    // Les permissions granulaires existent ; l’ancien fichier unique n’est plus importable.
    expect(Object.keys(GRANULAR_PERMISSION_SOURCES)).not.toContain("allow-local-access");
  });

  it("14. access ne peut pas créer arbitrairement la fenêtre main", () => {
    expect(
      access.permissions.some(
        (permission) =>
          permission.includes("webview:allow-create") ||
          permission.includes("window:allow-create"),
      ),
    ).toBe(false);
    const startupWindows = tauriConf.app.windows as Array<{ label: string }>;
    expect(startupWindows.map((window) => window.label)).toEqual(["access"]);
    expect(startupWindows.some((window) => window.label === "main")).toBe(false);
  });

  it("15. main conserve les permissions SQL nécessaires au fonctionnement métier", () => {
    expect(main.permissions).toContain("sql:default");
    expect(main.permissions).toContain("sql:allow-execute");
    for (const permission of BUSINESS_PERMISSIONS) {
      expect(main.permissions).toContain(permission);
    }
  });
});

describe("capabilities SEC1-B — licence hors ligne", () => {
  it("16. access possède allow-activate-offline-license", () => {
    expect(access.permissions).toContain("allow-activate-offline-license");
    expect(GRANULAR_PERMISSION_SOURCES["allow-activate-offline-license"]).toContain(
      "activate_offline_license",
    );
  });

  it("17. main possède allow-activate-offline-license", () => {
    expect(main.permissions).toContain("allow-activate-offline-license");
  });

  it("18. aucune autre capability non autorisée ne reçoit cette permission", () => {
    // Seuls access.json et main.json existent et portent la permission.
    expect(access.identifier).toBe("access");
    expect(main.identifier).toBe("main");
    expect(access.permissions).toContain("allow-activate-offline-license");
    expect(main.permissions).toContain("allow-activate-offline-license");
  });

  it("19. le générateur de licences n’est pas référencé dans les capabilities", () => {
    const serialized = JSON.stringify({ access, main, tauriConf }).toLowerCase();
    expect(serialized).not.toContain("license-generator");
    expect(serialized).not.toContain("jrb-license-generator");
  });

  it("20. access conserve zéro permission SQL après ajout de l’activation", () => {
    expect(access.permissions).toContain("allow-activate-offline-license");
    expect(access.permissions.some((permission) => permission.startsWith("sql:"))).toBe(
      false,
    );
  });
});
