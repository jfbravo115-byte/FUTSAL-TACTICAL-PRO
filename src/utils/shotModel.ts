/**
 * src/utils/shotModel.ts
 *
 * Desenlace de un tiro. Funciones puras, sin React y sin DOM.
 *
 * EL DEFECTO QUE ESTO CORRIGE
 * ---------------------------
 * En CD MURCIA 2-4 PR7 el rival aparecía con 5 tiros, el mapa de tiros
 * recibidos con 1, y el informe de porteros con 12 remates resueltos. Tres
 * cifras para el mismo partido porque cada superficie tenía su propio
 * criterio y porque la vía de captura fácil —registrar la parada desde el
 * radial del portero— no crea ningún tiro rival.
 *
 * Aquí vive el criterio, una sola vez.
 *
 * CINCO MAGNITUDES QUE NO SON LA MISMA
 * ------------------------------------
 *   shots                      intentos totales
 *   onTarget                   entre los tres palos (incluye los goles)
 *   offTarget                  fuera
 *   blocked                    bloqueado o desviado antes de llegar
 *   goalkeeperInterventions    respuestas del portero declaradas
 *
 * No se deducen unas de otras y no deben sumarse entre sí. Un partido con
 * 8 paradas y 4 goles tiene 12 tiros a puerta, no 16: el gol es el desenlace
 * del remate, no un remate adicional.
 *
 * POR QUÉ `shotOutcome` SOLO VALE 'blocked'
 * -----------------------------------------
 * Porque es lo único que `destinationGrid` no puede decir:
 *
 *   destinationGrid G1-G9   →  fue entre palos
 *   destinationGrid OUT     →  se fue fuera
 *   metadata.shotOutcome    →  ni una cosa ni la otra: lo interceptaron
 *
 * Guardar además 'on_target' u 'off_target' sería una segunda verdad que
 * mantener sincronizada con `destinationGrid`, y la primera vez que las dos
 * discreparan no sabríamos cuál creer.
 *
 * FUERA Y BLOQUEADO NO SON SINÓNIMOS
 * ----------------------------------
 * El botón de captura decía «Tiro Fuera / Desviado» y producía un único
 * `OUT`. Un tiro que se marcha por encima del larguero y un tiro que un
 * defensa saca con el cuerpo dentro del área son dos hechos tácticos
 * distintos: el primero habla de la finalización, el segundo del bloqueo
 * rival.
 *
 * AUSENCIA = NO REGISTRADO
 * ------------------------
 * Un tiro sin `destinationGrid` y sin `shotOutcome` no se reparte ni se
 * supone: cae en `unrecorded` y se declara. Los partidos anteriores a este
 * modelo no traen `shotOutcome` y no se migran.
 */
import { ActionType, GameEvent, GoalieAction } from "../types/futsal";
import { GOAL_OUT_ID, isGoalZoneId } from "./goalZones";
import { goalieResponseOf } from "./goalkeeperActions";

// ── DESENLACE DECLARADO ─────────────────────────────────────────────────

/**
 * Lo único que se guarda en el evento. Ver la cabecera: el resto del
 * desenlace ya lo dice `destinationGrid` y duplicarlo crearía dos verdades.
 */
export type ShotOutcome = "blocked";

export const SHOT_OUTCOME_BLOCKED: ShotOutcome = "blocked";

export const SHOT_OUTCOME_LABEL: Record<ShotOutcome, string> = {
  blocked: "Bloqueado / desviado",
};

export function isShotOutcome(raw: unknown): raw is ShotOutcome {
  return raw === SHOT_OUTCOME_BLOCKED;
}

/**
 * Desenlace declarado en el evento, o null si no se declaró.
 *
 * Solo un tiro puede declararlo: un `GOAL` ya dice cómo terminó, y cualquier
 * otro tipo de evento que lo trajera queda inerte sin necesidad de migrar.
 */
export function shotOutcomeOf(event: GameEvent): ShotOutcome | null {
  if (event.type !== ActionType.SHOT) return null;
  return isShotOutcome(event.metadata?.shotOutcome) ? event.metadata.shotOutcome : null;
}

/**
 * Metadata de un tiro bloqueado.
 *
 * Lleva TAMBIÉN `goalieResponse: UNSPECIFIED` a propósito. Sin esa marca, el
 * tiro no tiene `destinationGrid` y el comportamiento histórico —«un tiro que
 * no es OUT lo paró el portero contrario»— le inventaría una parada, tanto en
 * `goalieStatsDelta` como en `isUnspecifiedSave`. Un tiro bloqueado por un
 * defensa NO es una parada, y declararlo así lo impide sin tocar la regla
 * histórica, de la que dependen los partidos anteriores.
 *
 * El valor se escribe literal en vez de importarse de goalkeeperActions
 * porque ese módulo lee `shotOutcomeOf`: importarlo de vuelta cerraría un
 * ciclo entre los dos archivos.
 */
export function blockedShotMetadata(): {
  shotOutcome: ShotOutcome;
  goalieResponse: "UNSPECIFIED";
} {
  return { shotOutcome: SHOT_OUTCOME_BLOCKED, goalieResponse: "UNSPECIFIED" };
}

// ── CLASIFICACIÓN ───────────────────────────────────────────────────────

/** Todo lo que cuenta como intento de remate. Un gol es un intento. */
export function isShotAttempt(e: GameEvent): boolean {
  return (
    e.type === ActionType.SHOT ||
    e.type === ActionType.GOAL ||
    e.type === GoalieAction.GOAL_CONCEDED
  );
}

export function isShotGoal(e: GameEvent): boolean {
  return e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED;
}

export type ShotResolution = "goal" | "on_target" | "off_target" | "blocked" | "unrecorded";

/**
 * Cómo terminó este intento. Un único punto de decisión para que ninguna
 * pantalla vuelva a tener su propio criterio.
 *
 * El orden importa: el gol manda sobre cualquier otra cosa, y lo declarado
 * manda sobre lo deducido.
 */
export function shotResolution(e: GameEvent): ShotResolution {
  if (!isShotAttempt(e)) return "unrecorded";
  if (isShotGoal(e)) return "goal";
  if (shotOutcomeOf(e) === SHOT_OUTCOME_BLOCKED) return "blocked";

  const destination = typeof e.destinationGrid === "string" ? e.destinationGrid.toUpperCase() : null;
  if (destination === GOAL_OUT_ID) return "off_target";
  if (isGoalZoneId(destination)) return "on_target";
  return "unrecorded";
}

// ── CONTRATO ESTADÍSTICO ────────────────────────────────────────────────

export type ShotTally = {
  /** Intentos totales: goles + a puerta + fuera + bloqueados + sin declarar. */
  shots: number;
  goals: number;
  /** Entre los tres palos. INCLUYE los goles. */
  onTarget: number;
  offTarget: number;
  blocked: number;
  /** Intentos cuyo desenlace no se registró. Ni se reparten ni se suponen. */
  unrecorded: number;
  /** Tiros con respuesta del portero declarada. NO incluye los goles. */
  goalkeeperInterventions: number;
  /**
   * Remates que acabaron en las manos del portero contrario: sus
   * intervenciones más los goles que encajó. Es la magnitud que el informe de
   * portero llama «remates afrontados», y no es igual a `shots`.
   */
  resolvedByGoalkeeper: number;
};

const EMPTY_TALLY: ShotTally = {
  shots: 0,
  goals: 0,
  onTarget: 0,
  offTarget: 0,
  blocked: 0,
  unrecorded: 0,
  goalkeeperInterventions: 0,
  resolvedByGoalkeeper: 0,
};

/**
 * Recuento de una lista de eventos YA acotada al equipo que interese.
 *
 * No filtra por bando a propósito: quien llama decide de quién habla, y así
 * la misma función sirve para «nuestros tiros» y para «los del rival» sin
 * que existan dos criterios.
 */
export function summarizeShots(events: GameEvent[]): ShotTally {
  const attempts = (events || []).filter(isShotAttempt);
  const tally = { ...EMPTY_TALLY, shots: attempts.length };

  for (const e of attempts) {
    switch (shotResolution(e)) {
      case "goal":
        tally.goals += 1;
        tally.onTarget += 1;
        break;
      case "on_target":
        tally.onTarget += 1;
        break;
      case "off_target":
        tally.offTarget += 1;
        break;
      case "blocked":
        tally.blocked += 1;
        break;
      default:
        tally.unrecorded += 1;
    }
    if (goalieResponseOf(e) !== null) tally.goalkeeperInterventions += 1;
  }

  tally.resolvedByGoalkeeper = tally.goalkeeperInterventions + tally.goals;
  return tally;
}

/** Recuento acotado al bando indicado, para quien parte del partido entero. */
export function summarizeTeamShots(events: GameEvent[], opponent: boolean): ShotTally {
  return summarizeShots((events || []).filter((e) => !!e.metadata?.isOpponent === opponent));
}
