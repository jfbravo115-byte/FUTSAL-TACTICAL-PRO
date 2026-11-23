/**
 * Las cifras de balón parado, contra los agregados de siempre.
 *
 * El fixture reproduce cómo guarda la CAPTURA REAL un tiro o un gol: con el
 * portero que lo encara dentro de `playerIds` y en `targetGoalkeeperId`. Un
 * fixture más limpio que la realidad habría dejado pasar exactamente el
 * defecto que estas pruebas encontraron: un remate sin finalizador
 * identificado se atribuía al portero rival.
 */
import { describe, expect, it } from "vitest";
import { ActionType, GameEvent, MatchData, Period, Player, Role } from "../types/futsal";
import {
  SetPieceSequenceDraft,
  buildSequenceSeeds,
  newSetPieceSequenceId,
} from "./setPieceSequence";
import {
  setPieceRootKindOf,
  setPieceStatsViolations,
  summarizeSetPieceSequences,
} from "./setPieceStats";
import { summarizeCorners } from "./cornerModel";
import { summarizeTeamShots } from "./shotModel";
import { goalsFor, scoreOf } from "./goalModel";
import { generateMatchReport } from "../services/matchReportService";

let n = 0;
const PORTERO = { team: "lgk", opponent: "rgk" };

/** Como `buildActionEvent`: el portero objetivo viaja en todo tiro o gol. */
function jugada(draft: SetPieceSequenceDraft): GameEvent[] {
  const id = newSetPieceSequenceId();
  const portero = draft.isOpponent ? PORTERO.team : PORTERO.opponent;
  return buildSequenceSeeds(draft, id).map((s) => {
    const remate = s.type === ActionType.SHOT || s.type === ActionType.GOAL;
    const ids = s.playerId ? [s.playerId] : [];
    if (remate && !ids.includes(portero)) ids.push(portero);
    return {
      id: `e${++n}`,
      timestamp: 60_000 + n,
      wallClock: n,
      period: Period.FIRST,
      playerIds: ids,
      onPitchPlayerIds: ["lgk", "l7", "l10", "rgk", "r9"],
      type: s.type,
      gameState: "4vs4" as never,
      ...(s.originGrid ? { originGrid: s.originGrid } : {}),
      ...(s.destinationGrid ? { destinationGrid: s.destinationGrid } : {}),
      metadata: {
        ...(s.metadata as Record<string, unknown>),
        ...(remate ? { targetGoalkeeperId: portero } : {}),
      },
    } as GameEvent;
  });
}

const suelto = (o: Partial<GameEvent> & { type: ActionType }): GameEvent =>
  ({
    id: `s${++n}`,
    timestamp: 1_000 + n,
    wallClock: n,
    period: Period.FIRST,
    playerIds: [],
    gameState: "4vs4" as never,
    metadata: { isOpponent: false },
    ...o,
  }) as GameEvent;

const stats = () => ({
  goals: 0, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0,
  fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0, saves: 0, conceded: 0,
});
const J = (id: string, number: number, isOpponent = false, role = Role.PLAYER): Player => ({
  id, number, name: `J${number}`, role, isOnPitch: true, plusMinus: 0,
  individualTimeSeconds: 600, rotationTimeSeconds: 60, isOpponent, stats: stats(),
});
const partido = (events: GameEvent[]): MatchData => ({
  teamName: "CD MURCIA", opponentName: "JIMBEE", period: Period.FINISHED,
  matchClock: 0, isClockRunning: false, fouls: { team: 0, opponent: 0 },
  timeoutsUsed: { team: { period1: false, period2: false }, opponent: { period1: false, period2: false } },
  players: [J("lgk", 1, false, Role.GOALKEEPER), J("l7", 7), J("l10", 10),
    J("rgk", 1, true, Role.GOALKEEPER), J("r9", 9, true)],
  events,
});

// ── HISTÓRICO ───────────────────────────────────────────────────────────

describe("partido histórico sin jugadas registradas", () => {
  const historico = [
    suelto({ type: ActionType.CORNER, metadata: { isOpponent: false, cornerSide: "left", setPieceOutcome: "shot" } }),
    suelto({ type: ActionType.CORNER, metadata: { isOpponent: false } }),
    suelto({ type: ActionType.SET_PIECE, metadata: { isOpponent: false, setPieceOrigin: "free_kick", setPieceOutcome: "play" } }),
    suelto({ type: ActionType.SHOT, playerIds: ["l7"], metadata: { isOpponent: false, setPiece: "corner" } }),
  ];
  const s = summarizeSetPieceSequences(historico).team;

  it("los totales cuentan lo que hubo, igual que el agregado de siempre", () => {
    expect(s.corner.total).toBe(2);
    expect(s.corner.total).toBe(summarizeCorners(historico).total);
    expect(s.freeKick.total).toBe(1);
    expect(s.corner.bySide).toEqual({ left: 1, right: 0, unknown: 1 });
  });

  it("pero no se les inventa modalidad, desenlace, sacador ni proporción", () => {
    expect(s.corner.recorded).toBe(0);
    expect(s.corner.unrecorded).toBe(2);
    expect(s.corner.byModality).toEqual({});
    expect(Object.values(s.corner.outcomes).every((v) => v === 0)).toBe(true);
    expect(s.corner.takers).toEqual([]);
    expect(s.corner.attemptRate).toBeNull();
    expect(s.corner.goalRate).toBeNull();
  });

  it("y el tiro histórico «desde córner» no se emparenta con ningún córner", () => {
    expect(s.corner.attempts).toBe(0);
  });
});

// ── CÓRNER ──────────────────────────────────────────────────────────────

describe("córner", () => {
  it("córner + tiro: 1 córner aquí y 1 tiro en shotModel", () => {
    const ev = jugada({ root: "corner", isOpponent: false, modality: "prepared", outcome: "shot",
      cornerSide: "left", takerId: "l7", shot: { finisherId: "l10", destinationGrid: "G5" } });
    const s = summarizeSetPieceSequences(ev).team.corner;
    expect(s.total).toBe(1);
    expect(s.outcomes.shot).toBe(1);
    expect(s.attempts).toBe(1);
    expect(s.goals).toBe(0);
    expect(summarizeTeamShots(ev, false).shots).toBe(1);
    expect(setPieceStatsViolations(ev)).toEqual([]);
  });

  it("córner + gol: 1 córner, 1 gol, 1 remate, y el gol lo cuenta goalModel", () => {
    const ev = jugada({ root: "corner", isOpponent: false, modality: "direct", outcome: "goal",
      cornerSide: "right", takerId: "l7", shot: { finisherId: "l7", destinationGrid: "G1" } });
    const s = summarizeSetPieceSequences(ev).team.corner;
    expect(s.outcomes.goal).toBe(1);
    expect(s.goals).toBe(goalsFor(ev, "team"));
    expect(s.attempts).toBe(1);
    expect(s.byModality).toEqual({ direct: 1 });
    expect(s.bySide).toEqual({ left: 0, right: 1, unknown: 0 });
    expect(summarizeTeamShots(ev, false).shots).toBe(1);
  });
});

// ── FALTA A FAVOR ───────────────────────────────────────────────────────

describe("falta a favor", () => {
  it("falta + tiro", () => {
    const ev = jugada({ root: "free_kick", isOpponent: false, modality: "direct", outcome: "shot",
      originGrid: "Z4C", takerId: "l7", shot: { finisherId: "l7", destinationGrid: "OUT" } });
    const s = summarizeSetPieceSequences(ev).team.freeKick;
    expect(s.total).toBe(1);
    expect(s.attempts).toBe(1);
    expect(s.byZone).toEqual({ Z4C: 1 });
    expect(summarizeTeamShots(ev, false).shots).toBe(1);
  });

  it("falta + gol: 1 falta y 1 gol, nunca gol + tiro", () => {
    const ev = jugada({ root: "free_kick", isOpponent: false, modality: "direct", outcome: "goal",
      originGrid: "Z4L", takerId: "l7", shot: { finisherId: "l7", destinationGrid: "G2" } });
    const s = summarizeSetPieceSequences(ev).team.freeKick;
    expect(s.goals).toBe(1);
    expect(s.attempts).toBe(1);
    expect(ev.filter((e) => e.type === ActionType.SHOT)).toHaveLength(0);
    expect(scoreOf(ev)).toEqual({ team: 1, opponent: 0 });
  });

  it("una falta sin zona va a `unknown`, sin inventarle una", () => {
    const ev = jugada({ root: "free_kick", isOpponent: false, modality: "prepared", outcome: "keep" });
    expect(summarizeSetPieceSequences(ev).team.freeKick.byZone).toEqual({ unknown: 1 });
  });
});

// ── SAQUE DE BANDA ──────────────────────────────────────────────────────

describe("saque de banda", () => {
  const banda = (o: Partial<SetPieceSequenceDraft>) =>
    jugada({ root: "throw_in", isOpponent: false, modality: "quick", outcome: "keep",
      throwInSide: "left", throwInSector: "Z2", ...o } as SetPieceSequenceDraft);

  it("banda + conserva", () => {
    const s = summarizeSetPieceSequences(banda({})).team.throwIn;
    expect(s.total).toBe(1);
    expect(s.outcomes.keep).toBe(1);
    expect(s.attempts).toBe(0);
    expect(s.byModality).toEqual({ quick: 1 });
  });

  it("banda + pérdida: 1 banda y 1 pérdida", () => {
    const ev = banda({ outcome: "loss", takerId: "l7", loss: { playerId: "l7", subType: "bad_pass" } });
    const s = summarizeSetPieceSequences(ev).team.throwIn;
    expect(s.losses).toBe(1);
    // UNA pérdida enlazada. El total de pérdidas del informe no se comprueba
    // aquí: sale de las estadísticas de jugador que escribe la captura al
    // aplicar el evento, no de los eventos, y este fixture no las rellena.
    expect(ev.filter((e) => e.type === ActionType.LOSS)).toHaveLength(1);
    expect(ev.find((e) => e.type === ActionType.LOSS)!.playerIds).toEqual(["l7"]);
  });

  it("banda + tiro", () => {
    const ev = banda({ modality: "prepared", outcome: "shot", throwInSector: "Z4",
      takerId: "l7", shot: { finisherId: "l10", destinationGrid: "G8" } });
    const s = summarizeSetPieceSequences(ev).team.throwIn;
    expect(s.attempts).toBe(1);
    expect(summarizeTeamShots(ev, false).shots).toBe(1);
  });

  it("banda + gol: 1 banda y 1 gol", () => {
    const ev = banda({ modality: "prepared", outcome: "goal", throwInSector: "Z4",
      takerId: "l7", shot: { finisherId: "l10", destinationGrid: "G3" } });
    const s = summarizeSetPieceSequences(ev).team.throwIn;
    expect(s.goals).toBe(1);
    expect(s.attempts).toBe(1);
    expect(goalsFor(ev, "team")).toBe(1);
  });

  it("banda encadenada: cada banda es una reanudación, y ninguna crea evento extra", () => {
    const ev = [
      ...banda({ outcome: "new_set_piece" }),
      ...banda({ outcome: "new_set_piece", throwInSector: "Z3" }),
      ...banda({ outcome: "keep", throwInSector: "Z3" }),
    ];
    const s = summarizeSetPieceSequences(ev).team.throwIn;
    expect(s.total).toBe(3);
    expect(s.outcomes.new_set_piece).toBe(2);
    expect(ev).toHaveLength(3);
    expect(s.bySector).toEqual({ Z1: 0, Z2: 1, Z3: 2, Z4: 0 });
  });

  it("banda tras despeje: se cuenta y no inventa pérdida ni recuperación", () => {
    const ev = banda({ fromDeflectEventId: "desp-1" });
    const s = summarizeSetPieceSequences(ev).team.throwIn;
    expect(s.afterDeflect).toBe(1);
    expect(ev.some((e) => [ActionType.LOSS, ActionType.STEAL, ActionType.INTERCEPTION].includes(e.type as ActionType))).toBe(false);
  });

  it("banda y sector van también en la mini pista", () => {
    const ev = [...banda({ throwInSide: "right", throwInSector: "Z1" }), ...banda({})];
    expect(summarizeSetPieceSequences(ev).team.throwIn.byCell).toEqual({ "right-Z1": 1, "left-Z2": 1 });
  });
});

// ── QUIÉN ───────────────────────────────────────────────────────────────

describe("sacadores y finalizadores", () => {
  it("sacador distinto del finalizador, cada uno en su lista", () => {
    const ev = jugada({ root: "corner", isOpponent: false, modality: "prepared", outcome: "goal",
      cornerSide: "left", takerId: "l7", shot: { finisherId: "l10" } });
    const s = summarizeSetPieceSequences(ev).team.corner;
    expect(s.takers).toEqual([{ playerId: "l7", count: 1 }]);
    expect(s.finishers).toEqual([{ playerId: "l10", count: 1 }]);
  });

  it("un finalizador sin identificar NO se atribuye al portero que encara el remate", () => {
    const ev = jugada({ root: "corner", isOpponent: false, modality: "prepared", outcome: "shot",
      cornerSide: "left", shot: {} });
    // Así lo guarda la captura: el portero rival dentro de playerIds.
    expect(ev[1].playerIds).toEqual(["rgk"]);
    const s = summarizeSetPieceSequences(ev).team.corner;
    expect(s.finishers).toEqual([]);
    expect(s.unidentifiedFinishers).toBe(1);
    expect(s.unidentifiedTakers).toBe(1);
  });

  it("se ordenan por veces, de más a menos", () => {
    const ev = [
      ...jugada({ root: "corner", isOpponent: false, modality: "direct", outcome: "keep", cornerSide: "left", takerId: "l10" }),
      ...jugada({ root: "corner", isOpponent: false, modality: "direct", outcome: "keep", cornerSide: "left", takerId: "l7" }),
      ...jugada({ root: "corner", isOpponent: false, modality: "direct", outcome: "keep", cornerSide: "left", takerId: "l7" }),
    ];
    expect(summarizeSetPieceSequences(ev).team.corner.takers.map((t) => t.playerId)).toEqual(["l7", "l10"]);
  });
});

// ── LOCAL Y RIVAL ───────────────────────────────────────────────────────

describe("nuestro equipo y el rival no se mezclan", () => {
  it("cada jugada cuenta en su bando y solo en él", () => {
    const ev = [
      ...jugada({ root: "corner", isOpponent: false, modality: "direct", outcome: "keep", cornerSide: "left" }),
      ...jugada({ root: "throw_in", isOpponent: true, modality: "quick", outcome: "goal",
        throwInSide: "right", throwInSector: "Z4", takerId: "r9", shot: { finisherId: "r9" } }),
    ];
    const s = summarizeSetPieceSequences(ev);
    expect(s.team.corner.total).toBe(1);
    expect(s.opponent.corner.total).toBe(0);
    expect(s.opponent.throwIn.total).toBe(1);
    expect(s.opponent.throwIn.goals).toBe(1);
    expect(s.team.throwIn.total).toBe(0);
    expect(s.team.throwIn.goals).toBe(0);
  });
});

// ── GOL EN PROPIA ───────────────────────────────────────────────────────

describe("el gol en propia", () => {
  it("no es una reanudación ni el gol de ninguna jugada", () => {
    const propia = suelto({ type: ActionType.OWN_GOAL, playerIds: ["r9"], metadata: { isOpponent: true } });
    const ev = [
      ...jugada({ root: "corner", isOpponent: false, modality: "prepared", outcome: "blocked", cornerSide: "left" }),
      propia,
    ];
    expect(setPieceRootKindOf(propia)).toBeNull();
    const s = summarizeSetPieceSequences(ev).team.corner;
    expect(s.goals).toBe(0);
    // Pero el marcador sí lo cuenta, y lo cuenta goalModel.
    expect(scoreOf(ev)).toEqual({ team: 1, opponent: 0 });
  });
});

// ── DOBLE CONTEO ────────────────────────────────────────────────────────

describe("ausencia de doble conteo", () => {
  const ev = [
    ...jugada({ root: "corner", isOpponent: false, modality: "prepared", outcome: "goal",
      cornerSide: "left", takerId: "l7", shot: { finisherId: "l10", destinationGrid: "G1" } }),
    ...jugada({ root: "free_kick", isOpponent: false, modality: "direct", outcome: "shot",
      originGrid: "Z4C", takerId: "l7", shot: { finisherId: "l7", destinationGrid: "G5" } }),
    ...jugada({ root: "throw_in", isOpponent: false, modality: "quick", outcome: "loss",
      throwInSide: "left", throwInSector: "Z2", takerId: "l10", loss: { subType: "intercepted" } }),
    ...jugada({ root: "throw_in", isOpponent: true, modality: "prepared", outcome: "goal",
      throwInSide: "right", throwInSector: "Z4", takerId: "r9", shot: { finisherId: "r9" } }),
    suelto({ type: ActionType.SHOT, playerIds: ["l10"], metadata: { isOpponent: false } }),
  ];

  it("los remates originados nunca superan los remates totales del bando", () => {
    const s = summarizeSetPieceSequences(ev);
    const originados =
      s.team.corner.attempts + s.team.freeKick.attempts + s.team.throwIn.attempts;
    expect(originados).toBe(2);
    expect(summarizeTeamShots(ev, false).shots).toBe(3); // 2 originados + 1 suelto
  });

  it("los goles originados cuadran con el marcador, por goalModel", () => {
    const s = summarizeSetPieceSequences(ev);
    expect(s.team.corner.goals + s.team.freeKick.goals + s.team.throwIn.goals).toBe(goalsFor(ev, "team"));
    expect(s.opponent.throwIn.goals).toBe(goalsFor(ev, "opponent"));
  });

  it("el informe cuenta cada evento una vez", () => {
    const r = generateMatchReport(partido(ev));
    expect(r.score).toEqual({ team: 1, opponent: 1 });
    expect(r.teamTotals.shots).toBe(3);
    // Las pérdidas del informe salen de las estadísticas de jugador (ver la
    // prueba de banda + pérdida); a nivel de evento hay exactamente una.
    expect(ev.filter((e) => e.type === ActionType.LOSS)).toHaveLength(1);
  });

  it("y ninguna invariante se rompe", () => {
    expect(setPieceStatsViolations(ev)).toEqual([]);
  });

  it("las invariantes detectan una jugada con dos remates", () => {
    const roto = [...ev, { ...ev[0], id: "dup", type: ActionType.SHOT } as GameEvent];
    expect(setPieceStatsViolations(roto).some((f) => f.includes("remates en una jugada"))).toBe(true);
  });
});
