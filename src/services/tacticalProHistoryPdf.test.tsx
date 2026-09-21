// @vitest-environment jsdom
/**
 * Circuito completo: Historial → PDF Global.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * ---------------------------
 * Las dos mitades del camino ya estaban probadas por separado:
 * `matchHistoryService.test.ts` demuestra que el análisis sobrevive a la
 * combinación local+remoto, y `TacticalProBoard.test.tsx` que una página
 * imprime el texto que se le da. Lo que no había era nada que las UNIERA, y
 * un circuito puede tener las dos mitades sanas y estar cortado en medio.
 *
 * Aquí se recorre entero, con el mismo encadenamiento que hace el PDF Global:
 *
 *   remoto sin análisis + copia local con análisis
 *     → combineMatchHistory
 *     → matchData.tacticalAnalysis
 *     → splitTacticalProIntoPages
 *     → páginas «Análisis táctico · Tactical Pro»
 *
 * NO SE GENERA NADA
 * -----------------
 * El texto de partida es una constante de este test. No se llama a ningún
 * servicio: el circuito solo transporta un análisis que YA existe, que es
 * justamente lo que hay que demostrar.
 */
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { MatchData, Period, Role, SavedMatch } from "../types/futsal";
import { LocalFinalCopy } from "./matchSnapshotService";
import { combineMatchHistory } from "./matchHistoryService";
import { splitTacticalProIntoPages } from "./pdfExportService";
import { TacticalProBoard } from "../components/export/TacticalProBoard";

const ANALISIS_REAL = "ANÁLISIS REAL YA GENERADO";

function match(id: string, timestamp = "2026-09-20T18:00:00.000Z"): SavedMatch {
  const data: MatchData = {
    teamName: "CD MURCIA",
    opponentName: "PR7",
    period: Period.FINISHED,
    matchClock: 0,
    isClockRunning: false,
    fouls: { team: 0, opponent: 0 },
    timeoutsUsed: {
      team: { period1: false, period2: false },
      opponent: { period1: false, period2: false },
    },
    players: [{
      id: "p1", number: 7, name: "Juan", role: Role.PLAYER, isOnPitch: false,
      plusMinus: 0, individualTimeSeconds: 500, rotationTimeSeconds: 0, isOpponent: false,
      stats: {
        goals: 0, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0,
        fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0,
        saves: 0, conceded: 0,
      },
    }],
    events: [],
    timestamp,
  };
  return { ...data, id };
}

const copiaLocal = (
  id: string,
  data: SavedMatch,
  remoteId?: string,
): LocalFinalCopy => ({
  id,
  matchData: data,
  syncStatus: remoteId ? "synced" : "pending",
  remoteId,
});

/**
 * El MISMO cálculo que hace la plantilla del PDF Global:
 *
 *   const texto = matchData.tacticalAnalysis;
 *   return texto && texto.trim() ? splitTacticalProIntoPages(texto) : [];
 *
 * Se reproduce aquí en vez de montar MatchTracker —8.000 líneas que jsdom no
 * puede montar—, y hay una guardia estructural que comprueba que la
 * plantilla sigue usando exactamente esta expresión.
 */
function paginasDelPdf(matchData: MatchData): string[] {
  const texto = matchData.tacticalAnalysis;
  return texto && texto.trim() ? splitTacticalProIntoPages(texto) : [];
}

function renderPaginas(chunks: string[]): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    createRoot(host).render(
      <>
        {chunks.map((chunk, i) => (
          <TacticalProBoard key={i} chunk={chunk} chunkIndex={i} chunkCount={chunks.length} />
        ))}
      </>,
    );
  });
  return host;
}

const texto = (host: HTMLElement) => (host.textContent || "").replace(/\s+/g, " ");

// ── CASO PRINCIPAL ─────────────────────────────────────────────────────

describe("Historial → PDF Global · el análisis ya generado llega al informe", () => {
  const recuperado = () => {
    const remote = match("remote-1"); // el servidor NO lo tiene
    const local = [
      copiaLocal("futsal_final_copy_v1_x", { ...match("x"), tacticalAnalysis: ANALISIS_REAL }, "remote-1"),
    ];
    const out = combineMatchHistory([remote], local);
    expect(out).toHaveLength(1);
    return out[0];
  };

  it("el partido recuperado contiene EXACTAMENTE el análisis de la copia local", () => {
    const entrada = recuperado();
    expect(entrada.historySource).toBe("both");
    expect(entrada.tacticalAnalysis).toBe(ANALISIS_REAL);
  });

  it("el PDF genera páginas a partir de ese análisis", () => {
    const chunks = paginasDelPdf(recuperado());
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join(" ")).toContain(ANALISIS_REAL);
  });

  it("las páginas se titulan «Análisis táctico · Tactical Pro» y traen ese texto", () => {
    const host = renderPaginas(paginasDelPdf(recuperado()));
    const t = texto(host);
    expect(t).toContain("Análisis táctico");
    expect(t).toContain("Tactical Pro");
    expect(t).toContain(ANALISIS_REAL);
  });

  it("el circuito no altera ni una letra del análisis", () => {
    // Recorrido entero: combinación → paginación → render.
    const host = renderPaginas(paginasDelPdf(recuperado()));
    expect(texto(host)).toContain(ANALISIS_REAL);
    expect(recuperado().tacticalAnalysis).toBe(ANALISIS_REAL);
  });

  it("y un análisis largo llega entero, repartido en varias páginas", () => {
    const largo = Array.from(
      { length: 30 },
      (_, i) => `Bloque ${i + 1}. ${ANALISIS_REAL}. ${"Relleno suficiente para llenar la página. ".repeat(4)}`,
    ).join("\n\n");
    const out = combineMatchHistory(
      [match("remote-1")],
      [copiaLocal("futsal_final_copy_v1_x", { ...match("x"), tacticalAnalysis: largo }, "remote-1")],
    );
    const chunks = paginasDelPdf(out[0]);
    expect(chunks.length).toBeGreaterThan(1);
    const host = renderPaginas(chunks);
    for (let i = 1; i <= 30; i++) expect(texto(host)).toContain(`Bloque ${i}.`);
  });
});

// ── EL REMOTO MANDA CUANDO TIENE ANÁLISIS ──────────────────────────────

describe("Historial → PDF Global · un análisis remoto válido no se sustituye", () => {
  it("el PDF imprime el REMOTO, no el local antiguo", () => {
    const out = combineMatchHistory(
      [{ ...match("remote-1"), tacticalAnalysis: "ANÁLISIS REMOTO" }],
      [copiaLocal("futsal_final_copy_v1_x", { ...match("x"), tacticalAnalysis: "ANÁLISIS LOCAL ANTIGUO" }, "remote-1")],
    );
    const host = renderPaginas(paginasDelPdf(out[0]));
    expect(texto(host)).toContain("ANÁLISIS REMOTO");
    expect(texto(host)).not.toContain("ANÁLISIS LOCAL ANTIGUO");
  });
});

// ── EL ANÁLISIS DE A JAMÁS LLEGA AL PDF DE B ───────────────────────────

describe("Historial → PDF Global · el análisis del partido A nunca acaba en el B", () => {
  const dosPartidos = () =>
    combineMatchHistory(
      [match("remote-A", "2026-09-19T18:00:00.000Z"), match("remote-B", "2026-09-20T18:00:00.000Z")],
      [
        copiaLocal(
          "copia-A",
          { ...match("a", "2026-09-19T18:00:00.000Z"), tacticalAnalysis: ANALISIS_REAL },
          "remote-A",
        ),
        copiaLocal("copia-B", match("b", "2026-09-20T18:00:00.000Z"), "remote-B"),
      ],
    );

  it("el PDF de A lleva su análisis", () => {
    const a = dosPartidos().find((m) => m.remoteId === "remote-A")!;
    expect(texto(renderPaginas(paginasDelPdf(a)))).toContain(ANALISIS_REAL);
  });

  it("el PDF de B no genera NINGUNA página de análisis", () => {
    const b = dosPartidos().find((m) => m.remoteId === "remote-B")!;
    expect(b.tacticalAnalysis).toBeUndefined();
    expect(paginasDelPdf(b)).toEqual([]);
  });

  it("y si se renderizara, no contendría nada del partido A", () => {
    const b = dosPartidos().find((m) => m.remoteId === "remote-B")!;
    expect(texto(renderPaginas(paginasDelPdf(b)))).not.toContain(ANALISIS_REAL);
  });
});

// ── LA PLANTILLA SIGUE USANDO ESTE MISMO CÁLCULO ───────────────────────

describe("el PDF Global reparte exactamente como este test", () => {
  it("la plantilla conserva la expresión que aquí se reproduce", () => {
    // Sin esta guardia, el test de arriba podría seguir en verde mientras el
    // PDF real hace otra cosa.
    const plantilla = require("node:fs").readFileSync(
      require("node:path").resolve(__dirname, "../pages/MatchTracker.tsx"),
      "utf-8",
    ) as string;
    expect(plantilla).toContain("const texto = matchData.tacticalAnalysis;");
    expect(plantilla).toContain(
      "return texto && texto.trim() ? splitTacticalProIntoPages(texto) : [];",
    );
    expect(plantilla).toContain("<TacticalProBoard");
  });
});
