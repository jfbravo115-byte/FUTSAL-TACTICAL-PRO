import { describe, it, expect } from "vitest";
import { buildGoalkeeperReports } from "./goalkeeperReportService";
import { ActionType, GoalieAction, MatchData, Period, Player, Role, GameEvent } from "../types/futsal";

function player(overrides: Partial<Player> = {}): Player {
  return {
    id: "gk1",
    number: 1,
    name: "Portero",
    role: Role.GOALKEEPER,
    isOnPitch: true,
    plusMinus: 0,
    individualTimeSeconds: 0,
    isOpponent: false,
    stats: {
      goals: 0, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0,
      fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0, saves: 0, conceded: 0,
    },
    ...overrides,
  };
}

function event(overrides: Partial<GameEvent> = {}): GameEvent {
  return {
    id: `e-${Math.random()}`,
    timestamp: 0,
    wallClock: 0,
    period: Period.FIRST,
    playerIds: [],
    type: GoalieAction.SAVE_PARRY,
    gameState: "4vs4" as any,
    ...overrides,
  };
}

function matchData(overrides: Partial<MatchData> = {}): MatchData {
  return {
    teamName: "Mi Equipo",
    opponentName: "Rival",
    period: Period.SECOND,
    matchClock: 1000,
    isClockRunning: false,
    fouls: { team: 0, opponent: 0 },
    timeoutsUsed: { team: { period1: false, period2: false }, opponent: { period1: false, period2: false } },
    players: [],
    events: [],
    ...overrides,
  };
}

describe("buildGoalkeeperReports", () => {
  // 12. portero sin eventos
  it("portero con minutos pero sin eventos: 0 paradas/encajados, efectividad null, mapas sin datos", () => {
    const md = matchData({ players: [player({ individualTimeSeconds: 1200 })] });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.totalSaves).toBe(0);
    expect(gk.conceded).toBe(0);
    expect(gk.effectivenessPct).toBeNull();
    expect(gk.events).toEqual([]);
    expect(gk.timeline).toEqual([]);
  });

  // 13. un portero
  it("un portero con paradas y goles encajados calcula efectividad correctamente", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 1200 })],
      events: [
        event({ type: GoalieAction.SAVE_PARRY, playerIds: ["gk1"], timestamp: 1000 }),
        event({ type: GoalieAction.SAVE_CATCH, playerIds: ["gk1"], timestamp: 2000 }),
        event({ type: GoalieAction.GOAL_CONCEDED, playerIds: ["gk1"], timestamp: 3000 }),
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    // FASE 4: SAVE_PARRY queda congelado. Su evento sigue contando como
    // parada, pero con subtipo desconocido — nunca como despeje.
    expect(gk.saveParry).toBe(0);
    expect(gk.saveUnspecified).toBe(1);
    expect(gk.saveCatch).toBe(1);
    expect(gk.conceded).toBe(1);
    expect(gk.totalSaves).toBe(2);
    expect(gk.shotsFaced).toBe(3);
    expect(gk.effectivenessPct).toBe(67); // 2/3 redondeado
    expect(gk.timeline.length).toBe(3);
  });

  // 14. dos porteros
  it("dos porteros (local y rival, o dos titulares distintos) se devuelven ambos, ordenados por dorsal", () => {
    const md = matchData({
      players: [
        player({ id: "gk2", number: 12, individualTimeSeconds: 300 }),
        player({ id: "gk1", number: 1, individualTimeSeconds: 900 }),
      ],
    });
    const result = buildGoalkeeperReports(md);
    expect(result.length).toBe(2);
    expect(result.map((r) => r.number)).toEqual([1, 12]);
  });

  // 15. portero sustituido
  it("un portero sustituido (ya no isOnPitch, pero jugó minutos) sigue apareciendo en el informe", () => {
    const md = matchData({
      players: [player({ isOnPitch: false, individualTimeSeconds: 600 })],
    });
    const result = buildGoalkeeperReports(md);
    expect(result.length).toBe(1);
    expect(result[0].isOnPitch).toBe(false);
    expect(result[0].totSeconds).toBe(600);
  });

  it("un portero que nunca jugó (0 minutos, sin eventos) NO aparece en el informe", () => {
    const md = matchData({ players: [player({ individualTimeSeconds: 0, isOnPitch: false })] });
    expect(buildGoalkeeperReports(md)).toEqual([]);
  });

  it("un jugador de campo (no GOALKEEPER) nunca aparece en el informe de porteros", () => {
    const md = matchData({ players: [player({ role: Role.PLAYER, individualTimeSeconds: 1000 })] });
    expect(buildGoalkeeperReports(md)).toEqual([]);
  });

  // 10 / 11. partido legacy, arrays vacíos
  it("partido legacy/vacío (sin jugadores ni eventos) no lanza y devuelve array vacío", () => {
    expect(() => buildGoalkeeperReports(matchData())).not.toThrow();
    expect(buildGoalkeeperReports(matchData())).toEqual([]);
  });

  it("solo cuenta eventos propios del portero (playerIds.includes), no inventa criterios nuevos", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 500 })],
      events: [
        event({ type: GoalieAction.SAVE_PARRY, playerIds: ["otro-jugador"] }), // no es del portero
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.saveParry).toBe(0);
  });

  // A. SAVE_CATCH se reporta como Blocaje.
  it("A: un evento SAVE_CATCH incrementa gk.saveCatch y aparece en la cronología como 'Blocaje'", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 500 })],
      events: [event({ type: GoalieAction.SAVE_CATCH, playerIds: ["gk1"], timestamp: 1000 })],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.saveCatch).toBe(1);
    expect(gk.saveParry).toBe(0);
    expect(gk.timeline[0].type).toBe("Blocaje");
  });

  // B. FASE 4: SAVE_PARRY es histórico y su subtipo es DESCONOCIDO.
  //
  // Hasta Fase 4 lo emitía un botón rotulado "PARADA", así que presentarlo
  // como despeje sería atribuirle una información que nadie registró.
  it("B: un SAVE_PARRY histórico cuenta como parada de subtipo no registrado, nunca como despeje", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 500 })],
      events: [event({ type: GoalieAction.SAVE_PARRY, playerIds: ["gk1"], timestamp: 1000 })],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.saveUnspecified).toBe(1);
    expect(gk.totalSaves).toBe(1);
    expect(gk.saveParry).toBe(0);
    expect(gk.saveDeflect).toBe(0);
    expect(gk.saveCatch).toBe(0);
    expect(gk.timeline[0].type).toBe("Parada (subtipo no registrado)");
    expect(gk.timeline[0].type).not.toContain("Despeje");
  });
});

// ── FASE 3: COHERENCIA ENTRE CABECERA Y MAPA ──────────────────────────
describe("Paradas sin subtipo registrado", () => {
  it("un SHOT rival detenido cuenta como parada, no desaparece de las estadísticas", () => {
    // Este es el caso que producía "Blocajes 0 · Despejes 0" bajo un mapa
    // lleno de círculos verdes: el evento existe y el mapa lo pintaba, pero
    // la cabecera solo miraba los tipos GoalieAction.SAVE*.
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [
        event({
          type: ActionType.SHOT,
          playerIds: ["rival-1", "gk1"],
          destinationGrid: "G5",
          metadata: { isOpponent: true },
        }),
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.saveUnspecified).toBe(1);
    expect(gk.totalSaves).toBe(1);
    expect(gk.shotsFaced).toBe(1);
    expect(gk.effectivenessPct).toBe(100);
  });

  it("NO se inventa el subtipo de una parada genérica", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [
        event({ type: ActionType.SHOT, playerIds: ["gk1"], destinationGrid: "G2", metadata: { isOpponent: true } }),
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.saveCatch).toBe(0);
    expect(gk.saveParry).toBe(0);
    expect(gk.saveUnspecified).toBe(1);
  });

  it("un tiro fuera NO cuenta como parada", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [
        event({ type: ActionType.SHOT, playerIds: ["gk1"], destinationGrid: "OUT", metadata: { isOpponent: true } }),
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.totalSaves).toBe(0);
    expect(gk.shotsFaced).toBe(0);
  });

  it("un ActionType.GOAL del rival cuenta como gol encajado", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [
        event({ type: ActionType.GOAL, playerIds: ["rival-1", "gk1"], metadata: { isOpponent: true } }),
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.conceded).toBe(1);
    expect(gk.totalSaves).toBe(0);
  });

  it("el desglose de paradas suma siempre el total", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [
        event({ type: GoalieAction.SAVE_CATCH, playerIds: ["gk1"] }),
        event({ type: GoalieAction.SAVE_PARRY, playerIds: ["gk1"] }),
        event({ type: GoalieAction.SAVE, playerIds: ["gk1"] }),
        event({ type: ActionType.SHOT, playerIds: ["gk1"], destinationGrid: "G1", metadata: { isOpponent: true } }),
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.saveCatch + gk.saveParry + gk.saveGeneric + gk.saveUnspecified).toBe(gk.totalSaves);
    expect(gk.totalSaves).toBe(4);
  });

  it("declara cuántas intervenciones puede dibujar el mapa de portería", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [
        // Con zona: el mapa puede pintarla.
        event({ type: GoalieAction.SAVE_CATCH, playerIds: ["gk1"], destinationGrid: "G4" }),
        // Sin zona: cuenta en la cabecera pero el mapa no puede dibujarla,
        // y por eso la diferencia se explica en vez de esconderse.
        event({ type: GoalieAction.SAVE_PARRY, playerIds: ["gk1"] }),
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.totalSaves).toBe(2);
    expect(gk.mappedInterventions).toBe(1);
  });

  it("la cronología incluye las paradas sin subtipo, nombradas por lo que se sabe", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [
        event({ type: ActionType.SHOT, playerIds: ["gk1"], destinationGrid: "G5", timestamp: 1000, metadata: { isOpponent: true } }),
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.timeline).toHaveLength(1);
    expect(gk.timeline[0].type).toBe("Parada (sin subtipo registrado)");
  });
});

// ── FASE 4: SALIDAS / INTERVENCIONES ──────────────────────────────────
describe("Salidas del portero", () => {
  it("cuenta las salidas y separa éxito, fallo y sin resultado", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [
        event({ type: GoalieAction.EXIT, playerIds: ["gk1"], metadata: { isOpponent: false, exitOutcome: "success" } }),
        event({ type: GoalieAction.EXIT, playerIds: ["gk1"], metadata: { isOpponent: false, exitOutcome: "success" } }),
        event({ type: GoalieAction.EXIT, playerIds: ["gk1"], metadata: { isOpponent: false, exitOutcome: "fail" } }),
        event({ type: GoalieAction.EXIT, playerIds: ["gk1"], metadata: { isOpponent: false } }),
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.exits).toBe(4);
    expect(gk.exitsSuccess).toBe(2);
    expect(gk.exitsFail).toBe(1);
    // Sin resultado registrado: se declara, no se infiere.
    expect(gk.exitsUnknown).toBe(1);
  });

  it("una salida NO cuenta como parada ni altera la efectividad", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [
        event({ type: GoalieAction.SAVE, playerIds: ["gk1"] }),
        event({ type: GoalieAction.EXIT, playerIds: ["gk1"], metadata: { isOpponent: false, exitOutcome: "success" } }),
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.totalSaves).toBe(1);
    expect(gk.shotsFaced).toBe(1);
    expect(gk.exits).toBe(1);
  });

  it("la salida aparece en la cronología con su resultado y sin códigos", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [
        event({ type: GoalieAction.EXIT, playerIds: ["gk1"], timestamp: 1000, metadata: { isOpponent: false, exitOutcome: "fail" } }),
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.timeline[0].type).toBe("Salida · Fallo");
    expect(gk.timeline[0].type).not.toContain("EXIT");
  });
});

describe("Nueva taxonomía en el informe", () => {
  it("PARADA, BLOCAJE y DESPEJE se desglosan por separado", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [
        event({ type: GoalieAction.SAVE, playerIds: ["gk1"] }),
        event({ type: GoalieAction.SAVE_CATCH, playerIds: ["gk1"] }),
        event({ type: GoalieAction.SAVE_DEFLECT, playerIds: ["gk1"] }),
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.saveGeneric).toBe(1);
    expect(gk.saveCatch).toBe(1);
    expect(gk.saveDeflect).toBe(1);
    expect(gk.totalSaves).toBe(3);
    expect(gk.saveParry).toBe(0);
  });

  it("ninguna etiqueta de la cronología contiene un código técnico", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [
        event({ type: GoalieAction.SAVE, playerIds: ["gk1"], timestamp: 1 }),
        event({ type: GoalieAction.SAVE_CATCH, playerIds: ["gk1"], timestamp: 2 }),
        event({ type: GoalieAction.SAVE_DEFLECT, playerIds: ["gk1"], timestamp: 3 }),
        event({ type: GoalieAction.SAVE_PARRY, playerIds: ["gk1"], timestamp: 4 }),
        event({ type: GoalieAction.EXIT, playerIds: ["gk1"], timestamp: 5, metadata: { isOpponent: false, exitOutcome: "success" } }),
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.timeline).toHaveLength(5);
    for (const entry of gk.timeline) {
      expect(entry.type).not.toMatch(/SAVE|EXIT|GOAL_CONCEDED|_/);
    }
  });
});

// ── FASE 4: PARTIDO HISTÓRICO CON DOBLE CONTEO PERSISTIDO ─────────────
describe("Histórico con el doble conteo de paradas", () => {
  /**
   * Partido anterior a Fase 4. El portero LOCAL hizo una parada real, pero la
   * captura de entonces metía TAMBIÉN al portero rival en `playerIds` y le
   * acreditaba la parada: `stats.saves` quedó a 1 en los dos.
   *
   * El evento se deja EXACTAMENTE como se guardó.
   */
  function historico(): MatchData {
    const gkLocal = player({ id: "gkA", number: 1, isOpponent: false });
    const gkRival = player({ id: "gkB", number: 12, isOpponent: true });
    gkLocal.individualTimeSeconds = 600;
    gkRival.individualTimeSeconds = 600;
    gkLocal.stats.saves = 1;
    gkRival.stats.saves = 1; // <- el error antiguo, persistido
    return matchData({
      players: [gkLocal, gkRival],
      events: [
        event({
          type: GoalieAction.SAVE_PARRY,
          playerIds: ["gkA", "gkB"],
          metadata: { isOpponent: false },
        }),
      ],
    });
  }

  it("solo el portero que realmente paró recibe la parada reconstruida", () => {
    const reports = buildGoalkeeperReports(historico());
    const a = reports.find((g) => g.id === "gkA")!;
    const b = reports.find((g) => g.id === "gkB")!;

    expect(a.totalSaves).toBe(1);
    expect(b.totalSaves).toBe(0);
  });

  it("la parada histórica sigue sin subtipo: no se convierte en despeje", () => {
    const a = buildGoalkeeperReports(historico()).find((g) => g.id === "gkA")!;
    expect(a.saveUnspecified).toBe(1);
    expect(a.saveDeflect).toBe(0);
    expect(a.saveParry).toBe(0);
    expect(a.timeline[0].type).toBe("Parada (subtipo no registrado)");
  });

  it("el JSON original NO se modifica: ni eventos ni stats persistidos", () => {
    const md = historico();
    const antes = JSON.stringify(md);
    buildGoalkeeperReports(md);
    expect(JSON.stringify(md)).toBe(antes);

    // El stats persistido conserva el valor antiguo: la corrección es de
    // lectura, no una migración.
    expect(md.players[1].stats.saves).toBe(1);
    expect(md.events[0].playerIds).toEqual(["gkA", "gkB"]);
    expect(md.events[0].type).toBe(GoalieAction.SAVE_PARRY);
  });
});

// ── FASE 4: REGRESIÓN EXTREMO A EXTREMO DEL DEFECTO 1 ─────────────────
describe("SAVE_DEFLECT recorre todo el camino", () => {
  it("registrar un despeje llega a estadísticas y a informe", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [
        event({ type: GoalieAction.SAVE_DEFLECT, playerIds: ["gk1"], timestamp: 1000 }),
      ],
    });
    const [gk] = buildGoalkeeperReports(md);

    // Estadística: cuenta como parada y como despeje explícito.
    expect(gk.saveDeflect).toBe(1);
    expect(gk.totalSaves).toBe(1);
    expect(gk.shotsFaced).toBe(1);
    expect(gk.effectivenessPct).toBe(100);

    // Informe: aparece con su etiqueta, sin código técnico.
    expect(gk.timeline).toHaveLength(1);
    expect(gk.timeline[0].type).toBe("Despeje");
    expect(gk.timeline[0].type).not.toContain("SAVE");
  });
});

// ── FASE 4: ZONA DE INTERVENCIÓN DEL PORTERO (GK1-GK5) ────────────────
describe("Distribución por zona de intervención", () => {
  it("agrega las intervenciones por GK1-GK5", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [
        event({ type: GoalieAction.SAVE, playerIds: ["gk1"], goalkeeperZone: "GK1" }),
        event({ type: GoalieAction.SAVE_CATCH, playerIds: ["gk1"], goalkeeperZone: "GK1" }),
        event({ type: GoalieAction.SAVE_DEFLECT, playerIds: ["gk1"], goalkeeperZone: "GK3" }),
        event({
          type: GoalieAction.EXIT, playerIds: ["gk1"], goalkeeperZone: "GK5",
          metadata: { isOpponent: false, exitOutcome: "success" },
        }),
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.interventionZones).toEqual({ GK1: 2, GK2: 0, GK3: 1, GK4: 0, GK5: 1 });
    expect(gk.interventionsUnlocated).toBe(0);
  });

  it("declara las intervenciones sin zona en vez de repartirlas", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [
        event({ type: GoalieAction.SAVE, playerIds: ["gk1"], goalkeeperZone: "GK2" }),
        event({ type: GoalieAction.SAVE, playerIds: ["gk1"] }), // sin zona
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.interventionZones.GK2).toBe(1);
    expect(gk.interventionsUnlocated).toBe(1);
    // La parada sin zona sigue contando como parada.
    expect(gk.totalSaves).toBe(2);
  });

  it("desglosa las salidas por zona y por resultado", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [
        event({ type: GoalieAction.EXIT, playerIds: ["gk1"], goalkeeperZone: "GK4", metadata: { isOpponent: false, exitOutcome: "success" } }),
        event({ type: GoalieAction.EXIT, playerIds: ["gk1"], goalkeeperZone: "GK4", metadata: { isOpponent: false, exitOutcome: "fail" } }),
        event({ type: GoalieAction.EXIT, playerIds: ["gk1"], goalkeeperZone: "GK5", metadata: { isOpponent: false, exitOutcome: "success" } }),
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.exitZones).toMatchObject({ GK4: 2, GK5: 1 });
    expect(gk.exitZonesSuccess).toMatchObject({ GK4: 1, GK5: 1 });
    expect(gk.exitZonesFail).toMatchObject({ GK4: 1, GK5: 0 });
  });

  it("NO mezcla zona de intervención con origen ni con destino", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [
        event({
          type: GoalieAction.SAVE, playerIds: ["gk1"],
          originGrid: "Z4C", destinationGrid: "G5", goalkeeperZone: "GK2",
        }),
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.interventionZones.GK2).toBe(1);
    // Cada campo conserva lo suyo en el evento original.
    expect(md.events[0].originGrid).toBe("Z4C");
    expect(md.events[0].destinationGrid).toBe("G5");
  });

  it("un partido histórico SIN goalkeeperZone sigue siendo válido", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [event({ type: GoalieAction.SAVE_PARRY, playerIds: ["gk1"] })],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.totalSaves).toBe(1);
    // No se inventa zona para datos que nunca la registraron.
    expect(gk.interventionZones).toEqual({ GK1: 0, GK2: 0, GK3: 0, GK4: 0, GK5: 0 });
    // SAVE_PARRY está congelado: no admite zona y no cuenta como no-ubicada.
    expect(gk.interventionsUnlocated).toBe(0);
  });
});

// ── MODELO C EN EL INFORME: UNA OCASIÓN, NUNCA DOS ────────────────────
describe("Tiro rival con respuesta del portero", () => {
  const tiro = (response: string, extra: Record<string, any> = {}) =>
    event({
      type: ActionType.SHOT,
      playerIds: ["rival-10", "gk1"],
      originGrid: "Z4C",
      destinationGrid: response === "EXIT" ? undefined : "G5",
      goalkeeperZone: "GK3",
      metadata: { isOpponent: true, goalieResponse: response, targetGoalkeeperId: "gk1", ...extra },
    });

  it("REGRESIÓN: una jugada con parada da 1 parada y 1 ocasión, no 2", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [tiro("SAVE")],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.totalSaves).toBe(1);
    expect(gk.shotsFaced).toBe(1);
    expect(gk.timeline).toHaveLength(1);
    // Y una sola intervención ubicada.
    expect(gk.interventionZones.GK3).toBe(1);
  });

  it("el subtipo del tiro enriquecido se desglosa correctamente", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [tiro("SAVE_CATCH"), tiro("SAVE_DEFLECT")],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.saveCatch).toBe(1);
    expect(gk.saveDeflect).toBe(1);
    expect(gk.saveUnspecified).toBe(0);
    expect(gk.totalSaves).toBe(2);
  });

  it("una SALIDA dentro del tiro cuenta como salida, no como parada", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [tiro("EXIT", { exitOutcome: "success" })],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.exits).toBe(1);
    expect(gk.exitsSuccess).toBe(1);
    expect(gk.totalSaves).toBe(0);
    expect(gk.exitZones.GK3).toBe(1);
  });

  it("la cronología nombra la respuesta, sin códigos técnicos", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [tiro("SAVE_DEFLECT")],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.timeline[0].type).toBe("Despeje");
    expect(gk.timeline[0].type).not.toMatch(/SAVE|SHOT|EXIT|GK[1-5]/);
  });

  it("un tiro SIN respuesta sigue contando como parada sin subtipo", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [
        event({
          type: ActionType.SHOT,
          playerIds: ["rival-10", "gk1"],
          destinationGrid: "G5",
          metadata: { isOpponent: true },
        }),
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.saveUnspecified).toBe(1);
    expect(gk.totalSaves).toBe(1);
  });

  it("conviven el tiro enriquecido y la acción suelta sin mezclarse", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [
        tiro("SAVE"),                                                   // Camino A
        event({ type: GoalieAction.SAVE_CATCH, playerIds: ["gk1"] }),   // Camino B
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    // Dos ocasiones REALES distintas: 2 paradas. No hay duplicación.
    expect(gk.totalSaves).toBe(2);
    expect(gk.saveGeneric).toBe(1);
    expect(gk.saveCatch).toBe(1);
  });
});

// ── UNSPECIFIED EN EL INFORME: TIRO RECIBIDO, CERO PARADAS ────────────
describe("Tiros cuya respuesta no se registró", () => {
  const tiro = (declarado: string | undefined, destino = "G5") =>
    event({
      type: ActionType.SHOT,
      playerIds: ["rival-10", "gk1"],
      destinationGrid: destino,
      metadata: {
        isOpponent: true,
        targetGoalkeeperId: "gk1",
        ...(declarado ? { goalieResponse: declarado } : {}),
      },
    });

  it("UNSPECIFIED cuenta como tiro recibido pero NO como parada", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [tiro("UNSPECIFIED"), tiro("UNSPECIFIED", "OUT")],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.totalSaves).toBe(0);
    expect(gk.saveUnspecified).toBe(0);
    expect(gk.shotsUndeclared).toBe(2);
    expect(gk.shotsAgainst).toBe(2);
    // El denominador de efectividad NO se infla con lo que no sabemos.
    expect(gk.shotsFaced).toBe(0);
    expect(gk.effectivenessPct).toBeNull();
  });

  it("el histórico sin declarar conserva su parada de subtipo no registrado", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [tiro(undefined)],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.saveUnspecified).toBe(1);
    expect(gk.totalSaves).toBe(1);
    expect(gk.shotsUndeclared).toBe(0);
    expect(gk.timeline[0].type).toBe("Parada (sin subtipo registrado)");
  });

  it("el informe NO muestra 'Parada' para un UNSPECIFIED", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [tiro("UNSPECIFIED")],
    });
    const [gk] = buildGoalkeeperReports(md);
    // No aparece en la cronología de intervenciones.
    expect(gk.timeline).toHaveLength(0);
  });

  it("los mapas GK no inventan intervención para un UNSPECIFIED", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [tiro("UNSPECIFIED")],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.interventionZones).toEqual({ GK1: 0, GK2: 0, GK3: 0, GK4: 0, GK5: 0 });
    expect(gk.interventionsUnlocated).toBe(0);
  });

  it("efectividad y denominador con mezcla de declarado y no declarado", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [
        tiro("SAVE"),                       // resuelto: parada
        tiro("UNSPECIFIED"),                // recibido, sin declarar
        event({ type: ActionType.GOAL, playerIds: ["rival-10", "gk1"], metadata: { isOpponent: true, targetGoalkeeperId: "gk1" } }),
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.totalSaves).toBe(1);
    expect(gk.conceded).toBe(1);
    expect(gk.shotsFaced).toBe(2);          // 1 parada + 1 encajado
    expect(gk.shotsUndeclared).toBe(1);
    expect(gk.shotsAgainst).toBe(3);        // tiros recibidos totales
    expect(gk.effectivenessPct).toBe(50);   // 1 / (1+1)
  });
});

// ── ZONAS DE INTERVENCIÓN (GK1-GK5) ─────────────────────────────────────
//
// Tercera dimensión espacial. Aquí se comprueba que llega íntegra al informe
// por los DOS caminos posibles: el evento propio del portero y el tiro rival
// enriquecido del Modelo C. Si solo funcionara uno de los dos, el mapa del
// PDF mostraría la mitad de las intervenciones sin avisar.

/** Tiro rival respondido por nuestro portero (Modelo C: un solo evento). */
function rivalShot(
  response: GoalieAction | "UNSPECIFIED",
  zone: string | undefined,
  extra: { gkId?: string; exitOutcome?: "success" | "fail"; timestamp?: number } = {},
): GameEvent {
  const gkId = extra.gkId ?? "gk1";
  return event({
    type: ActionType.SHOT,
    playerIds: [gkId],
    timestamp: extra.timestamp ?? 0,
    goalkeeperZone: zone as any,
    metadata: {
      isOpponent: true,
      goalieResponse: response,
      targetGoalkeeperId: gkId,
      ...(extra.exitOutcome ? { exitOutcome: extra.exitOutcome } : {}),
    } as any,
  });
}

/** Caso de prueba obligatorio: una intervención de cada tipo en cada zona. */
function mandatoryZoneMatch(): MatchData {
  return matchData({
    players: [player({ id: "gk1", number: 1, individualTimeSeconds: 1200 })],
    events: [
      rivalShot(GoalieAction.SAVE, "GK1", { timestamp: 1000 }),
      rivalShot(GoalieAction.SAVE_CATCH, "GK2", { timestamp: 2000 }),
      rivalShot(GoalieAction.SAVE_DEFLECT, "GK3", { timestamp: 3000 }),
      rivalShot(GoalieAction.EXIT, "GK4", { exitOutcome: "success", timestamp: 4000 }),
      rivalShot(GoalieAction.EXIT, "GK5", { exitOutcome: "fail", timestamp: 5000 }),
      rivalShot("UNSPECIFIED", undefined, { timestamp: 6000 }),
    ],
  });
}

describe("buildGoalkeeperReports · zonas de intervención", () => {
  it("caso obligatorio: cada zona registra exactamente una intervención", () => {
    const [gk] = buildGoalkeeperReports(mandatoryZoneMatch());
    expect(gk.interventionZones).toEqual({ GK1: 1, GK2: 1, GK3: 1, GK4: 1, GK5: 1 });
    // UNSPECIFIED no es una intervención: ni se ubica ni se cuenta como tal.
    expect(gk.interventionsUnlocated).toBe(0);
    expect(gk.shotsUndeclared).toBe(1);
  });

  it("Modelo C · SHOT + SAVE + GK1 alimenta la zona 1", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [rivalShot(GoalieAction.SAVE, "GK1")],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.interventionZones.GK1).toBe(1);
    expect(gk.interventionZonesByAction[GoalieAction.SAVE]?.GK1).toBe(1);
    expect(gk.saveGeneric).toBe(1);
  });

  it("Modelo C · SHOT + SAVE_CATCH + GK2 alimenta la zona 2 como blocaje", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [rivalShot(GoalieAction.SAVE_CATCH, "GK2")],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.interventionZones.GK2).toBe(1);
    expect(gk.interventionZonesByAction[GoalieAction.SAVE_CATCH]?.GK2).toBe(1);
    expect(gk.interventionZonesByAction[GoalieAction.SAVE]).toBeUndefined();
  });

  it("Modelo C · SHOT + SAVE_DEFLECT + GK3 alimenta la zona 3 como despeje", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [rivalShot(GoalieAction.SAVE_DEFLECT, "GK3")],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.interventionZones.GK3).toBe(1);
    expect(gk.interventionZonesByAction[GoalieAction.SAVE_DEFLECT]?.GK3).toBe(1);
  });

  it("Modelo C · SHOT + EXIT con éxito + GK4 alimenta la zona 4 y el detalle de éxito", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [rivalShot(GoalieAction.EXIT, "GK4", { exitOutcome: "success" })],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.interventionZones.GK4).toBe(1);
    expect(gk.exitZonesSuccess.GK4).toBe(1);
    expect(gk.exitZonesFail.GK4).toBe(0);
  });

  it("Modelo C · SHOT + EXIT fallida + GK5 alimenta la zona 5 y el detalle de fallo", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [rivalShot(GoalieAction.EXIT, "GK5", { exitOutcome: "fail" })],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.interventionZones.GK5).toBe(1);
    expect(gk.exitZonesFail.GK5).toBe(1);
    expect(gk.exitZonesSuccess.GK5).toBe(0);
  });

  it("evento GK independiente (no Modelo C) con zona cuenta igual", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [
        event({
          type: GoalieAction.SAVE_CATCH,
          playerIds: ["gk1"],
          goalkeeperZone: "GK2" as any,
          metadata: { isOpponent: false } as any,
        }),
        event({
          type: GoalieAction.EXIT,
          playerIds: ["gk1"],
          goalkeeperZone: "GK5" as any,
          metadata: { isOpponent: false, exitOutcome: "success" } as any,
        }),
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.interventionZones).toEqual({ GK1: 0, GK2: 1, GK3: 0, GK4: 0, GK5: 1 });
    expect(gk.interventionZonesByAction[GoalieAction.SAVE_CATCH]?.GK2).toBe(1);
    expect(gk.interventionZonesByAction[GoalieAction.EXIT]?.GK5).toBe(1);
  });

  it("UNSPECIFIED no se coloca en ninguna zona ni aparece en el desglose por tipo", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [rivalShot("UNSPECIFIED", undefined), rivalShot("UNSPECIFIED", "GK3" as any)],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.interventionZones).toEqual({ GK1: 0, GK2: 0, GK3: 0, GK4: 0, GK5: 0 });
    expect(gk.interventionsUnlocated).toBe(0);
    expect(Object.keys(gk.interventionZonesByAction)).toEqual([]);
    expect(gk.shotsUndeclared).toBe(2);
  });

  it("una intervención real sin zona se cuenta aparte, nunca se reparte", () => {
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [
        rivalShot(GoalieAction.SAVE, "GK1"),
        rivalShot(GoalieAction.SAVE, undefined),
        event({ type: GoalieAction.SAVE_CATCH, playerIds: ["gk1"], metadata: { isOpponent: false } as any }),
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.interventionZones.GK1).toBe(1);
    expect(gk.interventionsUnlocated).toBe(2);
    expect(gk.totalSaves).toBe(3);
  });

  it("dos porteros: cada ficha muestra solo sus zonas, sin contaminación cruzada", () => {
    // Portero A sale sustituido; portero B entra. El tiro enriquecido se
    // atribuye por targetGoalkeeperId, no por "quién está en pista ahora".
    const md = matchData({
      players: [
        player({ id: "gkA", number: 1, name: "Ana", individualTimeSeconds: 600, isOnPitch: false }),
        player({ id: "gkB", number: 12, name: "Bea", individualTimeSeconds: 600, isOnPitch: true }),
      ],
      events: [
        rivalShot(GoalieAction.SAVE, "GK1", { gkId: "gkA", timestamp: 1000 }),
        rivalShot(GoalieAction.SAVE_CATCH, "GK2", { gkId: "gkA", timestamp: 2000 }),
        rivalShot(GoalieAction.SAVE_DEFLECT, "GK4", { gkId: "gkB", timestamp: 3000 }),
        rivalShot(GoalieAction.EXIT, "GK5", { gkId: "gkB", exitOutcome: "success", timestamp: 4000 }),
      ],
    });
    const [a, b] = buildGoalkeeperReports(md);
    expect(a.id).toBe("gkA");
    expect(a.interventionZones).toEqual({ GK1: 1, GK2: 1, GK3: 0, GK4: 0, GK5: 0 });
    expect(b.id).toBe("gkB");
    expect(b.interventionZones).toEqual({ GK1: 0, GK2: 0, GK3: 0, GK4: 1, GK5: 1 });
    expect(b.exitZonesSuccess.GK5).toBe(1);
    expect(a.exitZonesSuccess.GK5).toBe(0);
  });

  it("origen, destino y zona de intervención no comparten contadores", () => {
    // El mismo tiro lleva las tres coordenadas. Cada una va a su mapa.
    const md = matchData({
      players: [player({ individualTimeSeconds: 600 })],
      events: [
        {
          ...rivalShot(GoalieAction.SAVE, "GK3"),
          originGrid: "Z3C" as any,
          destinationGrid: "G7" as any,
        },
      ],
    });
    const [gk] = buildGoalkeeperReports(md);
    expect(gk.interventionZones).toEqual({ GK1: 0, GK2: 0, GK3: 1, GK4: 0, GK5: 0 });
    // La zona de pista no se cuela en el recuento de zonas de portero.
    expect(Object.values(gk.interventionZones).reduce((a, b) => a + b, 0)).toBe(1);
    expect(gk.mappedInterventions).toBe(1); // destino: dominio aparte
  });
});
