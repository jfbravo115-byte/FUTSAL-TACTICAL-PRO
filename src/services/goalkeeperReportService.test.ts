import { describe, it, expect } from "vitest";
import { buildGoalkeeperReports } from "./goalkeeperReportService";
import { ActionType, GoalieAction, MatchData, Period, Player, Role, GameEvent } from "../types/futsal";

function player(overrides: Partial<Player> = {}): Player {
  return {
    id: "gk1",
    number: 1,
    name: "Portero",
    role: Role.GOALKEEPER,
    isOnPitch: true,
    plusMinus: 0,
    individualTimeSeconds: 0,
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
    type: GoalieAction.SAVE_PARRY,
    gameState: "4vs4" as any,
    ...overrides,
  };
}

function matchData(overrides: Partial<MatchData> = {}): MatchData {
  return {
    teamName: "Mi Equipo",
    opponentName: "Rival",
    period: Period.SECOND,
    matchClock: 1000,
    isClockRunning: false,
    fouls: { team: 0, opponent: 0 },
    timeoutsUsed: { team: { period1: false, period2: false }, opponent: { period1: false, period2: false } },
    players: [],
    events: [],
    ...overrides,
  };
}

describe("buildGoalkeeperReports", () => {
  // 12. portero sin eventos
  it("portero con minutos pero sin eventos: 0 paradas/encajados, efectividad null, mapas sin datos", () => {
    const md = matchData({ players: [player({ individualTimeSeconds: 1200 })] });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.totalSaves).toBe(0);
    expect(gk.conceded).toBe(0);
    expect(gk.effectivenessPct).toBeNull();
    expect(gk.events).toEqual([]);
    expect(gk.timeline).toEqual([]);
  });

  // 13. un portero
  it("un portero con paradas y goles encajados calcula efectividad correctamente", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 1200 })],
      events: [
        event({ type: GoalieAction.SAVE_PARRY, playerIds: ["gk1"], timestamp: 1000 }),
        event({ type: GoalieAction.SAVE_CATCH, playerIds: ["gk1"], timestamp: 2000 }),
        event({ type: GoalieAction.GOAL_CONCEDED, playerIds: ["gk1"], timestamp: 3000 }),
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.saveParry).toBe(1);
    expect(gk.saveCatch).toBe(1);
    expect(gk.conceded).toBe(1);
    expect(gk.totalSaves).toBe(2);
    expect(gk.shotsFaced).toBe(3);
    expect(gk.effectivenessPct).toBe(67); // 2/3 redondeado
    expect(gk.timeline.length).toBe(3);
  });

  // 14. dos porteros
  it("dos porteros (local y rival, o dos titulares distintos) se devuelven ambos, ordenados por dorsal", () => {
    const md = matchData({
      players: [
        player({ id: "gk2", number: 12, individualTimeSeconds: 300 }),
        player({ id: "gk1", number: 1, individualTimeSeconds: 900 }),
      ],
    });
    const result = buildGoalkeeperReports(md);
    expect(result.length).toBe(2);
    expect(result.map((r) => r.number)).toEqual([1, 12]);
  });

  // 15. portero sustituido
  it("un portero sustituido (ya no isOnPitch, pero jugó minutos) sigue apareciendo en el informe", () => {
    const md = matchData({
      players: [player({ isOnPitch: false, individualTimeSeconds: 600 })],
    });
    const result = buildGoalkeeperReports(md);
    expect(result.length).toBe(1);
    expect(result[0].isOnPitch).toBe(false);
    expect(result[0].totSeconds).toBe(600);
  });

  it("un portero que nunca jugó (0 minutos, sin eventos) NO aparece en el informe", () => {
    const md = matchData({ players: [player({ individualTimeSeconds: 0, isOnPitch: false })] });
    expect(buildGoalkeeperReports(md)).toEqual([]);
  });

  it("un jugador de campo (no GOALKEEPER) nunca aparece en el informe de porteros", () => {
    const md = matchData({ players: [player({ role: Role.PLAYER, individualTimeSeconds: 1000 })] });
    expect(buildGoalkeeperReports(md)).toEqual([]);
  });

  // 10 / 11. partido legacy, arrays vacíos
  it("partido legacy/vacío (sin jugadores ni eventos) no lanza y devuelve array vacío", () => {
    expect(() => buildGoalkeeperReports(matchData())).not.toThrow();
    expect(buildGoalkeeperReports(matchData())).toEqual([]);
  });

  it("solo cuenta eventos propios del portero (playerIds.includes), no inventa criterios nuevos", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 500 })],
      events: [
        event({ type: GoalieAction.SAVE_PARRY, playerIds: ["otro-jugador"] }), // no es del portero
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.saveParry).toBe(0);
  });

  // A. SAVE_CATCH se reporta como Blocaje.
  it("A: un evento SAVE_CATCH incrementa gk.saveCatch y aparece en la cronología como 'Blocaje'", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 500 })],
      events: [event({ type: GoalieAction.SAVE_CATCH, playerIds: ["gk1"], timestamp: 1000 })],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.saveCatch).toBe(1);
    expect(gk.saveParry).toBe(0);
    expect(gk.timeline[0].type).toBe("Blocaje");
  });

  // B. SAVE_PARRY se reporta como Despeje/Rechace.
  it("B: un evento SAVE_PARRY incrementa gk.saveParry y aparece en la cronología como 'Despeje'", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 500 })],
      events: [event({ type: GoalieAction.SAVE_PARRY, playerIds: ["gk1"], timestamp: 1000 })],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.saveParry).toBe(1);
    expect(gk.saveCatch).toBe(0);
    expect(gk.timeline[0].type).toBe("Despeje");
  });
});

// ── FASE 3: COHERENCIA ENTRE CABECERA Y MAPA ──────────────────────────
describe("Paradas sin subtipo registrado", () => {
  it("un SHOT rival detenido cuenta como parada, no desaparece de las estadísticas", () => {
    // Este es el caso que producía "Blocajes 0 · Despejes 0" bajo un mapa
    // lleno de círculos verdes: el evento existe y el mapa lo pintaba, pero
    // la cabecera solo miraba los tipos GoalieAction.SAVE*.
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [
        event({
          type: ActionType.SHOT,
          playerIds: ["rival-1", "gk1"],
          destinationGrid: "G5",
          metadata: { isOpponent: true },
        }),
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.saveUnspecified).toBe(1);
    expect(gk.totalSaves).toBe(1);
    expect(gk.shotsFaced).toBe(1);
    expect(gk.effectivenessPct).toBe(100);
  });

  it("NO se inventa el subtipo de una parada genérica", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [
        event({ type: ActionType.SHOT, playerIds: ["gk1"], destinationGrid: "G2", metadata: { isOpponent: true } }),
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.saveCatch).toBe(0);
    expect(gk.saveParry).toBe(0);
    expect(gk.saveUnspecified).toBe(1);
  });

  it("un tiro fuera NO cuenta como parada", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [
        event({ type: ActionType.SHOT, playerIds: ["gk1"], destinationGrid: "OUT", metadata: { isOpponent: true } }),
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.totalSaves).toBe(0);
    expect(gk.shotsFaced).toBe(0);
  });

  it("un ActionType.GOAL del rival cuenta como gol encajado", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [
        event({ type: ActionType.GOAL, playerIds: ["rival-1", "gk1"], metadata: { isOpponent: true } }),
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.conceded).toBe(1);
    expect(gk.totalSaves).toBe(0);
  });

  it("el desglose de paradas suma siempre el total", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [
        event({ type: GoalieAction.SAVE_CATCH, playerIds: ["gk1"] }),
        event({ type: GoalieAction.SAVE_PARRY, playerIds: ["gk1"] }),
        event({ type: GoalieAction.SAVE, playerIds: ["gk1"] }),
        event({ type: ActionType.SHOT, playerIds: ["gk1"], destinationGrid: "G1", metadata: { isOpponent: true } }),
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.saveCatch + gk.saveParry + gk.saveGeneric + gk.saveUnspecified).toBe(gk.totalSaves);
    expect(gk.totalSaves).toBe(4);
  });

  it("declara cuántas intervenciones puede dibujar el mapa de portería", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [
        // Con zona: el mapa puede pintarla.
        event({ type: GoalieAction.SAVE_CATCH, playerIds: ["gk1"], destinationGrid: "G4" }),
        // Sin zona: cuenta en la cabecera pero el mapa no puede dibujarla,
        // y por eso la diferencia se explica en vez de esconderse.
        event({ type: GoalieAction.SAVE_PARRY, playerIds: ["gk1"] }),
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.totalSaves).toBe(2);
    expect(gk.mappedInterventions).toBe(1);
  });

  it("la cronología incluye las paradas sin subtipo, nombradas por lo que se sabe", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [
        event({ type: ActionType.SHOT, playerIds: ["gk1"], destinationGrid: "G5", timestamp: 1000, metadata: { isOpponent: true } }),
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.timeline).toHaveLength(1);
    expect(gk.timeline[0].type).toBe("Parada (sin subtipo registrado)");
  });
});
