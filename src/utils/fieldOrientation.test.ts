import { describe, it, expect } from "vitest";
import { applyFieldFlip } from "./fieldOrientation";

// Requisito D del encargo: "Mismo evento lógico antes/después de invertir
// la presentación produce coordenada lógica coherente." — aquí se
// verifica la transformación de PRESENTACIÓN en sí (no toca datos), con
// puntos conocidos 0/25/50/75/100 antes y después de invertir.
describe("applyFieldFlip", () => {
  it("no altera nada cuando la vista NO está invertida", () => {
    [0, 25, 50, 75, 100].forEach((v) => {
      expect(applyFieldFlip(v, false)).toBe(v);
    });
  });

  it("espeja correctamente los puntos conocidos cuando SÍ está invertida", () => {
    expect(applyFieldFlip(0, true)).toBe(100);
    expect(applyFieldFlip(25, true)).toBe(75);
    expect(applyFieldFlip(50, true)).toBe(50);
    expect(applyFieldFlip(75, true)).toBe(25);
    expect(applyFieldFlip(100, true)).toBe(0);
  });

  it("aplicar el flip dos veces devuelve el valor original (involución)", () => {
    [0, 25, 50, 75, 100].forEach((v) => {
      expect(applyFieldFlip(applyFieldFlip(v, true), true)).toBe(v);
    });
  });

  it("es puramente de presentación: no depende de ni modifica ningún estado externo", () => {
    // La función no recibe matchData/eventos — estructuralmente no puede
    // tocar originGrid/destinationGrid ni ninguna coordenada guardada.
    expect(applyFieldFlip.length).toBe(2); // (uiLeftPercent, isFieldFlipped)
  });
});
