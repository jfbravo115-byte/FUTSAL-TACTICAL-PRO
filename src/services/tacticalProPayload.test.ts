/**
 * Contexto compartido de TACTICAL PRO.
 *
 * El problema que corrige: MatchTracker enviaba solo `matchData` y
 * MatchAnalysis enviaba además el resumen determinista, así que el mismo
 * partido llegaba al modelo con dos niveles de información según el botón.
 *
 * Estos tests fijan que el contexto sale de los helpers que ya son
 * autoritativos —no de un cálculo nuevo— y que las cuatro cosas que se
 * parecen entre sí viajan separadas y explicadas.
 */
import { describe, expect, it } from "vitest";
import {
  ActionType,
  GameEvent,
  GoalieAction,
  MatchData,
  Period,
  Player,
  Role,
} from "../types/futsal";
import { generateMatchReport } from "./matchReportService";
import { buildGoalkeeperReports } from "./goalkeeperReportService";
import { buildZoneDashboard } from "./matchZonesService";
import { TACTICAL_PRO_GLOSSARY, buildTacticalProPayload } from "./tacticalProPayload";

function player(overrides: Partial<Player> = {}): Player {
  return {
    id: "p1",
    number: 7,
    name: "Juan",
    role: Role.PLAYER,
    isOnPitch: true,
    plusMinus: 0,
    individualTimeSeconds: 600,
    isOpponent: false,
    stats: {
      goals: 0, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0,
      fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0,
      // Números del modelo viejo, deliberadamente falsos: si el contexto los
      // leyera en vez de los helpers de Fase 4, los tests lo dirían.
      saves: 77, conceded: 77,
    },
    ...overrides,
  };
}

function ev(overrides: Partial<GameEvent>): GameEvent {
  return {
    id: `e-${Math.random()}`,
    timestamp: 0,
    wallClock: 0,
    period: Period.FIRST,
    playerIds: [],
    type: ActionType.SHOT,
    gameState: "4vs4" as any,
    ...overrides,
  };
}

/** Un partido con una pieza de cada fase. */
function partido(): MatchData {
  const gk = player({ id: "tp1", number: 1, name: "Portero", role: Role.GOALKEEPER });
  const rivalGk = player({ id: "r1", number: 1, name: "Portero rival", role: Role.GOALKEEPER, isOpponent: true });
  return {
    teamName: "Mi Equipo",
    opponentName: "Rival CF",
    period: Period.SECOND,
    matchClock: 600000,
    isClockRunning: false,
    fouls: { team: 2, opponent: 3 },
    timeoutsUsed: { team: { period1: false, period2: false }, opponent: { period1: false, period2: false } },
    players: [player(), gk, rivalGk],
    events: [
      // Fase 3: sectores normalizados, propios y rivales.
      ev({ type: ActionType.SHOT, playerIds: ["p1"], originGrid: "Z3C", destinationGrid: "G2", metadata: { isOpponent: false } }),
      ev({ type: ActionType.STEAL, playerIds: ["p1"], originGrid: "Z2L", metadata: { isOpponent: false } }),
      // Fase 4: tiro rival respondido por nuestro portero (Modelo C).
      ev({
        type: ActionType.SHOT,
        playerIds: ["r2", "tp1"],
        originGrid: "Z4C",
        destinationGrid: "G5",
        goalkeeperZone: "GK2" as any,
        metadata: { isOpponent: true, goalieResponse: GoalieAction.SAVE_CATCH, targetGoalkeeperId: "tp1" },
      }),
      ev({
        type: ActionType.SHOT,
        playerIds: ["r2", "tp1"],
        originGrid: "Z4L",
        goalkeeperZone: "GK4" as any,
        metadata: { isOpponent: true, goalieResponse: GoalieAction.EXIT, exitOutcome: "success", targetGoalkeeperId: "tp1" },
      }),
      // Fase 5: las cuatro piezas de balón parado.
      ev({ type: ActionType.CORNER, originGrid: "Z4L", metadata: { isOpponent: false, cornerSide: "left", setPieceOutcome: "shot" } }),
      ev({ type: ActionType.FOUL, playerIds: ["p1"], originGrid: "Z2C", metadata: { isOpponent: false } }),
      ev({ type: ActionType.SET_PIECE, playerIds: ["p1"], originGrid: "Z2L", metadata: { isOpponent: false, setPieceOrigin: "free_kick", setPieceOutcome: "play" } }),
      ev({ type: ActionType.SHOT, playerIds: ["p1"], originGrid: "Z4C", destinationGrid: "G1", metadata: { isOpponent: false, setPiece: "corner" } }),
    ],
  };
}

describe("payload compartido", () => {
  it("lleva las tres piezas: partido, resumen y contexto táctico", () => {
    const payload = buildTacticalProPayload(partido());
    expect(Object.keys(payload).sort()).toEqual([
      "deterministicReport",
      "matchData",
      "tacticalContext",
    ]);
    expect(Object.keys(payload.tacticalContext).sort()).toEqual([
      "glossary",
      "goalkeepers",
      "zones",
    ]);
  });

  it("es determinista: el mismo partido produce el mismo contexto", () => {
    const md = partido();
    const a = buildTacticalProPayload(md);
    const b = buildTacticalProPayload(md);
    // Es lo que estaba roto: dos rutas, dos contextos para el mismo partido.
    // Lo único que varía legítimamente es el instante de generación.
    const sinSello = ({ generatedAt, ...resto }: any) => resto;
    expect(JSON.stringify(sinSello(a.deterministicReport))).toBe(
      JSON.stringify(sinSello(b.deterministicReport)),
    );
    expect(JSON.stringify(a.tacticalContext)).toBe(JSON.stringify(b.tacticalContext));
    expect(a.deterministicReport.generatedAt).toBeDefined();
  });

  it("no recalcula: cada bloque es exactamente el de su helper autoritativo", () => {
    const md = partido();
    const payload = buildTacticalProPayload(md);
    const { generatedAt: _a, ...informe } = payload.deterministicReport as any;
    const { generatedAt: _b, ...esperado } = generateMatchReport(md) as any;
    expect(informe).toEqual(esperado);
    expect(payload.tacticalContext.goalkeepers).toEqual(buildGoalkeeperReports(md));
    expect(payload.tacticalContext.zones.team).toEqual(buildZoneDashboard(md, false));
    expect(payload.tacticalContext.zones.opponent).toEqual(buildZoneDashboard(md, true));
  });

  it("conserva matchData como contexto", () => {
    const md = partido();
    expect(buildTacticalProPayload(md).matchData).toBe(md);
  });

  it("viaja entero a través de JSON, que es como se envía", () => {
    const payload = JSON.parse(JSON.stringify(buildTacticalProPayload(partido())));
    expect(payload.tacticalContext.goalkeepers.length).toBeGreaterThan(0);
    expect(payload.tacticalContext.glossary.length).toBeGreaterThan(0);
    expect(payload.deterministicReport.score).toBeDefined();
  });
});

describe("Fase 4 · porteros completos", () => {
  const gk = () =>
    buildTacticalProPayload(partido()).tacticalContext.goalkeepers.find((g) => g.id === "tp1")!;

  it("incluye el desglose de paradas y las salidas con su resultado", () => {
    const portero = gk();
    expect(portero.totalSaves).toBe(1);
    expect(portero.saveCatch).toBe(1);
    expect(portero.saveDeflect).toBe(0);
    expect(portero.exits).toBe(1);
    expect(portero.exitsSuccess).toBe(1);
    expect(portero.conceded).toBe(0);
  });

  it("incluye las zonas GK1-GK5 y lo que no tiene ubicación", () => {
    const portero = gk();
    expect(portero.interventionZones).toEqual({ GK1: 0, GK2: 1, GK3: 0, GK4: 1, GK5: 0 });
    expect(portero.interventionsUnlocated).toBe(0);
  });

  it("NO procede de player.stats.saves", () => {
    // El fixture pone 77 a propósito.
    expect(gk().totalSaves).not.toBe(77);
    expect(gk().conceded).not.toBe(77);
  });

  it("incluye también al portero rival, sin mezclar bandos", () => {
    const porteros = buildTacticalProPayload(partido()).tacticalContext.goalkeepers;
    const rival = porteros.find((g) => g.id === "r1");
    expect(rival?.isOpponent).toBe(true);
    expect(rival?.totalSaves).toBe(0);
  });
});

describe("Fase 3 · zonas con perspectiva", () => {
  it("separa los sectores propios de los del rival", () => {
    const { zones } = buildTacticalProPayload(partido()).tacticalContext;
    expect(zones.team.zone12?.zones.find((z) => z.zone === "Z3C")?.total).toBe(1);
    expect(zones.opponent.zone12?.zones.find((z) => z.zone === "Z4C")?.total).toBe(1);
    // Lo propio no aparece en el cubo rival ni al revés.
    expect(zones.opponent.zone12?.zones.find((z) => z.zone === "Z3C")?.total).toBe(0);
  });

  it("lleva el destino en portería, que el resumen no tenía", () => {
    const { zones } = buildTacticalProPayload(partido()).tacticalContext;
    expect(zones.team.goal.find((g) => g.zone === "G2")?.attempts).toBe(1);
  });
});

describe("Fase 5 · balón parado, sin fusionar métricas", () => {
  const ctx = () => buildTacticalProPayload(partido()).tacticalContext;

  it("un tiro directo de córner NO es un tiro procedente de córner", () => {
    const payload = buildTacticalProPayload(partido());
    expect(ctx().zones.team.setPieces.corners.shot).toBe(1); // CORNER outcome='shot'
    expect(payload.deterministicReport.teamTotals.shotsFromCorner).toBe(1); // SHOT setPiece='corner'
    // Son dos hechos distintos, contados por separado: un córner y un tiro.
    expect(ctx().zones.team.totals.corners).toBe(1);
  });

  it("la falta cometida, la jugada de falta y el tiro de falta van por separado", () => {
    const payload = buildTacticalProPayload(partido());
    expect(payload.deterministicReport.teamTotals.fouls).toBe(2); // contador reglamentario
    expect(payload.deterministicReport.setPieces.freeKickPlays.team.total).toBe(1);
    expect(payload.deterministicReport.teamTotals.shotsFromFreeKick).toBe(0);
    expect(ctx().zones.team.setPieces.freeKickPlays.total).toBe(1);
  });
});

describe("glosario", () => {
  const texto = () => TACTICAL_PRO_GLOSSARY.join("\n");

  it("explica los sectores y su normalización por equipo", () => {
    expect(texto()).toMatch(/Z1-Z4/);
    expect(texto()).toContain("perspectiva del equipo que ejecuta");
  });

  it("explica GK1-GK5 como dominio propio", () => {
    expect(texto()).toContain("GK1-GK5");
    expect(texto()).toMatch(/no son sectores de pista/i);
  });

  it("separa las dos métricas de córner", () => {
    expect(texto()).toContain("Tiro directo de córner");
    expect(texto()).toContain("Tiro procedente de córner");
    expect(texto()).toMatch(/registro INDEPENDIENTE/);
  });

  it("separa infracción, reanudación y tiro de falta", () => {
    expect(texto()).toMatch(/FOUL: infracción COMETIDA/);
    expect(texto()).toMatch(/puso en juego en corto/);
    expect(texto()).toMatch(/SHOT con setPiece 'free_kick'/);
  });

  it("prohíbe inferir relaciones por cercanía temporal", () => {
    expect(texto()).toContain("No infieras relaciones causales");
    expect(texto()).toContain("cercanía temporal");
  });

  it("fija que ausencia no es cero", () => {
    expect(texto()).toContain("no se registró");
    expect(texto()).toContain("ceros observados");
  });
});
