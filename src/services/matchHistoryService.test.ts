import { describe, expect, it } from "vitest";
import { combineMatchHistory, matchHistorySignature } from "./matchHistoryService";
import { MatchData, Period, Role, SavedMatch } from "../types/futsal";
import { LocalFinalCopy } from "./matchSnapshotService";

function match(id: string, timestamp = "2026-09-06T10:00:00.000Z"): SavedMatch {
  const data: MatchData = {
    teamName: "Local",
    opponentName: "Rival",
    period: Period.FINISHED,
    matchClock: 0,
    isClockRunning: false,
    fouls: { team: 0, opponent: 0 },
    timeoutsUsed: { team: { period1: false, period2: false }, opponent: { period1: false, period2: false } },
    players: [{
      id: "p1", number: 7, name: "Juan", role: Role.PLAYER, isOnPitch: false,
      plusMinus: 0, individualTimeSeconds: 500, rotationTimeSeconds: 0, isOpponent: false,
      stats: { goals: 0, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0, fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0, saves: 0, conceded: 0 },
    }],
    events: [], timestamp,
  };
  return { ...data, id };
}

describe("Historial 2.0 — combinación local/remoto (H)", () => {
  it("muestra partidos locales aunque el remoto esté vacío/fallando", () => {
    const local: LocalFinalCopy[] = [{ id: "futsal_final_copy_v1_x", matchData: match("x"), syncStatus: "pending" }];
    const out = combineMatchHistory([], local);
    expect(out).toHaveLength(1);
    expect(out[0].historySource).toBe("local");
    expect(out[0].syncStatus).toBe("pending");
  });

  it("deduplica la misma copia local + remoto", () => {
    const remote = match("remote-1");
    const local: LocalFinalCopy[] = [{ id: "futsal_final_copy_v1_x", matchData: { ...remote }, syncStatus: "synced", remoteId: "remote-1" }];
    const out = combineMatchHistory([remote], local);
    expect(out).toHaveLength(1);
    expect(out[0].historySource).toBe("both");
    expect(out[0].localStorageId).toBe("futsal_final_copy_v1_x");
  });

  it("la firma es estable para el mismo partido", () => {
    expect(matchHistorySignature(match("a"))).toBe(matchHistorySignature(match("b")));
  });
});

// ── EL ANÁLISIS DE TACTICAL PRO NO SE PIERDE AL COMBINAR ───────────────
//
// El análisis se genera DESPUÉS de guardar el partido en el servidor, y
// `partidosService` solo sabe crear, leer y borrar: no hay forma de
// actualizar el registro remoto. Así que el texto vive únicamente en la
// copia local, y preferir siempre la versión remota lo hacía desaparecer del
// Historial de todos los partidos sincronizados.

describe("Historial — el análisis de TACTICAL PRO sobrevive a la combinación", () => {
  const conAnalisis = (m: SavedMatch, texto: string): SavedMatch => ({
    ...m,
    tacticalAnalysis: texto,
  });

  it("2 · rellena el análisis de la copia local cuando el remoto no lo trae", () => {
    const remote = match("remote-1");
    const local: LocalFinalCopy[] = [{
      id: "futsal_final_copy_v1_x",
      matchData: conAnalisis(match("x"), "## Análisis\nEl equipo dominó."),
      syncStatus: "synced",
      remoteId: "remote-1",
    }];
    const out = combineMatchHistory([remote], local);
    expect(out).toHaveLength(1);
    expect(out[0].historySource).toBe("both");
    expect(out[0].tacticalAnalysis).toBe("## Análisis\nEl equipo dominó.");
  });

  it("3 · un análisis remoto válido NO se sustituye por el local", () => {
    const remote = conAnalisis(match("remote-1"), "ANÁLISIS REMOTO");
    const local: LocalFinalCopy[] = [{
      id: "futsal_final_copy_v1_x",
      matchData: conAnalisis(match("x"), "ANÁLISIS LOCAL ANTIGUO"),
      syncStatus: "synced",
      remoteId: "remote-1",
    }];
    expect(combineMatchHistory([remote], local)[0].tacticalAnalysis).toBe("ANÁLISIS REMOTO");
  });

  it("solo se rellena el hueco: el resto del partido sigue siendo el remoto", () => {
    const remote = { ...match("remote-1"), teamName: "NOMBRE REMOTO" };
    const local: LocalFinalCopy[] = [{
      id: "futsal_final_copy_v1_x",
      matchData: conAnalisis({ ...match("x"), teamName: "NOMBRE LOCAL VIEJO" }, "texto"),
      syncStatus: "synced",
      remoteId: "remote-1",
    }];
    const out = combineMatchHistory([remote], local)[0];
    expect(out.teamName).toBe("NOMBRE REMOTO");
    expect(out.tacticalAnalysis).toBe("texto");
  });

  it("un análisis en blanco no cuenta como análisis", () => {
    const remote = match("remote-1");
    const local: LocalFinalCopy[] = [{
      id: "futsal_final_copy_v1_x",
      matchData: conAnalisis(match("x"), "   \n  "),
      syncStatus: "synced",
      remoteId: "remote-1",
    }];
    expect(combineMatchHistory([remote], local)[0].tacticalAnalysis).toBeUndefined();
  });

  it("17 · un partido histórico sin análisis sigue combinándose igual", () => {
    const remote = match("remote-1");
    const local: LocalFinalCopy[] = [{
      id: "futsal_final_copy_v1_x",
      matchData: match("x"),
      syncStatus: "synced",
      remoteId: "remote-1",
    }];
    const out = combineMatchHistory([remote], local);
    expect(out).toHaveLength(1);
    expect(out[0].tacticalAnalysis).toBeUndefined();
    expect("tacticalAnalysis" in out[0]).toBe(false);
  });

  it("un partido solo local conserva el suyo, como siempre", () => {
    const local: LocalFinalCopy[] = [{
      id: "futsal_final_copy_v1_x",
      matchData: conAnalisis(match("x"), "SOLO LOCAL"),
      syncStatus: "pending",
    }];
    const out = combineMatchHistory([], local);
    expect(out[0].historySource).toBe("local");
    expect(out[0].tacticalAnalysis).toBe("SOLO LOCAL");
  });
});

// ── 4 · NUNCA MEZCLAR EL ANÁLISIS DE DOS PARTIDOS ──────────────────────

describe("Historial — el análisis del partido A nunca acaba en el B", () => {
  it("dos partidos emparejados por remoteId no se cruzan", () => {
    const remoteA = match("remote-A", "2026-09-06T10:00:00.000Z");
    const remoteB = match("remote-B", "2026-09-07T10:00:00.000Z");
    const local: LocalFinalCopy[] = [
      { id: "copia-A", matchData: { ...match("a", "2026-09-06T10:00:00.000Z"), tacticalAnalysis: "ANÁLISIS A" },
        syncStatus: "synced", remoteId: "remote-A" },
      { id: "copia-B", matchData: { ...match("b", "2026-09-07T10:00:00.000Z"), tacticalAnalysis: "ANÁLISIS B" },
        syncStatus: "synced", remoteId: "remote-B" },
    ];
    const out = combineMatchHistory([remoteA, remoteB], local);
    expect(out).toHaveLength(2);
    const porRemoto = new Map(out.map((m) => [m.remoteId, m.tacticalAnalysis]));
    expect(porRemoto.get("remote-A")).toBe("ANÁLISIS A");
    expect(porRemoto.get("remote-B")).toBe("ANÁLISIS B");
  });

  it("dos partidos DISTINTOS con firma distinta no comparten análisis", () => {
    // Misma fecha pero rivales distintos: la firma los separa.
    const remoteA = { ...match("remote-A"), opponentName: "Rival A" };
    const remoteB = { ...match("remote-B"), opponentName: "Rival B" };
    const local: LocalFinalCopy[] = [
      { id: "copia-A", matchData: { ...match("a"), opponentName: "Rival A", tacticalAnalysis: "ANÁLISIS A" },
        syncStatus: "pending" },
    ];
    const out = combineMatchHistory([remoteA, remoteB], local);
    expect(matchHistorySignature(remoteA)).not.toBe(matchHistorySignature(remoteB));
    const b = out.find((m) => m.remoteId === "remote-B")!;
    expect(b.tacticalAnalysis).toBeUndefined();
  });

  it("un partido remoto sin copia local nunca recibe un análisis prestado", () => {
    const remoteA = match("remote-A", "2026-09-06T10:00:00.000Z");
    const remoteB = match("remote-B", "2026-09-07T10:00:00.000Z");
    const local: LocalFinalCopy[] = [
      { id: "copia-A", matchData: { ...match("a", "2026-09-06T10:00:00.000Z"), tacticalAnalysis: "ANÁLISIS A" },
        syncStatus: "synced", remoteId: "remote-A" },
    ];
    const out = combineMatchHistory([remoteA, remoteB], local);
    expect(out.find((m) => m.remoteId === "remote-B")!.tacticalAnalysis).toBeUndefined();
  });

  it("el emparejamiento por FIRMA tampoco cruza análisis entre partidos", () => {
    // Sin remoteId, el emparejamiento es por firma. Dos partidos con firmas
    // distintas no pueden intercambiarse el texto.
    const remoteA = match("remote-A", "2026-09-06T10:00:00.000Z");
    const remoteB = match("remote-B", "2026-09-07T10:00:00.000Z");
    const local: LocalFinalCopy[] = [
      { id: "copia-B", matchData: { ...match("b", "2026-09-07T10:00:00.000Z"), tacticalAnalysis: "ANÁLISIS B" },
        syncStatus: "pending" },
    ];
    const out = combineMatchHistory([remoteA, remoteB], local);
    expect(out.find((m) => m.remoteId === "remote-A")!.tacticalAnalysis).toBeUndefined();
    expect(out.find((m) => m.remoteId === "remote-B")!.tacticalAnalysis).toBe("ANÁLISIS B");
  });
});
