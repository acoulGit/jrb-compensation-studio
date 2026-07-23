/** Tests des wrappers d’invocation d’accès local (Lot 2B-RC1-SEC1-A). */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalAccessStatusDto } from "../application/localAccess";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { invoke } from "@tauri-apps/api/core";
import {
  changeLocalPassword,
  getLocalAccessStatus,
  lockLocalAccess,
  setupLocalAccess,
  unlockLocalAccess,
} from "../application/localAccess";

const invokeMock = vi.mocked(invoke);

const STATUS: LocalAccessStatusDto = {
  isSetUp: true,
  isUnlocked: true,
  isExpired: false,
  clockAnomalyDetected: false,
  installationId: "JRB-CS-aaaaaaaa-bbbbbbbb",
  initialValidUntil: "2027-05-01T00:00:00Z",
  currentValidUntil: "2027-05-01T00:00:00Z",
  remainingDays: 120,
};

beforeEach(() => {
  invokeMock.mockReset();
});

describe("getLocalAccessStatus", () => {
  it("transmet la commande sans argument et renvoie le statut", async () => {
    invokeMock.mockResolvedValueOnce(STATUS);
    const status = await getLocalAccessStatus();
    expect(invokeMock).toHaveBeenCalledWith("get_local_access_status");
    expect(status).toEqual(STATUS);
  });
});

describe("setupLocalAccess", () => {
  it("renvoie ok=true avec le statut en cas de succès", async () => {
    invokeMock.mockResolvedValueOnce(STATUS);
    const outcome = await setupLocalAccess({
      password: "MotDePasseValide1",
      passwordConfirmation: "MotDePasseValide1",
    });
    expect(invokeMock).toHaveBeenCalledWith("setup_local_access", {
      input: { password: "MotDePasseValide1", passwordConfirmation: "MotDePasseValide1" },
    });
    expect(outcome).toEqual({ ok: true, status: STATUS });
  });

  it("renvoie ok=false avec le message d’erreur du backend (string)", async () => {
    invokeMock.mockRejectedValueOnce("Les deux mots de passe saisis ne correspondent pas.");
    const outcome = await setupLocalAccess({
      password: "a",
      passwordConfirmation: "b",
    });
    expect(outcome).toEqual({
      ok: false,
      message: "Les deux mots de passe saisis ne correspondent pas.",
    });
  });

  it("renvoie un message générique si l’erreur n’a pas de contenu utilisable", async () => {
    invokeMock.mockRejectedValueOnce({});
    const outcome = await setupLocalAccess({
      password: "a",
      passwordConfirmation: "a",
    });
    expect(outcome).toEqual({ ok: false, message: "L’opération a échoué. Réessayez." });
  });
});

describe("unlockLocalAccess", () => {
  it("renvoie ok=true avec le statut en cas de succès", async () => {
    invokeMock.mockResolvedValueOnce(STATUS);
    const outcome = await unlockLocalAccess({ password: "MotDePasseValide1" });
    expect(invokeMock).toHaveBeenCalledWith("unlock_local_access", {
      input: { password: "MotDePasseValide1" },
    });
    expect(outcome).toEqual({ ok: true, status: STATUS });
  });

  it("renvoie ok=false avec le message d’erreur (Error)", async () => {
    invokeMock.mockRejectedValueOnce(new Error("Mot de passe incorrect."));
    const outcome = await unlockLocalAccess({ password: "mauvais" });
    expect(outcome).toEqual({ ok: false, message: "Mot de passe incorrect." });
  });
});

describe("changeLocalPassword", () => {
  it("renvoie ok=true sans donnée en cas de succès", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const outcome = await changeLocalPassword({
      oldPassword: "AncienMotDePasse1",
      newPassword: "NouveauMotDePasse2",
      newPasswordConfirmation: "NouveauMotDePasse2",
    });
    expect(invokeMock).toHaveBeenCalledWith("change_local_password", {
      input: {
        oldPassword: "AncienMotDePasse1",
        newPassword: "NouveauMotDePasse2",
        newPasswordConfirmation: "NouveauMotDePasse2",
      },
    });
    expect(outcome).toEqual({ ok: true });
  });

  it("renvoie ok=false avec le message d’erreur en cas d’échec", async () => {
    invokeMock.mockRejectedValueOnce("Mot de passe incorrect.");
    const outcome = await changeLocalPassword({
      oldPassword: "mauvais",
      newPassword: "NouveauMotDePasse2",
      newPasswordConfirmation: "NouveauMotDePasse2",
    });
    expect(outcome).toEqual({ ok: false, message: "Mot de passe incorrect." });
  });
});

describe("lockLocalAccess", () => {
  it("renvoie ok=true en cas de succès", async () => {
    invokeMock.mockResolvedValueOnce(undefined);
    const outcome = await lockLocalAccess();
    expect(invokeMock).toHaveBeenCalledWith("lock_local_access");
    expect(outcome).toEqual({ ok: true });
  });

  it("renvoie ok=false avec le message d’erreur en cas d’échec", async () => {
    invokeMock.mockRejectedValueOnce(new Error("échec inattendu"));
    const outcome = await lockLocalAccess();
    expect(outcome).toEqual({ ok: false, message: "échec inattendu" });
  });
});
