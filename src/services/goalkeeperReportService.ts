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
  /** Nº de eventos GoalieAction.SAVE_PARRY — se presenta como "Despeje/Rechace". */
  saveParry: number;
  saveGeneric: number;
  totalSaves: number;
  conceded: number;
  shotsFaced: number;
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

const GOALIE_ACTION_LABEL: Record<string, string> = {
  [GoalieAction.SAVE]: "Parada",
  [GoalieAction.SAVE_CATCH]: "Blocaje",
  [GoalieAction.SAVE_PARRY]: "Despeje",
  [GoalieAction.GOAL_CONCEDED]: "Gol encajado",
};

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
      const ownEvents = matchData.events.filter((e) => e.playerIds.includes(p.id));

      const saveParry = ownEvents.filter((e) => e.type === GoalieAction.SAVE_PARRY).length;
      const saveCatch = ownEvents.filter((e) => e.type === GoalieAction.SAVE_CATCH).length;
      const saveGeneric = ownEvents.filter((e) => e.type === GoalieAction.SAVE).length;
      const totalSaves = saveParry + saveCatch + saveGeneric;
      const conceded = ownEvents.filter((e) => e.type === GoalieAction.GOAL_CONCEDED).length;
      const shotsFaced = totalSaves + conceded;
      const effectivenessPct = shotsFaced > 0 ? Math.round((totalSaves / shotsFaced) * 100) : null;

      const timeline: GoalkeeperTimelineEntry[] = ownEvents
        .filter(
          (e) =>
            e.type === GoalieAction.SAVE ||
            e.type === GoalieAction.SAVE_PARRY ||
            e.type === GoalieAction.SAVE_CATCH ||
            e.type === GoalieAction.GOAL_CONCEDED,
        )
        .slice()
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((e) => ({
          timeLabel: fmtMilliseconds(e.timestamp),
          period: e.period,
          type: GOALIE_ACTION_LABEL[e.type] || String(e.type),
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
        totalSaves,
        conceded,
        shotsFaced,
        effectivenessPct,
        events: ownEvents,
        timeline,
      };
    });
}
