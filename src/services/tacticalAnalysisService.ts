import { MatchData } from '../types/futsal';
import { buildTacticalProPayload } from './tacticalProPayload';

// ── SANEAMIENTO DE SURROGATES HUÉRFANOS ────────────────────────────────
// Si un campo de texto libre (nombre de equipo/jugador) contiene un surrogate
// UTF-16 sin pareja —típicamente un emoji cortado a mitad al pegar texto, o un
// fallo de autocorrección del teclado— el JSON de JSON.stringify() sigue siendo
// válido (los surrogates sueltos se permiten como \uXXXX), PERO al codificar
// ese string a UTF-8 para el body de fetch(), Safari/WebKit en iOS lanza
// "TypeError: The string did not match the expected pattern." Es un error
// nativo del motor, no de esta app ni del SDK: Chrome/V8 no lo lanza con el
// mismo string, y la app corre principalmente como PWA en iPhone. Se sustituye
// el surrogate huérfano por U+FFFD sin tocar el resto de la cadena.
const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const stripLoneSurrogates = (str: string): string =>
  str.replace(LONE_SURROGATE_RE, "�");

const NDJSON_CONTENT_TYPE = 'application/x-ndjson';

/** Sin un primer fragmento en este tiempo, la cadena no ha arrancado. */
export const FIRST_CHUNK_TIMEOUT_MS = 25_000;
/** Empezó y se quedó colgado a mitad. */
export const IDLE_TIMEOUT_MS = 20_000;

/** Error de un informe que empezó a llegar y no terminó. Nunca se guarda. */
export class IncompleteReportError extends Error {
  /** Lo que sí llegó, para poder mostrarlo marcado como incompleto. */
  readonly partial: string;
  constructor(message: string, partial: string) {
    super(message);
    this.name = 'IncompleteReportError';
    this.partial = partial;
  }
}

function abortError(message: string): Error {
  const e = new Error(message);
  e.name = 'AbortError';
  return e;
}

const payloadBody = (matchData: MatchData): string =>
  stripLoneSurrogates(JSON.stringify(buildTacticalProPayload(matchData)));

/**
 * Informe de TACTICAL PRO en una sola respuesta.
 *
 * Se conserva para consumidores que no quieren texto incremental. La ruta viva
 * de las dos pantallas postpartido es `streamTacticalReport`.
 */
export async function generateTacticalReport(matchData: MatchData): Promise<string> {
  const res = await fetch('/api/tactical-pro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payloadBody(matchData),
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

export type StreamTacticalReportOptions = {
  /** Se llama con cada fragmento, en orden. Concatenarlos da el informe. */
  onDelta?: (text: string) => void;
  /** Cancelación del consumidor: cerrar el modal, desmontar, reintentar. */
  signal?: AbortSignal;
};

/**
 * Informe de TACTICAL PRO en fragmentos.
 *
 * ÚNICA implementación cliente del protocolo: la usan MatchTracker y
 * MatchAnalysis. Dos parsers del mismo stream volverían a divergir.
 *
 * SOLO RESUELVE CON EL INFORME ENTERO
 * -----------------------------------
 * La promesa se resuelve si y solo si llega `{"done":true}`. Un stream que
 * acaba sin él —corte de red, la función agotó los 60 s de Netlify, el proceso
 * murió— rechaza con `IncompleteReportError` llevando lo recibido dentro. Es
 * lo que permite enseñar el trozo marcándolo como incompleto sin guardarlo
 * nunca como informe del partido.
 *
 * Este servicio no persiste nada: decidir qué se guarda es de la pantalla.
 *
 * DOS RELOJES, NINGUNO PARA "TERMINAR"
 * ------------------------------------
 * No hay límite para que el informe termine: ese techo lo pone Netlify (60 s).
 * Lo que se vigila es que la cadena arranque y que no se quede muda. Cada
 * fragmento válido reinicia el reloj de inactividad.
 */
export async function streamTacticalReport(
  matchData: MatchData,
  options: StreamTacticalReportOptions = {},
): Promise<string> {
  const { onDelta, signal } = options;

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let watchdogReason: string | null = null;

  const clearWatchdog = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const armWatchdog = (ms: number, reason: string) => {
    clearWatchdog();
    timer = setTimeout(() => {
      watchdogReason = reason;
      controller.abort();
    }, ms);
  };

  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) throw abortError('Análisis cancelado');
    signal.addEventListener('abort', onExternalAbort);
  }

  // Un solo sitio donde se sueltan reloj y listener, pase lo que pase:
  // éxito, error, timeout, cancelación del usuario o desmontaje.
  const cleanup = () => {
    clearWatchdog();
    if (signal) signal.removeEventListener('abort', onExternalAbort);
  };

  let received = '';

  try {
    armWatchdog(FIRST_CHUNK_TIMEOUT_MS, 'primer fragmento');

    const res = await fetch('/api/tactical-pro', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: NDJSON_CONTENT_TYPE,
      },
      body: payloadBody(matchData),
      signal: controller.signal,
    });

    if (!res.ok) {
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        // Un error HTML/proxy no debe ocultar el status real.
      }
      throw new Error(data?.error || `Error del servidor: ${res.status}`);
    }

    if (!res.body) {
      throw new Error('El servidor no devolvió un cuerpo legible');
    }

    const reader = res.body.getReader();
    // `stream: true` es lo que impide que un carácter multibyte partido entre
    // dos chunks —una "á", una "ó", un emoji— salga como "".
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let done = false;

    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let chunk: any;
      try {
        chunk = JSON.parse(trimmed);
      } catch {
        // Una línea ilegible no invalida el informe: se ignora y se sigue.
        return;
      }
      if (typeof chunk?.t === 'string' && chunk.t.length > 0) {
        received += chunk.t;
        armWatchdog(IDLE_TIMEOUT_MS, 'inactividad');
        onDelta?.(chunk.t);
        return;
      }
      if (chunk?.error) {
        throw new IncompleteReportError(String(chunk.error), received);
      }
      if (chunk?.done === true) {
        done = true;
      }
    };

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { value, done: finished } = await reader.read();
      if (finished) break;
      buffer += decoder.decode(value, { stream: true });
      // El corte de un chunk no respeta los saltos de línea: lo que queda tras
      // el último `\n` es una línea a medias y espera al siguiente chunk.
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) handleLine(line);
    }
    buffer += decoder.decode();
    if (buffer) handleLine(buffer);

    if (!done) {
      throw new IncompleteReportError(
        'El informe se interrumpió antes de terminar',
        received,
      );
    }

    return received;
  } catch (error: any) {
    // Cortar la conexión dispara el `cancel()` del ReadableStream en la
    // función, que a su vez aborta la generación en Anthropic. Sin esto, un
    // error del cliente dejaría al modelo escribiendo para nadie.
    controller.abort();
    if (watchdogReason !== null) {
      throw abortError(
        watchdogReason === 'primer fragmento'
          ? 'TACTICAL PRO no respondió a tiempo'
          : 'TACTICAL PRO dejó de responder a mitad del informe',
      );
    }
    if (error?.name === 'AbortError') throw error;
    if (error instanceof IncompleteReportError) throw error;
    throw error;
  } finally {
    cleanup();
  }
}
