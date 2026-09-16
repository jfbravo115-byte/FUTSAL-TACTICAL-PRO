// @vitest-environment jsdom
/**
 * Regresión de extremo a extremo del PDF `porteros_*.pdf` — el que genera el
 * botón "Porteros + Mapa".
 *
 * Esta ruta es la que fallaba: plantilla propia dentro de MatchTracker.tsx,
 * con su propia aritmética y su propia rejilla `A1-C3`. Ninguna prueba la
 * miraba, así que dos rondas de correcciones fueron a parar al otro generador
 * (el informe independiente de `pdfExportService`) mientras el PDF real seguía
 * igual.
 *
 * El test monta la plantilla REAL, coge los mismos nodos que captura
 * `handleExport(Role.GOALKEEPER)` y los pasa por la MISMA función de captura,
 * comprobando lo que acaba en el documento.
 */
import { describe, expect, it, vi } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from "react-dom/client";
import { act, createRef } from "react";
import {
  ActionType,
  GameEvent,
  GoalieAction,
  MatchData,
  Period,
  Player,
  Role,
} from "../../types/futsal";

// Se rasteriza y se guarda de mentira: lo que se inspecciona es el NODO que se
// captura, que es exactamente lo que acaba dibujado en el PDF.
const captured: HTMLElement[] = [];
vi.mock("html-to-image", () => ({
  toJpeg: async (node: HTMLElement) => {
    captured.push(node);
    return "data:image/jpeg;base64," + "A".repeat(2000);
  },
}));
const saveMock = vi.fn();
const addImageMock = vi.fn();
vi.mock("jspdf", () => ({
  jsPDF: vi.fn().mockImplementation(function (this: any) {
    return {
      internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
      addImage: addImageMock,
      addPage: vi.fn(),
      save: saveMock,
    };
  }),
}));

import { capturePagesToPdf } from "../../services/pdfExportService";
import { GoalkeeperPdfPages } from "./GoalkeeperPdfPages";

function goalkeeper(overrides: Partial<Player> = {}): Player {
  return {
    id: "tp1",
    number: 1,
    name: "Por Local 1",
    role: Role.GOALKEEPER,
    isOnPitch: true,
    plusMinus: 0,
    individualTimeSeconds: 1200,
    isOpponent: false,
    stats: {
      goals: 0, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0,
      fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0,
      // Números del modelo viejo, deliberadamente falsos.
      saves: 77, conceded: 77,
    },
    ...overrides,
  };
}

function rivalShot(
  response: GoalieAction | "UNSPECIFIED",
  zone: string | undefined,
  extra: { gkId?: string; exitOutcome?: "success" | "fail"; destino?: string; period?: Period } = {},
): GameEvent {
  const gkId = extra.gkId ?? "tp1";
  return {
    id: `e-${Math.random()}`,
    type: ActionType.SHOT,
    timestamp: 0,
    wallClock: 0,
    period: extra.period ?? Period.FIRST,
    playerIds: ["r2", gkId],
    gameState: "4vs4" as any,
    originGrid: "Z3L" as any,
    destinationGrid: extra.destino as any,
    goalkeeperZone: zone as any,
    metadata: {
      isOpponent: true,
      setPiece: "normal",
      goalieResponse: response,
      targetGoalkeeperId: gkId,
      ...(extra.exitOutcome ? { exitOutcome: extra.exitOutcome } : {}),
    } as any,
  };
}

function match(events: GameEvent[], players: Player[]): MatchData {
  return {
    teamName: "Mi Equipo",
    opponentName: "Equipo Visitante",
    period: Period.SECOND,
    matchClock: 0,
    isClockRunning: false,
    fouls: { team: 0, opponent: 0 },
    timeoutsUsed: { team: { period1: false, period2: false }, opponent: { period1: false, period2: false } },
    players,
    events,
  };
}

/** El caso obligatorio: una intervención de cada tipo, una por zona. */
function partidoGk1aGk5(): MatchData {
  return match(
    [
      rivalShot(GoalieAction.SAVE, "GK1", { destino: "G1" }),
      rivalShot(GoalieAction.SAVE_CATCH, "GK2", { destino: "G4" }),
      rivalShot(GoalieAction.SAVE_DEFLECT, "GK3", { destino: "G8" }),
      rivalShot(GoalieAction.EXIT, "GK4", { exitOutcome: "success" }),
      rivalShot(GoalieAction.EXIT, "GK5", { exitOutcome: "fail" }),
    ],
    [goalkeeper()],
  );
}

/**
 * Monta la plantilla real y ejecuta la MISMA exportación que el botón:
 * los tres refs → capturePagesToPdf → pdf.save(`porteros_*.pdf`).
 */
async function exportarComoElBoton(md: MatchData) {
  captured.length = 0;
  saveMock.mockClear();

  const page1Ref = createRef<HTMLDivElement>();
  const page2Ref = createRef<HTMLDivElement>();
  const page3Ref = createRef<HTMLDivElement>();
  const host = document.createElement("div");
  document.body.appendChild(host);

  class FakeImage {
    width = 794;
    height = 1123;
    onload: (() => void) | null = null;
    set src(_v: string) {
      setTimeout(() => this.onload?.(), 0);
    }
  }
  const originalImage = window.Image;
  // @ts-expect-error sustitución deliberada solo para el test
  window.Image = FakeImage;

  act(() => {
    createRoot(host).render(
      <GoalkeeperPdfPages
        matchData={md}
        goals={0}
        opponentGoals={0}
        page1Ref={page1Ref}
        page2Ref={page2Ref}
        page3Ref={page3Ref}
      />,
    );
  });

  const nodes = [page1Ref.current, page2Ref.current, page3Ref.current].filter(
    (n): n is HTMLDivElement => n !== null,
  );
  const pdf = await capturePagesToPdf(nodes);
  pdf.save(`porteros_${md.teamName.replace(/\s+/g, "_")}_${Date.now()}.pdf`);
  window.Image = originalImage;

  return { nodes, texto: captured.map((n) => (n.textContent || "").replace(/\s+/g, " ")) };
}

const zona = (node: HTMLElement, id: string) =>
  Number((node.querySelector(`[data-gk-zone-row="${id}"]`)?.textContent || "").trim().match(/(\d+)$/)?.[1] ?? NaN);

describe("PDF porteros_*.pdf · exportación real", () => {
  it("es la plantilla del PDF real: cabecera y pie de Goalkeeper Report", async () => {
    const { texto } = await exportarComoElBoton(partidoGk1aGk5());
    expect(texto[0]).toContain("Goalkeeper Report · 1ª Parte");
    expect(texto[0]).toContain("Futsal Commander Pro · Goalkeeper Report");
    expect(texto[2]).toContain("Comparativa del partido");
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock.mock.calls[0][0]).toMatch(/^porteros_Mi_Equipo_\d+\.pdf$/);
  });

  it("captura las tres páginas y las mete en el documento", async () => {
    await exportarComoElBoton(partidoGk1aGk5());
    expect(captured).toHaveLength(3);
    expect(addImageMock).toHaveBeenCalledTimes(3);
  });

  it("cada zona de intervención aparece con su intervención", async () => {
    const { nodes } = await exportarComoElBoton(partidoGk1aGk5());
    for (const id of ["GK1", "GK2", "GK3", "GK4", "GK5"]) {
      expect(zona(nodes[0], id)).toBe(1);
    }
    expect(nodes[0].querySelectorAll("[data-gk-zone]").length).toBeGreaterThanOrEqual(5);
  });

  it("incluye el bloque ZONAS DE INTERVENCIÓN con nombres de usuario", async () => {
    const { texto } = await exportarComoElBoton(partidoGk1aGk5());
    expect(texto[0]).toContain("Zonas de intervención");
    expect(texto[0]).toContain("Zona 1 · Bajo palos");
    expect(texto[0]).toContain("Zona 5 · Fuera del área");
    expect(texto[0]).toContain("Sin ubicación registrada");
  });

  it("muestra las salidas con su resultado, y no como paradas", async () => {
    const { texto } = await exportarComoElBoton(partidoGk1aGk5());
    expect(texto[0]).toContain("Salidas 2");
    expect(texto[0]).toContain("1 con éxito · 1 falladas");
    expect(texto[0]).toContain("Paradas 3"); // SAVE + blocaje + despeje, sin salidas
  });

  it("desglosa blocajes y despejes", async () => {
    const { texto, nodes } = await exportarComoElBoton(partidoGk1aGk5());
    expect(texto[0]).toContain("blocajes 1 · despejes 1");
    const fila = nodes[0].querySelector('[data-gk-row="tp1"]')!;
    const celdas = Array.from(fila.querySelectorAll("td")).map((td) => (td.textContent || "").trim());
    // Portero · Par. · Bloc. · Desp. · Sal. · Enc. · %Par. · Min.
    expect(celdas[1]).toBe("3");
    expect(celdas[2]).toBe("1");
    expect(celdas[3]).toBe("1");
    expect(celdas[4]).toContain("2");
    expect(celdas[5]).toBe("0");
  });

  it("los tres mapas son tres dimensiones distintas", async () => {
    const { texto } = await exportarComoElBoton(partidoGk1aGk5());
    expect(texto[0]).toContain("Origen de los tiros · pista de 12 zonas");
    expect(texto[0]).toContain("Destino de los tiros");
    expect(texto[0]).toContain("Zonas de intervención");
  });

  it("ya no usa la rejilla anterior ni el rótulo antiguo", async () => {
    const { texto, nodes } = await exportarComoElBoton(partidoGk1aGk5());
    expect(texto[0]).not.toContain("Zona lanzamiento");
    expect(texto[0]).not.toContain("Zona portería");
    // La pista es la de 12 zonas: sus celdas llevan etiqueta accesible propia.
    expect(nodes[0].querySelector('[aria-label*="Zona 3"]')).not.toBeNull();
  });

  it("no lee player.stats ni imprime códigos internos", async () => {
    const { texto } = await exportarComoElBoton(partidoGk1aGk5());
    expect(texto[0]).not.toContain("77");
    for (const codigo of ["GK1", "GK5", "SAVE_CATCH", "SAVE_DEFLECT", "UNSPECIFIED", "EXIT"]) {
      expect(texto[0]).not.toContain(codigo);
    }
  });

  it("UNSPECIFIED no se coloca en ninguna zona", async () => {
    const md = match([rivalShot("UNSPECIFIED", undefined)], [goalkeeper()]);
    const { nodes } = await exportarComoElBoton(md);
    for (const id of ["GK1", "GK2", "GK3", "GK4", "GK5"]) expect(zona(nodes[0], id)).toBe(0);
  });

  it("separa primera y segunda parte sin mezclarlas", async () => {
    const md = match(
      [
        rivalShot(GoalieAction.SAVE, "GK1", { destino: "G1", period: Period.FIRST }),
        rivalShot(GoalieAction.EXIT, "GK5", { exitOutcome: "fail", period: Period.SECOND }),
      ],
      [goalkeeper()],
    );
    const { nodes } = await exportarComoElBoton(md);
    expect(zona(nodes[0], "GK1")).toBe(1); // 1ª parte
    expect(zona(nodes[0], "GK5")).toBe(0);
    expect(zona(nodes[1], "GK5")).toBe(1); // 2ª parte
    expect(zona(nodes[1], "GK1")).toBe(0);
  });

  it("dos porteros: cada ficha del PDF muestra solo lo suyo", async () => {
    const a = goalkeeper({ id: "gkA", number: 1, name: "Ana" });
    const b = goalkeeper({ id: "gkB", number: 12, name: "Bea", isOnPitch: false });
    const md = match(
      [
        rivalShot(GoalieAction.SAVE, "GK1", { gkId: "gkA", destino: "G1" }),
        rivalShot(GoalieAction.SAVE_CATCH, "GK2", { gkId: "gkA", destino: "G1" }),
        rivalShot(GoalieAction.SAVE_DEFLECT, "GK3", { gkId: "gkB", destino: "G1" }),
        rivalShot(GoalieAction.EXIT, "GK5", { gkId: "gkB", exitOutcome: "success" }),
      ],
      [a, b],
    );
    const { nodes } = await exportarComoElBoton(md);
    const filas = Array.from(nodes[0].querySelectorAll("[data-gk-row]")).map((tr) =>
      Array.from(tr.querySelectorAll("td")).map((td) => (td.textContent || "").trim()),
    );
    const ana = filas.find((f) => f[0].includes("Ana"))!;
    const bea = filas.find((f) => f[0].includes("Bea"))!;
    expect([ana[1], ana[2], ana[3]]).toEqual(["2", "1", "0"]); // 2 paradas, 1 blocaje, 0 despejes
    expect([bea[1], bea[2], bea[3]]).toEqual(["1", "0", "1"]); // 1 parada, 0 blocajes, 1 despeje
    expect(bea[4]).toContain("1"); // su salida
  });

  it("la comparativa habla del modelo nuevo, no del anterior", async () => {
    const { texto } = await exportarComoElBoton(partidoGk1aGk5());
    expect(texto[2]).toContain("Blocajes");
    expect(texto[2]).toContain("Despejes");
    expect(texto[2]).toContain("Salidas");
    expect(texto[2]).toContain("Goles encajados");
  });
});
