/**
 * La fila y las páginas de fases, renderizadas de verdad.
 *
 * SSR, no jsdom, para el color: `cssstyle` descarta el longhand
 * `background-color` cuando el shorthand `background` se fijó antes, así que
 * un volcado de jsdom enseña las pistas sin calor aunque el navegador las
 * pinte. Lo que se compara aquí es el HTML que React genera, que es lo que
 * `html-to-image` acaba capturando.
 */
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ActionType, GameEvent, MatchData, Period } from "../../types/futsal";
import {
  PHASE_PAGES,
  PHASE_PERSPECTIVE_NOTE,
  PhaseMetricRow,
  PhaseZoneMapsBoard,
} from "./PhaseZoneMaps";
import { phaseMetric } from "../../utils/phaseAnalysis";
import { partido, partidoHistorico } from "../../utils/phaseAnalysis.test";

const fila = (
  key: Parameters<typeof phaseMetric>[0],
  md: MatchData = partido(),
  period?: Period,
) =>
  renderToStaticMarkup(
    <PhaseMetricRow matchData={md} metric={phaseMetric(key)} period={period} />,
  );

const texto = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** El trozo de HTML de cada mapa de la fila, en orden: primero A, luego B. */
const mapas = (html: string): string[] => {
  const trozos = html.split('data-phase-map="');
  return trozos.slice(1);
};

/**
 * Las celdas de un mapa: rótulo → cifra dibujada.
 *
 * `FutsalPitch` rotula cada sector con su `title` y escribe la cifra dentro,
 * dejando el hueco vacío cuando es cero. Eso es lo que lee el usuario y es lo
 * que se comprueba, sin añadirle atributos al componente.
 */
const celdas = (mapa: string): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const m of mapa.matchAll(/title="(Zona [^"]+)"[^>]*>([^<]*)</g)) {
    out[m[1]] = m[2].trim() === "" ? 0 : Number(m[2].trim());
  }
  return out;
};

/** Los alphas pintados dentro de un trozo de HTML. */
const alphas = (html: string, rgb: string) =>
  [...html.matchAll(new RegExp(`rgba\\(${rgb}, ([\\d.]+)\\)`, "g"))].map((m) => Number(m[1]));

// ── 1 · DOS MAPAS, NI UNO MÁS ───────────────────────────────────────────

describe("1 · cada métrica enseña exactamente dos mapas", () => {
  it("y son los de su par de fases", () => {
    const html = fila("losses");
    expect([...html.matchAll(/data-phase-map="([^"]*)"/g)].map((m) => m[1])).toEqual([
      "attack_positional",
      "attack_transition",
    ]);
  });

  it("las recuperaciones contrastan las dos fases defensivas", () => {
    expect([...fila("recoveries").matchAll(/data-phase-map="([^"]*)"/g)].map((m) => m[1])).toEqual([
      "defense_organized",
      "defense_transition",
    ]);
  });

  it("«otras» y «sin fase» se declaran, pero no estrenan mapa", () => {
    const html = fila("losses");
    expect(html).toContain("data-phase-other");
    expect(html).toContain("data-phase-unset");
    expect([...html.matchAll(/data-phase-map=/g)]).toHaveLength(2);
  });
});

// ── 2 · LO QUE DICE LA FILA ─────────────────────────────────────────────

describe("2 · cobertura, recuentos y reconciliación", () => {
  it("la cobertura va ANTES de los mapas", () => {
    const html = fila("losses");
    expect(html.indexOf("Cobertura de fase")).toBeLessThan(html.indexOf("data-phase-map"));
    expect(texto(html)).toContain("Cobertura de fase · 8/9 · 88,9 %");
    expect(texto(html)).toContain("1 sin fase registrada");
  });

  it("cada mapa lleva su recuento y lo que no se pudo dibujar", () => {
    const t = texto(fila("losses"));
    expect(t).toContain("Ataque posicional · 6 · 1 sin ubicación");
    expect(t).toContain("Transición ofensiva · 1");
  });

  it("la línea de reconciliación cierra el total", () => {
    expect(texto(fila("losses"))).toContain(
      "Ataque posicional 6 + Transición ofensiva 1 + otras fases registradas 1 + sin fase 1 = 9",
    );
  });

  it("«otras» aparece con el nombre de la fase real", () => {
    expect(texto(fila("losses"))).toContain("Otras fases registradas · Defensa organizada 1");
    expect(texto(fila("recoveries"))).toContain("Otras fases registradas · Ataque posicional 1");
  });

  it("sin «otras» ni «sin fase» no se imprimen bloques vacíos", () => {
    const html = fila("shots");
    expect(html).not.toContain("data-phase-other");
    expect(html).not.toContain("data-phase-unset");
    expect(texto(html)).not.toContain("Otras fases registradas");
  });
});

// ── 3 · GOLES, PENALTI Y BALÓN PARADO ───────────────────────────────────

describe("3 · el gol se enseña como subconjunto", () => {
  it("«3 · 1 gol», nunca «3 + 1»", () => {
    const t = texto(fila("shots"));
    expect(t).toContain("Transición ofensiva · 3 · 1 gol");
    expect(t).toContain("= 7 (incluye 1 gol)");
    expect(t).not.toMatch(/3 \+ 1/);
  });

  it("el penalti se declara aparte de «sin ubicación»", () => {
    const t = texto(fila("shots"));
    expect(t).toContain("Ataque posicional · 4 · 0 goles · 1 desde el punto de penalti");
    expect(t).not.toContain("Ataque posicional · 4 · 0 goles · 1 sin ubicación");
  });

  it("el tiro de córner cuenta en su fase, sin filtro de juego abierto", () => {
    // Zona 4 · izquierda solo la ocupa el tiro de córner: si se filtrara por
    // «juego abierto», esa celda se quedaría vacía.
    expect(celdas(mapas(fila("shots"))[0])["Zona 4 · izquierda"]).toBe(1);
  });
});

// ── 4 · COLOR ───────────────────────────────────────────────────────────

describe("4 · la escala se comparte entre las dos fases de la fila", () => {
  it("la misma cifra se pinta igual en los dos mapas", () => {
    // Pérdidas: sharedMax 2. El mapa B solo tiene celdas de 1, y con escala
    // compartida valen 0.18 + (1/2)*0.55 = 0.455. Sin `maxOverride` su máximo
    // local sería 1 y se pintarían a 0.73: el mismo 1 parecería el doble de
    // intenso que en el mapa A, que es justo la lectura falsa que esto evita.
    const naranja = "234, 88, 12";
    const [a, b] = mapas(fila("losses"));
    expect(celdas(a)["Zona 2 · izquierda"]).toBe(2);
    expect(celdas(b)["Zona 4 · derecha"]).toBe(1);
    expect(alphas(a, naranja)).toContain(0.73); // la celda de 2, que ES el máximo
    expect(alphas(a, naranja)).toContain(0.455); // las de 1, en el mismo mapa
    expect(alphas(b, naranja)).toEqual([0.455]); // y la de 1 del otro mapa, igual
  });

  it("al acotar a la 1ª parte el máximo baja y el tono sube", () => {
    const naranja = "234, 88, 12";
    // En la 1ª parte ninguna celda pasa de 1, así que 1 ES el máximo.
    expect(alphas(fila("losses", partido(), Period.FIRST), naranja)).toContain(0.73);
  });

  it("cada métrica usa su propio color, nunca uno prestado", () => {
    expect(fila("losses")).toContain("rgba(234, 88, 12");
    expect(fila("recoveries")).toContain("rgba(147, 51, 234");
    expect(fila("shots")).toContain("rgba(37, 99, 235");
    expect(fila("rivalShots")).toContain("rgba(220, 38, 38");
  });

  it("una celda a cero no se pinta", () => {
    const [a] = mapas(fila("rivalShots"));
    const c = celdas(a);
    expect(Object.keys(c)).toHaveLength(12);
    expect(c["Zona 1 · izquierda"]).toBe(0);
    // Solo dos sectores tienen acciones, así que solo dos pueden llevar color.
    expect(alphas(a, "220, 38, 38")).toHaveLength(2);
  });
});

// ── 5 · MIRRORING ───────────────────────────────────────────────────────

describe("5 · el rival mantiene su perspectiva y nuestra fase", () => {
  it("los rótulos de portería son los del rival", () => {
    const t = texto(fila("rivalShots"));
    expect(t).toContain("Ataque rival");
    expect(t).toContain("Nuestra portería");
    expect(texto(fila("shots"))).toContain("Portería propia");
  });

  it("los sectores del rival no se espejan", () => {
    const c = celdas(mapas(fila("rivalShots"))[0]);
    expect(c["Zona 4 · centro"]).toBe(1);
    expect(c["Zona 2 · derecha"]).toBe(1);
    // El espejo de Z4C es Z1C y el de Z2R es Z3L: ninguno puede tener nada.
    expect(c["Zona 1 · centro"]).toBe(0);
    expect(c["Zona 3 · izquierda"]).toBe(0);
  });

  it("y sus mapas se titulan con NUESTRA fase defensiva", () => {
    const t = texto(fila("rivalShots"));
    expect(t).toContain("Defensa organizada");
    expect(t).toContain("Transición defensiva");
    expect(t).not.toContain("su ataque");
  });
});

// ── 6 · LAS DOS PÁGINAS ─────────────────────────────────────────────────

describe("6 · las páginas del PDF", () => {
  it("son dos, con dos métricas cada una y sin repetirse", () => {
    expect(PHASE_PAGES.map((p) => p.metrics)).toEqual([
      ["losses", "recoveries"],
      ["shots", "rivalShots"],
    ]);
    expect(PHASE_PAGES).toHaveLength(2);
  });

  it("cada página dibuja cuatro mapas y lleva la nota de perspectiva", () => {
    for (const p of PHASE_PAGES) {
      const html = renderToStaticMarkup(
        <PhaseZoneMapsBoard matchData={partido()} metrics={p.metrics} />,
      );
      expect([...html.matchAll(/data-phase-map=/g)]).toHaveLength(4);
      expect([...html.matchAll(/data-phase-row=/g)]).toHaveLength(2);
      expect(texto(html)).toContain(PHASE_PERSPECTIVE_NOTE);
      expect(texto(html)).toContain("No indica eficacia");
    }
  });

  it("la leyenda advierte de que no se comparan filas entre sí", () => {
    const html = renderToStaticMarkup(
      <PhaseZoneMapsBoard matchData={partido()} metrics={["losses", "recoveries"]} />,
    );
    expect(texto(html)).toContain("no la compares con otra fila");
  });
});

// ── 7 · PARTIDO SIN FASE ────────────────────────────────────────────────

describe("7 · cobertura cero y partido histórico", () => {
  it("un partido sin ninguna fase registrada no enseña nada inventado", () => {
    const md = partido();
    md.events = md.events.map(({ phaseOfPlay, ...e }) => e as GameEvent);
    const t = texto(fila("losses", md));
    expect(t).toContain("Cobertura de fase · 0/9 · 0,0 %");
    expect(t).toContain("Ataque posicional · 0");
    expect(t).toContain("Transición ofensiva · 0");
    expect(t).toContain("Sin fase registrada · 9");
  });

  it("un histórico de 9 celdas no dibuja sectores nuevos", () => {
    const t = texto(fila("losses", partidoHistorico()));
    expect(t).toContain("Cobertura de fase · 0/1 · 0,0 %");
    expect(t).toContain("Sin acciones ubicadas");
  });
});
