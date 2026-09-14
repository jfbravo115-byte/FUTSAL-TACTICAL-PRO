// @vitest-environment jsdom
/**
 * Página "Mapas de zona del partido" del PDF Global.
 *
 * Sustituye las seis matrices abstractas por seis pistas reconocibles. Estos
 * tests cubren lo que un analista necesita poder enseñar a un entrenador:
 * que son pistas de verdad, que los conteos caen donde toca, y que no hay ni
 * un código interno a la vista.
 */
import { describe, expect, it } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { ActionType, GameEvent, GameState, GoalieAction, Period } from "../../types/futsal";
import {
  ZONE_MAP_PAGE,
  ZoneMapBoard,
  buildZoneMaps,
  captionsFor,
  isLegacyMatch,
  zoneMapAvailableHeight,
  zoneMapColumnWidth,
  zoneMapGridHeight,
} from "./ZoneMapBoard";

function ev(
  id: string,
  type: ActionType | GoalieAction,
  originGrid?: string,
  isOpponent = false,
): GameEvent {
  return {
    id,
    timestamp: 0,
    wallClock: 0,
    period: Period.FIRST,
    playerIds: [],
    type,
    gameState: GameState.FOUR_VS_FOUR,
    originGrid,
    metadata: { isOpponent },
  };
}

function render(events: GameEvent[]): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<ZoneMapBoard events={events} />);
  });
  return host;
}

const zoneCells = (node: HTMLElement) =>
  Array.from(node.querySelectorAll("[aria-label^='Zona ']"));

describe("Mapas de zona del PDF Global", () => {
  it("dibuja los SEIS mapas sobre pista real, no sobre una matriz", () => {
    const node = render([ev("1", ActionType.SHOT, "Z3C")]);

    // Una pista completa por mapa: el decorado (porterías, áreas, línea
    // central) lo aporta FutsalPitch, no una rejilla propia.
    expect(node.querySelectorAll("[data-testid='pitch-markings']")).toHaveLength(6);

    for (const titulo of [
      "Goles",
      "Tiros",
      "Recuperaciones",
      "Pérdidas",
      "Goles encajados",
      "Tiros recibidos",
    ]) {
      expect(node.textContent || "").toContain(titulo);
    }
  });

  it("un partido nuevo usa 12 zonas y coloca el conteo dentro del sector", () => {
    const node = render([
      ev("1", ActionType.LOSS, "Z2C"),
      ev("2", ActionType.LOSS, "Z2C"),
      ev("3", ActionType.LOSS, "Z2C"),
      ev("4", ActionType.STEAL, "Z1R"),
    ]);

    // 6 mapas × 12 sectores.
    expect(zoneCells(node)).toHaveLength(72);

    const perdidasZ2C = zoneCells(node).filter(
      (c) => c.getAttribute("aria-label") === "Zona 2 · centro" && c.textContent === "3",
    );
    expect(perdidasZ2C).toHaveLength(1);

    const recuperacionZ1R = zoneCells(node).filter(
      (c) => c.getAttribute("aria-label") === "Zona 1 · derecha" && c.textContent === "1",
    );
    expect(recuperacionZ1R).toHaveLength(1);
  });

  it("NINGÚN código interno llega a la página", () => {
    const node = render([
      ev("1", ActionType.GOAL, "Z4L"),
      ev("2", ActionType.SHOT, "Z1L"),
      ev("3", ActionType.LOSS, "Z3R"),
      ev("4", ActionType.SHOT, "Z2C", true),
    ]);
    const text = node.textContent || "";

    expect(text).not.toMatch(/\b[ABC][123]\b/);
    expect(text).not.toMatch(/Z[1-4][LCR]/);
    expect(text).not.toMatch(/\bG[1-9]\b/);
  });

  it("rotula las porterías según de quién es la acción", () => {
    const node = render([
      ev("1", ActionType.SHOT, "Z4C"),
      ev("2", ActionType.SHOT, "Z4C", true),
    ]);
    const text = node.textContent || "";

    // Acciones propias: perspectiva nuestra.
    expect(text).toContain("Portería propia");
    expect(text).toContain("Portería rival");
    // Acciones rivales: están normalizadas a la perspectiva del RIVAL, así que
    // el extremo derecho es NUESTRA portería.
    expect(text).toContain("Ataque rival");
    expect(text).toContain("Nuestra portería");

    expect(captionsFor(buildZoneMaps([]).find((m) => m.key === "tiros")!)).toEqual({
      left: "Portería propia",
      right: "Portería rival",
    });
    expect(captionsFor(buildZoneMaps([]).find((m) => m.key === "tiros-recibidos")!)).toEqual({
      left: "Ataque rival",
      right: "Nuestra portería",
    });
  });

  it("reparte cada acción en el mapa que le corresponde", () => {
    const maps = buildZoneMaps([
      ev("1", ActionType.GOAL, "Z4C"),
      ev("2", ActionType.SHOT, "Z3C"),
      ev("3", ActionType.STEAL, "Z1C"),
      ev("4", ActionType.LOSS, "Z2C"),
      ev("5", GoalieAction.GOAL_CONCEDED, "Z4C", true),
      ev("6", ActionType.SHOT, "Z3C", true),
    ]);
    const byKey = Object.fromEntries(maps.map((m) => [m.key, m.events.length]));
    expect(byKey).toEqual({
      goles: 1,
      tiros: 1,
      recuperaciones: 1,
      perdidas: 1,
      "goles-encajados": 1,
      "tiros-recibidos": 1,
    });
  });

  it("declara las acciones sin ubicación en vez de ignorarlas", () => {
    const node = render([ev("1", ActionType.LOSS, "Z2C"), ev("2", ActionType.LOSS, undefined)]);
    expect(node.textContent || "").toContain("sin ubicación");
  });
});

describe("Compatibilidad histórica", () => {
  it("un partido legacy mantiene su rejilla 3×3, identificada como histórica", () => {
    const node = render([ev("1", ActionType.SHOT, "B2"), ev("2", ActionType.LOSS, "A1")]);
    const text = node.textContent || "";

    expect(isLegacyMatch([ev("1", ActionType.SHOT, "B2")])).toBe(true);
    // 6 mapas × 9 celdas, y ni una sola del sistema nuevo.
    expect(node.querySelectorAll("[aria-label^='Franja ']")).toHaveLength(54);
    expect(zoneCells(node)).toHaveLength(0);
    expect(text).toContain("perspectiva de ataque no registrada");
  });

  it("NO convierte el histórico a las 12 zonas", () => {
    const node = render([ev("1", ActionType.SHOT, "B2")]);
    const labels = Array.from(node.querySelectorAll("[aria-label]")).map((n) =>
      n.getAttribute("aria-label"),
    );
    expect(labels.some((l) => l?.startsWith("Zona "))).toBe(false);
    expect(labels).toContain("Franja 2 · banda central");
  });

  it("un sector nuevo manda sobre uno histórico: no se mezclan sistemas", () => {
    expect(isLegacyMatch([ev("1", ActionType.SHOT, "Z3C"), ev("2", ActionType.SHOT, "B2")])).toBe(false);
    const node = render([ev("1", ActionType.SHOT, "Z3C"), ev("2", ActionType.SHOT, "B2")]);
    expect(zoneCells(node)).toHaveLength(72);
  });

  it("un partido sin zonas registradas usa el sistema NUEVO, no el histórico", () => {
    // Presentarlo como rejilla histórica mentiría sobre el origen del dato.
    expect(isLegacyMatch([ev("1", ActionType.SHOT, undefined)])).toBe(false);
    expect(render([ev("1", ActionType.SHOT, undefined)]).querySelectorAll("[data-testid='pitch-markings']")).toHaveLength(6);
  });
});

describe("Ajuste a la página A4", () => {
  // jsdom no tiene motor de maquetación (offsetHeight es siempre 0), así que
  // esto comprueba el PRESUPUESTO geométrico, no píxeles renderizados. Es la
  // magnitud que importa: la captura se inserta con
  // addImage(..., pdfW, min(pdfH, pdfW*aspecto)), de modo que una página más
  // alta que A4 no se recorta — se comprime, y los mapas salen deformados.
  it("las seis pistas caben en el alto disponible de la página", () => {
    expect(zoneMapGridHeight()).toBeLessThanOrEqual(zoneMapAvailableHeight());
  });

  it("cada pista cabe en el ancho de su columna", () => {
    expect(ZONE_MAP_PAGE.PITCH_W).toBeLessThanOrEqual(zoneMapColumnWidth());
  });

  it("la rejilla es de 2 columnas × 3 filas, priorizando legibilidad", () => {
    expect(ZONE_MAP_PAGE.COLS).toBe(2);
    expect(ZONE_MAP_PAGE.ROWS).toBe(3);
    expect(ZONE_MAP_PAGE.COLS * ZONE_MAP_PAGE.ROWS).toBe(buildZoneMaps([]).length);
  });
});
