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
  PitchMetrics,
  PitchSlot,
  SharedPitchEntry,
  attackedGoalSide,
  defendedGoalSide,
  formationPositionToSharedPitch,
  layoutSharedPitch,
  minimumVerticalSeparationPct,
  sharedPitchFlipped,
  verticalBoundsPct,
  visualSideSwapped,
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

describe("4 · el descanso: una sola inversión, resuelta arriba", () => {
  it("la proyección de CADA jugador sigue sin conocer el periodo", () => {
    // Es la barrera contra la doble inversión: el periodo se consulta una vez
    // por render, no una vez por ficha.
    const fuente = formationPositionToSharedPitch.toString();
    expect(fuente).not.toMatch(/period|Period|SIDE_SWAPS/);
    expect(formationPositionToSharedPitch.length).toBe(3);
  });

  it("1-2 · en la 2ª parte los equipos intercambian portería", () => {
    expect(visualSideSwapped(Period.FIRST)).toBe(false);
    expect(visualSideSwapped(Period.SECOND)).toBe(true);
    const flip1 = sharedPitchFlipped(false, Period.FIRST);
    const flip2 = sharedPitchFlipped(false, Period.SECOND);
    const local1 = formationPositionToSharedPitch(SISTEMA_1_2_2[0], "team", flip1);
    const local2 = formationPositionToSharedPitch(SISTEMA_1_2_2[0], "team", flip2);
    expect(local1.left).toBe(7);
    expect(local2.left).toBe(93);
    const rival1 = formationPositionToSharedPitch(SISTEMA_1_2_2[0], "opponent", flip1);
    const rival2 = formationPositionToSharedPitch(SISTEMA_1_2_2[0], "opponent", flip2);
    expect(rival1.left).toBe(93);
    expect(rival2.left).toBe(7);
  });

  it("3 · y siguen enfrentados en las dos partes", () => {
    for (const period of [Period.FIRST, Period.SECOND]) {
      for (const manual of [false, true]) {
        const f = sharedPitchFlipped(manual, period);
        const por = formationPositionToSharedPitch(SISTEMA_1_2_2[0], "team", f);
        const porR = formationPositionToSharedPitch(SISTEMA_1_2_2[0], "opponent", f);
        expect(Math.sign(por.left - 50)).toBe(-Math.sign(porR.left - 50));
      }
    }
  });

  it("8-10 · tabla de verdad de las cuatro combinaciones", () => {
    expect(sharedPitchFlipped(false, Period.FIRST)).toBe(false);  // inicial
    expect(sharedPitchFlipped(true, Period.FIRST)).toBe(true);    // reflejada
    expect(sharedPitchFlipped(false, Period.SECOND)).toBe(true);  // intercambiada
    expect(sharedPitchFlipped(true, Period.SECOND)).toBe(false);  // 2ª reflejada
  });

  it("10 · cambiar lado en la 2ª parte NO invierte dos veces", () => {
    // Si se sumaran en vez de combinarse con XOR, la 2ª parte con cambio
    // manual daría lo mismo que la 2ª sin él. Da lo contrario, que es lo
    // correcto: deshace el intercambio.
    expect(sharedPitchFlipped(true, Period.SECOND)).not.toBe(
      sharedPitchFlipped(false, Period.SECOND),
    );
    expect(sharedPitchFlipped(true, Period.SECOND)).toBe(
      sharedPitchFlipped(false, Period.FIRST),
    );
  });

  it("7 · el cambio de campo del DATO sigue intacto y aparte", () => {
    // `attackDirection` manda en los eventos y no se entera del dibujo.
    expect(attackDirection("left", Period.FIRST, false)).toBe("ltr");
    expect(attackDirection("left", Period.SECOND, false)).toBe("rtl");
    expect(attackDirection("left", Period.FIRST, true)).toBe("rtl");
  });
});


// ── 10 · COLISIONES, CON MEDIDAS REALES ─────────────────────────────────
//
// Lo que se comprueba no es que las coordenadas sean distintas, sino que los
// RECTÁNGULOS no se solapen: dos centros a 24 px con fichas de 44 px siguen
// tapándose, y eso es lo que un porcentaje fijo no garantizaba.

const ESCRITORIO: PitchMetrics = { width: 898, height: 362, cardWidth: 46, cardHeight: 44, gap: 4 };
const TABLET: PitchMetrics = { width: 746, height: 265, cardWidth: 46, cardHeight: 44, gap: 4 };

/** Rectángulo real de una ficha, en píxeles de la pista. */
const rect = (p: { left: number; top: number }, m: PitchMetrics) => {
  const cx = (p.left / 100) * m.width;
  const cy = (p.top / 100) * m.height;
  return { x0: cx - m.cardWidth / 2, x1: cx + m.cardWidth / 2, y0: cy - m.cardHeight / 2, y1: cy + m.cardHeight / 2 };
};

/** Primer par cuyos rectángulos se tocan, o null. */
const solape = (placements: { id: string; left: number; top: number }[], m: PitchMetrics) => {
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      const a = rect(placements[i], m), b = rect(placements[j], m);
      const dx = a.x1 > b.x0 && b.x1 > a.x0;
      const dy = a.y1 > b.y0 && b.y1 > a.y0;
      if (dx && dy) return `${placements[i].id} ↔ ${placements[j].id}`;
    }
  }
  return null;
};

describe("10 · ningún rectángulo se solapa, en píxeles reales", () => {
  for (const [nombreM, M] of [["escritorio 898×362", ESCRITORIO], ["tablet 746×265", TABLET]] as const) {
    for (const [nombre, local, rival] of [
      ["1-2-2 vs 1-2-2", SISTEMA_1_2_2, SISTEMA_1_2_2],
      ["1-3-1 vs 1-3-1", SISTEMA_1_3_1, SISTEMA_1_3_1],
      ["1-1-3 vs 1-1-3", SISTEMA_1_1_3, SISTEMA_1_1_3],
      ["1-1-3 vs 1-3-1 (los dos al centro)", SISTEMA_1_1_3, SISTEMA_1_3_1],
    ] as const) {
      it(`${nombreM} · ${nombre}`, () => {
        for (const flipped of [false, true]) {
          const { placements, fits } = layoutSharedPitch(equipos(local, rival), flipped, M);
          expect(fits).toBe(true);
          expect(placements).toHaveLength(10);
          expect(solape(placements, M)).toBeNull();
          const { min, max } = verticalBoundsPct(M);
          for (const p of placements) {
            expect(p.top).toBeGreaterThanOrEqual(min - 0.001);
            expect(p.top).toBeLessThanOrEqual(max + 0.001);
          }
        }
      });
    }
  }

  it("la separación mínima sale de las medidas, no de un número fijo", () => {
    // 44 + 4 = 48 px. En 362 px de alto son 13,3 %; en 265, 18,1 %.
    expect(minimumVerticalSeparationPct(ESCRITORIO)).toBeCloseTo((48 / 362) * 100, 5);
    expect(minimumVerticalSeparationPct(TABLET)).toBeCloseTo((48 / 265) * 100, 5);
    expect(minimumVerticalSeparationPct(TABLET)).toBeGreaterThan(
      minimumVerticalSeparationPct(ESCRITORIO),
    );
  });

  it("y un 9 % fijo NO habría bastado en la tablet", () => {
    // Era la objeción: 9 % de 265 px son 24 px, y dos fichas de 44 px con los
    // centros a 24 px se solapan 20 px.
    const nueve = (9 / 100) * TABLET.height;
    expect(nueve).toBeLessThan(TABLET.cardHeight + TABLET.gap);
    expect(minimumVerticalSeparationPct(TABLET)).toBeGreaterThan(9);
  });

  it("los diez centros quedan a la distancia exigida o más", () => {
    const { placements } = layoutSharedPitch(equipos(SISTEMA_1_2_2, SISTEMA_1_2_2), false, TABLET);
    const minPx = TABLET.cardHeight + TABLET.gap;
    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        const dxPx = Math.abs(placements[i].left - placements[j].left) / 100 * TABLET.width;
        const dyPx = Math.abs(placements[i].top - placements[j].top) / 100 * TABLET.height;
        const separados = dxPx >= TABLET.cardWidth + TABLET.gap || dyPx >= minPx - 0.001;
        expect(separados, `${placements[i].id}/${placements[j].id}`).toBe(true);
      }
    }
  });

  it("es determinista: el mismo partido se dibuja siempre igual", () => {
    const a = layoutSharedPitch(equipos(SISTEMA_1_2_2, SISTEMA_1_2_2), false, TABLET);
    const b = layoutSharedPitch([...equipos(SISTEMA_1_2_2, SISTEMA_1_2_2)].reverse(), false, TABLET);
    expect(a).toEqual(b);
  });

  it("en 1-2-2 contra 1-2-2 NADIE se tapa: nadie se mueve", () => {
    // Medido: los seis que comparten la banda central quedan a 8 % y 13 % de
    // distancia, que en 898 px son 72 y 117, y en 746 px son 60 y 97. Todos
    // por encima de los 50 px que ocupa una ficha con su margen.
    const entradas = equipos(SISTEMA_1_2_2, SISTEMA_1_2_2);
    for (const M of [ESCRITORIO, TABLET]) {
      const { placements } = layoutSharedPitch(entradas, false, M);
      expect(placements.every((p) => !p.nudged)).toBe(true);
      for (const p of placements) {
        const origen = entradas.find((e) => e.id === p.id)!;
        expect(p).toMatchObject(formationPositionToSharedPitch(origen.slot, origen.side, false));
      }
    }
  });

  it("en 1-1-3 contra 1-1-3 SÍ se tapan cuatro, y solo esos cuatro se mueven", () => {
    // El cierre local (30) coincide con el pivot rival espejado (30), y el
    // pivot local (70) con el cierre rival (70): los cuatro en top 50.
    const entradas = equipos(SISTEMA_1_1_3, SISTEMA_1_1_3);
    const { placements } = layoutSharedPitch(entradas, false, ESCRITORIO);
    const movidos = placements.filter((p) => p.nudged).map((p) => p.id).sort();
    expect(movidos).toEqual(["L1", "L3", "R1", "R3"]);
    // Se reparten en torno al centro, uno arriba y otro abajo, sin empujar al
    // resto: los porteros y los alas siguen exactamente donde estaban.
    expect(placements.find((p) => p.id === "L1")!.top).toBeLessThan(50);
    expect(placements.find((p) => p.id === "R3")!.top).toBeGreaterThan(50);
    expect(placements.find((p) => p.id === "L0")).toMatchObject({ left: 7, top: 50, nudged: false });
    expect(placements.find((p) => p.id === "L2")).toMatchObject({ left: 70, top: 20, nudged: false });
  });

  it("y nunca se separa en horizontal: la banda de cada uno es sagrada", () => {
    // Mover a un jugador de banda contaría una posición táctica que no es la
    // suya. La separación es solo vertical.
    for (const [local, rival] of [
      [SISTEMA_1_1_3, SISTEMA_1_1_3],
      [SISTEMA_1_3_1, SISTEMA_1_3_1],
    ] as const) {
      const entradas = equipos(local, rival);
      for (const M of [ESCRITORIO, TABLET]) {
        for (const flipped of [false, true]) {
          const { placements } = layoutSharedPitch(entradas, flipped, M);
          for (const p of placements) {
            const origen = entradas.find((e) => e.id === p.id)!;
            expect(p.left).toBe(formationPositionToSharedPitch(origen.slot, origen.side, flipped).left);
          }
        }
      }
    }
  });

  it("dos fichas en el MISMO punto acaban a la distancia exigida", () => {
    const { placements, fits } = layoutSharedPitch(
      [
        { id: "L", number: 4, side: "team", slot: { left: 50, top: 50 } },
        { id: "R", number: 7, side: "opponent", slot: { left: 50, top: 50 } },
      ],
      false,
      TABLET,
    );
    expect(fits).toBe(true);
    const dyPx = (Math.abs(placements[0].top - placements[1].top) / 100) * TABLET.height;
    expect(dyPx).toBeGreaterThanOrEqual(TABLET.cardHeight + TABLET.gap - 0.001);
    // Simétrico respecto al punto original: ninguno se queda en su sitio.
    expect(placements[0].top + placements[1].top).toBeCloseTo(100, 5);
    expect(solape(placements, TABLET)).toBeNull();
  });

  it("tres en el mismo punto: el del medio se queda y los otros se abren", () => {
    const { placements, fits } = layoutSharedPitch(
      ["a", "b", "c"].map((id, i) => ({ id, number: i + 1, side: "team" as const, slot: { left: 50, top: 50 } })),
      false,
      TABLET,
    );
    expect(fits).toBe(true);
    expect(solape(placements, TABLET)).toBeNull();
    const paso = minimumVerticalSeparationPct(TABLET);
    expect(placements.map((p) => Math.round(p.top * 100) / 100)).toEqual(
      [50 - paso, 50, 50 + paso].map((t) => Math.round(t * 100) / 100),
    );
  });

  it("también separa a quienes NO coinciden exactamente en horizontal", () => {
    // Era el agujero: dos fichas a 4 puntos porcentuales están a 30 px en una
    // pista de 746, y con 46 px de ancho se tapan casi del todo. Agruparlas
    // solo cuando el `left` coincide exacto dejaría este caso solapado.
    const entradas: SharedPitchEntry[] = [
      { id: "L", number: 4, side: "team", slot: { left: 48, top: 50 } },
      { id: "R", number: 7, side: "opponent", slot: { left: 48, top: 50 } },
    ];
    const { placements } = layoutSharedPitch(entradas, false, TABLET);
    expect(placements.map((p) => p.left)).toEqual([48, 52]);
    expect(Math.abs(placements[0].left - placements[1].left) / 100 * TABLET.width)
      .toBeLessThan(TABLET.cardWidth + TABLET.gap);
    expect(placements.every((p) => p.nudged)).toBe(true);
    expect(solape(placements, TABLET)).toBeNull();
  });

  it("junto a la línea de arriba, el grupo se DESPLAZA hacia dentro", () => {
    // El reparto simétrico se saldría de la pista. Se baja entero, sin
    // juntarlas: media ficha fuera no se puede pulsar.
    const { placements, fits } = layoutSharedPitch(
      ["a", "b"].map((id, i) => ({ id, number: i + 1, side: "team" as const, slot: { left: 50, top: 6 } })),
      false,
      TABLET,
    );
    const { min, max } = verticalBoundsPct(TABLET);
    expect(fits).toBe(true);
    expect(Math.min(...placements.map((p) => p.top))).toBeGreaterThanOrEqual(min - 0.001);
    expect(placements[1].top - placements[0].top).toBeCloseTo(minimumVerticalSeparationPct(TABLET), 5);
    expect(solape(placements, TABLET)).toBeNull();
  });

  it("junto a la línea de abajo, hacia dentro igualmente", () => {
    const { placements, fits } = layoutSharedPitch(
      ["a", "b"].map((id, i) => ({ id, number: i + 1, side: "team" as const, slot: { left: 50, top: 96 } })),
      false,
      TABLET,
    );
    const { max } = verticalBoundsPct(TABLET);
    expect(fits).toBe(true);
    expect(Math.max(...placements.map((p) => p.top))).toBeLessThanOrEqual(max + 0.001);
    expect(placements[1].top - placements[0].top).toBeCloseTo(minimumVerticalSeparationPct(TABLET), 5);
    expect(solape(placements, TABLET)).toBeNull();
  });

  it("si la pista es demasiado baja, lo DICE en vez de amontonarlas", () => {
    const minuscula: PitchMetrics = { ...TABLET, height: 60 };
    const { fits } = layoutSharedPitch(equipos(SISTEMA_1_2_2, SISTEMA_1_2_2), false, minuscula);
    expect(fits).toBe(false);
  });

  it("con un solo equipo no hay nada que separar", () => {
    const { placements, fits } = layoutSharedPitch(
      SISTEMA_1_2_2.map((slot, i) => ({ id: `L${i}`, number: i + 1, side: "team" as const, slot })),
      false,
      TABLET,
    );
    expect(fits).toBe(true);
    expect(placements.every((p) => !p.nudged)).toBe(true);
  });
});

// ── 11-12 · SUSTITUCIONES ───────────────────────────────────────────────

describe("11-12 · una sustitución redibuja sola", () => {
  it("cambiar quién ocupa un slot no cambia dónde está ese slot", () => {
    const antes = layoutSharedPitch(equipos(SISTEMA_1_2_2, SISTEMA_1_2_2), false, TABLET).placements;
    const despues = layoutSharedPitch(
      equipos(SISTEMA_1_2_2, SISTEMA_1_2_2).map((e) => (e.id === "L4" ? { ...e, id: "L9", number: 9 } : e)),
      false,
      TABLET,
    ).placements;
    expect(despues).toHaveLength(10);
    expect(despues.find((p) => p.id === "L9")!.left).toBe(antes.find((p) => p.id === "L4")!.left);
    expect(despues.some((p) => p.id === "L4")).toBe(false);
  });

  it("y una sustitución rival no mueve al equipo local", () => {
    const antes = layoutSharedPitch(equipos(SISTEMA_1_2_2, SISTEMA_1_2_2), false, TABLET).placements;
    const despues = layoutSharedPitch(
      equipos(SISTEMA_1_2_2, SISTEMA_1_2_2).map((e) => (e.id === "R2" ? { ...e, id: "R8", number: 8 } : e)),
      false,
      TABLET,
    ).placements;
    for (const p of antes.filter((x) => x.side === "team")) {
      expect(despues.find((x) => x.id === p.id)!.left).toBe(p.left);
    }
  });
});
