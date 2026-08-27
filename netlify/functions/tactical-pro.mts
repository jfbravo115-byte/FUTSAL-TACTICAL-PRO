import type { Context } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";

const SYSTEM_INSTRUCTION =
  "Eres un analista táctico profesional especializado en Fútbol Sala de alto rendimiento. Tu comunicación es formal, precisa y rigurosa, propia de un informe técnico deportivo de élite. Utilizas terminología táctica avanzada de Futsal. No uses introducciones entusiastas ni frases coloquiales. Ve directo al análisis técnico.";

function buildPrompt(matchDataStr: string): string {
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

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  // ── 1. API key ────────────────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, {
      error: "API Key missing: configura ANTHROPIC_API_KEY en Netlify",
    });
  }

  // ── 2. Parseo defensivo del cuerpo de la petición ──────────────
  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, {
      error: "Cuerpo de la petición inválido: se esperaba JSON",
    });
  }

  const { matchData } = body || {};
  if (matchData === undefined || matchData === null) {
    return jsonResponse(400, { error: "Falta matchData en el cuerpo de la petición" });
  }

  // ── 3. Serialización defensiva (nunca dejar que un dato raro tumbe la función) ──
  let matchDataStr: string;
  try {
    matchDataStr = JSON.stringify(matchData, null, 2);
    if (!matchDataStr) throw new Error("matchData se serializó como vacío");
  } catch (e: any) {
    return jsonResponse(400, {
      error: "matchData no se pudo serializar: " + (e?.message || String(e)),
    });
  }

  // ── 4. Llamada a Claude ─────────────────────────────────────────
  try {
    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 8192,
      system: SYSTEM_INSTRUCTION,
      messages: [{ role: "user", content: buildPrompt(matchDataStr) }],
    });

    // Une todos los bloques de texto de la respuesta (normalmente hay uno solo,
    // pero esto es robusto ante respuestas multi-bloque).
    const analysis = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();

    if (!analysis) {
      return jsonResponse(502, {
        error: "El modelo devolvió una respuesta vacía. Inténtalo de nuevo.",
      });
    }

    return jsonResponse(200, { analysis });
  } catch (error: any) {
    console.error("tactical-pro error:", error);

    // Errores conocidos del SDK de Anthropic traen status/mensaje utilizables.
    const status = typeof error?.status === "number" ? error.status : 500;
    const message =
      error?.error?.error?.message || // forma anidada de la API de Anthropic
      error?.message ||
      "Unknown error occurred";

    return jsonResponse(status >= 400 && status < 600 ? status : 500, { error: message });
  }
};
