/**
 * Contabilidad de la falta.
 *
 * La regla que protegen estos tests: la dimensión reglamentaria (contador de
 * equipo y falta individual) se escribe al pulsar y no depende de ningún paso
 * posterior — ni la ubicación ni el desenlace pueden alterarla. Y registrar y
 * borrar son exactamente la misma operación con el signo cambiado.
 */
import { describe, expect, it } from "vitest";
import { ActionType, GameEvent, Period } from "../types/futsal";
import * as foulModel from "./foulModel";
import {
  applyFoulToCounters,
  applyFoulToPlayerStat,
  foulStatDelta,
  foulTeamKeyOf,
  isFoulEvent,
} from "./foulModel";

function foul(overrides: Partial<GameEvent> = {}, opponent = false): GameEvent {
  return {
    id: "f1",
    timestamp: 0,
    wallClock: 0,
    period: Period.FIRST,
    playerIds: ["p1"],
    type: ActionType.FOUL,
    gameState: "4vs4" as any,
    metadata: { isOpponent: opponent },
    ...overrides,
  };
}

describe("contador reglamentario", () => {
  it("una falta propia suma al equipo y no al rival", () => {
    expect(applyFoulToCounters({ team: 2, opponent: 3 }, foul(), 1)).toEqual({ team: 3, opponent: 3 });
  });

  it("una falta del rival suma al rival", () => {
    expect(applyFoulToCounters({ team: 2, opponent: 3 }, foul({}, true), 1)).toEqual({ team: 2, opponent: 4 });
  });

  it("borrar una falta la devuelve al mismo lado", () => {
    expect(applyFoulToCounters({ team: 3, opponent: 3 }, foul(), -1)).toEqual({ team: 2, opponent: 3 });
  });

  it("registrar y borrar se cancelan exactamente", () => {
    const inicial = { team: 4, opponent: 1 };
    const e = foul();
    expect(applyFoulToCounters(applyFoulToCounters(inicial, e, 1), e, -1)).toEqual(inicial);
  });

  it("nunca baja de cero", () => {
    expect(applyFoulToCounters({ team: 0, opponent: 0 }, foul(), -1)).toEqual({ team: 0, opponent: 0 });
  });

  it("ningún otro tipo de evento toca el contador", () => {
    const tiro = foul({ type: ActionType.SHOT });
    expect(applyFoulToCounters({ team: 2, opponent: 0 }, tiro, 1)).toEqual({ team: 2, opponent: 0 });
    expect(isFoulEvent(tiro)).toBe(false);
  });

  it("la ubicación y el desenlace no cambian a quién se le apunta", () => {
    const conExtras = foul({
      originGrid: "Z2C" as any,
      metadata: { isOpponent: false, setPieceOutcome: "shot" },
    });
    expect(foulTeamKeyOf(conExtras)).toBe("team");
    expect(applyFoulToCounters({ team: 0, opponent: 0 }, conExtras, 1)).toEqual({ team: 1, opponent: 0 });
  });
});

describe("falta individual", () => {
  it("suma solo al jugador al que se atribuye", () => {
    expect(foulStatDelta(foul(), { id: "p1" }, 1)).toBe(1);
    expect(foulStatDelta(foul(), { id: "p2" }, 1)).toBe(0);
  });

  it("borrar la falta se la devuelve a ese mismo jugador, una sola vez", () => {
    expect(foulStatDelta(foul(), { id: "p1" }, -1)).toBe(-1);
    expect(applyFoulToPlayerStat(3, foulStatDelta(foul(), { id: "p1" }, -1))).toBe(2);
  });

  it("una falta de equipo sin jugador no mueve ninguna falta individual", () => {
    const sinJugador = foul({ playerIds: [] });
    expect(foulStatDelta(sinJugador, { id: "p1" }, 1)).toBe(0);
    expect(foulStatDelta(sinJugador, { id: "p1" }, -1)).toBe(0);
  });

  it("nunca deja la falta individual en negativo", () => {
    expect(applyFoulToPlayerStat(0, -1)).toBe(0);
  });

  it("registrar y borrar dejan al jugador como estaba", () => {
    const e = foul();
    const tras = applyFoulToPlayerStat(5, foulStatDelta(e, { id: "p1" }, 1));
    expect(applyFoulToPlayerStat(tras, foulStatDelta(e, { id: "p1" }, -1))).toBe(5);
  });
});

// ── LA UBICACIÓN NO DESHACE NADA, Y ES EL ÚNICO PASO POSTERIOR ──────────

import { withEventLocation } from "./foulModel";
import { setPieceOutcomeOf } from "./setPieceModel";

describe("la ubicación es un paso posterior y omitible", () => {
  const registrada = () => {
    const evento = foul({ id: "f1" });
    return {
      events: [evento, foul({ id: "f2", playerIds: [] })],
      counters: applyFoulToCounters({ team: 0, opponent: 0 }, evento, 1),
      statFouls: applyFoulToPlayerStat(0, foulStatDelta(evento, { id: "p1" }, 1)),
    };
  };

  it("añadir la ubicación no toca contadores ni faltas individuales", () => {
    const { events, counters, statFouls } = registrada();
    const despues = withEventLocation(events, "f1", "Z2C");
    expect(despues[0].originGrid).toBe("Z2C");
    expect(counters).toEqual({ team: 1, opponent: 0 });
    expect(statFouls).toBe(1);
    expect(despues).toHaveLength(events.length);
  });

  it("omitir la ubicación deja la falta registrada y sin ubicar", () => {
    const { events, counters } = registrada();
    expect(events[0].originGrid).toBeUndefined();
    expect(counters.team).toBe(1);
  });

  it("solo se parchea el evento indicado", () => {
    const { events } = registrada();
    const despues = withEventLocation(events, "f1", "Z1L");
    expect(despues[1]).toBe(events[1]);
    expect(despues[1].originGrid).toBeUndefined();
  });

  it("una falta NO tiene desenlace: no hay más pasos después de la ubicación", () => {
    // FOUL identifica al infractor. Quién ejecuta la reanudación es otra
    // acción, de otro equipo, y se registra como SHOT con setPiece.
    const { events } = registrada();
    const ubicada = withEventLocation(events, "f1", "Z2C");
    expect(setPieceOutcomeOf(ubicada[0])).toBeNull();
    expect(Object.keys(foulModel).filter((n) => /outcome|desenlace/i.test(n))).toEqual([]);
  });
});

// ── LAS DOS VÍAS DE CAPTURA SIGNIFICAN LO MISMO ─────────────────────────
//
// Radial del jugador y botón exterior registran ambos una FALTA COMETIDA.
// La única diferencia es si hay infractor identificado.

describe("falta desde el radial y desde el botón exterior", () => {
  it("desde el radial: falta cometida por ESE jugador", () => {
    const desdeRadial = foul({ playerIds: ["p1"] });
    expect(applyFoulToCounters({ team: 0, opponent: 0 }, desdeRadial, 1)).toEqual({ team: 1, opponent: 0 });
    expect(foulStatDelta(desdeRadial, { id: "p1" }, 1)).toBe(1);
    expect(foulStatDelta(desdeRadial, { id: "p2" }, 1)).toBe(0);
  });

  it("desde el botón exterior: falta del equipo, sin infractor identificado", () => {
    const deEquipo = foul({ playerIds: [] });
    expect(applyFoulToCounters({ team: 0, opponent: 0 }, deEquipo, 1)).toEqual({ team: 1, opponent: 0 });
    expect(foulStatDelta(deEquipo, { id: "p1" }, 1)).toBe(0);
  });

  it("las dos suman igual al contador reglamentario", () => {
    const c0 = { team: 0, opponent: 0 };
    const c1 = applyFoulToCounters(c0, foul({ playerIds: ["p1"] }), 1);
    const c2 = applyFoulToCounters(c1, foul({ playerIds: [] }), 1);
    expect(c2).toEqual({ team: 2, opponent: 0 });
  });
});

// ── EL TIRO DE FALTA NO TOCA NADA DE LA FALTA ───────────────────────────

describe("un tiro procedente de falta no altera la contabilidad de faltas", () => {
  const tiroDeFalta = foul({
    id: "s1",
    type: ActionType.SHOT,
    playerIds: ["p1"],
    metadata: { isOpponent: false, setPiece: "free_kick" },
  });

  it("no mueve el contador reglamentario", () => {
    expect(applyFoulToCounters({ team: 2, opponent: 1 }, tiroDeFalta, 1)).toEqual({ team: 2, opponent: 1 });
    expect(applyFoulToCounters({ team: 2, opponent: 1 }, tiroDeFalta, -1)).toEqual({ team: 2, opponent: 1 });
  });

  it("no mueve la falta individual de nadie, ni del infractor", () => {
    expect(foulStatDelta(tiroDeFalta, { id: "p1" }, 1)).toBe(0);
    expect(foulStatDelta(tiroDeFalta, { id: "p1" }, -1)).toBe(0);
  });

  it("no es una falta", () => {
    expect(isFoulEvent(tiroDeFalta)).toBe(false);
  });
});

// ── LA JUGADA DE FALTA NO TOCA LA CONTABILIDAD DE FALTAS ────────────────

describe("una jugada de falta no es una falta", () => {
  const jugada = foul({
    id: "sp1",
    type: ActionType.SET_PIECE,
    playerIds: ["p1"],
    metadata: { isOpponent: false, setPieceOrigin: "free_kick", setPieceOutcome: "play" },
  });

  it("no la reconoce como falta", () => {
    expect(isFoulEvent(jugada)).toBe(false);
  });

  it("no mueve el contador reglamentario, ni al registrar ni al borrar", () => {
    expect(applyFoulToCounters({ team: 2, opponent: 1 }, jugada, 1)).toEqual({ team: 2, opponent: 1 });
    expect(applyFoulToCounters({ team: 2, opponent: 1 }, jugada, -1)).toEqual({ team: 2, opponent: 1 });
  });

  it("no mueve la falta individual del ejecutor", () => {
    expect(foulStatDelta(jugada, { id: "p1" }, 1)).toBe(0);
    expect(foulStatDelta(jugada, { id: "p1" }, -1)).toBe(0);
  });
});
