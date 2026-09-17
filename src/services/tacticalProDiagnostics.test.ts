/**
 * Instrumentación temporal de TACTICAL PRO (Fase 6, paso 2H).
 *
 * Dos cosas que fijar, y ninguna es "que los logs salgan bonitos":
 *
 *   1. Que instrumentar NO cambie el protocolo. Un `t` de más, un `done`
 *      perdido o una línea extra convertirían el diagnóstico en la causa del
 *      problema que intenta medir.
 *   2. Que NO se escape contenido. Estos logs van a un panel con nombres de
 *      jugadores, eventos y un informe entero a un `console.log` de distancia.
 *      Aquí se comprueba que solo salen instantes y tamaños.
 *
 * Nunca se llama a Anthropic: el SDK está simulado.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const stream = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create, stream };
    constructor(_opts: any) {}
  },
}));

import handler, {
  NDJSON_CONTENT_TYPE,
  createDiagnostics,
  ndjsonStreamFrom,
  utf8Bytes,
} from "../../netlify/functions/tactical-pro.mts";

const textDelta = (text: string) => ({
  type: "content_block_delta",
  index: 0,
  delta: { type: "text_delta", text },
});

function fakeStream(events: any[], opts: { throwAt?: number; error?: any } = {}) {
  return {
    abort: vi.fn(),
    async *[Symbol.asyncIterator]() {
      for (let i = 0; i < events.length; i++) {
        if (opts.throwAt === i) throw opts.error ?? new Error("boom");
        yield events[i];
      }
      if (opts.throwAt === events.length) throw opts.error ?? new Error("boom");
    },
  };
}

/** Un partido con datos que NO pueden acabar en un log. */
const SECRETOS = {
  matchData: {
    teamName: "C.D. Nombre Real",
    players: [{ id: "p1", name: "Jugador Identificable", number: 7 }],
    events: [{ id: "e1", type: "SHOT", originGrid: "Z3C" }],
    teamLogo: "data:image/png;base64,SECRETO",
  },
  deterministicReport: { score: { team: 3, opponent: 1 } },
  tacticalContext: { glossary: ["Z1-Z4 …"], goalkeepers: [], zones: {} },
};

const req = (headers: Record<string, string> = {}) =>
  new Request("https://x.test/api/tactical-pro", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(SECRETOS),
  });

const NDJSON = { Accept: NDJSON_CONTENT_TYPE };

async function lineas(res: Response) {
  return (await res.text()).split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
}

let logs: string[];

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  create.mockReset();
  stream.mockReset();
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...a: any[]) => { logs.push(a.join(" ")); });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  vi.restoreAllMocks();
});

describe("formato del marcador", () => {
  it("lleva el prefijo, un id corto y un tiempo monotónico en ms", () => {
    const salida: string[] = [];
    let t = 1000;
    const diag = createDiagnostics((l) => salida.push(l), () => t);
    diag.mark("request-start");
    t = 1234.6;
    diag.mark("first-text-delta", { deltas: 3 });

    expect(salida[0]).toMatch(/^\[TACTICAL-PRO [a-z0-9]{1,6}\] \+0ms request-start$/);
    expect(salida[1]).toMatch(/^\[TACTICAL-PRO [a-z0-9]{1,6}\] \+235ms first-text-delta deltas=3$/);
  });

  it("todas las marcas de una invocación comparten id", () => {
    const salida: string[] = [];
    const diag = createDiagnostics((l) => salida.push(l), () => 0);
    diag.mark("a");
    diag.mark("b");
    const id = (l: string) => l.match(/\[TACTICAL-PRO (\S+)\]/)![1];
    expect(id(salida[0])).toBe(id(salida[1]));
    expect(id(salida[0])).toBe(diag.id);
  });

  it("dos invocaciones no comparten id", () => {
    const a = createDiagnostics(() => {}, () => 0);
    const b = createDiagnostics(() => {}, () => 0);
    expect(a.id).not.toBe(b.id);
  });

  it("utf8Bytes mide bytes, no caracteres", () => {
    expect(utf8Bytes("abc")).toBe(3);
    expect(utf8Bytes("á")).toBe(2);
    expect(utf8Bytes("🥅")).toBe(4);
  });
});

describe("no altera el protocolo NDJSON", () => {
  it("la salida es exactamente la misma con y sin instrumentación", async () => {
    const eventos = [textDelta("uno"), { type: "ping" }, textDelta("dos")];
    const conDiag = await new Response(
      ndjsonStreamFrom(fakeStream(eventos) as any, createDiagnostics(() => {}, () => 0)),
    ).text();
    const sinDiag = await new Response(ndjsonStreamFrom(fakeStream(eventos) as any)).text();
    expect(conDiag).toBe(sinDiag);
    expect(conDiag).toBe('{"t":"uno"}\n{"t":"dos"}\n{"done":true}\n');
  });

  it("no introduce ningún t artificial ni keepalive", async () => {
    stream.mockReturnValue(fakeStream([textDelta("solo esto")]));
    const ls = await lineas(await handler(req(NDJSON), {} as any));
    expect(ls.filter((l) => l.t)).toEqual([{ t: "solo esto" }]);
    expect(ls).toHaveLength(2);
  });

  it("done sigue apareciendo una vez y al final", async () => {
    stream.mockReturnValue(fakeStream([textDelta("a"), textDelta("b")]));
    const ls = await lineas(await handler(req(NDJSON), {} as any));
    expect(ls.filter((l) => l.done === true)).toHaveLength(1);
    expect(ls[ls.length - 1]).toEqual({ done: true });
  });

  it("error sigue sin ir acompañado de done", async () => {
    stream.mockReturnValue(fakeStream([textDelta("a")], { throwAt: 1, error: new Error("Overloaded") }));
    const ls = await lineas(await handler(req(NDJSON), {} as any));
    expect(ls).toEqual([{ t: "a" }, { error: "Overloaded" }]);
  });

  it("la rama JSON sigue devolviendo { analysis }", async () => {
    create.mockResolvedValue({ content: [{ type: "text", text: "# Informe" }] });
    const res = await handler(req(), {} as any);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(await res.json()).toEqual({ analysis: "# Informe" });
  });
});

describe("hitos registrados", () => {
  it("cubre el recorrido completo de la rama de streaming", async () => {
    stream.mockReturnValue(fakeStream([{ type: "message_start" }, textDelta("hola")]));
    await (await handler(req(NDJSON), {} as any)).text();
    const eventos = logs.map((l) => l.split("ms ")[1]?.split(" ")[0]);
    expect(eventos).toEqual([
      "request-start",
      "request-validated",
      "prompt-ready",
      "ndjson-selected",
      "anthropic-stream-created",
      "first-anthropic-event",
      "first-text-delta",
      "first-enqueue",
      "stream-complete",
    ]);
  });

  it("separa el primer evento del primer texto", async () => {
    // message_start y ping llegan antes que cualquier texto: es exactamente la
    // distinción que permite saber si Anthropic conectó y luego tardó.
    stream.mockReturnValue(
      fakeStream([{ type: "message_start" }, { type: "ping" }, textDelta("x")]),
    );
    await (await handler(req(NDJSON), {} as any)).text();
    expect(logs.find((l) => l.includes("first-anthropic-event"))).toContain("type=message_start");
    expect(logs.filter((l) => l.includes("first-text-delta"))).toHaveLength(1);
  });

  it("solo marca el PRIMER delta, no cada token", async () => {
    stream.mockReturnValue(fakeStream(Array.from({ length: 50 }, (_, i) => textDelta(`t${i}`))));
    await (await handler(req(NDJSON), {} as any)).text();
    expect(logs.filter((l) => l.includes("first-text-delta"))).toHaveLength(1);
    expect(logs.filter((l) => l.includes("first-enqueue"))).toHaveLength(1);
    expect(logs.find((l) => l.includes("stream-complete"))).toContain("deltas=50");
  });

  it("registra el tipo del error, y cuántos fragmentos habían salido", async () => {
    stream.mockReturnValue(
      fakeStream([textDelta("a")], { throwAt: 1, error: Object.assign(new Error("Overloaded"), { name: "APIError" }) }),
    );
    await (await handler(req(NDJSON), {} as any)).text();
    const linea = logs.find((l) => l.includes("stream-error"))!;
    expect(linea).toContain("type=APIError");
    expect(linea).toContain("deltas=1");
  });

  it("registra la cancelación antes de abortar", async () => {
    const falso = fakeStream([textDelta("a")]);
    const diag = createDiagnostics((l) => logs.push(l), () => 0);
    const readable = ndjsonStreamFrom(falso as any, diag);
    await readable.cancel();
    expect(logs.some((l) => l.includes("stream-cancelled"))).toBe(true);
    expect(falso.abort).toHaveBeenCalledTimes(1);
  });

  it("registra tamaños, no contenido", async () => {
    stream.mockReturnValue(fakeStream([textDelta("x")]));
    await (await handler(req(NDJSON), {} as any)).text();
    const listo = logs.find((l) => l.includes("prompt-ready"))!;
    for (const campo of [
      "matchDataBytes=", "deterministicReportBytes=", "tacticalContextBytes=",
      "systemChars=", "userPromptChars=", "userPromptBytes=", "maxTokens=", "model=",
    ]) {
      expect(listo).toContain(campo);
    }
    expect(logs.find((l) => l.includes("request-validated"))).toMatch(/bodyBytes=\d+/);
  });

  it("no inventa un recuento de tokens", () => {
    // El SDK instalado no trae tokenizador local; contarlos exigiría una
    // llamada a la API. Preferimos no dar una cifra a dar una inventada.
    expect(logs.join("\n")).not.toMatch(/tokens=/);
  });
});

describe("nada de contenido en los logs", () => {
  const prohibido = [
    "C.D. Nombre Real", "Jugador Identificable", "data:image", "SECRETO",
    "Z3C", "test-key", "analista táctico", "GLOSARIO", "Redacta un informe",
  ];

  it("ni en una ejecución correcta", async () => {
    stream.mockReturnValue(fakeStream([textDelta("Texto del informe generado")]));
    await (await handler(req(NDJSON), {} as any)).text();
    const todo = logs.join("\n");
    for (const s of [...prohibido, "Texto del informe generado"]) {
      expect(todo).not.toContain(s);
    }
  });

  it("ni cuando falla: se registra el nombre del error, nunca su mensaje", async () => {
    stream.mockReturnValue(
      fakeStream([], {
        throwAt: 0,
        error: Object.assign(new Error("fallo con C.D. Nombre Real dentro"), { name: "APIError" }),
      }),
    );
    await (await handler(req(NDJSON), {} as any)).text();
    const todo = logs.join("\n");
    expect(todo).toContain("type=APIError");
    expect(todo).not.toContain("C.D. Nombre Real");
  });

  it("ni en la rama JSON", async () => {
    create.mockResolvedValue({ content: [{ type: "text", text: "Informe con nombres" }] });
    await handler(req(), {} as any);
    const todo = logs.join("\n");
    expect(todo).toContain("json-selected");
    for (const s of [...prohibido, "Informe con nombres"]) {
      expect(todo).not.toContain(s);
    }
  });

  it("el cuerpo de un log es siempre clave=valor sin espacios en el valor", async () => {
    stream.mockReturnValue(fakeStream([textDelta("x")]));
    await (await handler(req(NDJSON), {} as any)).text();
    for (const linea of logs) {
      const resto = linea.replace(/^\[TACTICAL-PRO \S+\] \+\d+ms \S+/, "").trim();
      if (!resto) continue;
      for (const par of resto.split(" ")) expect(par).toMatch(/^[a-zA-Z]+=[^\s]+$/);
    }
  });
});
