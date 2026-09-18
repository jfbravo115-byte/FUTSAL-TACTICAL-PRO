/**
 * Protocolo incremental de TACTICAL PRO, lado servidor.
 *
 * Lo que se fija aquí es que la función tenga DOS entregas y UNA sola verdad:
 * el mismo modelo, el mismo system prompt y el mismo user prompt tanto si la
 * respuesta va en un JSON como si va en fragmentos. La diferencia es cómo se
 * consume la respuesta de Anthropic, nada más.
 *
 * Nunca se llama a Anthropic: el SDK está simulado.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
const stream = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create, stream };
    constructor(_opts: any) {}
  },
}));

import handler, {
  MAX_OUTPUT_TOKENS,
  TACTICAL_PRO_EFFORT,
  NDJSON_CONTENT_TYPE,
  SYSTEM_INSTRUCTION,
  buildPrompt,
  ndjsonLine,
  ndjsonStreamFrom,
  wantsNdjson,
} from "../../netlify/functions/tactical-pro.mts";

/** Un stream de Anthropic falso: async-iterable con `abort`, como el real. */
function fakeStream(events: any[], opts: { throwAt?: number; error?: any; gate?: Promise<void> } = {}) {
  const abort = vi.fn();
  return {
    abort,
    async *[Symbol.asyncIterator]() {
      for (let i = 0; i < events.length; i++) {
        if (opts.gate) await opts.gate;
        if (opts.throwAt === i) throw opts.error ?? new Error("boom");
        yield events[i];
      }
      if (opts.throwAt === events.length) throw opts.error ?? new Error("boom");
    },
  };
}

const textDelta = (text: string) => ({
  type: "content_block_delta",
  index: 0,
  delta: { type: "text_delta", text },
});

const req = (body: any, headers: Record<string, string> = {}) =>
  new Request("https://x.test/api/tactical-pro", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const CUERPO = {
  matchData: { teamName: "A", events: [] },
  deterministicReport: { score: { team: 1, opponent: 0 } },
  tacticalContext: { glossary: ["G"], goalkeepers: [], zones: {} },
};

const NDJSON = { Accept: NDJSON_CONTENT_TYPE };

async function lineas(res: Response): Promise<any[]> {
  const texto = await res.text();
  return texto
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test-key";
  create.mockReset();
  stream.mockReset();
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("negociación de contenido", () => {
  it("sin Accept NDJSON responde el JSON de siempre y NO abre stream", async () => {
    create.mockResolvedValue({ content: [{ type: "text", text: "# Informe" }] });
    const res = await handler(req(CUERPO), {} as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(await res.json()).toEqual({ analysis: "# Informe" });
    expect(stream).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("con Accept NDJSON responde un stream y NO usa la rama bloqueante", async () => {
    stream.mockReturnValue(fakeStream([textDelta("hola")]));
    const res = await handler(req(CUERPO, NDJSON), {} as any);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe(NDJSON_CONTENT_TYPE);
    expect(res.body).toBeInstanceOf(ReadableStream);
    expect(create).not.toHaveBeenCalled();
    expect(stream).toHaveBeenCalledTimes(1);
  });

  it("las dos ramas piden EXACTAMENTE lo mismo al modelo", async () => {
    create.mockResolvedValue({ content: [{ type: "text", text: "x" }] });
    stream.mockReturnValue(fakeStream([textDelta("x")]));
    await handler(req(CUERPO), {} as any);
    const res = await handler(req(CUERPO, NDJSON), {} as any);
    await res.text();

    const a = create.mock.calls[0][0];
    const b = stream.mock.calls[0][0];
    expect(b).toEqual(a);
    expect(a.system).toBe(SYSTEM_INSTRUCTION);
    expect(a.model).toBe("claude-sonnet-5");
    expect(a.messages[0].content).toBe(
      buildPrompt(
        JSON.stringify(CUERPO.matchData),
        JSON.stringify(CUERPO.deterministicReport),
        JSON.stringify(CUERPO.tacticalContext),
      ),
    );
  });

  it("wantsNdjson solo mira la cabecera Accept", () => {
    const con = (accept?: string) => ({ headers: { get: () => accept ?? null } });
    expect(wantsNdjson(con("application/x-ndjson"))).toBe(true);
    expect(wantsNdjson(con("Application/X-NDJSON"))).toBe(true);
    expect(wantsNdjson(con("application/json, application/x-ndjson"))).toBe(true);
    expect(wantsNdjson(con("application/json"))).toBe(false);
    expect(wantsNdjson(con(undefined))).toBe(false);
  });
});

describe("cliente legacy (TacticalBoard)", () => {
  it("una petición como la de la pizarra sigue recibiendo { analysis } parseable", async () => {
    create.mockResolvedValue({ content: [{ type: "text", text: "Análisis de jugada" }] });
    // Exactamente lo que manda TacticalBoard: matchData + prompt, sin Accept.
    const res = await handler(
      req({ matchData: { paths: [], players: [] }, prompt: "Analiza esta jugada" }),
      {} as any,
    );
    expect(res.headers.get("Content-Type")).toBe("application/json");
    const data = await res.json();
    expect(data.analysis).toBe("Análisis de jugada");
    expect(stream).not.toHaveBeenCalled();
  });
});

describe("líneas NDJSON", () => {
  it("cada objeto termina en salto de línea", () => {
    expect(ndjsonLine({ t: "a" })).toBe('{"t":"a"}\n');
    expect(ndjsonLine({ done: true })).toBe('{"done":true}\n');
    expect(ndjsonLine({ error: "x" })).toBe('{"error":"x"}\n');
  });

  it("los text_delta concatenados reproducen el Markdown final", async () => {
    const trozos = ["## 1. Lectura", " objetiva\n\n", "El marcador **2-1**", " confirma…"];
    stream.mockReturnValue(fakeStream(trozos.map(textDelta)));
    const res = await handler(req(CUERPO, NDJSON), {} as any);
    const ls = await lineas(res);
    expect(ls.filter((l) => l.t).map((l) => l.t).join("")).toBe(trozos.join(""));
  });

  it("ignora los eventos que no llevan texto del informe", async () => {
    stream.mockReturnValue(
      fakeStream([
        { type: "message_start", message: { id: "m" } },
        { type: "content_block_start", index: 0 },
        { type: "ping" },
        textDelta("visible"),
        { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "NO" } },
        { type: "content_block_delta", delta: { type: "signature_delta", signature: "NO" } },
        { type: "content_block_delta", delta: { type: "input_json_delta", partial_json: "NO" } },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: "end_turn" } },
        { type: "message_stop" },
      ]),
    );
    const res = await handler(req(CUERPO, NDJSON), {} as any);
    const ls = await lineas(res);
    expect(ls.filter((l) => l.t).map((l) => l.t)).toEqual(["visible"]);
    expect(JSON.stringify(ls)).not.toContain("NO");
  });

  it("done aparece exactamente una vez y al final", async () => {
    stream.mockReturnValue(fakeStream([textDelta("a"), textDelta("b")]));
    const ls = await lineas(await handler(req(CUERPO, NDJSON), {} as any));
    expect(ls.filter((l) => l.done === true)).toHaveLength(1);
    expect(ls[ls.length - 1]).toEqual({ done: true });
  });

  it("comillas, saltos de línea y emoji sobreviven al ida y vuelta", async () => {
    const raro = 'Dijo "presión alta"\n\n- Línea\t· ñ á 🥅 «citado»\\barra';
    stream.mockReturnValue(fakeStream([textDelta(raro)]));
    const ls = await lineas(await handler(req(CUERPO, NDJSON), {} as any));
    expect(ls[0].t).toBe(raro);
  });
});

describe("errores dentro del stream", () => {
  it("error antes del primer delta: una línea error y ningún done", async () => {
    stream.mockReturnValue(fakeStream([textDelta("x")], { throwAt: 0, error: new Error("overloaded_error") }));
    const ls = await lineas(await handler(req(CUERPO, NDJSON), {} as any));
    expect(ls).toEqual([{ error: "overloaded_error" }]);
    expect(ls.some((l) => l.done)).toBe(false);
  });

  it("error después de varios delta: se conservan los t y NO hay done", async () => {
    stream.mockReturnValue(
      fakeStream([textDelta("uno"), textDelta("dos")], { throwAt: 2, error: new Error("se cayó") }),
    );
    const ls = await lineas(await handler(req(CUERPO, NDJSON), {} as any));
    expect(ls.filter((l) => l.t).map((l) => l.t)).toEqual(["uno", "dos"]);
    expect(ls[ls.length - 1]).toEqual({ error: "se cayó" });
    expect(ls.some((l) => l.done)).toBe(false);
  });

  it("usa el mensaje anidado del SDK igual que la rama JSON", async () => {
    stream.mockReturnValue(
      fakeStream([], { throwAt: 0, error: { error: { error: { message: "Overloaded" } } } }),
    );
    const ls = await lineas(await handler(req(CUERPO, NDJSON), {} as any));
    expect(ls).toEqual([{ error: "Overloaded" }]);
  });
});

describe("cancelación", () => {
  it("cancelar la respuesta aborta la generación en Anthropic", async () => {
    let abrir: () => void = () => {};
    const puerta = new Promise<void>((r) => { abrir = r; });
    const falso = fakeStream([textDelta("a"), textDelta("b")], { gate: puerta });

    const readable = ndjsonStreamFrom(falso as any);
    const reader = readable.getReader();
    abrir();
    await reader.read();
    await reader.cancel();

    expect(falso.abort).toHaveBeenCalledTimes(1);
  });

  it("sin cancelar, no se aborta nada", async () => {
    const falso = fakeStream([textDelta("a")]);
    const res = await handler(req(CUERPO, NDJSON), {} as any);
    await res.text();
    expect(falso.abort).not.toHaveBeenCalled();
  });
});

describe("validaciones previas, comunes a las dos ramas", () => {
  it("sin matchData responde 400 aunque pida NDJSON", async () => {
    const res = await handler(req({ deterministicReport: {} }, NDJSON), {} as any);
    expect(res.status).toBe(400);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(stream).not.toHaveBeenCalled();
  });

  it("sin API key responde 500 aunque pida NDJSON", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await handler(req(CUERPO, NDJSON), {} as any);
    expect(res.status).toBe(500);
    expect(stream).not.toHaveBeenCalled();
  });
});

// ── PASO 2K ────────────────────────────────────────────────────────────
//
// La ejecución real `6ufrlr` lo dejó demostrado:
//
//   stopReason=max_tokens  inputTokens=12916  outputTokens=4096
//   thinkingTokens=4096    deltas=0           47,5 s
//
// Sonnet 5 razona por defecto y el razonamiento cuenta contra `max_tokens`.
// Con 4096 el presupuesto se agotaba pensando, antes de escribir una palabra.

const msgDelta = (stop_reason: string) => ({
  type: "message_delta",
  delta: { stop_reason },
  usage: { output_tokens: 8192, output_tokens_details: { thinking_tokens: 8192 } },
});

describe("presupuesto de salida", () => {
  it("son 8192 tokens, restaurando los que tenía el endpoint", () => {
    expect(MAX_OUTPUT_TOKENS).toBe(8192);
  });

  it("LAS DOS ramas usan la misma constante, no dos literales", async () => {
    create.mockResolvedValue({ content: [{ type: "text", text: "x" }] });
    stream.mockReturnValue(fakeStream([textDelta("x")]));
    await handler(req(CUERPO), {} as any);
    await (await handler(req(CUERPO, NDJSON), {} as any)).text();

    const json = create.mock.calls[0][0];
    const incremental = stream.mock.calls[0][0];
    expect(json.max_tokens).toBe(MAX_OUTPUT_TOKENS);
    expect(incremental.max_tokens).toBe(MAX_OUTPUT_TOKENS);
    // Y no solo el presupuesto: la petición entera es la misma.
    expect(incremental).toEqual(json);
  });

  it("el razonamiento sigue ACTIVO: nunca se desactiva explícitamente", async () => {
    stream.mockReturnValue(fakeStream([textDelta("x")]));
    await (await handler(req(CUERPO, NDJSON), {} as any)).text();
    const params = stream.mock.calls[0][0];
    // Omitir `thinking` es lo que deja corriendo el modo adaptativo en
    // Sonnet 5. Pedir {type:"disabled"} sería lo contrario de lo que queremos.
    expect(params.thinking).toBeUndefined();
    expect(JSON.stringify(params)).not.toContain("disabled");
    expect(params.model).toBe("claude-sonnet-5");
  });

  it("el esfuerzo es medium, un escalón por debajo del defecto", async () => {
    stream.mockReturnValue(fakeStream([textDelta("x")]));
    await (await handler(req(CUERPO, NDJSON), {} as any)).text();
    expect(TACTICAL_PRO_EFFORT).toBe("medium");
    expect(stream.mock.calls[0][0].output_config).toEqual({ effort: "medium" });
  });

  it("LAS DOS ramas reciben el mismo esfuerzo, no dos literales", async () => {
    create.mockResolvedValue({ content: [{ type: "text", text: "x" }] });
    stream.mockReturnValue(fakeStream([textDelta("x")]));
    await handler(req(CUERPO), {} as any);
    await (await handler(req(CUERPO, NDJSON), {} as any)).text();
    expect(create.mock.calls[0][0].output_config).toEqual({ effort: TACTICAL_PRO_EFFORT });
    expect(stream.mock.calls[0][0].output_config).toEqual({ effort: TACTICAL_PRO_EFFORT });
  });

  it("subir el esfuerzo no puede llevarse por delante el presupuesto", async () => {
    // Los dos van juntos en la misma petición compartida: si alguien tocara
    // uno sin el otro, esta comparación lo delataría.
    stream.mockReturnValue(fakeStream([textDelta("x")]));
    await (await handler(req(CUERPO, NDJSON), {} as any)).text();
    const params = stream.mock.calls[0][0];
    expect(params.max_tokens).toBe(8192);
    expect(params.output_config.effort).toBe("medium");
  });
});

describe("una generación sin texto no es un informe", () => {
  it("con texto y final normal: fragmentos y done", async () => {
    stream.mockReturnValue(fakeStream([textDelta("## 1."), textDelta(" Lectura"), msgDelta("end_turn")]));
    const ls = await lineas(await handler(req(CUERPO, NDJSON), {} as any));
    expect(ls).toEqual([{ t: "## 1." }, { t: " Lectura" }, { done: true }]);
  });

  it("cero texto con stop_reason max_tokens → error, NUNCA done", async () => {
    stream.mockReturnValue(
      fakeStream([
        { type: "content_block_start", content_block: { type: "thinking" } },
        { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "razonando…" } },
        msgDelta("max_tokens"),
      ]),
    );
    const ls = await lineas(await handler(req(CUERPO, NDJSON), {} as any));
    expect(ls).toHaveLength(1);
    expect(ls[0].done).toBeUndefined();
    expect(ls[0].error).toContain("sin producir texto");
    expect(ls[0].error).toContain("max_tokens");
  });

  it("cero texto con stop_reason end_turn → error, NUNCA done", async () => {
    stream.mockReturnValue(fakeStream([{ type: "message_start" }, msgDelta("end_turn")]));
    const ls = await lineas(await handler(req(CUERPO, NDJSON), {} as any));
    expect(ls).toHaveLength(1);
    expect(ls[0].done).toBeUndefined();
    expect(ls[0].error).toContain("end_turn");
  });

  it("cero texto sin desenlace declarado → error con unknown", async () => {
    stream.mockReturnValue(fakeStream([{ type: "message_start" }]));
    const ls = await lineas(await handler(req(CUERPO, NDJSON), {} as any));
    expect(ls[0].error).toContain("unknown");
    expect(ls[0].done).toBeUndefined();
  });

  it("el error explica que el informe determinista sigue ahí", async () => {
    stream.mockReturnValue(fakeStream([msgDelta("max_tokens")]));
    const ls = await lineas(await handler(req(CUERPO, NDJSON), {} as any));
    expect(ls[0].error).toContain("informe determinista sigue disponible");
  });

  it("un text_delta vacío no salva la generación", async () => {
    stream.mockReturnValue(
      fakeStream([{ type: "content_block_delta", delta: { type: "text_delta", text: "" } }, msgDelta("end_turn")]),
    );
    const ls = await lineas(await handler(req(CUERPO, NDJSON), {} as any));
    expect(ls[0].error).toBeDefined();
    expect(ls[0].done).toBeUndefined();
  });

  it("el razonamiento nunca llega al navegador", async () => {
    stream.mockReturnValue(
      fakeStream([
        { type: "content_block_delta", delta: { type: "thinking_delta", thinking: "RAZONAMIENTO-SECRETO" } },
        { type: "content_block_delta", delta: { type: "signature_delta", signature: "FIRMA-SECRETA" } },
        textDelta("informe visible"),
        msgDelta("end_turn"),
      ]),
    );
    const cuerpo = await (await handler(req(CUERPO, NDJSON), {} as any)).text();
    expect(cuerpo).not.toContain("RAZONAMIENTO-SECRETO");
    expect(cuerpo).not.toContain("FIRMA-SECRETA");
    expect(cuerpo).toBe('{"t":"informe visible"}\n{"done":true}\n');
  });
});
