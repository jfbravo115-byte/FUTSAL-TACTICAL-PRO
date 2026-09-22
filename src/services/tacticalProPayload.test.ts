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
import {
  TACTICAL_PRO_GLOSSARY,
  buildTacticalProPayload,
  projectGoalkeepersForAI,
  projectMatchDataForAI,
  projectReportForAI,
} from "./tacticalProPayload";

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
    // El payload solo PROYECTA: quita campos, nunca recompone un número. Por
    // eso se compara contra el helper pasado por la misma proyección, no
    // contra una copia escrita a mano de lo que debería salir.
    const md = partido();
    const payload = buildTacticalProPayload(md);
    const { generatedAt: _a, ...informe } = payload.deterministicReport as any;
    const { generatedAt: _b, ...esperado } = projectReportForAI(generateMatchReport(md)) as any;
    expect(informe).toEqual(esperado);
    expect(payload.tacticalContext.goalkeepers).toEqual(
      projectGoalkeepersForAI(buildGoalkeeperReports(md)),
    );
    expect(payload.tacticalContext.zones.team).toEqual(buildZoneDashboard(md, false));
    expect(payload.tacticalContext.zones.opponent).toEqual(buildZoneDashboard(md, true));
  });

  it("conserva matchData como contexto, sin lo que no es texto analizable", () => {
    const md = partido();
    const enviado = buildTacticalProPayload(md).matchData as any;
    // Ya no es el mismo objeto: es una copia podada. Todo lo demás se mantiene.
    expect(enviado).not.toBe(md);
    expect(enviado.events).toBe(md.events);
    expect(enviado.players).toBe(md.players);
    expect(enviado.teamName).toBe(md.teamName);
    expect(enviado.fouls).toEqual(md.fouls);
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
    // Faltas COMETIDAS por nuestro equipo en todo el partido, desde eventos.
    expect(payload.deterministicReport.teamTotals.fouls).toBe(
      partido().events.filter((e) => e.type === ActionType.FOUL && !e.metadata?.isOpponent).length,
    );
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

// ── SANEADO DEL PAYLOAD ────────────────────────────────────────────────
//
// Un partido como los que provocaron el timeout: con logos subidos desde el
// móvil, con el informe de IA de un intento anterior ya guardado dentro del
// propio partido, y con eventos suficientes para que los porteros arrastren
// su copia de GameEvent.

const LOGO = "data:image/png;base64," + "R0lGODlhAQAB".repeat(4000); // ~48 KB
const INFORME_PREVIO =
  "## 1. Lectura objetiva del partido\nRespuesta de la petición anterior. ".repeat(120);

function partidoGrande(): MatchData {
  const base = partido();
  const extra: GameEvent[] = [];
  for (let i = 0; i < 120; i++) {
    extra.push(
      ev({
        type: ActionType.SHOT,
        playerIds: ["r2", "tp1"],
        originGrid: "Z4C",
        destinationGrid: "G5",
        goalkeeperZone: (["GK1", "GK2", "GK3", "GK4", "GK5"] as const)[i % 5] as any,
        timestamp: i * 9000,
        metadata: {
          isOpponent: true,
          goalieResponse: i % 2 ? GoalieAction.SAVE_CATCH : GoalieAction.SAVE_DEFLECT,
          targetGoalkeeperId: "tp1",
        },
      }),
    );
  }
  return {
    ...base,
    teamLogo: LOGO,
    opponentLogo: LOGO,
    tacticalAnalysis: INFORME_PREVIO,
    events: [...base.events, ...extra],
  };
}

describe("objetivo 1 · los logos no viajan a la IA", () => {
  it("el MatchData original conserva sus logos intactos", () => {
    const md = partidoGrande();
    buildTacticalProPayload(md);
    expect(md.teamLogo).toBe(LOGO);
    expect(md.opponentLogo).toBe(LOGO);
  });

  it("el payload no lleva los campos de logo", () => {
    const enviado = buildTacticalProPayload(partidoGrande()).matchData as any;
    expect("teamLogo" in enviado).toBe(false);
    expect("opponentLogo" in enviado).toBe(false);
  });

  it("el payload serializado no contiene ninguna imagen en base64", () => {
    const json = JSON.stringify(buildTacticalProPayload(partidoGrande()));
    expect(json).not.toContain("data:image");
    expect(json).not.toContain("base64");
  });
});

describe("objetivo 2 · el análisis anterior no se realimenta", () => {
  it("REINTENTAR no reenvía la respuesta IA previa", () => {
    const md = partidoGrande();
    const json = JSON.stringify(buildTacticalProPayload(md));
    expect(json).not.toContain(INFORME_PREVIO);
    expect(json).not.toContain("Respuesta de la petición anterior");
    // Y el partido la sigue teniendo: se guarda y se muestra como siempre.
    expect(md.tacticalAnalysis).toBe(INFORME_PREVIO);
  });

  it("el campo ni siquiera está presente en el objeto enviado", () => {
    const enviado = buildTacticalProPayload(partidoGrande()).matchData as any;
    expect("tacticalAnalysis" in enviado).toBe(false);
  });
});

describe("objetivo 3 · porteros sin eventos duplicados", () => {
  const porteroIA = () =>
    buildTacticalProPayload(partidoGrande()).tacticalContext.goalkeepers.find(
      (g) => g.id === "tp1",
    )! as any;

  it("no lleva los GameEvent ni la timeline", () => {
    const g = porteroIA();
    expect("events" in g).toBe(false);
    expect("timeline" in g).toBe(false);
  });

  it("la proyección es el helper autoritativo menos esos dos campos, nada más", () => {
    const md = partidoGrande();
    const autoritativo = buildGoalkeeperReports(md);
    const proyectado = buildTacticalProPayload(md).tacticalContext.goalkeepers;
    expect(proyectado).toEqual(
      autoritativo.map(({ events, timeline, ...resto }) => resto),
    );
    // Y el helper sigue devolviéndolos: la pantalla los necesita para el mapa.
    expect(autoritativo[0].events).toBeDefined();
  });

  it("conserva todos los agregados de Fase 4", () => {
    const g = porteroIA();
    for (const campo of [
      "name", "number", "totalSaves", "saveCatch", "saveDeflect", "saveGeneric",
      "saveUnspecified", "conceded", "shotsFaced", "shotsAgainst", "shotsUndeclared",
      "exits", "exitsSuccess", "exitsFail", "exitsUnknown",
      "interventionZones", "interventionZonesByAction", "interventionsUnlocated",
      "exitZones", "effectivenessPct",
    ]) {
      expect(g[campo]).toBeDefined();
    }
    // Subtipos y ubicación siguen cuadrando con los eventos del fixture.
    expect(g.saveCatch + g.saveDeflect).toBeGreaterThan(0);
    expect(Object.values(g.interventionZones as Record<string, number>).reduce(
      (a, b) => a + b, 0,
    )).toBeGreaterThan(0);
    // La ausencia se declara, no se rellena.
    expect(g.interventionsUnlocated).toBe(0);
  });
});

describe("objetivo 4 · una sola verdad sobre el portero", () => {
  it("el resumen enviado no lleva el bloque de portería legacy", () => {
    const payload = buildTacticalProPayload(partidoGrande());
    expect("goalkeeper" in (payload.deterministicReport as any)).toBe(false);
    // El informe determinista original sigue teniéndolo: PDFs y UI intactos.
    expect(generateMatchReport(partidoGrande()).goalkeeper).not.toBeNull();
  });

  it("con player.stats.saves = 77 y Fase 4 real, gana Fase 4", () => {
    const md = partidoGrande();
    // El fixture pone 77 a propósito en todos los jugadores.
    expect(md.players.find((p) => p.id === "tp1")!.stats.saves).toBe(77);

    const payload = buildTacticalProPayload(md);
    const gk = payload.tacticalContext.goalkeepers.find((g) => g.id === "tp1")!;

    // El valor real de Fase 4, contado desde los eventos, sí está.
    expect(gk.totalSaves).toBe(121);
    expect(gk.totalSaves).not.toBe(77);
    expect(gk.conceded).toBe(0);

    // Y 77 ya no aparece en NINGÚN bloque factual: ni en el resumen
    // determinista ni en el contexto táctico.
    expect(JSON.stringify(payload.deterministicReport)).not.toContain("77");
    expect(JSON.stringify(payload.tacticalContext)).not.toContain(":77");
  });

  it("el glosario declara cuál es la única fuente de portería", () => {
    const texto = TACTICAL_PRO_GLOSSARY.join("\n");
    expect(texto).toContain("tacticalContext.goalkeepers");
    expect(texto).toMatch(/ÚNICA fuente de datos de portero/);
    expect(texto).toMatch(/resumen determinista no trae datos de portero/);
  });
});

// ── LAS CUATRO CIFRAS DE FALTAS ──────────────────────────────────
//
// Mientras el informe copiaba el contador en vivo, el total del partido y el
// contador reglamentario eran el mismo número y el glosario lo decía así.
// Ahora `fouls` es el TOTAL y `periodFoulCounter` es el contador que se
// reinicia. El glosario es lo ÚNICO que viaja al modelo explicando cuál es
// cuál: si vuelve a decir que son el mismo número, estos tests fallan.

/** El fixture validado: contador 2/6 y eventos 1P 5–3 · 2P 2–6 → total 7/9. */
function partidoFaltas5y2(): MatchData {
  const falta = (period: Period, isOpponent: boolean) =>
    ev({
      type: ActionType.FOUL,
      period,
      playerIds: isOpponent ? [] : ["p1"],
      metadata: { isOpponent },
    });
  const repetir = (n: number, period: Period, isOpponent: boolean) =>
    Array.from({ length: n }, () => falta(period, isOpponent));
  return {
    ...partido(),
    fouls: { team: 2, opponent: 6 },
    events: [
      ...repetir(5, Period.FIRST, false),
      ...repetir(3, Period.FIRST, true),
      ...repetir(2, Period.SECOND, false),
      ...repetir(6, Period.SECOND, true),
    ],
  };
}

describe("objetivo 6 · las cuatro cifras de faltas, declaradas", () => {
  const texto = () => TACTICAL_PRO_GLOSSARY.join("\n");
  /** La ÚNICA línea del glosario que nombra ese campo. */
  const linea = (campo: string) => {
    const encontradas = TACTICAL_PRO_GLOSSARY.filter((l) => l.includes(campo));
    expect(encontradas.length).toBe(1);
    return encontradas[0];
  };

  it("1 · identifica deterministicReport.fouls como TOTAL DEL PARTIDO", () => {
    const l = linea("'deterministicReport.fouls'");
    expect(l).toMatch(/total de TODO el partido/);
    expect(l).toMatch(/SÍ son el total del partido/);
    expect(l).toMatch(/\{team, opponent\}/);
    expect(l).toMatch(/eventos FOUL/);
    // La afirmación vieja, ya falsa, no puede volver a esta línea.
    expect(l).not.toMatch(/PERIODO ACTUAL/);
    expect(l).not.toMatch(/NO son el total del partido/);
  });

  it("2 · identifica teamTotals.fouls como el total PROPIO del partido", () => {
    const l = linea("'deterministicReport.teamTotals.fouls'");
    expect(l).toMatch(/total propio del partido/);
    expect(l).toContain("'deterministicReport.fouls.team'");
    expect(l).not.toMatch(/PERIODO ACTUAL/);
    expect(l).not.toMatch(/contador reglamentario/);
  });

  it("3 · identifica foulsByPeriod como el desglose por periodo de AMBOS equipos", () => {
    const l = linea("'deterministicReport.foulsByPeriod'");
    expect(l).toMatch(/AMBOS equipos/);
    expect(l).toMatch(/\{period, team, opponent\}/);
    // Sigue diciendo dónde están esas mismas cifras dentro de periodStats.
    expect(texto()).toContain("periodStats[].fouls");
    expect(texto()).toContain("periodStats[].opponentFouls");
  });

  it("4 · identifica periodFoulCounter como el contador reglamentario del periodo", () => {
    const l = linea("'deterministicReport.periodFoulCounter'");
    expect(l).toMatch(/contador acumulado del PERIODO/);
    expect(l).toMatch(/6ª falta/);
    expect(l).toContain("'matchData.fouls'");
  });

  it("5 · dice que periodFoulCounter NO es el total del partido", () => {
    const l = linea("'deterministicReport.periodFoulCounter'");
    expect(l).toMatch(/NO es el total del partido/);
    expect(l).toMatch(/no lo sumes al total/);
  });

  it("6 · explica que el contador puede reiniciarse entre periodos", () => {
    const l = linea("'deterministicReport.periodFoulCounter'");
    expect(l).toMatch(/REINICIARSE al cambiar de periodo/);
    // Y que quedar por debajo del total no es una contradicción.
    expect(l).toMatch(/valga 0 habiendo eventos FOUL/);
  });

  it("7 · explica qué significa hasFoulEvents === false", () => {
    const l = linea("'deterministicReport.hasFoulEvents'");
    expect(l).toMatch(/Si es false/);
    expect(l).toMatch(/NO están disponibles/);
    expect(l).toMatch(/sigue SIN ser el total del partido/);
  });

  it("8 · prohíbe inventar el histórico cuando no hay eventos suficientes", () => {
    const l = linea("'deterministicReport.hasFoulEvents'");
    expect(l).toMatch(/NO inventes total histórico/);
    expect(l).toMatch(/distribución[\s\S]*por periodos/);
    expect(l).toMatch(/acumulación previa/);
    // Las seis fuentes de las que NO se pueden deducir faltas.
    for (const prohibida of [
      "PlayerStats",
      "dobles penaltis",
      "goles",
      "tarjetas",
      "texto narrativo",
      "zonas",
    ]) {
      expect(l).toContain(prohibida);
    }
  });

  it("9 · mantiene FOUL separado de double_penalty", () => {
    const l = linea("'double_penalty'");
    expect(l).toMatch(/PROCEDENCIA/);
    expect(l).toMatch(/NO equivale a un nuevo evento FOUL/);
    expect(l).toMatch(/no reconstruyas el número de faltas a partir del número de dobles penaltis/i);
  });

  it("no introduce un cuarto cálculo de faltas", () => {
    // El glosario es texto. Ningún campo nuevo de faltas en el contexto.
    const payload = buildTacticalProPayload(partidoGrande()) as any;
    expect(payload.deterministicReport.foulsMatch).toBeUndefined();
    expect(payload.tacticalContext.fouls).toBeUndefined();
  });

  it("el informe envía el TOTAL del partido, no el contador del periodo", () => {
    // La contradicción que veía el modelo: el resumen decía 2 propias
    // mientras el desglose por jugador sumaba 7.
    const md = partidoGrande();
    const payload = buildTacticalProPayload(md);
    const propias = md.events.filter(
      (e) => e.type === ActionType.FOUL && !e.metadata?.isOpponent,
    ).length;
    expect(payload.deterministicReport.fouls.team).toBe(propias);
    expect(payload.deterministicReport.periodFoulCounter).toEqual(md.fouls);
  });

  it("fixture 5+2 · el payload lleva las cuatro cifras y el glosario las distingue", () => {
    const dr = buildTacticalProPayload(partidoFaltas5y2()).deterministicReport;

    expect(dr.fouls).toEqual({ team: 7, opponent: 9 });
    expect(dr.teamTotals.fouls).toBe(7);
    expect(dr.foulsByPeriod).toEqual([
      { period: Period.FIRST, team: 5, opponent: 3 },
      { period: Period.SECOND, team: 2, opponent: 6 },
    ]);
    expect(dr.periodFoulCounter).toEqual({ team: 2, opponent: 6 });
    expect(dr.hasFoulEvents).toBe(true);

    // El 2/6 del contador NO puede confundirse con el 7/9 del total.
    expect(dr.periodFoulCounter).not.toEqual(dr.fouls);
    expect(linea("'deterministicReport.fouls'")).toMatch(/SÍ son el total del partido/);
    expect(linea("'deterministicReport.periodFoulCounter'")).toMatch(
      /NO es el total del partido/,
    );
  });
});

describe("objetivo 7 · el payload adelgaza sin perder hechos", () => {
  /** El payload tal y como era antes de podar, con los mismos helpers. */
  function payloadSinPodar(md: MatchData) {
    return {
      matchData: md,
      deterministicReport: generateMatchReport(md),
      tacticalContext: {
        goalkeepers: buildGoalkeeperReports(md),
        zones: { team: buildZoneDashboard(md, false), opponent: buildZoneDashboard(md, true) },
        glossary: TACTICAL_PRO_GLOSSARY,
      },
    };
  }

  it("se reduce de forma sustancial en un partido realista", () => {
    const md = partidoGrande();
    const antes = JSON.stringify(payloadSinPodar(md)).length;
    const despues = JSON.stringify(buildTacticalProPayload(md)).length;
    // Umbral deliberadamente holgado: lo que se fija es el orden de magnitud,
    // no un recuento de bytes que se rompa al tocar una etiqueta.
    expect(despues).toBeLessThan(antes * 0.4);
    expect(antes).toBeGreaterThan(100_000);
  });

  it("lo que se va es ruido y duplicado, no hechos", () => {
    const md = partidoGrande();
    const antes: any = payloadSinPodar(md);
    const despues: any = buildTacticalProPayload(md);

    const claves = (o: any) => Object.keys(o).sort();
    // Del partido solo desaparecen los tres campos declarados.
    expect(claves(antes.matchData).filter((k) => !claves(despues.matchData).includes(k)))
      .toEqual(["opponentLogo", "tacticalAnalysis", "teamLogo"]);
    // Del resumen, solo la portería legacy.
    expect(claves(antes.deterministicReport).filter(
      (k) => !claves(despues.deterministicReport).includes(k),
    )).toEqual(["goalkeeper"]);
    // De cada portero, solo los dos campos pesados.
    expect(claves(antes.tacticalContext.goalkeepers[0]).filter(
      (k) => !claves(despues.tacticalContext.goalkeepers[0]).includes(k),
    )).toEqual(["events", "timeline"]);
    // Las zonas no se tocan en absoluto.
    expect(despues.tacticalContext.zones).toEqual(antes.tacticalContext.zones);
  });

  it("los agregados sobreviven idénticos a la poda", () => {
    const md = partidoGrande();
    const antes: any = payloadSinPodar(md);
    const despues: any = buildTacticalProPayload(md);
    expect(despues.deterministicReport.teamTotals).toEqual(antes.deterministicReport.teamTotals);
    expect(despues.deterministicReport.setPieces).toEqual(antes.deterministicReport.setPieces);
    expect(despues.deterministicReport.periodStats).toEqual(antes.deterministicReport.periodStats);
    expect(despues.deterministicReport.playersUsed).toEqual(antes.deterministicReport.playersUsed);
    const gkAntes = antes.tacticalContext.goalkeepers.find((g: any) => g.id === "tp1");
    const gkDespues = despues.tacticalContext.goalkeepers.find((g: any) => g.id === "tp1");
    expect(gkDespues.totalSaves).toBe(gkAntes.totalSaves);
    expect(gkDespues.interventionZones).toEqual(gkAntes.interventionZones);
    expect(gkDespues.interventionZonesByAction).toEqual(gkAntes.interventionZonesByAction);
  });

  it("las proyecciones no mutan lo que reciben", () => {
    const md = partidoGrande();
    const informe = generateMatchReport(md);
    const porteros = buildGoalkeeperReports(md);
    projectMatchDataForAI(md);
    projectReportForAI(informe);
    projectGoalkeepersForAI(porteros);
    expect(md.teamLogo).toBe(LOGO);
    expect(md.tacticalAnalysis).toBe(INFORME_PREVIO);
    expect(informe.goalkeeper).not.toBeNull();
    expect(porteros[0].events).toBeDefined();
    expect(porteros[0].timeline).toBeDefined();
  });
});

// ── PROPAGACIÓN DE LA CAPTURA CORREGIDA ────────────────────────────────
//
// El 80 % de conversión que TACTICAL PRO escribió sobre CD MURCIA salía de
// `zones.opponent.totals` —4 goles entre 5 intentos— porque los otros ocho
// remates del rival nunca se habían registrado como tiros. Con la captura
// corregida, el mismo helper determinista produce la cifra correcta y el
// modelo la recibe sin que haya que tocar el prompt ni la función.

describe("un partido bien registrado llega corregido al contexto táctico", () => {
  const tiroParado = (i: number) =>
    ev({
      id: `s${i}`,
      type: ActionType.SHOT,
      originGrid: "Z3C",
      destinationGrid: "G5",
      playerIds: ["riv", "tp1"],
      metadata: {
        isOpponent: true,
        goalieResponse: GoalieAction.SAVE,
        targetGoalkeeperId: "tp1",
      },
    });

  const partidoRival = (): MatchData => ({
    ...partido(),
    events: [
      ...Array.from({ length: 8 }, (_, i) => tiroParado(i)),
      ...Array.from({ length: 4 }, (_, i) =>
        ev({ id: `g${i}`, type: ActionType.GOAL, originGrid: "Z4C", destinationGrid: "G1",
             metadata: { isOpponent: true } }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        ev({ id: `o${i}`, type: ActionType.SHOT, originGrid: "Z3L", destinationGrid: "OUT",
             metadata: { isOpponent: true } }),
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        ev({ id: `b${i}`, type: ActionType.SHOT, originGrid: "Z3R",
             metadata: { isOpponent: true, shotOutcome: "blocked", goalieResponse: "UNSPECIFIED" } }),
      ),
    ],
  });

  const totals = () =>
    buildTacticalProPayload(partidoRival()).tacticalContext.zones.opponent.totals;

  it("el rival aparece con sus 17 intentos, no con 5", () => {
    expect(totals().attempts).toBe(17);
    expect(totals().attempts).not.toBe(5);
  });

  it("la conversión deja de estar inflada", () => {
    // 4 goles entre 17 intentos, no entre 5.
    expect(totals().goals).toBe(4);
    expect(totals().conversionPct).toBe(24);
    expect(totals().conversionPct).not.toBe(80);
  });

  it("los bloqueados viajan como categoría propia, no como desconocidos", () => {
    expect(totals().blocked).toBe(2);
    expect(totals().onTarget).toBe(12);
    expect(totals().unknownTarget).toBe(0);
  });

  it("y sale del helper determinista, no de un cálculo propio del payload", () => {
    expect(totals()).toEqual(buildZoneDashboard(partidoRival(), true).totals);
  });
});

// ── CONTEXTO TEMPORAL Y SITUACIONES ESPECIALES ─────────────────────────
//
// TACTICAL PRO no debe deducir ventanas de superioridad ni tiempos entre
// goles a partir de los eventos: el prompt se lo prohíbe expresamente, y con
// razón. Tiene que recibirlos ya calculados, como hechos.

describe("las situaciones especiales y la secuencia de goles llegan al payload", () => {
  const formacion = (timestamp: number, gameState: any, isOpponent = false) =>
    ev({
      id: `f-${timestamp}-${isOpponent}`,
      timestamp,
      type: ActionType.FORMATION_CHANGE,
      gameState,
      metadata: { isOpponent },
      scoreAtEvent: { team: 0, opponent: 0 },
    });

  const partidoConSuperioridad = (): MatchData => ({
    ...partido(),
    events: [
      formacion(60_000, "Superioridad"),
      ev({ id: "s1", timestamp: 70_000, type: ActionType.SHOT, originGrid: "Z4C",
           destinationGrid: "G5", metadata: { isOpponent: false } }),
      ev({ id: "s2", timestamp: 80_000, type: ActionType.SHOT, originGrid: "Z4C",
           destinationGrid: "G2", metadata: { isOpponent: false } }),
      ev({ id: "g1", timestamp: 90_000, type: ActionType.GOAL, originGrid: "Z4C",
           destinationGrid: "G1", metadata: { isOpponent: false, setPiece: "penalty" } }),
      ev({ id: "s3", timestamp: 100_000, type: ActionType.SHOT, originGrid: "Z3C",
           destinationGrid: "OUT", metadata: { isOpponent: false } }),
      ev({ id: "s4", timestamp: 110_000, type: ActionType.SHOT, originGrid: "Z3L",
           metadata: { isOpponent: false, shotOutcome: "blocked", goalieResponse: "UNSPECIFIED" } }),
      formacion(162_000, "4vs4"),
      ev({ id: "g2", timestamp: 209_000, type: ActionType.GOAL, originGrid: "Z4C",
           destinationGrid: "G3", metadata: { isOpponent: true } }),
    ],
  });

  const informe = () =>
    buildTacticalProPayload(partidoConSuperioridad()).deterministicReport;

  it("el payload lleva las ventanas de contexto", () => {
    const grupos = informe().matchContextGroups;
    expect(grupos).toHaveLength(1);
    expect(grupos[0].label).toBe("Superioridad por expulsión rival");
  });

  it("y lleva los cinco tiros de esa superioridad ya desglosados", () => {
    // El hecho que la IA debe recibir hecho: "durante la superioridad, 5
    // tiros, 3 a portería, 1 fuera, 1 bloqueado, 1 gol".
    const t = informe().matchContextGroups[0].tally;
    expect(t.shots).toBe(5);
    expect(t.onTarget).toBe(3);
    expect(t.offTarget).toBe(1);
    expect(t.blocked).toBe(1);
    expect(t.goals).toBe(1);
  });

  it("con su duración calculada, no estimada", () => {
    expect(informe().matchContextGroups[0].totalDuration).toBe(102_000);
  });

  it("la secuencia de goles llega con procedencia y tiempo de respuesta", () => {
    const s = informe().goalSequence;
    expect(s).toHaveLength(2);
    expect(s[0].sourceLabel).toBe("Penalti");
    expect(s[1].scoringTeam).toBe("opponent");
    expect(s[1].secondsSinceOpponentPreviousGoal).toBe(119);
  });

  it("el texto que viaja no contiene ningún código interno de contexto", () => {
    const json = JSON.stringify(informe().matchContextGroups);
    expect(json).toContain("Superioridad por expulsión rival");
    expect(json).not.toContain("PJ_ATTACK");
  });

  it("un partido sin declaraciones viaja con los bloques vacíos, no ausentes", () => {
    const informeSimple = buildTacticalProPayload(partido()).deterministicReport;
    expect(Array.isArray(informeSimple.matchContexts)).toBe(true);
    expect(Array.isArray(informeSimple.goalSequence)).toBe(true);
  });

  it("no hace falta tocar el prompt: viajan dentro del resumen determinista", () => {
    const payload = buildTacticalProPayload(partidoConSuperioridad());
    expect(Object.keys(payload).sort()).toEqual([
      "deterministicReport",
      "matchData",
      "tacticalContext",
    ]);
  });
});
