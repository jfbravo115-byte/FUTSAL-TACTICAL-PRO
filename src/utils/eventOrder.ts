/**
 * src/utils/eventOrder.ts
 *
 * Orden cronológico de los eventos de un partido. Función pura.
 *
 * EL DEFECTO QUE CORRIGE
 * ----------------------
 * Cuatro sitios ordenaban con `a.timestamp - b.timestamp` a secas. Pero
 * `timestamp` son los milisegundos transcurridos DENTRO de la parte en curso,
 * y el reloj se reinicia a cero al empezar la segunda: un gol del minuto 1 de
 * la segunda parte se imprimía ANTES que uno del minuto 19 de la primera.
 *
 * LOS CUATRO CRITERIOS, EN ESTE ORDEN
 * -----------------------------------
 *   1. period      lo único que separa dos relojes distintos
 *   2. timestamp   tiempo de juego dentro de esa parte
 *   3. wallClock   reloj real, para los empates
 *   4. índice      orden de registro, para el empate del empate
 *
 * Los dos últimos no son adorno. Con el reloj parado TODOS los eventos
 * comparten `timestamp`, y el reloj se para a menudo —celebraciones, tiempos
 * muertos, consultas—. Además `handleConfirmReset` puede devolver el reloj a
 * cero a mitad de parte, así que dentro de una misma parte el `timestamp`
 * puede incluso retroceder; `wallClock` no.
 *
 * El índice del array es el orden real de registro: los eventos solo se
 * añaden al final y solo se borran, nunca se insertan en medio.
 */
import { GameEvent } from "../types/futsal";

/** Un evento con su posición original, para que el orden sea estable. */
export type IndexedEvent = { event: GameEvent; index: number };

export function indexEvents(events: GameEvent[]): IndexedEvent[] {
  return (events || []).map((event, index) => ({ event, index }));
}

/**
 * Compara dos eventos ya indexados. Total y determinista: nunca devuelve 0
 * para dos eventos distintos, así que el orden no depende del algoritmo de
 * ordenación del motor.
 */
export function compareIndexedEvents(a: IndexedEvent, b: IndexedEvent): number {
  const periodo = (a.event.period ?? 0) - (b.event.period ?? 0);
  if (periodo !== 0) return periodo;
  const tiempo = (a.event.timestamp ?? 0) - (b.event.timestamp ?? 0);
  if (tiempo !== 0) return tiempo;
  const pared = (a.event.wallClock ?? 0) - (b.event.wallClock ?? 0);
  if (pared !== 0) return pared;
  return a.index - b.index;
}

/**
 * Los eventos en orden cronológico real. Devuelve una copia: no muta la
 * lista original, que es la que se guarda.
 */
export function chronological(events: GameEvent[]): GameEvent[] {
  return indexEvents(events)
    .sort(compareIndexedEvents)
    .map(({ event }) => event);
}

/** Igual, conservando el índice original para quien lo necesite. */
export function chronologicalIndexed(events: GameEvent[]): IndexedEvent[] {
  return indexEvents(events).sort(compareIndexedEvents);
}

/**
 * ¿`a` ocurre antes que `b`? Mismo criterio que la ordenación, para que
 * comparar y ordenar no puedan discrepar.
 *
 * `indexA`/`indexB` son opcionales: sin ellos el desempate final no existe y
 * dos eventos indistinguibles devuelven `false` en los dos sentidos.
 */
export function occursBefore(
  a: GameEvent,
  b: GameEvent,
  indexA = 0,
  indexB = 0,
): boolean {
  return compareIndexedEvents({ event: a, index: indexA }, { event: b, index: indexB }) < 0;
}

/**
 * Milisegundos de JUEGO entre dos eventos, o null si no puede saberse.
 *
 * Solo dentro de la MISMA parte. Entre partes distintas el dato no existe: el
 * reloj se reinició y la duración real de la parte anterior no se guarda en
 * ningún sitio. Restar `wallClock` mediría el descanso y las paradas de
 * reloj, que no es tiempo de juego — así que se devuelve null y se declara.
 */
export function playingTimeBetween(from: GameEvent, to: GameEvent): number | null {
  if (from.period !== to.period) return null;
  const delta = (to.timestamp ?? 0) - (from.timestamp ?? 0);
  return Number.isFinite(delta) ? delta : null;
}
