import { describe, expect, it } from "vitest";
import {
  ZONE_PREDICATES,
  buildZoneDashboard,
  mirrorTally,
  primaryBucket,
  tallyActionZones,
  zoneMetricValue,
} from "./matchZonesService";
import { ActionType, GameState, GoalieAction, MatchData, Period } from "../types/futsal";
import { describeBand, ACTION_NOUN } from "../utils/fieldZones";
import { cornerOriginGrid } from "../utils/cornerModel";

const base: MatchData = {
  teamName: "Local", opponentName: "Rival", period: Period.FIRST, matchClock: 0, isClockRunning: false,
  fouls: { team: 0, opponent: 0 },
  timeoutsUsed: { team: { period1: false, period2: false }, opponent: { period1: false, period2: false } },
  players: [], events: [],
};

function ev(
  id: string,
  type: ActionType | GoalieAction,
  zone?: string,
  isOpponent = false,
  destinationGrid?: string,
  extraMetadata?: Record<string, any>,
) {
  return {
    id, timestamp: 0, wallClock: 0, period: Period.FIRST, playerIds: [], type,
    gameState: GameState.FOUR_VS_FOUR,
    originGrid: zone, destinationGrid,
    metadata: { isOpponent, ...extraMetadata },
  };
}

describe("sistema nuevo de 12 zonas", () => {
  it("agrega tiros, pérdidas y recuperaciones por sector", () => {
    const md = { ...base, events: [
      ev("1", ActionType.SHOT, "Z4C"),
      ev("2", ActionType.GOAL, "Z4C"),
      ev("3", ActionType.STEAL, "Z1R"),
      ev("4", ActionType.LOSS, "Z2C"),
    ]};
    const bucket = buildZoneDashboard(md).zone12!;
    expect(bucket.system).toBe("zone12");

    const z4c = bucket.zones.find((z) => z.zone === "Z4C")!;
    expect(z4c.total).toBe(2);
    expect(z4c.shots).toBe(2);
    expect(z4c.goals).toBe(1);
    expect(bucket.zones.find((z) => z.zone === "Z1R")!.recoveries).toBe(1);
    expect(bucket.zones.find((z) => z.zone === "Z2C")!.losses).toBe(1);
  });

  it("acompaña cada sector de su etiqueta de usuario", () => {
    const md = { ...base, events: [ev("1", ActionType.SHOT, "Z2C")] };
    const bucket = buildZoneDashboard(md).zone12!;
    expect(bucket.zones.find((z) => z.zone === "Z2C")!.label).toBe("Zona 2 · centro");
    for (const zone of bucket.zones) {
      expect(zone.label).not.toMatch(/Z[1-4][LCR]/);
    }
  });

  it("separa acciones propias y rivales", () => {
    const md = { ...base, events: [
      ev("1", ActionType.SHOT, "Z4L", false),
      ev("2", ActionType.SHOT, "Z4L", true),
    ]};
    expect(buildZoneDashboard(md, false).zone12!.zones.find((z) => z.zone === "Z4L")!.total).toBe(1);
    expect(buildZoneDashboard(md, true).zone12!.zones.find((z) => z.zone === "Z4L")!.total).toBe(1);
  });

  it("señala el sector más activo y el más productivo en tiro", () => {
    const md = { ...base, events: [
      ev("1", ActionType.LOSS, "Z2C"), ev("2", ActionType.LOSS, "Z2C"), ev("3", ActionType.LOSS, "Z2C"),
      ev("4", ActionType.GOAL, "Z4R"),
    ]};
    const bucket = buildZoneDashboard(md).zone12!;
    expect(bucket.mostActive!.zone).toBe("Z2C");
    expect(bucket.mostDangerous!.zone).toBe("Z4R");
  });
});

describe("compatibilidad histórica", () => {
  it("lee un partido antiguo en su propia rejilla de 9 celdas", () => {
    const md = { ...base, events: [ev("1", ActionType.SHOT, "B2"), ev("2", ActionType.LOSS, "C3")] };
    const dashboard = buildZoneDashboard(md);

    expect(dashboard.legacy!.system).toBe("legacy3x3");
    expect(dashboard.legacy!.zones).toHaveLength(9);
    expect(dashboard.legacy!.zones.find((z) => z.zone === "B2")!.shots).toBe(1);
    // Y NO aparece en el sistema nuevo.
    expect(dashboard.zone12).toBeNull();
  });

  it("etiqueta las celdas históricas sin afirmar una perspectiva que no existe", () => {
    const md = { ...base, events: [ev("1", ActionType.SHOT, "A1")] };
    const a1 = buildZoneDashboard(md).legacy!.zones.find((z) => z.zone === "A1")!;
    expect(a1.label).toBe("Franja 1 · banda superior");
    expect(a1.label).not.toMatch(/^Zona /);
  });

  it("nunca suma los dos sistemas en un mismo cubo", () => {
    const md = { ...base, events: [ev("1", ActionType.SHOT, "Z4C"), ev("2", ActionType.SHOT, "B2")] };
    const dashboard = buildZoneDashboard(md);
    expect(dashboard.zone12!.total).toBe(1);
    expect(dashboard.legacy!.total).toBe(1);
    // Cada celda histórica queda fuera del cubo nuevo y viceversa.
    expect(dashboard.zone12!.zones.every((z) => z.zone.startsWith("Z"))).toBe(true);
    expect(dashboard.legacy!.zones.every((z) => !z.zone.startsWith("Z"))).toBe(true);
  });

  it("prioriza el sistema nuevo cuando existe", () => {
    const nuevo = { ...base, events: [ev("1", ActionType.SHOT, "Z4C")] };
    const viejo = { ...base, events: [ev("1", ActionType.SHOT, "B2")] };
    expect(primaryBucket(buildZoneDashboard(nuevo))!.system).toBe("zone12");
    expect(primaryBucket(buildZoneDashboard(viejo))!.system).toBe("legacy3x3");
  });
});

describe("faltas", () => {
  it("agrega faltas cometidas por sector", () => {
    const md = { ...base, events: [
      ev("1", ActionType.FOUL, "Z2R"), ev("2", ActionType.FOUL, "Z2R"),
      ev("3", ActionType.FOUL, "Z2R"), ev("4", ActionType.FOUL, "Z2R"),
    ]};
    const bucket = buildZoneDashboard(md).zone12!;
    expect(bucket.zones.find((z) => z.zone === "Z2R")!.fouls).toBe(4);
    expect(buildZoneDashboard(md).totals.fouls).toBe(4);
  });

  it("produce la lectura textual «4 faltas en Zona 2 · derecha»", () => {
    const md = { ...base, events: [
      ev("1", ActionType.FOUL, "Z2R"), ev("2", ActionType.FOUL, "Z2R"),
      ev("3", ActionType.FOUL, "Z2R"), ev("4", ActionType.FOUL, "Z2R"),
    ]};
    const tally = tallyActionZones(md, ZONE_PREDICATES.fouls);
    expect(describeBand(2, tally, ACTION_NOUN[ActionType.FOUL]!)).toBe(
      "Zona 2: 4 faltas — 4 derecha",
    );
  });

  it("una falta histórica sin ubicación sigue siendo válida y se declara como tal", () => {
    const md = { ...base, events: [
      ev("1", ActionType.FOUL, undefined),
      ev("2", ActionType.FOUL, "Z3C"),
    ]};
    const dashboard = buildZoneDashboard(md);
    expect(dashboard.totals.fouls).toBe(2);
    expect(dashboard.unlocated).toBe(1);
    // La falta sin zona NO se asigna a ningún sector.
    expect(dashboard.zone12!.zones.reduce((a, z) => a + z.fouls, 0)).toBe(1);
  });

  it("una falta recibida se obtiene espejando la zona de quien la comete", () => {
    // El rival comete una falta en SU Zona 1 · izquierda; para mí es una falta
    // recibida en MI Zona 4 · derecha. No se guarda una segunda zona.
    const md = { ...base, events: [ev("1", ActionType.FOUL, "Z1L", true)] };
    const cometidas = tallyActionZones(md, ZONE_PREDICATES.fouls, true);
    expect(cometidas.Z1L).toBe(1);

    const recibidas = mirrorTally(cometidas);
    expect(recibidas.Z4R).toBe(1);
    expect(recibidas.Z1L).toBe(0);
  });

  it("el espejo del recuento es involutivo", () => {
    const md = { ...base, events: [ev("1", ActionType.FOUL, "Z2C", true), ev("2", ActionType.FOUL, "Z4L", true)] };
    const original = tallyActionZones(md, ZONE_PREDICATES.fouls, true);
    expect(mirrorTally(mirrorTally(original))).toEqual(original);
  });
});

describe("córners", () => {
  const corner = (id: string, side: "left" | "right", isOpponent = false) =>
    ev(id, ActionType.CORNER, cornerOriginGrid(side), isOpponent, undefined, { cornerSide: side });

  it("cuenta córners de mi equipo y del rival por separado", () => {
    const md = { ...base, events: [
      corner("c1", "left"), corner("c2", "left"), corner("c3", "left"), corner("c4", "left"),
      corner("c5", "right"), corner("c6", "right"),
      corner("r1", "left", true),
    ]};
    expect(buildZoneDashboard(md, false).corners).toEqual({ total: 6, left: 4, right: 2, unspecified: 0 });
    expect(buildZoneDashboard(md, true).corners).toEqual({ total: 1, left: 1, right: 0, unspecified: 0 });
  });

  it("se integra además en el agregado por sector, sin dejar de ser un córner", () => {
    const md = { ...base, events: [corner("c1", "left"), corner("c2", "right")] };
    const bucket = buildZoneDashboard(md).zone12!;
    expect(bucket.zones.find((z) => z.zone === "Z4L")!.corners).toBe(1);
    expect(bucket.zones.find((z) => z.zone === "Z4R")!.corners).toBe(1);
    expect(buildZoneDashboard(md).totals.corners).toBe(2);
  });
});

describe("destino de tiro en portería", () => {
  it("construye destino, fuera y porcentajes sin inventar datos", () => {
    const md = { ...base, events: [
      ev("1", ActionType.GOAL, "Z4C", false, "G1"),
      ev("2", ActionType.SHOT, "Z4C", false, "G2"),
      ev("3", ActionType.SHOT, "Z3L", false, "OUT"),
      ev("4", ActionType.STEAL, "Z1C"),
      ev("5", ActionType.LOSS, "Z2R"),
    ]};
    const dashboard = buildZoneDashboard(md, false);
    expect(dashboard.totals.attempts).toBe(3);
    expect(dashboard.totals.onTarget).toBe(2);
    expect(dashboard.totals.goals).toBe(1);
    expect(dashboard.totals.accuracyPct).toBe(67);
    expect(dashboard.totals.conversionPct).toBe(33);
    expect(dashboard.out).toBe(1);
    expect(dashboard.goal.find((z) => z.zone === "G1")).toMatchObject({ attempts: 1, goals: 1 });
  });

  it("etiqueta las zonas de portería sin mostrar G1-G9", () => {
    const dashboard = buildZoneDashboard(base, false);
    expect(dashboard.goal.find((z) => z.zone === "G5")!.label).toBe("Medio · centro");
    for (const zone of dashboard.goal) {
      expect(zone.label).not.toMatch(/^G[1-9]$/);
    }
  });

  it("cuenta GOAL_CONCEDED como intento/gol del lado que indique metadata.isOpponent", () => {
    const md = { ...base, events: [ev("1", GoalieAction.GOAL_CONCEDED, "Z1C", true, "G3")] };
    expect(buildZoneDashboard(md, false).totals.attempts).toBe(0);
    expect(buildZoneDashboard(md, true).totals).toMatchObject({ attempts: 1, goals: 1 });
  });
});

describe("filtros de la matriz", () => {
  it("expone un valor estable para cada métrica", () => {
    const zone = {
      zone: "Z1L", label: "Zona 1 · izquierda",
      total: 9, shots: 4, recoveries: 2, losses: 1, goals: 1, fouls: 1, corners: 1,
    };
    expect(zoneMetricValue(zone, "all")).toBe(9);
    expect(zoneMetricValue(zone, "shots")).toBe(4);
    expect(zoneMetricValue(zone, "recoveries")).toBe(2);
    expect(zoneMetricValue(zone, "losses")).toBe(1);
    expect(zoneMetricValue(zone, "fouls")).toBe(1);
    expect(zoneMetricValue(zone, "corners")).toBe(1);
  });
});
