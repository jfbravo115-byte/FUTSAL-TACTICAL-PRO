/**
 * La jugada a balón parado en el CSV de acciones y en el respaldo JSON.
 *
 * Lo que se protege:
 *   - CSV: las 22 columnas de siempre siguen en su sitio («fase» en la 20,
 *     «gol_para» en la 21) y las nueve de la jugada van detrás; las filas de
 *     una jugada comparten `secuencia`; el finalizador es el autor del remate,
 *     nunca el portero que lo recibe ni el sacador; un partido anterior deja
 *     las nueve columnas vacías.
 *   - JSON: ida y vuelta idéntica, con todos los campos de la jugada; un
 *     respaldo antiguo sigue siendo válido.
 */
import { describe, expect, it } from "vitest";
import { ActionType, GameEvent, GoalieAction, MatchData, Period, Player, Role } from "../types/futsal";
import { buildSequenceSeeds, newSetPieceSequenceId, SetPieceSequenceDraft } from "../utils/setPieceSequence";
import { scoreOf } from "../utils/goalModel";
import { buildActionsCsv, buildMatchJson, parseMatchJson, SEQUENCE_CSV_COLUMNS } from "./matchExportService";

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

// Córner nuestro: saca el 7, remata el 10, gol.
const corner = jugada({ root: "corner", isOpponent: false, modality: "prepared", outcome: "goal",
  cornerSide: "left", takerId: "l7", shot: { finisherId: "l10", destinationGrid: "G1" } }, 10_000);
// Despeje de nuestro portero que sale por banda para nosotros, y la banda.
const despeje: GameEvent = {
  id: "dsp", timestamp: 20_000, wallClock: 20_000, period: Period.FIRST, playerIds: ["lgk"],
  type: GoalieAction.SAVE_DEFLECT as never, gameState: "4vs4" as never,
  metadata: { isOpponent: false, deflectOutcome: "throw_in_team" },
};
const banda = jugada({ root: "throw_in", isOpponent: false, modality: "quick", outcome: "loss",
  throwInSide: "right", throwInSector: "Z3", takerId: "l7", fromDeflectEventId: "dsp",
  loss: { playerId: "l10", subType: "bad_pass" } }, 21_000);
despeje.metadata = { ...despeje.metadata, linkedSequenceId: banda[0].metadata!.sequenceId };
// Falta del rival: tiro directo sin finalizador identificado.
const falta = jugada({ root: "free_kick", isOpponent: true, modality: "direct", outcome: "shot",
  originGrid: "Z4C", takerId: "r9", shot: { destinationGrid: "OUT" } }, 30_000);
// Un córner de un partido anterior y un gol en propia.
const historico: GameEvent = {
  id: "hist", timestamp: 40_000, wallClock: 40_000, period: Period.FIRST, playerIds: [],
  type: ActionType.CORNER, gameState: "4vs4" as never, metadata: { isOpponent: true, cornerSide: "right" },
};
const propia: GameEvent = {
  id: "og", timestamp: 50_000, wallClock: 50_000, period: Period.SECOND, playerIds: ["r9"],
  type: ActionType.OWN_GOAL, gameState: "4vs4" as never, originGrid: "Z1C", metadata: { isOpponent: true },
};

const partido: MatchData = {
  teamName: "CD MURCIA", opponentName: "JIMBEE", period: Period.FINISHED, matchClock: 0,
  isClockRunning: false, fouls: { team: 0, opponent: 0 },
  timeoutsUsed: { team: { period1: false, period2: false }, opponent: { period1: false, period2: false } },
  timestamp: "2026-11-20T10:00:00.000Z",
  players: [J("lgk", 1, "Víctor", false, Role.GOALKEEPER), J("l7", 7, "Ramón"), J("l10", 10, "José"),
    J("rgk", 1, "Portero Rival", true, Role.GOALKEEPER), J("r9", 9, "Rival Nueve", true)],
  events: [...corner, despeje, ...banda, ...falta, historico, propia],
};

/** Lee un CSV de celdas siempre entrecomilladas, aunque lleven comas. */
function leer(csv: string): string[][] {
  return csv.replace(/^﻿/, "").split("\n").map((linea) =>
    [...linea.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1].replace(/""/g, '"')));
}
const [cabecera, ...filas] = leer(buildActionsCsv(partido));
const col = (nombre: string) => cabecera.indexOf(nombre);
const filaDe = (id: GameEvent) => filas[partido.events
  .slice().sort((a, b) => a.wallClock - b.wallClock).findIndex((e) => e.id === id.id)];

describe("CSV · columnas", () => {
  it("las 22 de siempre no se mueven y las 9 de la jugada van detrás", () => {
    expect(cabecera).toHaveLength(31);
    expect(cabecera[4]).toBe("jugador");
    expect(cabecera[20]).toBe("fase");
    expect(cabecera[21]).toBe("gol_para");
    expect(cabecera.slice(22)).toEqual([...SEQUENCE_CSV_COLUMNS]);
    expect(cabecera.slice(22)).toEqual([
      "secuencia", "accion_raiz", "modalidad_reinicio", "sacador", "finalizador",
      "lado_reinicio", "sector_reinicio", "desenlace_secuencia", "origen_despeje",
    ]);
  });

  it("todas las filas tienen el mismo número de celdas que la cabecera", () => {
    for (const f of filas) expect(f).toHaveLength(cabecera.length);
  });
});

describe("CSV · una jugada", () => {
  it("la reanudación y su desenlace comparten secuencia", () => {
    const [raiz, gol] = corner.map(filaDe);
    expect(raiz[col("secuencia")]).toMatch(/^spseq-/);
    expect(gol[col("secuencia")]).toBe(raiz[col("secuencia")]);
    expect(raiz[col("tipo_accion")]).toBe("CORNER");
    expect(gol[col("tipo_accion")]).toBe("GOAL");
  });

  it("dice raíz, modalidad, sacador, finalizador, lado y desenlace", () => {
    const gol = filaDe(corner[1]);
    expect(gol[col("accion_raiz")]).toBe("Córner");
    expect(gol[col("modalidad_reinicio")]).toBe("Jugada preparada");
    expect(gol[col("sacador")]).toBe("Ramón");
    expect(gol[col("finalizador")]).toBe("José");
    expect(gol[col("lado_reinicio")]).toMatch(/izquierd/i);
    expect(gol[col("desenlace_secuencia")]).toBe("Gol");
  });

  it("el autor del remate es el finalizador: ni el portero que lo recibe ni el sacador", () => {
    const gol = filaDe(corner[1]);
    expect(gol[col("jugador")]).toBe("José");
    expect(gol[col("jugador")]).toBe(gol[col("finalizador")]);
    expect(gol[col("jugador")]).not.toBe("Portero Rival");
    expect(gol[col("jugador")]).not.toBe(gol[col("sacador")]);
    // Y la fila de la reanudación la firma el sacador.
    expect(filaDe(corner[0])[col("jugador")]).toBe("Ramón");
  });

  it("un finalizador sin identificar deja la celda vacía, no el portero", () => {
    const tiro = filaDe(falta[1]);
    expect(tiro[col("finalizador")]).toBe("");
    expect(tiro[col("jugador")]).toBe("");
    expect(tiro[col("sacador")]).toBe("Rival Nueve");
    expect(tiro[col("equipo")]).toBe("JIMBEE");
    expect(tiro[col("accion_raiz")]).toBe("Falta a favor");
    expect(tiro[col("modalidad_reinicio")]).toBe("Tiro directo");
    expect(tiro[col("sector_reinicio")]).toBe("Z4C");
  });

  it("la banda dice banda, sector, pérdida y que nació de un despeje", () => {
    const [raiz, perdida] = banda.map(filaDe);
    expect(raiz[col("lado_reinicio")]).toBe("Banda derecha");
    expect(raiz[col("sector_reinicio")]).toBe("Z3");
    expect(raiz[col("modalidad_reinicio")]).toBe("Saque rápido");
    expect(perdida[col("desenlace_secuencia")]).toBe("Pérdida");
    expect(perdida[col("finalizador")]).toBe("José");
    expect(raiz[col("origen_despeje")]).toBe("Despeje del portero · Banda para nuestro equipo");
  });

  it("el despeje de origen comparte secuencia pero no se hace pasar por la jugada", () => {
    const d = filaDe(despeje);
    expect(d[col("secuencia")]).toBe(filaDe(banda[0])[col("secuencia")]);
    expect(d.slice(23)).toEqual(Array(8).fill(""));
  });
});

describe("CSV · lo que no es una jugada", () => {
  it("un córner de un partido anterior deja las nueve columnas vacías", () => {
    const h = filaDe(historico);
    expect(h.slice(22)).toEqual(Array(9).fill(""));
    // y conserva su columna de siempre
    expect(h[col("lado_corner")]).toMatch(/derech/i);
  });

  it("el gol en propia conserva autor y beneficiario, sin jugada", () => {
    const g = filaDe(propia);
    expect(g[col("jugador")]).toBe("Rival Nueve");
    expect(g[col("gol_para")]).toBe("CD MURCIA");
    expect(g.slice(22)).toEqual(Array(9).fill(""));
  });
});

describe("JSON · ida y vuelta", () => {
  it("es idéntico: el partido vuelve tal cual salió", () => {
    const vuelta = parseMatchJson(buildMatchJson(partido));
    expect(vuelta).toEqual(partido);
    expect(buildMatchJson(vuelta)).toBe(buildMatchJson(partido));
  });

  it("conserva todos los campos de la jugada", () => {
    const vuelta = parseMatchJson(buildMatchJson(partido));
    const raiz = vuelta.events.find((e) => e.id === banda[0].id)!;
    expect(raiz.metadata).toMatchObject({
      sequenceId: banda[0].metadata!.sequenceId, sequenceRole: "root", sequenceRoot: "throw_in",
      sequenceOutcome: "loss", setPieceModality: "quick", takerId: "l7",
      throwInSide: "right", throwInSector: "Z3", fromDeflectEventId: "dsp",
    });
    const d = vuelta.events.find((e) => e.id === "dsp")!;
    expect(d.metadata).toMatchObject({ linkedSequenceId: banda[0].metadata!.sequenceId, deflectOutcome: "throw_in_team" });
    const gol = vuelta.events.find((e) => e.id === corner[1].id)!;
    expect(gol.playerIds[0]).toBe("l10");
    expect(gol.metadata).toMatchObject({ sequenceRole: "outcome", targetGoalkeeperId: "rgk", setPiece: "corner" });
  });

  it("el marcador no cambia al volver", () => {
    expect(scoreOf(parseMatchJson(buildMatchJson(partido)).events)).toEqual(scoreOf(partido.events));
    expect(scoreOf(partido.events)).toEqual({ team: 2, opponent: 0 });
  });

  it("un respaldo antiguo, sin ningún campo de jugada, sigue siendo válido", () => {
    const antiguo = { ...partido, events: [historico, propia] };
    const vuelta = parseMatchJson(JSON.stringify({ version: 1, matchData: antiguo }));
    expect(vuelta).toEqual(antiguo);
    expect(leer(buildActionsCsv(vuelta)).slice(1).every((f) => f.slice(22).every((c) => c === ""))).toBe(true);
  });
});
