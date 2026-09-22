/**
 * Faltas del partido por periodo.
 *
 * EL DEFECTO QUE FIJA
 * -------------------
 * La portada del informe imprimía `matchData.fouls` bajo la etiqueta
 * «Faltas», y ese contador se reinicia en el descanso porque su trabajo es
 * disparar la sanción de la 6ª falta. En CD MURCIA-PR7 decía 2 propias
 * mientras la columna de jugadores del mismo PDF sumaba 7: 5 en la primera
 * parte —donde se llegó al bonus— más 2 en la segunda.
 *
 * El contador no estaba mal. Lo que estaba mal era usarlo como total.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ActionType, GameEvent, GameState, GoalieAction, Period } from "../types/futsal";
import {
  applyFoulToCounters,
  emptyFoulSummary,
  foulsInPeriod,
  summarizeFouls,
} from "./foulModel";

let seq = 0;
function ev(
  type: ActionType | GoalieAction,
  period: Period,
  opts: { opponent?: boolean; playerIds?: string[]; metadata?: Record<string, any> } = {},
): GameEvent {
  return {
    id: `e${++seq}`,
    timestamp: 1000 * ++seq,
    wallClock: 1000 * seq,
    period,
    playerIds: opts.playerIds ?? [],
    type,
    gameState: GameState.FOUR_VS_FOUR,
    metadata: { isOpponent: !!opts.opponent, ...(opts.metadata ?? {}) },
  };
}

const falta = (period: Period, opponent = false, playerIds?: string[]) =>
  ev(ActionType.FOUL, period, { opponent, playerIds });

/**
 * El partido real, reducido a lo estadísticamente necesario:
 * 5 faltas propias en la 1ª parte, 2 en la 2ª, y las del rival repartidas.
 */
function partidoReal(): GameEvent[] {
  return [
    ...Array.from({ length: 5 }, (_, i) => falta(Period.FIRST, false, [`p${i + 1}`])),
    ...Array.from({ length: 2 }, (_, i) => falta(Period.SECOND, false, [`p${i + 1}`])),
    ...Array.from({ length: 3 }, () => falta(Period.FIRST, true)),
    ...Array.from({ length: 6 }, () => falta(Period.SECOND, true)),
  ];
}

// ── 1 / 2 · TOTALES Y PERIODOS ─────────────────────────────────────────

describe("1-2 · el total del partido es la suma de sus partes", () => {
  it("propias: 1ª parte 5 + 2ª parte 2 = 7", () => {
    const s = summarizeFouls(partidoReal());
    expect(foulsInPeriod(s, Period.FIRST, false)).toBe(5);
    expect(foulsInPeriod(s, Period.SECOND, false)).toBe(2);
    expect(s.total.team).toBe(7);
  });

  it("rival: 1ª parte 3 + 2ª parte 6 = 9", () => {
    const s = summarizeFouls(partidoReal());
    expect(foulsInPeriod(s, Period.FIRST, true)).toBe(3);
    expect(foulsInPeriod(s, Period.SECOND, true)).toBe(6);
    expect(s.total.opponent).toBe(9);
  });

  it("la suma de las partes SIEMPRE cuadra con el total", () => {
    const s = summarizeFouls(partidoReal());
    const sumaPropias = s.byPeriod.reduce((a, l) => a + l.team, 0);
    const sumaRival = s.byPeriod.reduce((a, l) => a + l.opponent, 0);
    expect(sumaPropias).toBe(s.total.team);
    expect(sumaRival).toBe(s.total.opponent);
  });

  it("las partes salen en orden y sin duplicarse", () => {
    const s = summarizeFouls(partidoReal());
    expect(s.byPeriod.map((l) => l.period)).toEqual([Period.FIRST, Period.SECOND]);
  });

  it("un bando no se cuela en el otro", () => {
    const s = summarizeFouls([falta(Period.FIRST, false), falta(Period.FIRST, true)]);
    expect(s.total).toEqual({ team: 1, opponent: 1 });
  });
});

// ── 3 · EL REINICIO DEL CONTADOR NO TOCA LOS EVENTOS ───────────────────

describe("3 · reiniciar el contador en vivo no borra las faltas de la 1ª parte", () => {
  it("el total derivado sobrevive al descanso", () => {
    // El contador se pone a cero al empezar la 2ª parte; los eventos no.
    let contador = { team: 0, opponent: 0 };
    const eventos: GameEvent[] = [];
    for (let i = 0; i < 5; i++) {
      const f = falta(Period.FIRST);
      eventos.push(f);
      contador = applyFoulToCounters(contador, f, 1);
    }
    expect(contador.team).toBe(5);

    contador = { team: 0, opponent: 0 }; // descanso
    for (let i = 0; i < 2; i++) {
      const f = falta(Period.SECOND);
      eventos.push(f);
      contador = applyFoulToCounters(contador, f, 1);
    }

    expect(contador.team).toBe(2); // el contador dice la 2ª parte, y hace bien
    expect(summarizeFouls(eventos).total.team).toBe(7); // el total dice el partido
  });
});

// ── 7 / 8 · FALTAS SIN JUGADOR ─────────────────────────────────────────

describe("7-8 · una falta sin jugador sigue siendo una falta del equipo", () => {
  it("cuenta para el equipo aunque no se atribuya a nadie", () => {
    const s = summarizeFouls([falta(Period.FIRST, false, []), falta(Period.FIRST, false, ["p1"])]);
    expect(s.total.team).toBe(2);
  });

  it("y una falta rival sin jugador cuenta para el rival", () => {
    const s = summarizeFouls([falta(Period.SECOND, true, [])]);
    expect(s.total).toEqual({ team: 0, opponent: 1 });
  });
});

// ── 9 / 10 · NADA SE INFIERE ───────────────────────────────────────────

describe("9-10 · el doble penalti y la falta son independientes", () => {
  it("dos goles de doble penalti NO crean ninguna falta", () => {
    const eventos = [
      ev(ActionType.GOAL, Period.FIRST, { opponent: true, metadata: { setPiece: "double_penalty" } }),
      ev(ActionType.GOAL, Period.FIRST, { opponent: true, metadata: { setPiece: "double_penalty" } }),
    ];
    expect(summarizeFouls(eventos).total).toEqual({ team: 0, opponent: 0 });
    expect(summarizeFouls(eventos).hasFoulEvents).toBe(false);
  });

  it("y las faltas no cambian porque existan esos goles", () => {
    const soloFaltas = [falta(Period.FIRST), falta(Period.SECOND)];
    const conGoles = [
      ...soloFaltas,
      ev(ActionType.GOAL, Period.FIRST, { opponent: true, metadata: { setPiece: "double_penalty" } }),
      ev(ActionType.GOAL, Period.FIRST, { opponent: true, metadata: { setPiece: "penalty" } }),
    ];
    expect(summarizeFouls(conGoles).total).toEqual(summarizeFouls(soloFaltas).total);
  });

  it("una falta no produce ningún tiro ni gol", () => {
    const eventos = [falta(Period.FIRST)];
    expect(eventos.filter((e) => e.type === ActionType.GOAL)).toHaveLength(0);
    expect(eventos.filter((e) => e.type === ActionType.SHOT)).toHaveLength(0);
  });
});

// ── 17 / 18 · TARJETAS ─────────────────────────────────────────────────

describe("17-18 · las tarjetas no son faltas", () => {
  it("una amarilla no cuenta como falta", () => {
    expect(summarizeFouls([ev(ActionType.YELLOW_CARD, Period.FIRST)]).total.team).toBe(0);
  });

  it("una segunda amarilla tampoco", () => {
    const dos = [ev(ActionType.YELLOW_CARD, Period.FIRST), ev(ActionType.YELLOW_CARD, Period.SECOND)];
    expect(summarizeFouls(dos).hasFoulEvents).toBe(false);
  });

  it("y una roja tampoco", () => {
    expect(summarizeFouls([ev(ActionType.RED_CARD, Period.FIRST)]).total.team).toBe(0);
  });
});

// ── 21 · PRÓRROGA ──────────────────────────────────────────────────────

describe("21-22 · la prórroga tiene su propia línea", () => {
  it("no se mezcla con la 2ª parte", () => {
    const s = summarizeFouls([
      falta(Period.FIRST),
      falta(Period.SECOND),
      falta(Period.OVERTIME_1),
      falta(Period.OVERTIME_1),
    ]);
    expect(s.byPeriod.map((l) => [l.period, l.team])).toEqual([
      [Period.FIRST, 1],
      [Period.SECOND, 1],
      [Period.OVERTIME_1, 2],
    ]);
  });

  it("pero SÍ entra en el total del partido", () => {
    // Un partido son todos sus periodos: el total no se queda en el 90.
    const s = summarizeFouls([falta(Period.FIRST), falta(Period.OVERTIME_1)]);
    expect(s.total.team).toBe(2);
  });

  it("un periodo sin faltas no genera una línea vacía", () => {
    const s = summarizeFouls([falta(Period.SECOND)]);
    expect(s.byPeriod).toHaveLength(1);
    expect(s.byPeriod[0].period).toBe(Period.SECOND);
  });
});

// ── 14 · SIN EVENTOS NO SE INVENTA NADA ────────────────────────────────

describe("14 · un partido sin faltas registradas no inventa un reparto", () => {
  it("devuelve el resumen vacío y lo declara", () => {
    expect(summarizeFouls([])).toEqual(emptyFoulSummary());
    expect(summarizeFouls([]).hasFoulEvents).toBe(false);
  });

  it("un partido con otros eventos pero sin faltas, igual", () => {
    const s = summarizeFouls([ev(ActionType.SHOT, Period.FIRST), ev(ActionType.GOAL, Period.SECOND)]);
    expect(s.hasFoulEvents).toBe(false);
    expect(s.byPeriod).toEqual([]);
  });

  it("no se consulta PlayerStats ni el contador en vivo", () => {
    const codigo = fs
      .readFileSync(path.resolve(__dirname, "foulModel.ts"), "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const derivacion = codigo.slice(codigo.indexOf("export function summarizeFouls"));
    for (const prohibido of ["stats", "matchData", "setPiece", "double_penalty", "Card"]) {
      expect(derivacion).not.toContain(prohibido);
    }
  });
});

// ── 16 · BORRAR UNA FALTA ──────────────────────────────────────────────

describe("16 · borrar una falta de la 1ª parte durante la 2ª", () => {
  it("el total derivado baja, aunque el contador ya no pueda reflejarlo", () => {
    const eventos = partidoReal();
    const primera = eventos.find((e) => e.period === Period.FIRST && !e.metadata?.isOpponent)!;
    const sinElla = eventos.filter((e) => e.id !== primera.id);

    expect(summarizeFouls(eventos).total.team).toBe(7);
    expect(summarizeFouls(sinElla).total.team).toBe(6);
    expect(foulsInPeriod(summarizeFouls(sinElla), Period.FIRST, false)).toBe(4);

    // El contador en vivo está en la 2ª parte y ya no puede restar una falta
    // de la 1ª: se queda en cero en vez de negativo. Por eso no sirve de total.
    expect(applyFoulToCounters({ team: 0, opponent: 0 }, primera, -1).team).toBe(0);
  });
});
