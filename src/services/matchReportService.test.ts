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

describe("generateMatchReport — tiros y destacados descriptivos", () => {
  it("cuenta como tiros totales goles + tiros a portería + tiros fuera", () => {
    const md = matchData({
      players: [player({ id: "p1", individualTimeSeconds: 600, stats: {
        goals: 1, assists: 0, steals: 2, interceptions: 1, losses: 1, errors: 1,
        fouls: 0, yellowCards: 0, redCards: 0, shots: 1, shotsOffTarget: 1, saves: 0, conceded: 0,
      } })],
      events: [
        event({ id: "g", type: ActionType.GOAL, playerIds: ["p1"], destinationGrid: "G1" }),
        event({ id: "s", type: ActionType.SHOT, playerIds: ["p1"], destinationGrid: "G2" }),
        event({ id: "o", type: ActionType.SHOT, playerIds: ["p1"], destinationGrid: "OUT" }),
      ],
    });
    const r = generateMatchReport(md);
    expect(r.teamTotals.shots).toBe(3);
    expect(r.teamTotals.shotsOnTarget).toBe(2);
    expect(r.teamTotals.shotsOffTarget).toBe(1);
    expect(r.teamTotals.shotAccuracyPct).toBe(67);
    expect(r.teamTotals.goalConversionPct).toBe(33);
    expect(r.playersUsed[0].attempts).toBe(3);
  });

  it("calcula balance recuperación-pérdida sin llamarlo posesión", () => {
    const md = matchData({
      players: [player({ id: "p1", individualTimeSeconds: 300, stats: {
        goals: 0, assists: 0, steals: 3, interceptions: 2, losses: 2, errors: 1,
        fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0, saves: 0, conceded: 0,
      } })],
    });
    const r = generateMatchReport(md);
    expect(r.teamTotals.recoveries).toBe(5);
    expect(r.teamTotals.lossesAndErrors).toBe(3);
    expect(r.teamTotals.recoveryLossBalance).toBe(2);
  });

  it("destaca TOT, goleador y recuperador solo si hay datos", () => {
    const p1 = player({ id: "p1", number: 7, name: "A", individualTimeSeconds: 500, stats: {
      goals: 0, assists: 0, steals: 1, interceptions: 0, losses: 0, errors: 0,
      fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0, saves: 0, conceded: 0,
    } });
    const p2 = player({ id: "p2", number: 8, name: "B", individualTimeSeconds: 700, stats: {
      goals: 2, assists: 0, steals: 3, interceptions: 1, losses: 0, errors: 0,
      fouls: 0, yellowCards: 0, redCards: 0, shots: 1, shotsOffTarget: 0, saves: 0, conceded: 0,
    } });
    const r = generateMatchReport(matchData({ players: [p1, p2] }));
    expect(r.highlights.topTot?.id).toBe("p2");
    expect(r.highlights.topScorer?.id).toBe("p2");
    expect(r.highlights.topRecoverer?.recoveries).toBe(4);
  });
});

// ── BALÓN PARADO EN EL RESUMEN DETERMINISTA ─────────────────────────────
//
// Este resumen es el que recibe Tactical Pro. Hasta ahora no mencionaba los
// córners, así que el modelo solo los veía en el JSON crudo.

import { formatMatchReportAsMarkdown } from "./matchReportService";

function corner(outcome?: "shot" | "play", opponent = false): GameEvent {
  return event({
    type: ActionType.CORNER,
    originGrid: "Z4L",
    metadata: { isOpponent: opponent, cornerSide: "left", ...(outcome ? { setPieceOutcome: outcome } : {}) },
  });
}

describe("balón parado en el informe", () => {
  const conBalonParado = () =>
    matchData({
      players: [player()],
      events: [
        corner("shot"),
        corner("shot"),
        corner("play"),
        corner(),
        corner("play", true),
        event({ type: ActionType.FOUL, playerIds: ["p1"], metadata: { isOpponent: false, setPieceOutcome: "shot" } }),
        event({ type: ActionType.FOUL, playerIds: ["p1"], metadata: { isOpponent: false } }),
      ],
    });

  it("desglosa los córners propios y separa al rival", () => {
    const r = generateMatchReport(conBalonParado());
    expect(r.setPieces.corners.team).toEqual({ total: 4, shot: 2, play: 1, unrecorded: 1 });
    expect(r.setPieces.corners.opponent).toEqual({ total: 1, shot: 0, play: 1, unrecorded: 0 });
  });

  it("las faltas NO se desglosan por ejecución: son infracciones", () => {
    const r = generateMatchReport(conBalonParado());
    expect((r.setPieces as any).fouls).toBeUndefined();
    // Ninguna clave del desglose habla de faltas: las que hay son el córner y
    // la jugada de falta, que es una reanudación a favor, no una infracción.
    expect(Object.keys(r.setPieces).filter((k) => /foul|falta/i.test(k))).toEqual([]);
  });

  it("el tiro de falta se cuenta en el TIRO, no en la falta cometida", () => {
    const md = matchData({
      players: [player()],
      events: [
        event({ type: ActionType.FOUL, playerIds: ["p1"], metadata: { isOpponent: false } }),
        event({ type: ActionType.SHOT, playerIds: ["p1"], destinationGrid: "G1", metadata: { isOpponent: false, setPiece: "free_kick" } }),
        event({ type: ActionType.SHOT, playerIds: ["p1"], destinationGrid: "G2", metadata: { isOpponent: false, setPiece: "corner" } }),
      ],
    });
    const r = generateMatchReport(md);
    expect(r.teamTotals.shotsFromFreeKick).toBe(1);
    expect(r.teamTotals.shotsFromCorner).toBe(1);
    // La falta cometida sigue siendo una infracción y no se mueve.
    expect(r.teamTotals.fouls).toBe(md.fouls.team);
  });

  it("el markdown que recibe Tactical Pro ya menciona los córners", () => {
    const md = formatMatchReportAsMarkdown(generateMatchReport(conBalonParado()));
    expect(md).toContain("Córners");
    expect(md).toContain("tiros directos 2");
    expect(md).toContain("sin registrar 1");
    expect(md).not.toMatch(/setPieceOutcome|CORNER|'shot'/);
  });

  it("el markdown distingue faltas cometidas de tiros procedentes de falta", () => {
    const partido = matchData({
      players: [player()],
      events: [
        event({ type: ActionType.FOUL, playerIds: ["p1"], metadata: { isOpponent: false } }),
        event({ type: ActionType.SHOT, playerIds: ["p1"], destinationGrid: "G1", metadata: { isOpponent: false, setPiece: "free_kick" } }),
      ],
    });
    const md = formatMatchReportAsMarkdown(generateMatchReport(partido));
    expect(md).toContain("**Faltas:**");           // infracciones
    expect(md).toContain("Tiros procedentes de balón parado"); // ejecución propia
    expect(md).not.toMatch(/[Ff]altas.*(tiro|jugada).*subtipo/);
  });

  it("un partido sin balón parado no redacta ninguna de las dos líneas", () => {
    const md = formatMatchReportAsMarkdown(generateMatchReport(matchData({ players: [player()], events: [] })));
    expect(md).not.toContain("Córners");
    expect(md).not.toContain("Tiros procedentes de balón parado");
  });

  it("un partido histórico declara sus córners como subtipo no registrado", () => {
    const r = generateMatchReport(matchData({ players: [player()], events: [corner(), corner()] }));
    expect(r.setPieces.corners.team).toEqual({ total: 2, shot: 0, play: 0, unrecorded: 2 });
  });

  it("el desglose nunca altera el contador reglamentario de faltas", () => {
    const md = conBalonParado();
    const r = generateMatchReport(md);
    expect(r.fouls.team).toBe(md.fouls.team);
    expect(r.teamTotals.fouls).toBe(md.fouls.team);
  });
});

describe("jugadas de falta en el resumen determinista", () => {
  const conJugadas = () =>
    matchData({
      players: [player()],
      events: [
        event({ type: ActionType.SET_PIECE, playerIds: ["p1"], originGrid: "Z2L", metadata: { isOpponent: false, setPieceOrigin: "free_kick", setPieceOutcome: "play" } }),
        event({ type: ActionType.SET_PIECE, metadata: { isOpponent: false, setPieceOrigin: "free_kick", setPieceOutcome: "play" } }),
        event({ type: ActionType.SET_PIECE, metadata: { isOpponent: true, setPieceOrigin: "free_kick", setPieceOutcome: "play" } }),
        event({ type: ActionType.FOUL, playerIds: ["p1"], metadata: { isOpponent: false } }),
        event({ type: ActionType.SHOT, playerIds: ["p1"], destinationGrid: "G1", metadata: { isOpponent: false, setPiece: "free_kick" } }),
      ],
    });

  it("las separa de las faltas cometidas y de los tiros", () => {
    const r = generateMatchReport(conJugadas());
    expect(r.setPieces.freeKickPlays.team).toEqual({ total: 2, located: 1, unlocated: 1 });
    expect(r.setPieces.freeKickPlays.opponent.total).toBe(1);
    expect(r.teamTotals.fouls).toBe(conJugadas().fouls.team);
    expect(r.teamTotals.shotsFromFreeKick).toBe(1);
  });

  it("Tactical Pro recibe las tres lecturas por separado", () => {
    const md = formatMatchReportAsMarkdown(generateMatchReport(conJugadas()));
    expect(md).toContain("**Faltas:**");
    expect(md).toContain("Jugadas de falta");
    expect(md).toContain("Tiros procedentes de balón parado");
    expect(md).toContain("No son faltas cometidas ni tiros.");
    expect(md).not.toMatch(/SET_PIECE|free_kick/);
  });

  it("una jugada de falta no cuenta como tiro", () => {
    const r = generateMatchReport(conJugadas());
    expect(r.teamTotals.shots).toBe(1);
  });
});

// ── FINALIZACIÓN INDIVIDUAL ────────────────────────────────────────────
//
// La línea de jugador salía de `PlayerStats`, que solo tiene dos cubos
// —`shots` y `shotsOffTarget`—. Un tiro bloqueado no cabe en ninguno y
// acababa sumando a `shots`, es decir presentándose como tiro a portería.
// Ahora se deriva de los eventos, que sí saben distinguirlo.

describe("las filas de jugador se derivan de los eventos, no de PlayerStats", () => {
  const P7 = "p7";
  const GK = "gkRival";

  /** El fixture del encargo: 8 intentos = 3 a portería + 3 fuera + 2 bloqueados. */
  const partidoDeP7 = () =>
    matchData({
      players: [
        player({
          id: P7,
          number: 7,
          individualTimeSeconds: 600,
          // Deliberadamente MENTIROSO. Si la línea leyera PlayerStats en vez
          // de los eventos, estos números aparecerían en el informe.
          stats: {
            goals: 1, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0,
            fouls: 0, yellowCards: 0, redCards: 0, shots: 99, shotsOffTarget: 99,
            saves: 0, conceded: 0,
          },
        }),
      ],
      events: [
        event({ type: ActionType.SHOT, playerIds: [P7, GK], destinationGrid: "G5",
                metadata: { goalieResponse: GoalieAction.SAVE, targetGoalkeeperId: GK } }),
        event({ type: ActionType.SHOT, playerIds: [P7, GK], destinationGrid: "G2",
                metadata: { goalieResponse: GoalieAction.SAVE_CATCH, targetGoalkeeperId: GK } }),
        event({ type: ActionType.GOAL, playerIds: [P7, GK], destinationGrid: "G1" }),
        event({ type: ActionType.SHOT, playerIds: [P7, GK], destinationGrid: "OUT" }),
        event({ type: ActionType.SHOT, playerIds: [P7, GK], destinationGrid: "OUT" }),
        event({ type: ActionType.SHOT, playerIds: [P7, GK], destinationGrid: "OUT" }),
        event({ type: ActionType.SHOT, playerIds: [P7, GK],
                metadata: { shotOutcome: "blocked", goalieResponse: "UNSPECIFIED" } }),
        event({ type: ActionType.SHOT, playerIds: [P7, GK],
                metadata: { shotOutcome: "blocked", goalieResponse: "UNSPECIFIED" } }),
      ],
    });

  const linea = () => generateMatchReport(partidoDeP7()).playersUsed.find((p) => p.id === P7)!;

  it("8 intentos = 3 a portería + 3 fuera + 2 bloqueados", () => {
    const p = linea();
    expect(p.attempts).toBe(8);
    expect(p.shotsOnTarget).toBe(3);
    expect(p.shotsOffTarget).toBe(3);
    expect(p.shotsBlocked).toBe(2);
  });

  it("los bloqueados no inflan los tiros a portería", () => {
    expect(linea().shotsOnTarget).not.toBe(5);
  });

  it("con todo clasificado, las tres categorías suman el total", () => {
    const p = linea();
    expect(p.shotsOnTarget + p.shotsOffTarget + p.shotsBlocked).toBe(p.attempts);
    expect(p.shotsUnrecorded).toBe(0);
  });

  it("ignora unas PlayerStats que dicen otra cosa", () => {
    expect(linea().attempts).not.toBe(199);
  });

  it("el total del equipo cuadra con la suma de los suyos", () => {
    const r = generateMatchReport(partidoDeP7());
    expect(r.teamTotals.shots).toBe(8);
    expect(r.teamTotals.shotsOnTarget).toBe(3);
    expect(r.teamTotals.shotsOffTarget).toBe(3);
    expect(r.teamTotals.shotsBlocked).toBe(2);
    expect(r.teamTotals.shotsUnknownTarget).toBe(0);
  });

  it("los bloqueados salen de «destino no registrado»: no es que no lo sepamos", () => {
    expect(generateMatchReport(partidoDeP7()).teamTotals.shotsUnknownTarget).toBe(0);
  });

  it("la precisión no cuenta los bloqueados en ninguno de los dos lados", () => {
    // 3 a portería sobre 3 + 3 fuera. Un bloqueo no dice si iba dentro.
    expect(generateMatchReport(partidoDeP7()).teamTotals.shotAccuracyPct).toBe(50);
  });
});

describe("un partido histórico sin shotOutcome conserva su interpretación", () => {
  it("OUT sigue siendo fuera y Gx sigue siendo a portería", () => {
    const md = matchData({
      players: [player({ id: "p1", individualTimeSeconds: 300 })],
      events: [
        event({ type: ActionType.SHOT, playerIds: ["p1"], destinationGrid: "G3" }),
        event({ type: ActionType.SHOT, playerIds: ["p1"], destinationGrid: "OUT" }),
        event({ type: ActionType.GOAL, playerIds: ["p1"], destinationGrid: "G8" }),
      ],
    });
    const p = generateMatchReport(md).playersUsed[0];
    expect(p.attempts).toBe(3);
    expect(p.shotsOnTarget).toBe(2);
    expect(p.shotsOffTarget).toBe(1);
    // No se infiere ningún bloqueo retroactivo.
    expect(p.shotsBlocked).toBe(0);
  });

  it("un tiro antiguo sin destino queda declarado, no repartido", () => {
    const md = matchData({
      players: [player({ id: "p1", individualTimeSeconds: 300 })],
      events: [event({ type: ActionType.SHOT, playerIds: ["p1"] })],
    });
    const p = generateMatchReport(md).playersUsed[0];
    expect(p.attempts).toBe(1);
    expect(p.shotsUnrecorded).toBe(1);
    expect(p.shotsOnTarget + p.shotsOffTarget + p.shotsBlocked).toBe(0);
  });
});

// ── SITUACIONES ESPECIALES Y SECUENCIA DE GOLES ────────────────────────
//
// El informe no decía nada de los cinco tiros registrados durante una
// superioridad, ni del tiempo que tardó el rival en responder a un gol. Las
// dos cosas estaban en los eventos; faltaba la capa que las lee.

describe("el informe incorpora las situaciones especiales", () => {
  const formacion = (timestamp: number, gameState: string, isOpponent = false) =>
    event({
      type: ActionType.FORMATION_CHANGE,
      timestamp,
      gameState: gameState as any,
      metadata: { isOpponent },
      scoreAtEvent: { team: 0, opponent: 0 },
    });

  const md = () =>
    matchData({
      players: [player({ id: "p1", number: 7, name: "Carlos", individualTimeSeconds: 600 })],
      events: [
        formacion(60_000, "Superioridad"),
        event({ type: ActionType.SHOT, timestamp: 70_000, playerIds: ["p1"], destinationGrid: "G5" }),
        event({ type: ActionType.SHOT, timestamp: 80_000, playerIds: ["p1"], destinationGrid: "G2" }),
        event({ type: ActionType.GOAL, timestamp: 90_000, playerIds: ["p1"], destinationGrid: "G1",
                metadata: { setPiece: "penalty" } }),
        event({ type: ActionType.SHOT, timestamp: 100_000, playerIds: ["p1"], destinationGrid: "OUT" }),
        event({ type: ActionType.SHOT, timestamp: 110_000, playerIds: ["p1"],
                metadata: { shotOutcome: "blocked", goalieResponse: "UNSPECIFIED" } }),
        formacion(162_000, "4vs4"),
      ],
    });

  it("publica las ventanas, agrupadas y con etiqueta humana", () => {
    const r = generateMatchReport(md());
    expect(r.matchContexts).toHaveLength(1);
    expect(r.matchContextGroups[0].label).toBe("Superioridad por expulsión rival");
  });

  it("con los cinco tiros de la ventana: 5 · 3 · 1 · 1 · 1", () => {
    const t = generateMatchReport(md()).matchContextGroups[0].tally;
    expect([t.shots, t.onTarget, t.offTarget, t.blocked, t.goals]).toEqual([5, 3, 1, 1, 1]);
  });

  it("el markdown imprime la sección con la duración real", () => {
    const texto = formatMatchReportAsMarkdown(generateMatchReport(md()));
    expect(texto).toContain("## Situaciones especiales");
    expect(texto).toContain("Superioridad por expulsión rival");
    expect(texto).toContain("01:42");
    expect(texto).toContain("Tiros **5**");
  });

  it("nunca imprime el código interno del estado", () => {
    const texto = formatMatchReportAsMarkdown(generateMatchReport(md()));
    for (const codigo of ["SUPERIORITY", "PJ_ATTACK", "FORMATION_CHANGE", "GameState"]) {
      expect(texto).not.toContain(codigo);
    }
  });

  it("una ventana sin cierre dice que la duración no está disponible", () => {
    const sinCierre = matchData({
      players: [player({ id: "p1", individualTimeSeconds: 600 })],
      events: [
        formacion(60_000, "Superioridad"),
        event({ type: ActionType.SHOT, timestamp: 70_000, playerIds: ["p1"], destinationGrid: "G5" }),
      ],
    });
    const texto = formatMatchReportAsMarkdown(generateMatchReport(sinCierre));
    expect(texto).toContain("duración no disponible");
  });

  it("un partido sin declaraciones no imprime la sección", () => {
    const simple = matchData({
      players: [player({ id: "p1", individualTimeSeconds: 600 })],
      events: [event({ type: ActionType.SHOT, playerIds: ["p1"], destinationGrid: "G5" })],
    });
    expect(formatMatchReportAsMarkdown(generateMatchReport(simple))).not.toContain(
      "## Situaciones especiales",
    );
  });
});

describe("el informe incorpora la secuencia de goles", () => {
  const md = () =>
    matchData({
      players: [player({ id: "p1", number: 7, name: "Carlos", individualTimeSeconds: 600 })],
      events: [
        event({ type: ActionType.GOAL, timestamp: 600_000, playerIds: ["p1"],
                destinationGrid: "G1", metadata: { setPiece: "penalty" } }),
        event({ type: ActionType.GOAL, timestamp: 647_000, destinationGrid: "G3",
                metadata: { isOpponent: true } }),
      ],
    });

  it("publica los goles con procedencia y respuesta", () => {
    const s = generateMatchReport(md()).goalSequence;
    expect(s).toHaveLength(2);
    expect(s[0].sourceLabel).toBe("Penalti");
    expect(s[1].secondsSinceOpponentPreviousGoal).toBe(47);
  });

  it("el markdown lo escribe en lenguaje de cuerpo técnico", () => {
    const texto = formatMatchReportAsMarkdown(generateMatchReport(md()));
    expect(texto).toContain("## Secuencia de goles");
    expect(texto).toContain("Penalti");
    expect(texto).toContain("Respuesta rival: 47 s");
  });

  it("un gol sin procedencia registrada dice 'No registrado'", () => {
    const historico = matchData({
      players: [player({ id: "p1", individualTimeSeconds: 600 })],
      events: [event({ type: ActionType.GOAL, timestamp: 1000, playerIds: ["p1"], destinationGrid: "G1" })],
    });
    const r = generateMatchReport(historico);
    expect(r.goalSequence[0].source).toBe("unknown");
    expect(formatMatchReportAsMarkdown(r)).toContain("No registrado");
  });
});

describe("L · los eventos relevantes salen en orden cronológico real", () => {
  it("un gol de la 1ª al 19 va antes que uno de la 2ª al 1", () => {
    const md = matchData({
      players: [player({ id: "p1", individualTimeSeconds: 600 })],
      events: [
        event({ id: "segunda", type: ActionType.GOAL, timestamp: 60_000,
                period: Period.SECOND, playerIds: ["p1"], destinationGrid: "G1" }),
        event({ id: "primera", type: ActionType.GOAL, timestamp: 19 * 60_000,
                period: Period.FIRST, playerIds: ["p1"], destinationGrid: "G1" }),
      ],
    });
    const r = generateMatchReport(md);
    expect(r.relevantEvents.map((e) => e.period)).toEqual([Period.FIRST, Period.SECOND]);
    expect(r.goalSequence.map((g) => g.period)).toEqual([Period.FIRST, Period.SECOND]);
  });
});
