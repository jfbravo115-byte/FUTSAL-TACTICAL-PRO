import type { Context } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";

export const SYSTEM_INSTRUCTION = `Eres un analista táctico profesional especializado en Fútbol Sala de alto rendimiento.
Tu comunicación es formal, precisa y rigurosa. Trabajas únicamente con los datos suministrados.
REGLAS OBLIGATORIAS:
- El CONTEXTO DETERMINISTA (resumen y contexto táctico) es la fuente factual de toda métrica ya calculada. No la recalcules a partir de los eventos crudos ni la contradigas.
- No inventes estadísticas: ni posesión, xG, distancias, velocidades, intervalos de 5 minutos, ni ninguna métrica ausente.
- No infieras secuencias ni relaciones causales que no estén registradas. En particular, NUNCA relaciones una falta, un córner, una reanudación y un tiro por cercanía temporal o por su orden en la lista de eventos: la aplicación no guarda ningún vínculo entre ellos.
- No conviertas una ausencia de registro en un cero observado. Un campo opcional ausente significa "no se registró", no "no ocurrió".
- Distingue siempre hecho registrado de interpretación táctica, y dilo con esas palabras cuando interpretes.
- Respeta el GLOSARIO: define términos que se parecen entre sí y significan cosas distintas.
- Toda recomendación debe estar vinculada a una evidencia concreta de los datos.
- Si los datos no permiten sostener una conclusión, indícalo explícitamente en vez de asumirla.
- No uses introducciones entusiastas ni frases coloquiales.`;

export function buildPrompt(
  matchDataStr: string,
  deterministicReportStr: string,
  tacticalContextStr: string,
): string {
  return `Redacta un informe TACTICAL PRO en Markdown a partir de tres fuentes:

1. RESUMEN DETERMINISTA CANÓNICO: métricas calculadas por la propia aplicación. Es la referencia para cantidades, porcentajes, marcador, tiempos y rotaciones.
2. CONTEXTO TÁCTICO: porteros y espacio, calculados también por la aplicación, más un GLOSARIO. Léelo antes que nada: define términos que se parecen y significan cosas distintas.
3. DATOS CRUDOS: eventos y estado del partido. Solo para contextualizar; nunca para recalcular una métrica que ya venga en las dos primeras, ni para contradecirlas.

Estructura obligatoria:
## 1. Lectura objetiva del partido
Marcador, volumen de tiro, precisión/conversión, recuperaciones, pérdidas/errores y faltas. Sin atribuir causas no registradas.

## 2. Ataque y finalización
Describe eficiencia ofensiva, sectores de origen, destino en portería y jugadores destacados solo cuando exista evidencia. No hables de posesión si no está registrada. Recuerda que los sectores están normalizados a la perspectiva del equipo que ejecuta.

## 3. Recuperación y seguridad con balón
Analiza recuperaciones frente a pérdidas/errores y las zonas asociadas. Separa dato de interpretación.

## 4. Rotaciones y utilización
Usa TOT, ROT y sustituciones registradas. No estimes cargas o fatiga fisiológica; limita cualquier lectura a la distribución real de minutos/rotaciones.

## 5. Momentos relevantes
Usa únicamente goles, tarjetas y otros eventos con timestamp real que aparezcan en los datos. No inventes tramos de cinco minutos.

## 6. Portería y balón parado
Portería: usa el contexto táctico (paradas y su subtipo, salidas con su resultado, goles encajados, zonas GK1-GK5). Declara lo que no conste en vez de estimarlo.
Balón parado: distingue los tiros directos de córner de los tiros procedentes de córner, y las faltas cometidas de las faltas puestas en juego y de los tiros de falta. No los sumes entre sí.

## 7. Recomendaciones TACTICAL PRO
Da 3-5 ajustes concretos. Para cada uno escribe primero "Evidencia:" y cita la métrica o patrón registrado que lo sustenta. Si no hay evidencia suficiente para una recomendación, no la incluyas.

CONTEXTO TÁCTICO (incluye el glosario; léelo primero):
${tacticalContextStr}

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

  const { matchData, deterministicReport, tacticalContext } = body || {};
  if (matchData === undefined || matchData === null) {
    return jsonResponse(400, { error: "Falta matchData en el cuerpo de la petición" });
  }

  let matchDataStr: string;
  let deterministicReportStr: string;
  let tacticalContextStr: string;
  try {
    matchDataStr = JSON.stringify(matchData, null, 2);
    deterministicReportStr = deterministicReport
      ? JSON.stringify(deterministicReport, null, 2)
      : "No se recibió resumen determinista; trabaja solo con los datos crudos y explicita cualquier limitación.";
    tacticalContextStr = tacticalContext
      ? JSON.stringify(tacticalContext, null, 2)
      : "No se recibió contexto táctico; no dispones de datos de portería ni espaciales ya calculados, y debes decirlo en vez de deducirlos de los eventos.";
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
      messages: [
        {
          role: "user",
          content: buildPrompt(matchDataStr, deterministicReportStr, tacticalContextStr),
        },
      ],
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
