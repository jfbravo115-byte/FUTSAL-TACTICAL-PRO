/**
 * src/utils/goalModel.ts
 *
 * Quién marcó, a quién le suma y cómo queda el marcador. Funciones puras, sin
 * React y sin DOM.
 *
 * POR QUÉ EXISTE
 * --------------
 * El marcador estaba calculado a mano en dieciséis sitios distintos, todos con
 * la misma fórmula copiada:
 *
 *     events.filter(e => (GOAL || GOAL_CONCEDED) && !e.metadata?.isOpponent)
 *
 * Mientras «de quién es el evento» y «a quién le suma» fueron la misma
 * respuesta, dieciséis copias solo eran una deuda. El gol en propia las separa
 * —lo ejecuta un equipo y puntúa el otro— y entonces cada copia es una
 * oportunidad de que la pantalla y el PDF digan resultados distintos del mismo
 * partido. Por eso hay un solo sitio donde se decide.
 *
 * LAS TRES PREGUNTAS, QUE NO SON LA MISMA
 * ---------------------------------------
 *   actorSide(e)        de quién es el JUGADOR que ejecuta
 *   beneficiarySide(e)  quién SUBE AL MARCADOR
 *   concededBy(e)       quién lo ENCAJA
 *
 * En un gol normal coinciden autor y beneficiario. En un gol en propia son
 * contrarios. En los tres casos el que encaja es el contrario del beneficiario.
 *
 * LO QUE ESTE MÓDULO **NO** DECIDE
 * --------------------------------
 * No decide qué es un tiro, ni la conversión, ni los goles de un jugador, ni
 * los de un portero, ni lo que entra en un mapa de zonas. Esos recuentos viven
 * en `shotModel`, `matchZonesService` y `PlayerStats` y responden preguntas
 * OFENSIVAS, no de marcador: un gol en propia sube el marcador sin ser
 * producción ofensiva de nadie. Mezclarlos sería volver al problema de origen
 * por el otro lado.
 */
import { ActionType, GameEvent, GoalieAction } from "../types/futsal";

/** Los dos lados del marcador. «team» somos nosotros. */
export type GoalSide = "team" | "opponent";

/**
 * Lo MÍNIMO que hace falta para decidir un gol: su tipo y de quién es.
 *
 * Se acepta esta forma, y no un `GameEvent` completo, porque la pantalla de
 * captura necesita saber a quién le sumará el evento ANTES de terminar de
 * construirlo —para escribir `scoreAtEvent` ya con el gol dentro—. Un
 * `GameEvent` entero encaja aquí sin conversiones.
 */
export type GoalLike = {
  type: GameEvent["type"];
  metadata?: GameEvent["metadata"];
};

export type Score = { team: number; opponent: number };

export const EMPTY_SCORE: Score = { team: 0, opponent: 0 };

const other = (side: GoalSide): GoalSide => (side === "team" ? "opponent" : "team");

/**
 * Goles que SUBEN AL MARCADOR.
 *
 * `GOAL_CONCEDED` está congelado —la captura no lo emite desde Fase 4— pero un
 * partido guardado puede traerlo, y entonces es el mismo hecho visto desde
 * nuestro portero. Los dos tipos no coexisten para un mismo gol, así que no
 * hay doble recuento.
 */
export function isGoalEvent(e: GoalLike): boolean {
  return (
    e.type === ActionType.GOAL ||
    e.type === ActionType.OWN_GOAL ||
    e.type === GoalieAction.GOAL_CONCEDED
  );
}

export function isOwnGoal(e: GoalLike): boolean {
  return e.type === ActionType.OWN_GOAL;
}

/**
 * Goles que SÍ son producción ofensiva de quien los marca.
 *
 * Es el predicado que deben usar los recuentos de tiro, conversión, precisión,
 * goleadores y mapas de finalización. Un gol en propia queda fuera: nadie lo
 * fabricó atacando.
 */
export function isOffensiveGoal(e: GoalLike): boolean {
  return e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED;
}

/** Equipo del JUGADOR que ejecuta la acción. Nunca se infiere de otra cosa. */
export function actorSide(e: GoalLike): GoalSide {
  return e.metadata?.isOpponent ? "opponent" : "team";
}

/**
 * Equipo que SUBE AL MARCADOR con este gol.
 *
 * Es la única función que lo decide, y la única razón por la que este módulo
 * existe. Un gol en propia suma al contrario de quien lo mete; cualquier otro
 * suma a quien lo marca.
 */
export function beneficiarySide(e: GoalLike): GoalSide {
  const autor = actorSide(e);
  return isOwnGoal(e) ? other(autor) : autor;
}

/** Equipo que lo ENCAJA. Siempre el contrario del beneficiario. */
export function concededBy(e: GoalLike): GoalSide {
  return other(beneficiarySide(e));
}

/** ¿Este gol le suma a ese lado? */
export function scoresFor(e: GoalLike, side: GoalSide): boolean {
  return isGoalEvent(e) && beneficiarySide(e) === side;
}

/** Los goles del partido que suben al marcador, en orden de los eventos. */
export function goalEvents(events: GameEvent[] | undefined | null): GameEvent[] {
  return (events || []).filter(isGoalEvent);
}

/**
 * EL MARCADOR. Fuente única para pantalla, historial, informe, PDF,
 * exportaciones y Tactical Pro.
 */
export function scoreOf(events: GameEvent[] | undefined | null): Score {
  const score: Score = { team: 0, opponent: 0 };
  for (const e of events || []) {
    if (!isGoalEvent(e)) continue;
    score[beneficiarySide(e)] += 1;
  }
  return score;
}

/** Cuántos goles le han subido a ese lado. */
export function goalsFor(events: GameEvent[] | undefined | null, side: GoalSide): number {
  return scoreOf(events)[side];
}

/**
 * El marcador DESPUÉS de registrar un gol más.
 *
 * Se usa al crear el evento, para que `scoreAtEvent` quede escrito con el
 * resultado ya incluido —que es lo que lee el historial— sin recalcular el
 * partido entero a mano en la pantalla de captura.
 */
export function scoreAfterAdding(
  events: GameEvent[] | undefined | null,
  nuevo: GoalLike,
): Score {
  const base = scoreOf(events);
  if (!isGoalEvent(nuevo)) return base;
  const lado = beneficiarySide(nuevo);
  return { ...base, [lado]: base[lado] + 1 };
}

// ── PRESENTACIÓN ────────────────────────────────────────────────────────
//
// Los rótulos viven aquí para que la pantalla, el historial, el PDF y el CSV
// no escriban cada uno el suyo: si uno dijera «gol del rival» donde otro dice
// «gol en propia», el lector no sabría cuál creer.

export const OWN_GOAL_LABEL = "Gol en propia";
export const UNKNOWN_SCORER_LABEL = "jugador no identificado";

/** `"Gol en propia de #7 Pérez"`, o sin autor si no se identificó. */
export function describeOwnGoalActor(numero: number | null, nombre: string | null): string {
  if (numero === null && !nombre) return `${OWN_GOAL_LABEL} — ${UNKNOWN_SCORER_LABEL}`;
  const ficha = [numero !== null ? `#${numero}` : null, nombre || null].filter(Boolean).join(" ");
  return `${OWN_GOAL_LABEL} de ${ficha}`;
}

/**
 * La frase de confirmación, antes y después de registrar.
 *
 * Dice las dos cosas que el operador necesita comprobar de un vistazo —quién
 * lo mete y a quién le suma— porque son contrarias y es justo donde se
 * equivocaría.
 */
export function describeOwnGoalBenefit(
  actorTeamName: string,
  beneficiaryTeamName: string,
  actor?: { number: number | null; name: string | null },
): string {
  const quien = actor
    ? describeOwnGoalActor(actor.number, actor.name)
    : `${OWN_GOAL_LABEL} — ${UNKNOWN_SCORER_LABEL}`;
  return `${quien} (${actorTeamName}) → gol para ${beneficiaryTeamName}`;
}

/** Nombre del equipo de un lado, con los rótulos del partido. */
export function sideName(
  side: GoalSide,
  names: { teamName: string; opponentName: string },
): string {
  return side === "team" ? names.teamName : names.opponentName;
}
