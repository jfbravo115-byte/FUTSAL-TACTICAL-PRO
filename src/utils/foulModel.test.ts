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

// ── LOS PASOS OPCIONALES NO DESHACEN NADA ───────────────────────────────

import { withEventLocation, withSetPieceOutcome } from "./foulModel";
import { setPieceOutcomeOf } from "./setPieceModel";

describe("ubicación y desenlace son pasos posteriores y omitibles", () => {
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

  it("añadir el desenlace tampoco, y conserva el resto del metadata", () => {
    const { events, counters } = registrada();
    const despues = withSetPieceOutcome(events, "f1", "shot");
    expect(setPieceOutcomeOf(despues[0])).toBe("shot");
    expect(despues[0].metadata?.isOpponent).toBe(false);
    expect(counters).toEqual({ team: 1, opponent: 0 });
  });

  it("omitir la ubicación deja la falta registrada y sin ubicar", () => {
    const { events, counters } = registrada();
    // Omitir = simplemente no llamar a withEventLocation.
    expect(events[0].originGrid).toBeUndefined();
    expect(counters.team).toBe(1);
  });

  it("omitir el desenlace deja la falta registrada y sin subtipo", () => {
    const { events, counters } = registrada();
    expect(setPieceOutcomeOf(events[0])).toBeNull();
    expect(counters.team).toBe(1);
  });

  it("los dos pasos son independientes: se puede tener uno y no el otro", () => {
    const { events } = registrada();
    const soloZona = withEventLocation(events, "f1", "Z3R");
    expect(setPieceOutcomeOf(soloZona[0])).toBeNull();
    const soloDesenlace = withSetPieceOutcome(events, "f1", "play");
    expect(soloDesenlace[0].originGrid).toBeUndefined();
  });

  it("solo se parchea el evento indicado", () => {
    const { events } = registrada();
    const despues = withSetPieceOutcome(withEventLocation(events, "f1", "Z1L"), "f1", "shot");
    expect(despues[1]).toBe(events[1]);
    expect(setPieceOutcomeOf(despues[1])).toBeNull();
  });
});
