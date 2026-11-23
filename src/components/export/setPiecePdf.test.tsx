// @vitest-environment jsdom
/**
 * Las jugadas a balón parado en los dos PDF actuales.
 *
 *   - El bloque de balón parado —el MISMO componente en el informe resumido y
 *     en el dossier— dice córner, falta a favor y banda de los dos equipos,
 *     por separado, con modalidad, lado/sector, remates, goles, pérdidas,
 *     sacadores y finalizadores.
 *   - La secuencia de goles y las acciones relevantes dicen de qué jugada
 *     nació cada gol o tiro.
 *   - Un partido anterior imprime exactamente lo mismo que antes, y el
 *     dossier no cambia de estructura: mismas páginas, mismo orden.
 */
import { describe, expect, it } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ActionType, GameEvent, GoalieAction, MatchData, Period, Player, Role } from "../../types/futsal";
import { buildSequenceSeeds, newSetPieceSequenceId, SetPieceSequenceDraft } from "../../utils/setPieceSequence";
import { generateMatchReport } from "../../services/matchReportService";
import { EventsSection, SpecialContextsSection } from "../../services/pdfExportService";
import { buildDossierPages } from "../../services/fullDossierPdfService";
import {
  GOAL_ROW_H,
  GOAL_ROW_WITH_NOTE_H,
  paginateContextReport,
} from "../../utils/reportPagination";
import { SetPieceSummaryBoard } from "./SetPieceSummaryBoard";
import { MatchContextBoard } from "./MatchContextBoard";

let n = 0;
const PORTERO = { team: "lgk", opponent: "rgk" };
function jugada(draft: SetPieceSequenceDraft, t: number, period = Period.FIRST): GameEvent[] {
  const id = newSetPieceSequenceId();
  const portero = draft.isOpponent ? PORTERO.team : PORTERO.opponent;
  return buildSequenceSeeds(draft, id).map((s) => {
    const remate = s.type === ActionType.SHOT || s.type === ActionType.GOAL;
    const ids = s.playerId ? [s.playerId] : [];
    if (remate) ids.push(portero);
    return {
      id: `e${++n}`, timestamp: t, wallClock: t + period * 1_000_000, period, playerIds: ids,
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
const base = (events: GameEvent[]): MatchData => ({
  teamName: "CD MURCIA", opponentName: "JIMBEE", period: Period.FINISHED, matchClock: 0,
  isClockRunning: false, fouls: { team: 0, opponent: 0 },
  timeoutsUsed: { team: { period1: false, period2: false }, opponent: { period1: false, period2: false } },
  players: [J("lgk", 1, "Víctor", false, Role.GOALKEEPER), J("l7", 7, "Ramón"), J("l10", 10, "José"),
    J("rgk", 1, "Portero Rival", true, Role.GOALKEEPER), J("r9", 9, "Rival Nueve", true)],
  events,
});

const despeje: GameEvent = {
  id: "dsp", timestamp: 4_000, wallClock: 1_004_000, period: Period.FIRST, playerIds: ["rgk"],
  type: GoalieAction.SAVE_DEFLECT as never, gameState: "4vs4" as never,
  metadata: { isOpponent: true, deflectOutcome: "throw_in_team" },
};
const cornerGol = jugada({ root: "corner", isOpponent: false, modality: "prepared", outcome: "goal",
  cornerSide: "left", takerId: "l7", shot: { finisherId: "l10", destinationGrid: "G1" } }, 10_000);
const bandaTiro = jugada({ root: "throw_in", isOpponent: false, modality: "quick", outcome: "shot",
  throwInSide: "right", throwInSector: "Z4", takerId: "l7", fromDeflectEventId: "dsp",
  shot: { finisherId: "l7", destinationGrid: "OUT" } }, 5_000);
const faltaRival = jugada({ root: "free_kick", isOpponent: true, modality: "direct", outcome: "goal",
  originGrid: "Z4C", takerId: "r9", shot: { finisherId: "r9", destinationGrid: "G3" } }, 30_000, Period.SECOND);
const bandaRival = jugada({ root: "throw_in", isOpponent: true, modality: "prepared", outcome: "loss",
  throwInSide: "left", throwInSector: "Z2", loss: {} }, 40_000, Period.SECOND);
const historico: GameEvent = {
  id: "hist", timestamp: 50_000, wallClock: 2_050_000, period: Period.SECOND, playerIds: [],
  type: ActionType.CORNER, gameState: "4vs4" as never, metadata: { isOpponent: false, cornerSide: "right", setPieceOutcome: "play" },
};
const conJugadas = base([despeje, ...bandaTiro, ...cornerGol, ...faltaRival, ...bandaRival, historico]);
const anterior = base([historico,
  { id: "g", timestamp: 60_000, wallClock: 2_060_000, period: Period.SECOND, playerIds: ["l10", "rgk"],
    type: ActionType.GOAL, gameState: "4vs4" as never, destinationGrid: "G2",
    metadata: { isOpponent: false, targetGoalkeeperId: "rgk" } } as GameEvent]);

function pinta(nodo: React.ReactElement): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() => createRoot(host).render(nodo));
  return host;
}
const celdas = (host: HTMLElement, clave: string) =>
  Array.from(host.querySelector(`[data-sequence-row="${clave}"]`)!.querySelectorAll("td")).map(
    (td) => (td.textContent || "").trim());

describe("el bloque de balón parado · jugadas registradas", () => {
  const host = pinta(<SetPieceSummaryBoard matchData={conJugadas} />);

  it("nuestras jugadas: córner y banda, con modalidad, lado, remates y goles", () => {
    // Equipo · Reinicio · Total · Registradas · Modalidad · Lado/sector · Remates · Goles · Pérdidas
    expect(celdas(host, "CD MURCIA|corner")).toEqual([
      "CD MURCIA", "Córner", "2", "1", "preparada 1", "izq. 1 · der. 1", "1 (100%)", "1 (100%)", "0 (0%)",
    ]);
    expect(celdas(host, "CD MURCIA|throwIn")).toEqual([
      "CD MURCIA", "Banda", "1", "1", "rápido 1", "der. 1 · Z4 1", "1 (100%)", "0 (0%)", "0 (0%)",
    ]);
  });

  it("las del rival, en sus propias filas y nunca sumadas a las nuestras", () => {
    expect(celdas(host, "JIMBEE|freeKick")).toEqual([
      "JIMBEE", "Falta a favor", "1", "1", "directo 1", "Z4C 1", "1 (100%)", "1 (100%)", "0 (0%)",
    ]);
    expect(celdas(host, "JIMBEE|throwIn")[8]).toBe("1 (100%)");
    expect(host.querySelector('[data-sequence-row="JIMBEE|corner"]')).toBeNull();
    expect(host.querySelector('[data-sequence-row="CD MURCIA|freeKick"]')).toBeNull();
  });

  it("sacadores y finalizadores con dorsal; sin identificar, se dice", () => {
    const quien = (k: string) => host.querySelector(`[data-sequence-people="${k}"]`)!.textContent!;
    expect(quien("CD MURCIA|corner")).toContain("sacadores: #7 Ramón 1");
    expect(quien("CD MURCIA|corner")).toContain("finalizadores: #10 José 1");
    expect(quien("CD MURCIA|corner")).not.toContain("Portero Rival");
    expect(quien("JIMBEE|throwIn")).toContain("sacadores: no identificado 1");
  });

  it("explica que lo originado ya está en los totales y que una banda no es un tiro", () => {
    expect(host.textContent).toContain("no se suman aparte");
    expect(host.textContent).toContain("Una banda no es un tiro");
  });

  it("sin jugadas registradas, una reanudación antigua no lleva porcentaje", () => {
    const solo = pinta(<SetPieceSummaryBoard matchData={base([
      historico, ...jugada({ root: "throw_in", isOpponent: true, modality: "quick", outcome: "keep",
        throwInSide: "left", throwInSector: "Z1" }, 1_000),
    ])} />);
    expect(celdas(solo, "CD MURCIA|corner")).toEqual([
      "CD MURCIA", "Córner", "1", "0", "—", "der. 1", "0", "0", "0",
    ]);
  });
});

describe("un partido anterior imprime lo mismo que antes", () => {
  it("sin jugadas ni bandas, el bloque no añade la sección", () => {
    const host = pinta(<SetPieceSummaryBoard matchData={anterior} />);
    expect(host.querySelector("[data-sequence-table]")).toBeNull();
    expect(host.textContent).not.toContain("Jugadas registradas");
    // Las tablas de siempre siguen ahí.
    expect(host.querySelector('[data-set-piece-row="CD MURCIA"]')).not.toBeNull();
  });

  it("su secuencia de goles no lleva nota y reparte igual que antes", () => {
    const r = generateMatchReport(anterior);
    const host = pinta(<MatchContextBoard contexts={[]} goals={r.goalSequence} teamName="CD MURCIA"
      opponentName="JIMBEE" goalNotes={r.setPieces.sequenceNotes} />);
    expect(host.querySelector("[data-goal-set-piece-note]")).toBeNull();
    const conAlto = paginateContextReport([], r.goalSequence, undefined,
      (g) => (r.setPieces.sequenceNotes[g.eventId] ? GOAL_ROW_WITH_NOTE_H : GOAL_ROW_H));
    expect(conAlto).toEqual(paginateContextReport([], r.goalSequence));
  });
});

describe("cronología y acciones relevantes en los PDF", () => {
  const r = generateMatchReport(conJugadas);

  it("informe resumido: cada gol de jugada dice de cuál nació, y sigue siendo UN gol", () => {
    const host = pinta(<MatchContextBoard contexts={[]} goals={r.goalSequence} teamName="CD MURCIA"
      opponentName="JIMBEE" goalNotes={r.setPieces.sequenceNotes} />);
    const notas = Array.from(host.querySelectorAll("[data-goal-set-piece-note]")).map((x) => x.textContent);
    expect(r.goalSequence).toHaveLength(2);
    expect(notas).toHaveLength(2);
    expect(notas[0]).toContain("Córner (CD MURCIA) · Córner izquierdo");
    expect(notas[0]).toContain("saca #7 Ramón · remata #10 José");
    expect(notas[1]).toContain("Falta a favor (JIMBEE)");
  });

  it("la fila con nota reserva su alto: el reparto no la corta", () => {
    const alto = (g: (typeof r.goalSequence)[number]) =>
      r.setPieces.sequenceNotes[g.eventId] ? GOAL_ROW_WITH_NOTE_H : GOAL_ROW_H;
    // Con cuarenta goles de jugada, ninguna página supera su alto útil.
    const muchos = Array.from({ length: 40 }, (_, i) => ({ ...r.goalSequence[0], eventId: r.goalSequence[0].eventId, i }));
    const paginas = paginateContextReport([], muchos, undefined, alto);
    expect(paginas.length).toBeGreaterThanOrEqual(paginateContextReport([], muchos).length);
    for (const p of paginas) expect(40 + p.goals.length * GOAL_ROW_WITH_NOTE_H).toBeLessThanOrEqual(879);
  });

  it("dossier: la secuencia de goles lleva la misma nota", () => {
    const host = pinta(<SpecialContextsSection report={r} />);
    expect(host.querySelectorAll("[data-goal-set-piece-note]")).toHaveLength(2);
    expect(host.textContent).toContain("Jugada: Córner (CD MURCIA)");
  });

  it("dossier: las acciones relevantes incluyen la banda que acabó en tiro, con su nota", () => {
    const host = pinta(<EventsSection report={r} />);
    expect(host.textContent).toContain("Balón parado que acaba en tiro");
    expect(host.textContent).toContain("Saque de banda (CD MURCIA) · Banda derecha · Z4");
    // El gol de córner sale UNA vez, no también como «acaba en tiro».
    expect(host.textContent!.match(/Córner \(CD MURCIA\)/g)).toHaveLength(1);
  });

  it("dossier: mismas páginas y mismo orden con jugadas que sin ellas", () => {
    const claves = (md: MatchData) => buildDossierPages(md).map((p) => p.key);
    const sinJugadas = base([historico, { ...cornerGol[1], metadata: { isOpponent: false } },
      { ...faltaRival[1], metadata: { isOpponent: true } }]);
    expect(claves(conJugadas)).toEqual(claves(sinJugadas));
    expect(claves(conJugadas)).toContain("set-pieces");
  });
});
