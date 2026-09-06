import { describe, it, expect, beforeEach } from "vitest";
import {
  saveMatchSnapshot,
  loadMatchSnapshot,
  clearMatchSnapshot,
  hasRecoverableMatch,
  saveFinalLocalCopy,
  listFinalLocalCopies,
  importantChangeSignature,
  getFinalLocalCopy,
  markFinalLocalCopySynced,
  isMeaningfulActiveMatch,
} from "./matchSnapshotService";
import { Period, Role, GameState, MatchData } from "../types/futsal";

// Node/vitest no trae localStorage por defecto: mock mínimo en memoria,
// suficiente para las funciones que usa este servicio.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }
  get length() {
    return this.store.size;
  }
}

beforeEach(() => {
  (globalThis as any).localStorage = new MemoryStorage();
});

function buildMatchData(overrides: Partial<MatchData> = {}): MatchData {
  return {
    teamName: "Mi Equipo",
    opponentName: "Rival",
    period: Period.FIRST,
    matchClock: 0,
    isClockRunning: false,
    fouls: { team: 0, opponent: 0 },
    timeoutsUsed: {
      team: { period1: false, period2: false },
      opponent: { period1: false, period2: false },
    },
    players: [
      {
        id: "p1",
        number: 7,
        name: "Juan",
        role: Role.PLAYER,
        isOnPitch: true,
        plusMinus: 0,
        individualTimeSeconds: 0,
        rotationTimeSeconds: 0,
        isOpponent: false,
        stats: {
          goals: 0, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0,
          fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0, saves: 0, conceded: 0,
        },
      },
    ],
    events: [],
    ...overrides,
  };
}

describe("matchSnapshotService", () => {
  it("guarda y recupera un snapshot correctamente", () => {
    const md = buildMatchData();
    saveMatchSnapshot(md);
    const snap = loadMatchSnapshot();
    expect(snap).not.toBeNull();
    expect(snap!.matchData.teamName).toBe("Mi Equipo");
    expect(snap!.savedAt).toBeTruthy();
  });

  it("persiste orientación/cambio de lado y estado táctico fuera de MatchData", () => {
    const md = buildMatchData({ period: Period.SECOND });
    saveMatchSnapshot(md, {
      isFieldFlipped: true,
      gameState: GameState.PJ_ATTACK,
      rivalGameState: GameState.INFERIORITY,
      isDataLocked: true,
    });
    // Un guardado posterior del reloj sin uiState no debe borrar esos datos.
    saveMatchSnapshot({ ...md, matchClock: 5000 });
    const snap = loadMatchSnapshot();
    expect(snap?.uiState?.isFieldFlipped).toBe(true);
    expect(snap?.uiState?.gameState).toBe(GameState.PJ_ATTACK);
    expect(snap?.uiState?.isDataLocked).toBe(true);
  });

  it("hasRecoverableMatch es true tras guardar un partido no finalizado", () => {
    saveMatchSnapshot(buildMatchData({ period: Period.SECOND }));
    expect(hasRecoverableMatch()).toBe(true);
  });

  it("hasRecoverableMatch es false si el partido está FINISHED", () => {
    saveMatchSnapshot(buildMatchData({ period: Period.FINISHED }));
    expect(hasRecoverableMatch()).toBe(false);
  });

  it("un partido inicial vacío no se considera recuperable", () => {
    const blank = buildMatchData();
    expect(isMeaningfulActiveMatch(blank)).toBe(false);
    saveMatchSnapshot(blank);
    expect(hasRecoverableMatch()).toBe(false);
  });

  it("hasRecoverableMatch es false si no hay ningún snapshot guardado", () => {
    expect(hasRecoverableMatch()).toBe(false);
  });

  it("clearMatchSnapshot elimina el snapshot", () => {
    saveMatchSnapshot(buildMatchData());
    clearMatchSnapshot();
    expect(loadMatchSnapshot()).toBeNull();
  });

  it("loadMatchSnapshot no lanza y devuelve null ante datos corruptos", () => {
    localStorage.setItem("futsal_active_match_snapshot_v1", "{esto no es JSON");
    expect(() => loadMatchSnapshot()).not.toThrow();
    expect(loadMatchSnapshot()).toBeNull();
  });

  it("saveFinalLocalCopy guarda una copia final recuperable y pendiente de sincronizar", () => {
    const md = buildMatchData({ period: Period.FINISHED, timestamp: "2026-01-01T00:00:00.000Z" });
    const id = saveFinalLocalCopy(md);
    const copies = listFinalLocalCopies();
    expect(copies.length).toBe(1);
    expect(copies[0].matchData.teamName).toBe("Mi Equipo");
    expect(copies[0].syncStatus).toBe("pending");
    expect(getFinalLocalCopy(id)?.matchData.opponentName).toBe("Rival");
  });

  it("marcar sincronizada NO elimina la copia local y conserva el remoteId", () => {
    const id = saveFinalLocalCopy(buildMatchData({ period: Period.FINISHED }));
    markFinalLocalCopySynced(id, "remote-123");
    const copy = getFinalLocalCopy(id);
    expect(copy).not.toBeNull();
    expect(copy!.syncStatus).toBe("synced");
    expect(copy!.remoteId).toBe("remote-123");
    expect(localStorage.getItem(id)).toBeTruthy();
  });

  it("listFinalLocalCopies ordena por timestamp descendente (más reciente primero)", () => {
    saveFinalLocalCopy(buildMatchData({ timestamp: "2026-01-01T00:00:00.000Z" }));
    saveFinalLocalCopy(buildMatchData({ timestamp: "2026-06-01T00:00:00.000Z" }));
    const copies = listFinalLocalCopies();
    expect(copies.length).toBe(2);
    expect(copies[0].matchData.timestamp).toBe("2026-06-01T00:00:00.000Z");
  });

  describe("importantChangeSignature", () => {
    it("no cambia si solo avanza el reloj (tick normal)", () => {
      const a = buildMatchData({ matchClock: 1000 });
      const b = buildMatchData({ matchClock: 1500 });
      expect(importantChangeSignature(a)).toBe(importantChangeSignature(b));
    });

    it("cambia cuando se registra un evento (acción)", () => {
      const a = buildMatchData();
      const b = buildMatchData({
        events: [
          {
            id: "e1", timestamp: 0, wallClock: 0, period: Period.FIRST,
            playerIds: ["p1"], type: "GOAL" as any, gameState: "4vs4" as any,
          },
        ],
      });
      expect(importantChangeSignature(a)).not.toBe(importantChangeSignature(b));
    });

    it("cambia cuando cambia el período (fin de parte)", () => {
      const a = buildMatchData({ period: Period.FIRST });
      const b = buildMatchData({ period: Period.SECOND });
      expect(importantChangeSignature(a)).not.toBe(importantChangeSignature(b));
    });

    it("cambia cuando cambia quién está en pista (sustitución)", () => {
      const a = buildMatchData();
      const b = buildMatchData({
        players: [{ ...buildMatchData().players[0], id: "p2" }],
      });
      expect(importantChangeSignature(a)).not.toBe(importantChangeSignature(b));
    });
  });
});
