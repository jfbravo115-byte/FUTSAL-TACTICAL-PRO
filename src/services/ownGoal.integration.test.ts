/**
 * El gol en propia de punta a punta: marcador, informe, historial,
 * exportaciones y Tactical Pro.
 *
 * Lo que se protege aquí NO es el modelo —eso está en `goalModel.test.ts`—
 * sino que las superficies que leen el partido digan todas lo mismo. El
 * marcador estaba calculado a mano en dieciséis sitios; si alguno vuelve a
 * contar por su cuenta, uno de estos tests cae.
 */
import { describe, expect, it } from "vitest";
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
import { generateMatchReport, formatMatchReportAsMarkdown } from "./matchReportService";
import { buildActionsCsv, buildMatchJson } from "./matchExportService";
import { buildTacticalProPayload, TACTICAL_PRO_GLOSSARY } from "./tacticalProPayload";
import { matchHistorySignature } from "./matchHistoryService";
import { buildZoneDashboard } from "./matchZonesService";
import { actorSide, beneficiarySide, scoreOf } from "../utils/goalModel";
import { nextPhaseAfterEvent } from "../utils/phaseModel";
import { buildGoalSequence } from "../utils/goalSequence";
import { summarizeShots } from "../utils/shotModel";

let n = 0;
const ev = (
  type: ActionType | GoalieAction,
  opp: boolean,
  extra: Partial<GameEvent> = {},
): GameEvent => ({
  id: `e${n++}`,
  timestamp: 60_000 * n,
  wallClock: 1_700_000_000_000 + n * 1000,
  period: Period.FIRST,
  playerIds: [],
  type,
  gameState: GameState.FOUR_VS_FOUR,
  metadata: { isOpponent: opp },
  ...extra,
});

const jugador = (id: string, num: number, nombre: string, opp: boolean): Player => ({
  id,
  number: num,
  name: nombre,
  role: Role.WING,
  isOnPitch: true,
  plusMinus: 0,
  individualTimeSeconds: 600,
  isOpponent: opp,
  stats: {
    goals: 0, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0,
    fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0, saves: 0, conceded: 0,
  },
});

function partido(eventos: GameEvent[]): MatchData {
  return {
    teamName: "CD MURCIA",
    opponentName: "PR7",
    period: Period.FINISHED,
    matchClock: 0,
    isClockRunning: false,
    fouls: { team: 0, opponent: 0 },
    timeoutsUsed: {
      team: { period1: false, period2: false },
      opponent: { period1: false, period2: false },
    },
    players: [
      jugador("local7", 7, "Pérez", false),
      jugador("local10", 10, "Gómez", false),
      jugador("rival4", 4, "Silva", true),
    ],
    events: eventos,
    timestamp: "2026-10-18T18:00:00.000Z",
    teamDefendsAtKickoff: "left",
  };
}

/** Dos tiros nuestros (uno gol) y un gol en propia de nuestro #7. */
function conPropiaLocal(): MatchData {
  n = 0;
  return partido([
    ev(ActionType.SHOT, false, { playerIds: ["local10"], destinationGrid: "G5", originGrid: "Z4C" }),
    ev(ActionType.GOAL, false, { playerIds: ["local10"], destinationGrid: "G1", originGrid: "Z4L", metadata: { isOpponent: false, setPiece: "normal" } }),
    ev(ActionType.OWN_GOAL, false, { playerIds: ["local7"], originGrid: "Z1C" }),
  ]);
}

/** Un gol en propia del rival: suma para nosotros. */
function conPropiaRival(): MatchData {
  n = 100;
  return partido([ev(ActionType.OWN_GOAL, true, { playerIds: ["rival4"], originGrid: "Z4R" })]);
}

// ── 1-2 · MARCADOR EN TODAS LAS SUPERFICIES ─────────────────────────────

describe("1-2 · el marcador dice lo mismo en todas partes", () => {
  it("un gol en propia NUESTRO suma al rival, y el informe lo refleja", () => {
    const md = conPropiaLocal();
    expect(scoreOf(md.events)).toEqual({ team: 1, opponent: 1 });
    expect(generateMatchReport(md).score).toEqual({ team: 1, opponent: 1 });
    expect(formatMatchReportAsMarkdown(generateMatchReport(md))).toContain(
      "**Marcador:** 1 - 1",
    );
  });

  it("un gol en propia DEL RIVAL suma para nosotros", () => {
    const md = conPropiaRival();
    expect(scoreOf(md.events)).toEqual({ team: 1, opponent: 0 });
    expect(generateMatchReport(md).score).toEqual({ team: 1, opponent: 0 });
  });

  it("la firma del historial usa el mismo marcador", () => {
    const md = conPropiaLocal();
    expect(matchHistorySignature({ ...md, id: "x" })).toContain("|1|1|");
  });

  it("el CSV conserva actor Y beneficiario", () => {
    const csv = buildActionsCsv(conPropiaLocal());
    const fila = csv.replace(/^﻿/, "").split("\n").find((l) => l.includes("OWN_GOAL"))!;
    const celdas = fila.split(",").map((c) => c.replace(/^"|"$/g, ""));
    expect(celdas[3]).toBe("CD MURCIA"); // equipo del AUTOR
    expect(celdas[4]).toBe("Pérez"); // jugador
    expect(celdas[21]).toBe("PR7"); // gol_para: el BENEFICIARIO, por posición fija
    expect(fila).toContain("Gol en propia");
  });

  it("y un gol normal deja «gol_para» igual que su propio equipo", () => {
    const csv = buildActionsCsv(conPropiaLocal());
    const fila = csv.replace(/^﻿/, "").split("\n").find((l) => l.includes('"GOAL"'))!;
    const celdas = fila.split(",").map((c) => c.replace(/^"|"$/g, ""));
    expect(celdas[3]).toBe("CD MURCIA");
    expect(celdas[21]).toBe("CD MURCIA");
  });
});

// ── 3-5 · NO CONTAMINA LO OFENSIVO ──────────────────────────────────────

describe("3-5 · no suma tiro, ni gol individual, ni conversión", () => {
  it("el rival no gana ni un tiro", () => {
    const md = conPropiaLocal();
    const rival = md.events.filter((e) => e.metadata?.isOpponent);
    expect(summarizeShots(rival).shots).toBe(0);
    expect(generateMatchReport(md).teamTotals.shots).toBe(2); // los nuestros, sin el propio
  });

  it("un gol en propia DEL RIVAL no infla NUESTRA conversión", () => {
    // Es el caso que se escapó: el gol sube NUESTRO marcador, así que si
    // `teamTotals.goals` leyera el marcador, un tiro y dos goles darían un
    // 200 % de conversión. `teamTotals` es producción propia, no resultado.
    const md = conPropiaRival();
    md.events.push(
      ev(ActionType.SHOT, false, { playerIds: ["local10"], destinationGrid: "G5", originGrid: "Z4C" }),
    );
    const t = generateMatchReport(md).teamTotals;
    expect(scoreOf(md.events)).toEqual({ team: 1, opponent: 0 });
    expect(t.goals).toBe(0);
    expect(t.shots).toBe(1);
    expect(t.goalConversionPct).toBe(0);
    expect(t.goalConversionPct).not.toBe(100);
  });

  it("y los goles por periodo son producción propia, no marcador", () => {
    const md = conPropiaRival();
    md.events.push(
      ev(ActionType.SHOT, false, { playerIds: ["local10"], destinationGrid: "G5", originGrid: "Z4C" }),
    );
    const p1 = generateMatchReport(md).periodStats.find((p) => p.period === Period.FIRST)!;
    expect(p1.goals).toBe(0);
    expect(p1.shots).toBe(1);
  });

  it("la conversión NUESTRA no cambia por marcar en propia", () => {
    const sinPropia = partido(conPropiaLocal().events.slice(0, 2));
    const conPropia = conPropiaLocal();
    const a = generateMatchReport(sinPropia).teamTotals;
    const b = generateMatchReport(conPropia).teamTotals;
    expect(b.shots).toBe(a.shots);
    expect(b.goalConversionPct).toBe(a.goalConversionPct);
    expect(b.shotAccuracyPct).toBe(a.shotAccuracyPct);
  });

  it("ningún jugador se apunta el gol en propia como gol suyo", () => {
    const report = generateMatchReport(conPropiaLocal());
    const autor = report.playersUsed.find((p) => p.id === "local7")!;
    expect(autor.goals).toBe(0);
    expect(autor.attempts).toBe(0);
    expect(report.highlights.topScorer?.id).not.toBe("local7");
  });

  it("y no entra en los goles por zona del beneficiario", () => {
    const md = conPropiaLocal();
    const rival = buildZoneDashboard(md, true);
    expect(rival.totals.goals).toBe(0);
    expect(rival.totals.attempts).toBe(0);
    // En NUESTRO cubo tampoco cuenta como gol ni como tiro, aunque tenga zona.
    const propio = buildZoneDashboard(md, false);
    expect(propio.totals.goals).toBe(1); // solo el gol de verdad
    expect(propio.totals.attempts).toBe(2);
  });
});

// ── 6 · SECUENCIA / TIMELINE ────────────────────────────────────────────

describe("6 · la secuencia de goles lo cuenta bien", () => {
  it("el tanto es del beneficiario y el autor del otro bando", () => {
    const seq = buildGoalSequence(conPropiaLocal());
    const propio = seq.find((g) => g.isOwnGoal)!;
    expect(propio).toBeDefined();
    expect(propio.scoringTeam).toBe("opponent");
    expect(propio.playerSide).toBe("team");
    expect(propio.playerName).toBe("Pérez");
    expect(propio.playerNumber).toBe(7);
    expect(propio.scoreAfter).toEqual({ team: 1, opponent: 1 });
  });

  it("el markdown dice quién lo metió y a quién le sumó", () => {
    const md = formatMatchReportAsMarkdown(generateMatchReport(conPropiaLocal()));
    expect(md).toContain("Gol en propia de #7 Pérez (CD MURCIA) · gol para PR7");
  });

  it("sin autor identificado no se inventa ninguno", () => {
    n = 200;
    const md = partido([ev(ActionType.OWN_GOAL, false, { originGrid: "Z1C" })]);
    const seq = buildGoalSequence(md);
    expect(seq[0].playerName).toBeNull();
    expect(seq[0].scoringTeam).toBe("opponent");
    expect(formatMatchReportAsMarkdown(generateMatchReport(md))).toContain(
      "Gol en propia — jugador no identificado",
    );
  });
});

// ── 7 · INFORME ─────────────────────────────────────────────────────────

describe("7 · el informe lo incluye donde toca", () => {
  it("aparece entre los eventos relevantes", () => {
    const report = generateMatchReport(conPropiaLocal());
    // `relevantEvents[].type` ya viene traducido para leerse: nunca lleva el
    // identificador interno.
    expect(report.relevantEvents.map((e) => e.type)).toContain("Gol en propia");
    expect(report.relevantEvents.map((e) => e.type)).not.toContain("OWN_GOAL");
  });

  it("los goles por periodo son los que NUESTRO equipo fabricó", () => {
    const report = generateMatchReport(conPropiaLocal());
    const p1 = report.periodStats.find((p) => p.period === Period.FIRST)!;
    // Dos tiros y un gol nuestros, más un gol en propia que no produjo nadie.
    expect(p1.goals).toBe(1);
    expect(p1.shots).toBe(2);
    expect(report.score).toEqual({ team: 1, opponent: 1 });
  });
});

// ── 8 · TACTICAL PRO ────────────────────────────────────────────────────

describe("8 · Tactical Pro recibe el significado correcto", () => {
  it("el payload lleva el marcador ya resuelto y la marca de gol en propia", () => {
    const payload = buildTacticalProPayload(conPropiaLocal());
    expect(payload.deterministicReport.score).toEqual({ team: 1, opponent: 1 });
    const propio = payload.deterministicReport.goalSequence.find((g) => g.isOwnGoal)!;
    expect(propio.scoringTeam).toBe("opponent");
    expect(propio.playerSide).toBe("team");
  });

  it("el glosario le dice que no es un tiro ni mérito de nadie", () => {
    const texto = TACTICAL_PRO_GLOSSARY.join("\n");
    expect(texto).toContain("OWN_GOAL");
    expect(texto).toMatch(/SUMA AL MARCADOR DEL EQUIPO\s+CONTRARIO/);
    expect(texto).toMatch(/no es un tiro/i);
    expect(texto).toMatch(/autor no\s+identificado/i);
    expect(texto).toMatch(/NO lo recalcules/i);
  });

  it("y sigue sin contarle a ningún jugador del beneficiario", () => {
    const payload = buildTacticalProPayload(conPropiaLocal()) as any;
    const rival = payload.tacticalContext.zones.opponent;
    expect(rival.totals.goals).toBe(0);
  });
});

// ── 9, 11 · EXPORTAR / IMPORTAR / RECARGAR ──────────────────────────────

describe("9, 11 · ida y vuelta por JSON", () => {
  it("el evento sobrevive al JSON con todo lo que lo define", () => {
    const md = conPropiaLocal();
    const vuelta: MatchData = JSON.parse(buildMatchJson(md));
    const propio = vuelta.events.find((e) => e.type === ActionType.OWN_GOAL)!;
    expect(propio.playerIds).toEqual(["local7"]);
    expect(propio.metadata?.isOpponent).toBe(false);
    expect(propio.originGrid).toBe("Z1C");
    expect(propio.period).toBe(Period.FIRST);
    expect(propio.gameState).toBe(GameState.FOUR_VS_FOUR);
    expect(scoreOf(vuelta.events)).toEqual({ team: 1, opponent: 1 });
  });

  it("y el informe reconstruido desde el JSON da el mismo marcador", () => {
    const md = conPropiaLocal();
    const vuelta: MatchData = JSON.parse(buildMatchJson(md));
    expect(generateMatchReport(vuelta).score).toEqual(generateMatchReport(md).score);
  });
});

// ── 10, 12 · DESHACER Y DOBLE CONTABILIZACIÓN ───────────────────────────

describe("10, 12 · deshacer y no contar dos veces", () => {
  it("quitar el evento devuelve el marcador exacto de antes", () => {
    const md = conPropiaLocal();
    const sin = { ...md, events: md.events.filter((e) => e.type !== ActionType.OWN_GOAL) };
    expect(scoreOf(sin.events)).toEqual({ team: 1, opponent: 0 });
    expect(generateMatchReport(sin).score).toEqual({ team: 1, opponent: 0 });
    expect(buildGoalSequence(sin).some((g) => g.isOwnGoal)).toBe(false);
  });

  it("un solo evento produce un solo tanto en todas las lecturas", () => {
    const md = conPropiaLocal();
    expect(md.events.filter((e) => e.type === ActionType.OWN_GOAL)).toHaveLength(1);
    expect(scoreOf(md.events).opponent).toBe(1);
    expect(buildGoalSequence(md).filter((g) => g.isOwnGoal)).toHaveLength(1);
    expect(generateMatchReport(md).relevantEvents.filter((e) => e.type === "Gol en propia")).toHaveLength(1);
  });
});

// ── 13 · PARTIDOS ANTERIORES ────────────────────────────────────────────

describe("13 · compatibilidad", () => {
  it("un partido sin OWN_GOAL se lee exactamente igual que antes", () => {
    n = 300;
    const antiguo = partido([
      ev(ActionType.GOAL, false, { playerIds: ["local10"], destinationGrid: "G1" }),
      ev(ActionType.GOAL, true, { playerIds: ["rival4"], destinationGrid: "G3" }),
      ev(GoalieAction.GOAL_CONCEDED, true, { playerIds: ["rival4"] }),
    ]);
    const r = generateMatchReport(antiguo);
    expect(r.score).toEqual({ team: 1, opponent: 2 });
    expect(buildGoalSequence(antiguo).every((g) => g.isOwnGoal === false)).toBe(true);
    expect(buildGoalSequence(antiguo).every((g) => g.playerSide === g.scoringTeam)).toBe(true);
  });

  it("un JSON antiguo sin los campos nuevos se importa sin tocar nada", () => {
    n = 400;
    const crudo = JSON.stringify(partido([ev(ActionType.GOAL, true, { playerIds: ["rival4"] })]));
    const vuelta: MatchData = JSON.parse(crudo);
    expect(scoreOf(vuelta.events)).toEqual({ team: 0, opponent: 1 });
    expect(generateMatchReport(vuelta).score).toEqual({ team: 0, opponent: 1 });
  });
});

// ── E · EL GOL EN PROPIA REANUDA COMO CUALQUIER GOL ─────────────────────

describe("E · beneficiario, reanudación y autor", () => {
  const faseTras = (type: ActionType, opp: boolean) =>
    nextPhaseAfterEvent(type, opp, "attack_positional");
  const beneficiario = (type: ActionType, opp: boolean) =>
    beneficiarySide({ type, metadata: { isOpponent: opp } });

  it("1 · gol normal NUESTRO y gol en propia del RIVAL: mismo beneficiario y misma fase", () => {
    expect(beneficiario(ActionType.GOAL, false)).toBe("team");
    expect(beneficiario(ActionType.OWN_GOAL, true)).toBe("team");
    expect(faseTras(ActionType.OWN_GOAL, true)).toBe(faseTras(ActionType.GOAL, false));
    expect(faseTras(ActionType.GOAL, false)).toBe("defense_organized");
  });

  it("2 · gol normal del RIVAL y gol en propia NUESTRO: mismo beneficiario y misma fase", () => {
    expect(beneficiario(ActionType.GOAL, true)).toBe("opponent");
    expect(beneficiario(ActionType.OWN_GOAL, false)).toBe("opponent");
    expect(faseTras(ActionType.OWN_GOAL, false)).toBe(faseTras(ActionType.GOAL, true));
    expect(faseTras(ActionType.GOAL, true)).toBe("attack_positional");
  });

  it("3 · el autor del gol en propia es del equipo CONTRARIO al beneficiario", () => {
    const md = conPropiaLocal();
    const propio = md.events.find((e) => e.type === ActionType.OWN_GOAL)!;
    expect(actorSide(propio)).toBe("team");
    expect(beneficiarySide(propio)).toBe("opponent");
    expect(actorSide(propio)).not.toBe(beneficiarySide(propio));
    // Y el jugador existe y es de nuestra plantilla, no de la del rival.
    const autor = md.players.find((p) => propio.playerIds.includes(p.id))!;
    expect(autor.isOpponent).toBe(false);
    expect(autor.number).toBe(7);
  });

  it("4 · marcador y producción ofensiva siguen correctos tras la reanudación", () => {
    const md = conPropiaLocal();
    const r = generateMatchReport(md);
    expect(r.score).toEqual({ team: 1, opponent: 1 });
    expect(r.teamTotals.goals).toBe(1);
    expect(r.teamTotals.shots).toBe(2);
    expect(r.teamTotals.goalConversionPct).toBe(50);
  });

  it("5 · quitar el gol en propia restaura marcador y producción", () => {
    const md = conPropiaLocal();
    const sin = { ...md, events: md.events.filter((e) => e.type !== ActionType.OWN_GOAL) };
    const a = generateMatchReport(sin), b = generateMatchReport(md);
    expect(a.score).toEqual({ team: 1, opponent: 0 });
    expect(a.teamTotals.goals).toBe(b.teamTotals.goals);
    expect(a.teamTotals.shots).toBe(b.teamTotals.shots);
    expect(a.teamTotals.goalConversionPct).toBe(b.teamTotals.goalConversionPct);
  });

  it("6 · la fase del evento sobrevive a exportar e importar", () => {
    n = 700;
    const md = partido([
      ev(ActionType.OWN_GOAL, false, { playerIds: ["local7"], phaseOfPlay: "defense_transition" }),
    ]);
    const vuelta: MatchData = JSON.parse(buildMatchJson(md));
    expect(vuelta.events[0].phaseOfPlay).toBe("defense_transition");
    expect(scoreOf(vuelta.events)).toEqual({ team: 0, opponent: 1 });
  });
});

// ── D · PÉRDIDA DEL RIVAL ───────────────────────────────────────────────

describe("D · la pérdida del rival es un balón que ganamos", () => {
  it("la fase resultante es la correcta en los dos sentidos", () => {
    expect(nextPhaseAfterEvent(ActionType.LOSS, false, "attack_positional")).toBe("defense_transition");
    expect(nextPhaseAfterEvent(ActionType.LOSS, true, "defense_organized")).toBe("attack_transition");
  });

  it("y el evento pertenece al equipo que la cometió", () => {
    n = 800;
    const md = partido([
      ev(ActionType.LOSS, true, { originGrid: "Z2C" }),
      ev(ActionType.LOSS, false, { originGrid: "Z3C" }),
    ]);
    const rival = md.events.filter((e) => e.metadata?.isOpponent);
    const propia = md.events.filter((e) => !e.metadata?.isOpponent);
    expect(rival).toHaveLength(1);
    expect(propia).toHaveLength(1);
    // La pérdida del rival NO cuenta como pérdida nuestra en el informe.
    expect(generateMatchReport(md).teamTotals.lossesAndErrors).toBe(0);
  });
});
