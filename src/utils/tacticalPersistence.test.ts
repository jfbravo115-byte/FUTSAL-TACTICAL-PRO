// @vitest-environment jsdom
/**
 * DÓNDE ACABA UN ANÁLISIS DE TACTICAL PRO.
 *
 * El defecto que se corrige: un partido abierto solo desde el historial
 * remoto no tenía copia local, y por eso el análisis se veía en pantalla pero
 * no llegaba al PDF. Aquí se fija que la memoria se actualice siempre, que
 * local y remoto sean independientes, y que un informe incompleto no se
 * guarde en ninguno de los tres sitios.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TACTICAL_SYNC_FAILED_MESSAGE,
  describeTacticalSync,
  isPersistableAnalysis,
  resolveTacticalTargets,
} from "./tacticalPersistence";
import {
  LocalFinalCopy,
  getFinalLocalCopy,
  listFinalLocalCopies,
  saveFinalLocalCopy,
  markFinalLocalCopySynced,
  updateFinalLocalCopyMatchData,
} from "../services/matchSnapshotService";
import { ActionType, GameState, MatchData, Period, Role } from "../types/futsal";
import { buildMatchJson } from "../services/matchExportService";

const copiaLocal = (over: Partial<LocalFinalCopy> = {}): LocalFinalCopy => ({
  id: "futsal_final_copy_v1_abc",
  matchData: {} as MatchData,
  syncStatus: "local",
  ...over,
});

describe("1 · a dónde se escribe", () => {
  it("copia local SIN sincronizar: solo local", () => {
    expect(resolveTacticalTargets(copiaLocal(), "futsal_final_copy_v1_abc")).toEqual({
      localCopyId: "futsal_final_copy_v1_abc",
      remoteId: null,
    });
  });

  it("copia local SINCRONIZADA: local y remoto", () => {
    const local = copiaLocal({ syncStatus: "synced", remoteId: "r-99" });
    expect(resolveTacticalTargets(local, "futsal_final_copy_v1_abc")).toEqual({
      localCopyId: "futsal_final_copy_v1_abc",
      remoteId: "r-99",
    });
  });

  it("abierto SOLO desde remoto: el id de la ruta ES el remoto", () => {
    expect(resolveTacticalTargets(null, "r-123")).toEqual({
      localCopyId: null,
      remoteId: "r-123",
    });
  });

  it("sin copia y sin id no hay destino, y no se inventa ninguno", () => {
    expect(resolveTacticalTargets(null, null)).toEqual({ localCopyId: null, remoteId: null });
    expect(resolveTacticalTargets(null, "   ")).toEqual({ localCopyId: null, remoteId: null });
    expect(resolveTacticalTargets(undefined, undefined)).toEqual({
      localCopyId: null,
      remoteId: null,
    });
  });
});

describe("2 · 12-13 · qué se guarda y qué no", () => {
  it("un informe completo se guarda", () => {
    expect(isPersistableAnalysis("## Análisis\nTexto")).toBe(true);
  });

  it("12 · un informe PARCIAL no se guarda nunca", () => {
    expect(isPersistableAnalysis("texto a medias", true)).toBe(false);
  });

  it("13 · ni uno vacío, que es lo que deja un AbortError", () => {
    expect(isPersistableAnalysis("")).toBe(false);
    expect(isPersistableAnalysis("   \n ")).toBe(false);
    expect(isPersistableAnalysis(null)).toBe(false);
    expect(isPersistableAnalysis(undefined)).toBe(false);
    // Y aunque llegara texto, marcado como parcial sigue sin guardarse.
    expect(isPersistableAnalysis("algo", true)).toBe(false);
  });
});

describe("3 · 8-9 · qué se le dice al usuario cuando falla el remoto", () => {
  it("el aviso es el del encargo, literal", () => {
    expect(TACTICAL_SYNC_FAILED_MESSAGE).toBe(
      "Informe generado, pero no se pudo sincronizar. Puedes exportarlo ahora.",
    );
    expect(describeTacticalSync("fallo")).toBe(TACTICAL_SYNC_FAILED_MESSAGE);
  });

  it("y NO dice que el informe esté incompleto", () => {
    expect(TACTICAL_SYNC_FAILED_MESSAGE.toLowerCase()).not.toContain("incompleto");
    expect(TACTICAL_SYNC_FAILED_MESSAGE.toLowerCase()).not.toContain("parcial");
    expect(TACTICAL_SYNC_FAILED_MESSAGE).toContain("Puedes exportarlo ahora");
  });

  it("cuando no hay remoto o sí se sincronizó, no se avisa de nada", () => {
    expect(describeTacticalSync("sin-remoto")).toBeNull();
    expect(describeTacticalSync("sincronizado")).toBeNull();
  });
});

// ── 4 · LA COPIA LOCAL CONSERVA TODO LO DEMÁS ───────────────────────────

const PARTIDO: MatchData = {
  teamName: "CD MURCIA",
  opponentName: "PR7",
  period: Period.FINISHED,
  matchClock: 1200000,
  isClockRunning: false,
  fouls: { team: 3, opponent: 2 },
  timeoutsUsed: {
    team: { period1: true, period2: false },
    opponent: { period1: false, period2: true },
  },
  teamDefendsAtKickoff: "left",
  timestamp: "2026-10-26T10:00:00.000Z",
  players: [
    {
      id: "p1", number: 7, name: "Pérez", role: Role.PLAYER, isOnPitch: true,
      plusMinus: 2, individualTimeSeconds: 900, rotationTimeSeconds: 120, isOpponent: false,
      stats: {
        goals: 1, assists: 0, steals: 2, interceptions: 1, losses: 1, errors: 0,
        fouls: 1, yellowCards: 0, redCards: 0, shots: 3, shotsOffTarget: 1, saves: 0, conceded: 0,
      },
    },
  ],
  events: [
    {
      id: "e1", timestamp: 60000, wallClock: 1, period: Period.FIRST, playerIds: ["p1"],
      type: ActionType.GOAL, gameState: GameState.FOUR_VS_FOUR, originGrid: "Z3C",
      destinationGrid: "G2", metadata: { isOpponent: false, setPiece: "normal" },
      scoreAtEvent: { team: 1, opponent: 0 },
    },
  ],
};

describe("4 · 10 · la copia local se actualiza sin tocar nada más", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it("10 · añade el análisis y conserva syncStatus, remoteId y el partido entero", () => {
    const id = saveFinalLocalCopy(PARTIDO);
    markFinalLocalCopySynced(id, "remoto-77");
    const antes = getFinalLocalCopy(id)!;
    expect(antes.syncStatus).toBe("synced");
    expect(antes.remoteId).toBe("remoto-77");

    const analisis = "## Lectura\nEl equipo dominó la segunda parte.";
    updateFinalLocalCopyMatchData(id, { ...antes.matchData, tacticalAnalysis: analisis });

    const despues = getFinalLocalCopy(id)!;
    expect(despues.matchData.tacticalAnalysis).toBe(analisis);
    // 4 · todo lo demás, byte a byte.
    const sinAnalisis = { ...despues.matchData };
    delete (sinAnalisis as any).tacticalAnalysis;
    expect(JSON.stringify(sinAnalisis)).toBe(JSON.stringify(antes.matchData));
    expect(despues.syncStatus).toBe("synced");
    expect(despues.remoteId).toBe("remoto-77");
    // Y sigue habiendo UNA copia, no dos.
    expect(listFinalLocalCopies()).toHaveLength(1);
  });

  it("11 · lo guardado se vuelve a leer igual tras recargar", () => {
    const id = saveFinalLocalCopy(PARTIDO);
    const analisis = "## Lectura\nTexto largo con **negrita** y acentuación: ñ á é.";
    updateFinalLocalCopyMatchData(id, { ...PARTIDO, tacticalAnalysis: analisis });
    // Releer desde localStorage es exactamente lo que hace un arranque nuevo.
    expect(getFinalLocalCopy(id)!.matchData.tacticalAnalysis).toBe(analisis);
  });

  it("35 · y el JSON de respaldo lo conserva", () => {
    const json = JSON.parse(buildMatchJson({ ...PARTIDO, tacticalAnalysis: "## Análisis\nok" }));
    expect(json.tacticalAnalysis).toBe("## Análisis\nok");
    expect(json.events).toHaveLength(1);
    expect(json.players).toHaveLength(1);
  });
});

// ── 5 · EL SERVICIO REMOTO ──────────────────────────────────────────────

describe("5 · updatePartidoTacticalAnalysis", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  const cargarServicio = async (fetchFake: any, user: any = { getIdToken: async () => "tok" }) => {
    vi.resetModules();
    vi.doMock("firebase/auth", () => ({ getAuth: () => ({ currentUser: user }) }));
    vi.stubGlobal("fetch", fetchFake);
    return import("../services/partidosService");
  };

  it("llama a la ruta aislada, con PATCH y solo el análisis en el cuerpo", async () => {
    const fetchFake = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    const { updatePartidoTacticalAnalysis } = await cargarServicio(fetchFake);
    await updatePartidoTacticalAnalysis("r-5", "  informe completo  ");

    expect(fetchFake).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFake.mock.calls[0] as any[];
    expect(url).toBe("/api/partidos/r-5/tactical-analysis");
    expect(init.method).toBe("PATCH");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual({ tacticalAnalysis: "informe completo" });
  });

  it("8 · un fallo remoto se propaga como error y no toca nada más", async () => {
    const fetchFake = vi.fn(async () => ({ ok: false, status: 500 }));
    const { updatePartidoTacticalAnalysis } = await cargarServicio(fetchFake);
    await expect(updatePartidoTacticalAnalysis("r-5", "texto")).rejects.toThrow(/500/);
  });

  it("no envía nunca un análisis vacío", async () => {
    const fetchFake = vi.fn();
    const { updatePartidoTacticalAnalysis } = await cargarServicio(fetchFake);
    await expect(updatePartidoTacticalAnalysis("r-5", "   ")).rejects.toThrow();
    await expect(updatePartidoTacticalAnalysis("", "texto")).rejects.toThrow();
    expect(fetchFake).not.toHaveBeenCalled();
  });
});
