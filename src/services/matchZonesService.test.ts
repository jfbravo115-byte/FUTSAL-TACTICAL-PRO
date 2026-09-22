import { describe, expect, it } from "vitest";
import {
  ZONE_OTHER_NOTE,
  ZONE_PREDICATES,
  buildZoneDashboard,
  describeZoneBreakdown,
  mirrorTally,
  primaryBucket,
  tallyActionZones,
  zoneBreakdown,
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

// ── FASE 4 ────────────────────────────────────────────────────────────
describe("goalkeeperZone no contamina los agregados de origen", () => {
  it("la zona donde interviene el portero NUNCA se cuenta como origen de tiro", () => {
    const salida = {
      ...ev("s1", GoalieAction.EXIT, undefined),
      goalkeeperZone: "GK2",
      metadata: { isOpponent: false, exitOutcome: "success" },
    };
    const md = { ...base, events: [salida as any] };
    const dashboard = buildZoneDashboard(md);

    // No crea cubo de 12 zonas: la salida no aporta origen.
    expect(dashboard.zone12).toBeNull();
    expect(dashboard.totals.zonedActions).toBe(0);
  });

  it("si la salida además trae originGrid, cada campo va a lo suyo", () => {
    const salida = {
      ...ev("s1", GoalieAction.EXIT, "Z4R"),
      goalkeeperZone: "GK2",
      metadata: { isOpponent: false },
    };
    const md = { ...base, events: [salida as any, ev("t1", ActionType.SHOT, "Z4R")] };
    const bucket = buildZoneDashboard(md).zone12!;

    // La zona del portero (otro dominio) no aparece; Z4R sí, y solo por el origen.
    expect(bucket.zones.every((z) => !z.zone.startsWith("GK"))).toBe(true);
    expect(bucket.zones.find((z) => z.zone === "Z4R")!.total).toBeGreaterThan(0);
  });
});

// ── BALÓN PARADO ────────────────────────────────────────────────────────
//
// El desglose por ejecución se AÑADE a la dimensión espacial: el lado del
// córner y los sectores siguen respondiendo a lo suyo. Y la comprobación que
// motiva todo esto: un córner ejecutado en tiro y un tiro declarado "desde
// córner" son dos declaraciones independientes que no pueden contarse dos
// veces en el mismo agregado.

describe("desglose de balón parado", () => {
  const partido = (events: any[]) => ({ ...base, events });

  it("desglosa los córners por ejecución sin perder el lado", () => {
    const zones = buildZoneDashboard(
      partido([
        ev("c1", ActionType.CORNER, cornerOriginGrid("left"), false, undefined, { cornerSide: "left", setPieceOutcome: "shot" }),
        ev("c2", ActionType.CORNER, cornerOriginGrid("right"), false, undefined, { cornerSide: "right", setPieceOutcome: "play" }),
        ev("c3", ActionType.CORNER, cornerOriginGrid("left"), false, undefined, { cornerSide: "left" }),
      ]),
      false,
    );
    expect(zones.setPieces.corners).toEqual({ total: 3, shot: 1, play: 1, unrecorded: 1 });
    // La dimensión espacial sigue intacta.
    expect(zones.corners.left).toBe(2);
    expect(zones.corners.right).toBe(1);
    expect(zones.totals.corners).toBe(3);
  });

  it("las faltas conservan recuento y ubicación, y NO se desglosan por ejecución", () => {
    const zones = buildZoneDashboard(
      partido([
        ev("f1", ActionType.FOUL, "Z2C"),
        ev("f2", ActionType.FOUL, undefined),
        ev("f3", ActionType.FOUL, undefined),
      ]),
      false,
    );
    expect(zones.totals.fouls).toBe(3);
    expect(zones.unlocated).toBe(2);
    // Una falta cometida no es "tiro" ni "jugada": el desglose no existe.
    expect((zones.setPieces as any).fouls).toBeUndefined();
    expect(Object.keys(zones.setPieces).filter((k) => /foul|falta/i.test(k))).toEqual([]);
  });

  it("NO hay doble conteo: un córner en tiro más un tiro desde córner", () => {
    const zones = buildZoneDashboard(
      partido([
        ev("c1", ActionType.CORNER, cornerOriginGrid("left"), false, undefined, { cornerSide: "left", setPieceOutcome: "shot" }),
        ev("s1", ActionType.SHOT, "Z4C", false, "G2", { setPiece: "corner" }),
      ]),
      false,
    );
    expect(zones.totals.corners).toBe(1);
    expect(zones.setPieces.corners.total).toBe(1);
    expect(zones.totals.attempts).toBe(1); // el tiro, una sola vez
    // El tiro no entra en el desglose de balón parado: es un tiro.
    expect(zones.setPieces.corners.shot).toBe(1);
  });

  it("falta del rival y tiro propio de falta son dos acciones distintas", () => {
    // El rival comete la infracción; nosotros ejecutamos. Ni se relacionan ni
    // se cuentan dos veces.
    const eventos = [
      ev("f1", ActionType.FOUL, "Z2C", true),
      ev("s1", ActionType.SHOT, "Z4C", false, "G5", { setPiece: "free_kick" }),
    ];
    const propio = buildZoneDashboard(partido(eventos), false);
    expect(propio.totals.attempts).toBe(1);
    expect(propio.totals.fouls).toBe(0); // la falta es del rival

    const rival = buildZoneDashboard(partido(eventos), true);
    expect(rival.totals.fouls).toBe(1);
    expect(rival.totals.attempts).toBe(0);
  });

  it("un partido histórico sin el campo no pierde ni un córner ni una falta", () => {
    const zones = buildZoneDashboard(
      partido([
        ev("c1", ActionType.CORNER, cornerOriginGrid("left"), false, undefined, { cornerSide: "left" }),
        ev("f1", ActionType.FOUL, "Z1C"),
      ]),
      false,
    );
    expect(zones.setPieces.corners).toEqual({ total: 1, shot: 0, play: 0, unrecorded: 1 });
    expect(zones.totals.fouls).toBe(1);
  });
});

describe("jugadas de falta en el cubo de zonas", () => {
  const jugada = (zone?: string, opponent = false) =>
    ev(`sp-${Math.random()}`, ActionType.SET_PIECE, zone, opponent, undefined, {
      setPieceOrigin: "free_kick",
      setPieceOutcome: "play",
    });

  it("se agregan aparte y declaran su ubicación", () => {
    const zones = buildZoneDashboard(
      { ...base, events: [jugada("Z2L"), jugada(), jugada("Z3C", true)] },
      false,
    );
    expect(zones.setPieces.freeKickPlays).toEqual({ total: 2, located: 1, unlocated: 1 });
  });

  it("la perspectiva es la del EJECUTOR, y la rival se espeja como el resto", () => {
    const zones = buildZoneDashboard({ ...base, events: [jugada("Z2L", true)] }, true);
    expect(zones.setPieces.freeKickPlays.located).toBe(1);
    const tally = tallyActionZones(
      { ...base, events: [jugada("Z2L", true)] },
      (e) => e.type === ActionType.SET_PIECE,
      true,
    );
    expect(tally.Z2L).toBe(1);
    // Vista desde el otro banquillo: el mismo sector se lee espejado.
    expect(mirrorTally(tally).Z3R).toBe(1);
  });

  it("no suman a tiros, ni a faltas, ni a córners", () => {
    const zones = buildZoneDashboard(
      {
        ...base,
        events: [
          jugada("Z2L"),
          ev("s1", ActionType.SHOT, "Z4C", false, "G2", { setPiece: "free_kick" }),
          ev("f1", ActionType.FOUL, "Z1C"),
          ev("c1", ActionType.CORNER, cornerOriginGrid("left"), false, undefined, { cornerSide: "left" }),
        ],
      },
      false,
    );
    expect(zones.totals.attempts).toBe(1);
    expect(zones.totals.fouls).toBe(1);
    expect(zones.totals.corners).toBe(1);
    expect(zones.setPieces.freeKickPlays.total).toBe(1);
  });

  it("una jugada sin ubicación se declara, no se ignora", () => {
    const zones = buildZoneDashboard({ ...base, events: [jugada()] }, false);
    expect(zones.unlocated).toBe(1);
    expect(zones.setPieces.freeKickPlays.unlocated).toBe(1);
  });
});

// ── DESGLOSE DE LA CELDA ────────────────────────────────────────────────
//
// El PDF imprimía «22» sin decir de qué. Estos tests fijan las dos reglas
// que hacían imposible descomponerlo bien:
//
//   1. `total` es un recuento de eventos ubicados, NO la suma de las seis
//      categorías: jugadas de falta, paradas y salidas también cuentan;
//   2. `goals` vive DENTRO de `shots`, así que sumarlos aparte cuenta los
//      goles dos veces.
//
// El desglose debe cerrar SIEMPRE contra el número que ve el usuario.

describe("desglose de la celda del mapa", () => {
  const rep = (n: number, f: (i: number) => any) => Array.from({ length: n }, (_, i) => f(i));
  const celda = (eventos: any[], zona = "Z2C") =>
    primaryBucket(buildZoneDashboard({ ...base, events: eventos }, false))!.zones.find(
      (z) => z.zone === zona,
    )!;

  /** El caso real auditado: 9 pérdidas + 6 recuperaciones + 5 tiros + 2 faltas. */
  const z2cReal = () => [
    ...rep(9, (i) => ev(`p${i}`, ActionType.LOSS, "Z2C")),
    ...rep(6, (i) => ev(`r${i}`, ActionType.STEAL, "Z2C")),
    ...rep(5, (i) => ev(`t${i}`, ActionType.SHOT, "Z2C")),
    ...rep(2, (i) => ev(`f${i}`, ActionType.FOUL, "Z2C")),
  ];

  it("1 · el total de la celda = categorías principales + residuo", () => {
    const z = celda([
      ...z2cReal(),
      ev("sp", ActionType.SET_PIECE, "Z2C", false, undefined, {
        setPieceOrigin: "free_kick", setPieceOutcome: "play",
      }),
      ev("sv", GoalieAction.SAVE, "Z2C"),
    ]);
    const d = zoneBreakdown(z);
    expect(d.shots + d.losses + d.recoveries + d.fouls + d.corners + d.other).toBe(z.total);
    expect(d.total).toBe(z.total);
  });

  it("2 · los goles NO se suman aparte: ya están dentro de los tiros", () => {
    const z = celda([
      ...rep(3, (i) => ev(`t${i}`, ActionType.SHOT, "Z2C")),
      ...rep(2, (i) => ev(`g${i}`, ActionType.GOAL, "Z2C")),
    ]);
    const d = zoneBreakdown(z);
    expect(d.shots).toBe(5);
    expect(d.goals).toBe(2);
    expect(d.total).toBe(5);
    // La resta que define «Otras» NO descuenta los goles.
    expect(d.other).toBe(0);
    expect(d.shots + d.goals).not.toBe(d.total);
  });

  it("3 · fixture real: 9 + 6 + 5 + 2 = 22 y «Otras» 0", () => {
    const z = celda(z2cReal());
    expect(z.label).toBe("Zona 2 · centro");
    expect(z.total).toBe(22);
    const d = zoneBreakdown(z);
    expect(d).toMatchObject({
      losses: 9, recoveries: 6, shots: 5, goals: 0, fouls: 2, corners: 0, other: 0,
    });
    expect(describeZoneBreakdown(z).some((f) => f.label === "Otras")).toBe(false);
  });

  it("4 · jugada de falta + parada + salida suben el total y caen en «Otras»", () => {
    const z = celda([
      ...z2cReal(),
      ev("sp", ActionType.SET_PIECE, "Z2C", false, undefined, {
        setPieceOrigin: "free_kick", setPieceOutcome: "play",
      }),
      ev("sv", GoalieAction.SAVE, "Z2C"),
      ev("ex", GoalieAction.EXIT, "Z2C"),
    ]);
    expect(z.total).toBe(25);
    const d = zoneBreakdown(z);
    expect(d.other).toBe(3);
    expect(d.shots).toBe(5); // ninguna de las tres se coló en tiros
    expect(describeZoneBreakdown(z)).toContainEqual({ label: "Otras", value: "3" });
    expect(ZONE_OTHER_NOTE).toMatch(/jugadas de falta|paradas|salidas/);
  });

  it("2b · el residuo se calcula SIN volver a descontar los goles", () => {
    // El caso que hace falta para distinguir las dos fórmulas: goles Y resto
    // a la vez. Si `other` restara también los goles, aquí saldría 0 y el
    // desglose dejaría de cerrar contra el número de la celda.
    const z = celda([
      ...rep(3, (i) => ev(`t${i}`, ActionType.SHOT, "Z2C")),
      ...rep(2, (i) => ev(`g${i}`, ActionType.GOAL, "Z2C")),
      ev("sp", ActionType.SET_PIECE, "Z2C", false, undefined, {
        setPieceOrigin: "free_kick", setPieceOutcome: "play",
      }),
    ]);
    expect(z.total).toBe(6);
    expect(z.shots).toBe(5);
    expect(z.goals).toBe(2);
    const d = zoneBreakdown(z);
    expect(d.other).toBe(1);
    expect(d.shots + d.losses + d.recoveries + d.fouls + d.corners + d.other).toBe(z.total);
    expect(describeZoneBreakdown(z)).toContainEqual({ label: "Otras", value: "1" });
  });

  it("5 · un GOAL incrementa el total UNA vez y pertenece a tiros y a goles", () => {
    const z = celda([ev("g1", ActionType.GOAL, "Z2C")]);
    expect(z.total).toBe(1);
    expect(z.shots).toBe(1);
    expect(z.goals).toBe(1);
    expect(zoneBreakdown(z).other).toBe(0);
    expect(describeZoneBreakdown(z)).toContainEqual({ label: "Tiros", value: "1 (incluye 1 gol)" });
  });

  it("5b · con varios goles la redacción es plural y nunca dos cifras sumables", () => {
    const z = celda(rep(2, (i) => ev(`g${i}`, ActionType.GOAL, "Z2C")));
    const tiros = describeZoneBreakdown(z).find((f) => f.label === "Tiros")!;
    expect(tiros.value).toBe("2 (incluye 2 goles)");
    expect(describeZoneBreakdown(z).some((f) => f.label === "Goles")).toBe(false);
  });

  it("6 · córner + tiro desde ese córner: celda 2, córners 1, tiros 1", () => {
    const z = celda([
      ev("c1", ActionType.CORNER, "Z2C", false, undefined, { cornerSide: "left" }),
      ev("s1", ActionType.SHOT, "Z2C", false, "G2", { setPiece: "corner" }),
    ]);
    expect(z.total).toBe(2);
    expect(z.corners).toBe(1);
    expect(z.shots).toBe(1);
    expect(zoneBreakdown(z).other).toBe(0);
  });

  it("7 · «zona más activa» es EXACTAMENTE la misma cifra que pinta la celda", () => {
    const bucket = primaryBucket(
      buildZoneDashboard({ ...base, events: [...z2cReal(), ev("x", ActionType.SHOT, "Z4L")] }, false),
    )!;
    const counts = Object.fromEntries(bucket.zones.map((z) => [z.zone, z.total]));
    expect(bucket.mostActive!.zone).toBe("Z2C");
    expect(bucket.mostActive!.total).toBe(counts[bucket.mostActive!.zone]);
    expect(bucket.mostActive!.total).toBe(22);
  });

  it("8 · un evento sin sector no entra en ninguna celda", () => {
    const z = celda([...z2cReal(), ev("sinZona", ActionType.LOSS, undefined)]);
    expect(z.total).toBe(22);
    expect(zoneBreakdown(z).losses).toBe(9);
    expect(buildZoneDashboard({ ...base, events: [...z2cReal(), ev("sinZona", ActionType.LOSS, undefined)] }, false).unlocated).toBe(1);
  });

  it("9 · un evento del rival no entra en el mapa propio", () => {
    const eventos = [...z2cReal(), ev("riv", ActionType.LOSS, "Z2C", true)];
    expect(celda(eventos).total).toBe(22);
    const rival = primaryBucket(buildZoneDashboard({ ...base, events: eventos }, true))!;
    expect(rival.zones.find((z) => z.zone === "Z2C")!.total).toBe(1);
  });

  it("una celda vacía se describe sin inventar nada", () => {
    const z = celda([ev("x", ActionType.SHOT, "Z4L")]);
    expect(z.total).toBe(0);
    expect(zoneBreakdown(z).other).toBe(0);
    expect(describeZoneBreakdown(z).map((f) => f.value)).toEqual(["0", "0", "0", "0", "0"]);
  });
});
