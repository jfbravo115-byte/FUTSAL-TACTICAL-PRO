/**
 * Protocolo incremental de TACTICAL PRO, lado cliente.
 *
 * Es la ÚNICA implementación del protocolo, y estos tests existen para que siga
 * siéndolo: dos parsers del mismo stream volverían a divergir, que es la avería
 * que llevamos toda la Fase 6 corrigiendo.
 *
 * Lo crítico que se fija:
 *   · la promesa resuelve SOLO con {"done":true} — un EOF sin él es un informe
 *     incompleto, y un informe incompleto no se puede guardar;
 *   · los cortes de chunk no rompen ni los acentos ni las líneas NDJSON;
 *   · los relojes vigilan el arranque y el silencio, no "cuánto tarda", y se
 *     limpian siempre.
 *
 * Nunca se llama a la red: `fetch` está simulado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionType, MatchData, Period, Player, Role } from "../types/futsal";
import { buildTacticalProPayload } from "./tacticalProPayload";
import {
  FIRST_CHUNK_TIMEOUT_MS,
  IDLE_TIMEOUT_MS,
  IncompleteReportError,
  streamTacticalReport,
} from "./tacticalAnalysisService";

function partido(): MatchData {
  const p: Player = {
    id: "p1", number: 7, name: "Juan", role: Role.PLAYER, isOnPitch: true,
    plusMinus: 0, individualTimeSeconds: 600, isOpponent: false,
    stats: {
      goals: 1, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0,
      fouls: 0, yellowCards: 0, redCards: 0, shots: 1, shotsOffTarget: 0,
      saves: 0, conceded: 0,
    },
  };
  return {
    teamName: "Mi Equipo", opponentName: "Rival", period: Period.FINISHED,
    matchClock: 0, isClockRunning: false, fouls: { team: 0, opponent: 0 },
    timeoutsUsed: { team: { period1: false, period2: false }, opponent: { period1: false, period2: false } },
    players: [p],
    events: [{
      id: "e1", timestamp: 0, wallClock: 0, period: Period.FIRST, playerIds: ["p1"],
      type: ActionType.SHOT, gameState: "4vs4" as any, originGrid: "Z3C",
      metadata: { isOpponent: false },
    }],
    teamLogo: "data:image/png;base64,AAAA",
    tacticalAnalysis: "INFORME ANTERIOR QUE NO DEBE VIAJAR",
  };
}

const enc = new TextEncoder();

/** Respuesta NDJSON a partir de trozos de bytes ya cortados como queramos. */
function respuesta(trozos: Uint8Array[], init: ResponseInit = {}) {
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < trozos.length) controller.enqueue(trozos[i++]);
      else controller.close();
    },
  });
  return {
    ok: true,
    status: 200,
    body,
    json: async () => ({}),
    ...init,
  } as any;
}

/** Atajo: una línea NDJSON por trozo. */
const lineas = (objs: any[]) => objs.map((o) => enc.encode(JSON.stringify(o) + "\n"));

const mockFetch = (impl: (...a: any[]) => any) => {
  const f = vi.fn(impl);
  vi.stubGlobal("fetch", f);
  return f;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("petición", () => {
  it("pide NDJSON y manda el payload saneado del builder único", async () => {
    const f = mockFetch(async () => respuesta(lineas([{ t: "ok" }, { done: true }])));
    await streamTacticalReport(partido());

    const [url, init] = f.mock.calls[0];
    expect(url).toBe("/api/tactical-pro");
    expect(init.method).toBe("POST");
    expect(init.headers.Accept).toBe("application/x-ndjson");
    expect(init.headers["Content-Type"]).toBe("application/json");

    // Mismo cuerpo que produce buildTacticalProPayload: sin logo y sin el
    // informe anterior. El saneamiento del Paso 2C sigue en pie.
    const sinSello = (p: any) => {
      const { generatedAt, ...informe } = p.deterministicReport;
      return { ...p, deterministicReport: informe };
    };
    const enviado = JSON.parse(init.body);
    expect(sinSello(enviado)).toEqual(
      sinSello(JSON.parse(JSON.stringify(buildTacticalProPayload(partido())))),
    );
    expect(init.body).not.toContain("data:image");
    expect(init.body).not.toContain("INFORME ANTERIOR");
  });

  it("un status de error se propaga con el mensaje del servidor", async () => {
    mockFetch(async () => ({
      ok: false, status: 502, body: null,
      json: async () => ({ error: "Overloaded" }),
    }));
    await expect(streamTacticalReport(partido())).rejects.toThrow("Overloaded");
  });

  it("una respuesta sin cuerpo legible no se da por buena", async () => {
    mockFetch(async () => ({ ok: true, status: 200, body: null, json: async () => ({}) }));
    await expect(streamTacticalReport(partido())).rejects.toThrow(/cuerpo legible/);
  });
});

describe("lectura del stream", () => {
  it("onDelta recibe los fragmentos en orden y la suma es el resultado", async () => {
    const trozos = ["## 1.", " Lectura", " objetiva\n\nMarcador **2-1**."];
    mockFetch(async () => respuesta(lineas([...trozos.map((t) => ({ t })), { done: true }])));

    const vistos: string[] = [];
    const total = await streamTacticalReport(partido(), { onDelta: (t) => vistos.push(t) });

    expect(vistos).toEqual(trozos);
    expect(total).toBe(trozos.join(""));
    expect(vistos.join("")).toBe(total);
  });

  it("un carácter multibyte partido entre dos chunks no se corrompe", async () => {
    // "análisis táctico 🥅" cortado POR DENTRO de la ñ y del emoji.
    const completo = JSON.stringify({ t: "análisis táctico 🥅" }) + "\n" +
      JSON.stringify({ done: true }) + "\n";
    const bytes = enc.encode(completo);
    const trozos: Uint8Array[] = [];
    // Cortes de 1 byte: garantizan romper todos los multibyte que haya.
    for (let i = 0; i < bytes.length; i += 1) trozos.push(bytes.slice(i, i + 1));
    mockFetch(async () => respuesta(trozos));

    const total = await streamTacticalReport(partido());
    expect(total).toBe("análisis táctico 🥅");
    expect(total).not.toContain("�");
  });

  it("una línea NDJSON partida entre chunks se recompone", async () => {
    const texto = JSON.stringify({ t: "primera mitad" }) + "\n" +
      JSON.stringify({ t: "segunda" }) + "\n" + JSON.stringify({ done: true }) + "\n";
    const bytes = enc.encode(texto);
    // Tres cortes arbitrarios que caen en medio de objetos JSON.
    mockFetch(async () =>
      respuesta([bytes.slice(0, 9), bytes.slice(9, 25), bytes.slice(25, 40), bytes.slice(40)]),
    );
    expect(await streamTacticalReport(partido())).toBe("primera mitadsegunda");
  });

  it("la última línea sin salto final también se procesa", async () => {
    mockFetch(async () =>
      respuesta([enc.encode('{"t":"cola"}\n'), enc.encode('{"done":true}')]),
    );
    expect(await streamTacticalReport(partido())).toBe("cola");
  });

  it("una línea ilegible se ignora sin tirar el informe", async () => {
    mockFetch(async () =>
      respuesta([enc.encode('{"t":"a"}\nbasura no json\n{"t":"b"}\n{"done":true}\n')]),
    );
    expect(await streamTacticalReport(partido())).toBe("ab");
  });
});

describe("finalización", () => {
  it("EOF sin done = informe incompleto = error", async () => {
    mockFetch(async () => respuesta(lineas([{ t: "medio" }, { t: " informe" }])));
    const err = await streamTacticalReport(partido()).catch((e) => e);
    expect(err).toBeInstanceOf(IncompleteReportError);
    expect(err.partial).toBe("medio informe");
  });

  it("una línea error rechaza y conserva lo recibido", async () => {
    const vistos: string[] = [];
    mockFetch(async () =>
      respuesta(lineas([{ t: "uno" }, { t: "dos" }, { error: "Overloaded" }])),
    );
    const err = await streamTacticalReport(partido(), { onDelta: (t) => vistos.push(t) })
      .catch((e) => e);
    expect(err).toBeInstanceOf(IncompleteReportError);
    expect(err.message).toBe("Overloaded");
    expect(err.partial).toBe("unodos");
    expect(vistos).toEqual(["uno", "dos"]);
  });

  it("con done la promesa resuelve el Markdown completo", async () => {
    mockFetch(async () => respuesta(lineas([{ t: "# Informe\n" }, { t: "Cuerpo." }, { done: true }])));
    expect(await streamTacticalReport(partido())).toBe("# Informe\nCuerpo.");
  });
});

describe("cancelación del consumidor", () => {
  it("una señal ya abortada ni siquiera lanza la petición", async () => {
    const f = mockFetch(async () => respuesta(lineas([{ done: true }])));
    const ctrl = new AbortController();
    ctrl.abort();
    const err = await streamTacticalReport(partido(), { signal: ctrl.signal }).catch((e) => e);
    expect(err.name).toBe("AbortError");
    expect(f).not.toHaveBeenCalled();
  });

  it("abortar a mitad rechaza con AbortError, no con un error genérico", async () => {
    const ctrl = new AbortController();
    // Un fetch real corta el cuerpo cuando se aborta la señal; el falso lo imita.
    mockFetch(async (_url: any, init: any) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(enc.encode('{"t":"empieza"}\n'));
          init.signal.addEventListener("abort", () =>
            controller.error(Object.assign(new Error("aborted"), { name: "AbortError" })),
          );
        },
      });
      return { ok: true, status: 200, body, json: async () => ({}) };
    });

    const promesa = streamTacticalReport(partido(), {
      signal: ctrl.signal,
      onDelta: () => ctrl.abort(),
    });
    const err = await promesa.catch((e) => e);
    expect(err.name).toBe("AbortError");
  });
});

describe("relojes", () => {
  it("sin primer fragmento a tiempo, aborta con tiempo de espera agotado", async () => {
    vi.useFakeTimers();
    mockFetch(
      (_url: any, init: any) =>
        new Promise((_res, rej) => {
          init.signal.addEventListener("abort", () => {
            const e = new Error("aborted");
            e.name = "AbortError";
            rej(e);
          });
        }),
    );
    const promesa = streamTacticalReport(partido()).catch((e) => e);
    await vi.advanceTimersByTimeAsync(FIRST_CHUNK_TIMEOUT_MS + 10);
    const err = await promesa;
    expect(err.name).toBe("AbortError");
    expect(err.message).toMatch(/no respondió a tiempo/);
  });

  it("cada fragmento reinicia el reloj de inactividad", async () => {
    vi.useFakeTimers();
    let emitir: ((chunk: string) => void) | null = null;
    let cerrar: (() => void) | null = null;
    mockFetch(async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          emitir = (c: string) => controller.enqueue(enc.encode(c));
          cerrar = () => controller.close();
        },
      });
      return { ok: true, status: 200, body, json: async () => ({}) };
    });

    const promesa = streamTacticalReport(partido());
    // Tres latidos justo por debajo del umbral: si no reiniciara, el segundo
    // ya habría abortado.
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS - 1_000);
      emitir!(`{"t":"${i}"}\n`);
      await vi.advanceTimersByTimeAsync(0);
    }
    emitir!('{"done":true}\n');
    cerrar!();
    await vi.advanceTimersByTimeAsync(0);
    expect(await promesa).toBe("012");
  });

  it("si enmudece a mitad, aborta por inactividad", async () => {
    vi.useFakeTimers();
    mockFetch(async (_url: any, init: any) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(enc.encode('{"t":"empieza"}\n'));
          init.signal.addEventListener("abort", () => controller.error(Object.assign(new Error("a"), { name: "AbortError" })));
        },
      });
      return { ok: true, status: 200, body, json: async () => ({}) };
    });

    const promesa = streamTacticalReport(partido()).catch((e) => e);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(IDLE_TIMEOUT_MS + 10);
    const err = await promesa;
    expect(err.name).toBe("AbortError");
    expect(err.message).toMatch(/dejó de responder a mitad/);
  });

  it("no deja timers huérfanos: ni al terminar bien, ni al fallar, ni al abortar", async () => {
    vi.useFakeTimers();
    const pendientes = () => vi.getTimerCount();

    mockFetch(async () => respuesta(lineas([{ t: "a" }, { done: true }])));
    await streamTacticalReport(partido());
    expect(pendientes()).toBe(0);

    mockFetch(async () => respuesta(lineas([{ t: "a" }, { error: "x" }])));
    await streamTacticalReport(partido()).catch(() => {});
    expect(pendientes()).toBe(0);

    mockFetch(async () => respuesta(lineas([{ t: "a" }])));
    await streamTacticalReport(partido()).catch(() => {});
    expect(pendientes()).toBe(0);
  });
});

describe("un informe vacío nunca es un éxito (paso 2K)", () => {
  it("done sin un solo fragmento NO resuelve: rechaza", async () => {
    // El servidor ya no manda esto, pero la promesa es lo único que separa
    // "no hubo informe" de "se guardó una cadena vacía en el partido".
    mockFetch(async () => respuesta(lineas([{ done: true }])));
    const err = await streamTacticalReport(partido()).catch((e) => e);
    expect(err).toBeInstanceOf(IncompleteReportError);
    expect(err.message).toMatch(/no produjo ningún texto/);
    expect(err.partial).toBe("");
  });

  it("un t vacío seguido de done tampoco cuela", async () => {
    mockFetch(async () => respuesta(lineas([{ t: "" }, { done: true }])));
    await expect(streamTacticalReport(partido())).rejects.toBeInstanceOf(IncompleteReportError);
  });

  it("el error de cero texto del servidor rechaza, no resuelve vacío", async () => {
    mockFetch(async () =>
      respuesta(lineas([{ error: "El modelo terminó sin producir texto (stop_reason: max_tokens)." }])),
    );
    const err = await streamTacticalReport(partido()).catch((e) => e);
    expect(err).toBeInstanceOf(IncompleteReportError);
    expect(err.message).toContain("max_tokens");
    expect(err.partial).toBe("");
  });

  it("un informe con texto sí resuelve, como siempre", async () => {
    mockFetch(async () => respuesta(lineas([{ t: "# Informe" }, { done: true }])));
    expect(await streamTacticalReport(partido())).toBe("# Informe");
  });
});
