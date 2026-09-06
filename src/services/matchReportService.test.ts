import { describe, it, expect } from "vitest";
import { generateMatchReport } from "./matchReportService";
import { Period, Role, ActionType, GoalieAction, MatchData, Player, GameEvent } from "../types/futsal";

function player(overrides: Partial<Player> = {}): Player {
  return {
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
    ...overrides,
  };
}

function event(overrides: Partial<GameEvent> = {}): GameEvent {
  return {
    id: `e-${Math.random()}`,
    timestamp: 0,
    wallClock: 0,
    period: Period.FIRST,
    playerIds: [],
    type: ActionType.GOAL,
    gameState: "4vs4" as any,
    ...overrides,
  };
}

function matchData(overrides: Partial<MatchData> = {}): MatchData {
  return {
    teamName: "Mi Equipo",
    opponentName: "Rival CF",
    period: Period.SECOND,
    matchClock: 1234,
    isClockRunning: true,
    fouls: { team: 2, opponent: 3 },
    timeoutsUsed: {
      team: { period1: false, period2: false },
      opponent: { period1: false, period2: false },
    },
    players: [],
    events: [],
    ...overrides,
  };
}

describe("generateMatchReport — TOT/ROT (A y B del encargo)", () => {
  it("refleja el TOT acumulado tal cual está en el modelo (no lo recalcula)", () => {
    const md = matchData({ players: [player({ individualTimeSeconds: 1122 })] });
    const r = generateMatchReport(md);
    expect(r.playersUsed[0].totSeconds).toBe(1122);
    expect(r.playersUsed[0].totLabel).toBe("18:42");
  });

  it("ROT solo se informa para jugadores EN PISTA; en banquillo es null", () => {
    const md = matchData({
      players: [
        player({ id: "p1", isOnPitch: true, individualTimeSeconds: 300, rotationTimeSeconds: 261 }),
        player({ id: "p2", number: 10, isOnPitch: false, individualTimeSeconds: 500, rotationTimeSeconds: 999 }),
      ],
    });
    const r = generateMatchReport(md);
    const enPista = r.playersUsed.find((p) => p.id === "p1")!;
    const banquillo = r.playersUsed.find((p) => p.id === "p2")!;
    expect(enPista.rotLabel).toBe("4:21");
    expect(banquillo.rotLabel).toBeNull();
    expect(banquillo.rotSeconds).toBeNull();
  });

  it("cuenta las rotaciones (entradas) a partir de eventos SUBSTITUTION reales, no inventadas", () => {
    const md = matchData({
      players: [player({ id: "p1" })],
      events: [
        event({ type: ActionType.SUBSTITUTION, playerIds: ["p1"] }),
        event({ type: ActionType.SUBSTITUTION, playerIds: ["p1"] }),
        event({ type: ActionType.GOAL, playerIds: ["p1"] }), // no cuenta como rotación
      ],
    });
    const r = generateMatchReport(md);
    expect(r.playersUsed[0].rotationsCount).toBe(2);
  });

  it("ROT medio/máximo se calculan solo sobre jugadores en pista ahora mismo", () => {
    const md = matchData({
      players: [
        player({ id: "p1", isOnPitch: true, rotationTimeSeconds: 100 }),
        player({ id: "p2", number: 8, isOnPitch: true, rotationTimeSeconds: 300 }),
        player({ id: "p3", number: 9, isOnPitch: false, rotationTimeSeconds: 9999 }),
      ],
    });
    const r = generateMatchReport(md);
    expect(r.rotationSummary.avgRotSeconds).toBe(200);
    expect(r.rotationSummary.maxRotSeconds).toBe(300);
  });

  it("sin jugadores en pista, ROT medio/máximo son null (no se inventa un 0 engañoso)", () => {
    const md = matchData({ players: [player({ isOnPitch: false })] });
    const r = generateMatchReport(md);
    expect(r.rotationSummary.avgRotSeconds).toBeNull();
    expect(r.rotationSummary.maxRotSeconds).toBeNull();
  });
});

describe("generateMatchReport — reloj en milisegundos", () => {
  it("formatea matchClock y timestamps de eventos como milisegundos, no como segundos", () => {
    const md = matchData({
      matchClock: 125000,
      players: [player({ individualTimeSeconds: 300 })],
      events: [event({ timestamp: 65000, type: ActionType.GOAL, playerIds: ["p1"] })],
    });
    const r = generateMatchReport(md);
    expect(r.matchClockLabel).toBe("2:05");
    expect(r.relevantEvents[0].timeLabel).toBe("1:05");
  });
});

describe("generateMatchReport — marcador, goles, faltas", () => {
  it("calcula el marcador con la misma convención que el resto de la app (GOAL/GOAL_CONCEDED + metadata.isOpponent)", () => {
    const md = matchData({
      players: [player()],
      events: [
        event({ type: ActionType.GOAL, playerIds: ["p1"] }), // propio
        event({ type: GoalieAction.GOAL_CONCEDED, metadata: { isOpponent: true } }), // rival
        event({ type: ActionType.GOAL, metadata: { isOpponent: true } }), // rival
      ],
    });
    const r = generateMatchReport(md);
    expect(r.score).toEqual({ team: 1, opponent: 2 });
  });

  it("las faltas del informe son exactamente matchData.fouls, sin recalcular", () => {
    const md = matchData({ fouls: { team: 5, opponent: 1 } });
    const r = generateMatchReport(md);
    expect(r.fouls).toEqual({ team: 5, opponent: 1 });
  });

  it("no inventa portero si no hay ninguno en pista", () => {
    const md = matchData({ players: [player({ role: Role.PLAYER })] });
    const r = generateMatchReport(md);
    expect(r.goalkeeper).toBeNull();
  });

  it("informa del portero en pista con sus paradas/encajados reales", () => {
    const md = matchData({
      players: [
        player({
          id: "gk1", number: 1, role: Role.GOALKEEPER, isOnPitch: true,
          stats: { goals: 0, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0, fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0, saves: 7, conceded: 2 },
        }),
      ],
    });
    const r = generateMatchReport(md);
    expect(r.goalkeeper).toEqual({ name: "Juan", number: 1, saves: 7, conceded: 2 });
  });
});

describe("generateMatchReport — no inventa datos", () => {
  it("con un partido vacío no lanza y no produce jugadores/eventos ficticios", () => {
    const r = generateMatchReport(matchData());
    expect(r.playersUsed).toEqual([]);
    expect(r.relevantEvents).toEqual([]);
    expect(r.zoneDistribution).toEqual([]);
    expect(r.periodStats).toEqual([]);
  });

  it("un jugador que nunca jugó ni participó en eventos no aparece como 'utilizado'", () => {
    const md = matchData({ players: [player({ individualTimeSeconds: 0, isOnPitch: false })] });
    const r = generateMatchReport(md);
    expect(r.playersUsed.length).toBe(0);
  });
});
