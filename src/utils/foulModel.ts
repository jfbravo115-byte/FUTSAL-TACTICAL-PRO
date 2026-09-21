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
import { ActionType, GameEvent, Period, Player } from "../types/futsal";

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

// ── PASO OPCIONAL ───────────────────────────────────────────────────────
//
// La ubicación llega DESPUÉS de que la falta ya esté contabilizada, y es el
// ÚNICO paso posterior que tiene una falta. Solo parchea el evento indicado:
// no toca contadores, no toca jugadores y no crea ni borra eventos. Es lo que
// garantiza que omitirla no deshaga nada.
//
// Una falta no tiene "desenlace": el evento FOUL es la infracción cometida, y
// quién ejecuta después la reanudación es otra acción, de otro equipo y de
// otro jugador. Ver utils/setPieceModel.

/** Añade la ubicación a un evento ya registrado. */
export function withEventLocation(
  events: GameEvent[],
  eventId: string,
  originGrid: string,
): GameEvent[] {
  return events.map((e) => (e.id === eventId ? { ...e, originGrid } : e));
}

// ── FALTAS DEL PARTIDO, DERIVADAS DE LOS EVENTOS ────────────────────────
//
// EL DEFECTO QUE ESTO CORRIGE
// ---------------------------
// La portada del informe imprimía `matchData.fouls` bajo la etiqueta
// «Faltas», y ese contador se reinicia en el descanso porque su trabajo es
// disparar la sanción de la 6ª falta. Al acabar el partido valía lo de la
// SEGUNDA parte, no lo del encuentro: en CD MURCIA-PR7 decía 2 propias
// mientras la columna de jugadores del mismo PDF sumaba 7.
//
// El contador en vivo no está mal: está haciendo su trabajo. Lo que estaba
// mal era usarlo como total.
//
// LOS EVENTOS SÍ SABEN
// --------------------
// Cada `FOUL` guarda su `period` y el bando que la cometió, así que el
// desglose por parte y el total del partido se derivan sin ambigüedad y sin
// inferir nada de las tarjetas, los goles de doble penalti ni las zonas.
//
// UNA FALTA SIN JUGADOR SIGUE SIENDO UNA FALTA
// --------------------------------------------
// Se cuenta para el equipo aunque no se le atribuya a nadie. Por eso el
// total de equipo puede ser mayor que la suma de las faltas individuales, y
// eso no es una discrepancia: es una falta que se registró sin señalar al
// infractor.

export type FoulPeriodLine = {
  period: Period;
  team: number;
  opponent: number;
};

export type FoulSummary = {
  /** Faltas de todo el partido, por bando. */
  total: FoulCounters;
  /** Una línea por periodo CON faltas, en orden. */
  byPeriod: FoulPeriodLine[];
  /**
   * ¿Hay algún evento FOUL del que derivar?
   *
   * Un partido anterior a que las faltas se guardaran como eventos puede
   * traer el contador con valores y ninguna falta registrada. En ese caso el
   * total derivado es 0 y presentarlo como el del partido sería mentir por
   * omisión: quien lea esto debe decir que el desglose no está disponible,
   * nunca rellenarlo.
   */
  hasFoulEvents: boolean;
};

export function emptyFoulSummary(): FoulSummary {
  return { total: { team: 0, opponent: 0 }, byPeriod: [], hasFoulEvents: false };
}

/**
 * Faltas del partido a partir de los eventos. ÚNICA fuente postpartido.
 *
 * No mira `PlayerStats`, ni el contador en vivo, ni los goles de doble
 * penalti: solo eventos `FOUL`, su `period` y su `metadata.isOpponent`.
 *
 * Los periodos salen de los propios eventos y se ordenan, así que una
 * prórroga aparece como su propia línea y nunca se mezcla con la 2ª parte.
 */
export function summarizeFouls(events: GameEvent[]): FoulSummary {
  const faltas = (events || []).filter(isFoulEvent);
  if (faltas.length === 0) return emptyFoulSummary();

  const porPeriodo = new Map<Period, FoulPeriodLine>();
  const total: FoulCounters = { team: 0, opponent: 0 };

  for (const falta of faltas) {
    const key = foulTeamKeyOf(falta);
    total[key] += 1;

    const period = falta.period;
    if (!porPeriodo.has(period)) porPeriodo.set(period, { period, team: 0, opponent: 0 });
    porPeriodo.get(period)![key] += 1;
  }

  return {
    total,
    byPeriod: [...porPeriodo.values()].sort((a, b) => a.period - b.period),
    hasFoulEvents: true,
  };
}

/** Faltas de un bando en un periodo concreto. Cero si no hubo ninguna. */
export function foulsInPeriod(
  summary: FoulSummary,
  period: Period,
  opponent: boolean,
): number {
  const linea = summary.byPeriod.find((l) => l.period === period);
  if (!linea) return 0;
  return opponent ? linea.opponent : linea.team;
}
