/**
 * Tactical Pro y las jugadas a balón parado.
 *
 * Solo el payload DETERMINISTA: lo que se construiría para enviar. Aquí no
 * se llama a nadie; una prueba lo comprueba espiando `fetch`.
 *
 * Lo que se protege: que el modelo reciba córner, faltas y bandas por bando,
 * con lados, sectores, modalidad, desenlaces, sacadores, finalizadores y
 * cada jugada; y que el glosario le impida sumar dos veces la raíz y el
 * desenlace, tomar una banda por un tiro o volver a sumar un gol que ya está
 * en el marcador.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ActionType, GameEvent, GoalieAction, MatchData, Period, Player, Role } from "../types/futsal";
import { buildSequenceSeeds, newSetPieceSequenceId, SetPieceSequenceDraft } from "../utils/setPieceSequence";
import { summarizeSetPieceSequences } from "../utils/setPieceStats";
import { TACTICAL_PRO_GLOSSARY, buildTacticalProPayload } from "./tacticalProPayload";

let n = 0;
const PORTERO = { team: "lgk", opponent: "rgk" };
function jugada(draft: SetPieceSequenceDraft, t: number): GameEvent[] {
  const id = newSetPieceSequenceId();
  const portero = draft.isOpponent ? PORTERO.team : PORTERO.opponent;
  return buildSequenceSeeds(draft, id).map((s) => {
    const remate = s.type === ActionType.SHOT || s.type === ActionType.GOAL;
    const ids = s.playerId ? [s.playerId] : [];
    if (remate) ids.push(portero);
    return {
      id: `e${++n}`, timestamp: t, wallClock: t, period: Period.FIRST, playerIds: ids,
      type: s.type, gameState: "4vs4" as never,
      ...(s.originGrid ? { originGrid: s.originGrid } : {}),
      ...(s.destinationGrid ? { destinationGrid: s.destinationGrid } : {}),
      metadata: { ...(s.metadata as Record<string, unknown>), ...(remate ? { targetGoalkeeperId: portero } : {}) },
    } as GameEvent;
  });
}
const st = () => ({ goals: 0, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0,
  fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0, saves: 0, conceded: 0 });
const J = (id: string, number: number, name: string, isOpponent = false, role = Role.PLAYER): Player => ({
  id, number, name, role, isOnPitch: true, plusMinus: 0, individualTimeSeconds: 600,
  rotationTimeSeconds: 60, isOpponent, stats: st(),
});

const despeje: GameEvent = {
  id: "dsp", timestamp: 5_000, wallClock: 5_000, period: Period.FIRST, playerIds: ["rgk"],
  type: GoalieAction.SAVE_DEFLECT as never, gameState: "4vs4" as never,
  metadata: { isOpponent: true, deflectOutcome: "throw_in_team" },
};
const corner = jugada({ root: "corner", isOpponent: false, modality: "prepared", outcome: "goal",
  cornerSide: "right", takerId: "l7", shot: { finisherId: "l10", destinationGrid: "G1" } }, 10_000);
const banda = jugada({ root: "throw_in", isOpponent: false, modality: "quick", outcome: "shot",
  throwInSide: "left", throwInSector: "Z4", takerId: "l7", fromDeflectEventId: "dsp",
  shot: { finisherId: "l7", destinationGrid: "OUT" } }, 6_000);
despeje.metadata = { ...despeje.metadata, linkedSequenceId: banda[0].metadata!.sequenceId };
const faltaRival = jugada({ root: "free_kick", isOpponent: true, modality: "prepared", outcome: "loss",
  originGrid: "Z3L", takerId: "r9", loss: { playerId: "r9" } }, 20_000);

const partido: MatchData = {
  teamName: "CD MURCIA", opponentName: "JIMBEE", period: Period.FINISHED, matchClock: 0,
  isClockRunning: false, fouls: { team: 0, opponent: 0 },
  timeoutsUsed: { team: { period1: false, period2: false }, opponent: { period1: false, period2: false } },
  players: [J("lgk", 1, "Víctor", false, Role.GOALKEEPER), J("l7", 7, "Ramón"), J("l10", 10, "José"),
    J("rgk", 1, "Portero Rival", true, Role.GOALKEEPER), J("r9", 9, "Rival Nueve", true)],
  events: [despeje, ...banda, ...corner, ...faltaRival],
};

afterEach(() => vi.restoreAllMocks());

describe("el payload no llama a nadie", () => {
  it("construirlo no hace ninguna petición de red", () => {
    const red = vi.fn();
    vi.stubGlobal("fetch", red);
    buildTacticalProPayload(partido);
    expect(red).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("y su código no contiene fetch ni el SDK de Anthropic", () => {
    const fuente = readFileSync(resolve(__dirname, "./tacticalProPayload.ts"), "utf-8");
    expect(fuente).not.toMatch(/\bfetch\s*\(/);
    expect(fuente).not.toMatch(/anthropic/i);
  });
});

describe("lo que recibe el modelo", () => {
  const payload = JSON.parse(JSON.stringify(buildTacticalProPayload(partido)));
  const resumen = payload.deterministicReport.setPieces.sequences;

  it("córner, faltas y bandas por bando, del helper único y sin sumar bandos", () => {
    expect(resumen).toEqual(JSON.parse(JSON.stringify(summarizeSetPieceSequences(partido.events))));
    expect(resumen.team.corner.total).toBe(1);
    expect(resumen.team.throwIn.total).toBe(1);
    expect(resumen.team.freeKick.total).toBe(0);
    expect(resumen.opponent.freeKick.total).toBe(1);
    expect(resumen.opponent.corner.total).toBe(0);
  });

  it("lados, sectores, modalidad y desenlaces", () => {
    expect(resumen.team.corner.bySide.right).toBe(1);
    expect(resumen.team.throwIn.bySide.left).toBe(1);
    expect(resumen.team.throwIn.bySector.Z4).toBe(1);
    expect(resumen.team.throwIn.byModality.quick).toBe(1);
    expect(resumen.team.throwIn.afterDeflect).toBe(1);
    expect(resumen.opponent.freeKick.byZone.Z3L).toBe(1);
    expect(resumen.team.corner.outcomes.goal).toBe(1);
    expect(resumen.opponent.freeKick.outcomes.loss).toBe(1);
  });

  it("sacadores y finalizadores por id", () => {
    expect(resumen.team.corner.takers).toEqual([{ playerId: "l7", count: 1 }]);
    expect(resumen.team.corner.finishers).toEqual([{ playerId: "l10", count: 1 }]);
    expect(resumen.team.corner.finishers).not.toContainEqual({ playerId: "rgk", count: 1 });
  });

  it("cada jugada por separado, en orden, con sus eventos", () => {
    const jugadas = payload.tacticalContext.setPieceSequences;
    expect(jugadas.map((j: any) => j.root)).toEqual(["throw_in", "corner", "free_kick"]);
    const c = jugadas[1];
    expect(c).toMatchObject({ isOpponent: false, modality: "prepared", outcome: "goal",
      takerId: "l7", finisherId: "l10", locationLabel: "Córner derecho" });
    expect(c.eventIds).toEqual(corner.map((e) => e.id));
    // El despeje de origen está enlazado, no dentro de la jugada.
    expect(jugadas[0].eventIds).not.toContain("dsp");
  });

  it("los totales generales ya incluyen lo originado: nada se suma aparte", () => {
    expect(payload.deterministicReport.score).toEqual({ team: 1, opponent: 0 });
    // Gol del córner + tiro tras la banda: 2 remates, NO 4.
    expect(payload.deterministicReport.teamTotals.shots).toBe(2);
  });
});

describe("el glosario lo explica", () => {
  const texto = TACTICAL_PRO_GLOSSARY.join("\n");

  it("evento raíz y desenlace", () => {
    expect(texto).toContain("sequenceRole' = 'root'");
    expect(texto).toContain("sequenceRole' = 'outcome'");
  });

  it("sequenceId y linkedSequenceId", () => {
    expect(texto).toContain("'metadata.sequenceId'");
    expect(texto).toContain("'metadata.linkedSequenceId'");
    expect(texto).toMatch(/ENLAZADOS, no forman parte/);
  });

  it("sacador frente a finalizador", () => {
    expect(texto).toContain("'metadata.takerId'");
    expect(texto).toMatch(/finalizador es el autor del desenlace/);
    expect(texto).toMatch(/no atribuyas el gol al sacador ni al portero/);
  });

  it("la normalización de banda y sector", () => {
    expect(texto).toMatch(/throwInSide[\s\S]*perspectiva del equipo que SACA/);
  });

  it("prohíbe sumar raíz y desenlace dos veces", () => {
    expect(texto).toMatch(/NUNCA\s+sumes la raíz y el desenlace/);
    expect(texto).toMatch(/1 córner y 1 tiro/);
  });

  it("una banda no es un tiro", () => {
    expect(texto).toMatch(/THROW_IN es una reanudación, NUNCA un tiro/);
  });

  it("el gol de la jugada ya está en los goles generales", () => {
    expect(texto).toMatch(/ya está\s+contado en los tiros, el marcador, los goles/);
    expect(texto).toMatch(/'goals' está INCLUIDO en 'attempts' y ya está en el\s+marcador/);
  });

  it("null en una proporción no es 0%", () => {
    expect(texto).toMatch(/null significa que no hay\s+ninguna registrada, no 0%/);
  });

  it("y dice en qué unidad van las proporciones, la misma que produce el motor", () => {
    expect(texto).toMatch(/porcentajes ENTEROS entre 0 y 100/);
    const s = JSON.parse(JSON.stringify(buildTacticalProPayload(partido))).deterministicReport
      .setPieces.sequences.team.corner;
    expect(s.goalRate).toBe(100); // 1 gol de 1 córner registrado: 100, no 1
  });

  it("el único vínculo es el explícito", () => {
    expect(texto).toMatch(/ÚNICO vínculo que registra la\s+aplicación es el explícito/);
  });
});
