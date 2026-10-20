/**
 * El formato de los cronómetros de jugador.
 *
 * Lo comparten la ficha de la vista focal, la de la pista 5v5 y el CSV. Si
 * cada una redondeara a su manera, el mismo jugador mostraría dos tiempos
 * distintos en dos sitios distintos de la misma pantalla.
 */
import { describe, expect, it } from "vitest";
import { formatPlayerTime, playerClocks } from "./playerClock";

describe("formatPlayerTime", () => {
  it("mm:ss siempre con dos cifras", () => {
    expect(formatPlayerTime(0)).toBe("00:00");
    expect(formatPlayerTime(5)).toBe("00:05");
    expect(formatPlayerTime(59)).toBe("00:59");
    expect(formatPlayerTime(60)).toBe("01:00");
    expect(formatPlayerTime(342)).toBe("05:42");
    expect(formatPlayerTime(3599)).toBe("59:59");
    expect(formatPlayerTime(3600)).toBe("60:00");
  });

  it("trunca, no redondea: un segundo no empieza hasta que pasa", () => {
    // El tick suma deltas de 100 ms, así que los valores llegan con decimales.
    expect(formatPlayerTime(59.9)).toBe("00:59");
    expect(formatPlayerTime(60.001)).toBe("01:00");
    expect(formatPlayerTime(341.75)).toBe("05:41");
  });

  it("un valor imposible no pinta basura en la ficha", () => {
    expect(formatPlayerTime(-5)).toBe("00:00");
    expect(formatPlayerTime(NaN)).toBe("00:00");
    expect(formatPlayerTime(Infinity)).toBe("00:00");
  });
});

describe("playerClocks", () => {
  it("devuelve los dos cronómetros del jugador", () => {
    expect(playerClocks({ individualTimeSeconds: 342, rotationTimeSeconds: 78 }))
      .toEqual({ tot: "05:42", rot: "01:18" });
  });

  it("un partido antiguo sin ROT guardado no rompe la ficha", () => {
    expect(playerClocks({ individualTimeSeconds: 120 })).toEqual({ tot: "02:00", rot: "00:00" });
  });
});
