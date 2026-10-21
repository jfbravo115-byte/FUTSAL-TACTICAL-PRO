/**
 * Las dos escalas de carga: TOT y ROT, por separado y por equipo.
 *
 * Lo que se protege aquí es el caso que motivó todo esto: el jugador que más
 * ha jugado puede acabar de entrar, y el que menos puede llevar el rato más
 * largo sin descansar. Con una sola clasificación ese cruce no se ve, y es
 * justo el que decide una rotación.
 */
import { describe, expect, it } from "vitest";
import {
  LOAD_LABEL,
  bothTeamsTimeScales,
  loadHue,
  safeSeconds,
  teamTimeScales,
  timeLoadAriaLabel,
  timeLoadColor,
} from "./timeLoadColor";

/** Tono de un color hsl() devuelto por la escala. */
const tono = (css: string) => Number(css.match(/hsl\(([-\d.]+)/)![1]);

/** Luminancia relativa de un hsl(h, s%, l%), para medir contraste. */
function luminancia(css: string): number {
  const [h, s, l] = css.match(/[-\d.]+/g)!.map(Number);
  const c = (1 - Math.abs((2 * l) / 100 - 1)) * (s / 100);
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l / 100 - c / 2;
  const [r, g, b] = (
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  ).map((v) => {
    const u = v + m;
    return u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contraste = (a: string, b: string) => {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe("1 · el caso principal: TOT y ROT cruzados", () => {
  // A ha jugado mucho pero acaba de entrar; B ha jugado poco y lleva un buen
  // rato seguido. Los dos valores de cada uno apuntan a lados opuestos.
  const totales = [20 * 60, 8 * 60];
  const rotaciones = [1 * 60, 4 * 60];
  const aTot = timeLoadColor(20 * 60, totales);
  const bTot = timeLoadColor(8 * 60, totales);
  const aRot = timeLoadColor(1 * 60, rotaciones);
  const bRot = timeLoadColor(4 * 60, rotaciones);

  it("A: TOT al rojo y ROT al verde", () => {
    expect(aTot.normalized).toBe(1);
    expect(aTot.level).toBe("high");
    expect(tono(aTot.foreground)).toBeCloseTo(0, 1);      // rojo
    expect(aRot.normalized).toBe(0);
    expect(aRot.level).toBe("low");
    expect(tono(aRot.foreground)).toBeCloseTo(140, 1);    // verde
  });

  it("B: TOT al verde y ROT al rojo", () => {
    expect(bTot.normalized).toBe(0);
    expect(tono(bTot.foreground)).toBeCloseTo(140, 1);
    expect(bRot.normalized).toBe(1);
    expect(tono(bRot.foreground)).toBeCloseTo(0, 1);
  });

  it("y los dos valores de un mismo jugador NO comparten clasificación", () => {
    expect(aTot.level).not.toBe(aRot.level);
    expect(bTot.level).not.toBe(bRot.level);
    expect(aTot.foreground).not.toBe(aRot.foreground);
  });

  it("TOT y ROT usan mínimos y máximos distintos", () => {
    // Si compartieran extremos, 60 s de rotación quedaría casi en el mínimo
    // de los totales y A saldría verde en las dos.
    expect(Math.min(...totales)).not.toBe(Math.min(...rotaciones));
    expect(Math.max(...totales)).not.toBe(Math.max(...rotaciones));
    expect(timeLoadColor(60, totales).normalized).toBeCloseTo(0, 2);
    expect(timeLoadColor(60, rotaciones).normalized).toBe(0);
    expect(timeLoadColor(4 * 60, totales).normalized).toBeLessThan(
      timeLoadColor(4 * 60, rotaciones).normalized!,
    );
  });
});

describe("2 · la rampa de color", () => {
  it("0 verde · 0,5 amarillo · 1 rojo, y naranja en medio de la subida", () => {
    expect(loadHue(0)).toBe(140);
    expect(loadHue(0.5)).toBe(55);
    expect(loadHue(1)).toBe(0);
    expect(loadHue(0.75)).toBeCloseTo(27.5, 1);   // naranja
    expect(loadHue(0.25)).toBeCloseTo(97.5, 1);   // verde-lima
  });

  it("es monótona: más carga nunca es más verde", () => {
    let previo = Infinity;
    for (let n = 0; n <= 1.0001; n += 0.05) {
      const h = loadHue(n);
      expect(h).toBeLessThanOrEqual(previo + 1e-9);
      previo = h;
    }
  });

  it("fuera de rango se recorta en vez de dar un color imposible", () => {
    expect(loadHue(-3)).toBe(140);
    expect(loadHue(9)).toBe(0);
  });

  it("los cuatro tramos se leen: contraste suficiente sobre su fondo", () => {
    const valores = [0, 100];
    for (const v of [0, 25, 50, 75, 100]) {
      const c = timeLoadColor(v, valores);
      expect(contraste(c.foreground, c.background), `n=${v}`).toBeGreaterThanOrEqual(4.5);
    }
    const neutro = timeLoadColor(5, [5, 5]);
    expect(contraste(neutro.foreground, neutro.background)).toBeGreaterThanOrEqual(4.5);
  });

  it("nunca devuelve un color CSS inválido", () => {
    const casos: [number, number[]][] = [
      [NaN, [1, 2]], [-5, [1, 2]], [Infinity, [1, 2]], [1, [NaN, Infinity]],
      [0, []], [0, [0]], [3, [3, 3, 3]],
    ];
    for (const [v, vs] of casos) {
      const c = timeLoadColor(v, vs);
      for (const css of [c.foreground, c.background, c.border]) {
        expect(css, `${v} en ${JSON.stringify(vs)}`).toMatch(/^hsl\(-?\d+(\.\d+)?, \d+%, \d+%\)$/);
      }
    }
  });
});

describe("3 · casos límite", () => {
  it("todos iguales → neutro, ni todos rojos ni todos verdes", () => {
    const iguales = [300, 300, 300];
    for (const v of iguales) {
      const c = timeLoadColor(v, iguales);
      expect(c.level).toBe("neutral");
      expect(c.normalized).toBeNull();
      expect(tono(c.foreground)).toBe(215);  // pizarra, no de la rampa
    }
  });

  it("un solo valor → neutro", () => {
    expect(timeLoadColor(42, [42]).level).toBe("neutral");
    expect(timeLoadColor(42, []).level).toBe("neutral");
  });

  it("valores imposibles se normalizan con la regla del modelo temporal", () => {
    expect(safeSeconds(-1)).toBe(0);
    expect(safeSeconds(NaN)).toBe(0);
    expect(safeSeconds(Infinity)).toBe(0);
    expect(safeSeconds(undefined)).toBe(0);
    expect(safeSeconds(12.5)).toBe(12.5);
    // Un NaN en el conjunto cuenta como 0 y no rompe la escala.
    const c = timeLoadColor(100, [NaN, 100]);
    expect(c.normalized).toBe(1);
  });

  it("empates: mismo tiempo, exactamente el mismo color", () => {
    const vs = [0, 0, 60, 120, 120];
    const ceros = vs.filter((v) => v === 0).map((v) => timeLoadColor(v, vs));
    const topes = vs.filter((v) => v === 120).map((v) => timeLoadColor(v, vs));
    expect(ceros[0]).toEqual(ceros[1]);
    expect(topes[0]).toEqual(topes[1]);
    expect(ceros[0].normalized).toBe(0);     // varios mínimos → todos verdes
    expect(topes[0].normalized).toBe(1);     // varios máximos → todos rojos
    expect(tono(ceros[0].foreground)).toBeCloseTo(140, 1);
    expect(tono(topes[0].foreground)).toBeCloseTo(0, 1);
  });

  it("y la señal corta no depende del color", () => {
    const vs = [0, 50, 100];
    expect(timeLoadColor(0, vs).marker).toBe("↓");
    expect(timeLoadColor(50, vs).marker).toBe("=");
    expect(timeLoadColor(100, vs).marker).toBe("↑");
    expect(timeLoadColor(7, [7]).marker).toBe("=");
  });

  it("el rótulo hablado explica el nivel, no el color", () => {
    expect(timeLoadAriaLabel("tot", "05:42", "low")).toBe("Tiempo total 05:42 · menor carga del equipo");
    expect(timeLoadAriaLabel("rot", "03:10", "high")).toBe("Rotación 03:10 · mayor duración actual del equipo"
      .replace("mayor duración actual del equipo", LOAD_LABEL.high));
    expect(LOAD_LABEL.neutral).toBe("sin comparación posible");
  });
});

describe("4 · quién entra en cada escala", () => {
  const jug = (o: Partial<Parameters<typeof teamTimeScales>[0][number]> = {}) => ({
    id: "x", isOpponent: false, isOnPitch: true, role: "Jugador",
    individualTimeSeconds: 0, rotationTimeSeconds: 0, ...o,
  });

  it("TOT compara a TODOS los convocados; el suplente a cero es el verde", () => {
    const equipo = [
      jug({ id: "a", individualTimeSeconds: 600 }),
      jug({ id: "b", individualTimeSeconds: 300 }),
      jug({ id: "s", isOnPitch: false, individualTimeSeconds: 0 }),
    ];
    const { tot } = teamTimeScales(equipo, false);
    expect(tot).toEqual([600, 300, 0]);
    expect(timeLoadColor(0, tot).normalized).toBe(0);
    expect(timeLoadColor(600, tot).normalized).toBe(1);
  });

  it("ROT compara SOLO a los que están en pista", () => {
    const equipo = [
      jug({ id: "a", isOnPitch: true, rotationTimeSeconds: 120 }),
      jug({ id: "b", isOnPitch: true, rotationTimeSeconds: 40 }),
      jug({ id: "s", isOnPitch: false, rotationTimeSeconds: 999 }),
    ];
    const { rot } = teamTimeScales(equipo, false);
    expect(rot).toEqual([120, 40]);
    expect(rot).not.toContain(999);
  });

  it("los equipos no se mezclan nunca", () => {
    const todos = [
      jug({ id: "L1", isOpponent: false, individualTimeSeconds: 100, rotationTimeSeconds: 10 }),
      jug({ id: "L2", isOpponent: false, individualTimeSeconds: 200, rotationTimeSeconds: 20 }),
      jug({ id: "R1", isOpponent: true, individualTimeSeconds: 900, rotationTimeSeconds: 900 }),
      jug({ id: "R2", isOpponent: true, individualTimeSeconds: 950, rotationTimeSeconds: 950 }),
    ];
    const { team, opponent } = bothTeamsTimeScales(todos);
    expect(team.tot).toEqual([100, 200]);
    expect(opponent.tot).toEqual([900, 950]);
    // El local con 200 s es el MÁXIMO de los suyos aunque el rival lleve 950.
    expect(timeLoadColor(200, team.tot).normalized).toBe(1);
    expect(timeLoadColor(200, [...team.tot, ...opponent.tot]).normalized).toBeLessThan(0.2);
  });

  it("el cuerpo técnico no entra en ninguna escala", () => {
    const equipo = [
      jug({ id: "a", individualTimeSeconds: 100 }),
      jug({ id: "e", role: "Entrenador", isOnPitch: false, individualTimeSeconds: 99999 }),
      jug({ id: "d", role: "Delegado", isOnPitch: false, individualTimeSeconds: 88888 }),
    ];
    const { tot } = teamTimeScales(equipo, false);
    expect(tot).toEqual([100]);
  });

  it("una sustitución recalcula ROT: el que entra arranca el conjunto nuevo", () => {
    const antes = [
      jug({ id: "a", isOnPitch: true, rotationTimeSeconds: 240 }),
      jug({ id: "b", isOnPitch: true, rotationTimeSeconds: 120 }),
      jug({ id: "s", isOnPitch: false, rotationTimeSeconds: 0 }),
    ];
    expect(timeLoadColor(240, teamTimeScales(antes, false).rot).normalized).toBe(1);
    // Entra `s` por `b`: el conjunto ROT cambia y la clasificación con él.
    const despues = [
      jug({ id: "a", isOnPitch: true, rotationTimeSeconds: 240 }),
      jug({ id: "b", isOnPitch: false, rotationTimeSeconds: 120 }),
      jug({ id: "s", isOnPitch: true, rotationTimeSeconds: 0 }),
    ];
    const rotDespues = teamTimeScales(despues, false).rot;
    expect(rotDespues).toEqual([240, 0]);
    expect(timeLoadColor(0, rotDespues).normalized).toBe(0);   // el que entra, verde
    expect(timeLoadColor(240, rotDespues).normalized).toBe(1); // el otro, rojo
    // Y su TOT no se ha movido por entrar.
    expect(teamTimeScales(despues, false).tot).toEqual(teamTimeScales(antes, false).tot);
  });

  it("con el reloj parado, los mismos segundos dan los mismos colores", () => {
    const equipo = [
      jug({ id: "a", individualTimeSeconds: 100, rotationTimeSeconds: 10 }),
      jug({ id: "b", individualTimeSeconds: 300, rotationTimeSeconds: 90 }),
    ];
    const una = teamTimeScales(equipo, false);
    const otra = teamTimeScales(equipo, false);
    expect(timeLoadColor(100, una.tot)).toEqual(timeLoadColor(100, otra.tot));
    expect(timeLoadColor(10, una.rot)).toEqual(timeLoadColor(10, otra.rot));
  });

  it("y esto es una función pura: ni reloj, ni estado, ni DOM", () => {
    const fuente = timeLoadColor.toString() + teamTimeScales.toString();
    expect(fuente).not.toMatch(/setInterval|setTimeout|Date\.now|useState|document/);
  });
});
