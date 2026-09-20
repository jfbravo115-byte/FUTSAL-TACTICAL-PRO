/**
 * src/utils/goalSequence.ts
 *
 * Cronología de los goles con sus tiempos de respuesta. Funciones puras.
 *
 * LA PREGUNTA QUE CONTESTA
 * ------------------------
 * «Marcamos y nos empataron enseguida» es una impresión hasta que alguien
 * pone el número al lado: 47 segundos. Aquí se calcula ese número, y se
 * calcula una sola vez, de forma determinista, para que el informe y el
 * análisis táctico digan lo mismo.
 *
 * NO SE INFIERE LA PROCEDENCIA
 * ----------------------------
 * `source` sale EXCLUSIVAMENTE de `metadata.setPiece`. Nunca de la zona, del
 * minuto, del número de faltas acumuladas ni de qué evento venía antes. Un
 * gol cuya procedencia no se registró es `unknown`, y así se imprime: un
 * penalti histórico no se distingue de una jugada, y fingir que sí sería
 * peor que decirlo.
 *
 * ENTRE PARTES NO HAY DELTA
 * -------------------------
 * `timestamp` son los milisegundos transcurridos dentro de la parte en curso
 * y el reloj se reinicia en el descanso, así que la duración real de la
 * primera parte no se guarda en ninguna parte. El delta entre el último gol
 * de una parte y el primero de la siguiente es desconocido y se devuelve
 * null. Restar `wallClock` daría un número —pero mediría el descanso, los
 * tiempos muertos y cada parada de reloj, que no es tiempo de juego.
 */
import { ActionType, GameEvent, GoalieAction, MatchData, Period } from "../types/futsal";
import { chronologicalIndexed, playingTimeBetween } from "./eventOrder";
import { SET_PIECE_ORIGIN_LABEL, setPieceOriginOf } from "./setPieceModel";

/** Procedencia del gol. `unknown` = no se registró. Nunca se deduce. */
export type GoalSource =
  | "normal"
  | "penalty"
  | "double_penalty"
  | "free_kick"
  | "corner"
  | "unknown";

export const GOAL_SOURCE_LABEL: Record<GoalSource, string> = {
  ...SET_PIECE_ORIGIN_LABEL,
  unknown: "No registrado",
};

export type GoalSequenceEntry = {
  eventId: string;
  /** Quién marcó, desde nuestra perspectiva. */
  scoringTeam: "team" | "opponent";
  playerId: string | null;
  playerName: string | null;
  playerNumber: number | null;
  period: Period;
  /** Milisegundos de juego dentro de su parte. */
  matchTime: number;
  matchTimeLabel: string;
  scoreAfter: { team: number; opponent: number };
  source: GoalSource;
  sourceLabel: string;
  /** null si el gol anterior fue de otra parte, o si es el primero. */
  secondsSincePreviousGoal: number | null;
  /** Desde el gol anterior del MISMO equipo. */
  secondsSinceOwnPreviousGoal: number | null;
  /** Desde el gol anterior del OTRO equipo: el tiempo de respuesta. */
  secondsSinceOpponentPreviousGoal: number | null;
};

const isGoalEvent = (e: GameEvent) =>
  e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED;

/** `"12:34"` a partir de milisegundos de juego. */
export function formatMatchTime(milliseconds: number): string {
  const total = Math.floor(Math.max(0, milliseconds) / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Procedencia registrada del gol, o `unknown`. */
export function goalSourceOf(event: GameEvent): GoalSource {
  return setPieceOriginOf(event) ?? "unknown";
}

/** Segundos, redondeados, a partir de milisegundos. null se propaga. */
function toSeconds(milliseconds: number | null): number | null {
  return milliseconds === null ? null : Math.round(milliseconds / 1000);
}

/**
 * Los goles del partido en orden, con sus tiempos de respuesta.
 *
 * Un `GOAL_CONCEDED` es el mismo hecho visto desde nuestro portero, así que
 * entra en la secuencia igual que un `GOAL`: su `metadata.isOpponent` ya dice
 * que lo marcó el rival. No se cuenta dos veces porque los dos tipos no
 * coexisten para un mismo gol.
 */
export function buildGoalSequence(matchData: MatchData): GoalSequenceEntry[] {
  const goles = chronologicalIndexed(matchData?.events || [])
    .map(({ event }) => event)
    .filter(isGoalEvent);

  const jugadores = matchData?.players || [];
  let marcador = { team: 0, opponent: 0 };
  let anterior: GameEvent | null = null;
  const ultimoDe: Record<"team" | "opponent", GameEvent | null> = {
    team: null,
    opponent: null,
  };

  const salida: GoalSequenceEntry[] = [];

  for (const event of goles) {
    const esRival = !!event.metadata?.isOpponent;
    const scoringTeam: "team" | "opponent" = esRival ? "opponent" : "team";
    const otro: "team" | "opponent" = esRival ? "team" : "opponent";

    // El marcador se lleva contando, y `scoreAtEvent` manda cuando existe:
    // es lo que se guardó en el momento del gol.
    marcador = esRival
      ? { ...marcador, opponent: marcador.opponent + 1 }
      : { ...marcador, team: marcador.team + 1 };
    const scoreAfter = event.scoreAtEvent ? { ...event.scoreAtEvent } : { ...marcador };

    // El goleador es el jugador del bando que marca. El portero que encaja
    // también está en playerIds, y no es quien marcó.
    const goleador =
      jugadores.find(
        (p) =>
          event.playerIds?.includes(p.id) &&
          !!p.isOpponent === esRival &&
          event.metadata?.targetGoalkeeperId !== p.id,
      ) ?? null;

    const source = goalSourceOf(event);

    salida.push({
      eventId: event.id,
      scoringTeam,
      playerId: goleador?.id ?? null,
      playerName: goleador?.name ?? null,
      playerNumber: goleador?.number ?? null,
      period: event.period,
      matchTime: event.timestamp,
      matchTimeLabel: formatMatchTime(event.timestamp),
      scoreAfter,
      source,
      sourceLabel: GOAL_SOURCE_LABEL[source],
      secondsSincePreviousGoal: anterior
        ? toSeconds(playingTimeBetween(anterior, event))
        : null,
      secondsSinceOwnPreviousGoal: ultimoDe[scoringTeam]
        ? toSeconds(playingTimeBetween(ultimoDe[scoringTeam]!, event))
        : null,
      secondsSinceOpponentPreviousGoal: ultimoDe[otro]
        ? toSeconds(playingTimeBetween(ultimoDe[otro]!, event))
        : null,
    });

    // El estado se actualiza DESPUÉS de construir la entrada, para que un gol
    // nunca se compare consigo mismo.
    anterior = event;
    ultimoDe[scoringTeam] = event;
  }

  return salida;
}
