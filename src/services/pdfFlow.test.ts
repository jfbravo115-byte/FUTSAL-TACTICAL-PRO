/**
 * El reparto en páginas, sin navegador: alturas conocidas, decisiones
 * comprobables. Cada prueba fija una de las reglas que impiden que un PDF
 * recorte, aplaste o deje huecos.
 */
import { describe, expect, it } from "vitest";
import {
  FlowItem,
  MeasuredItem,
  RenderedPageAudit,
  auditPlan,
  paginateFlow,
  renderedPageProblems,
  sectionStartPages,
} from "./pdfFlow";

const H = 1000;
const GAP = 10;
const m = (id: string, height: number, extra: Partial<MeasuredItem> = {}): MeasuredItem => ({ id, height, ...extra });
const it_ = (id: string, kind: FlowItem["kind"], extra: Partial<FlowItem> = {}): FlowItem => ({ id, section: "s", kind, node: null, ...extra });

/** Alto que ocupa una página del plan, con sus huecos. */
function altoDe(pagina: { id: string; from?: number; to?: number }[], medidos: MeasuredItem[]): number {
  return pagina.reduce((acc, p, i) => {
    const mm = medidos.find((x) => x.id === p.id)!;
    const h = mm.rowHeights
      ? (mm.rowsHead ?? 0) + mm.rowHeights.slice(p.from, p.to).reduce((a, b) => a + b, 0)
      : mm.height;
    return acc + h + (i > 0 ? GAP : 0);
  }, 0);
}

describe("paginateFlow · nada sale del A4", () => {
  it("ninguna página supera el alto útil", () => {
    const medidos = Array.from({ length: 30 }, (_, i) => m(`b${i}`, 80 + ((i * 37) % 220)));
    const plan = paginateFlow(medidos, H, GAP);
    for (const p of plan.pages) expect(altoDe(p, medidos)).toBeLessThanOrEqual(H);
    expect(plan.oversize).toEqual([]);
  });

  it("los bloques conservan su orden y no se pierde ni se repite ninguno", () => {
    const medidos = Array.from({ length: 12 }, (_, i) => m(`b${i}`, 300));
    const plan = paginateFlow(medidos, H, GAP);
    expect(plan.pages.flat().map((p) => p.id)).toEqual(medidos.map((x) => x.id));
  });

  it("nunca crea una página vacía, ni siquiera con saltos forzados seguidos", () => {
    const medidos = [m("a", 100, { breakBefore: true }), m("b", 100, { breakBefore: true }), m("c", 100)];
    const plan = paginateFlow(medidos, H, GAP);
    expect(plan.pages.every((p) => p.length > 0)).toBe(true);
    expect(plan.pages.map((p) => p.map((x) => x.id))).toEqual([["a"], ["b", "c"]]);
  });

  it("un salto forzado en una página vacía no abre otra", () => {
    const plan = paginateFlow([m("a", 100, { breakBefore: true })], H, GAP);
    expect(plan.pages).toHaveLength(1);
  });
});

describe("paginateFlow · los mapas no se parten", () => {
  it("un mapa que no cabe en lo que queda baja ENTERO a la página siguiente", () => {
    const plan = paginateFlow([m("texto", 700), m("mapa", 400)], H, GAP);
    expect(plan.pages.map((p) => p.map((x) => x.id))).toEqual([["texto"], ["mapa"]]);
    expect(plan.pages[1][0].from).toBeUndefined();
  });

  it("un bloque más alto que una página se señala, no se corta en silencio", () => {
    const plan = paginateFlow([m("gigante", H + 50)], H, GAP);
    expect(plan.oversize).toEqual(["gigante"]);
  });
});

describe("paginateFlow · los títulos van con lo que introducen", () => {
  it("un título que solo cabría al pie baja con su primer bloque", () => {
    const medidos = [m("relleno", 900), m("titulo", 40, { keepWithNext: true }), m("parrafo", 200)];
    const plan = paginateFlow(medidos, H, GAP);
    expect(plan.pages.map((p) => p.map((x) => x.id))).toEqual([["relleno"], ["titulo", "parrafo"]]);
  });

  it("si caben los dos, se quedan juntos en la misma página", () => {
    const plan = paginateFlow([m("relleno", 500), m("titulo", 40, { keepWithNext: true }), m("parrafo", 200)], H, GAP);
    expect(plan.pages).toHaveLength(1);
  });

  it("con una tabla detrás, el título necesita su cabecera y una fila", () => {
    const tabla = m("tabla", 0, { rowsHead: 30, rowHeights: [20, 20, 20] });
    const plan = paginateFlow([m("relleno", 930), m("titulo", 20, { keepWithNext: true }), tabla], H, GAP);
    expect(plan.pages[0].map((x) => x.id)).toEqual(["relleno"]);
    expect(plan.pages[1][0].id).toBe("titulo");
  });
});

describe("paginateFlow · cadenas de títulos", () => {
  it("«Tactical Pro» y «1. Lectura…» bajan juntos con su primer párrafo", () => {
    const medidos = [
      m("relleno", 880),
      m("tactical", 40, { keepWithNext: true }),
      m("apartado-1", 30, { keepWithNext: true }),
      m("parrafo", 120),
    ];
    const plan = paginateFlow(medidos, H, GAP);
    expect(plan.pages.map((p) => p.map((x) => x.id))).toEqual([["relleno"], ["tactical", "apartado-1", "parrafo"]]);
  });

  it("si lo que introduce no cabe ni en una página vacía, el título baja igualmente y se declara", () => {
    const plan = paginateFlow([m("relleno", 300), m("titulo", 40, { keepWithNext: true }), m("mapa", 990)], H, GAP);
    expect(plan.pages[0].map((x) => x.id)).toEqual(["relleno"]);
    expect(plan.unavoidable).toEqual(["titulo"]);
    // La auditoría no lo trata como un descuido: no había forma de evitarlo.
    const items = [it_("relleno", "text"), it_("titulo", "heading", { keepWithNext: true }), it_("mapa", "map")];
    expect(auditPlan(plan, items)).toEqual([]);
  });
});

describe("paginateFlow · las tablas se parten por filas", () => {
  const filas = Array.from({ length: 60 }, () => 20);
  const tabla = m("tabla", 0, { rowsHead: 40, rowHeights: filas });

  it("cada tramo repite la cabecera y cabe en su página", () => {
    const plan = paginateFlow([m("intro", 300), tabla], H, GAP);
    const tramos = plan.pages.flat().filter((p) => p.id === "tabla");
    expect(tramos.length).toBeGreaterThan(1);
    for (const p of plan.pages) expect(altoDe(p, [m("intro", 300), tabla])).toBeLessThanOrEqual(H);
  });

  it("las filas son correlativas, sin huecos ni repeticiones", () => {
    const plan = paginateFlow([m("intro", 300), tabla], H, GAP);
    const tramos = plan.pages.flat().filter((p) => p.id === "tabla");
    let esperado = 0;
    for (const t of tramos) {
      expect(t.from).toBe(esperado);
      esperado = t.to!;
    }
    expect(esperado).toBe(60);
  });
});

describe("auditPlan · lo que el reparto nunca puede producir", () => {
  const items = [it_("t", "heading", { keepWithNext: true }), it_("mapa", "map"), it_("p", "text")];

  it("un plan correcto no tiene fallos", () => {
    expect(auditPlan({ pages: [[{ id: "t" }, { id: "mapa" }], [{ id: "p" }]], oversize: [] }, items)).toEqual([]);
  });

  it("detecta una página vacía", () => {
    expect(auditPlan({ pages: [[{ id: "t" }, { id: "mapa" }], [], [{ id: "p" }]], oversize: [] }, items).join()).toMatch(/vacía/);
  });

  it("detecta un título solo al final de página", () => {
    expect(auditPlan({ pages: [[{ id: "t" }], [{ id: "mapa" }, { id: "p" }]], oversize: [] }, items).join()).toMatch(/título «t» solo/);
  });

  it("detecta un mapa partido", () => {
    const fallos = auditPlan({ pages: [[{ id: "t" }, { id: "mapa", from: 0, to: 1 }], [{ id: "mapa", from: 1, to: 2 }, { id: "p" }]], oversize: [] }, items);
    expect(fallos.join()).toMatch(/mapa «mapa» partido/);
  });

  it("detecta un bloque perdido", () => {
    expect(auditPlan({ pages: [[{ id: "t" }, { id: "mapa" }]], oversize: [] }, items).join()).toMatch(/«p» perdido/);
  });

  it("detecta una tabla incompleta", () => {
    const tabla = it_("tabla", "table", { rows: { count: 5, render: () => null }, node: undefined });
    const fallos = auditPlan({ pages: [[{ id: "tabla", from: 0, to: 3 }]], oversize: [] }, [tabla]);
    expect(fallos.join()).toMatch(/incompleta/);
  });
});

describe("renderedPageProblems · la auditoría antes de capturar", () => {
  const pagina = (o: Partial<RenderedPageAudit> & { page: number }): RenderedPageAudit => ({
    overflow: 0, empty: false, footer: null, items: ["x"], ...o,
  });

  it("texto fuera del A4", () => {
    const p = renderedPageProblems([pagina({ page: 1, overflow: 37, items: ["a", "b"] })]);
    expect(p.join()).toMatch(/página 1 \(a, b\): 37 px fuera del A4/);
  });

  it("una página vacía", () => {
    expect(renderedPageProblems([pagina({ page: 1, empty: true })]).join()).toMatch(/vacía/);
  });

  it("pies que no son correlativos", () => {
    const p = renderedPageProblems([
      pagina({ page: 1, footer: "Página 1 de 2" }),
      pagina({ page: 2, footer: "Página 3 de 2" }),
    ]);
    expect(p.join()).toMatch(/pie «Página 3 de 2» no correlativo/);
  });

  it("un documento correcto pasa", () => {
    expect(renderedPageProblems([pagina({ page: 1, footer: "Página 1 de 1" })])).toEqual([]);
  });
});

describe("sectionStartPages · el índice sale del reparto", () => {
  it("cada sección empieza donde aparece su primer bloque", () => {
    const items = [it_("a", "text", { section: "uno" }), it_("b", "text", { section: "dos" }), it_("c", "text", { section: "dos" })];
    const plan = { pages: [[{ id: "a" }], [{ id: "b" }, { id: "c" }]], oversize: [] };
    expect(sectionStartPages(plan, items, 2)).toEqual({ uno: 2, dos: 3 });
  });
});
