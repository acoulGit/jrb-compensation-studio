/**
 * Audit des capabilities Tauri (Lot 2B-RC1-SEC1-A / HF1).
 *
 * Contrat attendu pour `src-tauri/capabilities/{access,main}.json`.
 * Si ces listes divergent des fichiers, le lot est bloqué jusqu’à alignement.
 */

import { describe, expect, it } from "vitest";

const ACCESS_PERMISSIONS = [
  "core:default",
  "allow-get-local-access-status",
  "allow-setup-local-access",
  "allow-unlock-local-access",
] as const;

const MAIN_PERMISSIONS = [
  "core:default",
  "sql:default",
  "sql:allow-execute",
  "allow-replace-current-population",
  "allow-campaign-write",
  "allow-save-simulation-run",
  "allow-export-simulation-run-excel",
  "allow-get-local-access-status",
  "allow-change-local-password",
  "allow-lock-local-access",
  "dialog:allow-save",
] as const;

const BUSINESS_COMMAND_PERMISSIONS = [
  "allow-replace-current-population",
  "allow-campaign-write",
  "allow-save-simulation-run",
  "allow-export-simulation-run-excel",
] as const;

describe("capabilities SEC1-A-HF1 — permissions granulaires access/main", () => {
  it("1. access possède allow-setup-local-access", () => {
    expect(ACCESS_PERMISSIONS).toContain("allow-setup-local-access");
  });

  it("2. main ne possède pas allow-setup-local-access", () => {
    expect(MAIN_PERMISSIONS).not.toContain("allow-setup-local-access");
  });

  it("3. access possède allow-unlock-local-access", () => {
    expect(ACCESS_PERMISSIONS).toContain("allow-unlock-local-access");
  });

  it("4. main ne possède pas allow-unlock-local-access", () => {
    expect(MAIN_PERMISSIONS).not.toContain("allow-unlock-local-access");
  });

  it("5. main possède allow-change-local-password", () => {
    expect(MAIN_PERMISSIONS).toContain("allow-change-local-password");
  });

  it("6. access ne possède pas allow-change-local-password", () => {
    expect(ACCESS_PERMISSIONS).not.toContain("allow-change-local-password");
  });

  it("7. main possède allow-lock-local-access", () => {
    expect(MAIN_PERMISSIONS).toContain("allow-lock-local-access");
  });

  it("8. access ne possède pas allow-lock-local-access", () => {
    expect(ACCESS_PERMISSIONS).not.toContain("allow-lock-local-access");
  });

  it("9. access et main peuvent obtenir le statut", () => {
    expect(ACCESS_PERMISSIONS).toContain("allow-get-local-access-status");
    expect(MAIN_PERMISSIONS).toContain("allow-get-local-access-status");
  });

  it("10. access ne possède aucune permission SQL", () => {
    expect(ACCESS_PERMISSIONS.some((permission) => permission.startsWith("sql:"))).toBe(
      false,
    );
  });

  it("11. access ne possède aucune commande métier", () => {
    for (const permission of BUSINESS_COMMAND_PERMISSIONS) {
      expect(ACCESS_PERMISSIONS).not.toContain(permission);
    }
  });

  it("12. l’ancien groupe trop large n’est plus utilisé", () => {
    expect(ACCESS_PERMISSIONS).not.toContain("allow-local-access");
    expect(MAIN_PERMISSIONS).not.toContain("allow-local-access");
  });

  it("n’autorise pas la création arbitraire de fenêtre depuis access", () => {
    expect(
      ACCESS_PERMISSIONS.some(
        (permission) =>
          permission.includes("webview:allow-create") ||
          permission.includes("window:allow-create"),
      ),
    ).toBe(false);
  });
});
