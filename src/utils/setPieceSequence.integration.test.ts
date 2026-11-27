/**
 * DOBLE CONTEO: las jugadas a balón parado contra los agregados de siempre.
 *
 * Las pruebas del modelo comprueban qué eventos nacen de una jugada. Estas
 * comprueban algo más importante: que al pasar por los MISMOS agregados que
 * alimentan la pantalla, el informe y el PDF, cada evento cuenta UNA vez.
 *
 *   - un córner enlazado + tiro  = 1 córner y 1 tiro
 *   - una falta enlazada + gol   = 1 falta a favor y 1 gol, sin tiro extra
 *   - una banda enlazada + pérdida = 1 banda y 1 pérdida
 *   - una banda enlazada + gol   = 1 banda y 1 gol
 *   - el `sequenceId` no es una métrica
 *   - el gol en propia sigue fuera de tiros y de goleadores
 */
import { describe, expect, it } from "vitest";
import { ActionType, GameEvent, MatchData, Period, Player, Role } from "../types/futsal";
import { buildSequenceSeeds, newSetPieceSequenceId, SetPieceSequenceDraft } from "./setPieceSequence";
import { summarizeCorners } from "./cornerModel";
import { summarizeSetPieceRestarts } from "./setPieceModel";
import { summarizeTeamShots } from "./shotModel";
import { scoreOf, goalsFor } from "./goalModel";
import { generateMatchReport } from "../services/matchReportService";

let n = 0;

function eventosDe(draft: SetPieceSequenceDraft): GameEvent[] {
  const id = newSetPieceSequenceId();
  return buildSequenceSeeds(draft, id).map((s) => ({
    id: `e${++n}`,
    timestamp: 60_000 + n,
    wallClock: n,
    period: Period.FIRST,
    playerIds: s.playerId ? [s.playerId] : [],
    onPitchPlayerIds: ["l7", "l10", "r9"],
    type: s.type,
    gameState: "4vs4" as never,
    ...(s.originGrid ? { originGrid: s.originGrid } : {}),
    ...(s.destinationGrid ? { destinationGrid: s.destinationGrid } : {}),
    metadata: s.metadata as Record<string, unknown>,
  })) as GameEvent[];
}

const stats = () => ({
  goals: 0, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0,
  fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0, saves: 0, conceded: 0,
});

const jugador = (id: string, number: number, isOpponent = false, role = Role.PLAYER): Player => ({
  id, number, name: `J${number}`, role, isOnPitch: true, plusMinus: 0,
  individualTimeSeconds: 600, rotationTimeSeconds: 60, isOpponent, stats: stats(),
});

const partido = (events: GameEvent[]): MatchData => ({
  teamName: "CD MURCIA",
  opponentName: "JIMBEE",
  period: Period.FINISHED,
  matchClock: 0,
  isClockRunning: false,
  fouls: { team: 0, opponent: 0 },
  timeoutsUsed: {
    team: { period1: false, period2: false },
    opponent: { period1: false, period2: false },
  },
  players: [
    jugador("lgk", 1, false, Role.GOALKEEPER),
    jugador("l7", 7),
    jugador("l10", 10),
    jugador("rgk", 1, true, Role.GOALKEEPER),
    jugador("r9", 9, true),
  ],
  events,
});

const contar = (events: GameEvent[], type: ActionType) =>
  events.filter((e) => e.type === type).length;

describe("doble conteo · cada evento de la jugada cuenta UNA vez", () => {
  it("córner + tiro = 1 córner y 1 tiro", () => {
    const ev = eventosDe({
      root: "corner", isOpponent: false, modality: "prepared", outcome: "shot",
      cornerSide: "left", takerId: "l7", shot: { finisherId: "l10", destinationGrid: "G5" },
    });
    expect(summarizeCorners(ev).total).toBe(1);
    expect(summarizeTeamShots(ev, false).shots).toBe(1);
    expect(generateMatchReport(partido(ev)).teamTotals.shots).toBe(1);
  });

  it("falta a favor + gol = 1 falta y 1 gol, SIN tiro extra", () => {
    const ev = eventosDe({
      root: "free_kick", isOpponent: false, modality: "direct", outcome: "goal",
      originGrid: "Z4C", takerId: "l7", shot: { finisherId: "l7", destinationGrid: "G1" },
    });
    expect(contar(ev, ActionType.SET_PIECE)).toBe(1);
    // Un tiro directo NO es una «jugada de falta» (en corto): el agregado
    // existente no la cuenta, igual que antes de que hubiera jugadas.
    expect(summarizeSetPieceRestarts(ev).total).toBe(0);
    expect(goalsFor(ev, "team")).toBe(1);
    // El gol ES el remate: un intento, no dos.
    expect(summarizeTeamShots(ev, false).shots).toBe(1);
    expect(contar(ev, ActionType.SHOT)).toBe(0);
    const r = generateMatchReport(partido(ev));
    expect(r.score).toEqual({ team: 1, opponent: 0 });
    expect(r.teamTotals.shots).toBe(1);
  });

  it("una falta JUGADA en corto sí cuenta como jugada de falta, una vez", () => {
    const ev = eventosDe({
      root: "free_kick", isOpponent: false, modality: "prepared", outcome: "keep",
      originGrid: "Z3C", takerId: "l7",
    });
    expect(summarizeSetPieceRestarts(ev).total).toBe(1);
  });

  it("banda + pérdida = 1 banda y 1 pérdida", () => {
    const ev = eventosDe({
      root: "throw_in", isOpponent: false, modality: "quick", outcome: "loss",
      throwInSide: "left", throwInSector: "Z2", takerId: "l7",
      loss: { playerId: "l7", subType: "bad_pass" },
    });
    expect(contar(ev, ActionType.THROW_IN)).toBe(1);
    expect(contar(ev, ActionType.LOSS)).toBe(1);
    // La banda no es un tiro ni una pérdida por sí misma.
    expect(summarizeTeamShots(ev, false).shots).toBe(0);
  });

  it("banda + gol = 1 banda y 1 gol", () => {
    const ev = eventosDe({
      root: "throw_in", isOpponent: true, modality: "prepared", outcome: "goal",
      throwInSide: "right", throwInSector: "Z4", takerId: "r9",
      shot: { finisherId: "r9", destinationGrid: "G3" },
    });
    expect(contar(ev, ActionType.THROW_IN)).toBe(1);
    expect(goalsFor(ev, "opponent")).toBe(1);
    expect(summarizeTeamShots(ev, true).shots).toBe(1);
    expect(scoreOf(ev)).toEqual({ team: 0, opponent: 1 });
  });

  it("un saque de banda solo, sin remate, no es un tiro en ningún agregado", () => {
    const ev = eventosDe({
      root: "throw_in", isOpponent: false, modality: "quick", outcome: "keep",
      throwInSide: "left", throwInSector: "Z1",
    });
    expect(summarizeTeamShots(ev, false).shots).toBe(0);
    const r = generateMatchReport(partido(ev));
    expect(r.teamTotals.shots).toBe(0);
    expect(r.score).toEqual({ team: 0, opponent: 0 });
  });

  it("varias jugadas juntas suman exactamente sus piezas", () => {
    const ev = [
      ...eventosDe({ root: "corner", isOpponent: false, modality: "prepared", outcome: "shot",
        cornerSide: "left", shot: { finisherId: "l10", destinationGrid: "OUT" } }),
      ...eventosDe({ root: "corner", isOpponent: false, modality: "direct", outcome: "goal",
        cornerSide: "right", takerId: "l7", shot: { finisherId: "l7", destinationGrid: "G2" } }),
      ...eventosDe({ root: "throw_in", isOpponent: false, modality: "quick", outcome: "loss",
        throwInSide: "left", throwInSector: "Z3", loss: { subType: "intercepted" } }),
      ...eventosDe({ root: "free_kick", isOpponent: true, modality: "prepared", outcome: "blocked",
        originGrid: "Z3C" }),
    ];
    expect(summarizeCorners(ev).total).toBe(2);
    expect(summarizeTeamShots(ev, false).shots).toBe(2); // 1 tiro + 1 gol
    expect(goalsFor(ev, "team")).toBe(1);
    expect(contar(ev, ActionType.LOSS)).toBe(1);
    expect(summarizeSetPieceRestarts(ev, true).total).toBe(1);
    expect(summarizeTeamShots(ev, true).shots).toBe(0);
  });
});

describe("el sequenceId no es una métrica", () => {
  it("ningún total del informe cambia por llevar sequenceId", () => {
    const conJugada = eventosDe({
      root: "corner", isOpponent: false, modality: "prepared", outcome: "goal",
      cornerSide: "left", takerId: "l7", shot: { finisherId: "l10", destinationGrid: "G1" },
    });
    // Los MISMOS eventos sin ningún dato de jugada: como en un partido antiguo.
    const sinJugada = conJugada.map((e) => {
      const { sequenceId: _a, sequenceRole: _b, sequenceRoot: _c, sequenceOutcome: _d,
        setPieceModality: _e, takerId: _f, ...resto } = e.metadata as Record<string, unknown>;
      return { ...e, metadata: resto };
    }) as GameEvent[];
    const a = generateMatchReport(partido(conJugada));
    const b = generateMatchReport(partido(sinJugada));
    expect(a.score).toEqual(b.score);
    expect(a.teamTotals).toEqual(b.teamTotals);
    expect(a.goalSequence.length).toBe(b.goalSequence.length);
  });
});

describe("el gol en propia no se toca", () => {
  it("sigue fuera de tiros y de goleadores, con o sin jugadas alrededor", () => {
    const propia: GameEvent = {
      id: "propia",
      timestamp: 90_000,
      wallClock: 1,
      period: Period.FIRST,
      playerIds: ["r9"],
      type: ActionType.OWN_GOAL,
      gameState: "4vs4" as never,
      metadata: { isOpponent: true },
    } as GameEvent;
    const ev = [
      ...eventosDe({ root: "corner", isOpponent: false, modality: "prepared", outcome: "blocked",
        cornerSide: "left" }),
      propia,
    ];
    expect(scoreOf(ev)).toEqual({ team: 1, opponent: 0 });
    expect(summarizeTeamShots(ev, true).shots).toBe(0);
    expect(summarizeTeamShots(ev, false).shots).toBe(0);
    const r = generateMatchReport(partido(ev));
    expect(r.score).toEqual({ team: 1, opponent: 0 });
    expect(r.teamTotals.shots).toBe(0);
    expect(r.highlights.topScorer).toBeNull();
  });
});
