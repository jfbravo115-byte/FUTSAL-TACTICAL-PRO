// @vitest-environment jsdom
/**
 * CÓRNER LANZADO DIRECTO A PORTERÍA · del botón al informe.
 *
 * `MatchTracker.tsx` no se monta en jsdom, así que el CABLEADO se comprueba
 * sobre el fuente, igual que en PR #24A/#25/#27/#30. Lo que se protege aquí
 * es lo que no puede verse en una función pura:
 *
 *   · que el córner NO exista hasta que el remate se confirma;
 *   · que los dos nazcan en la MISMA actualización de estado;
 *   · que la fase se mueva UNA vez;
 *   · que borrar uno borre los dos;
 *   · y que «Jugada» siga comportándose exactamente como antes.
 *
 * Lo que sí es puro —recuentos, forma de la secuencia, redacción— vive en
 * `utils/cornerSequence.test.ts` y no se repite aquí.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ActionType,
  GameEvent,
  GameState,
  GoalieAction,
  MatchData,
  Period,
  Role,
} from "../types/futsal";
import {
  cornerOfSequence,
  finisherOfSequence,
  sequenceIdOf,
  sequenceIsWellFormed,
  sequenceOf,
} from "../utils/cornerSequence";
import { nextPhaseAfterEvent } from "../utils/phaseModel";
import { eventActor } from "../utils/eventActor";
import { goalieStatsDelta } from "../utils/goalkeeperActions";
import { summarizeCorners } from "../utils/cornerModel";
import {
  countShotsFromSetPiece,
  isRuleDeterminedOrigin,
  shouldAskOriginZone,
  summarizeCornerOutcomes,
} from "../utils/setPieceModel";
import { summarizeShots } from "../utils/shotModel";
import { scoreOf } from "../utils/goalModel";
import { buildActionsCsv, buildMatchJson } from "../services/matchExportService";
import { generateMatchReport } from "../services/matchReportService";
import { buildTacticalProPayload } from "../services/tacticalProPayload";
import { loadMatchSnapshot, saveMatchSnapshot, clearMatchSnapshot } from "../services/matchSnapshotService";

const fuente = readFileSync(resolve(__dirname, "./MatchTracker.tsx"), "utf-8");
/** El fuente sin comentarios: lo que se afirma es sobre el código. */
const codigo = fuente
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

const trozo = (desde: string, hasta: string): string => {
  const i = codigo.indexOf(desde);
  expect(i, `no está: ${desde}`).toBeGreaterThan(-1);
  const j = codigo.indexOf(hasta, i);
  expect(j, `no cierra: ${hasta}`).toBeGreaterThan(i);
  return codigo.slice(i, j);
};

// ── 1 · EL CÓRNER NO SE GUARDA HASTA QUE HAY REMATE ─────────────────────

describe("1 · «Tiro directo» abre el flujo del tiro y no guarda nada todavía", () => {
  const handleCorner = trozo("const handleCorner = (", "const registrarTiro = (");

  it("con «Tiro directo» NO se llama a handleAction: se abre el flujo del tiro", () => {
    const rama = handleCorner.slice(
      handleCorner.indexOf('if (outcome === "shot")'),
      handleCorner.indexOf("handleAction(ActionType.CORNER"),
    );
    expect(rama).toContain("setPendingAction({");
    expect(rama).toContain("type: ActionType.SHOT");
    expect(rama).toContain('setPiece: "corner"');
    expect(rama).toContain('step: "player"');
    expect(rama).toContain("corner: { side, sequenceId: newCornerSequenceId() }");
    expect(rama).toContain("return;");
    // Lo que NO hace: registrar el córner por su cuenta.
    expect(rama).not.toContain("handleAction(");
  });

  it("1-2 · «Jugada» y «Sin especificar» siguen registrando el córner y punto", () => {
    const resto = handleCorner.slice(handleCorner.indexOf("handleAction(ActionType.CORNER"));
    expect(resto).toContain("originGrid: cornerOriginGrid(side)");
    expect(resto).toContain("cornerSide: side");
    expect(resto).toContain("...(outcome ? { setPieceOutcome: outcome } : {})");
    // Sin secuencia: una jugada no encadena nada.
    expect(resto).not.toContain("sequenceId");
    expect(resto).not.toContain("newCornerSequenceId");
  });

  it("el botón «Jugada» de la pantalla de córner no ha cambiado de camino", () => {
    expect(codigo).toContain("handleCorner(pendingCorner.isOpponent, pendingCorner.side!, outcome)");
    expect(codigo).toContain("handleCorner(pendingCorner.isOpponent, pendingCorner.side!)");
  });

  it("15-17 · cancelar en cualquier paso no deja nada: el córner vive en el estado", () => {
    // El único sitio donde se materializa un córner encadenado es
    // `handleAction`, y solo cuando le llega `secuenciaCorner`. Mientras el
    // flujo está abierto, el córner es un objeto dentro de `pendingAction`:
    // cerrar el modal lo tira con el resto del estado.
    expect(codigo).toContain("corner?: { side: CornerSide; sequenceId: string };");
    const creaciones = codigo.match(/type: ActionType\.CORNER/g) ?? [];
    expect(creaciones.length).toBe(1); // solo el evento compañero
    // Y todos los botones de salida del modal del tiro limpian el estado.
    expect(codigo).toContain("onClick={() => setPendingAction(null)}");
  });
});

// ── 2 · LOS DOS NACEN JUNTOS ────────────────────────────────────────────

describe("2 · el córner y su remate se guardan como una sola operación", () => {
  it("registrarTiro es el ÚNICO que pasa la secuencia a handleAction", () => {
    const registrar = trozo("const registrarTiro = (", "const handleAction = (");
    expect(registrar).toContain("current.corner,");
    const usos = codigo.match(/secuenciaCorner/g) ?? [];
    // Firma, construcción del evento, inserción y el guard del propio objeto.
    expect(usos.length).toBeGreaterThanOrEqual(3);
  });

  it("el evento compañero se arma dentro de handleAction, con el mismo contexto", () => {
    const ha = trozo("const eventoCorner: GameEvent | null = secuenciaCorner", "setMatchData((prev) => {");
    expect(ha).toContain("type: ActionType.CORNER");
    expect(ha).toContain("timestamp: matchData.matchClock");
    expect(ha).toContain("period: matchData.period");
    expect(ha).toContain("onPitchPlayerIds: onPitchIds");
    expect(ha).toContain("attackDirection: newEvent.attackDirection");
    expect(ha).toContain("originGrid: cornerOriginGrid(secuenciaCorner.side)");
    expect(ha).toContain('setPieceOutcome: "shot"');
    expect(ha).toContain("sequenceId: secuenciaCorner.sequenceId");
    // Mismo bando que el remate: la jugada es de un solo equipo.
    expect(ha).toContain("isOpponent: isOpponentEvent");
    // Y un milisegundo antes, porque ocurrió antes.
    expect(ha).toContain("wallClock: newEvent.wallClock - 1");
  });

  it("y los dos entran en el MISMO setMatchData", () => {
    expect(codigo).toContain("events: eventoCorner");
    expect(codigo).toContain("? [newEvent, eventoCorner, ...prev.events]");
    expect(codigo).toContain(": [newEvent, ...prev.events],");
  });

  it("el remate también se queda con el vínculo", () => {
    expect(codigo).toContain("...(secuenciaCorner ? { sequenceId: secuenciaCorner.sequenceId } : {})");
  });

  it("ESTRUCTURAL · no hay un segundo flujo de tiro parecido", () => {
    // El córner directo entra por el MISMO `pendingAction` y termina en el
    // MISMO `registrarTiro`. Si alguien añadiera una pantalla paralela, estos
    // contadores dejarían de cuadrar.
    expect((codigo.match(/const registrarTiro = \(/g) ?? []).length).toBe(1);
    expect((codigo.match(/const \[pendingAction, setPendingAction\]/g) ?? []).length).toBe(1);
    expect((codigo.match(/step === "target"/g) ?? []).length).toBeGreaterThan(0);
  });

  it("ESTRUCTURAL · el córner nunca se crea sin pasar por el remate", () => {
    // `handleAction(ActionType.CORNER` solo aparece en la rama de «jugada» y
    // «sin especificar», que no llevan secuencia.
    expect((codigo.match(/handleAction\(ActionType\.CORNER/g) ?? []).length).toBe(1);
  });
});

// ── 3 · LA FASE SE MUEVE UNA VEZ ────────────────────────────────────────

describe("3 · 21 · una jugada, una transición de fase", () => {
  it("handleAction aplica la fase UNA sola vez, al final", () => {
    const ha = codigo.slice(codigo.indexOf("const handleAction = ("), codigo.indexOf("const handleFreeKickPlay"));
    expect((ha.match(/applyPhaseOfPlay\(/g) ?? []).length).toBe(1);
    expect(ha).toContain("applyPhaseOfPlay(nextPhaseAfterEvent(type, isOpponentEvent, phaseAtTap));");
  });

  it("y la gobierna el REMATE, porque es `type` quien decide", () => {
    // Un córner por sí mismo no cambia de fase; un gol sí, y manda él.
    expect(nextPhaseAfterEvent(ActionType.CORNER, false, "attack_positional")).toBe("attack_positional");
    expect(nextPhaseAfterEvent(ActionType.SHOT, false, "attack_positional")).toBe("attack_positional");
    expect(nextPhaseAfterEvent(ActionType.GOAL, false, "attack_positional")).toBe("defense_organized");
    // Un gol directo del rival nos deja sacando a nosotros, como cualquier gol.
    expect(nextPhaseAfterEvent(ActionType.GOAL, true, "defense_organized")).toBe("attack_positional");
  });

  it("los dos eventos se quedan con la fase que HABÍA, no con la siguiente", () => {
    // Solo la parte de `handleAction` que construye los eventos: la fase se
    // lee ANTES de crearlos y se mueve DESPUÉS de guardarlos.
    const construccion = trozo(
      "const newEvent: GameEvent = {",
      "setMatchData((prev) => {",
    );
    expect(construccion).toContain("...(phaseAtTap ? { phaseOfPlay: phaseAtTap } : {}),");
    // Dos veces: el remate y su córner.
    expect((construccion.match(/phaseOfPlay: phaseAtTap/g) ?? []).length).toBe(2);
  });
});

// ── 4 · BORRAR Y DESHACER SE LLEVAN LA JUGADA ENTERA ────────────────────

describe("4 · 18-19 · deshacer y borrar eliminan las dos mitades", () => {
  const borrado = trozo("const handleDeleteEvent = (event: GameEvent)", "deleteEventRef.current = handleDeleteEvent;");

  it("el borrado resuelve la secuencia antes de tocar nada", () => {
    expect(borrado).toContain("const aBorrar = sequenceOf(prev.events, event);");
    expect(borrado).toContain("const idsABorrar = new Set(aBorrar.map((e) => e.id));");
  });

  it("deshace las estadísticas de CADA evento, no solo del tocado", () => {
    expect(borrado).toContain("for (const event of aBorrar) {");
    expect((borrado.match(/for \(const event of aBorrar\) \{/g) ?? []).length).toBe(2);
    expect(borrado).toContain("nextFouls = applyFoulToCounters(nextFouls, event, -1);");
  });

  it("y los quita todos de la lista", () => {
    expect(borrado).toContain("events: prev.events.filter((e) => !idsABorrar.has(e.id)),");
    expect(borrado).not.toContain("events: prev.events.filter((e) => e.id !== event.id),");
  });

  it("18 · «Deshacer» pasa por el mismo borrado, así que se lleva los dos", () => {
    const undo = trozo("const undoLastRegistered = ()", "const deleteEventRef");
    expect(undo).toContain("deleteEventRef.current?.(event);");
  });

  it("ESTRUCTURAL · el borrado individual de un evento suelto no cambia", () => {
    // `sequenceOf` devuelve `[event]` cuando no hay vínculo: misma ruta, mismo
    // resultado que antes para todo lo que no sea una jugada encadenada.
    const suelto: GameEvent = {
      id: "x", timestamp: 0, wallClock: 0, period: Period.FIRST, playerIds: [],
      type: ActionType.FOUL, gameState: GameState.FOUR_VS_FOUR, metadata: { isOpponent: false },
    };
    expect(sequenceOf([suelto], suelto)).toEqual([suelto]);
  });

  it("y el diálogo avisa ANTES de confirmar", () => {
    expect(codigo).toContain("data-delete-sequence-warning");
    expect(fuente).toContain("se eliminarán el córner y su remate");
  });
});

// ── 5 · EL PASO DEL LANZADOR ────────────────────────────────────────────

describe("5 · 7-8 · «¿Quién saca/chuta?»", () => {
  it("el rótulo lo dice con esas palabras", () => {
    expect(fuente).toContain('? "¿Quién saca/chuta?"');
    expect(codigo).toContain("pendingAction.corner");
  });

  it("se pregunta TAMBIÉN para el rival, que en un tiro normal se salta", () => {
    expect(codigo).toContain("!pendingAction.corner &&");
    // Y el flujo entra siempre por el paso del jugador.
    const handleCorner = trozo("const handleCorner = (", "const registrarTiro = (");
    expect(handleCorner).toContain('step: "player"');
  });

  it("el selector ofrece solo la plantilla del equipo que saca", () => {
    // `anyTeam` NO se activa: el lado del córner —izquierda o derecha— se
    // eligió desde la perspectiva de ese equipo, y cambiar de equipo a mitad
    // del flujo cambiaría lo que significa el lado ya elegido.
    const handleCorner = trozo("const handleCorner = (", "const registrarTiro = (");
    expect(handleCorner).not.toContain("anyTeam");
  });

  it("y «Atrás» desde ese paso devuelve a elegir cómo se ejecuta", () => {
    expect(codigo).toContain("data-corner-shot-back");
    expect(codigo).toContain("setPendingCorner({ isOpponent, side });");
  });
});

// ── 5 bis · LO QUE NO SE PUEDE ELEGIR DENTRO DE LA SECUENCIA ───────────

describe("5 bis · ESTRUCTURAL · la jugada no puede contradecirse a sí misma", () => {
  it("la procedencia queda fijada a «córner» y no se puede cambiar", () => {
    // Con el selector abierto se podía guardar un tiro que dijera «penalti»
    // mientras se le adjuntaba un córner —y, de paso, saltarse la zona de
    // origen, porque un penalti no la pide—.
    expect(codigo).toContain('data-set-piece-locked="corner"');
    expect(codigo).toContain("acceptsTarget(pendingAction.type) && pendingAction.corner && (");
    expect(codigo).toContain("acceptsTarget(pendingAction.type) && !pendingAction.corner && (");
  });

  it("y no se ofrece convertirlo en gol en propia", () => {
    // Un gol en propia no es un intento de tiro, así que la secuencia se
    // quedaría sin remate; y además borra la procedencia.
    const conmutador = trozo(
      "pendingAction.type === ActionType.OWN_GOAL) &&",
      "data-goal-kind",
    );
    expect(conmutador).toContain("!pendingAction.corner && (");
  });

  it("el remate siempre llega con su zona, así que handleAction no lo devuelve a pedirla", () => {
    // Si volviera al paso de origen, `secuenciaCorner` se perdería con el
    // return y el córner no llegaría a existir.
    const registrar = trozo("const registrarTiro = (", "const handleAction = (");
    expect(registrar).toContain("...(origenReglamentario ? {} : { originGrid: current.originGrid })");
    // Y «córner» NO es una procedencia reglamentaria: siempre pide zona.
    expect(isRuleDeterminedOrigin("corner")).toBe(false);
    expect(shouldAskOriginZone(ActionType.SHOT, "corner")).toBe(true);
  });
});

// ── 6 · UNA JUGADA, UN RENGLÓN ──────────────────────────────────────────

describe("6 · el Historial no enseña dos acciones sueltas", () => {
  it("el córner de una secuencia no pinta su propia fila si su remate está", () => {
    expect(codigo).toContain("!isSequencedCorner(e) ||");
    expect(codigo).toContain("!finisherOfSequence(matchData.events, sequenceIdOf(e)!)");
  });

  it("y la fila del remate lleva la frase compuesta", () => {
    expect(codigo).toContain("describeCornerSequence(");
    expect(codigo).toContain("data-timeline-label");
    expect(codigo).toContain("data-sequence={sequenceIdOf(e) ?? undefined}");
  });

  it("la confirmación con «Deshacer» también habla de UNA jugada", () => {
    const toast = trozo("data-last-registered", "data-undo-last");
    expect(toast).toContain("describeCornerSequence(");
    expect(toast).toContain("describeRegisteredAction(lastRegistered, matchData)");
  });
});

// ── 7 · 24-25 · LA MISMA PUERTA DESDE LAS TRES VISTAS ───────────────────

describe("7 · 24-25 · focal, columnas y pista 5v5 entran por el mismo sitio", () => {
  it("el botón CÓRNER es uno solo y deriva el bando de la vista activa", () => {
    expect((codigo.match(/data-action-button="corner"/g) ?? []).length).toBe(1);
    expect(codigo).toContain("setPendingCorner({ isOpponent: bandoDeAccion() })");
  });

  it("y `bandoDeAccion` ya resuelve las tres vistas", () => {
    expect(codigo).toContain(
      "dualActive && selectedActor ? selectedActor.isOpponent : pitchView === \"opponent\"",
    );
    expect(codigo).toContain("const dualActive = columnsActive || pitchActive;");
  });

  it("el modal del tiro es el mismo para todas: no hay uno por vista", () => {
    expect((codigo.match(/\{pendingAction && \(/g) ?? []).length).toBe(1);
  });
});

// ── 8 · DEL EVENTO AL INFORME ───────────────────────────────────────────
//
// Aquí ya no se mira el fuente: se construye el partido TAL Y COMO lo deja la
// captura y se comprueba qué dicen las superficies.

const jugador = (id: string, number: number, name: string, opponent: boolean, role = Role.PLAYER) => ({
  id, number, name, role,
  isOnPitch: true, plusMinus: 0, individualTimeSeconds: 0, rotationTimeSeconds: 0,
  isOpponent: opponent,
  stats: {
    goals: 0, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0,
    fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0, saves: 0, conceded: 0,
  },
});

const PLANTILLA = [
  jugador("l7", 7, "Pérez", false),
  jugador("lgk", 1, "Portero Local", false, Role.GOALKEEPER),
  jugador("r9", 9, "Rival Nueve", true),
  jugador("rgk", 13, "Portero Rival", true, Role.GOALKEEPER),
];

const SEQ = "cseq-test-1";

/**
 * El par de eventos exactamente como los deja `handleAction`: mismo reloj,
 * mismo periodo, el córner un milisegundo antes y los dos con el vínculo.
 */
function jugadaDeCorner(opts: {
  tipo: ActionType;
  lado: "left" | "right";
  opponent?: boolean;
  shooter: string;
  targetGk: string;
  destinationGrid?: string;
  goalieResponse?: string;
  seq?: string;
}): GameEvent[] {
  const opponent = !!opts.opponent;
  const seq = opts.seq ?? SEQ;
  const remate: GameEvent = {
    id: `s-${seq}`,
    timestamp: 60000,
    wallClock: 2000,
    period: Period.FIRST,
    playerIds: [opts.shooter, opts.targetGk],
    onPitchPlayerIds: PLANTILLA.map((p) => p.id),
    type: opts.tipo,
    gameState: GameState.FOUR_VS_FOUR,
    phaseOfPlay: "attack_positional",
    originGrid: "Z4R",
    ...(opts.destinationGrid ? { destinationGrid: opts.destinationGrid } : {}),
    attackDirection: "ltr",
    metadata: {
      isOpponent: opponent,
      setPiece: "corner",
      targetGoalkeeperId: opts.targetGk,
      ...(opts.goalieResponse ? { goalieResponse: opts.goalieResponse } : {}),
      sequenceId: seq,
    },
    scoreAtEvent: { team: opts.tipo === ActionType.GOAL && !opponent ? 1 : 0, opponent: 0 },
  };
  const corner: GameEvent = {
    id: `c-${seq}`,
    timestamp: 60000,
    wallClock: 1999,
    period: Period.FIRST,
    playerIds: [],
    onPitchPlayerIds: PLANTILLA.map((p) => p.id),
    type: ActionType.CORNER,
    gameState: GameState.FOUR_VS_FOUR,
    phaseOfPlay: "attack_positional",
    originGrid: opts.lado === "left" ? "Z4L" : "Z4R",
    attackDirection: "ltr",
    metadata: {
      isOpponent: opponent,
      cornerSide: opts.lado,
      setPieceOutcome: "shot",
      sequenceId: seq,
    },
    scoreAtEvent: { team: 0, opponent: 0 },
  };
  return [remate, corner];
}

const partido = (events: GameEvent[]): MatchData => ({
  teamName: "MI EQUIPO",
  opponentName: "RIVAL",
  period: Period.FIRST,
  matchClock: 60000,
  isClockRunning: false,
  fouls: { team: 0, opponent: 0 },
  timeoutsUsed: {
    team: { period1: false, period2: false },
    opponent: { period1: false, period2: false },
  },
  teamDefendsAtKickoff: "left",
  players: PLANTILLA,
  events,
});

describe("8 · los cuatro desenlaces del encargo", () => {
  it("3 · córner derecho → tiro directo fuera", () => {
    const ev = jugadaDeCorner({
      tipo: ActionType.SHOT, lado: "right", shooter: "l7", targetGk: "rgk",
      destinationGrid: "OUT",
    });
    expect(summarizeCorners(ev, false)).toEqual(
      expect.objectContaining({ total: 1, right: 1, left: 0 }),
    );
    const t = summarizeShots(ev);
    expect(t).toEqual(expect.objectContaining({ shots: 1, offTarget: 1, goals: 0, onTarget: 0 }));
    expect(sequenceIsWellFormed(ev, SEQ)).toBe(true);
  });

  it("4 · córner izquierdo → tiro directo a portería", () => {
    const ev = jugadaDeCorner({
      tipo: ActionType.SHOT, lado: "left", shooter: "l7", targetGk: "rgk",
      destinationGrid: "G2",
    });
    expect(summarizeCorners(ev, false)).toEqual(
      expect.objectContaining({ total: 1, left: 1, right: 0 }),
    );
    expect(summarizeShots(ev)).toEqual(
      expect.objectContaining({ shots: 1, onTarget: 1, offTarget: 0 }),
    );
  });

  it("5 · tiro directo detenido por el portero", () => {
    const ev = jugadaDeCorner({
      tipo: ActionType.SHOT, lado: "right", shooter: "l7", targetGk: "rgk",
      destinationGrid: "G5", goalieResponse: GoalieAction.SAVE,
    });
    const t = summarizeShots(ev);
    expect(t.onTarget).toBe(1);
    expect(t.goalkeeperInterventions).toBe(1);
    // La parada se le acredita al portero RIVAL, que es a quien iba el tiro.
    const porteroRival = PLANTILLA.find((p) => p.id === "rgk")!;
    expect(goalieStatsDelta(ev[0], porteroRival).saves).toBe(1);
    // Y no al nuestro.
    const porteroLocal = PLANTILLA.find((p) => p.id === "lgk")!;
    expect(goalieStatsDelta(ev[0], porteroLocal).saves).toBe(0);
  });

  it("6 · tiro directo que termina en gol: un gol, un intento, un córner", () => {
    const ev = jugadaDeCorner({
      tipo: ActionType.GOAL, lado: "right", shooter: "l7", targetGk: "rgk",
      destinationGrid: "G1",
    });
    expect(scoreOf(ev)).toEqual({ team: 1, opponent: 0 });
    expect(summarizeShots(ev)).toEqual(
      expect.objectContaining({ shots: 1, goals: 1, onTarget: 1 }),
    );
    expect(summarizeCorners(ev, false).total).toBe(1);
    // Y NO se ha creado además un SHOT que duplique el intento.
    expect(ev.filter((e) => e.type === ActionType.SHOT)).toHaveLength(0);
    expect(sequenceIsWellFormed(ev, SEQ)).toBe(true);
  });

  it("7 · el lanzador local queda como autor", () => {
    const ev = jugadaDeCorner({
      tipo: ActionType.SHOT, lado: "right", shooter: "l7", targetGk: "rgk", destinationGrid: "G2",
    });
    expect(eventActor(ev[0], PLANTILLA)?.id).toBe("l7");
  });

  it("8 · el lanzador rival queda como autor, y el córner es suyo", () => {
    const ev = jugadaDeCorner({
      tipo: ActionType.SHOT, lado: "left", opponent: true, shooter: "r9", targetGk: "lgk",
      destinationGrid: "G3",
    });
    expect(eventActor(ev[0], PLANTILLA)?.id).toBe("r9");
    expect(summarizeCorners(ev, true).total).toBe(1);
    expect(summarizeCorners(ev, false).total).toBe(0);
  });

  it("9 · el portero objetivo NO se confunde con el lanzador", () => {
    const ev = jugadaDeCorner({
      tipo: ActionType.GOAL, lado: "right", shooter: "l7", targetGk: "rgk", destinationGrid: "G1",
    });
    // Los dos están en playerIds —el autor y el portero que lo encaja—, pero
    // el autor es uno solo y el portero encaja, no marca.
    expect(ev[0].playerIds).toContain("rgk");
    expect(eventActor(ev[0], PLANTILLA)?.id).not.toBe("rgk");
    const porteroRival = PLANTILLA.find((p) => p.id === "rgk")!;
    expect(goalieStatsDelta(ev[0], porteroRival).conceded).toBe(1);
    expect(goalieStatsDelta(ev[0], porteroRival).saves).toBe(0);
  });
});

describe("9 · 22 · las superficies cuentan la jugada sin duplicarla", () => {
  const md = partido(
    jugadaDeCorner({
      tipo: ActionType.GOAL, lado: "right", shooter: "l7", targetGk: "rgk", destinationGrid: "G1",
    }),
  );

  it("el informe cuenta un córner, un tiro desde córner y un gol", () => {
    const r = generateMatchReport(md);
    expect(r.setPieces.corners.team).toEqual(
      expect.objectContaining({ total: 1, shot: 1, play: 0, unrecorded: 0 }),
    );
    expect(r.teamTotals.shotsFromCorner).toBe(1);
    expect(r.score).toEqual({ team: 1, opponent: 0 });
  });

  it("y el gol declara su procedencia, que es lo que lee la cronología", () => {
    const r = generateMatchReport(md);
    expect(r.goalSequence).toHaveLength(1);
    expect(r.goalSequence[0].source).toBe("corner");
  });

  it("el CSV exporta DOS filas y las empareja por la columna «secuencia»", () => {
    const csv = buildActionsCsv(md).replace(/^﻿/, "");
    const filas = csv.split("\n").slice(1);
    expect(filas).toHaveLength(2);
    const conSecuencia = filas.filter((f) => f.includes(SEQ));
    expect(conSecuencia).toHaveLength(2);
    // Una es el córner y la otra el gol: ni la misma dos veces, ni fundidas.
    expect(filas.filter((f) => f.includes('"CORNER"'))).toHaveLength(1);
    expect(filas.filter((f) => f.includes('"GOAL"'))).toHaveLength(1);
  });

  it("y la columna «secuencia» es la última, sin mover ninguna anterior", () => {
    const cabecera = buildActionsCsv(md).replace(/^﻿/, "").split("\n")[0];
    const columnas = cabecera.split(",").map((c) => c.replace(/"/g, ""));
    expect(columnas[20]).toBe("fase");
    expect(columnas[21]).toBe("gol_para");
    expect(columnas[columnas.length - 1]).toBe("secuencia");
  });

  it("el JSON conserva el vínculo en los dos eventos", () => {
    const parsed = JSON.parse(buildMatchJson(md));
    const ids = parsed.events.map((e: GameEvent) => e.metadata?.sequenceId);
    expect(ids).toEqual([SEQ, SEQ]);
  });

  it("el payload de Tactical Pro lleva los dos eventos y explica el vínculo", () => {
    const payload = buildTacticalProPayload(md);
    expect(payload.matchData.events).toHaveLength(2);
    expect(payload.matchData.events.map((e) => e.metadata?.sequenceId)).toEqual([SEQ, SEQ]);
    const glosario = JSON.stringify(payload.tacticalContext);
    expect(glosario).toContain("metadata.sequenceId");
  });

  it("23 · un partido antiguo, con córner y tiro SIN vínculo, se lee igual que siempre", () => {
    const [remate, corner] = jugadaDeCorner({
      tipo: ActionType.SHOT, lado: "right", shooter: "l7", targetGk: "rgk", destinationGrid: "G2",
    });
    const sinVinculo = [
      { ...remate, metadata: { ...remate.metadata, sequenceId: undefined } },
      { ...corner, metadata: { ...corner.metadata, sequenceId: undefined, setPieceOutcome: undefined } },
    ];
    const viejo = partido(sinVinculo as GameEvent[]);
    const r = generateMatchReport(viejo);
    expect(r.setPieces.corners.team.total).toBe(1);
    // Sin desenlace declarado: no se infiere que fue directo.
    expect(r.setPieces.corners.team.unrecorded).toBe(1);
    expect(r.teamTotals.shotsFromCorner).toBe(1);
    // Y el CSV deja la columna de secuencia vacía, sin inventarla.
    const csv = buildActionsCsv(viejo).replace(/^﻿/, "");
    expect(csv).not.toContain("cseq-");
    expect(csv.split("\n").slice(1).every((f) => f.endsWith('""'))).toBe(true);
  });
});

describe("9 bis · 1-2 · el córner de JUGADA se comporta como siempre", () => {
  const cornerDeJugada = (lado: "left" | "right"): GameEvent => ({
    id: `cj-${lado}`,
    timestamp: 30000,
    wallClock: 500,
    period: Period.FIRST,
    playerIds: [],
    type: ActionType.CORNER,
    gameState: GameState.FOUR_VS_FOUR,
    originGrid: lado === "left" ? "Z4L" : "Z4R",
    metadata: { isOpponent: false, cornerSide: lado, setPieceOutcome: "play" },
  });

  it("no lleva vínculo, no crea tiro y cuenta como córner de jugada", () => {
    for (const lado of ["right", "left"] as const) {
      const md = partido([cornerDeJugada(lado)]);
      expect(sequenceIdOf(md.events[0])).toBeNull();
      expect(summarizeShots(md.events).shots).toBe(0);
      expect(summarizeCornerOutcomes(md.events, false)).toEqual({
        total: 1, shot: 0, play: 1, unrecorded: 0,
      });
      expect(summarizeCorners(md.events, false)).toEqual(
        expect.objectContaining({ total: 1, [lado]: 1 }),
      );
      // Y el CSV lo exporta con su desenlace y la secuencia vacía.
      const fila = buildActionsCsv(md).replace(/^\uFEFF/, "").split("\n")[1];
      expect(fila).toContain('"Jugada"');
      expect(fila.endsWith('""')).toBe(true);
    }
  });

  it("y borrarlo no arrastra nada más", () => {
    const corner = cornerDeJugada("right");
    const otro: GameEvent = {
      id: "t1", timestamp: 1, wallClock: 1, period: Period.FIRST, playerIds: ["l7"],
      type: ActionType.SHOT, gameState: GameState.FOUR_VS_FOUR,
      metadata: { isOpponent: false, setPiece: "corner" },
    };
    expect(sequenceOf([corner, otro], corner)).toEqual([corner]);
  });
});

describe("10 · 20 · la recarga conserva la jugada", () => {
  beforeEach(() => {
    clearMatchSnapshot();
  });

  it("guardar y restaurar devuelve los dos eventos con su vínculo", () => {
    const md = partido(
      jugadaDeCorner({
        tipo: ActionType.GOAL, lado: "left", shooter: "l7", targetGk: "rgk", destinationGrid: "G1",
      }),
    );
    saveMatchSnapshot(md);
    const restaurado = loadMatchSnapshot()!.matchData;

    expect(restaurado.events).toHaveLength(2);
    expect(sequenceIdOf(restaurado.events[0])).toBe(SEQ);
    expect(sequenceIdOf(restaurado.events[1])).toBe(SEQ);
    expect(sequenceIsWellFormed(restaurado.events, SEQ)).toBe(true);
    expect(cornerOfSequence(restaurado.events, SEQ)!.metadata?.cornerSide).toBe("left");
    expect(finisherOfSequence(restaurado.events, SEQ)!.type).toBe(ActionType.GOAL);

    // Y las estadísticas que se derivan de los eventos siguen cuadrando.
    expect(scoreOf(restaurado.events)).toEqual({ team: 1, opponent: 0 });
    expect(summarizeCorners(restaurado.events, false).total).toBe(1);
    expect(summarizeCornerOutcomes(restaurado.events, false).shot).toBe(1);
    expect(countShotsFromSetPiece(restaurado.events, "corner", false)).toBe(1);
  });

  it("19 · borrar la jugada desde el Historial se lleva las dos mitades", () => {
    const eventos = jugadaDeCorner({
      tipo: ActionType.SHOT, lado: "right", shooter: "l7", targetGk: "rgk", destinationGrid: "G2",
    });
    const otros: GameEvent[] = [
      {
        id: "antes", timestamp: 1000, wallClock: 1, period: Period.FIRST, playerIds: ["l7"],
        type: ActionType.STEAL, gameState: GameState.FOUR_VS_FOUR, metadata: { isOpponent: false },
      },
    ];
    const todos = [...eventos, ...otros];

    // Se toca la fila del remate —la única visible— y se resuelve la jugada.
    const aBorrar = sequenceOf(todos, eventos[0]);
    expect(aBorrar.map((e) => e.id).sort()).toEqual([`c-${SEQ}`, `s-${SEQ}`].sort());

    const ids = new Set(aBorrar.map((e) => e.id));
    const quedan = todos.filter((e) => !ids.has(e.id));
    expect(quedan.map((e) => e.id)).toEqual(["antes"]);
    // Y los eventos anteriores y posteriores siguen intactos.
    expect(summarizeShots(quedan).shots).toBe(0);
    expect(summarizeCorners(quedan, false).total).toBe(0);
  });

  it("y tocar la fila del córner da exactamente la misma jugada", () => {
    const eventos = jugadaDeCorner({
      tipo: ActionType.SHOT, lado: "right", shooter: "l7", targetGk: "rgk", destinationGrid: "G2",
    });
    expect(sequenceOf(eventos, eventos[1]).map((e) => e.id).sort()).toEqual(
      sequenceOf(eventos, eventos[0]).map((e) => e.id).sort(),
    );
  });
});
