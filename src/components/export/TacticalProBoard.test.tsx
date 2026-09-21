// @vitest-environment jsdom
/**
 * Página "Análisis táctico · Tactical Pro" del PDF Global.
 *
 * El PDF Global es el documento que se entrega al cuerpo técnico. Llevaba
 * estadísticas, mapas, balón parado y contexto táctico, pero no el análisis
 * interpretativo, que es la parte que un entrenador lee primero.
 *
 * REGLA INNEGOCIABLE
 * ------------------
 * Imprimir o reimprimir el informe NO puede provocar ni una sola llamada.
 * Esta plantilla solo lee texto ya guardado.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { TACTICAL_PRO_CAVEAT, TacticalProBoard } from "./TacticalProBoard";
import { splitTacticalProIntoPages } from "../../services/pdfExportService";
import { teamReportPageCount } from "../../utils/reportPagination";

function render(node: React.ReactNode): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    createRoot(host).render(node);
  });
  return host;
}

const texto = (host: HTMLElement) => (host.textContent || "").replace(/\s+/g, " ");

describe("10 · el PDF incorpora el análisis ya persistido", () => {
  it("imprime el texto guardado, tal cual", () => {
    const host = render(<TacticalProBoard chunk="El equipo dominó la segunda parte." />);
    expect(texto(host)).toContain("El equipo dominó la segunda parte.");
  });

  it("lleva el rótulo pedido y lo presenta como interpretación", () => {
    const host = render(<TacticalProBoard chunk="texto" />);
    const t = texto(host);
    expect(t).toContain("Análisis táctico");
    expect(t).toContain("Tactical Pro");
    expect(t).toContain(TACTICAL_PRO_CAVEAT);
    expect(t).toContain("Análisis interpretativo");
  });

  it("el aviso solo aparece en la primera página", () => {
    expect(texto(render(<TacticalProBoard chunk="a" chunkIndex={1} chunkCount={3} />)))
      .not.toContain(TACTICAL_PRO_CAVEAT);
  });

  it("rotula la continuidad cuando hay varias páginas", () => {
    expect(texto(render(<TacticalProBoard chunk="a" chunkIndex={1} chunkCount={3} />))).toContain("(2/3)");
    expect(texto(render(<TacticalProBoard chunk="a" />))).not.toContain("(1/1)");
  });

  it("renderiza Markdown, no el código fuente", () => {
    const host = render(<TacticalProBoard chunk={"## Titular\n\nUn párrafo."} />);
    expect(host.querySelector("h2")?.textContent).toBe("Titular");
    expect(texto(host)).not.toContain("## Titular");
  });

  it("el HTML del análisis no se ejecuta: React escapa por defecto", () => {
    const host = render(
      <TacticalProBoard chunk={'<img src=x onerror="alert(1)"> texto'} />,
    );
    expect(host.querySelector("img")).toBeNull();
    expect(texto(host)).toContain("texto");
  });

  it("no renderiza ningún control de la aplicación", () => {
    const host = render(<TacticalProBoard chunk={"## Titular\n\nUn párrafo."} />);
    expect(host.querySelectorAll("button")).toHaveLength(0);
    expect(host.querySelectorAll("input")).toHaveLength(0);
  });
});

// ── 12 / 13 · PAGINACIÓN ───────────────────────────────────────────────

describe("12-13 · un análisis largo se reparte sin truncarse", () => {
  const parrafos = Array.from({ length: 40 }, (_, i) =>
    `Párrafo ${i + 1}. ${"Texto de relleno suficientemente largo para llenar la página. ".repeat(4)}`,
  );
  const largo = parrafos.join("\n\n");

  it("genera varias páginas, no una sola comprimida", () => {
    const chunks = splitTacticalProIntoPages(largo);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("no se pierde ni una palabra por el camino", () => {
    const chunks = splitTacticalProIntoPages(largo);
    const reunido = chunks.join(" ").replace(/\s+/g, " ");
    for (let i = 1; i <= 40; i++) expect(reunido).toContain(`Párrafo ${i}.`);
  });

  it("un análisis corto cabe en una sola página", () => {
    expect(splitTacticalProIntoPages("Una línea corta.")).toHaveLength(1);
  });

  it("se reutiliza el repartidor que ya existía, no otro algoritmo", () => {
    const plantilla = fs.readFileSync(
      path.resolve(__dirname, "../../pages/MatchTracker.tsx"),
      "utf-8",
    );
    expect(plantilla).toContain("splitTacticalProIntoPages");
    // Nada de un segundo criterio de corte dentro de la pantalla.
    expect(plantilla).not.toMatch(/CHARS_PER_PAGE\s*=/);
  });
});

// ── 11 / 14 · NUMERACIÓN ───────────────────────────────────────────────

describe("11-14 · las páginas del análisis entran en el total", () => {
  it("sin análisis no se añade ninguna página", () => {
    expect(teamReportPageCount(2, 0, 0)).toBe(9);
    expect(teamReportPageCount(2, 1, 0)).toBe(10);
  });

  it("el total es base + contexto + análisis", () => {
    expect(teamReportPageCount(2, 1, 1)).toBe(11);
    expect(teamReportPageCount(2, 2, 3)).toBe(14);
    expect(teamReportPageCount(1, 0, 2)).toBe(8);
  });

  it("un número absurdo no resta páginas", () => {
    expect(teamReportPageCount(2, -3, -7)).toBe(9);
  });

  it("la plantilla numera el análisis contra el total, al final del PDF", () => {
    const plantilla = fs.readFileSync(
      path.resolve(__dirname, "../../pages/MatchTracker.tsx"),
      "utf-8",
    );
    expect(plantilla).toContain("totalPages - tacticalProPages.length + i + 1");
    expect(plantilla).toContain("const contextPage = (i: number) =>");
  });
});

// ── 15 · SEGURIDAD: EL PDF NO PIDE NADA ────────────────────────────────

describe("15 · imprimir el PDF no provoca ninguna llamada", () => {
  const leer = (rel: string) =>
    fs.readFileSync(path.resolve(__dirname, rel), "utf-8");
  const sinComentarios = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("la plantilla del análisis no importa el servicio de IA", () => {
    const codigo = sinComentarios(leer("./TacticalProBoard.tsx"));
    for (const prohibido of [
      "tacticalAnalysisService",
      "streamTacticalReport",
      "runTacticalAnalysis",
      "tactical-pro",
      "fetch(",
    ]) {
      expect(codigo).not.toContain(prohibido);
    }
  });

  it("el PDF Global lee el texto guardado y no pide otro", () => {
    const plantilla = leer("../../pages/MatchTracker.tsx");
    expect(plantilla).toContain("const texto = matchData.tacticalAnalysis;");
    expect(plantilla).toContain("texto && texto.trim() ? splitTacticalProIntoPages(texto) : []");
    // Ningún tramo del camino del PDF toca la IA: ni el reparto en páginas,
    // ni la plantilla, ni la exportación. `MatchTracker` sí importa el
    // servicio —lo usa para GENERAR el análisis—, así que la guardia tiene
    // que ser por tramos y no por archivo.
    const tramos = [
      // El reparto en páginas del análisis.
      (() => {
        const ini = plantilla.indexOf("const tacticalProPages = useMemo");
        return plantilla.slice(ini, plantilla.indexOf("}, [matchData.tacticalAnalysis]);", ini));
      })(),
      // La plantilla de páginas del PDF.
      plantilla.slice(
        plantilla.indexOf("PDF PAGE TEMPLATES"),
        plantilla.indexOf("EXPORT LOADING OVERLAY"),
      ),
      // La exportación.
      plantilla.slice(
        plantilla.indexOf("const handleExport = async"),
        plantilla.indexOf("const handleGameStateChange ="),
      ),
    ];
    for (const tramo of tramos) {
      expect(tramo.length).toBeGreaterThan(100);
      const codigo = sinComentarios(tramo);
      for (const prohibido of [
        "streamTacticalReport",
        "runTacticalAnalysis",
        "tacticalAnalysisService",
        "tactical-pro",
      ]) {
        expect(codigo).not.toContain(prohibido);
      }
    }
  });

  it("16 · el Historial no importa el servicio de IA en absoluto", () => {
    for (const rel of ["../../pages/Dashboard.tsx", "../../services/matchHistoryService.ts"]) {
      const codigo = sinComentarios(leer(rel));
      expect(codigo).not.toContain("tacticalAnalysisService");
      expect(codigo).not.toContain("streamTacticalReport");
    }
  });

  it("el PDF del informe tampoco: usa exclusivamente lo persistido", () => {
    const codigo = sinComentarios(leer("../../services/pdfExportService.tsx"));
    expect(codigo).not.toContain("streamTacticalReport");
    expect(codigo).toContain("matchData.tacticalAnalysis");
  });
});
