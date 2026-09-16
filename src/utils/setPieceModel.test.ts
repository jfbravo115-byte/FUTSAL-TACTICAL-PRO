/**
 * Modelo de balón parado.
 *
 * Dos preguntas distintas que no deben mezclarse:
 *   setPieceOutcome  ¿cómo se ejecutó este córner / esta falta?
 *   setPiece         ¿de dónde procede este tiro?
 *
 * Y una regla que es la razón de ser del diseño: la ausencia del campo es un
 * dato válido — "no registrado" —, nunca una estimación.
 */
import { describe, expect, it } from "vitest";
import { ActionType, GameEvent, GoalieAction, Period } from "../types/futsal";
import {
  SET_PIECE_ORIGINS,
  acceptsSetPieceOutcome,
  declaredSetPieceOrigin,
  describeSetPieceOutcomes,
  formatSetPieceOrigin,
  formatSetPieceOutcome,
  isSetPieceOrigin,
  isSetPieceOutcome,
  setPieceOriginOf,
  setPieceOutcomeOf,
  summarizeSetPieceOutcomes,
} from "./setPieceModel";

function event(overrides: Partial<GameEvent> = {}): GameEvent {
  return {
    id: `e-${Math.random()}`,
    timestamp: 0,
    wallClock: 0,
    period: Period.FIRST,
    playerIds: [],
    type: ActionType.CORNER,
    gameState: "4vs4" as any,
    ...overrides,
  };
}

const corner = (outcome?: "shot" | "play", opponent = false) =>
  event({
    type: ActionType.CORNER,
    originGrid: "Z4L" as any,
    metadata: { isOpponent: opponent, cornerSide: "left", ...(outcome ? { setPieceOutcome: outcome } : {}) },
  });

const foul = (outcome?: "shot" | "play", opponent = false) =>
  event({
    type: ActionType.FOUL,
    metadata: { isOpponent: opponent, ...(outcome ? { setPieceOutcome: outcome } : {}) },
  });

describe("desenlace del balón parado", () => {
  it("acepta solo tiro y jugada", () => {
    expect(isSetPieceOutcome("shot")).toBe(true);
    expect(isSetPieceOutcome("play")).toBe(true);
    for (const inventado of ["unknown", "UNSPECIFIED", "SHOT", "", null, undefined, 1]) {
      expect(isSetPieceOutcome(inventado)).toBe(false);
    }
  });

  it("lee el desenlace de un córner y de una falta", () => {
    expect(setPieceOutcomeOf(corner("shot"))).toBe("shot");
    expect(setPieceOutcomeOf(foul("play"))).toBe("play");
  });

  it("un evento histórico sin el campo no tiene desenlace, y no se inventa", () => {
    expect(setPieceOutcomeOf(corner())).toBeNull();
    expect(setPieceOutcomeOf(foul())).toBeNull();
    expect(formatSetPieceOutcome(corner())).toBeNull();
  });

  it("nunca muestra el valor interno", () => {
    expect(formatSetPieceOutcome(corner("shot"))).toBe("Tiro");
    expect(formatSetPieceOutcome(foul("play"))).toBe("Jugada");
  });

  it("solo el córner y la falta admiten desenlace", () => {
    expect(acceptsSetPieceOutcome(ActionType.CORNER)).toBe(true);
    expect(acceptsSetPieceOutcome(ActionType.FOUL)).toBe(true);
    for (const otro of [ActionType.SHOT, ActionType.GOAL, ActionType.STEAL, GoalieAction.EXIT]) {
      expect(acceptsSetPieceOutcome(otro)).toBe(false);
    }
  });
});

describe("procedencia del tiro", () => {
  it("conserva la taxonomía anterior y añade el córner", () => {
    expect(SET_PIECE_ORIGINS).toEqual(["normal", "free_kick", "corner", "penalty", "double_penalty"]);
    for (const id of SET_PIECE_ORIGINS) expect(isSetPieceOrigin(id)).toBe(true);
    expect(isSetPieceOrigin("banda")).toBe(false);
  });

  it("free_kick sigue funcionando exactamente igual que antes", () => {
    const tiro = event({ type: ActionType.SHOT, metadata: { setPiece: "free_kick" } });
    expect(setPieceOriginOf(tiro)).toBe("free_kick");
    expect(declaredSetPieceOrigin(tiro)).toBe("free_kick");
    expect(formatSetPieceOrigin(tiro)).toBe("Falta");
  });

  it("un tiro desde córner se declara como tal", () => {
    const tiro = event({ type: ActionType.SHOT, metadata: { setPiece: "corner" } });
    expect(setPieceOriginOf(tiro)).toBe("corner");
    expect(formatSetPieceOrigin(tiro)).toBe("Córner");
  });

  it("una jugada normal o un tiro sin campo no llevan etiqueta", () => {
    expect(formatSetPieceOrigin(event({ type: ActionType.SHOT, metadata: { setPiece: "normal" } }))).toBeNull();
    expect(formatSetPieceOrigin(event({ type: ActionType.SHOT }))).toBeNull();
    expect(setPieceOriginOf(event({ type: ActionType.SHOT }))).toBe("normal");
  });

  it("un valor desconocido se lee como jugada, no rompe la lectura", () => {
    expect(setPieceOriginOf(event({ type: ActionType.SHOT, metadata: { setPiece: "saque_banda" } }))).toBe("normal");
  });
});

describe("agregado por desenlace", () => {
  const eventos = [
    corner("shot"),
    corner("shot"),
    corner("play"),
    corner(), // histórico
    corner("shot", true), // rival
    foul("play"),
    foul(),
  ];

  it("desglosa los córners propios y declara lo no registrado", () => {
    expect(summarizeSetPieceOutcomes(eventos, ActionType.CORNER, false)).toEqual({
      total: 4,
      shot: 2,
      play: 1,
      unrecorded: 1,
    });
  });

  it("separa el bando rival", () => {
    expect(summarizeSetPieceOutcomes(eventos, ActionType.CORNER, true)).toEqual({
      total: 1,
      shot: 1,
      play: 0,
      unrecorded: 0,
    });
  });

  it("desglosa las faltas con el mismo criterio", () => {
    expect(summarizeSetPieceOutcomes(eventos, ActionType.FOUL, false)).toEqual({
      total: 2,
      shot: 0,
      play: 1,
      unrecorded: 1,
    });
  });

  it("el desglose siempre suma el total: nada se pierde ni se duplica", () => {
    const s = summarizeSetPieceOutcomes(eventos, ActionType.CORNER, false);
    expect(s.shot + s.play + s.unrecorded).toBe(s.total);
  });

  it("no cuenta tiros ni ninguna otra acción como balón parado", () => {
    const conTiros = [
      ...eventos,
      event({ type: ActionType.SHOT, metadata: { isOpponent: false, setPiece: "corner" } }),
      event({ type: ActionType.SHOT, metadata: { isOpponent: false, setPiece: "free_kick" } }),
    ];
    expect(summarizeSetPieceOutcomes(conTiros, ActionType.CORNER, false).total).toBe(4);
    expect(summarizeSetPieceOutcomes(conTiros, ActionType.FOUL, false).total).toBe(2);
  });

  it("redacta el agregado sin códigos internos", () => {
    const texto = describeSetPieceOutcomes(
      summarizeSetPieceOutcomes(eventos, ActionType.CORNER, false),
    )!;
    expect(texto).toBe("4 — 2 tiro · 1 jugada · 1 subtipo no registrado");
    expect(texto).not.toMatch(/shot|play|CORNER|undefined/);
  });

  it("no redacta nada cuando no hubo balón parado", () => {
    expect(describeSetPieceOutcomes(summarizeSetPieceOutcomes([], ActionType.CORNER))).toBeNull();
  });

  it("un partido enteramente histórico no pierde sus córners", () => {
    const historicos = [corner(), corner(), corner()];
    expect(summarizeSetPieceOutcomes(historicos, ActionType.CORNER, false)).toEqual({
      total: 3,
      shot: 0,
      play: 0,
      unrecorded: 3,
    });
  });
});
