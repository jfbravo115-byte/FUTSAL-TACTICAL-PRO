/**
 * src/utils/cornerSequence.ts
 *
 * EL CÓRNER QUE SE LANZA DIRECTO A PORTERÍA. Función pura, sin React ni DOM.
 *
 * LO QUE RESUELVE
 * ---------------
 * Un córner lanzado directamente es UNA jugada que deja DOS hechos
 * estadísticos: hubo un córner y hubo un remate. Hasta ahora la aplicación
 * solo sabía registrar uno de los dos por vez: al elegir «Tiro directo» se
 * guardaba el córner y ahí se acababa el flujo, sin preguntar quién lo sacó
 * ni cómo terminó. El analista tenía que registrar el tiro aparte, a mano, y
 * declararle procedencia `corner` — con lo que una mitad podía quedarse sin
 * la otra.
 *
 * LA RELACIÓN MÁS PEQUEÑA POSIBLE
 * -------------------------------
 * Casi todo lo que hace falta YA EXISTE y se reutiliza tal cual:
 *
 *   CORNER.metadata.cornerSide       desde qué esquina        (Fase 3)
 *   CORNER.metadata.setPieceOutcome  'shot' = fue directo     (Fase 5)
 *   SHOT/GOAL.metadata.setPiece      'corner' = de dónde sale (Fase 5)
 *
 * Lo único que no existía es CUÁL córner va con CUÁL tiro, y esa pregunta se
 * contesta con UN solo campo, escrito igual en los dos eventos:
 *
 *   metadata.sequenceId
 *
 * No hay padre/hijo, ni dirección, ni un segundo campo que diga lo mismo al
 * revés, ni se deduce nada por cercanía temporal. Quien quiera la pareja
 * busca el mismo identificador; quien no la quiera no se entera de que está.
 *
 * AUSENCIA = JUGADA SUELTA
 * ------------------------
 * Un córner sin `sequenceId` es exactamente lo que era antes: un córner sin
 * más. Y un tiro que declara `setPiece: 'corner'` SIN `sequenceId` sigue
 * siendo una declaración independiente del operador, como hasta ahora. No se
 * migra nada y ningún histórico cambia de significado.
 *
 * POR QUÉ NO DESAPARECE EL CÓRNER
 * -------------------------------
 * Sería tentador guardar un único evento «tiro desde córner». Pero entonces
 * el recuento de córners dejaría de salir de los eventos CORNER, y todo lo
 * que ya cuenta córners —resumen, informe, PDF, CSV, Tactical Pro— tendría
 * que aprender a mirar también dentro de los tiros. Dos eventos vinculados
 * mantienen intactos los dos agregados y no dan por bueno ningún doble
 * conteo: el córner nunca suma a tiros y el tiro nunca suma a córners.
 */
import { ActionType, GameEvent, GoalieAction } from "../types/futsal";
import { CornerSide, cornerSideOf, formatCornerSideAdjective } from "./cornerModel";
import { isShotAttempt, shotResolution } from "./shotModel";

/** Prefijo reconocible en un volcado JSON o en una celda de CSV. */
export const CORNER_SEQUENCE_PREFIX = "cseq-";

/**
 * Identificador nuevo. Mismo patrón que los ids de evento: reloj + azar.
 *
 * No es un id de evento y no se parece a uno a propósito: así nadie lo
 * confunde con `event.id` ni intenta buscar «el evento cseq-…».
 */
export function newCornerSequenceId(): string {
  return `${CORNER_SEQUENCE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function isCornerSequenceId(raw: unknown): raw is string {
  return typeof raw === "string" && raw.startsWith(CORNER_SEQUENCE_PREFIX) && raw.length > CORNER_SEQUENCE_PREFIX.length;
}

/** El identificador de secuencia de este evento, o null si va suelto. */
export function sequenceIdOf(event: GameEvent | null | undefined): string | null {
  const raw = event?.metadata?.sequenceId;
  return isCornerSequenceId(raw) ? raw : null;
}

/** ¿Pertenece este evento a una secuencia? */
export function isSequenced(event: GameEvent | null | undefined): boolean {
  return sequenceIdOf(event) !== null;
}

/** El córner de la secuencia: el evento CORNER que la encabeza. */
export function isSequencedCorner(event: GameEvent): boolean {
  return event.type === ActionType.CORNER && isSequenced(event);
}

/**
 * La finalización: el remate que cierra la secuencia.
 *
 * `isShotAttempt` ya es el criterio ÚNICO de «esto es un remate» en toda la
 * aplicación —tiro, gol y gol encajado—. No se redefine aquí.
 */
export function isSequencedFinisher(event: GameEvent): boolean {
  return isShotAttempt(event) && isSequenced(event);
}

/** Todos los eventos de una secuencia, en el orden en que estén. */
export function eventsInSequence(events: GameEvent[], sequenceId: string): GameEvent[] {
  if (!isCornerSequenceId(sequenceId)) return [];
  return (events || []).filter((e) => sequenceIdOf(e) === sequenceId);
}

/**
 * La jugada completa a la que pertenece este evento.
 *
 * Un evento suelto devuelve `[event]`: quien borra o deshace no necesita
 * preguntar antes si hay secuencia, y por eso el borrado individual de los
 * eventos de siempre no cambia ni un ápice.
 */
export function sequenceOf(events: GameEvent[], event: GameEvent): GameEvent[] {
  const id = sequenceIdOf(event);
  if (!id) return [event];
  const juntos = eventsInSequence(events, id);
  return juntos.length > 0 ? juntos : [event];
}

export function cornerOfSequence(events: GameEvent[], sequenceId: string): GameEvent | null {
  return eventsInSequence(events, sequenceId).find((e) => e.type === ActionType.CORNER) ?? null;
}

export function finisherOfSequence(events: GameEvent[], sequenceId: string): GameEvent | null {
  return eventsInSequence(events, sequenceId).find(isShotAttempt) ?? null;
}

// ── FORMA VÁLIDA ────────────────────────────────────────────────────────
//
// Se comprueba en las pruebas y está disponible en tiempo de ejecución, pero
// NO se usa para corregir nada: si algún día apareciera una secuencia
// deforme, lo correcto es verla, no repararla en silencio.

export type SequenceShape = {
  corners: number;
  finishers: number;
  /** Cualquier otra cosa que lleve el mismo identificador. Debe ser 0. */
  otros: number;
};

export function sequenceShape(events: GameEvent[], sequenceId: string): SequenceShape {
  const juntos = eventsInSequence(events, sequenceId);
  const corners = juntos.filter((e) => e.type === ActionType.CORNER).length;
  const finishers = juntos.filter(isShotAttempt).length;
  return { corners, finishers, otros: juntos.length - corners - finishers };
}

/** Un córner y UN solo remate. Ni dos tiros, ni un tiro y un gol. */
export function sequenceIsWellFormed(events: GameEvent[], sequenceId: string): boolean {
  const { corners, finishers, otros } = sequenceShape(events, sequenceId);
  return corners === 1 && finishers === 1 && otros === 0;
}

// ── PRESENTACIÓN ────────────────────────────────────────────────────────

/**
 * Cómo terminó el remate, dicho en una palabra.
 *
 * Sale de `shotResolution`, que es el único sitio donde se decide eso en toda
 * la aplicación. `unrecorded` devuelve null: no se redacta un desenlace que
 * nadie observó.
 */
export function describeFinisherOutcome(finisher: GameEvent): string | null {
  switch (shotResolution(finisher)) {
    case "goal":
      return null; // el gol ya se dice en el verbo; repetirlo sobra
    case "on_target":
      return "a portería";
    case "off_target":
      return "fuera";
    case "blocked":
      return "bloqueado";
    default:
      return null;
  }
}

/**
 * «Córner derecho · tiro directo de JUAN P. · a portería».
 * «Córner derecho · gol directo de JUAN P.».
 *
 * Una sola frase para una sola jugada: el Historial enseñaba dos renglones
 * sin relación visible y parecían dos acciones distintas. Los dos eventos
 * siguen existiendo debajo, que es lo que sostiene los agregados.
 *
 * `actor` ya viene resuelto por quien llama —`describeActor`, la misma
 * función que usan la confirmación y el CSV— para no tener aquí un segundo
 * criterio de «quién hizo esto».
 */
export function describeCornerSequence(
  corner: GameEvent | null,
  finisher: GameEvent | null,
  actor: string | null,
): string {
  const side: CornerSide | null = corner ? cornerSideOf(corner) : null;
  const cabeza = side ? `Córner ${formatCornerSideAdjective(side)}` : "Córner";
  if (!finisher) return cabeza;

  const esGol = shotResolution(finisher) === "goal";
  const verbo = esGol ? "gol directo" : "tiro directo";
  const partes = [cabeza, actor ? `${verbo} de ${actor}` : verbo];
  const desenlace = describeFinisherOutcome(finisher);
  if (desenlace) partes.push(desenlace);
  return partes.join(" · ");
}

/**
 * Valor de la columna `secuencia` del CSV. Vacío = jugada suelta.
 *
 * Se exporta el identificador tal cual para poder volver a emparejar las dos
 * filas en una hoja de cálculo. No se inventa un número de jugada: eso
 * obligaría a numerar, y numerar depende del orden, que es justo lo que no
 * queremos que decida el significado.
 */
export function cornerSequenceCsvValue(event: GameEvent): string {
  return sequenceIdOf(event) ?? "";
}

/** Tipos que esta fase sabe encadenar a un córner. Para las pruebas. */
export const SEQUENCEABLE_FINISHERS: readonly (ActionType | GoalieAction)[] = [
  ActionType.SHOT,
  ActionType.GOAL,
  GoalieAction.GOAL_CONCEDED,
];
