import { MatchData } from '../types/futsal';
import { buildTacticalProPayload } from './tacticalProPayload';

// Evita que un surrogate UTF-16 huérfano haga fallar fetch() en Safari/WebKit.
const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const stripLoneSurrogates = (str: string): string =>
  str.replace(LONE_SURROGATE_RE, "\uFFFD");

export async function generateTacticalReport(matchData: MatchData): Promise<string> {
  // Contexto compartido con MatchTracker: mismo partido, mismo payload, venga
  // de la pantalla que venga. Ver services/tacticalProPayload.
  const res = await fetch('/api/tactical-pro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: stripLoneSurrogates(JSON.stringify(buildTacticalProPayload(matchData))),
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
