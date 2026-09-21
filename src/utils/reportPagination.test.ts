/**
 * Numeración del PDF Global del equipo.
 *
 * El total vivía escrito siete veces dentro de la plantilla, cada una con su
 * copia de la fórmula. Al añadir la página de balón parado solo se
 * actualizaron dos y el PDF salió con «Página 1 / 7 … Página 8 / 8».
 *
 * El segundo bloque de tests mira el código fuente a propósito: es la única
 * forma de que añadir una novena página y olvidarse de un denominador vuelva
 * a fallar aquí en vez de en el PDF del usuario.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  CONTEXT_CARD_H,
  CONTEXT_PAGE_CONTENT_H,
  CONTEXT_SECTION_HEADER_H,
  GOAL_ROW_H,
  TEAM_REPORT_PAGES_PER_TEAM,
  TEAM_REPORT_SHARED_PAGES,
  paginateContextReport,
  teamReportPageCount,
} from "./reportPagination";

describe("total de páginas del informe", () => {
  it("dos equipos con jugadores: tres páginas cada uno más las comunes", () => {
    expect(teamReportPageCount(2)).toBe(9);
  });

  it("un solo equipo registrado no imprime las páginas del rival", () => {
    expect(teamReportPageCount(1)).toBe(6);
  });

  it("sin equipos quedan solo las páginas comunes", () => {
    expect(teamReportPageCount(0)).toBe(TEAM_REPORT_SHARED_PAGES);
  });

  it("no devuelve menos que las comunes ante una entrada absurda", () => {
    expect(teamReportPageCount(-3)).toBe(TEAM_REPORT_SHARED_PAGES);
  });

  it("la fórmula es la declarada, no un número suelto", () => {
    for (const equipos of [0, 1, 2, 3]) {
      expect(teamReportPageCount(equipos)).toBe(
        equipos * TEAM_REPORT_PAGES_PER_TEAM + TEAM_REPORT_SHARED_PAGES,
      );
    }
  });
});

// ── GUARDIA SOBRE LA PLANTILLA REAL ─────────────────────────────────────

const PLANTILLA = fs.readFileSync(
  path.resolve(__dirname, "../pages/MatchTracker.tsx"),
  "utf-8",
);

/** El bloque de páginas del informe, acotado por sus propios comentarios. */
function bloqueDelInforme(): string {
  const ini = PLANTILLA.indexOf("PDF PAGE TEMPLATES");
  const fin = PLANTILLA.indexOf("EXPORT LOADING OVERLAY");
  expect(ini).toBeGreaterThan(-1);
  expect(fin).toBeGreaterThan(ini);
  return PLANTILLA.slice(ini, fin);
}

describe("la plantilla no vuelve a fijar el denominador", () => {
  it("el total sale de teamReportPageCount y de ningún otro cálculo", () => {
    const bloque = bloqueDelInforme();
    expect(bloque).toContain(
      "teamReportPageCount(allTeamsForPDF.length, contextPages.length)",
    );
    // Cualquier aritmética paralela de páginas es justo lo que causó el fallo.
    expect(bloque).not.toMatch(/allTeamsForPDF\.length\s*\*\s*3/);
  });

  it("ninguna página escribe su denominador a mano", () => {
    const bloque = bloqueDelInforme();
    // "/ 7", "/ 8", "total={7}"… en cualquier variante de espaciado.
    const fijos = bloque.match(/(?:Página[^<]*?\/\s*\d+)|(?:total=\{\s*\d+\s*\})/g) || [];
    expect(fijos).toEqual([]);
  });

  it("todas las páginas se numeran contra totalPages", () => {
    const bloque = bloqueDelInforme();
    const denominadores = bloque.match(/total=\{[^}]+\}/g) || [];
    expect(denominadores.length).toBeGreaterThanOrEqual(9);
    for (const d of denominadores) expect(d).toBe("total={totalPages}");
  });

  it("hay tantas páginas FIJAS montadas como dice el total sin contexto", () => {
    const bloque = bloqueDelInforme();
    const refs = new Set(bloque.match(/pdfPage\d+Ref/g) || []);
    expect(refs.size).toBe(teamReportPageCount(2));
  });

  it("las páginas de contexto se montan aparte, tantas como diga el reparto", () => {
    // No pueden tener una constante por página: su número depende del
    // partido. Se recogen con un ref de callback sobre la lista repartida.
    const bloque = bloqueDelInforme();
    expect(bloque).toContain("contextPages.map((pagina, i) =>");
    expect(bloque).toContain("pdfContextRefs.current[i] = el;");
    expect(bloque).toContain("<MatchContextBoard");
  });

  it("las páginas de contexto se CAPTURAN, no solo se montan", () => {
    // Montar la página y olvidarse de capturarla la dejaría fuera del PDF
    // sin que nada fallara: el informe saldría con el mismo aspecto de
    // siempre y nadie se enteraría hasta entregárselo al cuerpo técnico.
    expect(PLANTILLA).toContain("...pdfContextRefs.current.filter(Boolean),");
    expect(PLANTILLA).toMatch(/const nodes: HTMLDivElement\[\] = \[/);
    expect(PLANTILLA).toContain("for (const node of nodes) {");
  });

  it("las páginas comunes fijas ya no se numeran contra el final del PDF", () => {
    // `totalPages - 1` dejó de significar "la penúltima" en cuanto el total
    // pasó a depender de cuántas páginas de contexto tenga el partido.
    const bloque = bloqueDelInforme();
    expect(bloque).not.toMatch(/page=\{totalPages - [12]\}/);
    expect(bloque).toContain("const fixedPage = (n: number) =>");
  });
});

// ── PÁGINAS DE CONTEXTO TÁCTICO ────────────────────────────────────────
//
// Su número no es fijo: depende de cuántas ventanas y cuántos goles tenga el
// partido. Las páginas se capturan con toJpeg y se insertan con
// addImage(..., min(pdfH, pdfW*aspecto)): una página más alta que A4 no se
// recorta, se COMPRIME. Por eso el reparto se calcula, y se comprueba.

describe("reparto de las páginas de contexto táctico", () => {
  const ctxs = (n: number) => Array.from({ length: n }, (_, i) => `c${i}`);
  const goals = (n: number) => Array.from({ length: n }, (_, i) => `g${i}`);

  it("sin situaciones especiales y sin goles NO se crea ninguna página", () => {
    // Una página en blanco dentro de un informe que se entrega al cuerpo
    // técnico no dice nada, y ocupa una hoja.
    expect(paginateContextReport([], [])).toEqual([]);
  });

  it("un partido normal cabe en una sola página", () => {
    const pages = paginateContextReport(ctxs(3), goals(6));
    expect(pages).toHaveLength(1);
    expect(pages[0].contexts).toHaveLength(3);
    expect(pages[0].goals).toHaveLength(6);
    expect(pages[0].opensContexts).toBe(true);
    expect(pages[0].opensGoals).toBe(true);
  });

  it("solo goles: no se titula una sección de situaciones vacía", () => {
    const pages = paginateContextReport([], goals(4));
    expect(pages).toHaveLength(1);
    expect(pages[0].contexts).toEqual([]);
    expect(pages[0].opensContexts).toBe(false);
    expect(pages[0].opensGoals).toBe(true);
  });

  it("solo situaciones: idem al revés", () => {
    const pages = paginateContextReport(ctxs(2), []);
    expect(pages[0].goals).toEqual([]);
    expect(pages[0].opensGoals).toBe(false);
  });

  it("con muchas ventanas se abren las páginas que hagan falta", () => {
    const pages = paginateContextReport(ctxs(20), goals(40));
    expect(pages.length).toBeGreaterThan(1);
    // Nada se pierde ni se duplica en el reparto.
    expect(pages.flatMap((p) => p.contexts)).toEqual(ctxs(20));
    expect(pages.flatMap((p) => p.goals)).toEqual(goals(40));
  });

  it("ninguna página se pasa del alto útil de A4", () => {
    for (const [nc, ng] of [[1, 0], [3, 6], [20, 40], [0, 60], [7, 0]]) {
      for (const page of paginateContextReport(ctxs(nc), goals(ng))) {
        const alto =
          (page.opensContexts ? CONTEXT_SECTION_HEADER_H : 0) +
          page.contexts.length * CONTEXT_CARD_H +
          (page.opensGoals ? CONTEXT_SECTION_HEADER_H : 0) +
          page.goals.length * GOAL_ROW_H;
        expect(alto).toBeLessThanOrEqual(CONTEXT_PAGE_CONTENT_H);
      }
    }
  });

  it("una tarjeta nunca se parte entre dos páginas", () => {
    // El reparto es por elementos completos: una tarjeta entra entera o pasa
    // a la página siguiente.
    const pages = paginateContextReport(ctxs(15), []);
    const total = pages.reduce((a, p) => a + p.contexts.length, 0);
    expect(total).toBe(15);
    for (const p of pages) expect(Number.isInteger(p.contexts.length)).toBe(true);
  });

  it("cuando una lista continúa, la página siguiente vuelve a titularla", () => {
    const pages = paginateContextReport(ctxs(20), []);
    expect(pages.length).toBeGreaterThan(1);
    for (const p of pages) expect(p.opensContexts).toBe(true);
  });

  it("el total del PDF incorpora las páginas de contexto", () => {
    expect(teamReportPageCount(2, 0)).toBe(9);
    expect(teamReportPageCount(2, 1)).toBe(10);
    expect(teamReportPageCount(2, 3)).toBe(12);
    // Compatibilidad: sin el segundo argumento sigue dando lo de siempre.
    expect(teamReportPageCount(2)).toBe(9);
  });

  it("un número absurdo de páginas de contexto no resta", () => {
    expect(teamReportPageCount(2, -5)).toBe(9);
  });
});
