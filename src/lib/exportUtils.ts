import { MatchData, ActionType, GoalieAction, Role } from '../types/futsal';

const formatPlayerTime = (totalSeconds: number) => {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
  rows.push(['Equipo', '#', 'Nombre', 'Puesto', 'Tiempo', '+/-', 'Goles', 'Asistencias', 'Tiros', 'Tiros Portería', 'Tiros Fuera', 'Recuperaciones', 'Intercepciones', 'Pérdidas', 'Faltas', 'Amarillas', 'Rojas', 'Paradas', 'Encajados']);

  matchData.players
    .filter(p => p.role !== Role.COACH && p.role !== Role.DELEGATE)
    .forEach(p => {
      rows.push([
        p.isOpponent ? matchData.opponentName : matchData.teamName,
        String(p.number),
        p.name,
        p.role,
        formatPlayerTime(p.individualTimeSeconds),
        String(p.plusMinus),
        String(p.stats.goals),
        String(p.stats.assists),
        String(p.stats.shots + p.stats.goals),
        String((p.stats.shots - p.stats.shotsOffTarget) + p.stats.goals),
        String(p.stats.shotsOffTarget),
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
  rows.push(['Tiempo', 'Tipo', 'Jugador', '#', 'Equipo', 'Origen', 'Destino', 'Marcador']);

  matchData.events
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp)
    .forEach(e => {
      const player = matchData.players.find(p => p.id === e.playerIds[0]);
      const score = e.scoreAtEvent ? `${e.scoreAtEvent.team}-${e.scoreAtEvent.opponent}` : '';
      rows.push([
        formatTime(e.timestamp),
        e.type,
        player?.name || 'Equipo',
        String(player?.number || ''),
        e.metadata?.isOpponent ? matchData.opponentName : matchData.teamName,
        e.originGrid || '',
        e.destinationGrid || '',
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
  .map(p => `- ${p.name} (#${p.number}): ${p.stats.goals}G ${p.stats.assists}A ${p.stats.shots + p.stats.goals}T en ${formatPlayerTime(p.individualTimeSeconds)}`)
  .join('\n')}

## Estadísticas de Equipo Rival
${matchData.players
  .filter(p => p.isOpponent && p.role !== Role.COACH && p.role !== Role.DELEGATE)
  .map(p => `- ${p.name} (#${p.number}): ${p.stats.goals}G ${p.stats.assists}A ${p.stats.shots + p.stats.goals}T`)
  .join('\n')}

## Línea Temporal
${matchData.events
  .filter(e => e.type === ActionType.GOAL || e.type === GoalieAction.GOAL_CONCEDED)
  .slice()
  .sort((a, b) => a.timestamp - b.timestamp)
  .map(e => {
    const p = matchData.players.find(pl => pl.id === e.playerIds[0]);
    const team = e.metadata?.isOpponent ? matchData.opponentName : matchData.teamName;
    return `- ${formatTime(e.timestamp)}: GOL de ${p?.name || 'Desconocido'} (${team})`;
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
