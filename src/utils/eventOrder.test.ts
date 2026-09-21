/**
 * Orden cronológico de los eventos.
 *
 * EL DEFECTO QUE FIJA
 * -------------------
 * Cuatro cronologías ordenaban con `a.timestamp - b.timestamp` a secas. Pero
 * el reloj se reinicia a cero en el descanso, así que un gol del minuto 1 de
 * la segunda parte se imprimía ANTES que uno del minuto 19 de la primera.
 */
import { describe, expect, it } from "vitest";
import { ActionType, GameEvent, GameState, Period } from "../types/futsal";
import {
  chronological,
  chronologicalIndexed,
  compareIndexedEvents,
  occursBefore,
  playingTimeBetween,
} from "./eventOrder";

function ev(
  id: string,
  period: Period,
  timestamp: number,
  wallClock = 0,
  type: ActionType = ActionType.GOAL,
): GameEvent {
  return {
    id,
    timestamp,
    wallClock,
    period,
    playerIds: [],
    type,
    gameState: GameState.FOUR_VS_FOUR,
  };
}

const ids = (events: GameEvent[]) => events.map((e) => e.id);

describe("L · la parte manda sobre el minuto", () => {
  it("1ª parte 19:00 va ANTES que 2ª parte 01:00", () => {
    const primera = ev("1P-19", Period.FIRST, 19 * 60_000);
    const segunda = ev("2P-01", Period.SECOND, 1 * 60_000);
    expect(ids(chronological([segunda, primera]))).toEqual(["1P-19", "2P-01"]);
    expect(occursBefore(primera, segunda)).toBe(true);
    expect(occursBefore(segunda, primera)).toBe(false);
  });

  it("ordenar solo por timestamp daría el resultado contrario", () => {
    // Es exactamente el error que había en producción.
    const primera = ev("1P-19", Period.FIRST, 19 * 60_000);
    const segunda = ev("2P-01", Period.SECOND, 1 * 60_000);
    const malo = [segunda, primera].slice().sort((a, b) => a.timestamp - b.timestamp);
    expect(ids(malo)).toEqual(["2P-01", "1P-19"]);
  });

  it("la prórroga va después de las dos partes", () => {
    const orden = chronological([
      ev("ot", Period.OVERTIME_1, 0),
      ev("p2", Period.SECOND, 10_000),
      ev("p1", Period.FIRST, 20_000),
    ]);
    expect(ids(orden)).toEqual(["p1", "p2", "ot"]);
  });
});

describe("M · empates de tiempo: el orden sigue siendo estable", () => {
  it("con el reloj parado todos comparten timestamp y desempata wallClock", () => {
    // El reloj se para a menudo —celebraciones, tiempos muertos— y entonces
    // TODOS los eventos registrados llevan el mismo `timestamp`.
    const a = ev("a", Period.FIRST, 300_000, 1_000);
    const b = ev("b", Period.FIRST, 300_000, 2_000);
    const c = ev("c", Period.FIRST, 300_000, 3_000);
    expect(ids(chronological([c, a, b]))).toEqual(["a", "b", "c"]);
  });

  it("con timestamp Y wallClock iguales manda el orden de registro", () => {
    const a = ev("a", Period.FIRST, 300_000, 1_000);
    const b = ev("b", Period.FIRST, 300_000, 1_000);
    expect(ids(chronological([a, b]))).toEqual(["a", "b"]);
    expect(ids(chronological([b, a]))).toEqual(["b", "a"]);
  });

  it("el comparador es total: nunca devuelve 0 para dos eventos distintos", () => {
    const a = { event: ev("a", Period.FIRST, 0, 0), index: 0 };
    const b = { event: ev("b", Period.FIRST, 0, 0), index: 1 };
    expect(compareIndexedEvents(a, b)).toBeLessThan(0);
    expect(compareIndexedEvents(b, a)).toBeGreaterThan(0);
    expect(compareIndexedEvents(a, a)).toBe(0);
  });

  it("no muta la lista original", () => {
    const original = [ev("b", Period.SECOND, 0), ev("a", Period.FIRST, 0)];
    const copia = [...original];
    chronological(original);
    expect(original).toEqual(copia);
  });

  it("conserva el índice original cuando se pide", () => {
    const indexado = chronologicalIndexed([
      ev("b", Period.SECOND, 0),
      ev("a", Period.FIRST, 0),
    ]);
    expect(indexado.map((i) => [i.event.id, i.index])).toEqual([
      ["a", 1],
      ["b", 0],
    ]);
  });
});

describe("K · entre partes distintas no hay tiempo de juego que medir", () => {
  it("dentro de la misma parte se resta el reloj de juego", () => {
    const a = ev("a", Period.FIRST, 600_000);
    const b = ev("b", Period.FIRST, 647_000);
    expect(playingTimeBetween(a, b)).toBe(47_000);
  });

  it("entre la 1ª y la 2ª parte devuelve null, nunca un número", () => {
    // El reloj se reinicia y la duración real de la primera parte no se
    // guarda en ningún sitio. Restar wallClock mediría el descanso.
    const a = ev("a", Period.FIRST, 19 * 60_000, 1_000);
    const b = ev("b", Period.SECOND, 60_000, 20 * 60_000);
    expect(playingTimeBetween(a, b)).toBeNull();
  });
});
