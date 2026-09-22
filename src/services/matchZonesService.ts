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
import { summarizeShots } from "../utils/shotModel";
import { hasRuleDeterminedOrigin } from "../utils/setPieceModel";
import {
  SetPieceOutcomeSummary,
  SetPieceRestartSummary,
  isSetPieceRestart,
  summarizeCornerOutcomes,
  summarizeSetPieceRestarts,
} from "../utils/setPieceModel";

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
    /** Faltas a favor puestas en juego. No son tiros ni faltas cometidas. */
    freeKickPlays: SetPieceRestartSummary;
  };
  /** Acciones espaciales registradas SIN ubicación (p. ej. faltas antiguas). */
  unlocated: number;
  /**
   * Lanzamientos cuyo origen fija el reglamento: penaltis y dobles penaltis.
   * No son acciones sin ubicar — su sitio no se observa, se sabe.
   */
  ruleDetermined: number;
  totals: {
    zonedActions: number;
    attempts: number;
    onTarget: number;
    /** Bloqueados o desviados antes de llegar a portería. Ni dentro ni fuera. */
    blocked: number;
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
/** Jugada de falta: reanudación a favor puesta en juego. No es un tiro. */
const isFreeKickPlay = (e: GameEvent) => isSetPieceRestart(e);

/**
 * Acciones con capacidad de llevar ubicación. Se usa para contar cuántas se
 * quedaron sin ella — dato que se declara en vez de esconderse.
 *
 * Un penalti y un doble penalti quedan FUERA: su origen lo fija el
 * reglamento, no la observación, así que no llevan sector y contarlos como
 * «sin ubicación» diría que falta un dato que nunca tuvo que existir. Se
 * cuentan aparte, en `ruleDetermined`.
 */
const isLocatable = (e: GameEvent) =>
  !hasRuleDeterminedOrigin(e) &&
  (isShotAttempt(e) || isRecovery(e) || isLoss(e) || isFoul(e) || isCorner(e) || isFreeKickPlay(e));

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

// ── DESGLOSE DE UNA CELDA ────────────────────────────────────
//
// EL NÚMERO DE LA CELDA NO ES UNA SUMA
// ------------------------------------
// `ZoneStats.total` es `events.length`: cuántos eventos DE ESE EQUIPO tienen
// un sector reconocido en esa celda. No filtra por tipo. Las seis categorías
// se calculan aparte y NO lo definen, así que:
//
//   1. `goals` está DENTRO de `shots` (isShotAttempt incluye GOAL), de modo
//      que sumar tiros y goles cuenta los goles dos veces;
//   2. hay eventos que entran en el total y en NINGUNA categoría: la jugada
//      de falta (SET_PIECE), las paradas (SAVE, SAVE_CATCH, SAVE_DEFLECT,
//      SAVE_PARRY) y las salidas (EXIT) cuando traen sector.
//
// Ese resto existe y es legítimo —son acciones del equipo, ubicadas—, así
// que no se oculta ni se resta del total: se declara como `other`. De esa
// forma el desglose SIEMPRE cierra contra el número que ve el usuario, que
// es justo lo que no ocurría cuando el PDF imprimía un 22 desnudo.

export type ZoneBreakdown = {
  /** El MISMO `ZoneStats.total`. No se recalcula aquí. */
  total: number;
  losses: number;
  recoveries: number;
  /** Intentos de tiro. INCLUYE los goles. */
  shots: number;
  /** Subconjunto de `shots`. Nunca se suma aparte. */
  goals: number;
  fouls: number;
  corners: number;
  /** Resto ubicado sin categoría propia. Cierra el total. */
  other: number;
};

/**
 * Descompone la celda sin tocar su total. Función pura.
 *
 * `other` se obtiene por resta y NUNCA descuenta `goals`: los goles ya van
 * dentro de `shots`, así que restarlos otra vez inflaría el resto.
 */
export function zoneBreakdown(zone: ZoneStats): ZoneBreakdown {
  const categorizadas = zone.shots + zone.losses + zone.recoveries + zone.fouls + zone.corners;
  return {
    total: zone.total,
    losses: zone.losses,
    recoveries: zone.recoveries,
    shots: zone.shots,
    goals: zone.goals,
    fouls: zone.fouls,
    corners: zone.corners,
    other: Math.max(0, zone.total - categorizadas),
  };
}

/** Nota que acompaña al resto. Se declara qué es, no se deja como misterio. */
export const ZONE_OTHER_NOTE =
  "jugadas de falta, paradas o salidas con zona registrada";

export type ZoneBreakdownRow = { label: string; value: string };

/**
 * El desglose ya redactado, en el orden en que se lee.
 *
 * Fuente ÚNICA de los rótulos: si el PDF y la pantalla escribieran cada uno
 * los suyos, uno de los dos acabaría diciendo «Tiros 5 · Goles 2», que
 * invita a sumar 7 acciones donde solo hubo 5.
 *
 * Las líneas con valor 0 se mantienen salvo `Otras`, que solo aparece cuando
 * existe resto: una línea «Otras 0» no informa de nada y ocupa alto de
 * página, que en el PDF es un recurso escaso.
 */
export function describeZoneBreakdown(zone: ZoneStats): ZoneBreakdownRow[] {
  const d = zoneBreakdown(zone);
  const filas: ZoneBreakdownRow[] = [
    { label: "Pérdidas", value: String(d.losses) },
    { label: "Recuperaciones", value: String(d.recoveries) },
    {
      label: "Tiros",
      value: d.goals > 0 ? `${d.shots} (incluye ${d.goals} gol${d.goals === 1 ? "" : "es"})` : String(d.shots),
    },
    { label: "Faltas cometidas", value: String(d.fouls) },
    { label: "Córners", value: String(d.corners) },
  ];
  if (d.other > 0) filas.push({ label: "Otras", value: String(d.other) });
  return filas;
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
  // Fuente única del desenlace (src/utils/shotModel.ts): aquí solo se toma la
  // cifra, para que el dashboard no tenga su propio criterio de «bloqueado».
  const blocked = summarizeShots(events).blocked;
  const onTarget = attempts.filter((e) => {
    const destination = e.destinationGrid?.toUpperCase();
    return destination ? destination !== "OUT" : isGoal(e);
  }).length;

  const zone12 = buildZone12Bucket(events);
  const legacy = buildLegacyBucket(events);
  const unlocated = events.filter((e) => isLocatable(e) && classifyZone(e.originGrid) === null).length;
  const ruleDetermined = events.filter(hasRuleDeterminedOrigin).length;

  // summarizeCorners aplica por su cuenta el filtro de equipo, así que aquí
  // solo se acota el período — si no, el resumen de córners ignoraría el
  // filtro de parte que sí respeta el resto del dashboard.
  const periodEvents = (matchData.events || []).filter(
    (e) => period === undefined || e.period === period,
  );
  const corners = summarizeCorners(periodEvents, opponent);
  // Mismo conjunto acotado por período que los córners: el desglose debe
  // cuadrar con el total que se muestra al lado.
  const setPieces = {
    corners: summarizeCornerOutcomes(periodEvents, opponent),
    // "Ubicada" con el mismo criterio que el resto del cubo: un sector que el
    // sistema reconoce, no simplemente una cadena presente.
    freeKickPlays: summarizeSetPieceRestarts(
      periodEvents,
      opponent,
      (e) => classifyZone(e.originGrid) !== null,
    ),
  };

  return {
    zone12,
    legacy,
    goal,
    out,
    corners,
    setPieces,
    unlocated,
    ruleDetermined,
    totals: {
      zonedActions: (zone12?.total ?? 0) + (legacy?.total ?? 0),
      attempts: attempts.length,
      onTarget,
      blocked,
      // Lo que queda tras descontar los tres desenlaces conocidos. Un tiro
      // bloqueado dejó de caer aquí: tiene su propia categoría y mezclarlo
      // con «no se registró» era decir que no sabemos algo que sí sabemos.
      unknownTarget: Math.max(0, attempts.length - onTarget - out - blocked),
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
