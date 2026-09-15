/**
 * src/services/goalkeeperReportService.ts
 *
 * Datos de porteros para el informe, iterando TODOS los Role.GOALKEEPER
 * relevantes (no solo el isOnPitch actual) — cubre portero sustituido,
 * dos o más porteros, y portero sin acciones. Función pura, sin React,
 * sin DOM: misma fuente de verdad reutilizable tanto por el informe
 * completo como por el informe independiente de porteros.
 *
 * Reutiliza exactamente la misma selección de eventos que ya usaba
 * renderGoalieSection en MatchTracker.tsx (playerIds.includes(p.id)) —
 * no se inventa ningún criterio nuevo.
 */
import { GameEvent, GoalieAction, MatchData, Period, Player, Role } from "../types/futsal";
import { GkZoneTally, tallyGoalkeeperZones } from "../utils/goalkeeperZones";
import {
  effectiveGoalieAction,
  eventAcceptsGoalkeeperZone,
  exitOutcomeOf,
  isGoalieEventOwnedBy,
  formatExit,
  formatGoalieAction,
  hasGoalZone,
  isAnySave,
  isConcededGoal,
  isExit,
  isUnspecifiedSave,
} from "../utils/goalkeeperActions";

export type GoalkeeperTimelineEntry = {
  timeLabel: string;
  period: Period;
  type: string;
};

export type GoalkeeperReportEntry = {
  id: string;
  number: number;
  name: string;
  isOpponent: boolean;
  isOnPitch: boolean;
  totSeconds: number;
  totLabel: string;
  /** Nº de eventos GoalieAction.SAVE_CATCH — se presenta como "Blocaje/Atrapada". */
  saveCatch: number;
  /**
   * SIEMPRE 0. SAVE_PARRY quedó congelado en Fase 4 y sus eventos históricos
   * cuentan en `saveUnspecified`: se capturaron bajo un botón que decía
   * "PARADA", así que su subtipo real es desconocido y NO son despejes. El
   * campo se conserva para no romper consumidores existentes.
   */
  saveParry: number;
  saveGeneric: number;
  /** Despejes/rechaces con subtipo explícito (SAVE_DEFLECT). */
  saveDeflect: number;
  /**
   * Paradas registradas como disparo rival a puerta (ActionType.SHOT) sin
   * subtipo de intervención. El dato existe y es real, pero NO permite saber
   * si fue blocaje o despeje — y no se inventa. Se presenta como "sin subtipo
   * registrado".
   */
  saveUnspecified: number;
  totalSaves: number;
  conceded: number;
  shotsFaced: number;
  /**
   * Intervenciones con zona de portería registrada, es decir las que el mapa
   * de impacto puede dibujar. Permite que cabecera y mapa cuadren a la vista
   * en vez de parecer contradictorios.
   */
  mappedInterventions: number;
  /** Salidas/intervenciones registradas. */
  exits: number;
  exitsSuccess: number;
  exitsFail: number;
  /** Salidas sin resultado registrado. Nunca se infiere. */
  exitsUnknown: number;
  /**
   * Distribución de intervenciones por zona del portero (GK1-GK5). Dominio
   * SEPARADO del origen del tiro y del destino en portería: nunca se mezclan
   * en una misma métrica.
   */
  interventionZones: GkZoneTally;
  /** Intervenciones sin zona registrada. Se declara, no se reparte. */
  interventionsUnlocated: number;
  /** Salidas por zona, y su desglose de resultado. */
  exitZones: GkZoneTally;
  exitZonesSuccess: GkZoneTally;
  exitZonesFail: GkZoneTally;
  effectivenessPct: number | null;
  events: GameEvent[]; // eventos propios (para los mapas, ya filtrados)
  timeline: GoalkeeperTimelineEntry[];
};

const fmtSeconds = (totalSeconds: number): string => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
};

const fmtMilliseconds = (ms: number): string => fmtSeconds(Math.max(0, ms) / 1000);

/**
 * ¿Este portero es "relevante" para el informe? Ha jugado algo de tiempo
 * o participa en algún evento — mismo criterio que "jugadores utilizados"
 * en matchReportService.ts, aplicado aquí solo a porteros.
 */
function isRelevantGoalkeeper(p: Player, events: GameEvent[]): boolean {
  return p.individualTimeSeconds > 0 || events.some((e) => e.playerIds.includes(p.id));
}

export function buildGoalkeeperReports(matchData: MatchData): GoalkeeperReportEntry[] {
  const goalkeepers = matchData.players.filter(
    (p) => p.role === Role.GOALKEEPER && isRelevantGoalkeeper(p, matchData.events),
  );

  return goalkeepers
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((p) => {
      // ATRIBUCIÓN COMPARTIDA (corrección de Fase 4).
      //
      // Antes bastaba con que playerIds incluyera al portero. La captura
      // anterior a Fase 4 metía TAMBIÉN al portero rival en la parada del
      // portero local, así que un partido histórico acreditaba la misma
      // parada a los dos. Ahora una acción de portero solo cuenta para el
      // portero de su mismo bando, decidido por el bando registrado en el
      // propio evento. Es corrección de LECTURA: el JSON no se toca.
      const ownEvents = matchData.events.filter((e) => isGoalieEventOwnedBy(e, p));

      // El desglose se hace por ACCIÓN EFECTIVA: así una parada cuenta igual
      // venga como evento propio del portero o como respuesta declarada
      // dentro del tiro rival. Una ocasión, una parada.
      const countAction = (action: GoalieAction) =>
        ownEvents.filter((e) => effectiveGoalieAction(e) === action).length;
      const saveCatch = countAction(GoalieAction.SAVE_CATCH);
      const saveDeflect = countAction(GoalieAction.SAVE_DEFLECT);
      const saveGeneric = countAction(GoalieAction.SAVE);
      // SAVE_PARRY histórico entra aquí, no en "despejes": se registró bajo un
      // botón que decía PARADA, así que su subtipo real es desconocido.
      const saveUnspecified = ownEvents.filter(isUnspecifiedSave).length;
      const saveParry = 0;
      const totalSaves = saveCatch + saveDeflect + saveGeneric + saveUnspecified;

      const exitEvents = ownEvents.filter(isExit);
      const exits = exitEvents.length;
      const exitsSuccess = exitEvents.filter((e) => exitOutcomeOf(e) === "success").length;
      const exitsFail = exitEvents.filter((e) => exitOutcomeOf(e) === "fail").length;
      const exitsUnknown = exits - exitsSuccess - exitsFail;
      const conceded = ownEvents.filter(isConcededGoal).length;
      const shotsFaced = totalSaves + conceded;
      const mappedInterventions = ownEvents.filter(
        (e) => (isAnySave(e) || isConcededGoal(e)) && hasGoalZone(e),
      ).length;
      const effectivenessPct = shotsFaced > 0 ? Math.round((totalSaves / shotsFaced) * 100) : null;

      // ZONA DE INTERVENCIÓN (GK1-GK5). Se cuentan las acciones que admiten
      // zona: paradas con tipo propio y salidas. Las que no la registraron se
      // declaran aparte en vez de repartirse.
      const zonedEvents = ownEvents.filter(eventAcceptsGoalkeeperZone);
      const zoneTally = tallyGoalkeeperZones(zonedEvents);
      const interventionZones = zoneTally.byZone;
      const interventionsUnlocated = zoneTally.unlocated;

      const exitZones = tallyGoalkeeperZones(exitEvents).byZone;
      const exitZonesSuccess = tallyGoalkeeperZones(
        exitEvents.filter((e) => exitOutcomeOf(e) === "success"),
      ).byZone;
      const exitZonesFail = tallyGoalkeeperZones(
        exitEvents.filter((e) => exitOutcomeOf(e) === "fail"),
      ).byZone;

      // Mismos predicados que las estadísticas: si una intervención cuenta
      // arriba, aparece también aquí.
      const timeline: GoalkeeperTimelineEntry[] = ownEvents
        .filter((e) => isAnySave(e) || isConcededGoal(e) || isExit(e))
        .slice()
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((e) => ({
          timeLabel: fmtMilliseconds(e.timestamp),
          period: e.period,
          type: isExit(e) ? formatExit(e) : formatGoalieAction(effectiveGoalieAction(e) ?? e.type),
        }));

      return {
        id: p.id,
        number: p.number,
        name: p.name,
        isOpponent: p.isOpponent,
        isOnPitch: p.isOnPitch,
        totSeconds: p.individualTimeSeconds,
        totLabel: fmtSeconds(p.individualTimeSeconds),
        saveParry,
        saveCatch,
        saveGeneric,
        saveDeflect,
        saveUnspecified,
        exits,
        exitsSuccess,
        exitsFail,
        exitsUnknown,
        interventionZones,
        interventionsUnlocated,
        exitZones,
        exitZonesSuccess,
        exitZonesFail,
        mappedInterventions,
        totalSaves,
        conceded,
        shotsFaced,
        effectivenessPct,
        events: ownEvents,
        timeline,
      };
    });
}
