import { ActionType, MatchData } from "../types/futsal";

export type QuickZoneStats = {
  zone: string;
  total: number;
  shots: number;
  losses: number;
  recoveries: number;
  goals: number;
};

export const QUICK_ZONE_IDS = ["A1", "A2", "A3", "B1", "B2", "B3", "C1", "C2", "C3"] as const;

/**
 * Vista rápida por las 9 zonas REALES que ya guarda la app. No transforma
 * coordenadas ni depende de isFieldFlipped: consume originGrid lógico.
 */
export function summarizeQuickZones(matchData: MatchData, opponent = false): QuickZoneStats[] {
  const events = matchData.events.filter((e) => !!e.metadata?.isOpponent === opponent && !!e.originGrid);
  return QUICK_ZONE_IDS.map((zone) => {
    const zoneEvents = events.filter((e) => e.originGrid?.toUpperCase() === zone);
    return {
      zone,
      total: zoneEvents.length,
      shots: zoneEvents.filter((e) => e.type === ActionType.SHOT || e.type === ActionType.GOAL).length,
      losses: zoneEvents.filter((e) => e.type === ActionType.LOSS || e.type === ActionType.UNFORCED_ERROR).length,
      recoveries: zoneEvents.filter((e) => e.type === ActionType.STEAL || e.type === ActionType.INTERCEPTION).length,
      goals: zoneEvents.filter((e) => e.type === ActionType.GOAL).length,
    };
  });
}
