import { describe, it, expect, vi } from "vitest";
import { loadTemplateLocalFirst, isValidStoredTemplate, buildTemplatePayload, StoredTemplate } from "./templateLoadService";

const validTemplate: StoredTemplate = {
  teamName: "MI EQUIPO",
  teamLogo: undefined,
  players: [{ id: "p1", number: 7, name: "Juan" }],
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("isValidStoredTemplate", () => {
  it("acepta un objeto con players como array", () => {
    expect(isValidStoredTemplate(validTemplate)).toBe(true);
  });
  it("rechaza null/undefined/no-objeto", () => {
    expect(isValidStoredTemplate(null)).toBe(false);
    expect(isValidStoredTemplate(undefined)).toBe(false);
    expect(isValidStoredTemplate("string")).toBe(false);
  });
  it("rechaza un objeto sin players[] (plantilla corrupta)", () => {
    expect(isValidStoredTemplate({ teamName: "X" })).toBe(false);
    expect(isValidStoredTemplate({ teamName: "X", players: "no-es-array" })).toBe(false);
  });
  // J. plantilla legacy sin campos opcionales sigue funcionando.
  it("J: acepta una plantilla legacy sin teamLogo ni updatedAt (campos opcionales ausentes)", () => {
    const legacy = { teamName: "EQUIPO ANTIGUO", players: [{ id: "p1" }] };
    expect(isValidStoredTemplate(legacy)).toBe(true);
  });
  it("J: acepta jugadores de plantilla legacy sin rotationTimeSeconds ni otros campos nuevos", () => {
    const legacy = { teamName: "X", players: [{ id: "p1", number: 1, name: "A", role: "PLAYER", isStarter: true, isOpponent: false }] };
    expect(isValidStoredTemplate(legacy)).toBe(true);
  });
});

describe("buildTemplatePayload", () => {
  // I. startMatch guarda teamName/teamLogo/players y no opponentName.
  it("I: el payload nunca incluye opponentName, aunque se le pase información adicional en players", () => {
    const payload = buildTemplatePayload("MI EQUIPO", "logo.png", [{ id: "p1" }]);
    expect(payload).toEqual({
      teamName: "MI EQUIPO",
      teamLogo: "logo.png",
      players: [{ id: "p1" }],
      updatedAt: expect.any(String),
    });
    expect("opponentName" in payload).toBe(false);
    expect(JSON.stringify(payload)).not.toContain("opponentName");
  });

  it("I: teamLogo undefined se conserva como undefined (equipo sin logo)", () => {
    const payload = buildTemplatePayload("MI EQUIPO", undefined, []);
    expect(payload.teamLogo).toBeUndefined();
  });
});

describe("loadTemplateLocalFirst", () => {
  // G. localStorage válido tiene prioridad sobre Firestore.
  it("G: si hay copia local válida, se usa y NUNCA se llama a fetchRemote", async () => {
    const fetchRemote = vi.fn().mockResolvedValue({ teamName: "REMOTO", players: [] });
    const writeLocal = vi.fn();
    const result = await loadTemplateLocalFirst(
      () => JSON.stringify(validTemplate),
      fetchRemote,
      writeLocal,
    );
    expect(result.source).toBe("local");
    expect(result.template?.teamName).toBe("MI EQUIPO");
    expect(fetchRemote).not.toHaveBeenCalled();
    expect(writeLocal).not.toHaveBeenCalled();
  });

  // H. sin localStorage -> Firestore carga y siembra local.
  it("H: sin copia local, una plantilla remota válida se usa y se siembra en local", async () => {
    const remoteTemplate: StoredTemplate = { teamName: "REMOTO", players: [{ id: "r1" }] };
    const writeLocal = vi.fn();
    const result = await loadTemplateLocalFirst(
      () => null,
      async () => remoteTemplate,
      writeLocal,
    );
    expect(result.source).toBe("remote");
    expect(result.template?.teamName).toBe("REMOTO");
    expect(writeLocal).toHaveBeenCalledTimes(1);
    expect(writeLocal).toHaveBeenCalledWith(JSON.stringify(remoteTemplate));
  });

  it("copia local corrupta (JSON inválido) cae a Firestore igual que si no existiera", async () => {
    const remoteTemplate: StoredTemplate = { teamName: "REMOTO", players: [] };
    const result = await loadTemplateLocalFirst(
      () => "{esto no es JSON",
      async () => remoteTemplate,
      vi.fn(),
    );
    expect(result.source).toBe("remote");
  });

  it("copia local estructuralmente inválida (sin players[]) cae a Firestore", async () => {
    const remoteTemplate: StoredTemplate = { teamName: "REMOTO", players: [] };
    const result = await loadTemplateLocalFirst(
      () => JSON.stringify({ teamName: "SIN_PLAYERS" }),
      async () => remoteTemplate,
      vi.fn(),
    );
    expect(result.source).toBe("remote");
  });

  it("sin local y sin usuario (fetchRemote=null) -> sin plantilla, no lanza", async () => {
    const result = await loadTemplateLocalFirst(() => null, null, vi.fn());
    expect(result).toEqual({ template: null, source: "none" });
  });

  it("Firestore lanza (fallo de red) -> se captura, no bloquea, sin plantilla", async () => {
    const result = await loadTemplateLocalFirst(
      () => null,
      async () => {
        throw new Error("network down");
      },
      vi.fn(),
    );
    expect(result).toEqual({ template: null, source: "none" });
  });

  it("Firestore no tiene documento (null) -> sin plantilla, no siembra local", async () => {
    const writeLocal = vi.fn();
    const result = await loadTemplateLocalFirst(() => null, async () => null, writeLocal);
    expect(result.source).toBe("none");
    expect(writeLocal).not.toHaveBeenCalled();
  });
});
