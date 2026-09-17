/**
 * Etiquetas del Historial.
 *
 * El Historial imprimía el código interno para cualquier tipo sin rama
 * propia, y así es como el usuario acabó leyendo `CORNER` en pantalla.
 */
import { describe, expect, it } from "vitest";
import { ActionType, GameEvent, GoalieAction, Period } from "../types/futsal";
import { formatEventTypeLabel } from "./eventLabels";

function event(overrides: Partial<GameEvent> = {}): GameEvent {
  return {
    id: "e1",
    timestamp: 0,
    wallClock: 0,
    period: Period.FIRST,
    playerIds: [],
    type: ActionType.CORNER,
    gameState: "4vs4" as any,
    ...overrides,
  };
}

const corner = (metadata: Record<string, any> = {}) =>
  event({ type: ActionType.CORNER, originGrid: "Z4L" as any, metadata: { isOpponent: false, ...metadata } });

describe("el Historial nunca muestra un código interno", () => {
  it("un córner se lee como Córner, no como CORNER", () => {
    const label = formatEventTypeLabel(corner({ cornerSide: "left" }));
    expect(label).toContain("Córner");
    expect(label).not.toContain("CORNER");
  });

  it("ningún tipo registrado imprime su identificador", () => {
    const tipos: (ActionType | GoalieAction)[] = [
      ActionType.GOAL, ActionType.SHOT, ActionType.ASSIST, ActionType.STEAL,
      ActionType.INTERCEPTION, ActionType.LOSS, ActionType.UNFORCED_ERROR,
      ActionType.FOUL, ActionType.CORNER, ActionType.YELLOW_CARD, ActionType.RED_CARD,
      ActionType.TIMEOUT, ActionType.SUBSTITUTION,
      GoalieAction.SAVE, GoalieAction.SAVE_CATCH, GoalieAction.SAVE_DEFLECT,
      GoalieAction.SAVE_PARRY, GoalieAction.EXIT, GoalieAction.GOAL_CONCEDED,
    ];
    for (const type of tipos) {
      const label = formatEventTypeLabel(event({ type, metadata: { isOpponent: false } }));
      expect(label).not.toMatch(/[A-Z]{3,}_?[A-Z]*/);
      expect(label.trim().length).toBeGreaterThan(1);
    }
  });

  it("un tipo desconocido cae a una etiqueta genérica, no al identificador", () => {
    expect(formatEventTypeLabel(event({ type: "ALGO_NUEVO" as any }))).toBe("• Acción registrada");
  });
});

describe("balón parado en el Historial", () => {
  it("muestra el lado del córner", () => {
    expect(formatEventTypeLabel(corner({ cornerSide: "left" }))).toBe("🚩 Córner · izquierda");
    expect(formatEventTypeLabel(corner({ cornerSide: "right" }))).toBe("🚩 Córner · derecha");
  });

  it("añade el desenlace cuando consta", () => {
    expect(formatEventTypeLabel(corner({ cornerSide: "left", setPieceOutcome: "shot" })))
      .toBe("🚩 Córner · izquierda · Tiro");
    expect(formatEventTypeLabel(corner({ cornerSide: "right", setPieceOutcome: "play" })))
      .toBe("🚩 Córner · derecha · Jugada");
  });

  it("un córner histórico sin desenlace no inventa ninguno", () => {
    expect(formatEventTypeLabel(corner({ cornerSide: "left" }))).not.toMatch(/Tiro|Jugada/);
  });

  it("la falta se lee SOLO como falta: es la infracción, no la reanudación", () => {
    expect(formatEventTypeLabel(event({ type: ActionType.FOUL, metadata: { isOpponent: false } })))
      .toBe("⚠️ Falta");
    // Aunque un evento de desarrollo trajera el campo, nunca se muestra.
    for (const outcome of ["shot", "play"]) {
      const label = formatEventTypeLabel(
        event({ type: ActionType.FOUL, metadata: { setPieceOutcome: outcome } }),
      );
      expect(label).toBe("⚠️ Falta");
      expect(label).not.toMatch(/Tiro|Jugada/);
    }
  });

  it("recupera el lado desde el sector si falta el metadata", () => {
    expect(formatEventTypeLabel(event({ type: ActionType.CORNER, originGrid: "Z4R" as any, metadata: {} })))
      .toBe("🚩 Córner · derecha");
  });

  it("un córner sin lado ni desenlace sigue siendo legible", () => {
    expect(formatEventTypeLabel(event({ type: ActionType.CORNER, metadata: {} }))).toBe("🚩 Córner");
  });
});

describe("jugada de falta en el Historial", () => {
  const jugada = (metadata: Record<string, any> = {}) =>
    event({
      type: ActionType.SET_PIECE,
      metadata: { isOpponent: false, setPieceOrigin: "free_kick", setPieceOutcome: "play", ...metadata },
    });

  it("se lee como Jugada de falta", () => {
    expect(formatEventTypeLabel(jugada())).toBe("▶️ Jugada de falta");
  });

  it("nunca muestra SET_PIECE ni free_kick", () => {
    const label = formatEventTypeLabel(jugada());
    expect(label).not.toMatch(/SET_PIECE|free_kick|play/);
  });

  it("no se confunde con la falta cometida", () => {
    expect(formatEventTypeLabel(event({ type: ActionType.FOUL, metadata: {} }))).toBe("⚠️ Falta");
    expect(formatEventTypeLabel(jugada())).not.toBe("⚠️ Falta");
  });
});
