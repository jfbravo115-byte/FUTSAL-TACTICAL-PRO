/**
 * src/utils/foulModel.ts
 *
 * Contabilidad de la falta. Función pura, sin React y sin DOM.
 *
 * DOS DIMENSIONES QUE NO SE TOCAN ENTRE SÍ
 * ----------------------------------------
 *   reglamentaria → matchData.fouls.{team,opponent}, la acumulación que
 *                   dispara la alarma de 4ª/5ª. Se escribe de inmediato.
 *   individual    → player.stats.fouls del jugador al que se atribuye.
 *   táctica       → originGrid y setPieceOutcome del evento, ambos opcionales
 *                   y posteriores. Nunca pueden alterar las dos de arriba.
 *
 * POR QUÉ EXISTE ESTE MÓDULO
 * --------------------------
 * Registrar una falta sumaba en las dos primeras, pero borrarla solo devolvía
 * la del equipo: la falta individual únicamente podía crecer. Registro y
 * borrado usan ahora la MISMA función con el signo cambiado, que es la forma
 * de que no puedan volver a desalinearse.
 */
import { ActionType, GameEvent, Player } from "../types/futsal";

export type FoulCounters = { team: number; opponent: number };

export function isFoulEvent(event: GameEvent): boolean {
  return event.type === ActionType.FOUL;
}

/**
 * Bando al que se le apunta la falta. `metadata.isOpponent` es el bando que
 * la COMETE, igual que en el resto de agregados de la app.
 */
export function foulTeamKeyOf(event: GameEvent): keyof FoulCounters {
  return event.metadata?.isOpponent ? "opponent" : "team";
}

/**
 * Contador reglamentario tras registrar (`+1`) o borrar (`-1`) la falta.
 * Nunca baja de cero: un partido cargado a medias no puede dejar negativos.
 */
export function applyFoulToCounters(
  counters: FoulCounters,
  event: GameEvent,
  sign: 1 | -1,
): FoulCounters {
  if (!isFoulEvent(event)) return counters;
  const key = foulTeamKeyOf(event);
  return { ...counters, [key]: Math.max(0, counters[key] + sign) };
}

/**
 * Cuánto cambia la falta individual de este jugador. Solo la del jugador al
 * que el evento fue atribuido; una falta de equipo sin jugador no mueve
 * ninguna.
 */
export function foulStatDelta(
  event: GameEvent,
  player: Pick<Player, "id">,
  sign: 1 | -1,
): number {
  if (!isFoulEvent(event)) return 0;
  return event.playerIds.includes(player.id) ? sign : 0;
}

/** Faltas individuales tras aplicar el delta. Nunca negativo. */
export function applyFoulToPlayerStat(current: number, delta: number): number {
  return Math.max(0, current + delta);
}

// ── PASOS OPCIONALES ────────────────────────────────────────────────────
//
// Ubicación y desenlace llegan DESPUÉS de que la falta ya esté contabilizada.
// Estas funciones solo parchean el evento indicado: no tocan contadores, no
// tocan jugadores y no crean ni borran eventos. Es lo que garantiza que
// cancelar cualquiera de los dos pasos no deshaga nada.

/** Añade la ubicación a un evento ya registrado. */
export function withEventLocation(
  events: GameEvent[],
  eventId: string,
  originGrid: string,
): GameEvent[] {
  return events.map((e) => (e.id === eventId ? { ...e, originGrid } : e));
}

/** Añade el desenlace de balón parado a un evento ya registrado. */
export function withSetPieceOutcome(
  events: GameEvent[],
  eventId: string,
  setPieceOutcome: "shot" | "play",
): GameEvent[] {
  return events.map((e) =>
    e.id === eventId ? { ...e, metadata: { ...e.metadata, setPieceOutcome } } : e,
  );
}
