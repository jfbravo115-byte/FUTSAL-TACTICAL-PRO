/**
 * El modelo de gol: quién marcó, a quién le suma y cómo queda el marcador.
 *
 * Lo que se protege aquí es la distinción que el gol en propia introduce y que
 * antes no existía: el equipo del AUTOR y el equipo del BENEFICIARIO pueden
 * ser contrarios. Todo lo demás del proyecto —tiros, conversión, goleadores,
 * zonas— sigue preguntando por producción ofensiva, que es otra cosa, y hay
 * guardias explícitas para que siga siéndolo.
 */
import { describe, expect, it } from "vitest";
import { ActionType, GameEvent, GameState, GoalieAction, Period } from "../types/futsal";
import {
  EMPTY_SCORE,
  actorSide,
  beneficiarySide,
  concededBy,
  describeOwnGoalActor,
  describeOwnGoalBenefit,
  goalEvents,
  goalsFor,
  isGoalEvent,
  isOffensiveGoal,
  isOwnGoal,
  scoreAfterAdding,
  scoreOf,
  scoresFor,
  sideName,
} from "./goalModel";
import { isShotAttempt, isShotGoal, summarizeShots } from "./shotModel";

let n = 0;
const ev = (
  type: ActionType | GoalieAction,
  opp: boolean,
  extra: Partial<GameEvent> = {},
): GameEvent => ({
  id: `e${n++}`,
  timestamp: 1000 * n,
  wallClock: 1_700_000_000_000 + n,
  period: Period.FIRST,
  playerIds: [],
  type,
  gameState: GameState.FOUR_VS_FOUR,
  metadata: { isOpponent: opp },
  ...extra,
});

const gol = (opp: boolean) => ev(ActionType.GOAL, opp);
const propia = (opp: boolean) => ev(ActionType.OWN_GOAL, opp);
const encajado = (opp: boolean) => ev(GoalieAction.GOAL_CONCEDED, opp);

// ── 1 · LAS TRES PREGUNTAS ──────────────────────────────────────────────

describe("1 · autor, beneficiario y quien encaja", () => {
  it("en un gol normal el autor y el beneficiario coinciden", () => {
    expect(actorSide(gol(false))).toBe("team");
    expect(beneficiarySide(gol(false))).toBe("team");
    expect(concededBy(gol(false))).toBe("opponent");

    expect(actorSide(gol(true))).toBe("opponent");
    expect(beneficiarySide(gol(true))).toBe("opponent");
    expect(concededBy(gol(true))).toBe("team");
  });

  it("en un gol en propia son CONTRARIOS", () => {
    // Lo mete un jugador nuestro: suma el rival.
    expect(actorSide(propia(false))).toBe("team");
    expect(beneficiarySide(propia(false))).toBe("opponent");
    expect(concededBy(propia(false))).toBe("team");

    // Lo mete un jugador rival: sumamos nosotros.
    expect(actorSide(propia(true))).toBe("opponent");
    expect(beneficiarySide(propia(true))).toBe("team");
    expect(concededBy(propia(true))).toBe("opponent");
  });

  it("quien encaja es SIEMPRE el contrario del beneficiario", () => {
    for (const e of [gol(false), gol(true), propia(false), propia(true), encajado(true)]) {
      expect(concededBy(e)).not.toBe(beneficiarySide(e));
    }
  });

  it("el gol en propia lo encaja quien lo comete, no el beneficiario", () => {
    expect(concededBy(propia(false))).toBe(actorSide(propia(false)));
  });
});

// ── 2 · EL MARCADOR ─────────────────────────────────────────────────────

describe("2 · marcador", () => {
  it("un gol en propia nuestro sube al RIVAL", () => {
    expect(scoreOf([propia(false)])).toEqual({ team: 0, opponent: 1 });
  });

  it("un gol en propia del rival sube a NUESTRO equipo", () => {
    expect(scoreOf([propia(true)])).toEqual({ team: 1, opponent: 0 });
  });

  it("suma exactamente uno: ni dos ni medio", () => {
    expect(scoreOf([propia(false), propia(false), propia(true)])).toEqual({
      team: 1,
      opponent: 2,
    });
  });

  it("convive con los goles normales sin contarlos dos veces", () => {
    const eventos = [gol(false), gol(false), gol(true), propia(false), propia(true)];
    expect(scoreOf(eventos)).toEqual({ team: 3, opponent: 2 });
    expect(goalEvents(eventos)).toHaveLength(5);
  });

  it("el GOAL_CONCEDED histórico sigue leyéndose igual que siempre", () => {
    expect(scoreOf([encajado(true)])).toEqual({ team: 0, opponent: 1 });
    // Y no se duplica con el GOAL del rival: los dos tipos no coexisten para
    // un mismo gol, pero si alguien los mezclara serían dos goles distintos.
    expect(scoreOf([encajado(true), gol(true)])).toEqual({ team: 0, opponent: 2 });
  });

  it("sin eventos, sin invenciones", () => {
    expect(scoreOf([])).toEqual(EMPTY_SCORE);
    expect(scoreOf(undefined)).toEqual(EMPTY_SCORE);
    expect(scoreOf(null)).toEqual(EMPTY_SCORE);
  });

  it("lo que no es gol no toca el marcador", () => {
    const ruido = [
      ev(ActionType.SHOT, false),
      ev(ActionType.FOUL, true),
      ev(ActionType.STEAL, false),
      ev(GoalieAction.SAVE, false),
      ev(ActionType.CORNER, true),
    ];
    expect(scoreOf(ruido)).toEqual(EMPTY_SCORE);
    expect(ruido.every((e) => !isGoalEvent(e))).toBe(true);
  });

  it("goalsFor y scoresFor dicen lo mismo que el marcador", () => {
    const eventos = [gol(false), propia(false), propia(true)];
    expect(goalsFor(eventos, "team")).toBe(2);
    expect(goalsFor(eventos, "opponent")).toBe(1);
    expect(eventos.filter((e) => scoresFor(e, "team"))).toHaveLength(2);
  });
});

// ── 3 · NO ES PRODUCCIÓN OFENSIVA ───────────────────────────────────────

describe("3 · un gol en propia no es un tiro de nadie", () => {
  it("queda fuera de isShotAttempt, sin excepciones repartidas", () => {
    expect(isShotAttempt(propia(false))).toBe(false);
    expect(isShotAttempt(propia(true))).toBe(false);
    expect(isShotGoal(propia(false))).toBe(false);
    // …mientras que un gol normal sigue siendo un intento.
    expect(isShotAttempt(gol(false))).toBe(true);
  });

  it("no sube tiros, ni precisión, ni conversión del beneficiario", () => {
    // Cuatro tiros del rival, uno dentro, más un gol en propia nuestro.
    const rival = [
      ev(ActionType.SHOT, true, { destinationGrid: "G5" }),
      ev(ActionType.SHOT, true, { destinationGrid: "OUT" }),
      ev(ActionType.SHOT, true, { destinationGrid: "OUT" }),
      gol(true),
    ];
    const sinPropia = summarizeShots(rival);
    const conPropia = summarizeShots([...rival, propia(false)]);
    expect(conPropia).toEqual(sinPropia);
    expect(conPropia.shots).toBe(4);
    expect(conPropia.goals).toBe(1);
  });

  it("isOffensiveGoal lo separa del gol de verdad", () => {
    expect(isOffensiveGoal(gol(false))).toBe(true);
    expect(isOffensiveGoal(encajado(true))).toBe(true);
    expect(isOffensiveGoal(propia(false))).toBe(false);
    // …pero los dos suben al marcador.
    expect(isGoalEvent(propia(false))).toBe(true);
  });

  it("isOwnGoal solo es cierto para el tipo propio", () => {
    expect(isOwnGoal(propia(true))).toBe(true);
    expect(isOwnGoal(gol(true))).toBe(false);
    expect(isOwnGoal(encajado(true))).toBe(false);
  });
});

// ── 4 · EL MARCADOR AL REGISTRAR ────────────────────────────────────────

describe("4 · scoreAfterAdding", () => {
  it("incluye el gol que se está registrando", () => {
    expect(scoreAfterAdding([gol(false)], propia(false))).toEqual({ team: 1, opponent: 1 });
    expect(scoreAfterAdding([gol(false)], propia(true))).toEqual({ team: 2, opponent: 0 });
  });

  it("un evento que no es gol deja el marcador como estaba", () => {
    expect(scoreAfterAdding([gol(false)], ev(ActionType.SHOT, false))).toEqual({
      team: 1,
      opponent: 0,
    });
  });

  it("y coincide con recalcular el partido entero", () => {
    const previos = [gol(false), propia(true), gol(true)];
    const nuevo = propia(false);
    expect(scoreAfterAdding(previos, nuevo)).toEqual(scoreOf([...previos, nuevo]));
  });
});

// ── 5 · DESHACER ────────────────────────────────────────────────────────

describe("5 · deshacer devuelve el marcador exacto", () => {
  it("quitar el gol en propia restaura el resultado anterior", () => {
    const previos = [gol(false), gol(true)];
    const propio = propia(false);
    const con = [...previos, propio];
    expect(scoreOf(con)).toEqual({ team: 1, opponent: 2 });
    expect(scoreOf(con.filter((e) => e.id !== propio.id))).toEqual(scoreOf(previos));
  });

  it("y no deja residuo aunque se borre el del medio", () => {
    const a = gol(false), b = propia(false), c = gol(false);
    expect(scoreOf([a, b, c].filter((e) => e.id !== b.id))).toEqual({ team: 2, opponent: 0 });
  });
});

// ── 6 · PRESENTACIÓN ────────────────────────────────────────────────────

describe("6 · cómo se escribe", () => {
  it("con autor identificado", () => {
    expect(describeOwnGoalActor(7, "Pérez")).toBe("Gol en propia de #7 Pérez");
  });

  it("sin autor NO se inventa ninguno", () => {
    expect(describeOwnGoalActor(null, null)).toBe("Gol en propia — jugador no identificado");
    expect(describeOwnGoalActor(null, "")).toBe("Gol en propia — jugador no identificado");
  });

  it("la confirmación dice las dos cosas contrarias que hay que comprobar", () => {
    expect(
      describeOwnGoalBenefit("CD MURCIA", "PR7", { number: 7, name: "Pérez" }),
    ).toBe("Gol en propia de #7 Pérez (CD MURCIA) → gol para PR7");
  });

  it("y también sin autor", () => {
    expect(describeOwnGoalBenefit("CD MURCIA", "PR7")).toBe(
      "Gol en propia — jugador no identificado (CD MURCIA) → gol para PR7",
    );
  });

  it("sideName traduce el lado al nombre del partido", () => {
    const names = { teamName: "CD MURCIA", opponentName: "PR7" };
    expect(sideName("team", names)).toBe("CD MURCIA");
    expect(sideName(beneficiarySide(propia(false)), names)).toBe("PR7");
  });
});

// ── 7 · COMPATIBILIDAD ──────────────────────────────────────────────────

describe("7 · partidos anteriores", () => {
  it("un partido sin OWN_GOAL se lee exactamente igual que antes", () => {
    const antiguo = [gol(false), gol(false), gol(true), encajado(true)];
    expect(scoreOf(antiguo)).toEqual({ team: 2, opponent: 2 });
    expect(antiguo.every((e) => !isOwnGoal(e))).toBe(true);
  });

  it("un evento sin metadata se atribuye a nuestro equipo, como siempre", () => {
    const sinMeta = { ...gol(false) };
    delete (sinMeta as Partial<GameEvent>).metadata;
    expect(actorSide(sinMeta)).toBe("team");
    expect(scoreOf([sinMeta])).toEqual({ team: 1, opponent: 0 });
  });
});
