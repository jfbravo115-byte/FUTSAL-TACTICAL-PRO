/**
 * netlify/functions/stream-probe.mts
 *
 * SONDA DE DIAGNÓSTICO. TEMPORAL.
 * ===============================
 * Existe para responder a UNA pregunta, con una medición y sin gastar una sola
 * llamada de pago: cuando esta función hace `controller.enqueue()`, ¿llega eso
 * al cliente en ese momento, o alguien lo acumula hasta que la función termina?
 *
 * Contexto: el informe de TACTICAL PRO en streaming agota el reloj de 25 s del
 * cliente sin que llegue ni un fragmento. Con buffering el síntoma sería
 * exactamente ese, porque ni las cabeceras salen hasta el final. Pero con la
 * rama no-streaming también lo sería, así que la sonda mide las dos cosas.
 *
 * NO toca Anthropic, ni API keys, ni partidos, ni nada del dominio. Sus únicas
 * dependencias son el reloj y `TextEncoder`.
 *
 * Emite un patrón temporal conocido:
 *
 *   t=0s   línea inicial, que DEVUELVE EL `Accept` QUE LA FUNCIÓN RECIBIÓ
 *   t=2s   chunk-1
 *   t=4s   chunk-2
 *   t=6s   done
 *
 * Si las cuatro líneas llegan escalonadas, hay streaming real. Si llegan
 * juntas a los ~6 s, hay buffering. `time_starttransfer` es el discriminante
 * limpio: con buffering se pega a `time_total`.
 *
 * El `Accept` devuelto responde de paso a la otra hipótesis: si la cabecera no
 * sobrevive al rewrite `/api/*`, `wantsNdjson()` habría dado `false` en
 * producción y la petición real se fue por la rama bloqueante de siempre.
 *
 * SE BORRA cuando el diagnóstico termine. No es infraestructura.
 */

export type ProbeFraming = "ndjson" | "sse" | "text";

export const PROBE_CONTENT_TYPE: Record<ProbeFraming, string> = {
  ndjson: "application/x-ndjson",
  sse: "text/event-stream",
  text: "text/plain; charset=utf-8",
};

/** Retardo entre mensajes. Un patrón holgado se lee a ojo en la terminal. */
export const PROBE_STEP_MS = 2_000;

export function probeFramingOf(url: string): ProbeFraming {
  const ct = new URL(url).searchParams.get("ct");
  return ct === "sse" || ct === "text" ? ct : "ndjson";
}

/**
 * Los cuatro mensajes, idénticos en contenido para los tres formatos: lo que
 * cambia es solo el envoltorio, para que la comparación NDJSON/SSE mida el
 * transporte y no el contenido.
 */
export function probeMessages(accept: string | null, framing: ProbeFraming): unknown[] {
  return [
    {
      probe: "start",
      accept: accept ?? null,
      acceptPresent: accept !== null && accept !== "",
      framing,
      contentType: PROBE_CONTENT_TYPE[framing],
      stepMs: PROBE_STEP_MS,
    },
    { t: "chunk-1" },
    { t: "chunk-2" },
    { done: true },
  ];
}

/** Envoltorio de una línea según el formato pedido. Sin keepalives. */
export function probeEncode(message: unknown, framing: ProbeFraming): string {
  const json = JSON.stringify(message);
  if (framing === "sse") return `data: ${json}\n\n`;
  return `${json}\n`;
}

/**
 * El stream de la sonda. `wait` se inyecta para que los tests no tarden 6 s
 * reales; en producción es el reloj de verdad.
 */
export function probeStream(
  accept: string | null,
  framing: ProbeFraming,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const messages = probeMessages(accept, framing);
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for (let i = 0; i < messages.length; i++) {
          // El primero sale inmediatamente; los demás, cada PROBE_STEP_MS.
          if (i > 0) await wait(PROBE_STEP_MS);
          controller.enqueue(encoder.encode(probeEncode(messages[i], framing)));
        }
      } finally {
        controller.close();
      }
    },
  });
}

export default async (req: Request) => {
  const framing = probeFramingOf(req.url);
  return new Response(probeStream(req.headers.get("accept"), framing), {
    status: 200,
    headers: {
      "Content-Type": PROBE_CONTENT_TYPE[framing],
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
};
