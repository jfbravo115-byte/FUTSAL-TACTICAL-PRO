/**
 * La proyección de las dos formaciones sobre una sola pista.
 *
 * Lo que se protege aquí es que la transformación sea SOLO visual y que los
 * dos equipos queden realmente enfrentados: ni una coordenada guardada se
 * toca, el cambio de lado mueve a los diez a la vez, y el periodo no entra en
 * la ecuación —el cambio de campo del descanso vive en el dato, y aplicarlo
 * también aquí lo contaría dos veces—.
 */
import { describe, expect, it } from "vitest";
import {
  COLLISION_STEP,
  PitchSlot,
  SharedPitchEntry,
  TOP_MAX,
  TOP_MIN,
  attackedGoalSide,
  defendedGoalSide,
  formationPositionToSharedPitch,
  layoutSharedPitch,
} from "./sharedPitch";
import { Period } from "../types/futsal";
import { attackDirection } from "./attackDirection";

/** El 1-2-2 real de la aplicación (PITCH_SYSTEMS[FOUR_VS_FOUR]). */
const SISTEMA_1_2_2: PitchSlot[] = [
  { left: 7, top: 50, label: "POR" },
  { left: 28, top: 50, label: "CIE" },
  { left: 55, top: 18, label: "AI" },
  { left: 55, top: 82, label: "AD" },
  { left: 85, top: 50, label: "PIV" },
];
/** 1-3-1: tres en línea y un pivot. */
const SISTEMA_1_3_1: PitchSlot[] = [
  { left: 7, top: 50, label: "POR" },
  { left: 40, top: 20, label: "AL" },
  { left: 40, top: 50, label: "CIE" },
  { left: 40, top: 80, label: "AL" },
  { left: 80, top: 50, label: "PIV" },
];
/** 1-1-3: un cierre y tres arriba. */
const SISTEMA_1_1_3: PitchSlot[] = [
  { left: 7, top: 50, label: "POR" },
  { left: 30, top: 50, label: "CIE" },
  { left: 70, top: 20, label: "AL" },
  { left: 70, top: 50, label: "PIV" },
  { left: 70, top: 80, label: "AL" },
];

const equipos = (local: PitchSlot[], rival: PitchSlot[]): SharedPitchEntry[] => [
  ...local.map((slot, i) => ({ id: `L${i}`, number: i + 1, side: "team" as const, slot })),
  ...rival.map((slot, i) => ({ id: `R${i}`, number: i + 1, side: "opponent" as const, slot })),
];

// ── 1-2 · LAS DOS FORMACIONES, ENFRENTADAS ──────────────────────────────

describe("1-2 · proyección de cada equipo", () => {
  it("1 · el equipo local se dibuja tal cual: su portero a la izquierda", () => {
    expect(formationPositionToSharedPitch(SISTEMA_1_2_2[0], "team", false)).toEqual({ left: 7, top: 50 });
    expect(formationPositionToSharedPitch(SISTEMA_1_2_2[4], "team", false)).toEqual({ left: 85, top: 50 });
  });

  it("2 · el rival se espeja: su portero queda a la derecha", () => {
    expect(formationPositionToSharedPitch(SISTEMA_1_2_2[0], "opponent", false)).toEqual({ left: 93, top: 50 });
    expect(formationPositionToSharedPitch(SISTEMA_1_2_2[4], "opponent", false)).toEqual({ left: 15, top: 50 });
  });

  it("los dos quedan ENFRENTADOS, no mirando al mismo lado", () => {
    const porteroLocal = formationPositionToSharedPitch(SISTEMA_1_2_2[0], "team", false);
    const porteroRival = formationPositionToSharedPitch(SISTEMA_1_2_2[0], "opponent", false);
    // Cada portero en su mitad, y en mitades distintas.
    expect(porteroLocal.left).toBeLessThan(50);
    expect(porteroRival.left).toBeGreaterThan(50);
    // Y los pivots, cruzados respecto a los porteros.
    expect(formationPositionToSharedPitch(SISTEMA_1_2_2[4], "team", false).left).toBeGreaterThan(50);
    expect(formationPositionToSharedPitch(SISTEMA_1_2_2[4], "opponent", false).left).toBeLessThan(50);
  });

  it("el eje vertical NO se toca: un ala sigue en su carril", () => {
    for (const side of ["team", "opponent"] as const) {
      for (const flipped of [false, true]) {
        expect(formationPositionToSharedPitch(SISTEMA_1_2_2[2], side, flipped).top).toBe(18);
        expect(formationPositionToSharedPitch(SISTEMA_1_2_2[3], side, flipped).top).toBe(82);
      }
    }
  });

  it("y cada equipo sabe qué portería defiende y a cuál ataca", () => {
    expect(defendedGoalSide("team", false)).toBe("left");
    expect(defendedGoalSide("opponent", false)).toBe("right");
    expect(attackedGoalSide("team", false)).toBe("right");
    expect(attackedGoalSide("opponent", false)).toBe("left");
    for (const side of ["team", "opponent"] as const) {
      for (const flipped of [false, true]) {
        expect(defendedGoalSide(side, flipped)).not.toBe(attackedGoalSide(side, flipped));
      }
    }
  });
});

// ── 3 · CAMBIAR LADO ────────────────────────────────────────────────────

describe("3 · cambiar lado mueve a los diez a la vez", () => {
  it("espeja la pista entera y los equipos siguen enfrentados", () => {
    const local = formationPositionToSharedPitch(SISTEMA_1_2_2[0], "team", true);
    const rival = formationPositionToSharedPitch(SISTEMA_1_2_2[0], "opponent", true);
    expect(local).toEqual({ left: 93, top: 50 });
    expect(rival).toEqual({ left: 7, top: 50 });
    expect(local.left).toBeGreaterThan(50);
    expect(rival.left).toBeLessThan(50);
  });

  it("las porterías se intercambian, no desaparecen", () => {
    expect(defendedGoalSide("team", true)).toBe("right");
    expect(defendedGoalSide("opponent", true)).toBe("left");
  });

  it("volver a cambiar deja todo como estaba", () => {
    for (const slot of SISTEMA_1_2_2) {
      for (const side of ["team", "opponent"] as const) {
        const ida = formationPositionToSharedPitch(slot, side, true);
        const vuelta = formationPositionToSharedPitch(
          { left: 100 - (side === "opponent" ? 100 - ida.left : ida.left), top: ida.top },
          side,
          false,
        );
        expect(vuelta.top).toBe(slot.top);
      }
    }
  });

  it("y la distancia entre dos jugadores no cambia al espejar", () => {
    const a = formationPositionToSharedPitch(SISTEMA_1_2_2[1], "team", false);
    const b = formationPositionToSharedPitch(SISTEMA_1_2_2[4], "opponent", false);
    const a2 = formationPositionToSharedPitch(SISTEMA_1_2_2[1], "team", true);
    const b2 = formationPositionToSharedPitch(SISTEMA_1_2_2[4], "opponent", true);
    expect(Math.abs(a.left - b.left)).toBe(Math.abs(a2.left - b2.left));
  });
});

// ── 4 · DESCANSO SIN DOBLE INVERSIÓN ────────────────────────────────────

describe("4 · el descanso no se aplica dos veces", () => {
  it("la proyección NO depende del periodo", () => {
    // No recibe `period` y no puede leerlo: la misma entrada da siempre lo
    // mismo. Si alguien añadiera aquí el cambio de campo, el partido lo
    // tendría contado dos veces —una en el dibujo y otra en el dato—.
    const fuente = formationPositionToSharedPitch.toString();
    expect(fuente).not.toMatch(/period|Period|SIDE_SWAPS/);
    expect(formationPositionToSharedPitch.length).toBe(3);
  });

  it("el cambio de campo real sigue viviendo en el DATO", () => {
    // `attackDirection` sí cambia con el periodo, y es quien manda en los
    // eventos. Son dos mecanismos distintos y no deben sumarse.
    expect(attackDirection("left", Period.FIRST, false)).toBe("ltr");
    expect(attackDirection("left", Period.SECOND, false)).toBe("rtl");
    // Y la pista compartida no se entera de ninguno de los dos.
    const p1 = formationPositionToSharedPitch(SISTEMA_1_2_2[0], "team", false);
    const p2 = formationPositionToSharedPitch(SISTEMA_1_2_2[0], "team", false);
    expect(p1).toEqual(p2);
  });
});

// ── 10 · COLISIONES ─────────────────────────────────────────────────────

describe("10 · dos fichas nunca se tapan", () => {
  const sinSolape = (placements: ReturnType<typeof layoutSharedPitch>) => {
    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        const dx = Math.abs(placements[i].left - placements[j].left);
        const dy = Math.abs(placements[i].top - placements[j].top);
        if (dx < 9 && dy < 9) return `${placements[i].id} y ${placements[j].id}`;
      }
    }
    return null;
  };

  for (const [nombre, local, rival] of [
    ["1-2-2 contra 1-2-2", SISTEMA_1_2_2, SISTEMA_1_2_2],
    ["1-3-1 contra 1-3-1", SISTEMA_1_3_1, SISTEMA_1_3_1],
    ["1-1-3 contra 1-1-3", SISTEMA_1_1_3, SISTEMA_1_1_3],
    ["1-1-3 contra 1-3-1 (ambos al centro)", SISTEMA_1_1_3, SISTEMA_1_3_1],
  ] as const) {
    it(`${nombre}: los diez visibles y separados`, () => {
      for (const flipped of [false, true]) {
        const r = layoutSharedPitch(equipos(local, rival), flipped);
        expect(r).toHaveLength(10);
        expect(sinSolape(r)).toBeNull();
        for (const p of r) {
          expect(p.top).toBeGreaterThanOrEqual(TOP_MIN);
          expect(p.top).toBeLessThanOrEqual(TOP_MAX);
          expect(p.left).toBeGreaterThanOrEqual(0);
          expect(p.left).toBeLessThanOrEqual(100);
        }
      }
    });
  }

  it("la separación es determinista: el mismo partido se dibuja siempre igual", () => {
    const a = layoutSharedPitch(equipos(SISTEMA_1_2_2, SISTEMA_1_2_2), false);
    const b = layoutSharedPitch([...equipos(SISTEMA_1_2_2, SISTEMA_1_2_2)].reverse(), false);
    expect(a).toEqual(b);
  });

  it("solo se separa lo que se tapa; el resto no se mueve", () => {
    const r = layoutSharedPitch(equipos(SISTEMA_1_2_2, SISTEMA_1_2_2), false);
    // El cierre local (28,50) no tiene a nadie cerca: se queda donde estaba.
    expect(r.find((p) => p.id === "L1")).toMatchObject({ left: 28, top: 50, nudged: false });
    expect(r.find((p) => p.id === "L2")).toMatchObject({ left: 55, top: 18, nudged: false });
    // El portero local (7,50) y el pivot rival (15,50) sí se tapaban: a 8
    // puntos y en la misma altura. Se separan en vertical, cada uno en su
    // sitio del campo.
    const porteroLocal = r.find((p) => p.id === "L0")!;
    const pivotRival = r.find((p) => p.id === "R4")!;
    expect(porteroLocal.nudged).toBe(true);
    expect(pivotRival.nudged).toBe(true);
    expect(porteroLocal.left).toBe(7);
    expect(pivotRival.left).toBe(15);
    expect(Math.abs(porteroLocal.top - pivotRival.top)).toBeGreaterThanOrEqual(COLLISION_STEP);
  });

  it("y quien se separa lo hace en VERTICAL, sin cambiar de zona del campo", () => {
    const entradas = equipos(SISTEMA_1_2_2, SISTEMA_1_2_2);
    const r = layoutSharedPitch(entradas, false);
    for (const p of r) {
      const origen = entradas.find((e) => e.id === p.id)!;
      const esperado = formationPositionToSharedPitch(origen.slot, origen.side, false);
      expect(p.left).toBe(esperado.left);
      expect(Math.abs(p.top - esperado.top)).toBeLessThanOrEqual(COLLISION_STEP * 2);
    }
  });

  it("con un solo equipo no hay nada que separar", () => {
    const r = layoutSharedPitch(
      SISTEMA_1_2_2.map((slot, i) => ({ id: `L${i}`, number: i + 1, side: "team" as const, slot })),
      false,
    );
    expect(r.every((p) => !p.nudged)).toBe(true);
  });
});

// ── 11-12 · SUSTITUCIONES ───────────────────────────────────────────────

describe("11-12 · una sustitución redibuja sola", () => {
  it("cambiar quién ocupa un slot no cambia dónde está ese slot", () => {
    const antes = layoutSharedPitch(equipos(SISTEMA_1_2_2, SISTEMA_1_2_2), false);
    // El suplente entra al mismo slot con otro id y otro dorsal.
    const despues = layoutSharedPitch(
      equipos(SISTEMA_1_2_2, SISTEMA_1_2_2).map((e) =>
        e.id === "L4" ? { ...e, id: "L9", number: 9 } : e,
      ),
      false,
    );
    expect(despues).toHaveLength(10);
    const salio = antes.find((p) => p.id === "L4")!;
    const entro = despues.find((p) => p.id === "L9")!;
    expect(entro.left).toBe(salio.left);
    expect(despues.some((p) => p.id === "L4")).toBe(false);
  });

  it("y una sustitución rival no mueve al equipo local", () => {
    const antes = layoutSharedPitch(equipos(SISTEMA_1_2_2, SISTEMA_1_2_2), false);
    const despues = layoutSharedPitch(
      equipos(SISTEMA_1_2_2, SISTEMA_1_2_2).map((e) =>
        e.id === "R2" ? { ...e, id: "R8", number: 8 } : e,
      ),
      false,
    );
    for (const p of antes.filter((x) => x.side === "team")) {
      const mismo = despues.find((x) => x.id === p.id)!;
      expect(mismo.left).toBe(p.left);
    }
  });
});
