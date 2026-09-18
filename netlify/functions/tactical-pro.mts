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
- GK1 a GK5 son DÓNDE interviene el portero, por profundidad respecto a su portería, y nada más: GK1 bajo palos, GK2 dentro del área a profundidad corta, GK3 dentro del área a profundidad media, GK4 en zona avanzada hasta el límite del área, GK5 fuera del área. Descríbelo con esas palabras.
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

CUATRO ERRORES QUE NO PUEDES COMETER
1. COHERENCIA ARITMÉTICA. No llames iguales, equivalentes, similares ni parejas a dos cifras distintas. "Igualdad en la efectividad de ambos guardametas (67% frente a 50%)" está mal: 67% no es 50%, y entre esas dos cifras hay 17 puntos que hay que nombrar como diferencia. Comprueba cada comparación antes de escribirla. Y no digas que una diferencia estadística explica el resultado del partido salvo que haya evidencia que sostenga esa relación concreta.

2. LA ZONA DEL PORTERO DICE DÓNDE, NO POR QUÉ. Una intervención a profundidad corta dentro del área es eso y solo eso: el lugar donde ocurrió. NO autoriza a decir que el portero estaba adelantado, que achicó, que salió a reducir espacios, que participó activamente fuera de su posición ni que su colocación fue buena o mala. Para afirmar un comportamiento del portero hace falta un dato que lo registre, y la zona no lo es.

3. UN SECTOR NO ES UNA RECETA. Que un remate o un gol aparezca en un sector no demuestra que atacar más por ahí vaya a generar más ocasiones, ni que defender peor por ahí sea la causa de encajar. Con pocas acciones, escribe "conviene revisar en vídeo esas acciones y valorar si existe un mecanismo reproducible", nunca "insistir por ese carril aumentará las ocasiones".

4. UNA PROPUESTA PUEDE PEDIR REVISIÓN; NO PUEDE INVENTAR LA CAUSA. Ante un gol rival en un sector, lo correcto es "revisar en vídeo cómo se desarrolló esa acción y qué permitió la finalización". No introduzcas presión, cierre, cobertura, balance defensivo, marcaje ni estructura defensiva como explicación salvo que haya evidencia registrada que sostenga ese concepto en concreto.
El camino es DATO REGISTRADO, luego PREGUNTA para el cuerpo técnico, luego REVISIÓN O PROPUESTA. Nunca DATO, CAUSA INVENTADA, SOLUCIÓN PRESCRITA.

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

/**
 * TECHO DE GASTO DEL SERVIDOR
 * ===========================
 * El cliente aborta a los 25 s, pero eso no detiene nada al otro lado: está
 * medido que tras el corte del navegador la función siguió generando hasta los
 * 47,5 s, y otra ejecución llegó al tope de Netlify. `ReadableStream.cancel()`
 * nunca se invocó, y el `Context` de Netlify no expone ninguna señal de
 * desconexión, así que el servidor no tiene forma de enterarse de que el
 * usuario se fue.
 *
 * De ahí que el techo tenga que ser suyo y no depender del navegador: estos
 * dos relojes siguen valiendo aunque mañana cambien los del cliente, o aunque
 * el cliente sea otro.
 *
 * LOS NÚMEROS, Y POR QUÉ
 * ----------------------
 * La única finalización válida medida tardó 52,0 s (primer evento a 1,5 s,
 * primer texto a 19,4 s). Netlify corta en seco a los 60 s. 57 s deja margen
 * sobre esa generación válida y aún permite emitir la línea de error y cerrar
 * el stream ordenadamente, que es exactamente lo que a los 60 s ya no se puede.
 *
 * Es un compromiso con UNA muestra: si aparece una generación válida más larga,
 * la cortaremos. Preferimos cortarla nosotros con un error legible.
 *
 * El de inactividad va DELIBERADAMENTE por encima de los 20 s del cliente. No
 * es su relevo: cubre lo que ocurre cuando el cliente ya no está.
 *
 * No hay reloj de servidor para el primer texto: con 19,4 s reales, cualquier
 * umbral prudente quedaría por encima de los 25 s del navegador y no llegaría
 * a dispararse nunca. Ese caso lo cubren el deadline y el presupuesto de 2L.
 */
export const SERVER_DEADLINE_MS = 57_000;
export const SERVER_IDLE_MS = 25_000;

export type CutoffReason = "deadline" | "idle";

export const CUTOFF_MESSAGE: Record<CutoffReason, string> = {
  deadline:
    "La generación se detuvo al alcanzar el límite de tiempo del servidor. " +
    "El informe determinista sigue disponible.",
  idle:
    "La generación se detuvo por falta de actividad. " +
    "El informe determinista sigue disponible.",
};

/** Clase del error, para el log. Nunca su mensaje: puede llevar contenido. */
function errorNameOf(error: any): string {
  return String(error?.name ?? error?.constructor?.name ?? "Error");
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
export function ndjsonStreamFrom(stream: {
  [Symbol.asyncIterator](): AsyncIterator<any>;
  abort: () => void;
}): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  // Estado que start() y cancel() comparten: los relojes hay que poder
  // soltarlos desde los dos lados, y el aborto tiene que ser uno solo.
  let abortado = false;
  let deadline: ReturnType<typeof setTimeout> | null = null;
  let inactividad: ReturnType<typeof setTimeout> | null = null;

  const limpiarRelojes = () => {
    if (deadline !== null) { clearTimeout(deadline); deadline = null; }
    if (inactividad !== null) { clearTimeout(inactividad); inactividad = null; }
  };

  /** Idempotente: dos condiciones de corte no abortan dos veces. */
  const abortar = () => {
    if (abortado) return;
    abortado = true;
    stream.abort();
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      // Dos variables funcionales: cuántos fragmentos de informe han salido
      // —de ello depende si esto termina en `done` o en error— y el motivo de
      // cierre que declaró Anthropic, que va dentro del error.
      let fragmentos = 0;
      let stopReason = "unknown";

      // Y la bandera del techo de gasto. Existe porque NO se puede confiar en
      // que `stream.abort()` haga lanzar al `for await`: el iterador del SDK
      // es una cola, y si el aborto llega mientras procesamos un delta en vez
      // de mientras esperamos el siguiente, el bucle TERMINA LIMPIAMENTE. Sin
      // esta bandera, un informe cortado a medias saldría con `done` y el
      // cliente lo guardaría como bueno: exactamente lo contrario de lo que
      // arreglamos al prohibir el informe vacío.
      let cutoffReason: CutoffReason | null = null;

      let cerrado = false;

      const cortar = (motivo: CutoffReason) => {
        if (cutoffReason !== null) return;
        cutoffReason = motivo;
        limpiarRelojes();
        abortar();
      };

      /** Solo un fragmento de texto REAL rearma el reloj; uno vacío no. */
      const rearmarInactividad = () => {
        if (inactividad !== null) clearTimeout(inactividad);
        inactividad = setTimeout(() => cortar("idle"), SERVER_IDLE_MS);
      };

      // Encolar sobre un stream que el consumidor ya canceló lanza. Que el
      // usuario se haya ido no debe convertirse en una excepción en el log.
      const push = (chunk: TacticalProChunk) => {
        if (cerrado) return;
        try {
          controller.enqueue(encoder.encode(ndjsonLine(chunk)));
        } catch {
          cerrado = true;
        }
      };

      try {
        // Se arma aquí, ya dentro del bucle-listener: abortar antes de que el
        // iterador registre sus manejadores dejaría un rechazo huérfano.
        deadline = setTimeout(() => cortar("deadline"), SERVER_DEADLINE_MS);

        for await (const event of stream) {
          if (cutoffReason !== null) break;
          if (
            event?.type === "message_delta" &&
            typeof event?.delta?.stop_reason === "string"
          ) {
            stopReason = event.delta.stop_reason;
          }
          if (
            event?.type === "content_block_delta" &&
            event?.delta?.type === "text_delta" &&
            typeof event.delta.text === "string" &&
            event.delta.text.length > 0
          ) {
            fragmentos++;
            // El reloj de inactividad nace con el primer texto útil: antes de
            // eso no hay nada que vigilar, y el techo lo pone el deadline.
            rearmarInactividad();
            push({ t: event.delta.text });
          }
        }

        if (cutoffReason !== null) {
          // Da igual si el bucle salió por excepción o limpiamente: si el
          // servidor cortó, esto es un error y nunca un informe.
          push({ error: CUTOFF_MESSAGE[cutoffReason] });
        } else if (fragmentos === 0) {
          // Un informe vacío NO es un informe. Terminar aquí con `done` haría
          // que el cliente resolviera con una cadena vacía y la guardara en el
          // partido como análisis bueno: un fallo silencioso que después se
          // exportaría a PDF sin que nadie supiera que nunca hubo texto.
          push({
            error:
              "El modelo terminó sin producir texto (stop_reason: " +
              stopReason +
              "). El informe determinista sigue disponible.",
          });
        } else {
          // Única señal de que el informe está entero.
          push({ done: true });
        }
      } catch (error: any) {
        // Clase del error, nunca el objeto entero: un mensaje de la API puede
        // arrastrar fragmentos de lo enviado.
        console.error("tactical-pro stream failed:", errorNameOf(error));
        push({
          error: cutoffReason !== null
            ? CUTOFF_MESSAGE[cutoffReason]
            : errorMessageOf(error),
        });
      } finally {
        limpiarRelojes();
        cerrado = true;
        try {
          controller.close();
        } catch {
          // Ya cerrado o cancelado: nada que hacer.
        }
      }
    },

    cancel() {
      // Oportunista, NO el techo de gasto: está medido que Netlify no lo
      // invoca al desconectarse el cliente. Cuesta nada y es lo correcto si
      // algún día lo hace. No se intenta entregar nada: si el consumidor
      // canceló, lo único que importa es parar Anthropic y soltar los relojes.
      limpiarRelojes();
      abortar();
    },
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

  const anthropic = new Anthropic({ apiKey });

  // Negociación de contenido: quien no pida NDJSON recibe exactamente la misma
  // respuesta que antes de este cambio. TacticalBoard depende de ello y no se
  // toca; la compatibilidad es por construcción, no un parche.
  if (wantsNdjson(req)) {
    const stream = anthropic.messages.stream(requestParams);
    return new Response(ndjsonStreamFrom(stream as any), {
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

  try {
    const response = await anthropic.messages.create(requestParams);

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
    console.error("tactical-pro request failed:", errorNameOf(error), error?.status ?? "");
    const status = typeof error?.status === "number" ? error.status : 500;
    const message =
      error?.error?.error?.message ||
      error?.message ||
      "Unknown error occurred";
    return jsonResponse(status >= 400 && status < 600 ? status : 500, { error: message });
  }
};
