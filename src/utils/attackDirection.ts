/**
 * src/utils/attackDirection.ts
 *
 * Deriva la dirección de ataque de un evento a partir del único dato que se
 * registra sobre orientación: `MatchData.teamDefendsAtKickoff`.
 *
 * POR QUÉ HACE FALTA UN DATO NUEVO
 * --------------------------------
 * Se auditó si la dirección podía derivarse de lo ya guardado. No puede:
 * `GameEvent` no contiene nada espacial más allá de los propios grids, y
 * `MatchData` no tenía ningún campo de lado. `isFieldFlipped` (MatchTracker)
 * es estado de presentación, no persistido en `SavedMatch`, y se compone con
 * un botón manual, así que su valor no es función del período.
 *
 * PRÓRROGA — ASUNCIÓN DECLARADA
 * -----------------------------
 * Hoy la prórroga es INALCANZABLE: ninguna ruta del código escribe
 * `Period.OVERTIME_1` ni `OVERTIME_2` (las únicas transiciones son
 * FIRST→SECOND en handleConfirmEndFirst y SECOND→FINISHED en
 * handleConfirmEndSecond). Las filas de prórroga de la tabla de abajo son por
 * tanto una asunción defensiva sobre datos que no pueden existir, no un
 * comportamiento observado.
 *
 * Se usa una TABLA explícita en lugar de una fórmula de paridad
 * (`period % 2`) precisamente para que la asunción quede escrita y sea
 * revisable de un vistazo, en vez de esconderse en aritmética.
 *
 * ⚠️ Si algún día se implementa la prórroga de verdad, esta constante NO
 * basta: el reglamento contempla sorteo previo, que puede reasignar campos
 * con independencia de cuántos cambios hubo antes. Habrá que registrar ese
 * sorteo igual que hoy se registra `teamDefendsAtKickoff`.
 *
 * ⚠️ `Period` se persiste como ENTERO dentro de cada evento guardado. Sus
 * valores numéricos son formato de serialización: no pueden renumerarse sin
 * romper los partidos ya almacenados.
 */
import { Period } from "../types/futsal";

/** `ltr` = ataca de izquierda a derecha sobre la pista horizontal de captura. */
export type AttackDirection = "ltr" | "rtl";

/** Portería que defiende MI EQUIPO en la 1ª parte. */
export type KickoffSide = "left" | "right";

/**
 * Nº de cambios de campo ocurridos ANTES de cada período.
 *
 * FIRST / SECOND: comportamiento REAL y verificado del código.
 * OVERTIME_1 / OVERTIME_2: asunción declarada (ver cabecera), hoy inalcanzable.
 * FINISHED: por totalidad del Record. Ningún evento espacial puede llevarlo,
 *   porque handleAction retorna antes si el partido ha terminado.
 */
export const SIDE_SWAPS_BEFORE: Record<Period, number> = {
  [Period.FIRST]: 0,
  [Period.SECOND]: 1,
  [Period.OVERTIME_1]: 2,
  [Period.OVERTIME_2]: 3,
  [Period.FINISHED]: 3,
};

export function flipDirection(direction: AttackDirection): AttackDirection {
  return direction === "ltr" ? "rtl" : "ltr";
}

/**
 * Dirección de ataque del equipo que ejecuta la acción.
 *
 * Devuelve `null` cuando el partido no registró la orientación (partido
 * legacy). null significa "desconocido", nunca "por defecto": quien lo reciba
 * debe presentarlo como perspectiva no registrada, no elegir un lado.
 *
 * @param kickoff    MatchData.teamDefendsAtKickoff
 * @param period     período del evento
 * @param isOpponent ¿la acción la ejecuta el equipo rival?
 */
export function attackDirection(
  kickoff: KickoffSide | undefined | null,
  period: Period,
  isOpponent: boolean,
): AttackDirection | null {
  if (kickoff !== "left" && kickoff !== "right") return null;

  // Mi equipo, 1ª parte: ataca hacia la portería contraria a la que defiende.
  let direction: AttackDirection = kickoff === "left" ? "ltr" : "rtl";

  // El rival ataca siempre en sentido opuesto al mío.
  if (isOpponent) direction = flipDirection(direction);

  // Un nº impar de cambios de campo invierte el sentido de ambos equipos.
  const swaps = SIDE_SWAPS_BEFORE[period] ?? 0;
  if (swaps % 2 === 1) direction = flipDirection(direction);

  return direction;
}

/**
 * Dirección ya guardada en el evento, con la derivación del partido como
 * respaldo. Se prefiere el dato del propio evento porque es el que había en
 * el momento de registrarlo — si alguien editó después la cabecera del
 * partido, el evento sigue diciendo la verdad.
 */
export function resolveEventDirection(
  eventDirection: AttackDirection | undefined | null,
  kickoff: KickoffSide | undefined | null,
  period: Period,
  isOpponent: boolean,
): AttackDirection | null {
  if (eventDirection === "ltr" || eventDirection === "rtl") return eventDirection;
  return attackDirection(kickoff, period, isOpponent);
}
