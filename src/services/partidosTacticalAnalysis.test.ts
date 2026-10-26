/**
 * PATCH /api/partidos/:id/tactical-analysis
 *
 * La ÚNICA escritura parcial que existe sobre un partido. Lo que se protege
 * aquí es que siga siendo eso: una ruta propia, autenticada, acotada a su
 * dueño y que toca exclusivamente una clave del JSON.
 *
 * Nunca se habla con Postgres: `@netlify/database` está simulado y las
 * consultas se inspeccionan como texto.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── base de datos simulada ──────────────────────────────────────────────
type Consulta = { sql: string; params: unknown[] };
const consultas: Consulta[] = [];
let filas: any[] = [];

const sqlFake = (strings: TemplateStringsArray, ...params: unknown[]) => {
  consultas.push({ sql: strings.join("?").replace(/\s+/g, " ").trim(), params });
  return Promise.resolve(filas);
};

vi.mock("@netlify/database", () => ({
  getDatabase: () => ({ sql: sqlFake }),
}));

import handler, {
  MAX_TACTICAL_ANALYSIS_CHARS,
  TACTICAL_ANALYSIS_SEGMENT,
  checkTacticalAnalysis,
} from "../../netlify/functions/partidos.mts";

const UID = "uid-propietario";
const BASE = "https://x.netlify.app/api/partidos";

/** Verificación de Firebase simulada: devuelve `UID` salvo que se diga otra cosa. */
let uidDelToken: string | null = UID;

beforeEach(() => {
  consultas.length = 0;
  filas = [{ id: "m1" }];
  uidDelToken = UID;
  vi.stubGlobal("fetch", vi.fn(async (url: any) => {
    if (String(url).includes("identitytoolkit")) {
      return {
        ok: uidDelToken !== null,
        json: async () => ({ users: uidDelToken ? [{ localId: uidDelToken }] : [] }),
      } as any;
    }
    throw new Error("fetch inesperado: " + url);
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const patch = (id: string, body: unknown, token = "tok") =>
  handler(
    new Request(`${BASE}/${id}/${TACTICAL_ANALYSIS_SEGMENT}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    {} as any,
  );

// ── 1 · VALIDACIÓN DEL CUERPO (pura) ────────────────────────────────────

describe("1 · qué se acepta como análisis", () => {
  it("una cadena con contenido, recortada", () => {
    const r = checkTacticalAnalysis({ tacticalAnalysis: "  ## Análisis\ntexto  " });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toBe("## Análisis\ntexto");
  });

  it("7 · cadena vacía o solo espacios, no", () => {
    for (const v of ["", "   ", "\n\t "]) {
      const r = checkTacticalAnalysis({ tacticalAnalysis: v });
      expect(r.ok, JSON.stringify(v)).toBe(false);
    }
  });

  it("7 · cualquier cosa que no sea cadena, tampoco", () => {
    for (const v of [null, undefined, 7, {}, [], true]) {
      expect(checkTacticalAnalysis({ tacticalAnalysis: v }).ok, String(v)).toBe(false);
    }
    expect(checkTacticalAnalysis(null).ok).toBe(false);
    expect(checkTacticalAnalysis("texto").ok).toBe(false);
  });

  it("el tamaño está acotado y documentado", () => {
    expect(MAX_TACTICAL_ANALYSIS_CHARS).toBe(200_000);
    const justo = "a".repeat(MAX_TACTICAL_ANALYSIS_CHARS);
    expect(checkTacticalAnalysis({ tacticalAnalysis: justo }).ok).toBe(true);
    const pasado = "a".repeat(MAX_TACTICAL_ANALYSIS_CHARS + 1);
    const r = checkTacticalAnalysis({ tacticalAnalysis: pasado });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.error).toContain("200000");
  });
});

// ── 2 · LA RUTA ─────────────────────────────────────────────────────────

describe("2 · el PATCH toca una sola clave", () => {
  it("3 · actualiza exclusivamente data.tacticalAnalysis", async () => {
    const res = await patch("m1", { tacticalAnalysis: "informe completo" });
    expect(res.status).toBe(200);

    expect(consultas).toHaveLength(1);
    const q = consultas[0].sql;
    expect(q).toContain("UPDATE partidos");
    expect(q).toContain("jsonb_set(data, '{tacticalAnalysis}'");
    // 4 · nada de reescribir el documento entero ni tocar otras claves: lo
    // único que puede ir detrás de `SET data =` es `jsonb_set`, que conserva
    // el resto del JSON tal cual.
    expect(q).toMatch(/SET data = jsonb_set\(/);
    expect(q).not.toMatch(/SET data = \?/);
    expect(q).not.toMatch(/\bevents\b/);
    expect(q).not.toMatch(/\bplayers\b/);
    expect(q).not.toContain("DELETE");
    expect(q).not.toContain("INSERT");
  });

  it("la consulta va parametrizada: ni el id ni el texto se interpolan", async () => {
    await patch("m1", { tacticalAnalysis: "texto'; DROP TABLE partidos; --" });
    const { sql, params } = consultas[0];
    expect(sql).not.toContain("DROP TABLE");
    expect(params).toContain("texto'; DROP TABLE partidos; --");
    expect(params).toContain("m1");
    expect(params).toContain(UID);
  });

  it("5 · el partido de otro usuario no se puede tocar", async () => {
    // El WHERE lleva el uid autenticado, así que la fila de otro no casa.
    filas = [];
    uidDelToken = "uid-intruso";
    const res = await patch("m1", { tacticalAnalysis: "texto" });
    expect(res.status).toBe(404);
    expect(consultas[0].params).toContain("uid-intruso");
    expect(consultas[0].sql).toContain("user_uid =");
  });

  it("6 · un partido inexistente devuelve 404", async () => {
    filas = [];
    const res = await patch("no-existe", { tacticalAnalysis: "texto" });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Partido no encontrado o sin permiso" });
  });

  it("7 · un cuerpo inválido devuelve 400 y NO consulta la base", async () => {
    for (const body of [{ tacticalAnalysis: "" }, { tacticalAnalysis: 7 }, {}]) {
      consultas.length = 0;
      const res = await patch("m1", body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(consultas).toHaveLength(0);
    }
  });

  it("un JSON ilegible devuelve 400", async () => {
    const res = await patch("m1", "{ esto no es json");
    expect(res.status).toBe(400);
    expect(consultas).toHaveLength(0);
  });

  it("sin token no se llega ni a validar el cuerpo", async () => {
    const res = await handler(
      new Request(`${BASE}/m1/${TACTICAL_ANALYSIS_SEGMENT}`, {
        method: "PATCH",
        body: JSON.stringify({ tacticalAnalysis: "texto" }),
      }),
      {} as any,
    );
    expect(res.status).toBe(401);
    expect(consultas).toHaveLength(0);
  });

  it("la respuesta NO devuelve el texto del análisis", async () => {
    const res = await patch("m1", { tacticalAnalysis: "secreto táctico" });
    const json = await res.json();
    expect(JSON.stringify(json)).not.toContain("secreto táctico");
    expect(json).toEqual({ id: "m1", tacticalAnalysisChars: "secreto táctico".length });
  });

  it("sin el subrecurso, un PATCH no hace nada", async () => {
    const res = await handler(
      new Request(`${BASE}/m1`, {
        method: "PATCH",
        headers: { Authorization: "Bearer tok" },
        body: JSON.stringify({ tacticalAnalysis: "texto" }),
      }),
      {} as any,
    );
    expect(res.status).toBe(405);
    expect(consultas).toHaveLength(0);
  });

  it("y las rutas de siempre siguen intactas", async () => {
    filas = [{ id: "m1", data: { teamName: "X" } }];
    const get = await handler(
      new Request(`${BASE}/m1`, { headers: { Authorization: "Bearer tok" } }),
      {} as any,
    );
    expect(get.status).toBe(200);
    expect(consultas[0].sql).toContain("SELECT id, data");
  });
});
