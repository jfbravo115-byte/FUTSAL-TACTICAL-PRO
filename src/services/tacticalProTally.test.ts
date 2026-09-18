/**
 * Censo del stream de Anthropic (Fase 6, paso 2J).
 *
 * La ejecución real `5kjdhw` generó durante 42 s y terminó limpiamente con
 * CERO `text_delta`. Nuestro filtro es correcto —solo el texto es informe—
 * pero ciego: no sabe distinguir "no llegó nada" de "llegó mucho y nada era
 * texto". Esto cuenta lo que pasa de largo y recoge el desenlace que Anthropic
 * ya manda en la misma generación.
 *
 * Tres cosas que estos tests tienen que garantizar, y ninguna es cosmética:
 *
 *   1. Que el CONTENIDO nunca se registre. Un `thinking_delta` lleva el
 *      razonamiento del modelo; se cuenta, no se lee.
 *   2. Que ausente signifique `unknown` y jamás `0`. Un `thinkingTokens=0`
 *      inventado apuntaría al diagnóstico contrario del real.
 *   3. Que instrumentar no cambie el protocolo. `done` conserva exactamente su
 *      semántica durante este paso: mezclar diagnóstico y corrección haría
 *      imposible saber cuál de los dos movió el resultado.
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
  NDJSON_CONTENT_TYPE,
  createDiagnostics,
  createStreamTally,
  orUnknown,
} from "../../netlify/functions/tactical-pro.mts";

// ── Eventos de ejemplo. El texto que llevan dentro es el cebo: si alguno
// apareciera en un log, el test lo caza.
const RAZONAMIENTO = "El equipo local presiona alto porque SECRETO-THINKING";
const TEXTO = "## 1. Lectura objetiva SECRETO-TEXTO";
const FIRMA = "EqQBCgIYAhIM-SECRETO-FIRMA";

const msgStart = (usage: any = {}) => ({
  type: "message_start",
  message: { id: "msg_1", usage: { input_tokens: 6290, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, ...usage } },
});
const blockStart = (type: string) => ({ type: "content_block_start", index: 0, content_block: { type } });
const thinkingDelta = () => ({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: RAZONAMIENTO } });
const signatureDelta = () => ({ type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: FIRMA } });
const textDelta = (text = TEXTO) => ({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } });
const msgDelta = (stop_reason: string | null, usage: any = {}) => ({
  type: "message_delta",
  delta: { stop_reason },
  usage: { output_tokens: 4096, output_tokens_details: { thinking_tokens: 4061 }, ...usage },
});
const msgStop = () => ({ type: "message_stop" });

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

const CUERPO = {
  matchData: { teamName: "C.D. Nombre Real", players: [], events: [] },
  deterministicReport: { score: {} },
  tacticalContext: { glossary: ["g"], goalkeepers: [], zones: {} },
};

const req = (headers: Record<string, string> = {}) =>
  new Request("https://x.test/api/tactical-pro", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(CUERPO),
  });

const NDJSON = { Accept: NDJSON_CONTENT_TYPE };

/** El escenario de `5kjdhw`: mucho razonamiento, ningún texto. */
const SOLO_RAZONAMIENTO = [
  msgStart(),
  blockStart("thinking"),
  ...Array.from({ length: 833 }, thinkingDelta),
  signatureDelta(),
  { type: "content_block_stop", index: 0 },
  msgDelta("max_tokens"),
  msgStop(),
];

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

const linea = (evento: string) => logs.find((l) => l.includes(` ${evento} `) || l.endsWith(` ${evento}`));

describe("censo de tipos", () => {
  it("cuenta eventos, bloques y deltas por separado", () => {
    const salida: string[] = [];
    const diag = createDiagnostics((l) => salida.push(l), () => 0);
    const censo = createStreamTally();
    SOLO_RAZONAMIENTO.forEach(censo.observe);
    censo.report(diag);

    const tipos = salida.find((l) => l.includes("stream-types"))!;
    expect(tipos).toContain("events=content_block_delta:834");
    expect(tipos).toContain("blocks=thinking:1");
    expect(tipos).toContain("deltas=thinking_delta:833,signature_delta:1");
  });

  it("thinking_delta se CUENTA y su contenido no se registra jamás", () => {
    const salida: string[] = [];
    const censo = createStreamTally();
    [thinkingDelta(), thinkingDelta()].forEach(censo.observe);
    censo.report(createDiagnostics((l) => salida.push(l), () => 0));
    const todo = salida.join("\n");
    expect(todo).toContain("thinking_delta:2");
    expect(todo).not.toContain("SECRETO-THINKING");
    expect(todo).not.toContain("presiona alto");
  });

  it("signature_delta se cuenta y su firma no se registra", () => {
    const salida: string[] = [];
    const censo = createStreamTally();
    censo.observe(signatureDelta());
    censo.report(createDiagnostics((l) => salida.push(l), () => 0));
    expect(salida.join("\n")).toContain("signature_delta:1");
    expect(salida.join("\n")).not.toContain("SECRETO-FIRMA");
  });

  it("un tipo ausente se cuenta como unknown, no se descarta", () => {
    const salida: string[] = [];
    const censo = createStreamTally();
    censo.observe({ type: "content_block_delta", delta: {} });
    censo.observe({});
    censo.report(createDiagnostics((l) => salida.push(l), () => 0));
    const tipos = salida.find((l) => l.includes("stream-types"))!;
    expect(tipos).toContain("deltas=unknown:1");
    expect(tipos).toContain("unknown:1");
  });

  it("sin eventos de un tipo, el censo dice none y no una lista vacía", () => {
    const salida: string[] = [];
    const censo = createStreamTally();
    censo.observe(msgStop());
    censo.report(createDiagnostics((l) => salida.push(l), () => 0));
    expect(salida.find((l) => l.includes("stream-types"))).toContain("blocks=none");
  });
});

describe("desenlace de la generación", () => {
  const informe = (events: any[]) => {
    const salida: string[] = [];
    const censo = createStreamTally();
    events.forEach(censo.observe);
    censo.report(createDiagnostics((l) => salida.push(l), () => 0));
    return salida.find((l) => l.includes("message-result"))!;
  };

  it("captura stop_reason=max_tokens", () => {
    expect(informe(SOLO_RAZONAMIENTO)).toContain("stopReason=max_tokens");
  });

  it("captura output_tokens y thinking_tokens", () => {
    const l = informe(SOLO_RAZONAMIENTO);
    expect(l).toContain("outputTokens=4096");
    expect(l).toContain("thinkingTokens=4061");
  });

  it("captura input y caché desde message_start", () => {
    const l = informe(SOLO_RAZONAMIENTO);
    expect(l).toContain("inputTokens=6290");
    expect(l).toContain("cacheCreate=0");
    expect(l).toContain("cacheRead=0");
  });

  it("ausencia de thinking_tokens → unknown, NUNCA un 0 inventado", () => {
    const l = informe([
      msgStart({ input_tokens: 100 }),
      { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 50 } },
    ]);
    expect(l).toContain("thinkingTokens=unknown");
    expect(l).not.toContain("thinkingTokens=0");
  });

  it("sin message_delta, todo lo que no llegó es unknown", () => {
    const l = informe([msgStart({ input_tokens: null, cache_read_input_tokens: null })]);
    expect(l).toContain("stopReason=unknown");
    expect(l).toContain("outputTokens=unknown");
    expect(l).toContain("thinkingTokens=unknown");
    expect(l).toContain("inputTokens=unknown");
    expect(l).toContain("cacheRead=unknown");
  });

  it("un null del SDK no borra un número ya conocido", () => {
    const l = informe([
      msgStart({ input_tokens: 6290 }),
      { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 10, input_tokens: null } },
    ]);
    expect(l).toContain("inputTokens=6290");
  });

  it("orUnknown solo acepta números", () => {
    expect(orUnknown(0)).toBe(0);
    expect(orUnknown(4096)).toBe(4096);
    expect(orUnknown(null)).toBe("unknown");
    expect(orUnknown(undefined)).toBe("unknown");
    expect(orUnknown("4096")).toBe("unknown");
  });
});

describe("aviso de generación sin texto", () => {
  it("cero text_delta produce no-text-produced con el desenlace", async () => {
    stream.mockReturnValue(fakeStream(SOLO_RAZONAMIENTO));
    await (await handler(req(NDJSON), {} as any)).text();
    const aviso = linea("no-text-produced")!;
    expect(aviso).toBeDefined();
    expect(aviso).toContain("stopReason=max_tokens");
    expect(aviso).toContain("outputTokens=4096");
    expect(aviso).toContain("thinkingTokens=4061");
  });

  it("con texto NO aparece el aviso", async () => {
    stream.mockReturnValue(fakeStream([msgStart(), blockStart("text"), textDelta(), msgDelta("end_turn"), msgStop()]));
    await (await handler(req(NDJSON), {} as any)).text();
    expect(linea("no-text-produced")).toBeUndefined();
  });

  it("un text_delta vacío no cuenta como texto producido", () => {
    const censo = createStreamTally();
    censo.observe({ type: "content_block_delta", delta: { type: "text_delta", text: "" } });
    expect(censo.textDeltas).toBe(0);
  });

  it("el censo también se vuelca cuando el stream falla a mitad", async () => {
    stream.mockReturnValue(
      fakeStream([msgStart(), blockStart("thinking"), thinkingDelta()], { throwAt: 3, error: new Error("Overloaded") }),
    );
    await (await handler(req(NDJSON), {} as any)).text();
    expect(linea("stream-types")).toContain("thinking_delta:1");
    expect(linea("no-text-produced")).toBeDefined();
  });
});

describe("el protocolo no cambia", () => {
  it("text_delta sigue siendo lo ÚNICO que viaja como {\"t\":…}", async () => {
    stream.mockReturnValue(
      fakeStream([msgStart(), blockStart("thinking"), thinkingDelta(), signatureDelta(), blockStart("text"), textDelta("visible"), msgDelta("end_turn"), msgStop()]),
    );
    const cuerpo = await (await handler(req(NDJSON), {} as any)).text();
    const ls = cuerpo.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
    expect(ls.filter((l) => l.t)).toEqual([{ t: "visible" }]);
    expect(cuerpo).not.toContain("SECRETO-THINKING");
    expect(cuerpo).not.toContain("SECRETO-FIRMA");
  });

  it("cero fragmentos ya NO es done: es error (corregido en el paso 2K)", async () => {
    // Hasta el paso 2J esto devolvía {"done":true} y el cliente habría
    // guardado una cadena vacía como informe del partido.
    stream.mockReturnValue(fakeStream(SOLO_RAZONAMIENTO));
    const cuerpo = await (await handler(req(NDJSON), {} as any)).text();
    expect(cuerpo).not.toContain('"done"');
    const linea = JSON.parse(cuerpo.trim());
    expect(linea.error).toContain("sin producir texto");
    expect(linea.error).toContain("max_tokens");
  });

  it("error sigue sin done y con su mensaje intacto", async () => {
    stream.mockReturnValue(fakeStream([msgStart()], { throwAt: 1, error: new Error("Overloaded") }));
    const cuerpo = await (await handler(req(NDJSON), {} as any)).text();
    expect(cuerpo).toBe('{"error":"Overloaded"}\n');
  });

  it("la rama JSON no se ve afectada", async () => {
    create.mockResolvedValue({ content: [{ type: "text", text: "# Informe" }] });
    const res = await handler(req(), {} as any);
    expect(await res.json()).toEqual({ analysis: "# Informe" });
    expect(linea("stream-types")).toBeUndefined();
  });
});

describe("nada sensible en el log", () => {
  it("ni razonamiento, ni texto, ni firma, ni partido, ni clave", async () => {
    stream.mockReturnValue(
      fakeStream([msgStart(), blockStart("thinking"), thinkingDelta(), signatureDelta(), blockStart("text"), textDelta(), msgDelta("max_tokens"), msgStop()]),
    );
    await (await handler(req(NDJSON), {} as any)).text();
    const todo = logs.join("\n");
    for (const s of [
      "SECRETO-THINKING", "SECRETO-TEXTO", "SECRETO-FIRMA",
      "presiona alto", "Lectura objetiva",
      "C.D. Nombre Real", "test-key", "Redacta un informe", "GLOSARIO",
    ]) {
      expect(todo).not.toContain(s);
    }
  });

  it("las líneas nuevas siguen siendo clave=valor sin espacios", async () => {
    stream.mockReturnValue(fakeStream(SOLO_RAZONAMIENTO));
    await (await handler(req(NDJSON), {} as any)).text();
    for (const l of logs) {
      const resto = l.replace(/^\[TACTICAL-PRO \S+\] \+\d+ms \S+/, "").trim();
      if (!resto) continue;
      for (const par of resto.split(" ")) expect(par).toMatch(/^[a-zA-Z]+=[^\s]+$/);
    }
  });
});
