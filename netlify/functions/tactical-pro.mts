import type { Context } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";

export const SYSTEM_INSTRUCTION = `Eres un analista táctico profesional especializado en Fútbol Sala de alto rendimiento.
Tu comunicación es formal, precisa y rigurosa. Trabajas únicamente con los datos suministrados.
REGLAS OBLIGATORIAS:
- No inventes posesión, xG, distancias, velocidades, intervalos de 5 minutos ni ninguna métrica ausente.
- No conviertas una ausencia de registro en un cero salvo que el resumen determinista lo indique.
- Distingue hechos medidos de interpretación táctica.
- Toda recomendación debe estar vinculada a una evidencia concreta de los datos.
- Si los datos no permiten sostener una conclusión, indícalo explícitamente.
- No uses introducciones entusiastas ni frases coloquiales.`;

export function buildPrompt(matchDataStr: string, deterministicReportStr: string): string {
  return `Redacta un informe TACTICAL PRO en Markdown a partir de dos fuentes:

1. RESUMEN DETERMINISTA CANÓNICO: métricas calculadas por la propia aplicación. Úsalo como referencia principal para cantidades, porcentajes, marcador, tiempos y rotaciones.
2. DATOS CRUDOS: eventos y estado del partido. Úsalos para contextualizar secuencias, estados de juego y zonas, sin contradecir el resumen determinista.

Estructura obligatoria:
## 1. Lectura objetiva del partido
Marcador, volumen de tiro, precisión/conversión, recuperaciones, pérdidas/errores y faltas. Sin atribuir causas no registradas.

## 2. Ataque y finalización
Describe eficiencia ofensiva, zonas de origen/destino y jugadores destacados solo cuando exista evidencia. No hables de posesión si no está registrada.

## 3. Recuperación y seguridad con balón
Analiza recuperaciones frente a pérdidas/errores y las zonas asociadas. Separa dato de interpretación.

## 4. Rotaciones y utilización
Usa TOT, ROT y sustituciones registradas. No estimes cargas o fatiga fisiológica; limita cualquier lectura a la distribución real de minutos/rotaciones.

## 5. Momentos relevantes
Usa únicamente goles, tarjetas y otros eventos con timestamp real que aparezcan en los datos. No inventes tramos de cinco minutos.

## 6. Recomendaciones TACTICAL PRO
Da 3-5 ajustes concretos. Para cada uno escribe primero "Evidencia:" y cita la métrica o patrón registrado que lo sustenta. Si no hay evidencia suficiente para una recomendación, no la incluyas.

RESUMEN DETERMINISTA:
${deterministicReportStr}

DATOS CRUDOS:
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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, {
      error: "API Key missing: configura ANTHROPIC_API_KEY en Netlify",
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, {
      error: "Cuerpo de la petición inválido: se esperaba JSON",
    });
  }

  const { matchData, deterministicReport } = body || {};
  if (matchData === undefined || matchData === null) {
    return jsonResponse(400, { error: "Falta matchData en el cuerpo de la petición" });
  }

  let matchDataStr: string;
  let deterministicReportStr: string;
  try {
    matchDataStr = JSON.stringify(matchData, null, 2);
    deterministicReportStr = deterministicReport
      ? JSON.stringify(deterministicReport, null, 2)
      : "No se recibió resumen determinista; trabaja solo con los datos crudos y explicita cualquier limitación.";
    if (!matchDataStr) throw new Error("matchData se serializó como vacío");
  } catch (e: any) {
    return jsonResponse(400, {
      error: "Los datos del partido no se pudieron serializar: " + (e?.message || String(e)),
    });
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 4096,
      system: SYSTEM_INSTRUCTION,
      messages: [{ role: "user", content: buildPrompt(matchDataStr, deterministicReportStr) }],
    });

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
    const status = typeof error?.status === "number" ? error.status : 500;
    const message =
      error?.error?.error?.message ||
      error?.message ||
      "Unknown error occurred";
    return jsonResponse(status >= 400 && status < 600 ? status : 500, { error: message });
  }
};
