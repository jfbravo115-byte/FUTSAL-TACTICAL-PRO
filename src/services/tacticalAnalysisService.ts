import { MatchData } from '../types/futsal';
import { generateMatchReport } from './matchReportService';

// Evita que un surrogate UTF-16 huérfano haga fallar fetch() en Safari/WebKit.
const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const stripLoneSurrogates = (str: string): string =>
  str.replace(LONE_SURROGATE_RE, "\uFFFD");

export async function generateTacticalReport(matchData: MatchData): Promise<string> {
  // El resumen determinista viaja junto a los datos brutos para que la IA
  // tenga una fuente canónica de métricas y no necesite reinterpretar campos.
  const deterministicReport = generateMatchReport(matchData);

  const res = await fetch('/api/tactical-pro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: stripLoneSurrogates(JSON.stringify({ matchData, deterministicReport })),
  });

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // Un error HTML/proxy no debe ocultar el status real.
  }

  if (!res.ok) {
    throw new Error(data?.error || `Error del servidor: ${res.status}`);
  }

  if (!data?.analysis || typeof data.analysis !== 'string') {
    throw new Error(data?.error || 'Respuesta vacía del servidor');
  }

  return data.analysis;
}
