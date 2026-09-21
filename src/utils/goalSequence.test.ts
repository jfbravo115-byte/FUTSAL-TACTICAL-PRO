/**
 * Secuencia temporal de goles.
 *
 * «Marcamos y nos empataron enseguida» es una impresión hasta que alguien
 * pone el número al lado. Estos tests fijan ese número y, sobre todo, fijan
 * cuándo NO existe: entre partes distintas el reloj se reinicia y la
 * duración real de la parte anterior no se guarda en ningún sitio.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ActionType,
  GameEvent,
  GameState,
  GoalieAction,
  MatchData,
  Period,
  Player,
  Role,
} from "../types/futsal";
import { buildGoalSequence, formatMatchTime, goalSourceOf } from "./goalSequence";

let seq = 0;

const jugador = (o: Partial<Player> & { id: string }): Player => ({
  number: 7,
  name: o.id,
  role: Role.PLAYER,
  isOnPitch: true,
  plusMinus: 0,
  individualTimeSeconds: 0,
  isOpponent: false,
  stats: {
    goals: 0, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0,
    fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0,
    saves: 0, conceded: 0,
  },
  ...o,
});

const base = (events: GameEvent[], players: Player[] = []): MatchData => ({
  teamName: "Local",
  opponentName: "Rival",
  period: Period.SECOND,
  matchClock: 0,
  isClockRunning: false,
  fouls: { team: 0, opponent: 0 },
  timeoutsUsed: {
    team: { period1: false, period2: false },
    opponent: { period1: false, period2: false },
  },
  players,
  events,
});

function gol(
  timestamp: number,
  opts: {
    opponent?: boolean;
    setPiece?: string | null;
    period?: Period;
    playerIds?: string[];
    type?: ActionType | GoalieAction;
  } = {},
): GameEvent {
  const metadata: Record<string, any> = { isOpponent: !!opts.opponent };
  if (opts.setPiece !== null && opts.setPiece !== undefined) metadata.setPiece = opts.setPiece;
  return {
    id: `g${++seq}`,
    timestamp,
    wallClock: timestamp,
    period: opts.period ?? Period.FIRST,
    playerIds: opts.playerIds ?? [],
    type: opts.type ?? ActionType.GOAL,
    gameState: GameState.FOUR_VS_FOUR,
    destinationGrid: "G1",
    metadata,
  };
}

const M = (minutos: number, segundos = 0) => (minutos * 60 + segundos) * 1000;

// ── A / B · TIEMPOS DE RESPUESTA ───────────────────────────────────────

describe("A · el rival responde en 47 segundos", () => {
  const md = () =>
    base([
      gol(M(10, 0), { setPiece: "normal" }),
      gol(M(10, 47), { opponent: true, setPiece: "normal" }),
    ]);

  it("el segundo gol declara 47 s de respuesta rival", () => {
    const s = buildGoalSequence(md());
    expect(s).toHaveLength(2);
    expect(s[1].scoringTeam).toBe("opponent");
    expect(s[1].secondsSinceOpponentPreviousGoal).toBe(47);
    expect(s[1].secondsSincePreviousGoal).toBe(47);
  });

  it("el primero no tiene con qué compararse", () => {
    const s = buildGoalSequence(md());
    expect(s[0].secondsSincePreviousGoal).toBeNull();
    expect(s[0].secondsSinceOwnPreviousGoal).toBeNull();
    expect(s[0].secondsSinceOpponentPreviousGoal).toBeNull();
  });

  it("el marcador se acumula en orden", () => {
    const s = buildGoalSequence(md());
    expect(s.map((g) => `${g.scoreAfter.team}-${g.scoreAfter.opponent}`)).toEqual(["1-0", "1-1"]);
  });
});

describe("B · respondemos nosotros 70 segundos después", () => {
  it("el gol propio declara 70 s desde el gol rival", () => {
    const s = buildGoalSequence(
      base([
        gol(M(20, 0), { opponent: true, setPiece: "normal" }),
        gol(M(21, 10), { setPiece: "normal" }),
      ]),
    );
    expect(s[1].scoringTeam).toBe("team");
    expect(s[1].secondsSinceOpponentPreviousGoal).toBe(70);
  });

  it("dos goles seguidos del mismo equipo miden el suyo propio", () => {
    const s = buildGoalSequence(
      base([gol(M(5, 0), { setPiece: "normal" }), gol(M(6, 30), { setPiece: "normal" })]),
    );
    expect(s[1].secondsSinceOwnPreviousGoal).toBe(90);
    expect(s[1].secondsSinceOpponentPreviousGoal).toBeNull();
  });
});

// ── C / D · PENALTI Y DOBLE PENALTI ────────────────────────────────────

describe("C/D · la procedencia del gol se muestra tal como se registró", () => {
  it("un gol de penalti se declara Penalti", () => {
    const s = buildGoalSequence(base([gol(M(3), { setPiece: "penalty" })]));
    expect(s[0].source).toBe("penalty");
    expect(s[0].sourceLabel).toBe("Penalti");
  });

  it("un gol de doble penalti se declara Doble penalti", () => {
    const s = buildGoalSequence(base([gol(M(3), { setPiece: "double_penalty" })]));
    expect(s[0].source).toBe("double_penalty");
    expect(s[0].sourceLabel).toBe("Doble penalti");
  });

  it("falta y córner conservan la suya", () => {
    const s = buildGoalSequence(
      base([gol(M(1), { setPiece: "free_kick" }), gol(M(2), { setPiece: "corner" })]),
    );
    expect(s.map((g) => g.sourceLabel)).toEqual(["Falta", "Córner"]);
  });

  it("y una jugada declarada dice Jugada", () => {
    expect(buildGoalSequence(base([gol(M(1), { setPiece: "normal" })]))[0].sourceLabel).toBe("Jugada");
  });
});

// ── J / N · HISTÓRICOS ─────────────────────────────────────────────────

describe("J/N · un gol histórico sin procedencia queda como no registrado", () => {
  it("source es 'unknown', nunca 'normal'", () => {
    const s = buildGoalSequence(base([gol(M(3), { setPiece: null })]));
    expect(s[0].source).toBe("unknown");
    expect(s[0].sourceLabel).toBe("No registrado");
    expect(s[0].source).not.toBe("normal");
  });

  it("un valor irreconocible tampoco se convierte en jugada", () => {
    expect(goalSourceOf(gol(M(3), { setPiece: "saque_de_banda" }))).toBe("unknown");
  });

  it("no se infiere la procedencia por nada del evento", () => {
    const codigo = fs
      .readFileSync(path.resolve(__dirname, "goalSequence.ts"), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const prohibido of ["originGrid", "destinationGrid", "fouls", "FOUL", "CORNER"]) {
      expect(codigo).not.toContain(prohibido);
    }
    expect(codigo).toContain("setPieceOriginOf");
  });
});

// ── K · ENTRE PARTES NO HAY DELTA ──────────────────────────────────────

describe("K · el delta entre partes distintas no existe", () => {
  const md = () =>
    base([
      gol(M(19, 0), { setPiece: "normal" }),
      gol(M(0, 30), { opponent: true, setPiece: "normal", period: Period.SECOND }),
    ]);

  it("secondsSince... queda en null y no se aproxima", () => {
    const s = buildGoalSequence(md());
    expect(s[1].secondsSincePreviousGoal).toBeNull();
    expect(s[1].secondsSinceOpponentPreviousGoal).toBeNull();
  });

  it("pero el orden y el marcador siguen siendo correctos", () => {
    const s = buildGoalSequence(md());
    expect(s.map((g) => g.period)).toEqual([Period.FIRST, Period.SECOND]);
    expect(s[1].scoreAfter).toEqual({ team: 1, opponent: 1 });
  });

  it("no se usa wallClock para rellenar el hueco", () => {
    const codigo = fs
      .readFileSync(path.resolve(__dirname, "goalSequence.ts"), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(codigo).not.toContain("wallClock");
  });
});

// ── ORDEN Y ATRIBUCIÓN ─────────────────────────────────────────────────

describe("orden, goleador y goles encajados", () => {
  it("un gol de la 2ª parte al minuto 1 va DESPUÉS de uno de la 1ª al 19", () => {
    const s = buildGoalSequence(
      base([
        gol(M(1), { period: Period.SECOND, setPiece: "normal" }),
        gol(M(19), { period: Period.FIRST, setPiece: "normal" }),
      ]),
    );
    expect(s.map((g) => g.period)).toEqual([Period.FIRST, Period.SECOND]);
  });

  it("el goleador es del bando que marca, no el portero que encaja", () => {
    const s = buildGoalSequence(
      base(
        [gol(M(5), { playerIds: ["p7", "gkRival"], setPiece: "normal" })],
        [
          jugador({ id: "p7", name: "Carlos", number: 7 }),
          jugador({ id: "gkRival", name: "Portero rival", role: Role.GOALKEEPER, isOpponent: true }),
        ],
      ),
    );
    expect(s[0].playerName).toBe("Carlos");
    expect(s[0].playerNumber).toBe(7);
  });

  it("un GOAL_CONCEDED entra en la secuencia como gol del rival", () => {
    const s = buildGoalSequence(
      base([gol(M(5), { opponent: true, type: GoalieAction.GOAL_CONCEDED, setPiece: null })]),
    );
    expect(s).toHaveLength(1);
    expect(s[0].scoringTeam).toBe("opponent");
    expect(s[0].scoreAfter).toEqual({ team: 0, opponent: 1 });
  });

  it("un partido sin goles devuelve una secuencia vacía", () => {
    expect(buildGoalSequence(base([]))).toEqual([]);
  });

  it("el tiempo se imprime en mm:ss, nunca en milisegundos", () => {
    expect(formatMatchTime(M(12, 34))).toBe("12:34");
    expect(formatMatchTime(0)).toBe("00:00");
    expect(formatMatchTime(-5)).toBe("00:00");
  });
});
