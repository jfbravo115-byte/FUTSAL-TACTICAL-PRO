import { MatchData } from '../types/futsal';

export async function generateTacticalReport(matchData: MatchData): Promise<string> {
  const res = await fetch('/api/tactical-pro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ matchData }),
  });

  if (!res.ok) {
    throw new Error(`Error del servidor: ${res.status}`);
  }

  const data = await res.json();

  if (!data.analysis) {
    throw new Error(data.error || 'Respuesta vacía del servidor');
  }

  return data.analysis;
}
