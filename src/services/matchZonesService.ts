import { ActionType, GameEvent, GoalieAction, MatchData, Period } from "../types/futsal";

export type QuickZoneStats = {
  zone: string;
  total: number;
  shots: number;
  losses: number;
  recoveries: number;
  goals: number;
};

export type ZoneMetric = "all" | "shots" | "recoveries" | "losses";

export type GoalZoneStats = {
  zone: string;
  attempts: number;
  goals: number;
};

export type ZoneDashboard = {
  origin: QuickZoneStats[];
  goal: GoalZoneStats[];
  out: number;
  totals: {
    zonedActions: number;
    attempts: number;
    onTarget: number;
    unknownTarget: number;
    goals: number;
    recoveries: number;
    losses: number;
    conversionPct: number | null;
    accuracyPct: number | null;
  };
  mostActiveZone: QuickZoneStats | null;
  mostDangerousZone: QuickZoneStats | null;
};

export const QUICK_ZONE_IDS = ["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "C3"] as const;
export const GOAL_ZONE_IDS = ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G9"] as const;

const isShotAttempt = (e: GameEvent) =>
  e.type === ActionType.SHOT || e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED;

const isGoal = (e: GameEvent) => e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED;
const isRecovery = (e: GameEvent) => e.type === ActionType.STEAL || e.type === ActionType.INTERCEPTION;
const isLoss = (e: GameEvent) => e.type === ActionType.LOSS || e.type === ActionType.UNFORCED_ERROR;

function scopedEvents(matchData: MatchData, opponent: boolean, period?: Period): GameEvent[] {
  return matchData.events.filter(
    (e) => !!e.metadata?.isOpponent === opponent && (period === undefined || e.period === period),
  );
}

/**
 * Vista rápida por las 9 zonas LÓGICAS que ya guarda la app. No transforma
 * coordenadas ni depende de isFieldFlipped: consume originGrid tal como se
 * registró. Esto evita que un cambio visual de lado altere el análisis.
 */
export function summarizeQuickZones(
  matchData: MatchData,
  opponent = false,
  period?: Period,
): QuickZoneStats[] {
  const events = scopedEvents(matchData, opponent, period).filter((e) => !!e.originGrid);
  return QUICK_ZONE_IDS.map((zone) => {
    const zoneEvents = events.filter((e) => e.originGrid?.toUpperCase() === zone);
    return {
      zone,
      total: zoneEvents.length,
      shots: zoneEvents.filter(isShotAttempt).length,
      losses: zoneEvents.filter(isLoss).length,
      recoveries: zoneEvents.filter(isRecovery).length,
      goals: zoneEvents.filter(isGoal).length,
    };
  });
}

export function zoneMetricValue(zone: QuickZoneStats, metric: ZoneMetric): number {
  switch (metric) {
    case "shots": return zone.shots;
    case "recoveries": return zone.recoveries;
    case "losses": return zone.losses;
    default: return zone.total;
  }
}

/**
 * Resumen estable para la pantalla DATOS/ZONAS. Usa únicamente eventos reales
 * y separa origen de pista (A1-C3) y destino de portería (G1-G9 / OUT).
 */
export function buildZoneDashboard(
  matchData: MatchData,
  opponent = false,
  period?: Period,
): ZoneDashboard {
  const events = scopedEvents(matchData, opponent, period);
  const origin = summarizeQuickZones(matchData, opponent, period);
  const attempts = events.filter(isShotAttempt);

  const goal = GOAL_ZONE_IDS.map((zone) => {
    const zoneAttempts = attempts.filter((e) => e.destinationGrid?.toUpperCase() === zone);
    return {
      zone,
      attempts: zoneAttempts.length,
      goals: zoneAttempts.filter(isGoal).length,
    };
  });

  const out = attempts.filter((e) => e.destinationGrid?.toUpperCase() === "OUT").length;
  const onTarget = attempts.filter((e) => {
    const destination = e.destinationGrid?.toUpperCase();
    return destination ? destination !== "OUT" : isGoal(e);
  }).length;
  const unknownTarget = Math.max(0, attempts.length - onTarget - out);
  const goals = attempts.filter(isGoal).length;
  const recoveries = events.filter(isRecovery).length;
  const losses = events.filter(isLoss).length;
  const zonedActions = origin.reduce((acc, z) => acc + z.total, 0);

  const mostActiveZone = origin
    .filter((z) => z.total > 0)
    .sort((a, b) => b.total - a.total || a.zone.localeCompare(b.zone))[0] || null;
  const mostDangerousZone = origin
    .filter((z) => z.shots > 0)
    .sort((a, b) => b.goals - a.goals || b.shots - a.shots || a.zone.localeCompare(b.zone))[0] || null;

  return {
    origin,
    goal,
    out,
    totals: {
      zonedActions,
      attempts: attempts.length,
      onTarget,
      unknownTarget,
      goals,
      recoveries,
      losses,
      conversionPct: attempts.length ? Math.round((goals / attempts.length) * 100) : null,
      accuracyPct: onTarget + out ? Math.round((onTarget / (onTarget + out)) * 100) : null,
    },
    mostActiveZone,
    mostDangerousZone,
  };
}
