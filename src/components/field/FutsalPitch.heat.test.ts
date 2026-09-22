/**
 * La intensidad de la celda, fijada.
 *
 * El PDF pinta cada zona con `heatStyle(count, max, accent)` y hasta ahora
 * nada impedía cambiar esa fórmula sin darse cuenta. Lo que estos tests
 * anclan no es el número exacto, sino las dos propiedades que la leyenda
 * promete al usuario:
 *
 *   · el tono es RELATIVO al máximo de las celdas que se pintan, así que dos
 *     informes distintos NO son comparables por color;
 *   · a más volumen, más intensidad — y nada más: no mide eficacia.
 */
import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FutsalPitch, heatStyle } from "./FutsalPitch";

/** El componente renderizado a HTML, con o sin máximo externo. */
const render = (counts: Record<string, number>, maxOverride?: number): string =>
  renderToStaticMarkup(
    React.createElement(FutsalPitch, { counts, accent: "#2563eb", maxOverride }),
  );

/** Los alphas de las celdas pintadas, en orden de aparición. */
const alphasDe = (html: string): number[] =>
  [...html.matchAll(/rgba\(37, 99, 235, ([\d.]+)\)/g)].map((m) => Number(m[1]));


const AZUL_PDF = "#2563eb";
const alpha = (count: number, max: number): number | null => {
  const bg = heatStyle(count, max, AZUL_PDF).backgroundColor;
  if (!bg) return null;
  const m = /rgba\([^)]*,\s*([\d.]+)\)$/.exec(bg);
  return m ? Number(m[1]) : null;
};

describe("intensidad de la celda", () => {
  it("una celda vacía no se pinta", () => {
    expect(heatStyle(0, 22, AZUL_PDF)).toEqual({});
    expect(heatStyle(-3, 22, AZUL_PDF)).toEqual({});
  });

  it("el color es RELATIVO: count=max=1 y count=max=22 dan la MISMA intensidad", () => {
    // Es la razón por la que la leyenda dice «relativo dentro de este
    // partido»: un partido con una sola acción ubicada pinta esa celda tan
    // oscura como el 22 del partido real.
    expect(alpha(1, 1)).toBe(alpha(22, 22));
    expect(alpha(5, 5)).toBe(alpha(22, 22));
  });

  it("el máximo de cada partido recibe siempre el tono más oscuro", () => {
    const max = alpha(22, 22)!;
    for (const c of [1, 3, 7, 11, 14, 21]) expect(alpha(c, 22)!).toBeLessThan(max);
  });

  it("es monótona creciente con el volumen, y solo con el volumen", () => {
    const serie = [1, 3, 7, 11, 14, 22].map((c) => alpha(c, 22)!);
    for (let i = 1; i < serie.length; i++) expect(serie[i]).toBeGreaterThan(serie[i - 1]);
  });

  it("la proporción es count/max sobre el rango declarado", () => {
    // 0.18 de suelo + 0.55 de recorrido: la fórmula que la auditoría fijó.
    expect(alpha(22, 22)).toBeCloseTo(0.73, 5);
    expect(alpha(14, 22)).toBeCloseTo(0.18 + (14 / 22) * 0.55, 5);
    expect(alpha(1, 22)).toBeCloseTo(0.18 + (1 / 22) * 0.55, 5);
  });

  it("nunca se sale del rango aunque el recuento supere al máximo", () => {
    expect(alpha(50, 22)).toBe(alpha(22, 22));
  });

  it("usa el color de acento que se le pasa, sin reinventarlo", () => {
    expect(heatStyle(1, 1, AZUL_PDF).backgroundColor).toContain("rgba(37, 99, 235,");
  });
});

// ── MÁXIMO EXTERNO ──────────────────────────────────────────────────────
//
// `maxOverride` existe para que dos mapas que se comparan entre sí usen la
// misma escala. Lo que hay que proteger es lo otro: que TODOS los
// consumidores que no lo pasan sigan pintando exactamente igual que antes.

describe("maxOverride", () => {
  it("12 · ausente: el comportamiento es el de siempre", () => {
    expect(heatStyle(3, 22, AZUL_PDF)).toEqual({ backgroundColor: `rgba(37, 99, 235, ${0.18 + (3 / 22) * 0.55})` });
    // y el componente sin la prop calcula su propio máximo, como hasta ahora
    const sinProp = render({ Z2C: 6, Z4C: 3 });
    const conMaximoLocal = render({ Z2C: 6, Z4C: 3 }, 6);
    expect(sinProp).toBe(conMaximoLocal);
  });

  it("con maxOverride, la misma cifra se pinta MENOS intensa si el máximo es mayor", () => {
    const con6 = alphasDe(render({ Z2C: 3 }, 6));
    const sin = alphasDe(render({ Z2C: 3 }));
    expect(con6[0]).toBeLessThan(sin[0]);
    expect(con6[0]).toBeCloseTo(0.18 + (3 / 6) * 0.55, 5);
    expect(sin[0]).toBeCloseTo(0.73, 5);
  });

  it("dos mapas con el MISMO maxOverride son comparables", () => {
    const a = alphasDe(render({ Z2C: 6 }, 6))[0];
    const b = alphasDe(render({ Z2C: 3 }, 6))[0];
    expect(b).toBeLessThan(a);
  });

  it("13 · no altera ningún recuento: los números de las celdas son los mismos", () => {
    const sin = render({ Z2C: 6, Z4C: 3 });
    const con = render({ Z2C: 6, Z4C: 3 }, 99);
    const cifras = (html: string) => (html.match(/>(\d+)</g) || []).join(",");
    expect(cifras(con)).toBe(cifras(sin));
  });

  it("un maxOverride inutilizable se ignora y cae al máximo local", () => {
    const esperado = render({ Z2C: 6, Z4C: 3 });
    for (const malo of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(render({ Z2C: 6, Z4C: 3 }, malo)).toBe(esperado);
    }
  });

  it("una celda a cero sigue sin pintarse, haya o no maxOverride", () => {
    expect(alphasDe(render({ Z2C: 0, Z4C: 5 }, 10)).length).toBe(1);
  });
});
