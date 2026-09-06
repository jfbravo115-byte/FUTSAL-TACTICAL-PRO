/**
 * Informe determinista a partir de MatchData. No depende de IA ni red.
 * Todo lo mostrado se deriva de datos realmente registrados.
 */
import {
  MatchData,
  Player,
  GameEvent,
  ActionType,
  GoalieAction,
  Period,
  Role,
} from "../types/futsal";

export type MatchReportPlayerLine = {
  id: string;
  number: number;
  name: string;
  role: Role;
  isOnPitch: boolean;
  totSeconds: number;
  totLabel: string;
  rotSeconds: number | null;
  rotLabel: string | null;
  rotationsCount: number;
  goals: number;
  shots: number;
  shotsOffTarget: number;
  attempts: number;
  steals: number;
  interceptions: number;
  losses: number;
  errors: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
};

export type MatchReportPeriodStats = {
  period: Period;
  label: string;
  goals: number;
  shots: number;
  steals: number;
  losses: number;
  fouls: number;
};

export type MatchReportRelevantEvent = {
  timeLabel: string;
  period: Period;
  type: string;
  playerName?: string;
  isOpponent: boolean;
};

export type MatchReport = {
  generatedAt: string;
  isFinal: boolean;
  teamName: string;
  opponentName: string;
  score: { team: number; opponent: number };
  period: Period;
  periodLabel: string;
  matchClockLabel: string;
  fouls: { team: number; opponent: number };
  playersUsed: MatchReportPlayerLine[];
  rotationSummary: {
    avgRotSeconds: number | null;
    avgRotLabel: string | null;
    maxRotSeconds: number | null;
    maxRotLabel: string | null;
    totalRotationsCount: number;
  };
  teamTotals: {
    goals: number;
    /** Intentos totales: gol + tiro a portería + tiro fuera. */
    shots: number;
    shotsOnTarget: number;
    shotsOffTarget: number;
    shotsUnknownTarget: number;
    shotAccuracyPct: number | null;
    goalConversionPct: number | null;
    steals: number;
    interceptions: number;
    recoveries: number;
    losses: number;
    errors: number;
    lossesAndErrors: number;
    recoveryLossBalance: number;
    fouls: number;
    yellowCards: number;
    redCards: number;
  };
  highlights: {
    topTot: Pick<MatchReportPlayerLine, "id" | "number" | "name" | "totLabel" | "totSeconds"> | null;
    topScorer: Pick<MatchReportPlayerLine, "id" | "number" | "name" | "goals"> | null;
    topRecoverer: (Pick<MatchReportPlayerLine, "id" | "number" | "name"> & { recoveries: number }) | null;
  };
  goalkeeper: {
    name: string;
    number: number;
    saves: number;
    conceded: number;
  } | null;
  zoneDistribution: { zone: string; count: number }[];
  periodStats: MatchReportPeriodStats[];
  relevantEvents: MatchReportRelevantEvent[];
};

const fmtSeconds = (totalSeconds: number): string => {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
};

// MatchTracker guarda matchClock y GameEvent.timestamp en milisegundos.
const fmtMilliseconds = (milliseconds: number): string =>
  fmtSeconds(Math.max(0, milliseconds) / 1000);

const PERIOD_LABEL: Record<Period, string> = {
  [Period.FIRST]: "1ª Parte",
  [Period.SECOND]: "2ª Parte",
  [Period.OVERTIME_1]: "Prórroga 1",
  [Period.OVERTIME_2]: "Prórroga 2",
  [Period.FINISHED]: "Finalizado",
};

const ACTION_LABEL: Record<string, string> = {
  [ActionType.GOAL]: "Gol",
  [ActionType.RED_CARD]: "Tarjeta roja",
  [ActionType.YELLOW_CARD]: "Tarjeta amarilla",
  [GoalieAction.GOAL_CONCEDED]: "Gol encajado",
};

const isGoalEvent = (e: GameEvent) =>
  e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED;

const isShotAttempt = (e: GameEvent) =>
  e.type === ActionType.SHOT || isGoalEvent(e);

function countRotations(events: GameEvent[], playerId: string): number {
  return events.filter(
    (e) => e.type === ActionType.SUBSTITUTION && e.playerIds.includes(playerId),
  ).length;
}

function pct(part: number, total: number): number | null {
  return total > 0 ? Math.round((part / total) * 100) : null;
}

export function generateMatchReport(matchData: MatchData): MatchReport {
  const propios = matchData.players.filter(
    (p) => !p.isOpponent && p.role !== Role.COACH && p.role !== Role.DELEGATE,
  );
  const eventosPropios = matchData.events.filter((e) => !e.metadata?.isOpponent);

  const score = {
    team: matchData.events.filter((e) => isGoalEvent(e) && !e.metadata?.isOpponent).length,
    opponent: matchData.events.filter((e) => isGoalEvent(e) && !!e.metadata?.isOpponent).length,
  };

  const usados = propios.filter(
    (p) =>
      p.individualTimeSeconds > 0 ||
      matchData.events.some((e) => e.playerIds.includes(p.id)),
  );

  const playersUsed: MatchReportPlayerLine[] = usados
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((p) => ({
      id: p.id,
      number: p.number,
      name: p.name,
      role: p.role,
      isOnPitch: p.isOnPitch,
      totSeconds: p.individualTimeSeconds,
      totLabel: fmtSeconds(p.individualTimeSeconds),
      rotSeconds: p.isOnPitch ? p.rotationTimeSeconds ?? 0 : null,
      rotLabel: p.isOnPitch ? fmtSeconds(p.rotationTimeSeconds ?? 0) : null,
      rotationsCount: countRotations(matchData.events, p.id),
      goals: p.stats.goals,
      shots: p.stats.shots,
      shotsOffTarget: p.stats.shotsOffTarget,
      attempts: p.stats.goals + p.stats.shots + p.stats.shotsOffTarget,
      steals: p.stats.steals,
      interceptions: p.stats.interceptions,
      losses: p.stats.losses,
      errors: p.stats.errors,
      fouls: p.stats.fouls,
      yellowCards: p.stats.yellowCards,
      redCards: p.stats.redCards,
    }));

  const enPistaAhora = propios.filter((p) => p.isOnPitch);
  const rotsActuales = enPistaAhora.map((p) => p.rotationTimeSeconds ?? 0);
  const avgRotSeconds = rotsActuales.length
    ? rotsActuales.reduce((a, b) => a + b, 0) / rotsActuales.length
    : null;
  const maxRotSeconds = rotsActuales.length ? Math.max(...rotsActuales) : null;
  const totalRotationsCount = propios.reduce(
    (acc, p) => acc + countRotations(matchData.events, p.id),
    0,
  );

  const sumStat = (key: keyof Player["stats"]) =>
    propios.reduce((acc, p) => acc + Number(p.stats[key] ?? 0), 0);

  const shotEvents = eventosPropios.filter(isShotAttempt);
  const shotsOffTarget = shotEvents.filter(
    (e) => e.type === ActionType.SHOT && e.destinationGrid?.toUpperCase() === "OUT",
  ).length;
  const shotsOnTarget = shotEvents.filter((e) => {
    const destination = e.destinationGrid?.toUpperCase();
    return destination ? destination !== "OUT" : isGoalEvent(e);
  }).length;
  const shotsUnknownTarget = Math.max(0, shotEvents.length - shotsOnTarget - shotsOffTarget);
  const recoveries = sumStat("steals") + sumStat("interceptions");
  const lossesAndErrors = sumStat("losses") + sumStat("errors");

  const teamTotals = {
    goals: score.team,
    shots: shotEvents.length,
    shotsOnTarget,
    shotsOffTarget,
    shotsUnknownTarget,
    shotAccuracyPct: pct(shotsOnTarget, shotsOnTarget + shotsOffTarget),
    goalConversionPct: pct(score.team, shotEvents.length),
    steals: sumStat("steals"),
    interceptions: sumStat("interceptions"),
    recoveries,
    losses: sumStat("losses"),
    errors: sumStat("errors"),
    lossesAndErrors,
    recoveryLossBalance: recoveries - lossesAndErrors,
    fouls: matchData.fouls.team,
    yellowCards: sumStat("yellowCards"),
    redCards: sumStat("redCards"),
  };

  const topTot = playersUsed.length
    ? playersUsed.slice().sort((a, b) => b.totSeconds - a.totSeconds || a.number - b.number)[0]
    : null;
  const scorerCandidates = playersUsed.filter((p) => p.goals > 0);
  const topScorer = scorerCandidates.length
    ? scorerCandidates.slice().sort((a, b) => b.goals - a.goals || a.number - b.number)[0]
    : null;
  const recovererCandidates = playersUsed
    .map((p) => ({ ...p, recoveries: p.steals + p.interceptions }))
    .filter((p) => p.recoveries > 0);
  const topRecoverer = recovererCandidates.length
    ? recovererCandidates.sort((a, b) => b.recoveries - a.recoveries || a.number - b.number)[0]
    : null;

  const portero = propios.find((p) => p.role === Role.GOALKEEPER && p.isOnPitch) || null;
  const goalkeeper = portero
    ? {
        name: portero.name,
        number: portero.number,
        saves: portero.stats.saves,
        conceded: portero.stats.conceded,
      }
    : null;

  const zonaCount = new Map<string, number>();
  eventosPropios.forEach((e) => {
    if (e.originGrid) zonaCount.set(e.originGrid, (zonaCount.get(e.originGrid) || 0) + 1);
  });
  const zoneDistribution = Array.from(zonaCount.entries())
    .map(([zone, count]) => ({ zone, count }))
    .sort((a, b) => b.count - a.count || a.zone.localeCompare(b.zone));

  const periodosPresentes = Array.from(new Set(eventosPropios.map((e) => e.period)));
  const periodStats: MatchReportPeriodStats[] = periodosPresentes
    .sort((a, b) => a - b)
    .map((period) => {
      const evs = eventosPropios.filter((e) => e.period === period);
      return {
        period,
        label: PERIOD_LABEL[period] ?? `Periodo ${period}`,
        goals: evs.filter(isGoalEvent).length,
        shots: evs.filter(isShotAttempt).length,
        steals: evs.filter((e) => e.type === ActionType.STEAL || e.type === ActionType.INTERCEPTION).length,
        losses: evs.filter((e) => e.type === ActionType.LOSS || e.type === ActionType.UNFORCED_ERROR).length,
        fouls: evs.filter((e) => e.type === ActionType.FOUL).length,
      };
    });

  const relevantTypes = new Set<string>([
    ActionType.GOAL,
    ActionType.RED_CARD,
    GoalieAction.GOAL_CONCEDED,
  ]);
  const relevantEvents: MatchReportRelevantEvent[] = matchData.events
    .filter((e) => relevantTypes.has(e.type))
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((e) => {
      const isOpponent = !!e.metadata?.isOpponent;
      const player = !isOpponent
        ? matchData.players.find((p) => e.playerIds.includes(p.id) && !p.isOpponent)
        : undefined;
      return {
        timeLabel: fmtMilliseconds(e.timestamp),
        period: e.period,
        type: ACTION_LABEL[e.type] || String(e.type),
        playerName: player?.name,
        isOpponent,
      };
    });

  return {
    generatedAt: new Date().toISOString(),
    isFinal: matchData.period === Period.FINISHED,
    teamName: matchData.teamName,
    opponentName: matchData.opponentName,
    score,
    period: matchData.period,
    periodLabel: PERIOD_LABEL[matchData.period] ?? String(matchData.period),
    matchClockLabel: fmtMilliseconds(matchData.matchClock),
    fouls: matchData.fouls,
    playersUsed,
    rotationSummary: {
      avgRotSeconds,
      avgRotLabel: avgRotSeconds !== null ? fmtSeconds(avgRotSeconds) : null,
      maxRotSeconds,
      maxRotLabel: maxRotSeconds !== null ? fmtSeconds(maxRotSeconds) : null,
      totalRotationsCount,
    },
    teamTotals,
    highlights: {
      topTot: topTot ? { id: topTot.id, number: topTot.number, name: topTot.name, totLabel: topTot.totLabel, totSeconds: topTot.totSeconds } : null,
      topScorer: topScorer ? { id: topScorer.id, number: topScorer.number, name: topScorer.name, goals: topScorer.goals } : null,
      topRecoverer: topRecoverer ? { id: topRecoverer.id, number: topRecoverer.number, name: topRecoverer.name, recoveries: topRecoverer.recoveries } : null,
    },
    goalkeeper,
    zoneDistribution,
    periodStats,
    relevantEvents,
  };
}

export function formatMatchReportAsMarkdown(r: MatchReport): string {
  const lines: string[] = [];
  lines.push(`# ${r.isFinal ? "Informe Final" : "Informe Actual"} — ${r.teamName} vs ${r.opponentName}`);
  lines.push("");
  lines.push(`**Marcador:** ${r.score.team} - ${r.score.opponent}  `);
  lines.push(`**Periodo:** ${r.periodLabel} · ${r.matchClockLabel}  `);
  lines.push(`**Faltas:** ${r.fouls.team} (propias) / ${r.fouls.opponent} (rival)`);
  lines.push("");

  lines.push("## Datos clave");
  lines.push(
    `Tiros totales **${r.teamTotals.shots}** · a portería **${r.teamTotals.shotsOnTarget}** · fuera **${r.teamTotals.shotsOffTarget}** · ` +
      `precisión registrada **${r.teamTotals.shotAccuracyPct ?? "—"}%** · conversión **${r.teamTotals.goalConversionPct ?? "—"}%**`,
  );
  lines.push(
    `Recuperaciones **${r.teamTotals.recoveries}** · pérdidas + errores **${r.teamTotals.lossesAndErrors}** · balance **${r.teamTotals.recoveryLossBalance >= 0 ? "+" : ""}${r.teamTotals.recoveryLossBalance}**`,
  );
  lines.push("");

  if (r.goalkeeper) {
    lines.push(
      `**Portero en pista:** ${r.goalkeeper.number} ${r.goalkeeper.name} — ${r.goalkeeper.saves} paradas, ${r.goalkeeper.conceded} goles encajados`,
    );
    lines.push("");
  }

  const highlights: string[] = [];
  if (r.highlights.topTot) highlights.push(`Mayor TOT: **#${r.highlights.topTot.number} ${r.highlights.topTot.name} (${r.highlights.topTot.totLabel})**`);
  if (r.highlights.topScorer) highlights.push(`Máximo goleador: **#${r.highlights.topScorer.number} ${r.highlights.topScorer.name} (${r.highlights.topScorer.goals})**`);
  if (r.highlights.topRecoverer) highlights.push(`Más recuperaciones: **#${r.highlights.topRecoverer.number} ${r.highlights.topRecoverer.name} (${r.highlights.topRecoverer.recoveries})**`);
  if (highlights.length) {
    lines.push("## Destacados descriptivos");
    highlights.forEach((h) => lines.push(`- ${h}`));
    lines.push("");
  }

  lines.push("## Rotaciones");
  lines.push(`Rotaciones totales registradas: **${r.rotationSummary.totalRotationsCount}**  `);
  if (r.rotationSummary.avgRotLabel) {
    lines.push(
      `ROT medio (jugadores en pista ahora): **${r.rotationSummary.avgRotLabel}** · ROT máximo: **${r.rotationSummary.maxRotLabel}**`,
    );
  } else {
    lines.push("Sin jugadores en pista en este momento para calcular ROT medio/máximo.");
  }
  lines.push("");

  lines.push("## Jugadores utilizados");
  lines.push("");
  lines.push("| # | Jugador | Estado | TOT | ROT | Rotac. | G | Tiros | Rec | Pér+Err | F |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
  r.playersUsed.forEach((p) => {
    lines.push(
      `| ${p.number} | ${p.name} | ${p.isOnPitch ? "En pista" : "Banquillo"} | ${p.totLabel} | ${p.rotLabel ?? "—"} | ${p.rotationsCount} | ${p.goals} | ${p.attempts} | ${p.steals + p.interceptions} | ${p.losses + p.errors} | ${p.fouls} |`,
    );
  });
  lines.push("");

  if (r.periodStats.length) {
    lines.push("## Estadísticas por periodo");
    r.periodStats.forEach((ps) => {
      lines.push(
        `**${ps.label}:** ${ps.goals} goles · ${ps.shots} tiros · ${ps.steals} recuperaciones · ${ps.losses} pérdidas/errores · ${ps.fouls} faltas`,
      );
    });
    lines.push("");
  }

  if (r.zoneDistribution.length) {
    lines.push("## Distribución por zonas");
    r.zoneDistribution.forEach((z) => lines.push(`- ${z.zone}: ${z.count}`));
    lines.push("");
  }

  if (r.relevantEvents.length) {
    lines.push("## Acciones relevantes");
    r.relevantEvents.forEach((e) => {
      lines.push(
        `- **${e.timeLabel}** (${e.isOpponent ? r.opponentName : r.teamName}) — ${e.type}${e.playerName ? ` · ${e.playerName}` : ""}`,
      );
    });
    lines.push("");
  }

  lines.push("---");
  lines.push(
    `*Informe generado automáticamente a partir de los datos registrados — ${new Date(r.generatedAt).toLocaleString("es-ES")}. No requiere conexión ni IA.*`,
  );

  return lines.join("\n");
}
