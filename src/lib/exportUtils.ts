import { MatchData, ActionType, GoalieAction, Role } from '../types/futsal';
import { formatAnyZoneLabel } from '../utils/legacyZoneMap';
import { formatDestinationLabel } from '../utils/goalZones';
import { playerShotTallies, summarizePlayerShots, tallyOf } from '../utils/shotModel';
import { chronological } from '../utils/eventOrder';

const formatPlayerTime = (totalSeconds: number) => {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/** Nombre de la parte para las exportaciones. Nunca el número interno. */
const PERIOD_CSV_LABEL: Record<number, string> = {
  0: '1ª Parte',
  1: '2ª Parte',
  2: 'Prórroga 1',
  3: 'Prórroga 2',
  4: 'Finalizado',
};

const formatTime = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

export function exportToCSV(matchData: MatchData) {
  const goals = matchData.events.filter(
    (e) => (e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED) && !e.metadata?.isOpponent
  ).length;
  const opponentGoals = matchData.events.filter(
    (e) => (e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED) && e.metadata?.isOpponent
  ).length;

  const rows: string[][] = [];

  // Header
  rows.push(['FUTSAL COMMANDER PRO - EXPORTACIÓN DE DATOS']);
  rows.push([`Partido: ${matchData.teamName} ${goals} - ${opponentGoals} ${matchData.opponentName}`]);
  rows.push([`Fecha: ${new Date().toLocaleDateString('es-ES')}`]);
  rows.push([]);

  // Player stats
  rows.push(['ESTADÍSTICAS DE JUGADORES']);
  rows.push(['Equipo', '#', 'Nombre', 'Puesto', 'Tiempo', '+/-', 'Goles', 'Asistencias', 'Tiros', 'Tiros Portería', 'Tiros Fuera', 'Tiros Bloqueados', 'Recuperaciones', 'Intercepciones', 'Pérdidas', 'Faltas', 'Amarillas', 'Rojas', 'Paradas', 'Encajados']);

  // Finalización derivada de los eventos. La columna «Tiros Portería» salía
  // de `shots - shotsOffTarget`, y esos dos cubos de PlayerStats son
  // disjuntos: la resta no daba los tiros a portería, y un tiro bloqueado
  // —que no cabe en ninguno de los dos— acababa contándose como tiro a
  // portería.
  const tallies = playerShotTallies(matchData.events, matchData.players);

  matchData.players
    .filter(p => p.role !== Role.COACH && p.role !== Role.DELEGATE)
    .forEach(p => {
      const tiros = tallyOf(tallies, p.id);
      rows.push([
        p.isOpponent ? matchData.opponentName : matchData.teamName,
        String(p.number),
        p.name,
        p.role,
        formatPlayerTime(p.individualTimeSeconds),
        String(p.plusMinus),
        String(p.stats.goals),
        String(p.stats.assists),
        String(tiros.shots),
        String(tiros.onTarget),
        String(tiros.offTarget),
        String(tiros.blocked),
        String(p.stats.steals),
        String(p.stats.interceptions),
        String(p.stats.losses),
        String(p.stats.fouls),
        String(p.stats.yellowCards),
        String(p.stats.redCards),
        String(p.stats.saves),
        String(p.stats.conceded),
      ]);
    });

  rows.push([]);

  // Events timeline
  rows.push(['LÍNEA TEMPORAL DE EVENTOS']);
  // El periodo va en su propia columna: `timestamp` se reinicia en el
  // descanso, así que "05:12" aparece dos veces en un partido y sin la parte
  // no hay forma de saber cuál es cuál.
  rows.push(['Parte', 'Tiempo', 'Tipo', 'Jugador', '#', 'Equipo', 'Origen', 'Destino', 'Marcador']);

  chronological(matchData.events)
    .forEach(e => {
      const player = matchData.players.find(p => p.id === e.playerIds[0]);
      const score = e.scoreAtEvent ? `${e.scoreAtEvent.team}-${e.scoreAtEvent.opponent}` : '';
      rows.push([
        PERIOD_CSV_LABEL[e.period] ?? String(e.period),
        formatTime(e.timestamp),
        e.type,
        player?.name || 'Equipo',
        String(player?.number || ''),
        e.metadata?.isOpponent ? matchData.opponentName : matchData.teamName,
        formatAnyZoneLabel(e.originGrid),
        formatDestinationLabel(e.destinationGrid),
        score,
      ]);
    });

  // Generate CSV
  const csvContent = rows
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `futsal_${matchData.teamName.replace(/\s+/g, '_')}_${Date.now()}.csv`;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportForNotebookLM(matchData: MatchData) {
  const goals = matchData.events.filter(
    (e) => (e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED) && !e.metadata?.isOpponent
  ).length;
  const opponentGoals = matchData.events.filter(
    (e) => (e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED) && e.metadata?.isOpponent
  ).length;

  const text = `# Análisis de Partido de Fútbol Sala

## Resultado
${matchData.teamName} ${goals} - ${opponentGoals} ${matchData.opponentName}

## Estadísticas de Equipo Local
${matchData.players
  .filter(p => !p.isOpponent && p.role !== Role.COACH && p.role !== Role.DELEGATE)
  .map(p => `- ${p.name} (#${p.number}): ${p.stats.goals}G ${p.stats.assists}A ${summarizePlayerShots(matchData.events, p).shots}T en ${formatPlayerTime(p.individualTimeSeconds)}`)
  .join('\n')}

## Estadísticas de Equipo Rival
${matchData.players
  .filter(p => p.isOpponent && p.role !== Role.COACH && p.role !== Role.DELEGATE)
  .map(p => `- ${p.name} (#${p.number}): ${p.stats.goals}G ${p.stats.assists}A ${summarizePlayerShots(matchData.events, p).shots}T`)
  .join('\n')}

## Línea Temporal
${chronological(matchData.events)
  .filter(e => e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED)
  .map(e => {
    const p = matchData.players.find(pl => pl.id === e.playerIds[0]);
    const team = e.metadata?.isOpponent ? matchData.opponentName : matchData.teamName;
    const parte = PERIOD_CSV_LABEL[e.period] ?? String(e.period);
    return `- ${parte} ${formatTime(e.timestamp)}: GOL de ${p?.name || 'Desconocido'} (${team})`;
  })
  .join('\n')}
`;

  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = `notebooklm_${matchData.teamName.replace(/\s+/g, '_')}_${Date.now()}.txt`;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
