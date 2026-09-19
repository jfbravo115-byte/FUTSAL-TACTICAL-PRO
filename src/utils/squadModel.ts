/**
 * src/utils/squadModel.ts
 *
 * Convocatoria del partido. Funciones puras, sin React y sin DOM.
 *
 * TRES COSAS QUE NO SON LA MISMA
 * ------------------------------
 *   PLANTILLA     todos los jugadores del equipo. Vive en localStorage y
 *                 sobrevive a los partidos.
 *   CONVOCATORIA  los que juegan ESTE partido. Se elige antes de empezar y
 *                 no se guarda en la plantilla.
 *   QUINTETO      los cinco que salen de inicio, elegidos entre los
 *                 convocados.
 *
 *   quinteto ⊆ convocatoria ⊆ plantilla
 *
 * POR QUÉ NO HAY UN CAMPO `isCalledUp`
 * ------------------------------------
 * Porque `matchData.players` contiene EXCLUSIVAMENTE a los convocados. Un
 * jugador de la plantilla que no fue convocado simplemente no está ahí, así
 * que marcarlo sería información redundante y una segunda verdad que
 * mantener sincronizada. La convocatoria se materializa una sola vez, al
 * construir el partido, y a partir de ese momento "estar en players" ES
 * estar convocado.
 *
 * EL BUG QUE ESTO CORRIGE
 * -----------------------
 * El radial de CAMBIO ofrecía `plantilla − jugadores en pista`, porque
 * `startMatch` volcaba la plantilla entera en el partido. Con 16 en plantilla
 * y 12 convocados, el banquillo mostraba 11 jugadores en vez de 7, y cuatro
 * de ellos no estaban ni en el pabellón.
 *
 * Aquí viven las reglas de elegibilidad, en un solo sitio, porque
 * `MatchTracker` tiene TRES superficies de banquillo —el radial de añadir a
 * un hueco, el de permutar con alguien de pista y el panel de gestión de
 * equipo— cada una con su propia copia de las mismas cuatro condiciones.
 * Arreglar una sola habría dejado el defecto vivo por las otras.
 */
import { Player, Role } from "../types/futsal";

/** Quien no juega: el cuerpo técnico está en `players` solo para tarjetas. */
export function isStaff(role: Role): boolean {
  return role === Role.COACH || role === Role.DELEGATE;
}

/** Un expulsado no vuelve a entrar en lo que queda de partido. */
export function isSentOff(player: Pick<Player, "stats">): boolean {
  return (player.stats?.redCards ?? 0) > 0;
}

/**
 * ¿Puede este jugador entrar desde el banquillo?
 *
 * Las reglas que ya aplicaban por separado las tres superficies de banquillo,
 * ahora en una sola función. Deliberadamente NO incluye la restricción de
 * portero/campo: esa depende del hueco concreto que se esté cubriendo y del
 * sistema de juego activo, y se resuelve en la pantalla.
 *
 * `opponentSide` omitido significa "cualquier bando": el panel de gestión de
 * equipo lista los dos, y forzarlo a elegir habría cambiado lo que muestra.
 */
export function isAvailableForSubstitution(
  player: Player,
  opponentSide?: boolean | null,
): boolean {
  if (player.isOnPitch) return false;
  if (isStaff(player.role)) return false;
  if (isSentOff(player)) return false;
  if (opponentSide === undefined || opponentSide === null) return true;
  return !!player.isOpponent === !!opponentSide;
}

/**
 * Banquillo disponible de un bando.
 *
 * Con la convocatoria aplicada esto es `convocados − jugadores en pista`,
 * que es justo lo que el radial debe ofrecer. Nunca `plantilla − pista`.
 */
export function availableForSubstitution(
  players: Player[],
  opponentSide?: boolean | null,
): Player[] {
  return players.filter((p) => isAvailableForSubstitution(p, opponentSide));
}

// ── SELECCIÓN PREPARTIDO ───────────────────────────────────────────────
//
// Lo de abajo solo se usa mientras se configura el partido. Trabaja con ids
// porque en PreMatch todavía no hay `Player`, solo filas de la plantilla.

/** Lo mínimo que se necesita saber de una fila de la plantilla. */
export type SquadCandidate = {
  id: string;
  role: Role;
  isStarter: boolean;
  isOpponent: boolean;
};

/** Límites del quinteto inicial, los mismos que aplica `normalizeLineup`. */
export const MAX_STARTERS = 5;
export const MAX_STARTING_GOALKEEPERS = 1;

/** Los de casa que además están convocados. El rival no se convoca. */
export function calledUpPlayers<T extends { id: string; isOpponent: boolean }>(
  players: T[],
  calledUpIds: ReadonlySet<string>,
): T[] {
  return players.filter((p) => !p.isOpponent && calledUpIds.has(p.id));
}

/**
 * Por qué NO se puede hacer titular a alguien, o `null` si sí se puede.
 *
 * Existe para que la pantalla pueda impedir el gesto y decir el motivo. Hasta
 * ahora se podían marcar ocho titulares y `normalizeLineup` recortaba en
 * silencio al arrancar: el usuario elegía una cosa y empezaba otra.
 *
 * `calledUpIds` es opcional: quien ya filtró por convocatoria no tiene que
 * volver a pasarla.
 */
export function starterBlockReason(
  candidate: SquadCandidate,
  players: SquadCandidate[],
  calledUpIds?: ReadonlySet<string>,
): "squad-full" | "goalkeeper-taken" | null {
  const convocados = calledUpIds
    ? players.filter((p) => !p.isOpponent && calledUpIds.has(p.id))
    : players.filter((p) => !p.isOpponent);
  const titulares = convocados.filter((p) => p.isStarter && p.id !== candidate.id);

  if (
    candidate.role === Role.GOALKEEPER &&
    titulares.filter((p) => p.role === Role.GOALKEEPER).length >= MAX_STARTING_GOALKEEPERS
  ) {
    return "goalkeeper-taken";
  }
  if (titulares.length >= MAX_STARTERS) return "squad-full";
  return null;
}

export const STARTER_BLOCK_MESSAGE: Record<
  NonNullable<ReturnType<typeof starterBlockReason>>,
  string
> = {
  "squad-full": "El quinteto inicial ya tiene 5 jugadores. Quita a uno antes de añadir otro.",
  "goalkeeper-taken": "Ya hay un portero en el quinteto inicial. Quítalo antes de poner otro.",
};
