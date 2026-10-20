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
  BENCH_BAR_PX,
  BENCH_SPACE_PX,
  PitchMetrics,
  PitchSlot,
  SharedPitchEntry,
  attackedGoalSide,
  defendedGoalSide,
  formationPositionToSharedPitch,
  layoutSharedPitch,
  countOutside,
  countOverlaps,
  minimumVerticalSeparationPct,
  pitchBoxForAvailability,
  sharedPitchFlipped,
  sharedPitchViability,
  verticalBoundsPct,
  visualSideSwapped,
} from "./sharedPitch";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

describe("4 · el descanso: una sola inversión, y ya viene puesta", () => {
  /**
   * `isFieldFlipped` tal y como lo tiene la aplicación en cada momento.
   * El descanso lo invierte una vez, en `handleConfirmEndFirst`; el botón
   * «Cambiar lado» lo invierte otra. No hay más fuentes.
   */
  const comoEstaLaApp = (segundaParte: boolean, cambioManual: boolean) =>
    segundaParte !== cambioManual;

  it("la proyección de CADA jugador sigue sin conocer el periodo", () => {
    // Es la barrera contra la doble inversión: la orientación se decide una
    // vez por render, no una vez por ficha.
    const fuente = formationPositionToSharedPitch.toString();
    expect(fuente).not.toMatch(/period|Period|SIDE_SWAPS/);
    expect(formationPositionToSharedPitch.length).toBe(3);
  });

  it("1-2 · en la 2ª parte los equipos intercambian portería", () => {
    const primera = sharedPitchFlipped(comoEstaLaApp(false, false));
    const segunda = sharedPitchFlipped(comoEstaLaApp(true, false));
    const local1 = formationPositionToSharedPitch(SISTEMA_1_2_2[0], "team", primera);
    const local2 = formationPositionToSharedPitch(SISTEMA_1_2_2[0], "team", segunda);
    expect(local1.left).toBe(7);
    expect(local2.left).toBe(93);
    const rival1 = formationPositionToSharedPitch(SISTEMA_1_2_2[0], "opponent", primera);
    const rival2 = formationPositionToSharedPitch(SISTEMA_1_2_2[0], "opponent", segunda);
    expect(rival1.left).toBe(93);
    expect(rival2.left).toBe(7);
  });

  it("3 · y siguen enfrentados en las cuatro combinaciones", () => {
    for (const segunda of [false, true]) {
      for (const manual of [false, true]) {
        const f = sharedPitchFlipped(comoEstaLaApp(segunda, manual));
        const por = formationPositionToSharedPitch(SISTEMA_1_2_2[0], "team", f);
        const porR = formationPositionToSharedPitch(SISTEMA_1_2_2[0], "opponent", f);
        expect(Math.sign(por.left - 50)).toBe(-Math.sign(porR.left - 50));
      }
    }
  });

  it("8-10 · tabla de verdad de las cuatro combinaciones", () => {
    expect(sharedPitchFlipped(comoEstaLaApp(false, false))).toBe(false); // inicial
    expect(sharedPitchFlipped(comoEstaLaApp(false, true))).toBe(true);   // reflejada
    expect(sharedPitchFlipped(comoEstaLaApp(true, false))).toBe(true);   // intercambiada
    expect(sharedPitchFlipped(comoEstaLaApp(true, true))).toBe(false);   // 2ª reflejada
  });

  it("10 · el periodo NO puede entrar otra vez: se anularía con el descanso", () => {
    // MEDIDO en el Deploy Preview #28 con la versión que sí lo combinaba: el
    // portero local se quedaba en x=316 en las dos partes, porque el descanso
    // ya había invertido `isFieldFlipped` y el XOR lo deshacía.
    const enSegunda = comoEstaLaApp(true, false);
    expect(enSegunda).toBe(true);
    expect(sharedPitchFlipped(enSegunda)).toBe(true);
    expect(sharedPitchFlipped(enSegunda) !== visualSideSwapped(Period.SECOND)).toBe(false);
    // Y la función no consulta el periodo por su cuenta.
    expect(sharedPitchFlipped.length).toBe(1);
    expect(sharedPitchFlipped.toString()).not.toMatch(/SIDE_SWAPS|visualSideSwapped/);
  });

  it("la inversión del descanso vive donde se confirma el fin de la 1ª parte", () => {
    // Si alguien quitara ese toggle, la pista 5v5 dejaría de cambiar de
    // porterías en silencio. Esta prueba es la que lo delataría.
    const tracker = readFileSync(resolve(__dirname, "../pages/MatchTracker.tsx"), "utf-8");
    const handler = tracker.slice(
      tracker.indexOf("const handleConfirmEndFirst = ()"),
      tracker.indexOf("const handleConfirmEndSecond"),
    );
    expect(handler).toContain("period: Period.SECOND");
    expect(handler).toContain("setIsFieldFlipped((prev) => !prev);");
    // Y sigue siendo imperativa, no un efecto que pueda repetirse por render.
    expect(handler).not.toContain("useEffect");
  });

  it("solo hay TRES sitios que inviertan la orientación, y ninguno reactivo", () => {
    // La inversión del descanso viene de `208cd9f` (2026-09-02), anterior a
    // este experimento y presente ya en la PR #27 y en producción. Lo que
    // esta prueba impide es que aparezca una segunda: si alguien añadiera un
    // efecto sobre `period`, la pista se invertiría dos veces y el cambio de
    // porterías se anularía —que es justo lo que se midió y se corrigió—.
    const tracker = readFileSync(resolve(__dirname, "../pages/MatchTracker.tsx"), "utf-8");
    const sitios = tracker.match(/setIsFieldFlipped\(/g) ?? [];
    expect(sitios).toHaveLength(3); // restaurar snapshot · descanso · botón manual
    expect(tracker).toContain("if (typeof snap.uiState?.isFieldFlipped === \"boolean\") setIsFieldFlipped(");
    expect(tracker).toContain("onClick={() => setIsFieldFlipped((prev) => !prev)}");
    // Ninguna de las tres está dentro de un efecto que escuche al periodo.
    for (const trozo of tracker.split("useEffect(").slice(1)) {
      const cuerpo = trozo.slice(0, trozo.indexOf("}, ["));
      if (cuerpo.includes("setIsFieldFlipped(")) {
        expect(cuerpo).not.toMatch(/period|Period\./);
      }
    }
  });

  it("7 · el cambio de campo del DATO sigue intacto y aparte", () => {
    // `attackDirection` manda en los eventos y no se entera del dibujo.
    expect(attackDirection("left", Period.FIRST, false)).toBe("ltr");
    expect(attackDirection("left", Period.SECOND, false)).toBe("rtl");
    expect(attackDirection("left", Period.FIRST, true)).toBe("rtl");
    // La tabla que lo gobierna sigue diciendo que en la 2ª parte se cambia.
    expect(visualSideSwapped(Period.FIRST)).toBe(false);
    expect(visualSideSwapped(Period.SECOND)).toBe(true);
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

// ── 13-19 · TABLET VERTICAL 768×1024 ────────────────────────────────────
//
// La pista medida en el Deploy Preview a 768×1024 es 746×262. La
// disponibilidad se evalúa sobre esa caja MENOS la barra de banquillos, que
// es el suelo: la pista del 5v5 nunca es más pequeña que eso.

/**
 * Lo medido en el Deploy Preview a 768×1024: el espacio común que ocupan la
 * pista y lo que la acompaña es 430 px de alto por 746 de ancho —en 5v5, una
 * pista de 396 y la barra de banquillos de 34—. La disponibilidad se evalúa
 * sobre ese espacio menos lo máximo que los banquillos pueden ocupar.
 */
const TABLET_BOX = { width: 746, height: 430 };
const TABLET_DISPONIBILIDAD = pitchBoxForAvailability(TABLET_BOX, ESCRITORIO);
/** La pista real que se dibuja en 5v5 a ese tamaño, también medida. */
const TABLET_PISTA_REAL: PitchMetrics = { ...ESCRITORIO, width: 746, height: 396 };

/**
 * Los sistemas REALES de la aplicación (`PITCH_SYSTEMS`), copiados aquí para
 * que una prueba falle si alguien los mueve sin volver a medir si caben.
 */
const SISTEMAS_REALES: Record<string, PitchSlot[]> = {
  "4vs4": [
    { left: 7, top: 50, label: "POR" },
    { left: 28, top: 50, label: "CIE" },
    { left: 55, top: 18, label: "AI" },
    { left: 55, top: 82, label: "AD" },
    { left: 85, top: 50, label: "PIV" },
  ],
  // Portero-jugador: el portero sube a campo y no hay nadie bajo palos.
  "PJ Ataque": [
    { left: 15, top: 50, label: "P-J" },
    { left: 35, top: 18, label: "AL" },
    { left: 35, top: 82, label: "AL" },
    { left: 80, top: 25, label: "PIV" },
    { left: 80, top: 75, label: "PIV" },
  ],
  "PJ Defensa": [
    { left: 7, top: 50, label: "POR" },
    { left: 25, top: 22, label: "DEF" },
    { left: 25, top: 78, label: "DEF" },
    { left: 45, top: 22, label: "DEF" },
    { left: 45, top: 78, label: "DEF" },
  ],
  Superioridad: [
    { left: 7, top: 50, label: "POR" },
    { left: 28, top: 50, label: "CIE" },
    { left: 55, top: 18, label: "AL" },
    { left: 55, top: 82, label: "AL" },
    { left: 85, top: 50, label: "PIV" },
  ],
  // Inferioridad y 3vs3 son de cuatro: la pista lleva nueve fichas.
  Inferioridad: [
    { left: 7, top: 50, label: "POR" },
    { left: 28, top: 50, label: "CIE" },
    { left: 55, top: 22, label: "AL" },
    { left: 55, top: 78, label: "AL" },
  ],
};

const casos = [
  ["1-2-2 vs 1-2-2", SISTEMA_1_2_2, SISTEMA_1_2_2],
  ["1-3-1 vs 1-3-1", SISTEMA_1_3_1, SISTEMA_1_3_1],
  ["1-1-3 vs 1-1-3", SISTEMA_1_1_3, SISTEMA_1_1_3],
  ["1-1-3 vs 1-3-1", SISTEMA_1_1_3, SISTEMA_1_3_1],
  ["portero-jugador vs 1-2-2", SISTEMAS_REALES["PJ Ataque"], SISTEMA_1_2_2],
  ["portero-jugador vs 1-1-3", SISTEMAS_REALES["PJ Ataque"], SISTEMA_1_1_3],
  ["PJ Defensa vs PJ Ataque", SISTEMAS_REALES["PJ Defensa"], SISTEMAS_REALES["PJ Ataque"]],
  ["inferioridad (4) vs 1-2-2", SISTEMAS_REALES.Inferioridad, SISTEMA_1_2_2],
] as const;

describe("13-16 · en 768×1024 la pista 5v5 CABE", () => {
  it("la caja de disponibilidad descuenta TODO lo que puede ocupar el banquillo", () => {
    // La barra plegada y, además, la lista desplegada, que tiene alto máximo.
    // Si solo se descontara la barra, abrir el banquillo encogería la pista
    // por debajo de lo validado y las fichas volverían a juntarse.
    expect(BENCH_BAR_PX).toBe(34);
    expect(BENCH_SPACE_PX).toBe(34 + 96);
    expect(TABLET_DISPONIBILIDAD.width).toBe(746);
    expect(TABLET_DISPONIBILIDAD.height).toBe(430 - 130);
    expect(TABLET_DISPONIBILIDAD.cardWidth).toBe(46);
    expect(TABLET_DISPONIBILIDAD.cardHeight).toBe(44);
    // Y la caja validada es MENOR que la pista que se acaba dibujando: lo que
    // se ofrece, cabe.
    expect(TABLET_DISPONIBILIDAD.height).toBeLessThan(TABLET_PISTA_REAL.height);
  });

  for (const [nombre, local, rival] of casos) {
    for (const [parte, segunda] of [["1ª parte", false], ["2ª parte", true]] as const) {
      for (const [lado, manual] of [["campo normal", false], ["campo invertido", true]] as const) {
        it(`${nombre} · ${parte} · ${lado}`, () => {
          const flipped = sharedPitchFlipped(segunda !== manual);
          const entries = equipos(local, rival);
          const v = sharedPitchViability(entries, flipped, TABLET_DISPONIBILIDAD);
          expect(v.ok, JSON.stringify(v)).toBe(true);
          const { placements } = layoutSharedPitch(entries, flipped, TABLET_DISPONIBILIDAD);
          // Se dibujan TODOS los que hay en pista: diez en cinco contra
          // cinco, nueve si un equipo está en inferioridad. Ninguno se cae.
          expect(placements).toHaveLength(entries.length);
          expect(new Set(placements.map((p) => p.id)).size).toBe(entries.length);
          expect(countOverlaps(placements, TABLET_DISPONIBILIDAD)).toBe(0);
          expect(countOutside(placements, TABLET_DISPONIBILIDAD)).toBe(0);
        });
      }
    }
  }

  it("TODAS las parejas de sistemas reales caben en la tablet", () => {
    // 5×5 combinaciones, en las dos orientaciones. Si alguien añade un
    // sistema nuevo o mueve un puesto, esta prueba lo mide antes de que el
    // entrenador se encuentre dos fichas superpuestas en el banquillo.
    const nombres = Object.keys(SISTEMAS_REALES);
    const malas: string[] = [];
    for (const a of nombres) {
      for (const b of nombres) {
        for (const flipped of [false, true]) {
          const v = sharedPitchViability(
            equipos(SISTEMAS_REALES[a], SISTEMAS_REALES[b]),
            flipped,
            TABLET_DISPONIBILIDAD,
          );
          if (!v.ok) malas.push(`${a}/${b}${flipped ? " invertido" : ""}: ${JSON.stringify(v)}`);
        }
      }
    }
    expect(malas).toEqual([]);
  });

  it("tras una sustitución local, y tras una rival, sigue cabiendo", () => {
    const base = equipos(SISTEMA_1_1_3, SISTEMA_1_1_3);
    const cambios = [
      ["local", base.map((e) => (e.id === "L3" ? { ...e, id: "L21", number: 21 } : e))],
      ["rival", base.map((e) => (e.id === "R1" ? { ...e, id: "R18", number: 18 } : e))],
    ] as const;
    for (const [quien, entries] of cambios) {
      const v = sharedPitchViability(entries, false, TABLET_DISPONIBILIDAD);
      expect(v.ok, quien).toBe(true);
      const { placements } = layoutSharedPitch(entries, false, TABLET_DISPONIBILIDAD);
      expect(placements).toHaveLength(10);
      expect(countOverlaps(placements, TABLET_DISPONIBILIDAD)).toBe(0);
    }
  });

  it("un nombre largo no cambia la geometría: la ficha mide lo que mide", () => {
    // El nombre se recorta en la ficha; el rectángulo es siempre 46×44, que
    // es justo lo que la separación da por supuesto.
    const v = sharedPitchViability(equipos(SISTEMA_1_2_2, SISTEMA_1_2_2), false, TABLET_DISPONIBILIDAD);
    expect(v.ok).toBe(true);
    expect(TABLET_DISPONIBILIDAD.cardWidth).toBe(ESCRITORIO.cardWidth);
    expect(TABLET_DISPONIBILIDAD.cardHeight).toBe(ESCRITORIO.cardHeight);
  });
});

describe("17-19 · cuándo NO se ofrece, y por qué", () => {
  it("si la pista es tan baja que un grupo no cabe, lo dice en vez de amontonar", () => {
    const bajita = { ...TABLET_DISPONIBILIDAD, height: 70 };
    const v = sharedPitchViability(equipos(SISTEMA_1_1_3, SISTEMA_1_1_3), false, bajita);
    expect(v.ok).toBe(false);
    expect(v.fits).toBe(false);
    expect(v.measured).toBe(true);
  });

  it("si la pista es tan estrecha que alguien se sale, tampoco", () => {
    const estrechita = { ...TABLET_DISPONIBILIDAD, width: 200 };
    const v = sharedPitchViability(equipos(SISTEMA_1_2_2, SISTEMA_1_2_2), false, estrechita);
    expect(v.ok).toBe(false);
    expect(v.outside).toBeGreaterThan(0);
  });

  it("sin medida no se promete nada", () => {
    const v = sharedPitchViability(equipos(SISTEMA_1_2_2, SISTEMA_1_2_2), false, { ...ESCRITORIO, width: 0, height: 0 });
    expect(v.measured).toBe(false);
    expect(v.ok).toBe(false);
    const sinJugadores = sharedPitchViability([], false, ESCRITORIO);
    expect(sinJugadores.ok).toBe(false);
  });

  it("la caja de disponibilidad es SUELO: lo que se ofrece, cabe", () => {
    // Entrar exige que quepa en la caja reducida; la pista que se dibuja es
    // mayor. Por eso el modo no puede entrar y salir solo, ni al desplegar un
    // banquillo, ni al venir de columnas con la pista encogida.
    const entries = equipos(SISTEMA_1_1_3, SISTEMA_1_1_3);
    expect(sharedPitchViability(entries, false, TABLET_DISPONIBILIDAD).ok).toBe(true);
    expect(sharedPitchViability(entries, false, TABLET_PISTA_REAL).ok).toBe(true);
    // Con el banquillo abierto la pista baja a 300 px, que es exactamente la
    // caja validada: sigue cabiendo.
    const conBanquilloAbierto = { ...TABLET_PISTA_REAL, height: 430 - BENCH_SPACE_PX };
    expect(sharedPitchViability(entries, false, conBanquilloAbierto).ok).toBe(true);
    // Y donde el espacio común no da ni para dos filas de fichas, no se
    // ofrece: 240 px de espacio dejan 110 de pista, y en 110 no caben dos
    // fichas de 44 separadas.
    const apretado = pitchBoxForAvailability({ width: 343, height: 240 }, ESCRITORIO);
    expect(apretado.height).toBe(110);
    expect(sharedPitchViability(entries, false, apretado).ok).toBe(false);
  });

  it("cuenta de verdad los solapes y las fichas fuera", () => {
    const juntas = [{ left: 50, top: 50 }, { left: 50, top: 51 }, { left: 50, top: 52 }];
    expect(countOverlaps(juntas, TABLET_DISPONIBILIDAD)).toBe(3);
    expect(countOverlaps([{ left: 10, top: 10 }, { left: 90, top: 90 }], TABLET_DISPONIBILIDAD)).toBe(0);
    expect(countOutside([{ left: 0, top: 50 }, { left: 50, top: 50 }, { left: 50, top: 100 }], TABLET_DISPONIBILIDAD)).toBe(2);
  });
});
