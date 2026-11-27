/**
 * El apartado «Balón parado» del informe automático.
 *
 * Lo que se protege: que nuestros datos y los del rival vayan en
 * subapartados separados y nunca sumados; que no haya un porcentaje con
 * denominador cero; que un jugador sin identificar no reciba nombre; y que
 * la jugada de la que nació un gol se diga en la secuencia de goles y en
 * las acciones relevantes sin que ese gol aparezca dos veces.
 */
import { describe, expect, it } from "vitest";
import { ActionType, GameEvent, MatchData, Period, Player, Role } from "../types/futsal";
import { buildSequenceSeeds, newSetPieceSequenceId, SetPieceSequenceDraft } from "../utils/setPieceSequence";
import { formatMatchReportAsMarkdown, generateMatchReport } from "./matchReportService";

let n = 0;
const PORTERO = { team: "lgk", opponent: "rgk" };
function jugada(draft: SetPieceSequenceDraft, t = 60_000): GameEvent[] {
  const id = newSetPieceSequenceId();
  const portero = draft.isOpponent ? PORTERO.team : PORTERO.opponent;
  return buildSequenceSeeds(draft, id).map((s) => {
    const remate = s.type === ActionType.SHOT || s.type === ActionType.GOAL;
    const ids = s.playerId ? [s.playerId] : [];
    if (remate) ids.push(portero);
    return {
      id: `e${++n}`, timestamp: t, wallClock: n, period: Period.FIRST, playerIds: ids,
      onPitchPlayerIds: ["lgk", "l7", "l10", "rgk", "r9"], type: s.type, gameState: "4vs4" as never,
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
const partido = (events: GameEvent[]): MatchData => ({
  teamName: "CD MURCIA", opponentName: "JIMBEE", period: Period.FINISHED, matchClock: 0,
  isClockRunning: false, fouls: { team: 0, opponent: 0 },
  timeoutsUsed: { team: { period1: false, period2: false }, opponent: { period1: false, period2: false } },
  players: [J("lgk", 1, "Víctor", false, Role.GOALKEEPER), J("l7", 7, "Ramón"), J("l10", 10, "José"),
    J("rgk", 1, "POR RIVAL 1", true, Role.GOALKEEPER), J("r9", 9, "Rival Nueve", true)],
  events,
});

const ev = [
  ...jugada({ root: "corner", isOpponent: false, modality: "prepared", outcome: "goal",
    cornerSide: "left", takerId: "l7", shot: { finisherId: "l10", destinationGrid: "G1" } }, 120_000),
  ...jugada({ root: "throw_in", isOpponent: false, modality: "quick", outcome: "loss",
    throwInSide: "left", throwInSector: "Z2", takerId: "l7", loss: { playerId: "l7", subType: "bad_pass" } }, 200_000),
  ...jugada({ root: "free_kick", isOpponent: true, modality: "direct", outcome: "shot",
    originGrid: "Z4C", takerId: "r9", shot: { finisherId: "r9", destinationGrid: "OUT" } }, 300_000),
];
const r = generateMatchReport(partido(ev));
const md = formatMatchReportAsMarkdown(r);
const apartado = md.slice(md.indexOf("## Balón parado")).split("\n## ")[0];

describe("el apartado «Balón parado»", () => {
  it("existe y separa córner, faltas a favor y saques de banda", () => {
    expect(md).toContain("## Balón parado");
    expect(apartado).toContain("**Córner**");
    expect(apartado).toContain("**Saques de banda**");
    expect(apartado).toContain("**Faltas a favor**");
  });

  it("nuestros datos y los del rival van en subapartados distintos", () => {
    const nuestro = apartado.slice(apartado.indexOf("### CD MURCIA"), apartado.indexOf("### JIMBEE"));
    const rival = apartado.slice(apartado.indexOf("### JIMBEE"));
    expect(nuestro).toContain("**Córner**");
    expect(nuestro).not.toContain("**Faltas a favor**");
    expect(rival).toContain("**Faltas a favor**");
    expect(rival).not.toContain("**Córner**");
  });

  it("dice producción, pérdidas, lados, sacadores, finalizadores y eficiencia", () => {
    expect(apartado).toContain("Lado: izquierda 1");
    expect(apartado).toContain("goles 1 (100%)");
    expect(apartado).toContain("pérdidas 1 (100%)");
    expect(apartado).toContain("Sacadores: #7 Ramón 1");
    expect(apartado).toContain("Finalizadores: #10 José 1");
    expect(apartado).toContain("Sector: Z2 1");
    expect(apartado).toContain("Zona: carril central · zona alta 1");
  });

  it("recuerda que lo originado ya está en los totales y que una banda no es un tiro", () => {
    expect(apartado).toContain("no se suman aparte");
    expect(apartado).toContain("Una banda no es un tiro");
  });

  it("los totales del partido no cambian por las jugadas", () => {
    expect(r.score).toEqual({ team: 1, opponent: 0 });
    expect(r.teamTotals.shots).toBe(1); // el gol del córner
  });
});

describe("no inventa", () => {
  it("sin jugadas registradas no hay porcentajes", () => {
    const viejo = partido([
      { id: "c", timestamp: 1, wallClock: 1, period: Period.FIRST, playerIds: [], type: ActionType.CORNER,
        gameState: "4vs4" as never, metadata: { isOpponent: false, cornerSide: "right" } } as GameEvent,
    ]);
    const m = formatMatchReportAsMarkdown(generateMatchReport(viejo));
    const bloque = m.slice(m.indexOf("## Balón parado"));
    expect(bloque).toContain("1 en total (1 sin jugada registrada)");
    expect(bloque.split("\n## ")[0]).not.toMatch(/\d+%/);
  });

  it("un sacador sin identificar no recibe nombre", () => {
    const sinSacador = partido(jugada({ root: "throw_in", isOpponent: false, modality: "quick",
      outcome: "keep", throwInSide: "right", throwInSector: "Z3" }));
    const m = formatMatchReportAsMarkdown(generateMatchReport(sinSacador));
    expect(m).toContain("Sacadores: no identificado 1");
  });

  it("y un finalizador sin identificar no se atribuye al portero que recibe el remate", () => {
    const sinFinalizador = partido(jugada({ root: "corner", isOpponent: false, modality: "prepared",
      outcome: "shot", cornerSide: "left", shot: {} }));
    const m = formatMatchReportAsMarkdown(generateMatchReport(sinFinalizador));
    expect(m).toContain("Finalizadores: no identificado 1");
    expect(m).not.toContain("POR RIVAL 1 1");
  });
});

describe("cronología y acciones relevantes", () => {
  it("la secuencia de goles dice de qué jugada nació el gol", () => {
    const linea = md.split("\n").find((l) => l.includes("1-0"))!;
    expect(linea).toContain("Córner");
    expect(linea).toContain("jugada: Córner (CD MURCIA) · Córner izquierdo · Jugada preparada");
    expect(linea).toContain("saca #7 Ramón · remata #10 José · Gol");
  });

  it("el gol de la jugada aparece UNA vez entre las acciones relevantes", () => {
    const goles = r.relevantEvents.filter((e) => e.type !== "Balón parado que acaba en tiro");
    expect(goles).toHaveLength(1);
    expect(goles[0].setPieceNote).toContain("Córner izquierdo");
  });

  it("la jugada que acaba en tiro también es relevante", () => {
    const tiro = r.relevantEvents.find((e) => e.type === "Balón parado que acaba en tiro")!;
    expect(tiro).toBeDefined();
    expect(tiro.isOpponent).toBe(true);
    expect(tiro.setPieceNote).toContain("Falta a favor (JIMBEE)");
  });

  it("la banda que acaba en pérdida no se cuela como acción relevante", () => {
    expect(r.relevantEvents.some((e) => (e.setPieceNote ?? "").includes("Saque de banda"))).toBe(false);
  });
});

describe("un partido anterior conserva su informe", () => {
  it("las líneas antiguas de córner siguen ahí cuando no hay jugadas registradas", () => {
    const viejo = partido([
      { id: "c", timestamp: 1, wallClock: 1, period: Period.FIRST, playerIds: [], type: ActionType.CORNER,
        gameState: "4vs4" as never, metadata: { isOpponent: false, cornerSide: "left", setPieceOutcome: "shot" } } as GameEvent,
    ]);
    const m = formatMatchReportAsMarkdown(generateMatchReport(viejo));
    expect(m).toContain("Córners: **");
  });

  it("y en uno con jugadas no se repiten con el vocabulario antiguo", () => {
    expect(md).not.toContain("Córners: **");
  });
});
