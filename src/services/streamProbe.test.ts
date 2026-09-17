/**
 * Sonda de streaming (temporal, Fase 6 paso 2G).
 *
 * Estos tests no miden el transporte —eso solo se puede medir contra Netlify,
 * y es justamente el experimento—. Comprueban que la sonda dice la verdad: que
 * emite los cuatro mensajes en orden, que el `Content-Type` corresponde al
 * formato pedido, que devuelve el `Accept` que realmente recibió y que no
 * toca nada del dominio ni de Anthropic. Una sonda que mintiera sería peor
 * que no tenerla.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import handler, {
  PROBE_CONTENT_TYPE,
  PROBE_STEP_MS,
  probeEncode,
  probeFramingOf,
  probeMessages,
  probeStream,
} from "../../netlify/functions/stream-probe.mts";

/** Lee el stream entero sin esperar los 6 s reales. */
async function leer(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
  }
  return out + dec.decode();
}

const sinEsperar = async () => {};

const pedir = (url: string, accept?: string) =>
  new Request(url, { headers: accept ? { Accept: accept } : {} });

describe("formato pedido por query", () => {
  it("ndjson por defecto y ante un valor desconocido", () => {
    expect(probeFramingOf("https://x.test/api/stream-probe")).toBe("ndjson");
    expect(probeFramingOf("https://x.test/api/stream-probe?ct=lo-que-sea")).toBe("ndjson");
    expect(probeFramingOf("https://x.test/api/stream-probe?ct=ndjson")).toBe("ndjson");
  });

  it("sse y text cuando se piden", () => {
    expect(probeFramingOf("https://x.test/p?ct=sse")).toBe("sse");
    expect(probeFramingOf("https://x.test/p?ct=text")).toBe("text");
  });

  it("cada formato tiene su Content-Type", () => {
    expect(PROBE_CONTENT_TYPE.ndjson).toBe("application/x-ndjson");
    expect(PROBE_CONTENT_TYPE.sse).toBe("text/event-stream");
    expect(PROBE_CONTENT_TYPE.text).toBe("text/plain; charset=utf-8");
  });

  it("el handler devuelve el Content-Type del formato pedido", async () => {
    for (const [ct, esperado] of Object.entries(PROBE_CONTENT_TYPE)) {
      const res = await handler(pedir(`https://x.test/api/stream-probe?ct=${ct}`));
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe(esperado);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      await res.body!.cancel();
    }
  });
});

describe("los cuatro mensajes", () => {
  it("salen en orden: inicial, chunk-1, chunk-2, done", async () => {
    const texto = await leer(probeStream("application/x-ndjson", "ndjson", sinEsperar));
    const lineas = texto.split("\n").filter(Boolean).map((l) => JSON.parse(l));
    expect(lineas).toHaveLength(4);
    expect(lineas[0].probe).toBe("start");
    expect(lineas[1]).toEqual({ t: "chunk-1" });
    expect(lineas[2]).toEqual({ t: "chunk-2" });
    expect(lineas[3]).toEqual({ done: true });
  });

  it("el contenido es el mismo en los tres formatos; solo cambia el envoltorio", () => {
    const base = JSON.stringify(probeMessages("x", "ndjson").slice(1));
    for (const f of ["sse", "text"] as const) {
      expect(JSON.stringify(probeMessages("x", f).slice(1))).toBe(base);
    }
    expect(probeEncode({ t: "chunk-1" }, "ndjson")).toBe('{"t":"chunk-1"}\n');
    expect(probeEncode({ t: "chunk-1" }, "text")).toBe('{"t":"chunk-1"}\n');
    expect(probeEncode({ t: "chunk-1" }, "sse")).toBe('data: {"t":"chunk-1"}\n\n');
  });

  it("SSE separa los eventos con línea en blanco y no inventa keepalives", async () => {
    const texto = await leer(probeStream(null, "sse", sinEsperar));
    expect(texto.split("\n\n").filter(Boolean)).toHaveLength(4);
    expect(texto).not.toContain(":keepalive");
    expect(texto).not.toContain(": ping");
  });

  it("el patrón temporal es 0 · 2 · 4 · 6 segundos", async () => {
    expect(PROBE_STEP_MS).toBe(2_000);
    const esperas: number[] = [];
    await leer(probeStream(null, "ndjson", async (ms) => { esperas.push(ms); }));
    // El primero sale ya; los otros tres esperan un paso cada uno.
    expect(esperas).toEqual([2_000, 2_000, 2_000]);
  });
});

describe("Accept reflejado", () => {
  it("devuelve exactamente la cabecera que recibió, y ya en el primer chunk", async () => {
    const res = await handler(pedir("https://x.test/api/stream-probe", "application/x-ndjson"));
    const reader = res.body!.getReader();
    // Sin esperar los 6 s: la línea inicial sale antes del primer retardo, que
    // es justamente lo que la sonda quiere demostrar contra Netlify.
    const { value } = await reader.read();
    await reader.cancel();
    const primera = JSON.parse(new TextDecoder().decode(value).split("\n")[0]);
    expect(primera.accept).toBe("application/x-ndjson");
    expect(primera.acceptPresent).toBe(true);
  });

  it("distingue 'no llegó ninguna' de 'llegó otra'", async () => {
    expect(probeMessages(null, "ndjson")[0]).toMatchObject({ accept: null, acceptPresent: false });
    expect(probeMessages("*/*", "ndjson")[0]).toMatchObject({ accept: "*/*", acceptPresent: true });
  });

  it("no normaliza ni interpreta el valor: lo devuelve tal cual", () => {
    const raro = "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8";
    expect(probeMessages(raro, "ndjson")[0]).toMatchObject({ accept: raro });
  });
});

describe("aislamiento", () => {
  const fuente = readFileSync(
    path.resolve(__dirname, "../../netlify/functions/stream-probe.mts"),
    "utf-8",
  );
  // Los comentarios SÍ nombran a Anthropic —explican por qué existe la sonda—.
  // Lo que no puede haber es una sola línea de código que lo toque.
  const codigo = fuente
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("no importa nada: ni Anthropic, ni el dominio, ni el SDK", () => {
    expect(codigo.toLowerCase()).not.toContain("anthropic");
    expect(codigo).not.toMatch(/^import /m);
    expect(codigo).not.toContain("process.env");
    expect(codigo).not.toContain("fetch(");
  });

  it("no lee partidos ni nada de src/", () => {
    expect(codigo).not.toContain("matchData");
    expect(codigo).not.toContain("../../src");
    expect(codigo).not.toContain("buildTacticalProPayload");
  });

  it("está marcada como temporal, para que nadie la dé por infraestructura", () => {
    expect(fuente).toContain("TEMPORAL");
    expect(fuente).toMatch(/SE BORRA/);
  });
});
