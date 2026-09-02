import { MatchData } from '../types/futsal';

// Mismo saneamiento que en MatchTracker.tsx: evita que un surrogate UTF-16
// huérfano en un campo de texto libre (nombre de equipo/jugador) haga que
// Safari/WebKit lance "TypeError: The string did not match the expected
// pattern." al codificar el body de fetch() a UTF-8. Ver el comentario
// junto a stripLoneSurrogates en MatchTracker.tsx para el detalle completo.
const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const stripLoneSurrogates = (str: string): string =>
  str.replace(LONE_SURROGATE_RE, "\uFFFD");

export async function generateTacticalReport(matchData: MatchData): Promise<string> {
  const res = await fetch('/api/tactical-pro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: stripLoneSurrogates(JSON.stringify({ matchData })),
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
