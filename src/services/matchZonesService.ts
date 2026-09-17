/**
 * src/services/matchZonesService.ts
 *
 * Agregados espaciales del partido. Función pura, sin React y sin DOM.
 *
 * DOS SISTEMAS QUE NO SE MEZCLAN
 * ------------------------------
 * Un partido nuevo usa las 12 zonas (`Z1L-Z4R`); uno histórico usa la rejilla
 * de 9 celdas (`A1-C3`). No hay conversión entre ambos y sus recuentos NUNCA
 * se suman: el dashboard devuelve dos cubos independientes y cada uno se
 * dibuja por separado con su propia pista.
 *
 * El origen (pista) y el destino (portería, `G1-G9` / `OUT`) siguen siendo
 * conceptos distintos, como hasta ahora.
 *
 * Ningún identificador interno sale de aquí sin su etiqueta de usuario al
 * lado: la UI consume `label`, nunca `zone`.
 */
import { ActionType, GameEvent, GoalieAction, MatchData, Period } from "../types/futsal";
import {
  ZONE_12_IDS,
  Zone12Id,
  ZoneTally,
  emptyZoneTally,
  formatZoneLabel,
  isZone12Id,
  mirrorZone12,
} from "../utils/fieldZones";
import {
  LEGACY_ZONE_IDS,
  classifyZone,
  formatLegacyLabel,
  isLegacyZoneId,
} from "../utils/legacyZoneMap";
import { GOAL_ZONE_IDS, GoalZoneId, formatGoalZoneLabel } from "../utils/goalZones";
import { CornerSummary, summarizeCorners } from "../utils/cornerModel";
import { SetPieceOutcomeSummary, summarizeCornerOutcomes } from "../utils/setPieceModel";

export { GOAL_ZONE_IDS } from "../utils/goalZones";

export type SpatialSystem = "zone12" | "legacy3x3";

export type ZoneStats = {
  /** Identificador interno. NO mostrar al usuario: usar `label`. */
  zone: string;
  /** Etiqueta lista para pantalla, p. ej. "Zona 2 · centro". */
  label: string;
  total: number;
  shots: number;
  goals: number;
  losses: number;
  recoveries: number;
  fouls: number;
  corners: number;
};

export type ZoneBucket = {
  system: SpatialSystem;
  zones: ZoneStats[];
  total: number;
  mostActive: ZoneStats | null;
  mostDangerous: ZoneStats | null;
};

export type GoalZoneStats = {
  zone: GoalZoneId;
  label: string;
  attempts: number;
  goals: number;
};

export type ZoneMetric = "all" | "shots" | "recoveries" | "losses" | "fouls" | "corners";

export type ZoneDashboard = {
  /** Cubo del sistema nuevo. null si el partido no tiene datos de 12 zonas. */
  zone12: ZoneBucket | null;
  /** Cubo histórico. null si el partido no tiene datos `A1-C3`. */
  legacy: ZoneBucket | null;
  goal: GoalZoneStats[];
  out: number;
  corners: CornerSummary;
  /**
   * Desglose del CÓRNER por desenlace. NO sustituye a la dimensión espacial:
   * `corners` sigue dando el lado y los sectores siguen dando la ubicación.
   * Esto responde a otra pregunta: cómo se ejecutó.
   *
   * No hay desglose de faltas: un FOUL es la infracción cometida, no la
   * reanudación que ejecuta el rival. Los tiros de falta se cuentan en el
   * propio tiro (`setPiece === 'free_kick'`).
   */
  setPieces: {
    corners: SetPieceOutcomeSummary;
  };
  /** Acciones espaciales registradas SIN ubicación (p. ej. faltas antiguas). */
  unlocated: number;
  totals: {
    zonedActions: number;
    attempts: number;
    onTarget: number;
    unknownTarget: number;
    goals: number;
    recoveries: number;
    losses: number;
    fouls: number;
    corners: number;
    conversionPct: number | null;
    accuracyPct: number | null;
  };
};

// ── PREDICADOS ──────────────────────────────────────────────────────────

const isShotAttempt = (e: GameEvent) =>
  e.type === ActionType.SHOT || e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED;

const isGoal = (e: GameEvent) =>
  e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED;

const isRecovery = (e: GameEvent) =>
  e.type === ActionType.STEAL || e.type === ActionType.INTERCEPTION;

const isLoss = (e: GameEvent) =>
  e.type === ActionType.LOSS || e.type === ActionType.UNFORCED_ERROR;

const isFoul = (e: GameEvent) => e.type === ActionType.FOUL;
const isCorner = (e: GameEvent) => e.type === ActionType.CORNER;

/**
 * Acciones con capacidad de llevar ubicación. Se usa para contar cuántas se
 * quedaron sin ella — dato que se declara en vez de esconderse.
 */
const isLocatable = (e: GameEvent) =>
  isShotAttempt(e) || isRecovery(e) || isLoss(e) || isFoul(e) || isCorner(e);

export function scopedEvents(
  matchData: MatchData,
  opponent: boolean,
  period?: Period,
): GameEvent[] {
  return (matchData.events || []).filter(
    (e) => !!e.metadata?.isOpponent === opponent && (period === undefined || e.period === period),
  );
}

// ── CUBOS POR SISTEMA ───────────────────────────────────────────────────

function buildStats(zone: string, label: string, events: GameEvent[]): ZoneStats {
  return {
    zone,
    label,
    total: events.length,
    shots: events.filter(isShotAttempt).length,
    goals: events.filter(isGoal).length,
    losses: events.filter(isLoss).length,
    recoveries: events.filter(isRecovery).length,
    fouls: events.filter(isFoul).length,
    corners: events.filter(isCorner).length,
  };
}

function buildBucket(
  system: SpatialSystem,
  ids: readonly string[],
  label: (id: string) => string,
  events: GameEvent[],
): ZoneBucket {
  const zones = ids.map((id) =>
    buildStats(
      id,
      label(id),
      events.filter((e) => {
        const ref = classifyZone(e.originGrid);
        return ref !== null && ref.kind !== "unknown" && ref.id === id;
      }),
    ),
  );

  const total = zones.reduce((acc, z) => acc + z.total, 0);

  const mostActive =
    zones.filter((z) => z.total > 0).sort((a, b) => b.total - a.total || ids.indexOf(a.zone) - ids.indexOf(b.zone))[0] ??
    null;

  const mostDangerous =
    zones
      .filter((z) => z.shots > 0)
      .sort(
        (a, b) =>
          b.goals - a.goals || b.shots - a.shots || ids.indexOf(a.zone) - ids.indexOf(b.zone),
      )[0] ?? null;

  return { system, zones, total, mostActive, mostDangerous };
}

/**
 * Cubo del sistema NUEVO, o null si el partido no tiene ni un solo evento con
 * sector de 12 zonas. null significa "este partido no usa el sistema nuevo",
 * no "cero acciones".
 */
export function buildZone12Bucket(events: GameEvent[]): ZoneBucket | null {
  if (!events.some((e) => isZone12Id(e.originGrid))) return null;
  return buildBucket("zone12", ZONE_12_IDS, (id) => formatZoneLabel(id) ?? id, events);
}

/** Cubo HISTÓRICO, o null si el partido no tiene datos `A1-C3`. */
export function buildLegacyBucket(events: GameEvent[]): ZoneBucket | null {
  if (!events.some((e) => isLegacyZoneId(e.originGrid))) return null;
  return buildBucket("legacy3x3", LEGACY_ZONE_IDS, (id) => formatLegacyLabel(id) ?? id, events);
}

export function zoneMetricValue(zone: ZoneStats, metric: ZoneMetric): number {
  switch (metric) {
    case "shots": return zone.shots;
    case "recoveries": return zone.recoveries;
    case "losses": return zone.losses;
    case "fouls": return zone.fouls;
    case "corners": return zone.corners;
    default: return zone.total;
  }
}

// ── RECUENTOS PARA LA LECTURA TEXTUAL ───────────────────────────────────

/**
 * Recuento por sector de las acciones que cumplen un predicado. Solo cuenta
 * sectores del sistema nuevo: la lectura en lenguaje natural de 12 zonas no
 * aplica a datos históricos, cuya perspectiva es desconocida.
 */
export function tallyActionZones(
  matchData: MatchData,
  predicate: (e: GameEvent) => boolean,
  opponent = false,
  period?: Period,
): ZoneTally {
  const tally = emptyZoneTally();
  for (const event of scopedEvents(matchData, opponent, period)) {
    if (!predicate(event)) continue;
    if (isZone12Id(event.originGrid)) tally[event.originGrid as Zone12Id] += 1;
  }
  return tally;
}

/**
 * Espejo de un recuento completo a la perspectiva del equipo contrario.
 *
 * Se usa para las faltas RECIBIDAS: el evento guarda la zona desde la
 * perspectiva de quien comete la falta, y esta transformación la presenta
 * desde la de quien la recibe. Es solo presentación — no se guarda una
 * segunda zona ni se modifica el evento original.
 */
export function mirrorTally(tally: ZoneTally): ZoneTally {
  const mirrored = emptyZoneTally();
  for (const id of ZONE_12_IDS) {
    mirrored[mirrorZone12(id)] = tally[id];
  }
  return mirrored;
}

export const ZONE_PREDICATES = {
  shots: isShotAttempt,
  goals: isGoal,
  losses: isLoss,
  recoveries: isRecovery,
  fouls: isFoul,
  corners: isCorner,
} as const;

// ── DASHBOARD ───────────────────────────────────────────────────────────

export function buildZoneDashboard(
  matchData: MatchData,
  opponent = false,
  period?: Period,
): ZoneDashboard {
  const events = scopedEvents(matchData, opponent, period);
  const attempts = events.filter(isShotAttempt);

  const goal: GoalZoneStats[] = GOAL_ZONE_IDS.map((zone) => {
    const zoneAttempts = attempts.filter((e) => e.destinationGrid?.toUpperCase() === zone);
    return {
      zone,
      label: formatGoalZoneLabel(zone) ?? zone,
      attempts: zoneAttempts.length,
      goals: zoneAttempts.filter(isGoal).length,
    };
  });

  const out = attempts.filter((e) => e.destinationGrid?.toUpperCase() === "OUT").length;
  const onTarget = attempts.filter((e) => {
    const destination = e.destinationGrid?.toUpperCase();
    return destination ? destination !== "OUT" : isGoal(e);
  }).length;

  const zone12 = buildZone12Bucket(events);
  const legacy = buildLegacyBucket(events);
  const unlocated = events.filter((e) => isLocatable(e) && classifyZone(e.originGrid) === null).length;

  // summarizeCorners aplica por su cuenta el filtro de equipo, así que aquí
  // solo se acota el período — si no, el resumen de córners ignoraría el
  // filtro de parte que sí respeta el resto del dashboard.
  const periodEvents = (matchData.events || []).filter(
    (e) => period === undefined || e.period === period,
  );
  const corners = summarizeCorners(periodEvents, opponent);
  // Mismo conjunto acotado por período que los córners: el desglose debe
  // cuadrar con el total que se muestra al lado.
  const setPieces = { corners: summarizeCornerOutcomes(periodEvents, opponent) };

  return {
    zone12,
    legacy,
    goal,
    out,
    corners,
    setPieces,
    unlocated,
    totals: {
      zonedActions: (zone12?.total ?? 0) + (legacy?.total ?? 0),
      attempts: attempts.length,
      onTarget,
      unknownTarget: Math.max(0, attempts.length - onTarget - out),
      goals: attempts.filter(isGoal).length,
      recoveries: events.filter(isRecovery).length,
      losses: events.filter(isLoss).length,
      fouls: events.filter(isFoul).length,
      corners: events.filter(isCorner).length,
      conversionPct: attempts.length
        ? Math.round((attempts.filter(isGoal).length / attempts.length) * 100)
        : null,
      accuracyPct: onTarget + out ? Math.round((onTarget / (onTarget + out)) * 100) : null,
    },
  };
}

/**
 * Cubo activo del partido: el nuevo si existe, si no el histórico. Atajo para
 * las vistas que muestran un único mapa; las que pueden mostrar los dos usan
 * `zone12` y `legacy` por separado.
 */
export function primaryBucket(dashboard: ZoneDashboard): ZoneBucket | null {
  return dashboard.zone12 ?? dashboard.legacy;
}
