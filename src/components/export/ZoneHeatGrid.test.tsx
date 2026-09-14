// @vitest-environment jsdom
/**
 * Regresión del bug detectado en validación manual sobre el Deploy Preview:
 * el PDF GLOBAL de un partido creado ya con Fase 3 seguía mostrando la
 * rejilla antigua con letras.
 *
 * Causa: esta matriz estaba fijada a ['A','B','C'] × ['1','2','3'] y contaba
 * `e.originGrid` sin clasificarlo. Con sectores `Z1L`-`Z4R` no encontraba
 * ninguna coincidencia, así que dibujaba nueve celdas vacías rotuladas
 * A1-C3.
 *
 * El PDF global se genera desde MatchTracker (no desde pdfExportService), por
 * eso los tests de pdfExportService no lo cubrían.
 */
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { ActionType, GameEvent, GameState, Period } from "../../types/futsal";
import { ZoneHeatGrid } from "./ZoneHeatGrid";

function ev(id: string, originGrid?: string): GameEvent {
  return {
    id,
    timestamp: 0,
    wallClock: 0,
    period: Period.FIRST,
    playerIds: [],
    type: ActionType.SHOT,
    gameState: GameState.FOUR_VS_FOUR,
    originGrid,
    metadata: {},
  };
}

/** Renderiza la matriz y devuelve el nodo, como hace la captura del PDF. */
function render(events: GameEvent[]): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<ZoneHeatGrid events={events} color="#2563eb" title="Tiros" />);
  });
  return host;
}

/** Celdas dibujadas: un <g> por sector. */
function cellLabels(node: HTMLElement): string[] {
  return Array.from(node.querySelectorAll("g")).map((g) => g.getAttribute("aria-label") || "");
}

describe("Matriz de zona del PDF global", () => {
  it("un partido NUEVO de Fase 3 se dibuja en 12 zonas, sin letras legacy", () => {
    const node = render([
      ev("1", "Z1L"),
      ev("2", "Z2C"),
      ev("3", "Z2C"),
      ev("4", "Z4R"),
    ]);
    const text = node.textContent || "";

    // 4 franjas × 3 carriles.
    expect(cellLabels(node)).toHaveLength(12);
    expect(cellLabels(node)).toContain("Zona 2 · centro");

    // Y NINGÚN código interno de ningún sistema.
    expect(text).not.toMatch(/\b[ABC][123]\b/);
    expect(text).not.toMatch(/Z[1-4][LCR]/);
    expect(text).not.toMatch(/\bG[1-9]\b/);

    // Los ejes se explican en lenguaje natural.
    expect(text).toContain("portería propia");
    expect(text).toContain("portería rival");
    expect(text).not.toContain("Rejilla histórica");
  });

  it("cuenta los sectores nuevos en vez de quedarse a cero", () => {
    // El síntoma exacto del bug: la rejilla salía vacía porque ningún
    // originGrid casaba con A1-C3.
    const node = render([ev("1", "Z2C"), ev("2", "Z2C"), ev("3", "Z2C")]);
    const numeros = Array.from(node.querySelectorAll("g text")).map((t) => t.textContent);
    expect(numeros).toContain("3");
  });

  it("un partido HISTÓRICO se dibuja en su rejilla 3×3, identificada como tal", () => {
    const node = render([ev("1", "A1"), ev("2", "B2")]);
    const text = node.textContent || "";

    expect(cellLabels(node)).toHaveLength(9);
    expect(cellLabels(node)).toContain("Franja 2 · banda central");
    expect(text).toContain("Rejilla histórica");

    // Ni siquiera en legacy se imprime el código crudo.
    expect(text).not.toMatch(/\b[ABC][123]\b/);
  });

  it("no mezcla los dos sistemas: un sector nuevo manda sobre uno histórico", () => {
    const node = render([ev("1", "Z3C"), ev("2", "B2")]);
    expect(cellLabels(node)).toHaveLength(12);
    expect(node.textContent || "").not.toContain("Rejilla histórica");
  });

  it("un partido sin zonas registradas usa el sistema NUEVO, no el histórico", () => {
    // Presentarlo como rejilla histórica mentiría sobre el origen del dato.
    const node = render([ev("1", undefined)]);
    expect(cellLabels(node)).toHaveLength(12);
    expect(node.textContent || "").not.toContain("Rejilla histórica");
  });

  it("ignora los destinos de portería: esta matriz es de pista", () => {
    const node = render([ev("1", "G5")]);
    const text = node.textContent || "";
    expect(cellLabels(node)).toHaveLength(12);
    expect(text).not.toMatch(/\bG[1-9]\b/);
  });
});
