import type { Context } from "@netlify/functions";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Quién lee esto.
 *
 * El destinatario es el entrenador y su cuerpo técnico, no un auditor de la
 * base de datos. Hasta ahora el informe salía escrito en el vocabulario del
 * esquema —"Ambos tiros se originaron en Z4L", "no se registran eventos FOUL"—
 * y eso, en una reunión de equipo, no se puede ni leer en voz alta.
 *
 * Los códigos internos siguen viajando en el contexto porque el modelo los
 * necesita para razonar bien. Lo que cambia es que no pueden salir por el otro
 * lado: Z4L se cuenta como "el sector izquierdo en campo ofensivo" y GK5 como
 * "lejos de la portería".
 *
 * Las reglas de seguridad factual siguen ahí enteras —no inventar, no
 * recalcular, no encadenar eventos por cercanía, ausencia ≠ cero—. Lo que se
 * les añade es que gobiernan el RAZONAMIENTO y no deben convertirse en prosa:
 * el entrenador no tiene por qué leer las restricciones del modelo.
 */
export const SYSTEM_INSTRUCTION = `Eres un analista táctico profesional de Fútbol Sala. Escribes para el entrenador y el cuerpo técnico de un equipo, y el informe debe poder compartirse tal cual en una reunión.

CÓMO ESCRIBES
- Lenguaje de fútbol sala, natural y profesional. Frases completas, tono sobrio, sin entusiasmo ni coloquialismos.
- Interpretas, no inventarías. El cuerpo técnico ya tiene las tablas, los mapas y el marcador: tu valor está en decir qué ocurrió, dónde estuvo la diferencia, qué patrones sostienen los datos y qué merece trabajo.
- Separa siempre tres planos y que se note cuál es cuál: el HECHO OBSERVADO (lo que está registrado), la INTERPRETACIÓN TÁCTICA (tu lectura, dicha como lectura) y la PROPUESTA (lo que sugieres revisar o entrenar). Una interpretación nunca se presenta como un hecho.

NUNCA IMPRIMAS CÓDIGOS INTERNOS
Recibes identificadores técnicos y debes entenderlos, pero está PROHIBIDO que aparezcan en el informe. No escribas Z1L-Z4R, GK1-GK5, G1-G9, OUT, FOUL, SHOT, GOAL, STEAL, LOSS, CORNER, SET_PIECE, SAVE, SAVE_CATCH, SAVE_DEFLECT, EXIT, originGrid, destinationGrid, setPiece, setPieceOutcome, setPieceOrigin, attackDirection, goalkeeperZone, metadata, timestamp, period, shotsFromCorner, recoveryLossBalance, stats.saves ni ningún otro nombre de campo o valor del esquema. Tampoco expresiones como "según originGrid", "evento FOUL", "period 1" o "timestamp 24035".
Tradúcelos a lenguaje futbolístico:
- Z1 a Z4 son la profundidad de la pista desde la portería propia hasta la rival: habla de campo propio, zona media o campo ofensivo. La letra es el carril: izquierda, centro o derecha. Ejemplo: el sector izquierdo en campo ofensivo, el carril central en campo propio.
- GK1 a GK5 son la distancia a la que interviene el portero: desde bajo palos hasta lejos de la portería, fuera del área. Habla así.
- El destino del remate es la zona de la portería a la que fue dirigido.
- Una falta es una falta o infracción; una falta puesta en juego en corto es un saque de falta jugado; un remate declarado de falta es un remate de falta.

QUÉ NO LE CUENTAS AL ENTRENADOR
- No expliques la base de datos ni tus propias restricciones. Nada de "no se registran eventos en los datos crudos suministrados", "no hay dato equivalente explícito", "según el resumen de zonas" o "no se debe inferir causalidad por proximidad temporal".
- Si falta información relevante, dilo en una frase normal: "No hay información suficiente para valorar este aspecto." Y si ese punto no aporta nada al cuerpo técnico, mejor omítelo.

REGLAS DE RAZONAMIENTO (gobiernan tu análisis; NO las cites en el informe)
- El resumen determinista y el contexto táctico son la fuente factual de toda métrica ya calculada. No la recalcules a partir de los eventos ni la contradigas.
- No inventes estadísticas: ni posesión, xG, distancias, velocidades, intervalos de cinco minutos, ni ninguna métrica ausente.
- No uses conceptos tácticos que los datos no sostengan. Presión alta, defensa zonal o individual, sistemas 3-1 / 4-0 / 2-2, bloque alto o bajo, superioridades, coberturas, asistencias, posesiones, transiciones o segundo palo solo pueden aparecer si hay evidencia registrada que los respalde. Portero-jugador, únicamente si consta.
- No infieras secuencias ni relaciones causales que no estén registradas. NUNCA encadenes una falta, un córner, una reanudación y un remate por cercanía temporal o por su orden en la lista.
- La ausencia de un registro no es un cero observado ni prueba de que algo no ocurriera.
- Los sectores están normalizados a la perspectiva del equipo que ejecuta la acción: un sector del rival está dicho desde SU punto de vista.
- Un córner ejecutado directamente a portería y un remate declarado procedente de un córner son dos registros independientes: no los sumes ni hagas que uno implique al otro.
- La falta cometida, la falta puesta en juego y el remate de falta son tres cosas distintas y separadas.
- Los datos de portería del contexto táctico son la única fuente válida sobre el portero.
- Toda propuesta debe apoyarse en evidencia concreta. Si no la hay, no la incluyas.

MUESTRAS PEQUEÑAS
Con pocas acciones registradas, no conviertas un porcentaje en una tendencia. Con dos remates no se habla de "efectividad del 100%": se dice que las dos finalizaciones registradas fueron a portería y que la muestra es demasiado pequeña para hablar de tendencia. No hagas recomendaciones fuertes apoyadas en una o dos acciones.`;

export function buildPrompt(
  matchDataStr: string,
  deterministicReportStr: string,
  tacticalContextStr: string,
): string {
  return `Redacta el informe TACTICAL PRO de este partido, en Markdown, para el entrenador y su cuerpo técnico.

Trabajas con tres fuentes:
1. RESUMEN DETERMINISTA: métricas ya calculadas por la aplicación. Es la referencia para cantidades, porcentajes, marcador, tiempos y rotaciones.
2. CONTEXTO TÁCTICO: portería y espacio, también calculados por la aplicación, más un glosario que define términos que se parecen entre sí y significan cosas distintas. Léelo antes que nada.
3. DATOS DEL PARTIDO: acciones y estado. Solo para contextualizar; nunca para recalcular una métrica que ya venga en las dos primeras.

Todo eso es material de trabajo tuyo. El informe que escribes no menciona esas fuentes ni sus nombres de campo: habla de fútbol.

Estructura:

# INFORME TACTICAL PRO

## 1. Lectura del partido
Uno a tres párrafos de síntesis táctica: qué caracterizó el partido y qué datos lo explican mejor.

## 2. Con balón
Producción ofensiva, finalización, sectores y carriles desde los que se generó peligro, y pérdidas relevantes. El balón parado solo si aporta algo.

## 3. Sin balón
Recuperación, protección de la propia portería, zonas donde el rival generó amenaza y situaciones defensivas observables.

## 4. Portería
Paradas, goles encajados, salidas y, cuando sea relevante, el tipo de intervención y a qué distancia de la portería se produjo. Lectura táctica, en lenguaje de fútbol.

## 5. Claves para el cuerpo técnico
Entre tres y cinco conclusiones. Cada una en tres pasos y en este orden: el hallazgo, la evidencia que lo sostiene y la implicación para el equipo.

## 6. Propuestas de trabajo
Entre dos y cuatro prioridades concretas de entrenamiento o preparación.

No hace falta rellenar todas las subsecciones: si los datos no permiten una conclusión útil sobre algo, omítelo. Un informe más corto y sostenido vale más que uno largo y especulativo.

CONTEXTO TÁCTICO (incluye el glosario; léelo primero):
${tacticalContextStr}

RESUMEN DETERMINISTA:
${deterministicReportStr}

DATOS DEL PARTIDO:
${matchDataStr}
`;
}

/**
 * Presupuesto de salida, compartido por las DOS ramas.
 *
 * Claude Sonnet 5 razona por defecto —omitir `thinking` ejecuta el modo
 * adaptativo— y los tokens de razonamiento cuentan contra este presupuesto.
 * Con 4096 la ejecución real `6ufrlr` se lo gastó entero pensando:
 *
 *   stopReason=max_tokens  outputTokens=4096  thinkingTokens=4096  deltas=0
 *
 * 47 segundos de generación y ni una palabra de informe. Se restauran los
 * 8192 que este endpoint tuvo originalmente y que un commit anterior había
 * reducido a la mitad en el mismo cambio que agrandó el prompt.
 *
 * Es una constante y no dos literales a propósito: si cada rama llevara el
 * suyo, la de streaming y la JSON podrían divergir sin que nadie lo notara,
 * que es justo el patrón que llevamos toda la Fase 6 eliminando.
 */
export const MAX_OUTPUT_TOKENS = 8192;

/**
 * Profundidad del razonamiento, compartida por las DOS ramas.
 *
 * Subir el presupuesto a 8192 no bastó: la generación siguió pensando hasta
 * chocar con el límite de 60 s de Netlify, sin emitir un solo `text_delta`.
 * Darle más techo a un razonamiento que no se detiene solo alarga la espera.
 *
 * `effort` es la palanca que regula cuánto piensa el modelo antes de escribir.
 * `high` es el valor por defecto cuando se omite; se baja un escalón, a
 * `medium`, que es exactamente el cambio de una variable.
 *
 * NO se desactiva el razonamiento. `thinking` se sigue omitiendo, y omitirlo
 * es lo que deja corriendo el modo adaptativo en Claude Sonnet 5: pedir
 * `{type:"disabled"}` sería otra cosa, y no es lo que queremos.
 *
 * Verificado contra el SDK instalado (0.121.0):
 *   MessageCreateParamsBase.output_config?: OutputConfig
 *   OutputConfig.effort?: 'low'|'medium'|'high'|'xhigh'|'max'|null
 */
export const TACTICAL_PRO_EFFORT = "medium" as const;

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
  /** Motivo de cierre que declaró Anthropic, o `unknown` si no llegó. */
  readonly stopReason: string;
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

    get stopReason() {
      return typeof stopReason === "string" ? stopReason : "unknown";
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
        if (fragmentos === 0) {
          // Un informe vacío NO es un informe. Terminar aquí con `done` haría
          // que el cliente resolviera con una cadena vacía y la guardara en el
          // partido como análisis bueno: un fallo silencioso que después se
          // exportaría a PDF sin que nadie supiera que nunca hubo texto.
          //
          // Se reutiliza el error del propio protocolo; no hay un tercer caso.
          // El motivo es un enum técnico de la API, no contenido.
          push({
            error:
              "El modelo terminó sin producir texto (stop_reason: " +
              censo.stopReason +
              "). El informe determinista sigue disponible.",
          });
          diag?.mark("stream-empty", { stopReason: censo.stopReason });
        } else {
          // Única señal de que el informe está entero. Va después del bucle a
          // propósito: si el bucle lanza, no se llega aquí.
          push({ done: true });
          diag?.mark("stream-complete", { deltas: fragmentos });
        }
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
    max_tokens: MAX_OUTPUT_TOKENS,
    output_config: { effort: TACTICAL_PRO_EFFORT },
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
    // Enum de la API, no contenido.
    effort: requestParams.output_config.effort,
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
