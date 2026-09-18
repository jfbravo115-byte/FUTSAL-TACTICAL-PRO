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

// ── INSTRUMENTACIÓN TEMPORAL (Fase 6, paso 2H) ─────────────────────────
//
// Por qué existe: el informe en streaming agota el reloj de 25 s del cliente
// sin que llegue un solo fragmento. El paso 2G descartó por medición que la
// culpa fuera del transporte —Netlify transmite cada `enqueue` al momento por
// las dos rutas, con los dos Content-Type, con POST, con compresión y con un
// cuerpo del tamaño real—, así que el tramo que queda a oscuras es el de
// dentro: qué tarda en pasar entre que pedimos el stream a Anthropic y que
// sale nuestro primer byte.
//
// Estos marcadores son OBSERVACIONALES. No cambian el protocolo, no alteran
// los tiempos y no tocan una sola decisión del código. Se retiran cuando el
// diagnóstico cierre.
//
// NO SE REGISTRA NINGÚN CONTENIDO. Ni el prompt, ni la respuesta, ni nombres,
// ni jugadores, ni eventos, ni logos, ni la API key. Solo instantes y tamaños.

/** Identificador corto para poder seguir una invocación concreta en el log. */
function diagnosticId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export type Diagnostics = {
  id: string;
  /** Milisegundos monotónicos desde la entrada a la función. */
  mark: (event: string, fields?: Record<string, string | number>) => void;
};

export function createDiagnostics(
  log: (line: string) => void = console.log,
  now: () => number = () => performance.now(),
): Diagnostics {
  const id = diagnosticId();
  const t0 = now();
  return {
    id,
    mark(event, fields) {
      const extra = fields
        ? " " + Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(" ")
        : "";
      log(`[TACTICAL-PRO ${id}] +${Math.round(now() - t0)}ms ${event}${extra}`);
    },
  };
}

/** Bytes reales de una cadena UTF-8, que es como viaja. */
export function utf8Bytes(str: string): number {
  return new TextEncoder().encode(str).length;
}

/**
 * Ausente ≠ cero.
 *
 * Es la misma regla que el glosario le impone al modelo, aplicada a nosotros:
 * un campo que no viene significa "no lo sabemos", no "vale 0". Si esto
 * devolviera 0, un `thinkingTokens=0` inventado apuntaría al diagnóstico
 * contrario del real.
 */
export function orUnknown(value: unknown): string | number {
  return typeof value === "number" ? value : "unknown";
}

/** Censo compacto de tipos: `a:3,b:1`, sin espacios y en orden estable. */
function tally(counts: Map<string, number>): string {
  if (counts.size === 0) return "none";
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k, n]) => `${k}:${n}`)
    .join(",");
}

export type StreamTally = {
  /** Registra un evento del stream. Solo mira tipos y números. */
  observe: (event: any) => void;
  /** Cuántos `text_delta` con texto se han visto. */
  readonly textDeltas: number;
  /** Vuelca el censo y el desenlace. Nunca escribe contenido. */
  report: (diag: Diagnostics | undefined) => void;
};

/**
 * Observador del stream de Anthropic.
 *
 * La ejecución `5kjdhw` generó durante 42 s y terminó limpiamente con CERO
 * `text_delta`. Nuestro filtro es correcto —solo el texto es informe— pero
 * ciego: no distingue "no llegó nada" de "llegó mucho y nada era texto".
 *
 * Esto cuenta lo que pasó de largo y recoge el desenlace que Anthropic ya
 * manda en `message_start` y `message_delta`. No cuesta ninguna llamada: son
 * campos de la misma generación.
 *
 * SOLO TIPOS Y NÚMEROS. El texto de un `thinking_delta`, de un `text_delta` o
 * de una firma no se lee, no se acumula y no se registra: únicamente se suma
 * uno a su contador.
 */
export function createStreamTally(): StreamTally {
  const events = new Map<string, number>();
  const blocks = new Map<string, number>();
  const deltas = new Map<string, number>();
  let textDeltas = 0;

  let stopReason: unknown;
  let inputTokens: unknown;
  let outputTokens: unknown;
  let thinkingTokens: unknown;
  let cacheCreate: unknown;
  let cacheRead: unknown;

  const bump = (m: Map<string, number>, key: unknown) => {
    const k = typeof key === "string" && key ? key : "unknown";
    m.set(k, (m.get(k) ?? 0) + 1);
  };

  /** Solo sobrescribe con números: un `null` del SDK no borra lo ya sabido. */
  const keepNumber = (current: unknown, next: unknown) =>
    typeof next === "number" ? next : current;

  const readUsage = (usage: any) => {
    if (!usage) return;
    inputTokens = keepNumber(inputTokens, usage.input_tokens);
    outputTokens = keepNumber(outputTokens, usage.output_tokens);
    cacheCreate = keepNumber(cacheCreate, usage.cache_creation_input_tokens);
    cacheRead = keepNumber(cacheRead, usage.cache_read_input_tokens);
    thinkingTokens = keepNumber(
      thinkingTokens,
      usage.output_tokens_details?.thinking_tokens,
    );
  };

  return {
    observe(event: any) {
      bump(events, event?.type);
      if (event?.type === "content_block_start") {
        bump(blocks, event?.content_block?.type);
      }
      if (event?.type === "content_block_delta") {
        bump(deltas, event?.delta?.type);
        if (
          event?.delta?.type === "text_delta" &&
          typeof event.delta.text === "string" &&
          event.delta.text.length > 0
        ) {
          textDeltas++;
        }
      }
      // `message_start` trae el usage inicial (entrada y caché);
      // `message_delta` trae el desenlace y la salida.
      if (event?.type === "message_start") readUsage(event?.message?.usage);
      if (event?.type === "message_delta") {
        readUsage(event?.usage);
        if (typeof event?.delta?.stop_reason === "string") {
          stopReason = event.delta.stop_reason;
        }
      }
    },

    get textDeltas() {
      return textDeltas;
    },

    report(diag) {
      if (!diag) return;
      diag.mark("stream-types", {
        events: tally(events),
        blocks: tally(blocks),
        deltas: tally(deltas),
      });
      diag.mark("message-result", {
        stopReason: typeof stopReason === "string" ? stopReason : "unknown",
        inputTokens: orUnknown(inputTokens),
        outputTokens: orUnknown(outputTokens),
        thinkingTokens: orUnknown(thinkingTokens),
        cacheCreate: orUnknown(cacheCreate),
        cacheRead: orUnknown(cacheRead),
      });
      if (textDeltas === 0) {
        // La línea que convierte "no pasó nada" en un diagnóstico.
        diag.mark("no-text-produced", {
          stopReason: typeof stopReason === "string" ? stopReason : "unknown",
          outputTokens: orUnknown(outputTokens),
          thinkingTokens: orUnknown(thinkingTokens),
        });
      }
    },
  };
}

/** Tipo de contenido del protocolo incremental. */
export const NDJSON_CONTENT_TYPE = "application/x-ndjson";

/**
 * Una línea del protocolo incremental.
 *
 *   {"t":"fragmento"}   texto que se añade al final del informe
 *   {"done":true}       la generación terminó ENTERA y bien
 *   {"error":"…"}       se rompió; puede haber `t` anteriores, nunca habrá `done`
 *
 * Por qué no texto plano: un error de Anthropic puede llegar DESPUÉS de que la
 * respuesta HTTP haya salido con un 200 —`overloaded_error` a mitad de stream
 * está documentado—, y entonces el socket se cierra igual que si todo hubiera
 * ido bien. Sin un `done` explícito, el cliente no puede distinguir un informe
 * completo de uno truncado, y guardaría medio análisis dentro del partido.
 *
 * Por qué no SSE: haría lo mismo con `event:`/`data:` y dobles saltos de línea.
 * Su única ventaja real es `EventSource`, que no admite POST.
 */
export type TacticalProChunk =
  | { t: string }
  | { done: true }
  | { error: string };

/** Serializa una línea del protocolo. El `\n` es el separador, no adorno. */
export function ndjsonLine(chunk: TacticalProChunk): string {
  return JSON.stringify(chunk) + "\n";
}

/**
 * ¿El cliente pide el protocolo incremental?
 *
 * Se mira la cabecera `Accept` y nada más. Un cliente que no la mande —como
 * TacticalBoard, que hace `await res.json()`— sigue por la rama de siempre.
 */
export function wantsNdjson(req: { headers: { get(name: string): string | null } }): boolean {
  return (req.headers.get("accept") || "").toLowerCase().includes(NDJSON_CONTENT_TYPE);
}

/** Mensaje legible de un fallo del SDK, con el mismo criterio que la rama JSON. */
function errorMessageOf(error: any): string {
  return (
    error?.error?.error?.message ||
    error?.message ||
    "Unknown error occurred"
  );
}

/**
 * Convierte el stream del SDK en líneas NDJSON.
 *
 * Solo emite texto: de todos los eventos que manda Anthropic —`message_start`,
 * `content_block_start`, `ping`, `thinking_delta`, `signature_delta`,
 * `message_delta`, `message_stop`— únicamente `content_block_delta` con
 * `delta.type === "text_delta"` lleva Markdown del informe. El resto se ignora
 * en silencio: no son texto y colarlos rompería el documento.
 */
export function ndjsonStreamFrom(
  stream: {
    [Symbol.asyncIterator](): AsyncIterator<any>;
    abort: () => void;
  },
  diag?: Diagnostics,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      // Los tres instantes que separan las hipótesis que quedan vivas:
      //   first-anthropic-event  llegó ALGO (message_start, ping…) → conectó
      //   first-text-delta       llegó el primer texto → empezó a escribir
      //   first-enqueue          salió nuestro primer byte → nos toca a nosotros
      // Si los tres van juntos y tarde, el retraso es de Anthropic. Si el
      // primero es pronto y el segundo tarde, conectó y tardó en generar. Si
      // los dos primeros son pronto y el tercero tarde, el problema es nuestro.
      let primerEvento = false;
      let primerTexto = false;
      let primerEnvio = false;
      let fragmentos = 0;
      // Observa TODO lo que pasa; el filtro de abajo sigue enviando solo texto.
      const censo = createStreamTally();

      const push = (chunk: TacticalProChunk) => {
        controller.enqueue(encoder.encode(ndjsonLine(chunk)));
        if (!primerEnvio) {
          primerEnvio = true;
          diag?.mark("first-enqueue");
        }
      };
      try {
        for await (const event of stream) {
          censo.observe(event);
          if (!primerEvento) {
            primerEvento = true;
            // El tipo del evento es metadato del protocolo, no contenido.
            diag?.mark("first-anthropic-event", { type: String(event?.type ?? "?") });
          }
          if (
            event?.type === "content_block_delta" &&
            event?.delta?.type === "text_delta" &&
            typeof event.delta.text === "string" &&
            event.delta.text.length > 0
          ) {
            if (!primerTexto) {
              primerTexto = true;
              diag?.mark("first-text-delta");
            }
            fragmentos++;
            push({ t: event.delta.text });
          }
        }
        censo.report(diag);
        // Única señal de que el informe está entero. Va después del bucle a
        // propósito: si el bucle lanza, no se llega aquí.
        //
        // Durante este paso `done` conserva EXACTAMENTE su semántica actual,
        // incluso con cero fragmentos: mezclar diagnóstico y corrección haría
        // imposible saber cuál de los dos cambió el resultado.
        push({ done: true });
        diag?.mark("stream-complete", { deltas: fragmentos });
      } catch (error: any) {
        console.error("tactical-pro stream error:", error);
        // El NOMBRE del error, nunca su mensaje: un mensaje de la API podría
        // arrastrar fragmentos de lo enviado.
        diag?.mark("stream-error", {
          type: String(error?.name ?? error?.constructor?.name ?? "Error"),
          deltas: fragmentos,
        });
        // Antes del push: si el consumidor se fue, encolar lanza y perderíamos
        // el censo, que es justo lo que explica un fallo a mitad.
        censo.report(diag);
        push({ error: errorMessageOf(error) });
      } finally {
        controller.close();
      }
    },
    cancel() {
      // El usuario cerró el modal o abortó. Sin esto la generación seguiría
      // hasta el final contra la cuenta de Anthropic sin que nadie la lea.
      //
      // Se marca ANTES de abortar: si esta línea no aparece en el log tras un
      // timeout del cliente, significa que Netlify no nos comunica que el
      // consumidor se fue — y entonces cada timeout deja una generación
      // corriendo y facturándose para nadie.
      diag?.mark("stream-cancelled");
      stream.abort();
    },
  });
}

export default async (req: Request, _context: Context) => {
  const diag = createDiagnostics();
  diag.mark("request-start", { method: req.method });

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
  let bodyBytes = 0;
  try {
    // Se lee como texto y se parsea, en vez de `req.json()`, únicamente para
    // poder medir los bytes REALES que llegaron. El resultado es idéntico.
    const raw = await req.text();
    bodyBytes = utf8Bytes(raw);
    body = JSON.parse(raw);
  } catch {
    return jsonResponse(400, {
      error: "Cuerpo de la petición inválido: se esperaba JSON",
    });
  }

  const { matchData, deterministicReport, tacticalContext } = body || {};
  if (matchData === undefined || matchData === null) {
    return jsonResponse(400, { error: "Falta matchData en el cuerpo de la petición" });
  }
  diag.mark("request-validated", { bodyBytes });

  let matchDataStr: string;
  let deterministicReportStr: string;
  let tacticalContextStr: string;
  try {
    // JSON compacto, no indentado. La sangría de `null, 2` era el 41% del
    // prompt —16.000 tokens de espacios en un partido normal— sin aportar un
    // solo dato: el modelo lee igual de bien el JSON en una línea.
    matchDataStr = JSON.stringify(matchData);
    deterministicReportStr = deterministicReport
      ? JSON.stringify(deterministicReport)
      : "No se recibió resumen determinista; trabaja solo con los datos crudos y explicita cualquier limitación.";
    tacticalContextStr = tacticalContext
      ? JSON.stringify(tacticalContext)
      : "No se recibió contexto táctico; no dispones de datos de portería ni espaciales ya calculados, y debes decirlo en vez de deducirlos de los eventos.";
    if (!matchDataStr) throw new Error("matchData se serializó como vacío");
  } catch (e: any) {
    return jsonResponse(400, {
      error: "Los datos del partido no se pudieron serializar: " + (e?.message || String(e)),
    });
  }

  // UNA sola definición de qué se le pide al modelo. Las dos ramas la comparten
  // entera —modelo, system, prompt, límite— y difieren únicamente en cómo se
  // consume la respuesta. Si esto se duplicara, volveríamos a tener dos
  // generadores divergentes, que es el problema que arrastramos desde Fase 4.
  const requestParams = {
    model: "claude-sonnet-5",
    max_tokens: 4096,
    system: SYSTEM_INSTRUCTION,
    messages: [
      {
        role: "user" as const,
        content: buildPrompt(matchDataStr, deterministicReportStr, tacticalContextStr),
      },
    ],
  };

  // Tamaños, nunca contenido. Es lo que permite saber si el prompt creció sin
  // que nos diéramos cuenta, sin filtrar una sola palabra del partido.
  diag.mark("prompt-ready", {
    matchDataBytes: utf8Bytes(matchDataStr),
    deterministicReportBytes: utf8Bytes(deterministicReportStr),
    tacticalContextBytes: utf8Bytes(tacticalContextStr),
    systemChars: SYSTEM_INSTRUCTION.length,
    userPromptChars: requestParams.messages[0].content.length,
    userPromptBytes: utf8Bytes(requestParams.messages[0].content),
    maxTokens: requestParams.max_tokens,
    model: requestParams.model,
  });

  const anthropic = new Anthropic({ apiKey });

  // Negociación de contenido: quien no pida NDJSON recibe exactamente la misma
  // respuesta que antes de este cambio. TacticalBoard depende de ello y no se
  // toca; la compatibilidad es por construcción, no un parche.
  if (wantsNdjson(req)) {
    diag.mark("ndjson-selected");
    const stream = anthropic.messages.stream(requestParams);
    diag.mark("anthropic-stream-created");
    return new Response(ndjsonStreamFrom(stream as any, diag), {
      status: 200,
      headers: {
        "Content-Type": NDJSON_CONTENT_TYPE,
        // Sin esto algún intermediario podría acumular la respuesta y anular
        // la razón de ser del streaming.
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  }

  diag.mark("json-selected");
  try {
    const response = await anthropic.messages.create(requestParams);
    diag.mark("json-response-received");

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
    diag.mark("json-error", { type: String(error?.name ?? "Error") });
    const status = typeof error?.status === "number" ? error.status : 500;
    const message =
      error?.error?.error?.message ||
      error?.message ||
      "Unknown error occurred";
    return jsonResponse(status >= 400 && status < 600 ? status : 500, { error: message });
  }
};
