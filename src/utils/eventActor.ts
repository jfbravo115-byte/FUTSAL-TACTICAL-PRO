/**
 * src/utils/eventActor.ts
 *
 * Quién EJECUTA un evento. Función pura.
 *
 * EL PROBLEMA QUE RESUELVE
 * ------------------------
 * `playerIds` no lleva solo al autor. Desde Fase 4, un tiro o un gol añaden
 * también al PORTERO que lo encara, para poder atribuirle la parada o el gol
 * encajado sin deducirlo por bando. Quedarse con el primer elemento de la
 * lista, como hacía el CSV, devolvía unas veces al autor y otras al portero
 * contrario: un gol del rival se exportaba a nombre de NUESTRO portero.
 *
 * NO SE INVENTA NADIE
 * -------------------
 * Si al descartar al portero objetivo no queda ningún jugador —una falta sin
 * autor, un córner, un gol en propia sin identificar—, se devuelve null. En
 * directo hay acciones que no se pueden atribuir y decirlo es más barato que
 * arreglarlo después.
 */
import { GameEvent, Player } from "../types/futsal";
import { targetGoalkeeperIdOf } from "./goalkeeperActions";

export type ActorCandidate = Pick<Player, "id" | "role" | "isOpponent">;

/**
 * Id del jugador que ejecuta, o null.
 *
 * El portero objetivo se descarta con `targetGoalkeeperIdOf`, que prefiere el
 * id explícito del evento y, en un partido antiguo que no lo traiga, lo
 * deduce por bando desde `playerIds`. Así los históricos se exportan igual de
 * bien sin migrar nada.
 */
export function eventActorId(
  event: GameEvent,
  players: ActorCandidate[],
): string | null {
  const ids = event.playerIds ?? [];
  if (ids.length === 0) return null;
  const portero = targetGoalkeeperIdOf(event, players);
  return ids.find((id) => id !== portero) ?? null;
}

/** El jugador que ejecuta, o null. */
export function eventActor<T extends ActorCandidate>(
  event: GameEvent,
  players: T[],
): T | null {
  const id = eventActorId(event, players);
  return id === null ? null : (players.find((p) => p.id === id) ?? null);
}
