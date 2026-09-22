// @vitest-environment jsdom
/**
 * La página «Evolución por periodos», fijada.
 *
 * Lo que estos tests protegen, por orden de importancia:
 *
 *   1. los números salen del MISMO motor que la portada — filtrado por
 *      periodo ANTES de contar, nunca un recuento paralelo;
 *   2. la escala de color se comparte entre las partes de cada métrica, que
 *      es lo único que hace comparable la pareja de mapas;
 *   3. lo que el dato NO dice —atacando, defendiendo, mejor, peor— no
 *      aparece escrito en ninguna parte.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { ActionType, GameEvent, GameState, GoalieAction, MatchData, Period } from "../../types/futsal";
import { buildZoneDashboard, primaryBucket } from "../../services/matchZonesService";
import { ZONE_12_IDS } from "../../utils/fieldZones";
import {
  PeriodZoneMapsBoard,
  PERIOD_ZONE_METRICS,
  buildPeriodColumns,
  hasPeriodZoneData,
  metricCounts,
  metricLocated,
  metricTotal,
  metricUnlocated,
  periodZonePeriods,
  sharedMax,
  unlocatedInTime,
} from "./PeriodZoneMaps";

const P = Period.FIRST, S = Period.SECOND;

const ev = (o: Partial<GameEvent>): GameEvent => ({
  id: "e" + Math.random(), timestamp: 0, wallClock: 0, period: P, playerIds: [],
  type: ActionType.SHOT, gameState: GameState.FOUR_VS_FOUR,
  metadata: { isOpponent: false }, ...o,
});
const rep = (n: number, f: () => GameEvent) => Array.from({ length: n }, f);
const md = (events: GameEvent[]): MatchData => ({
  teamName: "CD MURCIA", opponentName: "PR7", period: Period.SECOND, matchClock: 0,
  isClockRunning: false, fouls: { team: 0, opponent: 0 },
  timeoutsUsed: { team: { period1: false, period2: false }, opponent: { period1: false, period2: false } },
  players: [], events,
});

/** 1P: 6 pérdidas Z2C, 2 recuperaciones Z2C, 4 tiros Z4C.
 *  2P: 3 pérdidas Z2C, 4 recuperaciones Z3L, 1 gol Z4C. */
const partido = () =>
  md([
    ...rep(6, () => ev({ type: ActionType.LOSS, originGrid: "Z2C", period: P })),
    ...rep(3, () => ev({ type: ActionType.LOSS, originGrid: "Z2C", period: S })),
    ...rep(2, () => ev({ type: ActionType.STEAL, originGrid: "Z2C", period: P })),
    ...rep(4, () => ev({ type: ActionType.STEAL, originGrid: "Z3L", period: S })),
    ...rep(4, () => ev({ type: ActionType.SHOT, originGrid: "Z4C", period: P })),
    ev({ type: ActionType.GOAL, originGrid: "Z4C", period: S }),
  ]);

const html = (m: MatchData) =>
  renderToStaticMarkup(React.createElement(PeriodZoneMapsBoard, { matchData: m }));
const texto = (m: MatchData) => html(m).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("evolución por periodos · el motor", () => {
  it("1 · el filtro de 1ª parte deja solo sus acciones", () => {
    const [p1] = buildPeriodColumns(partido());
    expect(p1.period).toBe(P);
    expect(metricLocated(p1.bucket, "losses")).toBe(6);
    expect(metricLocated(p1.bucket, "recoveries")).toBe(2);
    expect(metricLocated(p1.bucket, "shots")).toBe(4);
  });

  it("2 · el filtro de 2ª parte deja solo las suyas", () => {
    const p2 = buildPeriodColumns(partido())[1];
    expect(p2.period).toBe(S);
    expect(metricLocated(p2.bucket, "losses")).toBe(3);
    expect(metricLocated(p2.bucket, "recoveries")).toBe(4);
    expect(metricLocated(p2.bucket, "shots")).toBe(1);
  });

  it("3 · GLOBAL = 1P + 2P por zona para las métricas aditivas", () => {
    const m = partido();
    const g = primaryBucket(buildZoneDashboard(m, false))!;
    const [c1, c2] = buildPeriodColumns(m);
    let comprobadas = 0;
    for (const id of ZONE_12_IDS) {
      const zg = g.zones.find((z) => z.zone === id)!;
      const z1 = c1.bucket!.zones.find((z) => z.zone === id)!;
      const z2 = c2.bucket!.zones.find((z) => z.zone === id)!;
      for (const k of ["total", "losses", "recoveries", "shots", "goals", "fouls", "corners"] as const) {
        expect(zg[k]).toBe(z1[k] + z2[k]);
        comprobadas++;
      }
    }
    expect(comprobadas).toBe(12 * 7);
  });

  it("4 · cada mapa conserva las 12 zonas", () => {
    for (const col of buildPeriodColumns(partido())) {
      expect(Object.keys(metricCounts(col.bucket, "losses")).sort()).toEqual([...ZONE_12_IDS].sort());
    }
  });

  it("5-7 · las tres métricas se leen del dashboard, no de un recuento nuevo", () => {
    const m = partido();
    const [c1, c2] = buildPeriodColumns(m);
    expect(metricCounts(c1.bucket, "losses").Z2C).toBe(6);
    expect(metricCounts(c2.bucket, "losses").Z2C).toBe(3);
    expect(metricCounts(c1.bucket, "recoveries").Z2C).toBe(2);
    expect(metricCounts(c2.bucket, "recoveries").Z3L).toBe(4);
    expect(metricCounts(c1.bucket, "shots").Z4C).toBe(4);
    expect(metricCounts(c2.bucket, "shots").Z4C).toBe(1); // el gol es un tiro
    // …y coinciden con lo que da el motor llamado por separado.
    expect(metricCounts(c1.bucket, "losses")).toEqual(
      Object.fromEntries(primaryBucket(buildZoneDashboard(m, false, P))!.zones.map((z) => [z.zone, z.losses])),
    );
  });
});

describe("evolución por periodos · escala compartida", () => {
  it("8-10 · un sharedMax por métrica, nunca uno común", () => {
    const cols = buildPeriodColumns(partido());
    expect(sharedMax(cols, "losses")).toBe(6);      // max(6, 3)
    expect(sharedMax(cols, "recoveries")).toBe(4);  // max(2, 4)
    expect(sharedMax(cols, "shots")).toBe(4);       // max(4, 1)
  });

  it("11 · 6 y 3 NO se pintan igual: el de 3 es menos intenso", () => {
    const m = html(partido());
    // Las celdas llevan el color inline; se extraen los alphas de las dos
    // celdas Z2C de pérdidas, que son las dos primeras del bloque.
    const alphas = [...m.matchAll(/rgba\(234, 88, 12, ([\d.]+)\)/g)].map((x) => Number(x[1]));
    expect(alphas.length).toBeGreaterThanOrEqual(2);
    const [seis, tres] = [Math.max(...alphas), Math.min(...alphas)];
    expect(tres).toBeLessThan(seis);
    // Y son exactamente los que impone 6/6 y 3/6.
    expect(seis).toBeCloseTo(0.18 + (6 / 6) * 0.55, 5);
    expect(tres).toBeCloseTo(0.18 + (3 / 6) * 0.55, 5);
  });

  it("12 · cada métrica se pinta con SU máximo, no con el de la más numerosa", () => {
    // Las pérdidas llegan a 6 y las recuperaciones a 4. Si las tres filas
    // compartieran un único máximo, el 4 de recuperaciones se pintaría como
    // 4/6 y parecería poco por culpa de una métrica que no tiene nada que ver.
    const m = html(partido());
    const morado = [...m.matchAll(/rgba\(147, 51, 234, ([\d.]+)\)/g)].map((x) => Number(x[1]));
    const azul = [...m.matchAll(/rgba\(37, 99, 235, ([\d.]+)\)/g)].map((x) => Number(x[1]));
    // recuperaciones: el 4 es el máximo de SU fila → intensidad plena
    expect(Math.max(...morado)).toBeCloseTo(0.18 + (4 / 4) * 0.55, 5);
    expect(Math.min(...morado)).toBeCloseTo(0.18 + (2 / 4) * 0.55, 5);
    // tiros: el 4 también es el máximo de la suya
    expect(Math.max(...azul)).toBeCloseTo(0.18 + (4 / 4) * 0.55, 5);
    expect(Math.min(...azul)).toBeCloseTo(0.18 + (1 / 4) * 0.55, 5);
  });

  it("13 · el sharedMax no altera ningún recuento", () => {
    const cols = buildPeriodColumns(partido());
    expect(metricCounts(cols[0].bucket, "losses").Z2C).toBe(6);
    expect(metricCounts(cols[1].bucket, "losses").Z2C).toBe(3);
    expect(texto(partido())).toContain("1ª parte · 6");
    expect(texto(partido())).toContain("2ª parte · 3");
  });
});

describe("evolución por periodos · periodos", () => {
  it("14-15 · las dos partes salen siempre, aunque una esté vacía", () => {
    const soloPrimera = md(rep(3, () => ev({ type: ActionType.LOSS, originGrid: "Z2C", period: P })));
    expect(periodZonePeriods(soloPrimera)).toEqual([P, S]);
    const t = texto(soloPrimera);
    expect(t).toContain("1ª parte · 3");
    expect(t).toContain("2ª parte · 0");
  });

  it("16-17 · un evento sin periodo se avisa y NO se asigna a ninguna parte", () => {
    const m = md([
      ...rep(4, () => ev({ type: ActionType.LOSS, originGrid: "Z2C", period: P })),
      { ...ev({ type: ActionType.LOSS, originGrid: "Z2C" }), period: undefined as any },
    ]);
    const cols = buildPeriodColumns(m);
    const g = primaryBucket(buildZoneDashboard(m, false));
    expect(metricLocated(cols[0].bucket, "losses")).toBe(4);
    expect(metricLocated(cols[1].bucket, "losses")).toBe(0);
    expect(unlocatedInTime(g, cols, "losses")).toBe(1);
    const t = texto(m);
    expect(t).toContain("1 acción(es) con zona sin periodo registrado");
    expect(t).toContain("el total puede no coincidir con la suma de las partes");
  });

  it("sin acciones huérfanas no aparece ningún aviso", () => {
    expect(texto(partido())).not.toContain("sin periodo registrado");
  });

  it("18-20 · la prórroga tiene su propia columna y nunca entra en la 2ª parte", () => {
    const m = md([
      ...rep(2, () => ev({ type: ActionType.LOSS, originGrid: "Z2C", period: P })),
      ...rep(3, () => ev({ type: ActionType.LOSS, originGrid: "Z2C", period: S })),
      ...rep(5, () => ev({ type: ActionType.LOSS, originGrid: "Z2C", period: Period.OVERTIME_1 })),
      ev({ type: ActionType.LOSS, originGrid: "Z2C", period: Period.OVERTIME_2 }),
    ]);
    expect(periodZonePeriods(m)).toEqual([P, S, Period.OVERTIME_1, Period.OVERTIME_2]);
    const cols = buildPeriodColumns(m);
    expect(cols.map((c) => metricLocated(c.bucket, "losses"))).toEqual([2, 3, 5, 1]);
    const t = texto(m);
    expect(t).toContain("2ª parte · 3");
    expect(t).toContain("Prórroga 1 · 5");
    expect(t).toContain("Prórroga 2 · 1");
    // Y la escala las abarca todas.
    expect(sharedMax(cols, "losses")).toBe(5);
  });

  it("un periodo FINISHED no crea columna", () => {
    const m = md([
      ev({ type: ActionType.LOSS, originGrid: "Z2C", period: P }),
      ev({ type: ActionType.LOSS, originGrid: "Z2C", period: Period.FINISHED }),
    ]);
    expect(periodZonePeriods(m)).toEqual([P, S]);
  });
});

describe("evolución por periodos · cuándo NO se dibuja", () => {
  it("21 · un partido histórico de 9 celdas no genera página", () => {
    expect(hasPeriodZoneData(md([ev({ type: ActionType.SHOT, originGrid: "B2", period: P })]))).toBe(false);
  });

  it("22 · un partido sin acciones espaciales relevantes tampoco", () => {
    expect(hasPeriodZoneData(md([]))).toBe(false);
    // Una falta ubicada NO basta: no es ninguna de las tres métricas.
    expect(hasPeriodZoneData(md([ev({ type: ActionType.FOUL, originGrid: "Z2C", period: P })]))).toBe(false);
    // Un solo tiro ubicado sí.
    expect(hasPeriodZoneData(md([ev({ type: ActionType.SHOT, originGrid: "Z2C", period: P })]))).toBe(true);
  });
});

describe("evolución por periodos · lo que NO se afirma", () => {
  const t = () => texto(partido());

  it("23-25 · ni fases de juego ni valoraciones", () => {
    for (const prohibido of [
      /atacando/i, /defendiendo/i, /fase ofensiva/i, /fase defensiva/i,
      /transici[oó]n ofensiva/i, /transici[oó]n defensiva/i,
      /mejor zona/i, /peor zona/i, /m[aá]s eficaz/i, /m[aá]s peligrosa/i,
      /mejor[oó]/i, /empeor[oó]/i,
    ]) {
      expect(t()).not.toMatch(prohibido);
    }
  });

  it("26 · la leyenda declara que la escala es compartida y no mide eficacia", () => {
    expect(t()).toContain("Mayor intensidad = mayor volumen");
    expect(t()).toContain("La escala se comparte entre las partes de cada fila");
    expect(t()).toContain("No indica eficacia");
    expect(t()).toContain("no compares la intensidad de una fila con la de otra");
  });

  it("los goles van DENTRO de los tiros, nunca como cifra aparte sumable", () => {
    const t2 = texto(partido());
    expect(t2).toContain("2ª parte · 1 · 1 gol");
    expect(t2).not.toMatch(/Tiros 5 · Goles 1/);
  });

  it("las tres métricas son exactamente pérdidas, recuperaciones y tiros", () => {
    expect(PERIOD_ZONE_METRICS.map((m) => m.title)).toEqual(["Pérdidas", "Recuperaciones", "Tiros"]);
    const t2 = texto(partido());
    expect(t2).not.toContain("Córners");
    expect(t2).not.toContain("Faltas");
  });
});

describe("evolución por periodos · acciones no dibujables", () => {
  it("un penalti se declara aparte y no como «sin ubicación»", () => {
    const m = md([
      ev({ type: ActionType.SHOT, originGrid: "Z4C", period: P }),
      ev({ type: ActionType.SHOT, period: P, originGrid: undefined, metadata: { isOpponent: false, setPiece: "penalty" } }),
    ]);
    const [c1] = buildPeriodColumns(m);
    expect(metricTotal(c1.dashboard, "shots")).toBe(2);
    expect(metricLocated(c1.bucket, "shots")).toBe(1);
    expect(metricUnlocated(c1.dashboard, c1.bucket, "shots")).toBe(0);
    expect(texto(m)).toContain("1 desde el punto de penalti");
  });

  it("una pérdida sin sector se declara «sin ubicación»", () => {
    const m = md([
      ev({ type: ActionType.LOSS, originGrid: "Z2C", period: P }),
      ev({ type: ActionType.LOSS, originGrid: undefined, period: P }),
    ]);
    const [c1] = buildPeriodColumns(m);
    expect(metricUnlocated(c1.dashboard, c1.bucket, "losses")).toBe(1);
    expect(texto(m)).toContain("1 sin ubicación");
  });

  it("una parada con sector no se cuela en ninguna de las tres métricas", () => {
    const m = md([
      ev({ type: ActionType.LOSS, originGrid: "Z2C", period: P }),
      ev({ type: GoalieAction.SAVE, originGrid: "Z2C", period: P }),
    ]);
    const [c1] = buildPeriodColumns(m);
    expect(metricLocated(c1.bucket, "losses")).toBe(1);
    expect(metricLocated(c1.bucket, "shots")).toBe(0);
    expect(metricLocated(c1.bucket, "recoveries")).toBe(0);
  });
});
