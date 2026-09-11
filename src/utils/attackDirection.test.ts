import { describe, expect, it } from "vitest";
import { Period } from "../types/futsal";
import {
  SIDE_SWAPS_BEFORE,
  attackDirection,
  flipDirection,
  resolveEventDirection,
} from "./attackDirection";

describe("dirección de ataque", () => {
  it("mi equipo ataca hacia la portería contraria a la que defiende", () => {
    expect(attackDirection("left", Period.FIRST, false)).toBe("ltr");
    expect(attackDirection("right", Period.FIRST, false)).toBe("rtl");
  });

  it("el rival ataca siempre en sentido opuesto al mío", () => {
    expect(attackDirection("left", Period.FIRST, true)).toBe("rtl");
    expect(attackDirection("right", Period.FIRST, true)).toBe("ltr");
  });

  it("invierte ambos equipos en la 2ª parte por el cambio de campo", () => {
    expect(attackDirection("left", Period.SECOND, false)).toBe("rtl");
    expect(attackDirection("left", Period.SECOND, true)).toBe("ltr");
    expect(attackDirection("right", Period.SECOND, false)).toBe("ltr");
    expect(attackDirection("right", Period.SECOND, true)).toBe("rtl");
  });

  it("mantiene a los dos equipos siempre en sentidos opuestos, en cualquier período", () => {
    for (const period of [Period.FIRST, Period.SECOND, Period.OVERTIME_1, Period.OVERTIME_2]) {
      for (const kickoff of ["left", "right"] as const) {
        const mine = attackDirection(kickoff, period, false);
        const theirs = attackDirection(kickoff, period, true);
        expect(mine).not.toBe(theirs);
        expect(theirs).toBe(flipDirection(mine!));
      }
    }
  });

  it("devuelve null en un partido legacy sin orientación registrada", () => {
    expect(attackDirection(undefined, Period.FIRST, false)).toBeNull();
    expect(attackDirection(null, Period.SECOND, true)).toBeNull();
    // Nunca se elige un lado por defecto ante un valor inválido.
    expect(attackDirection("arriba" as any, Period.FIRST, false)).toBeNull();
  });
});

describe("prórroga (asunción declarada, hoy inalcanzable)", () => {
  it("declara los cambios de campo acumulados de cada período", () => {
    expect(SIDE_SWAPS_BEFORE[Period.FIRST]).toBe(0);
    expect(SIDE_SWAPS_BEFORE[Period.SECOND]).toBe(1);
    expect(SIDE_SWAPS_BEFORE[Period.OVERTIME_1]).toBe(2);
    expect(SIDE_SWAPS_BEFORE[Period.OVERTIME_2]).toBe(3);
  });

  it("cubre los cinco valores de Period sin dejar ninguno indefinido", () => {
    for (const period of [
      Period.FIRST,
      Period.SECOND,
      Period.OVERTIME_1,
      Period.OVERTIME_2,
      Period.FINISHED,
    ]) {
      expect(typeof SIDE_SWAPS_BEFORE[period]).toBe("number");
      expect(attackDirection("left", period, false)).toMatch(/^(ltr|rtl)$/);
    }
  });

  it("la 1ª prórroga vuelve al sentido de la 1ª parte; la 2ª al de la 2ª parte", () => {
    expect(attackDirection("left", Period.OVERTIME_1, false)).toBe(
      attackDirection("left", Period.FIRST, false),
    );
    expect(attackDirection("left", Period.OVERTIME_2, false)).toBe(
      attackDirection("left", Period.SECOND, false),
    );
  });
});

describe("dirección efectiva de un evento", () => {
  it("prefiere la guardada en el propio evento frente a la derivada del partido", () => {
    // El partido diría "ltr", pero el evento se registró con "rtl": manda el evento.
    expect(resolveEventDirection("rtl", "left", Period.FIRST, false)).toBe("rtl");
  });

  it("deriva del partido cuando el evento no la trae", () => {
    expect(resolveEventDirection(undefined, "left", Period.FIRST, false)).toBe("ltr");
    expect(resolveEventDirection(undefined, "left", Period.SECOND, false)).toBe("rtl");
  });

  it("devuelve null cuando ni el evento ni el partido la registraron", () => {
    expect(resolveEventDirection(undefined, undefined, Period.FIRST, false)).toBeNull();
  });
});
