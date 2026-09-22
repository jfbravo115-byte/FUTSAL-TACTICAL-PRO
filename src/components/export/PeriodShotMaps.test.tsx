// @vitest-environment jsdom
/**
 * Mapas de tiros separados por parte.
 *
 * El cuerpo técnico pedía poder leer «desde dónde se tiró en la primera» y
 * «desde dónde en la segunda» por separado. La información ya estaba en cada
 * evento (`GameEvent.period`): estos tests fijan que se usa esa y no un campo
 * nuevo, y que las dos mitades siguen siendo comparables.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { ActionType, GameEvent, GameState, GoalieAction, Period } from "../../types/futsal";
import {
  PeriodShotMapsBoard,
  buildPeriodShotMaps,
  periodLabel,
  reconciliationLine,
  sharedShotMax,
  shotMapPeriods,
  unlocatedCount,
} from "./PeriodShotMaps";

let seq = 0;
function ev(
  type: ActionType | GoalieAction,
  period: Period,
  originGrid?: string,
  isOpponent = false,
): GameEvent {
  return {
    id: `e${++seq}`,
    timestamp: 0,
    wallClock: 0,
    period,
    playerIds: [],
    type,
    gameState: GameState.FOUR_VS_FOUR,
    originGrid,
    metadata: { isOpponent },
  };
}

function render(events: GameEvent[], opponent = false): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(<PeriodShotMapsBoard events={events} opponent={opponent} />);
  });
  return host;
}

const mapOf = (maps: ReturnType<typeof buildPeriodShotMaps>, period: Period) =>
  maps.find((m) => m.period === period)!;

describe("1-3 · cada parte lleva sus tiros y la suma cuadra", () => {
  const partido = [
    ev(ActionType.SHOT, Period.FIRST, "Z3C"),
    ev(ActionType.SHOT, Period.FIRST, "Z4L"),
    ev(ActionType.GOAL, Period.FIRST, "Z4C"),
    ev(ActionType.SHOT, Period.SECOND, "Z2R"),
    ev(ActionType.SHOT, Period.SECOND, "Z3C"),
    // Ruido que no es un tiro: no debe aparecer en ningún mapa.
    ev(ActionType.STEAL, Period.FIRST, "Z1C"),
    ev(ActionType.LOSS, Period.SECOND, "Z2C"),
  ];

  it("1 · el mapa de la 1ª parte contiene SOLO tiros de la 1ª parte", () => {
    const primera = mapOf(buildPeriodShotMaps(partido, false), Period.FIRST);
    expect(primera.events).toHaveLength(3);
    expect(primera.events.every((e) => e.period === Period.FIRST)).toBe(true);
  });

  it("2 · el mapa de la 2ª parte contiene SOLO tiros de la 2ª parte", () => {
    const segunda = mapOf(buildPeriodShotMaps(partido, false), Period.SECOND);
    expect(segunda.events).toHaveLength(2);
    expect(segunda.events.every((e) => e.period === Period.SECOND)).toBe(true);
  });

  it("3 · 1ª + 2ª reconcilia con el total del partido", () => {
    const maps = buildPeriodShotMaps(partido, false);
    const suma = maps.reduce((acc, m) => acc + m.events.length, 0);
    expect(suma).toBe(5);
    expect(reconciliationLine(maps, suma)).toBe("1ª parte 3 · 2ª parte 2 · Total 5");
  });

  it("los tiros del rival no se cuelan en los nuestros", () => {
    const mixto = [
      ev(ActionType.SHOT, Period.FIRST, "Z3C"),
      ev(ActionType.SHOT, Period.FIRST, "Z3C", true),
      ev(ActionType.SHOT, Period.SECOND, "Z2C", true),
    ];
    expect(buildPeriodShotMaps(mixto, false).reduce((a, m) => a + m.events.length, 0)).toBe(1);
    expect(buildPeriodShotMaps(mixto, true).reduce((a, m) => a + m.events.length, 0)).toBe(2);
  });
});

describe("4 · un tiro sin sector cuenta, pero no se dibuja en ninguna celda", () => {
  const conHuecos = [
    ev(ActionType.SHOT, Period.FIRST, "Z3C"),
    ev(ActionType.SHOT, Period.FIRST, undefined),
    ev(ActionType.SHOT, Period.FIRST, undefined),
  ];

  it("sigue sumando al total de su parte", () => {
    const primera = mapOf(buildPeriodShotMaps(conHuecos, false), Period.FIRST);
    expect(primera.events).toHaveLength(3);
    expect(unlocatedCount(primera)).toBe(2);
  });

  it("y se declara a la vista en vez de esconderse", () => {
    const node = render(conHuecos);
    expect(node.textContent || "").toContain("2 sin ubicación");
    expect(node.textContent || "").toContain("3 tiros");
  });

  it("una parte sin tiros se muestra vacía: un mapa vacío es información", () => {
    const node = render([ev(ActionType.SHOT, Period.FIRST, "Z3C")]);
    expect(node.textContent || "").toContain("1ª parte");
    expect(node.textContent || "").toContain("2ª parte");
  });
});

describe("5 · los sectores NO se invierten por el cambio de campo", () => {
  it("el mismo sector cuenta igual en las dos partes", () => {
    // Z4C está normalizado a la perspectiva del que ejecuta, así que
    // significa lo mismo antes y después del cambio de campo. Espejarlo por
    // attackDirection haría incomparables las dos mitades.
    const maps = buildPeriodShotMaps(
      [ev(ActionType.SHOT, Period.FIRST, "Z4C"), ev(ActionType.SHOT, Period.SECOND, "Z4C")],
      false,
    );
    expect(mapOf(maps, Period.FIRST).events[0].originGrid).toBe("Z4C");
    expect(mapOf(maps, Period.SECOND).events[0].originGrid).toBe("Z4C");
  });

  it("el componente no consulta la dirección de ataque en absoluto", () => {
    const fuente = fs.readFileSync(path.resolve(__dirname, "PeriodShotMaps.tsx"), "utf-8");
    const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const prohibido of ["attackDirection", "mirrorZone12", "resolveEventDirection"]) {
      expect(codigo).not.toContain(prohibido);
    }
  });

  it("tampoco inventa un campo nuevo: lee GameEvent.period", () => {
    const fuente = fs.readFileSync(path.resolve(__dirname, "PeriodShotMaps.tsx"), "utf-8");
    expect(fuente).toContain("e.period === period");
  });
});

describe("compatibilidad con periodos adicionales", () => {
  it("las dos partes salen siempre; la prórroga solo si se jugó", () => {
    expect(shotMapPeriods([])).toEqual([Period.FIRST, Period.SECOND]);
    expect(
      shotMapPeriods([ev(ActionType.SHOT, Period.OVERTIME_1, "Z3C")]),
    ).toEqual([Period.FIRST, Period.SECOND, Period.OVERTIME_1]);
  });

  it("un periodo inesperado se presenta en vez de perderse", () => {
    const raro = ev(ActionType.SHOT, 7 as Period, "Z3C");
    expect(shotMapPeriods([raro])).toContain(7);
    expect(periodLabel(7)).toBe("Periodo 7");
  });

  it("una recuperación en prórroga no abre un mapa de tiros", () => {
    expect(shotMapPeriods([ev(ActionType.STEAL, Period.OVERTIME_1, "Z1C")])).toEqual([
      Period.FIRST,
      Period.SECOND,
    ]);
  });
});

describe("presentación", () => {
  it("dibuja una pista real por parte, no una matriz", () => {
    const node = render([ev(ActionType.SHOT, Period.FIRST, "Z3C")]);
    expect(node.querySelectorAll("[data-testid='pitch-markings']")).toHaveLength(2);
  });

  it("el mapa del rival se rotula desde nuestra portería", () => {
    const node = render([ev(ActionType.SHOT, Period.FIRST, "Z3C", true)], true);
    expect(node.textContent || "").toContain("Nuestra portería");
    expect(node.textContent || "").toContain("Tiros recibidos — 1ª parte");
  });

  it("no enseña ni un código interno de sector", () => {
    const node = render([ev(ActionType.SHOT, Period.FIRST, "Z3C")]);
    expect(node.textContent || "").not.toMatch(/\bZ[1-4][LCR]\b/);
  });
});

// ── ESCALA COMPARTIDA ───────────────────────────────────────────────────
//
// DEFECTO QUE ESTO CORRIGE
// ------------------------
// Cada pista se normalizaba contra su propio máximo, así que una primera
// parte con 4 tiros en una zona y una segunda con 1 se pintaban exactamente
// igual de oscuras: el color decía que las dos mitades fueron iguales cuando
// no lo fueron, que es justo lo contrario de lo que esta página viene a
// permitir. Los recuentos no cambian — solo el color.

describe("29 · las dos partes comparten la escala de color", () => {
  const partido = [
    ...Array.from({ length: 4 }, () => ev(ActionType.SHOT, Period.FIRST, "Z3C")),
    ev(ActionType.SHOT, Period.SECOND, "Z3C"),
  ];

  /** Alphas de las celdas pintadas con el ACENTO (#2563eb). Las vacías llevan
   *  el relleno neutro de la pista y no cuentan. */
  const alphas = (host: HTMLElement) =>
    Array.from(host.querySelectorAll<HTMLElement>("[aria-label]"))
      .map((n) => /^rgba\(37,\s*99,\s*235,\s*([\d.]+)\)$/.exec(n.style.backgroundColor)?.[1])
      .filter((a): a is string => !!a)
      .map(Number);

  it("sharedShotMax es el máximo de TODAS las partes", () => {
    expect(sharedShotMax(buildPeriodShotMaps(partido, false))).toBe(4);
  });

  it("4 y 1 ya NO se pintan igual", () => {
    const pintados = alphas(render(partido));
    expect(pintados.length).toBe(2);
    const [mayor, menor] = [Math.max(...pintados), Math.min(...pintados)];
    expect(menor).toBeLessThan(mayor);
    // jsdom redondea el alpha a tres decimales al serializar el estilo.
    expect(mayor).toBeCloseTo(0.18 + (4 / 4) * 0.55, 2);
    expect(menor).toBeCloseTo(0.18 + (1 / 4) * 0.55, 2);
  });

  it("los recuentos de las celdas no cambian", () => {
    const host = render(partido);
    const texto = (host.textContent || "").replace(/\s+/g, " ");
    expect(texto).toContain("1ª parte 4");
    expect(texto).toContain("2ª parte 1");
    expect(texto).toContain("Total 5");
  });

  it("la leyenda dice que la escala se comparte", () => {
    expect((render(partido).textContent || "").replace(/\s+/g, " ")).toContain(
      "La escala de color se comparte entre las partes",
    );
  });

  it("un partido sin tiros no rompe la escala", () => {
    expect(sharedShotMax(buildPeriodShotMaps([], false))).toBe(1);
  });
});
