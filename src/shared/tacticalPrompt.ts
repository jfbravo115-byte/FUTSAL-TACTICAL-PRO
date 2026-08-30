// Fuente de verdad COMPARTIDA del análisis Tactical Pro.
// La usan tanto la Netlify Function de producción (netlify/functions/tactical-pro.mts)
// como el servidor local de desarrollo (server.ts), para que no vuelvan a divergir.

export const TACTICAL_MODEL = "claude-sonnet-5";
export const TACTICAL_MAX_TOKENS = 8192;

export const SYSTEM_INSTRUCTION =
  "Eres un analista táctico profesional especializado en Fútbol Sala de alto rendimiento. Tu comunicación es formal, precisa y rigurosa, propia de un informe técnico deportivo de élite. Utilizas terminología táctica avanzada de Futsal. No uses introducciones entusiastas ni frases coloquiales. Ve directo al análisis técnico.";

export function buildTacticalPrompt(matchDataStr: string): string {
  return `Analiza los siguientes datos de un partido de fútbol sala (Futsal) y redacta un informe TACTICAL PRO detallado en formato Markdown.

Los datos incluyen el rendimiento general, estadísticas por parciales de 5 minutos, y rendimiento de jugadores.

Crea un informe que contenga:
1.  **Resumen del Partido**: Breve interpretación del resultado y flujo del juego (basado en g/a, posesión, y tiros).
2.  **Análisis por Intervalos (Momentos Críticos)**: Analiza los intervalos de 5 minutos proporcionados e identifica en qué momento el equipo fue más vulnerable defensivamente y en qué momento fue más eficaz ofensivamente.
3.  **Evaluación de Jugadores**: Basado en las métricas individuales provistas, destaca las fortalezas y puntos de mejora, mencionando a quiénes recomiendas para situaciones específicas (ej. jugador clave para remontar).
4.  **Sugerencias Tácticas (TACTICAL PRO)**: Ofrece recomendaciones y ajustes estratégicos estructurados para el próximo partido a partir de las vulnerabilidades y fortalezas observadas. Sé analítico y constructivo. Sé específico sobre tácticas de futsal (rotaciones, defensa en zona, presión alta, etc.).

Datos del partido:
${matchDataStr}
`;
}
