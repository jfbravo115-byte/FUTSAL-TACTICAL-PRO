// @vitest-environment jsdom
/**
 * Bloque de balón parado del PDF real (`informe_*.pdf`).
 *
 * Este informe se monta con una plantilla propia dentro de MatchTracker, y es
 * la que el usuario descarga desde el botón. Los córners y las faltas de Fase
 * 5 no llegaban a ella porque las modificaciones habían ido a la otra ruta de
 * PDF — el mismo patrón de Fase 4. Estos tests miran el bloque compartido que
 * ahora usan las dos.
 *
 * Y una regla que no se negocia: una falta es la INFRACCIÓN cometida. Nunca
 * aparece clasificada como tiro o jugada.
 */
import { describe, expect, it } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from "react-dom/client";
import { act } from "react";
import { ActionType, GameEvent, MatchData, Period, Player, Role } from "../../types/futsal";
import { SetPieceSummaryBoard, buildSetPieceSummary } from "./SetPieceSummaryBoard";

function player(overrides: Partial<Player> = {}): Player {
  return {
    id: "p1",
    number: 7,
    name: "Juan",
    role: Role.PLAYER,
    isOnPitch: true,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isOpponent: false,
    stats: {
      goals: 0, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0,
      fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0, saves: 0, conceded: 0,
    },
    ...overrides,
  };
}

function ev(overrides: Partial<GameEvent>): GameEvent {
  return {
    id: `e-${Math.random()}`,
    timestamp: 0,
    wallClock: 0,
    period: Period.FIRST,
    playerIds: [],
    type: ActionType.CORNER,
    gameState: "4vs4" as any,
    ...overrides,
  };
}

const corner = (side: "left" | "right", outcome?: "shot" | "play", opponent = false) =>
  ev({
    type: ActionType.CORNER,
    originGrid: side === "left" ? "Z4L" : "Z4R",
    metadata: { isOpponent: opponent, cornerSide: side, ...(outcome ? { setPieceOutcome: outcome } : {}) },
  });

const foul = (zone?: string, opponent = false) =>
  ev({ type: ActionType.FOUL, playerIds: ["p1"], originGrid: zone, metadata: { isOpponent: opponent } });

const jugadaDeFalta = (zone?: string, opponent = false) =>
  ev({
    type: ActionType.SET_PIECE,
    playerIds: opponent ? [] : ["p1"],
    originGrid: zone,
    metadata: { isOpponent: opponent, setPieceOrigin: "free_kick", setPieceOutcome: "play" },
  });

const shot = (origin?: string, opponent = false) =>
  ev({
    type: ActionType.SHOT,
    playerIds: ["p1"],
    originGrid: "Z3C",
    destinationGrid: "G2",
    metadata: { isOpponent: opponent, ...(origin ? { setPiece: origin } : {}) },
  });

function match(events: GameEvent[], overrides: Partial<MatchData> = {}): MatchData {
  return {
    teamName: "Equipo Local",
    opponentName: "Equipo Visitante",
    period: Period.FIRST,
    matchClock: 0,
    isClockRunning: false,
    fouls: { team: 0, opponent: 0 },
    timeoutsUsed: { team: { period1: false, period2: false }, opponent: { period1: false, period2: false } },
    players: [player()],
    events,
    ...overrides,
  };
}

/** Partido con las cinco piezas que Fase 5 tiene que saber contar. */
function partidoCompleto(overrides: Partial<MatchData> = {}): MatchData {
  return match(
    [
      corner("left", "shot"),
      corner("right", "play"),
      corner("left"),
      corner("right", "shot", true),
      foul("Z2C"),
      foul(),
      foul("Z3R", true),
      shot("free_kick"),
      shot("corner"),
      shot(),
      jugadaDeFalta("Z2L"),
      jugadaDeFalta(),
      jugadaDeFalta("Z3C", true),
    ],
    overrides,
  );
}

function render(md: MatchData) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  act(() => {
    createRoot(host).render(<SetPieceSummaryBoard matchData={md} />);
  });
  return host;
}

const fila = (host: HTMLElement, attr: string, equipo: string) =>
  Array.from(host.querySelector(`[${attr}="${equipo}"]`)!.querySelectorAll("td")).map((td) =>
    (td.textContent || "").trim(),
  );

describe("resumen de balón parado", () => {
  it("córners: total, lado y ejecución del equipo propio", () => {
    const host = render(partidoCompleto());
    // Equipo · Total · Izquierda · Derecha · Tiro · Jugada · Sin subtipo
    expect(fila(host, "data-set-piece-row", "Equipo Local")).toEqual([
      "Equipo Local", "3", "2", "1", "1", "1", "1",
    ]);
  });

  it("córners del rival por separado", () => {
    const host = render(partidoCompleto());
    expect(fila(host, "data-set-piece-row", "Equipo Visitante")).toEqual([
      "Equipo Visitante", "1", "0", "1", "1", "0", "0",
    ]);
  });

  it("faltas: cometidas, recibidas y cuántas tienen ubicación", () => {
    const host = render(partidoCompleto());
    // Equipo · Cometidas · Recibidas · Con ubicación · Sin ubicación
    expect(fila(host, "data-foul-row", "Equipo Local")).toEqual(["Equipo Local", "2", "1", "1", "1"]);
    expect(fila(host, "data-foul-row", "Equipo Visitante")).toEqual(["Equipo Visitante", "1", "2", "1", "0"]);
  });

  it("tiros procedentes de balón parado, leídos del propio tiro", () => {
    const host = render(partidoCompleto());
    expect(fila(host, "data-shot-origin-row", "Equipo Local")).toEqual(["Equipo Local", "1", "1"]);
  });

  it("una falta NUNCA aparece clasificada como tiro o jugada", () => {
    const host = render(partidoCompleto());
    // La tabla de faltas no tiene columnas de ejecución: sus cabeceras son
    // cometidas/recibidas/ubicación y nada más.
    const tablaFaltas = host.querySelector('[data-foul-row]')!.closest("table")!;
    const cabeceras = Array.from(tablaFaltas.querySelectorAll("th")).map((th) => th.textContent);
    expect(cabeceras).toEqual(["Equipo", "Cometidas", "Recibidas", "Con ubicación", "Sin ubicación"]);
    expect(tablaFaltas.textContent).not.toMatch(/Tiro|Jugada/);

    const texto = (host.textContent || "").replace(/\s+/g, " ");
    expect(texto).not.toMatch(/Falta · Tiro|Falta · Jugada/);
    expect(texto).toContain("Una falta es la infracción cometida");
  });

  it("no imprime ningún código interno", () => {
    const texto = render(partidoCompleto()).textContent || "";
    for (const codigo of ["CORNER", "FOUL", "SHOT", "setPiece", "free_kick", "shot", "play", "Z4L"]) {
      expect(texto).not.toContain(codigo);
    }
  });

  it("un partido histórico sin subtipos declara lo no registrado", () => {
    const host = render(match([corner("left"), corner("right"), foul()]));
    expect(fila(host, "data-set-piece-row", "Equipo Local")).toEqual([
      "Equipo Local", "2", "1", "1", "0", "0", "2",
    ]);
  });
});

// ── EL CRONÓMETRO NO PUEDE HACER DESAPARECER EVENTOS ────────────────────
//
// Reproducción del segundo problema del QA: un partido cuyo cronómetro no se
// ha puesto en marcha tiene el mismo contenido estadístico exportable que uno
// en juego, con los mismos eventos. Lo único que legítimamente cambia es lo
// que depende del tiempo.

describe("partido no iniciado frente a partido en juego", () => {
  const sinIniciar = () =>
    partidoCompleto({
      matchClock: 0,
      isClockRunning: false,
      period: Period.FIRST,
      players: [player({ individualTimeSeconds: 0 })],
    });

  const enJuego = () =>
    partidoCompleto({
      matchClock: 754000,
      isClockRunning: true,
      period: Period.FIRST,
      players: [player({ individualTimeSeconds: 754 })],
    });

  it("el resumen de balón parado es idéntico", () => {
    expect(buildSetPieceSummary(sinIniciar().events, false)).toEqual(
      buildSetPieceSummary(enJuego().events, false),
    );
  });

  it("el bloque renderizado es idéntico", () => {
    const a = (render(sinIniciar()).textContent || "").replace(/\s+/g, " ");
    const b = (render(enJuego()).textContent || "").replace(/\s+/g, " ");
    expect(a).toBe(b);
  });

  it("con el cronómetro parado los córners siguen ahí", () => {
    const host = render(sinIniciar());
    expect(fila(host, "data-set-piece-row", "Equipo Local")[1]).toBe("3");
    expect(fila(host, "data-foul-row", "Equipo Local")[1]).toBe("2");
    expect(fila(host, "data-shot-origin-row", "Equipo Local")[1]).toBe("1");
  });
});

// ── HASTA EL DOCUMENTO: PLANTILLA → PÁGINA → GENERADOR REAL ─────────────
//
// El bloque se monta en una página como la del informe y se pasa por la MISMA
// función de captura que usa el botón (capturePagesToPdf), comprobando lo que
// acaba dibujado. Si el bloque dejara de contar córners, faltas o tiros de
// balón parado, estos tests caen.

import { vi } from "vitest";

const capturados: HTMLElement[] = [];
vi.mock("html-to-image", () => ({
  toJpeg: async (node: HTMLElement) => {
    capturados.push(node);
    return "data:image/jpeg;base64," + "A".repeat(2000);
  },
}));
const saveMock = vi.fn();
vi.mock("jspdf", () => ({
  jsPDF: vi.fn().mockImplementation(function (this: any) {
    return {
      internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
      addImage: vi.fn(),
      addPage: vi.fn(),
      save: saveMock,
    };
  }),
}));

async function exportarPagina(md: MatchData) {
  const { capturePagesToPdf } = await import("../../services/pdfExportService");
  capturados.length = 0;
  saveMock.mockClear();

  const host = document.createElement("div");
  document.body.appendChild(host);
  const ref = { current: null as HTMLDivElement | null };

  class FakeImage {
    width = 794;
    height = 1123;
    onload: (() => void) | null = null;
    set src(_v: string) {
      setTimeout(() => this.onload?.(), 0);
    }
  }
  const original = window.Image;
  // @ts-expect-error sustitución deliberada solo para el test
  window.Image = FakeImage;

  act(() => {
    createRoot(host).render(
      <div
        ref={(n) => {
          ref.current = n;
        }}
        style={{ width: 794, backgroundColor: "#ffffff" }}
      >
        <SetPieceSummaryBoard matchData={md} />
      </div>,
    );
  });

  const pdf = await capturePagesToPdf([ref.current!]);
  pdf.save(`informe_${md.teamName.replace(/\s+/g, "_")}_${Date.now()}.pdf`);
  window.Image = original;

  return (capturados[0]?.textContent || "").replace(/\s+/g, " ");
}

describe("la página llega al documento por el generador real", () => {
  it("se captura y se guarda con el nombre del informe", async () => {
    await exportarPagina(partidoCompleto());
    expect(capturados).toHaveLength(1);
    expect(saveMock.mock.calls[0][0]).toMatch(/^informe_Equipo_Local_\d+\.pdf$/);
  });

  it("el documento contiene los córners con lado y ejecución", async () => {
    const texto = await exportarPagina(partidoCompleto());
    expect(texto).toContain("Córners");
    expect(texto).toContain("Izquierda");
    expect(texto).toContain("Sin subtipo registrado");
  });

  it("el documento contiene las faltas cometidas y recibidas", async () => {
    const texto = await exportarPagina(partidoCompleto());
    expect(texto).toContain("Cometidas");
    expect(texto).toContain("Recibidas");
    expect(texto).toContain("Con ubicación");
  });

  it("el documento contiene los tiros procedentes de balón parado", async () => {
    const texto = await exportarPagina(partidoCompleto());
    expect(texto).toContain("Tiros procedentes de balón parado");
    expect(texto).toContain("Desde falta");
    expect(texto).toContain("Desde córner");
  });

  it("un partido sin iniciar produce el mismo documento", async () => {
    const parado = await exportarPagina(
      partidoCompleto({ matchClock: 0, isClockRunning: false }),
    );
    const enJuego = await exportarPagina(
      partidoCompleto({ matchClock: 754000, isClockRunning: true }),
    );
    expect(parado).toBe(enJuego);
  });
});

// ── JUGADAS DE FALTA EN LA PÁGINA 8 ─────────────────────────────────────

describe("jugadas de falta en el informe", () => {
  it("se cuentan aparte, con su ubicación declarada", () => {
    const host = render(partidoCompleto());
    // Equipo · Total · Con ubicación · Sin ubicación
    expect(fila(host, "data-free-kick-play-row", "Equipo Local")).toEqual([
      "Equipo Local", "2", "1", "1",
    ]);
    expect(fila(host, "data-free-kick-play-row", "Equipo Visitante")).toEqual([
      "Equipo Visitante", "1", "1", "0",
    ]);
  });

  it("no engordan las faltas cometidas ni los tiros", () => {
    const host = render(partidoCompleto());
    expect(fila(host, "data-foul-row", "Equipo Local")[1]).toBe("2");
    expect(fila(host, "data-shot-origin-row", "Equipo Local")).toEqual(["Equipo Local", "1", "1"]);
  });

  it("llegan al documento por el generador real", async () => {
    const texto = await exportarPagina(partidoCompleto());
    expect(texto).toContain("Jugadas de falta");
    expect(texto).not.toMatch(/SET_PIECE|free_kick/);
  });

  it("un partido sin jugadas de falta deja la tabla a cero, sin inventar", () => {
    const host = render(match([corner("left", "shot"), foul("Z2C")]));
    expect(fila(host, "data-free-kick-play-row", "Equipo Local")).toEqual([
      "Equipo Local", "0", "0", "0",
    ]);
  });
});

// ── LAS DOS MÉTRICAS, SEPARADAS, EN LA PÁGINA 8 ─────────────────────────

describe("tiros directos de córner en el informe", () => {
  it("la columna se llama «Tiro directo», no «Tiro»", () => {
    const host = render(partidoCompleto());
    const tablaCorners = host.querySelector("[data-set-piece-row]")!.closest("table")!;
    const cabeceras = Array.from(tablaCorners.querySelectorAll("th")).map((th) => th.textContent);
    expect(cabeceras).toEqual([
      "Equipo", "Total", "Izquierda", "Derecha", "Tiro directo", "Jugada", "Sin subtipo registrado",
    ]);
  });

  it("el tiro directo NO se suma a «Desde córner», que viene del propio tiro", () => {
    // partidoCompleto: 2 córners propios en tiro… más 1 tiro setPiece='corner'.
    const host = render(partidoCompleto());
    const corners = fila(host, "data-set-piece-row", "Equipo Local");
    const tiros = fila(host, "data-shot-origin-row", "Equipo Local");
    expect(corners[4]).toBe("1"); // tiros directos
    expect(tiros[2]).toBe("1");   // desde córner
  });

  it("un córner en tiro sin ningún SHOT deja «Desde córner» a cero", () => {
    const host = render(match([corner("left", "shot")]));
    expect(fila(host, "data-set-piece-row", "Equipo Local")[4]).toBe("1");
    expect(fila(host, "data-shot-origin-row", "Equipo Local")[2]).toBe("0");
  });

  it("un tiro desde córner sin CORNER registrado deja «Tiro directo» a cero", () => {
    const host = render(match([shot("corner")]));
    expect(fila(host, "data-set-piece-row", "Equipo Local")[4]).toBe("0");
    expect(fila(host, "data-shot-origin-row", "Equipo Local")[2]).toBe("1");
  });

  it("la página explica que son registros independientes", async () => {
    const texto = await exportarPagina(partidoCompleto());
    expect(texto).toContain("«Tiro directo» indica que el córner se ejecutó directamente hacia portería");
    expect(texto).toContain("Son registros independientes");
  });
});
