/**
 * src/services/matchReportService.ts
 *
 * Generador de informe DETERMINISTA a partir de MatchData. No depende de
 * IA/red: puede generarse instantáneamente durante el partido o al
 * finalizar, incluso sin conexión. Función pura, fácil de testear.
 *
 * REGLA: no se inventa ningún dato que el modelo no contenga. Todo lo
 * que aparece aquí se deriva directamente de matchData (players, events,
 * stats). Cuando algo no puede calcularse con los datos disponibles,
 * se omite o se deja en 0/null explícitamente.
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
  rotSeconds: number | null; // solo si está en pista ahora mismo
  rotLabel: string | null;
  rotationsCount: number; // nº de entradas registradas como sustitución
  goals: number;
  shots: number;
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
    shots: number;
    shotsOffTarget: number;
    steals: number;
    interceptions: number;
    losses: number;
    errors: number;
    fouls: number;
    yellowCards: number;
    redCards: number;
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

// matchClock y GameEvent.timestamp se guardan en MILISEGUNDOS en MatchTracker.
// Mantener este formateador separado evita mostrar 1000x más tiempo en el
// informe determinista mientras TOT/ROT continúan expresados en segundos.
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

function countRotations(events: GameEvent[], playerId: string): number {
  return events.filter(
    (e) => e.type === ActionType.SUBSTITUTION && e.playerIds.includes(playerId)
  ).length;
}

/**
 * Genera el informe. Puede llamarse en cualquier momento del partido
 * ("Informe actual") o tras finalizar ("Informe final") — el propio
 * matchData.period/isFinal describen en qué punto se generó.
 */
export function generateMatchReport(matchData: MatchData): MatchReport {
  const propios = matchData.players.filter((p) => !p.isOpponent);
  const eventosPropios = matchData.events.filter((e) => !e.metadata?.isOpponent);

  // "Jugadores utilizados": han jugado algo de tiempo o participan en algún evento.
  const usados = propios.filter(
    (p) =>
      p.individualTimeSeconds > 0 ||
      matchData.events.some((e) => e.playerIds.includes(p.id))
  );

  const playersUsed: MatchReportPlayerLine[] = usados
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
      steals: p.stats.steals,
      interceptions: p.stats.interceptions,
      losses: p.stats.losses,
      errors: p.stats.errors,
      fouls: p.stats.fouls,
      yellowCards: p.stats.yellowCards,
      redCards: p.stats.redCards,
    }));

  // ROT medio/máximo: sobre los jugadores EN PISTA en el momento de generar
  // el informe (ROT es, por definición, el tiempo desde la última entrada;
  // no existe un histórico de todas las rotaciones pasadas en el modelo).
  const enPistaAhora = propios.filter((p) => p.isOnPitch);
  const rotsActuales = enPistaAhora.map((p) => p.rotationTimeSeconds ?? 0);
  const avgRotSeconds =
    rotsActuales.length > 0
      ? rotsActuales.reduce((a, b) => a + b, 0) / rotsActuales.length
      : null;
  const maxRotSeconds = rotsActuales.length > 0 ? Math.max(...rotsActuales) : null;
  const totalRotationsCount = propios.reduce(
    (acc, p) => acc + countRotations(matchData.events, p.id),
    0
  );

  const sumStat = (key: keyof Player["stats"]) =>
    propios.reduce((acc, p) => acc + (p.stats[key] as number), 0);

  const teamTotals = {
    goals: sumStat("goals"),
    shots: sumStat("shots"),
    shotsOffTarget: sumStat("shotsOffTarget"),
    steals: sumStat("steals"),
    interceptions: sumStat("interceptions"),
    losses: sumStat("losses"),
    errors: sumStat("errors"),
    fouls: matchData.fouls.team,
    yellowCards: sumStat("yellowCards"),
    redCards: sumStat("redCards"),
  };

  const portero = propios.find((p) => p.role === Role.GOALKEEPER && p.isOnPitch) || null;
  const goalkeeper = portero
    ? {
        name: portero.name,
        number: portero.number,
        saves: portero.stats.saves,
        conceded: portero.stats.conceded,
      }
    : null;

  // Distribución por zonas: a partir de originGrid de los eventos propios
  // que lo tengan (no se inventa zona para eventos sin ella).
  const zonaCount = new Map<string, number>();
  eventosPropios.forEach((e) => {
    if (e.originGrid) zonaCount.set(e.originGrid, (zonaCount.get(e.originGrid) || 0) + 1);
  });
  const zoneDistribution = Array.from(zonaCount.entries())
    .map(([zone, count]) => ({ zone, count }))
    .sort((a, b) => b.count - a.count);

  // Estadísticas por periodo: solo periodos con al menos un evento propio.
  const periodosPresentes = Array.from(new Set(eventosPropios.map((e) => e.period)));
  const periodStats: MatchReportPeriodStats[] = periodosPresentes
    .sort((a, b) => a - b)
    .map((period) => {
      const evs = eventosPropios.filter((e) => e.period === period);
      return {
        period,
        label: PERIOD_LABEL[period] ?? `Periodo ${period}`,
        goals: evs.filter((e) => e.type === ActionType.GOAL).length,
        shots: evs.filter((e) => e.type === ActionType.SHOT).length,
        steals: evs.filter((e) => e.type === ActionType.STEAL).length,
        losses: evs.filter((e) => e.type === ActionType.LOSS).length,
        fouls: evs.filter((e) => e.type === ActionType.FOUL).length,
      };
    });

  // Acciones relevantes: goles y tarjetas rojas, propias y rivales.
  const relevantTypes = new Set<string>([
    ActionType.GOAL,
    ActionType.RED_CARD,
    GoalieAction.GOAL_CONCEDED,
  ]);
  const relevantEvents: MatchReportRelevantEvent[] = matchData.events
    .filter((e) => relevantTypes.has(e.type))
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((e) => {
      const isOpponent = !!e.metadata?.isOpponent;
      const player = !isOpponent
        ? matchData.players.find((p) => e.playerIds.includes(p.id))
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
    // Mismo cálculo de marcador que usa MatchTracker en el resto de la app:
    // GOAL o GOAL_CONCEDED, distinguidos por metadata.isOpponent.
    score: {
      team: matchData.events.filter(
        (e) => (e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED) && !e.metadata?.isOpponent
      ).length,
      opponent: matchData.events.filter(
        (e) => (e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED) && e.metadata?.isOpponent
      ).length,
    },
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
    goalkeeper,
    zoneDistribution,
    periodStats,
    relevantEvents,
  };
}

/**
 * Formatea el informe determinista como Markdown legible, para mostrarlo
 * instantáneamente (sin red) en el mismo visor que usa el análisis IA.
 */
export function formatMatchReportAsMarkdown(r: MatchReport): string {
  const lines: string[] = [];
  lines.push(`# ${r.isFinal ? "Informe Final" : "Informe Actual"} — ${r.teamName} vs ${r.opponentName}`);
  lines.push("");
  lines.push(`**Marcador:** ${r.score.team} - ${r.score.opponent}  `);
  lines.push(`**Periodo:** ${r.periodLabel} · ${r.matchClockLabel}  `);
  lines.push(`**Faltas:** ${r.fouls.team} (propias) / ${r.fouls.opponent} (rival)`);
  lines.push("");

  if (r.goalkeeper) {
    lines.push(
      `**Portero:** ${r.goalkeeper.number} ${r.goalkeeper.name} — ${r.goalkeeper.saves} paradas, ${r.goalkeeper.conceded} goles encajados`
    );
    lines.push("");
  }

  lines.push("## Rotaciones");
  lines.push(
    `Rotaciones totales registradas: **${r.rotationSummary.totalRotationsCount}**  `
  );
  if (r.rotationSummary.avgRotLabel) {
    lines.push(
      `ROT medio (jugadores en pista ahora): **${r.rotationSummary.avgRotLabel}** · ROT máximo: **${r.rotationSummary.maxRotLabel}**`
    );
  } else {
    lines.push("Sin jugadores en pista en este momento para calcular ROT medio/máximo.");
  }
  lines.push("");

  lines.push("## Jugadores utilizados");
  lines.push("");
  lines.push("| # | Jugador | Estado | TOT | ROT | Rotac. | G | T | Rec | Pér | F |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
  r.playersUsed.forEach((p) => {
    lines.push(
      `| ${p.number} | ${p.name} | ${p.isOnPitch ? "En pista" : "Banquillo"} | ${p.totLabel} | ${
        p.rotLabel ?? "—"
      } | ${p.rotationsCount} | ${p.goals} | ${p.shots} | ${p.steals + p.interceptions} | ${p.losses} | ${p.fouls} |`
    );
  });
  lines.push("");

  lines.push("## Totales del equipo");
  lines.push(
    `Goles ${r.teamTotals.goals} · Tiros ${r.teamTotals.shots} (${r.teamTotals.shotsOffTarget} fuera) · ` +
      `Recuperaciones ${r.teamTotals.steals + r.teamTotals.interceptions} · Pérdidas ${r.teamTotals.losses} · ` +
      `Errores ${r.teamTotals.errors} · Faltas ${r.teamTotals.fouls} · Amarillas ${r.teamTotals.yellowCards} · Rojas ${r.teamTotals.redCards}`
  );
  lines.push("");

  if (r.periodStats.length) {
    lines.push("## Estadísticas por periodo");
    r.periodStats.forEach((ps) => {
      lines.push(
        `**${ps.label}:** ${ps.goals} goles · ${ps.shots} tiros · ${ps.steals} recuperaciones · ${ps.losses} pérdidas · ${ps.fouls} faltas`
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
        `- **${e.timeLabel}** (${e.isOpponent ? r.opponentName : r.teamName}) — ${e.type}${
          e.playerName ? ` · ${e.playerName}` : ""
        }`
      );
    });
    lines.push("");
  }

  lines.push("---");
  lines.push(
    `*Informe generado automáticamente a partir de los datos registrados — ${new Date(r.generatedAt).toLocaleString(
      "es-ES"
    )}. No requiere conexión ni IA.*`
  );

  return lines.join("\n");
}
