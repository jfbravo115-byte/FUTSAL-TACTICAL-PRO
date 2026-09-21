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
import { formatAnyZoneLabel } from "../utils/legacyZoneMap";
import {
  isShotAttempt,
  playerShotTallies,
  summarizeShots,
  tallyOf,
} from "../utils/shotModel";
import { chronological } from "../utils/eventOrder";
import {
  FoulPeriodLine,
  FoulSummary,
  foulsInPeriod,
  summarizeFouls,
} from "../utils/foulModel";
import {
  MATCH_CONTEXT_LABEL,
  MatchContext,
  MatchContextGroup,
  buildMatchContexts,
  groupMatchContexts,
} from "../utils/matchContexts";
import { GoalSequenceEntry, buildGoalSequence, formatMatchTime } from "../utils/goalSequence";
import { UNKNOWN_DURATION_LABEL } from "../utils/matchContexts";
import {
  SetPieceOutcomeSummary,
  SetPieceRestartSummary,
  countShotsFromSetPiece,
  describeSetPieceOutcomes,
  summarizeCornerOutcomes,
  summarizeSetPieceRestarts,
} from "../utils/setPieceModel";

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
  /**
   * Finalización del jugador, derivada de SUS eventos y no de `PlayerStats`.
   *
   * `PlayerStats` solo tiene dos cubos —`shots` y `shotsOffTarget`— y un tiro
   * bloqueado no cabe en ninguno, así que acababa contándose como tiro a
   * portería. Estas cuatro cifras salen del contrato único de
   * `src/utils/shotModel.ts`.
   */
  attempts: number;
  /** Entre los tres palos. INCLUYE los goles del jugador. */
  shotsOnTarget: number;
  shotsOffTarget: number;
  /** Bloqueado o desviado antes de llegar. Ni dentro ni fuera. */
  shotsBlocked: number;
  /** Intentos cuyo desenlace no consta. No se reparten ni se suponen. */
  shotsUnrecorded: number;
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
  /** Faltas COMETIDAS por nuestro equipo en ese periodo. */
  fouls: number;
  /** Faltas cometidas por el rival en ese periodo. */
  opponentFouls: number;
};

export type MatchReportRelevantEvent = {
  timeLabel: string;
  period: Period;
  type: string;
  playerName?: string;
  isOpponent: boolean;
};

/**
 * Córners del equipo propio y del rival, desglosados por ejecución. El total
 * no cambia de significado y lo que no se registró se declara como tal en vez
 * de repartirse.
 *
 * Las faltas NO se desglosan así: el evento FOUL es la infracción cometida.
 * Los tiros procedentes de falta se leen del propio tiro.
 */
export type MatchReportSetPieces = {
  corners: { team: SetPieceOutcomeSummary; opponent: SetPieceOutcomeSummary };
  /**
   * Faltas a favor puestas en juego. Se cuentan aparte a propósito: no son
   * faltas cometidas —esas son del rival— ni tiros.
   */
  freeKickPlays: { team: SetPieceRestartSummary; opponent: SetPieceRestartSummary };
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
  /**
   * Faltas de TODO el partido, derivadas de los eventos FOUL.
   *
   * Antes era `matchData.fouls`, el contador reglamentario, que se reinicia
   * en el descanso: al acabar el partido valía lo de la segunda parte y la
   * portada lo imprimía como si fuera el total del encuentro.
   */
  fouls: { team: number; opponent: number };
  /**
   * Contador reglamentario del PERIODO EN CURSO — el que dispara la sanción
   * de la 6ª falta. Se reinicia en el descanso, y eso es correcto: es su
   * trabajo. Se conserva aquí, con su nombre, para quien necesite ese dato
   * concreto; NUNCA es el total del partido.
   */
  periodFoulCounter: { team: number; opponent: number };
  /**
   * Faltas por parte y por bando, derivadas de los eventos. Una línea por
   * periodo con faltas; una prórroga tiene la suya y no se mezcla con la 2ª.
   */
  foulsByPeriod: FoulPeriodLine[];
  /**
   * ¿Hay eventos FOUL de los que derivar? Sin ellos el desglose no existe y
   * hay que decirlo, no rellenarlo con el contador.
   */
  hasFoulEvents: boolean;
  playersUsed: MatchReportPlayerLine[];
  rotationSummary: {
    avgRotSeconds: number | null;
    avgRotLabel: string | null;
    maxRotSeconds: number | null;
    maxRotLabel: string | null;
    totalRotationsCount: number;
  };
  setPieces: MatchReportSetPieces;
  teamTotals: {
    goals: number;
    /** Intentos totales: a portería + fuera + bloqueados + sin declarar. */
    shots: number;
    shotsOnTarget: number;
    shotsOffTarget: number;
    /** Bloqueados o desviados antes de llegar. No son «fuera». */
    shotsBlocked: number;
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
    /** Faltas COMETIDAS por el equipo. Infracciones, no reanudaciones. */
    fouls: number;
    /** Tiros propios que declaran proceder de una falta a favor. */
    shotsFromFreeKick: number;
    /** Tiros propios que declaran proceder de un córner. */
    shotsFromCorner: number;
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
  zoneDistribution: { zone: string; label: string; count: number }[];
  periodStats: MatchReportPeriodStats[];
  relevantEvents: MatchReportRelevantEvent[];
  /**
   * Goles en orden, con procedencia y tiempos de respuesta ya calculados.
   * Determinista: ver src/utils/goalSequence.ts.
   */
  goalSequence: GoalSequenceEntry[];
  /**
   * Ventanas de superioridad, inferioridad y portero-jugador, declaradas por
   * el operador y con sus agregados. Ver src/utils/matchContexts.ts.
   */
  matchContexts: MatchContext[];
  /** Las mismas ventanas agrupadas por tipo, que es como se imprimen. */
  matchContextGroups: MatchContextGroup[];
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
  [ActionType.CORNER]: "Córner",
  [GoalieAction.GOAL_CONCEDED]: "Gol encajado",
  [GoalieAction.SAVE]: "Parada",
  [GoalieAction.SAVE_CATCH]: "Blocaje",
  [GoalieAction.SAVE_DEFLECT]: "Despeje",
  [GoalieAction.EXIT]: "Salida",
  // Histórico: se registró bajo un botón que decía "PARADA", así que su
  // subtipo real es desconocido y no se infiere.
  [GoalieAction.SAVE_PARRY]: "Parada (subtipo no registrado)",
};

const isGoalEvent = (e: GameEvent) =>
  e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED;


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

  // Faltas del partido: una sola pasada sobre los eventos, compartida por el
  // total, el desglose por parte y las líneas de `periodStats`. Ver
  // utils/foulModel — ninguna de las tres las vuelve a contar por su cuenta.
  const foulSummary: FoulSummary = summarizeFouls(matchData.events);

  const score = {
    team: matchData.events.filter((e) => isGoalEvent(e) && !e.metadata?.isOpponent).length,
    opponent: matchData.events.filter((e) => isGoalEvent(e) && !!e.metadata?.isOpponent).length,
  };

  const usados = propios.filter(
    (p) =>
      p.individualTimeSeconds > 0 ||
      matchData.events.some((e) => e.playerIds.includes(p.id)),
  );

  // Una sola pasada sobre los eventos para todas las filas de la tabla.
  const tallies = playerShotTallies(matchData.events || [], usados);

  const playersUsed: MatchReportPlayerLine[] = usados
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((p) => {
      const tiros = tallyOf(tallies, p.id);
      return {
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
      attempts: tiros.shots,
      shotsOnTarget: tiros.onTarget,
      shotsOffTarget: tiros.offTarget,
      shotsBlocked: tiros.blocked,
      shotsUnrecorded: tiros.unrecorded,
      steals: p.stats.steals,
      interceptions: p.stats.interceptions,
      losses: p.stats.losses,
      errors: p.stats.errors,
      fouls: p.stats.fouls,
      yellowCards: p.stats.yellowCards,
      redCards: p.stats.redCards,
      };
    });

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

  // Mismo contrato que las filas de jugador: si el equipo y la suma de los
  // suyos discreparan, sería porque dos sitios clasifican distinto.
  const teamTally = summarizeShots(eventosPropios);
  const shotEvents = eventosPropios.filter(isShotAttempt);
  const shotsOffTarget = teamTally.offTarget;
  const shotsOnTarget = teamTally.onTarget;
  const shotsBlocked = teamTally.blocked;
  const shotsUnknownTarget = teamTally.unrecorded;
  const recoveries = sumStat("steals") + sumStat("interceptions");
  const lossesAndErrors = sumStat("losses") + sumStat("errors");

  const teamTotals = {
    goals: score.team,
    shots: shotEvents.length,
    shotsOnTarget,
    shotsOffTarget,
    shotsBlocked,
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
    // Faltas COMETIDAS por nuestro equipo en TODO el partido, desde los
    // eventos. No el contador del periodo en curso.
    fouls: foulSummary.total.team,
    // Tiros que el PROPIO tiro declara procedentes de balón parado. No tienen
    // nada que ver con las faltas cometidas: esas son infracciones nuestras.
    shotsFromFreeKick: countShotsFromSetPiece(matchData.events, "free_kick", false),
    shotsFromCorner: countShotsFromSetPiece(matchData.events, "corner", false),
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
    const zone = typeof e.originGrid === "string" ? e.originGrid.toUpperCase() : null;
    if (zone) zonaCount.set(zone, (zonaCount.get(zone) || 0) + 1);
  });
  // Cada zona viaja con su etiqueta de usuario: ni el informe ni el texto que
  // se envía a Tactical Pro deben contener códigos internos.
  const zoneDistribution = Array.from(zonaCount.entries())
    .map(([zone, count]) => ({ zone, label: formatAnyZoneLabel(zone), count }))
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
        fouls: foulsInPeriod(foulSummary, period, false),
        opponentFouls: foulsInPeriod(foulSummary, period, true),
      };
    });

  // Capas deterministas compartidas. El informe, los PDF y TACTICAL PRO leen
  // estas mismas cifras: ninguna se recalcula por su cuenta.
  const goalSequence = buildGoalSequence(matchData);
  const matchContexts = buildMatchContexts(matchData);

  const relevantTypes = new Set<string>([
    ActionType.GOAL,
    ActionType.RED_CARD,
    GoalieAction.GOAL_CONCEDED,
  ]);
  // Orden cronológico real: por parte y después por tiempo. Ordenar solo por
  // `timestamp` colocaba un gol del minuto 1 de la segunda parte ANTES que
  // uno del minuto 19 de la primera, porque el reloj se reinicia en el
  // descanso. Ver src/utils/eventOrder.ts.
  const relevantEvents: MatchReportRelevantEvent[] = chronological(
    matchData.events.filter((e) => relevantTypes.has(e.type)),
  )
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
    fouls: { ...foulSummary.total },
    periodFoulCounter: { ...matchData.fouls },
    foulsByPeriod: foulSummary.byPeriod,
    hasFoulEvents: foulSummary.hasFoulEvents,
    playersUsed,
    rotationSummary: {
      avgRotSeconds,
      avgRotLabel: avgRotSeconds !== null ? fmtSeconds(avgRotSeconds) : null,
      maxRotSeconds,
      maxRotLabel: maxRotSeconds !== null ? fmtSeconds(maxRotSeconds) : null,
      totalRotationsCount,
    },
    setPieces: {
      corners: {
        team: summarizeCornerOutcomes(matchData.events, false),
        opponent: summarizeCornerOutcomes(matchData.events, true),
      },
      freeKickPlays: {
        team: summarizeSetPieceRestarts(matchData.events, false),
        opponent: summarizeSetPieceRestarts(matchData.events, true),
      },
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
    goalSequence,
    matchContexts,
    matchContextGroups: groupMatchContexts(matchContexts),
  };
}

export function formatMatchReportAsMarkdown(r: MatchReport): string {
  const lines: string[] = [];
  lines.push(`# ${r.isFinal ? "Informe Final" : "Informe Actual"} — ${r.teamName} vs ${r.opponentName}`);
  lines.push("");
  lines.push(`**Marcador:** ${r.score.team} - ${r.score.opponent}  `);
  lines.push(`**Periodo:** ${r.periodLabel} · ${r.matchClockLabel}  `);
  // Faltas del PARTIDO, desde los eventos. El contador reglamentario se
  // reinicia en el descanso y no sirve como total.
  if (r.hasFoulEvents) {
    lines.push(`**Faltas:** ${r.fouls.team} (propias) / ${r.fouls.opponent} (rival)`);
    if (r.foulsByPeriod.length > 0) {
      const porParte = r.foulsByPeriod
        .map((l) => `${PERIOD_LABEL[l.period] ?? `Periodo ${l.period}`} ${l.team}–${l.opponent}`)
        .join(" · ");
      lines.push(`Faltas por parte (propias–rival): ${porParte}`);
    }
  } else {
    lines.push(
      `**Faltas:** desglose no disponible — este partido no guarda las faltas como ` +
        `acciones. Último contador reglamentario: ${r.periodFoulCounter.team} (propias) / ` +
        `${r.periodFoulCounter.opponent} (rival).`,
    );
  }
  lines.push("");

  lines.push("## Datos clave");
  lines.push(
    `Tiros totales **${r.teamTotals.shots}** · a portería **${r.teamTotals.shotsOnTarget}** · fuera **${r.teamTotals.shotsOffTarget}** · ` +
      `bloqueados **${r.teamTotals.shotsBlocked}** · ` +
      `precisión registrada **${r.teamTotals.shotAccuracyPct ?? "—"}%** · conversión **${r.teamTotals.goalConversionPct ?? "—"}%**`,
  );
  lines.push(
    `Recuperaciones **${r.teamTotals.recoveries}** · pérdidas + errores **${r.teamTotals.lossesAndErrors}** · balance **${r.teamTotals.recoveryLossBalance >= 0 ? "+" : ""}${r.teamTotals.recoveryLossBalance}**`,
  );
  // Dos lecturas distintas y deliberadamente separadas: los córners por cómo
  // se ejecutaron, y los tiros que el propio tiro declara procedentes de una
  // falta. Las faltas cometidas/recibidas se informan aparte, arriba: son
  // infracciones, no reanudaciones.
  const cornersTxt = describeSetPieceOutcomes(r.setPieces.corners.team);
  if (cornersTxt) {
    lines.push(
      `Córners: **${cornersTxt}**` +
        (r.setPieces.corners.opponent.total > 0
          ? ` · del rival **${describeSetPieceOutcomes(r.setPieces.corners.opponent)}**`
          : ""),
    );
    lines.push(
      "«Tiros directos» son córners ejecutados hacia portería; «tiros procedentes de córner», " +
        "más abajo, son tiros registrados con esa procedencia. Son registros independientes. " +
        "«Sin registrar» significa que no consta cómo se ejecutó el córner; no es una estimación.",
    );
  }
  // Tercera lectura, separada de las otras dos: la falta a favor que se puso
  // en juego en vez de rematarse. Ni es una infracción ni es un tiro.
  if (r.setPieces.freeKickPlays.team.total > 0 || r.setPieces.freeKickPlays.opponent.total > 0) {
    const jf = r.setPieces.freeKickPlays.team;
    lines.push(
      `Jugadas de falta — propias **${jf.total}** (${jf.located} con ubicación · ` +
        `${jf.unlocated} sin ubicación) · del rival **${r.setPieces.freeKickPlays.opponent.total}**. ` +
        `No son faltas cometidas ni tiros.`,
    );
  }
  if (r.teamTotals.shotsFromFreeKick > 0 || r.teamTotals.shotsFromCorner > 0) {
    lines.push(
      `Tiros procedentes de balón parado — desde falta **${r.teamTotals.shotsFromFreeKick}** · ` +
        `desde córner **${r.teamTotals.shotsFromCorner}**. Son tiros propios: no son las faltas ` +
        `cometidas ni los tiros directos de córner, que se cuentan aparte.`,
    );
  }
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
  // Las tres columnas de desenlace van separadas a propósito: un bloqueado no
  // es un tiro a portería ni un tiro fuera, y sumarlo a cualquiera de los dos
  // diría algo que no ocurrió.
  lines.push("| # | Jugador | Estado | TOT | ROT | Rotac. | G | Tiros | A port. | Fuera | Bloq. | Rec | Pér+Err | F |");
  lines.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  r.playersUsed.forEach((p) => {
    lines.push(
      `| ${p.number} | ${p.name} | ${p.isOnPitch ? "En pista" : "Banquillo"} | ${p.totLabel} | ${p.rotLabel ?? "—"} | ${p.rotationsCount} | ${p.goals} | ${p.attempts} | ${p.shotsOnTarget} | ${p.shotsOffTarget} | ${p.shotsBlocked} | ${p.steals + p.interceptions} | ${p.losses + p.errors} | ${p.fouls} |`,
    );
  });
  lines.push("");

  // ── SITUACIONES ESPECIALES ───────────────────────────────────────────
  //
  // Solo aparecen las ventanas que el operador declaró. Una expulsión sin
  // cambio de formación declarado NO crea ninguna superioridad aquí: no
  // consta, y suponerla sería inventar el dato.
  if (r.matchContextGroups.length) {
    lines.push("## Situaciones especiales");
    r.matchContextGroups.forEach((g) => {
      const veces = g.windows.length > 1 ? ` · ${g.windows.length} tramos` : "";
      lines.push(`**${g.label}**${veces}`);
      lines.push(
        `Duración: ${g.totalDuration !== null ? formatMatchTime(g.totalDuration) : UNKNOWN_DURATION_LABEL}`,
      );
      lines.push(
        `Tiros **${g.tally.shots}** · a portería **${g.tally.onTarget}** · fuera **${g.tally.offTarget}** · ` +
          `bloqueados **${g.tally.blocked}** · goles **${g.tally.goals}**`,
      );
      lines.push(
        `Recuperaciones **${g.tally.recoveries}** · pérdidas **${g.tally.turnovers}** · ` +
          `faltas **${g.tally.fouls}** · córners **${g.tally.corners}**`,
      );
      lines.push("");
    });
  }

  // ── SECUENCIA DE GOLES ───────────────────────────────────────────────
  if (r.goalSequence.length) {
    lines.push("## Secuencia de goles");
    r.goalSequence.forEach((g) => {
      const quien =
        g.playerName ?? (g.scoringTeam === "team" ? r.teamName : r.opponentName);
      const parte = PERIOD_LABEL[g.period] ?? String(g.period);
      lines.push(
        `- ${parte} ${g.matchTimeLabel} · ${g.scoreAfter.team}-${g.scoreAfter.opponent} · ` +
          `${quien} · ${g.sourceLabel}`,
      );
      // El tiempo de respuesta es null cuando el gol anterior del otro equipo
      // fue en otra parte: el reloj se reinicia y el dato no existe.
      if (g.secondsSinceOpponentPreviousGoal !== null) {
        const etiqueta = g.scoringTeam === "opponent" ? "Respuesta rival" : "Respuesta propia";
        lines.push(`  - ${etiqueta}: ${g.secondsSinceOpponentPreviousGoal} s`);
      }
    });
    lines.push("");
  }

  if (r.periodStats.length) {
    lines.push("## Estadísticas por periodo");
    r.periodStats.forEach((ps) => {
      lines.push(
        `**${ps.label}:** ${ps.goals} goles · ${ps.shots} tiros · ${ps.steals} recuperaciones · ` +
          `${ps.losses} pérdidas/errores · ${ps.fouls} faltas propias · ${ps.opponentFouls} del rival`,
      );
    });
    lines.push("");
  }

  if (r.zoneDistribution.length) {
    lines.push("## Distribución por zonas");
    r.zoneDistribution.forEach((z) => lines.push(`- ${z.label}: ${z.count}`));
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
