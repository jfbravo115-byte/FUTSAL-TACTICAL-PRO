/**
 * La sección FASES DE JUEGO de la pantalla de análisis.
 *
 * `MatchAnalysis.tsx` arrastra la aplicación entera —router, servicios,
 * Tactical Pro— y no se monta en jsdom, así que el CABLEADO se comprueba
 * sobre el fuente, como en el resto de guardias estructurales del proyecto.
 *
 * Lo que sí se ejecuta de verdad —el reparto, la cobertura, la escala y los
 * dos mapas que la sección dibuja— está probado en `phaseAnalysis.test.ts` y
 * `PhaseZoneMaps.test.tsx`, contra las mismas funciones y el mismo
 * componente que usa esta pantalla. Aquí no se duplica: se exige que sea
 * ESE componente y ESAS funciones, y no una copia paralela.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fuente = readFileSync(resolve(__dirname, "./MatchAnalysis.tsx"), "utf-8");

/** El bloque de la sección, de su ancla de scroll a la de Tiempos. */
const seccion = (() => {
  const ini = fuente.indexOf("<section ref={phasesRef}");
  const fin = fuente.indexOf("<section ref={timesRef}", ini);
  expect(ini).toBeGreaterThan(-1);
  expect(fin).toBeGreaterThan(ini);
  return fuente.slice(ini, fin);
})();

// ── 1 · EXISTE Y SE LLEGA A ELLA ────────────────────────────────────────

describe("1 · la sección existe y está en la navegación", () => {
  it("tiene su propio ancla y su entrada en el índice", () => {
    expect(fuente).toContain("const phasesRef = useRef<HTMLDivElement>(null);");
    expect(fuente).toContain('["Fases", phasesRef, Layers],');
  });

  it("declara de quién es la fase, sin ambigüedad", () => {
    expect(seccion).toContain("Fases de juego");
    expect(seccion).toContain("La fase es siempre la de {match.teamName}");
    expect(seccion).toContain("también en las acciones del rival");
  });
});

// ── 2 · EL ORDEN DE LECTURA ─────────────────────────────────────────────

describe("2 · cobertura antes que mapas", () => {
  it("el bloque de cobertura va delante de los selectores y de los mapas", () => {
    const cobertura = seccion.indexOf("data-phase-coverage");
    const metrica = seccion.indexOf("data-phase-metric");
    const periodo = seccion.indexOf("data-phase-period");
    const mapas = seccion.indexOf("<PhaseMetricRow");
    expect(cobertura).toBeGreaterThan(-1);
    expect([cobertura, metrica, periodo, mapas].every((i) => i > -1)).toBe(true);
    expect([cobertura, metrica, periodo, mapas]).toEqual(
      [cobertura, metrica, periodo, mapas].slice().sort((a, b) => a - b),
    );
  });

  it("la cobertura se calcula sobre la métrica Y el periodo que se ven", () => {
    expect(fuente).toContain(
      "const phaseCoverageNow = phaseCoverage(match, phaseMetric(phaseKey), phasePeriod);",
    );
    expect(seccion).toContain("{phaseCoverageNow.withPhase}/{phaseCoverageNow.total} acciones");
  });

  it("sin acciones no se imprime un 0 % engañoso", () => {
    expect(seccion).toContain('phaseCoverageNow.pct !== null');
    expect(seccion).toContain('" · sin acciones"');
  });

  it("las acciones sin fase se declaran y se dice que no se reparten", () => {
    expect(seccion).toContain("{phaseCoverageNow.withoutPhase} sin fase registrada");
    expect(seccion).toContain("no se reparten entre las fases");
  });
});

// ── 3 · LOS DOS SELECTORES ──────────────────────────────────────────────

describe("3 · métrica y periodo", () => {
  it("el selector de métrica sale de PHASE_METRICS, no de una lista suelta", () => {
    expect(seccion).toContain("{PHASE_METRICS.map((m) => (");
    expect(seccion).toContain("setPhaseKey(m.key)");
    expect(seccion).toContain("{m.shortTitle}");
    // Si alguien escribiera los cuatro botones a mano, se podrían desincronizar.
    for (const suelto of ['"Pérdidas"', '"Recuper."', '"Tiros rival"']) {
      expect(seccion).not.toContain(suelto);
    }
  });

  it("el selector de periodo ofrece TOTAL y solo las partes que existen", () => {
    expect(seccion).toContain("{[undefined, ...phasePeriods(match)].map((p) => (");
    expect(seccion).toContain("setPhasePeriod(p)");
    expect(seccion).toContain('{p === undefined ? "Total" : periodLabel(p)}');
  });

  it("los dos empiezan en un estado que no inventa nada", () => {
    expect(fuente).toContain('useState<PhaseMetricKey>("losses")');
    expect(fuente).toContain("useState<Period | undefined>(undefined)");
  });
});

// ── 4 · SIEMPRE DOS MAPAS ───────────────────────────────────────────────

describe("4 · dos mapas, nunca ocho ni veinticuatro", () => {
  it("se dibuja UNA sola fila, la de la métrica elegida", () => {
    expect(seccion.match(/<PhaseMetricRow/g) ?? []).toHaveLength(1);
    expect(seccion).toContain("metric={phaseMetric(phaseKey)}");
    expect(seccion).toContain("period={phasePeriod}");
  });

  it("y es el MISMO componente que el PDF, no una copia", () => {
    expect(fuente).toContain(
      'import { PhaseMetricRow } from "../components/export/PhaseZoneMaps";',
    );
    expect(seccion).not.toContain("<FutsalPitch");
  });

  it("no se monta el tablero completo de las páginas del informe", () => {
    expect(seccion).not.toContain("PhaseZoneMapsBoard");
    expect(seccion).not.toContain("PHASE_PAGES");
  });
});

// ── 5 · PARTIDO SIN FASE ────────────────────────────────────────────────

describe("5 · histórico: se dice, no se dibuja", () => {
  it("la sección se bifurca por hasPhaseData, no por un recuento propio", () => {
    expect(seccion).toContain("{!hasPhaseData(match) ? (");
    expect(seccion).toContain("data-phase-empty");
  });

  it("el aviso dice qué pasa y por qué no se rellena", () => {
    expect(seccion).toContain("Fase de juego no registrada en este partido.");
    expect(seccion).toContain("la ausencia no se rellena");
    expect(seccion).toContain("sería inventarla");
  });

  it("y en esa rama no hay ningún mapa", () => {
    const rama = seccion.slice(seccion.indexOf("data-phase-empty"), seccion.indexOf(") : ("));
    expect(rama).not.toContain("PhaseMetricRow");
    expect(rama).not.toContain("data-phase-metric");
  });
});

// ── 6 · MÓVIL ───────────────────────────────────────────────────────────

describe("6 · responsive", () => {
  it("los dos selectores pueden desplazarse en horizontal sin romper la página", () => {
    const barras = seccion.match(/overflow-x-auto/g) ?? [];
    expect(barras.length).toBeGreaterThanOrEqual(2);
  });
});

// ── 7 · LO QUE NO SE HA TOCADO ──────────────────────────────────────────

describe("7 · el resto de la pantalla sigue igual", () => {
  it("Datos / Zonas conserva sus dos selectores y su mapa", () => {
    expect(fuente).toContain("setZoneOpponent(false)");
    expect(fuente).toContain("setZoneMetric(metric)");
    expect(fuente).toContain("<PeriodShotMapsBoard");
  });

  it("la sección de fases no toca el estado del mapa de zonas", () => {
    expect(seccion).not.toContain("setZoneMetric");
    expect(seccion).not.toContain("setZoneOpponent");
  });

  it("Tactical Pro no se dispara desde aquí", () => {
    expect(seccion).not.toContain("runAI");
    expect(seccion).not.toContain("streamTacticalReport");
  });
});
