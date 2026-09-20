/**
 * Contrato estadístico del tiro.
 *
 * EL PARTIDO QUE ORIGINÓ ESTO
 * ---------------------------
 * CD MURCIA 2-4 PR7 daba tres cifras distintas para lo mismo: la estadística
 * general decía que el rival había tirado 5 veces, el mapa de tiros recibidos
 * dibujaba 1, y el informe de porteros contaba 12 remates afrontados. Los
 * tests de abajo fijan que esas magnitudes son distintas entre sí y que
 * ninguna se deduce de otra.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ActionType, GameEvent, GameState, GoalieAction, Period, Role } from "../types/futsal";
import {
  SHOT_OUTCOME_BLOCKED,
  blockedShotMetadata,
  isShotAttempt,
  isShotOutcome,
  shotOutcomeOf,
  shotResolution,
  summarizeShots,
  summarizeTeamShots,
} from "./shotModel";
import { goalieStatsDelta, isAnySave, isUnspecifiedSave } from "./goalkeeperActions";

let seq = 0;
function ev(
  type: ActionType | GoalieAction,
  opts: {
    isOpponent?: boolean;
    destinationGrid?: string;
    period?: Period;
    originGrid?: string;
    playerIds?: string[];
    metadata?: Record<string, any>;
  } = {},
): GameEvent {
  return {
    id: `e${++seq}`,
    timestamp: 0,
    wallClock: 0,
    period: opts.period ?? Period.FIRST,
    playerIds: opts.playerIds ?? [],
    type,
    gameState: GameState.FOUR_VS_FOUR,
    originGrid: opts.originGrid,
    destinationGrid: opts.destinationGrid,
    metadata: { isOpponent: !!opts.isOpponent, ...(opts.metadata ?? {}) },
  };
}

/** Tiro rival a puerta resuelto por nuestro portero, en un solo evento. */
const tiroParado = () =>
  ev(ActionType.SHOT, {
    isOpponent: true,
    destinationGrid: "G5",
    metadata: { goalieResponse: GoalieAction.SAVE, targetGoalkeeperId: "gk" },
    playerIds: ["riv", "gk"],
  });

const golRival = () => ev(ActionType.GOAL, { isOpponent: true, destinationGrid: "G1" });
const tiroFuera = () => ev(ActionType.SHOT, { isOpponent: true, destinationGrid: "OUT" });
const tiroBloqueado = () =>
  ev(ActionType.SHOT, { isOpponent: true, metadata: blockedShotMetadata() });

// ── DESENLACE DECLARADO ────────────────────────────────────────────────

describe("shotOutcome solo guarda lo que destinationGrid no puede decir", () => {
  it("'blocked' es el único valor admitido", () => {
    expect(isShotOutcome("blocked")).toBe(true);
    expect(isShotOutcome("on_target")).toBe(false);
    expect(isShotOutcome("off_target")).toBe(false);
    expect(isShotOutcome(undefined)).toBe(false);
  });

  it("un GOL que trajera el campo lo ignora: su desenlace ya lo dice el tipo", () => {
    const gol = ev(ActionType.GOAL, { metadata: { shotOutcome: "blocked" } });
    expect(shotOutcomeOf(gol)).toBeNull();
    expect(shotResolution(gol)).toBe("goal");
  });

  it("un tiro bloqueado declara además que no hubo intervención del portero", () => {
    // Sin esa marca, el comportamiento histórico —«un tiro que no es OUT lo
    // paró el portero»— le inventaría una parada, porque un bloqueo no lleva
    // destinationGrid.
    expect(blockedShotMetadata()).toEqual({
      shotOutcome: SHOT_OUTCOME_BLOCKED,
      goalieResponse: "UNSPECIFIED",
    });
  });
});

// ── CLASIFICACIÓN DE UN INTENTO ────────────────────────────────────────

describe("cada intento cae en una categoría y solo en una", () => {
  it("12 · tiro fuera: 1 tiro, 1 fuera, 0 intervenciones", () => {
    const t = summarizeShots([tiroFuera()]);
    expect(t.shots).toBe(1);
    expect(t.offTarget).toBe(1);
    expect(t.onTarget).toBe(0);
    expect(t.blocked).toBe(0);
    expect(t.goalkeeperInterventions).toBe(0);
  });

  it("13 · tiro bloqueado: 1 tiro, categoría propia, 0 intervenciones", () => {
    const t = summarizeShots([tiroBloqueado()]);
    expect(t.shots).toBe(1);
    expect(t.blocked).toBe(1);
    expect(t.onTarget).toBe(0);
    expect(t.offTarget).toBe(0);
    expect(t.goalkeeperInterventions).toBe(0);
  });

  it("13b · bloqueado NO es fuera: son dos hechos distintos", () => {
    const t = summarizeShots([tiroFuera(), tiroBloqueado()]);
    expect(t.offTarget).toBe(1);
    expect(t.blocked).toBe(1);
    expect(t.shots).toBe(2);
  });

  it("14 · tiro con parada: 1 tiro a puerta y 1 intervención", () => {
    const t = summarizeShots([tiroParado()]);
    expect(t.shots).toBe(1);
    expect(t.onTarget).toBe(1);
    expect(t.goalkeeperInterventions).toBe(1);
  });

  it("15 · un gol es UN intento, contado una sola vez", () => {
    const t = summarizeShots([golRival()]);
    expect(t.shots).toBe(1);
    expect(t.goals).toBe(1);
    expect(t.onTarget).toBe(1);
    // No se duplica como GOAL + SHOT.
    expect(t.offTarget + t.blocked + t.unrecorded).toBe(0);
  });

  it("20 · destinationGrid se lee del primer nivel del evento, no de metadata", () => {
    // El defecto real: la estadística general leía e.metadata.destinationGrid,
    // que siempre valía undefined, así que «fuera» era siempre 0.
    const enMetadata = ev(ActionType.SHOT, { metadata: { destinationGrid: "OUT" } });
    expect(shotResolution(enMetadata)).not.toBe("off_target");

    const enPrimerNivel = ev(ActionType.SHOT, { destinationGrid: "OUT" });
    expect(shotResolution(enPrimerNivel)).toBe("off_target");
    expect(summarizeShots([enPrimerNivel]).offTarget).toBe(1);
  });

  it("21 · una zona de portería no queda como fuera", () => {
    for (const zona of ["G1", "G5", "g9"]) {
      expect(shotResolution(ev(ActionType.SHOT, { destinationGrid: zona }))).toBe("on_target");
    }
    expect(summarizeShots([ev(ActionType.SHOT, { destinationGrid: "G5" })]).offTarget).toBe(0);
  });

  it("un tiro sin desenlace registrado no se reparte: se declara", () => {
    const t = summarizeShots([ev(ActionType.SHOT, {})]);
    expect(t.shots).toBe(1);
    expect(t.unrecorded).toBe(1);
    expect(t.onTarget + t.offTarget + t.blocked).toBe(0);
  });
});

// ── EL PARTIDO REAL ────────────────────────────────────────────────────

describe("el caso de CD MURCIA, correctamente registrado", () => {
  /** 8 remates parados + 4 goles = 12 tiros A PUERTA. No 16. */
  const doceAPuerta = () => [
    ...Array.from({ length: 8 }, tiroParado),
    ...Array.from({ length: 4 }, golRival),
  ];

  it("16 · 8 paradas + 4 goles son 12 tiros a puerta, no 16", () => {
    const t = summarizeShots(doceAPuerta());
    expect(t.shots).toBe(12);
    expect(t.onTarget).toBe(12);
    expect(t.goals).toBe(4);
    expect(t.goalkeeperInterventions).toBe(8);
    expect(t.resolvedByGoalkeeper).toBe(12);
    expect(t.shots).not.toBe(16);
    expect(t.shots).not.toBe(20);
  });

  it("17 · sumando 3 fuera y 2 bloqueados: 17 totales con las categorías separadas", () => {
    const t = summarizeShots([
      ...doceAPuerta(),
      ...Array.from({ length: 3 }, tiroFuera),
      ...Array.from({ length: 2 }, tiroBloqueado),
    ]);
    expect(t.shots).toBe(17);
    expect(t.onTarget).toBe(12);
    expect(t.offTarget).toBe(3);
    expect(t.blocked).toBe(2);
    expect(t.resolvedByGoalkeeper).toBe(12);
    // Las cinco magnitudes no son la misma y no se deducen entre sí.
    expect(t.onTarget + t.offTarget + t.blocked).toBe(t.shots);
    expect(t.goalkeeperInterventions).not.toBe(t.shots);
  });

  it("nunca vuelve a decir que el rival tiró 5 veces", () => {
    // La cifra vieja salía de contar solo GOAL + SHOT sueltos. Con la captura
    // corregida, los 8 remates parados también son tiros del rival.
    const t = summarizeTeamShots(doceAPuerta(), true);
    expect(t.shots).toBe(12);
    expect(t.shots).toBeGreaterThan(5);
  });

  it("y el recuento propio no se contamina con los tiros del rival", () => {
    const eventos = [...doceAPuerta(), ev(ActionType.SHOT, { destinationGrid: "G2" })];
    expect(summarizeTeamShots(eventos, false).shots).toBe(1);
    expect(summarizeTeamShots(eventos, true).shots).toBe(12);
  });
});

// ── SIN DOBLE CONTEO Y SIN INVENTAR ────────────────────────────────────

describe("ni se cuenta dos veces ni se inventa lo que no se registró", () => {
  it("23 · un tiro con respuesta del portero es UN tiro y UNA intervención", () => {
    const t = summarizeShots([tiroParado()]);
    expect(t.shots).toBe(1);
    expect(t.goalkeeperInterventions).toBe(1);
  });

  it("23b · la parada se acredita al portero objetivo exactamente una vez", () => {
    const tiro = tiroParado();
    const nuestroPortero = { id: "gk", role: Role.GOALKEEPER, isOpponent: false };
    const porteroRival = { id: "gkRival", role: Role.GOALKEEPER, isOpponent: true };
    expect(goalieStatsDelta(tiro, nuestroPortero).saves).toBe(1);
    expect(goalieStatsDelta(tiro, porteroRival).saves).toBe(0);
  });

  it("18 · 8 paradas manuales del portero NO crean 8 tiros rivales", () => {
    const paradas = Array.from({ length: 8 }, () =>
      ev(GoalieAction.SAVE, { isOpponent: false, playerIds: ["gk"] }),
    );
    expect(summarizeTeamShots(paradas, true).shots).toBe(0);
    expect(summarizeTeamShots(paradas, false).shots).toBe(0);
    for (const p of paradas) expect(isShotAttempt(p)).toBe(false);
    // Siguen siendo paradas para el informe de portero: no se pierden.
    expect(paradas.every(isAnySave)).toBe(true);
  });

  it("19 · una salida del portero nunca implica un tiro rival", () => {
    const salida = ev(GoalieAction.EXIT, { isOpponent: false, playerIds: ["gk"] });
    expect(isShotAttempt(salida)).toBe(false);
    expect(summarizeTeamShots([salida], true).shots).toBe(0);
  });

  it("un tiro bloqueado no se convierte en parada del portero contrario", () => {
    const bloqueado = ev(ActionType.SHOT, {
      isOpponent: true,
      playerIds: ["riv", "gk"],
      metadata: { ...blockedShotMetadata(), targetGoalkeeperId: "gk" },
    });
    expect(isUnspecifiedSave(bloqueado)).toBe(false);
    expect(isAnySave(bloqueado)).toBe(false);
    expect(
      goalieStatsDelta(bloqueado, { id: "gk", role: Role.GOALKEEPER, isOpponent: false }).saves,
    ).toBe(0);
  });
});

// ── HISTÓRICOS ─────────────────────────────────────────────────────────

describe("24-25 · los partidos anteriores se siguen leyendo, sin migrar nada", () => {
  it("un tiro histórico sin shotOutcome conserva su lectura de siempre", () => {
    const aPuerta = ev(ActionType.SHOT, { isOpponent: true, destinationGrid: "G3" });
    const fuera = ev(ActionType.SHOT, { isOpponent: true, destinationGrid: "OUT" });
    expect(shotOutcomeOf(aPuerta)).toBeNull();
    expect(shotResolution(aPuerta)).toBe("on_target");
    expect(shotResolution(fuera)).toBe("off_target");
  });

  it("el fallback histórico del portero sigue vivo para eventos sin declaración", () => {
    // Un tiro rival antiguo, a puerta y sin respuesta declarada, se sigue
    // leyendo como parada. Esa regla no se toca: de ella dependen los
    // partidos ya guardados.
    const historico = ev(ActionType.SHOT, {
      isOpponent: true,
      destinationGrid: "G5",
      playerIds: ["riv", "gk"],
    });
    expect(isUnspecifiedSave(historico)).toBe(true);
  });

  it("no existe ninguna conversión de paradas históricas en tiros", () => {
    const fuente = fs.readFileSync(path.resolve(__dirname, "shotModel.ts"), "utf-8");
    const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const prohibido of ["SAVE_PARRY", "isAnySave", "migrat", "reconstru"]) {
      expect(codigo).not.toContain(prohibido);
    }
  });
});

// ── GUARDIA SOBRE EL CÓDIGO REAL ───────────────────────────────────────

describe("la lectura incorrecta de destinationGrid no puede volver", () => {
  const FUENTES = [
    "../pages/MatchTracker.tsx",
    "../pages/MatchAnalysis.tsx",
    "../services/matchZonesService.ts",
    "../components/export/ZoneMapBoard.tsx",
  ];

  it("ningún archivo vuelve a leer el destino desde metadata de un evento", () => {
    for (const rel of FUENTES) {
      const fuente = fs.readFileSync(path.resolve(__dirname, rel), "utf-8");
      const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      // `metadata?.destinationGrid` sobre un GameEvent siempre es undefined:
      // el campo vive en el primer nivel. Se permite `metadata.destinationGrid`
      // solo cuando `metadata` es el argumento de opciones de handleAction,
      // que sí lo lleva arriba — y ese caso se escribe sin `e?.`/`event.`.
      expect(codigo).not.toMatch(/\b(e|ev|event)\s*\??\.\s*metadata\s*\??\.\s*destinationGrid/);
    }
  });
});

// ── EL FLUJO DE CAPTURA ────────────────────────────────────────────────
//
// MatchTracker son 8.000 líneas y no se puede montar en jsdom, así que el
// flujo se fija leyendo el fuente — el mismo patrón de reportPagination y
// squadModel. Es la única forma de que una reordenación de los pasos vuelva
// a fallar aquí y no en el pabellón.

describe("el tiro se registra por su desenlace, y el portero se pregunta después", () => {
  const matchTracker = fs.readFileSync(
    path.resolve(__dirname, "../pages/MatchTracker.tsx"),
    "utf-8",
  );

  it("elegir origen lleva al destino, nunca directamente a la respuesta del portero", () => {
    expect(matchTracker).toMatch(/originGrid: id,\s*\n\s*step: "target",/);
    expect(matchTracker).not.toMatch(/step: ofreceRespuesta \? "response" : "target"/);
  });

  it("la respuesta del portero solo se pregunta si el balón fue entre los tres palos", () => {
    expect(matchTracker).toMatch(/id !== "OUT" &&\s*\n\s*!!goalieRespondingToShot/);
    expect(matchTracker).toMatch(/step: "response"/);
  });

  it("la pantalla de desenlace separa FUERA de BLOQUEADO", () => {
    expect(matchTracker).toContain("Bloqueado");
    expect(matchTracker).toContain("onBlocked={() => registrarTiro({ blocked: true })}");
    // El botón que confundía los dos hechos bajo una sola etiqueta. Se mira
    // el CÓDIGO: el comentario que explica el defecto sí lo cita.
    const codigo = matchTracker.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(codigo).not.toContain("Tiro Fuera / Desviado");
  });

  it("la salida del portero es un desenlace del tiro, no una respuesta con destino", () => {
    expect(matchTracker).toContain("showExit={");
    expect(matchTracker).toMatch(/onExit=\{\(\) =>\s*\n?\s*setPendingAction\(\(prev\) => \(\{ \.\.\.prev!, step: "exitOutcome" \}\)\)/);
  });

  it("GOL reutiliza ActionType.GOAL: no hay un sistema de gol nuevo", () => {
    expect(matchTracker).toMatch(/onGoal=\{[\s\S]{0,200}type: ActionType\.GOAL,/);
  });

  it("todo el registro pasa por un único punto", () => {
    expect(matchTracker).toContain("const registrarTiro = (opts: {");
    // Un tiro bloqueado NO lleva destinationGrid: no sabemos a dónde iba.
    expect(matchTracker).toContain("...(!opts.blocked && destinationGrid ? { destinationGrid } : {})");
    expect(matchTracker).toContain("...(opts.blocked ? blockedShotMetadata() : {})");
  });

  it("una parada registrada desde el radial del portero no crea ningún tiro rival", () => {
    // El radial del portero emite GoalieAction.*, nunca ActionType.SHOT.
    const radial = fs.readFileSync(
      path.resolve(__dirname, "../components/PlayerActionRadialMenu.tsx"),
      "utf-8",
    );
    const codigo = radial.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(codigo).not.toMatch(/onAction\(\s*ActionType\.SHOT[\s\S]{0,80}GoalieAction/);
    expect(codigo).toContain("onAction(GoalieAction.EXIT, player.id");
  });

  it("la estadística general lee el contrato, no su propio criterio", () => {
    expect(matchTracker).toContain("const shotTally = summarizeShots(teamShotsEvents);");
    expect(matchTracker).toContain("const totalShotsBlocked = shotTally.blocked;");
    expect(matchTracker).toContain(
      "const totalGkInterventions = shotTally.goalkeeperInterventions;",
    );
  });
});

describe("los mapas por parte llegan a las superficies de informe", () => {
  it("el PDF Global tiene su página de tiros por parte", () => {
    const matchTracker = fs.readFileSync(
      path.resolve(__dirname, "../pages/MatchTracker.tsx"),
      "utf-8",
    );
    expect(matchTracker).toContain("<PeriodShotMapsBoard events={matchData.events} opponent={false} />");
    expect(matchTracker).toContain("<PeriodShotMapsBoard events={matchData.events} opponent={true} />");
  });

  it("la pantalla de postpartido también", () => {
    const analysis = fs.readFileSync(
      path.resolve(__dirname, "../pages/MatchAnalysis.tsx"),
      "utf-8",
    );
    expect(analysis).toContain("<PeriodShotMapsBoard");
    expect(analysis).toContain("opponent={zoneOpponent}");
  });

  it("no se ha añadido ningún campo de periodo al modelo de datos", () => {
    const tipos = fs.readFileSync(path.resolve(__dirname, "../types/futsal.ts"), "utf-8");
    for (const prohibido of ["shotPeriod", "periodLabel", "halfIndex"]) {
      expect(tipos).not.toContain(prohibido);
    }
    expect(tipos).toContain("period: Period;");
  });
});
