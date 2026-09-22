/**
 * La pantalla de análisis y el PDF cuentan lo mismo.
 *
 * MatchAnalysis ya tenía lo que al PDF le faltaba —selector de equipo,
 * selector de métrica y desglose por celda—, así que aquí NO se rediseña
 * nada: solo se comprueba que sigue estando y que ahora comparte la
 * semántica que el PDF declara, en particular que los goles van DENTRO de
 * los tiros y que la intensidad es relativa a este partido.
 *
 * MatchAnalysis.tsx no se puede montar en jsdom (arrastra la aplicación
 * entera), así que la guardia se hace sobre el fuente, como en el resto de
 * comprobaciones estructurales del proyecto.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fuente = readFileSync(resolve(__dirname, "./MatchAnalysis.tsx"), "utf-8");

describe("17 · la pantalla conserva lo que ya tenía", () => {
  it("mantiene el selector de equipo", () => {
    expect(fuente).toContain("setZoneOpponent(false)");
    expect(fuente).toContain("setZoneOpponent(true)");
    expect(fuente).toContain("{match.teamName}");
    expect(fuente).toContain("{match.opponentName}");
  });

  it("mantiene el selector de métrica con sus seis opciones", () => {
    expect(fuente).toContain("setZoneMetric(metric)");
    for (const etiqueta of ["Todas", "Tiros", "Recuper.", "Pérdidas", "Faltas", "Córners"]) {
      expect(fuente).toContain(`"${etiqueta}"`);
    }
  });

  it("mantiene el desglose por celda", () => {
    expect(fuente).toMatch(/T \{z\.shots\}.*G \{z\.goals\}.*R \{z\.recoveries\}/);
  });

  it("sigue leyendo el MISMO helper que el PDF, sin recuento propio", () => {
    expect(fuente).toContain("zoneMetricValue(z, zoneMetric)");
    // Si alguien volviera a escribir aquí un contador de zonas a mano.
    expect(fuente).not.toMatch(/gridCounts\s*\[/);
  });
});

describe("la pantalla declara la misma semántica que el PDF", () => {
  it("explica qué cuenta el número", () => {
    expect(fuente).toContain("Número = acciones del equipo registradas con origen en esa zona.");
  });

  it("explica que la intensidad es relativa a este partido y no mide eficacia", () => {
    expect(fuente).toContain("Mayor intensidad = mayor volumen relativo dentro de este");
    expect(fuente).toContain("eficacia");
  });

  it("aclara que los goles están incluidos en los tiros", () => {
    expect(fuente).toContain("T = tiros (incluyen los goles)");
  });

  it("no promete rendimiento donde solo hay volumen", () => {
    expect(fuente).not.toMatch(/mejor zona|peor zona|zona más eficaz/i);
    expect(fuente).toContain("Zona con más acciones");
  });
});
