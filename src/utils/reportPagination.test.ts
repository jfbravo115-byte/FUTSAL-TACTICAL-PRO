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
  TEAM_REPORT_PAGES_PER_TEAM,
  TEAM_REPORT_SHARED_PAGES,
  teamReportPageCount,
} from "./reportPagination";

describe("total de páginas del informe", () => {
  it("dos equipos con jugadores: tres páginas cada uno más las dos comunes", () => {
    expect(teamReportPageCount(2)).toBe(8);
  });

  it("un solo equipo registrado no imprime las páginas del rival", () => {
    expect(teamReportPageCount(1)).toBe(5);
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
    expect(bloque).toContain("teamReportPageCount(allTeamsForPDF.length)");
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
    expect(denominadores.length).toBeGreaterThanOrEqual(8);
    for (const d of denominadores) expect(d).toBe("total={totalPages}");
  });

  it("hay tantas páginas montadas como dice el total", () => {
    const bloque = bloqueDelInforme();
    const refs = new Set(bloque.match(/pdfPage\d+Ref/g) || []);
    expect(refs.size).toBe(teamReportPageCount(2));
  });
});
