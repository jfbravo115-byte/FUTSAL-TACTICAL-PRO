import { describe, expect, it } from "vitest";
import { buildActionsCsv, buildMatchJson, buildPlayersCsv, buildPrintableReportHtml } from "./matchExportService";
import { ActionType, GameState, MatchData, Period, Role } from "../types/futsal";

const match: MatchData = {
  teamName: "Local", opponentName: "Rival", period: Period.FINISHED, matchClock: 0, isClockRunning: false,
  fouls: { team: 2, opponent: 3 },
  timeoutsUsed: { team: { period1: false, period2: false }, opponent: { period1: false, period2: false } },
  timestamp: "2026-09-06T10:00:00.000Z",
  players: [{ id: "p1", number: 7, name: "Juan, Pérez", role: Role.PLAYER, isOnPitch: false, plusMinus: 0, individualTimeSeconds: 600, rotationTimeSeconds: 0, isOpponent: false, stats: { goals: 1, assists: 0, steals: 1, interceptions: 0, losses: 1, errors: 0, fouls: 0, yellowCards: 0, redCards: 0, shots: 2, shotsOffTarget: 0, saves: 0, conceded: 0 } }],
  events: [{ id: "e1", timestamp: 123000, wallClock: 1, period: Period.SECOND, playerIds: ["p1"], type: ActionType.GOAL, gameState: GameState.FOUR_VS_FOUR, originGrid: "B3", destinationGrid: "G2", metadata: { result: "gol" } }],
};

describe("Exportación simple", () => {
  it("JSON es parseable y conserva MatchData", () => {
    const parsed = JSON.parse(buildMatchJson(match));
    expect(parsed.teamName).toBe("Local");
    expect(parsed.events[0].originGrid).toBe("B3");
  });

  it("CSV de acciones contiene una fila por acción y campos clave", () => {
    const csv = buildActionsCsv(match);
    expect(csv).toContain('"periodo"');
    expect(csv).toContain('"02:03"');
    expect(csv).toContain('"Juan, Pérez"');
    expect(csv).toContain('"B3"');
  });

  it("CSV de jugadores exporta TOT y métricas individuales", () => {
    const csv = buildPlayersCsv(match);
    expect(csv).toContain('"tot_segundos"');
    expect(csv).toContain('"Juan, Pérez"');
    expect(csv).toContain('"600"');
    expect(csv).toContain('"tiros_totales"');
  });

  it("la vista imprimible contiene marcador, tiempos y CSS de impresión", () => {
    const html = buildPrintableReportHtml(match);
    expect(html).toContain("Local vs Rival");
    expect(html).toContain("1 - 0");
    expect(html).toContain("@media print");
    expect(html).toContain("Juan, Pérez");
    expect(html).toContain("Conversión");
  });
});

// ── BALÓN PARADO EN EL CSV Y EN EL RESPALDO ─────────────────────────────

const setPieceMatch: MatchData = {
  ...match,
  events: [
    {
      id: "c1", timestamp: 60000, wallClock: 2, period: Period.FIRST, playerIds: [],
      type: ActionType.CORNER, gameState: GameState.FOUR_VS_FOUR, originGrid: "Z4L",
      metadata: { isOpponent: false, cornerSide: "left", setPieceOutcome: "shot" },
    },
    {
      id: "c2", timestamp: 70000, wallClock: 3, period: Period.FIRST, playerIds: [],
      type: ActionType.CORNER, gameState: GameState.FOUR_VS_FOUR, originGrid: "Z4R",
      metadata: { isOpponent: false, cornerSide: "right" },
    },
    {
      id: "f1", timestamp: 80000, wallClock: 4, period: Period.FIRST, playerIds: ["p1"],
      type: ActionType.FOUL, gameState: GameState.FOUR_VS_FOUR, originGrid: "Z2C",
      metadata: { isOpponent: false },
    },
    {
      id: "s1", timestamp: 90000, wallClock: 5, period: Period.FIRST, playerIds: ["p1"],
      type: ActionType.SHOT, gameState: GameState.FOUR_VS_FOUR, originGrid: "Z4C", destinationGrid: "G2",
      metadata: { isOpponent: false, setPiece: "corner" },
    },
  ],
};

describe("CSV de acciones · balón parado", () => {
  const filas = () => buildActionsCsv(setPieceMatch).split("\n");

  it("expone las tres columnas nuevas con etiquetas estables", () => {
    const header = filas()[0];
    expect(header).toContain('"lado_corner"');
    expect(header).toContain('"desenlace_balon_parado"');
    expect(header).toContain('"accion_desde"');
  });

  it("traduce lado y desenlace del córner, sin códigos internos", () => {
    const fila = filas().find((f) => f.includes('"CORNER"') && f.includes("01:00"))!;
    expect(fila).toContain('"izquierda"');
    expect(fila).toContain('"Tiro directo"');
    expect(fila).not.toContain('"shot"');
  });

  it("un córner sin desenlace deja la celda vacía, no inventa nada", () => {
    const fila = filas().find((f) => f.includes("01:10"))!;
    expect(fila).toContain('"derecha"');
    expect(fila).not.toContain('"Tiro"');
    expect(fila).not.toContain('"Jugada"');
  });

  it("la falta no lleva desenlace ni lado de córner: es una infracción", () => {
    const fila = filas().find((f) => f.includes('"FOUL"'))!;
    expect(fila).toContain('"Z2C"');     // su ubicación sí
    expect(fila).not.toContain('"Tiro"');
    expect(fila).not.toContain('"Jugada"');
  });

  it("una falta que trajera el campo tampoco lo exporta", () => {
    const conCampo = {
      ...setPieceMatch,
      events: [{
        id: "f9", timestamp: 80000, wallClock: 9, period: Period.FIRST, playerIds: ["p1"],
        type: ActionType.FOUL, gameState: GameState.FOUR_VS_FOUR,
        metadata: { isOpponent: false, setPieceOutcome: "shot" },
      }],
    } as MatchData;
    const fila = buildActionsCsv(conCampo).split("\n")[1];
    expect(fila).not.toContain('"Tiro"');
    expect(fila).not.toContain('"shot"');
  });

  it("el tiro declara su procedencia y no un desenlace de balón parado", () => {
    const fila = filas().find((f) => f.includes('"SHOT"'))!;
    expect(fila).toContain('"Córner"');
    expect(fila).not.toContain('"corner"');
  });

  it("el respaldo JSON conserva los campos nuevos sin tocar nada", () => {
    const parsed = JSON.parse(buildMatchJson(setPieceMatch));
    expect(parsed.events[0].metadata.setPieceOutcome).toBe("shot");
    expect(parsed.events[0].metadata.cornerSide).toBe("left");
    expect(parsed.events[1].metadata.setPieceOutcome).toBeUndefined();
    expect(parsed.events[2].metadata.setPieceOutcome).toBeUndefined(); // la falta
    expect(parsed.events[3].metadata.setPiece).toBe("corner");
  });
});

describe("CSV · jugada de falta", () => {
  const conJugada: MatchData = {
    ...match,
    events: [
      {
        id: "sp1", timestamp: 95000, wallClock: 6, period: Period.FIRST, playerIds: ["p1"],
        type: ActionType.SET_PIECE, gameState: GameState.FOUR_VS_FOUR, originGrid: "Z2L",
        metadata: { isOpponent: false, setPieceOrigin: "free_kick", setPieceOutcome: "play" },
      },
    ],
  };

  it("la identifica con su nombre humano y conserva la zona", () => {
    const fila = buildActionsCsv(conJugada).split("\n")[1];
    expect(fila).toContain('"Jugada de falta"');
    expect(fila).toContain('"Z2L"');
    expect(fila).toContain('"Zona 2 · izquierda"');
  });

  it("no la exporta como desenlace de balón parado ni como procedencia de tiro", () => {
    const fila = buildActionsCsv(conJugada).split("\n")[1];
    expect(fila).not.toContain('"free_kick"');
    // Las columnas de córner y de procedencia del tiro quedan vacías.
    expect(fila.split(",").slice(-3)).toEqual(['""', '""', '""']);
  });

  it("el respaldo JSON conserva el evento entero", () => {
    const parsed = JSON.parse(buildMatchJson(conJugada));
    expect(parsed.events[0].type).toBe("SET_PIECE");
    expect(parsed.events[0].metadata.setPieceOrigin).toBe("free_kick");
    expect(parsed.events[0].metadata.setPieceOutcome).toBe("play");
    expect(parsed.events[0].originGrid).toBe("Z2L");
  });
});

// ── 18 · BACKUP JSON Y EL ANÁLISIS ─────────────────────────────────────
//
// El respaldo es `JSON.stringify(matchData)` entero, así que el análisis
// viaja porque es parte del partido. No hace falta lógica adicional: estos
// tests existen para que nadie la añada, y para que nadie empiece a filtrar
// campos sin darse cuenta de lo que se lleva por delante.

describe("respaldo JSON — conserva el análisis de TACTICAL PRO", () => {
  it("el análisis guardado viaja en el respaldo", () => {
    const conAnalisis = { ...match, tacticalAnalysis: "## Análisis\nEl equipo dominó." };
    const parsed = JSON.parse(buildMatchJson(conAnalisis));
    expect(parsed.tacticalAnalysis).toBe("## Análisis\nEl equipo dominó.");
  });

  it("un partido sin análisis se respalda igual, sin inventar el campo", () => {
    const parsed = JSON.parse(buildMatchJson(match));
    expect(parsed.tacticalAnalysis).toBeUndefined();
    expect(parsed.teamName).toBeTruthy();
  });

  it("restaurar ese JSON devuelve el análisis intacto", () => {
    // El respaldo es MatchData completo: volver a leerlo reconstruye el
    // partido tal cual, análisis incluido.
    const texto = "Línea uno.\n\nLínea dos con **negrita** y acentuación: ñ á é.";
    const restaurado = JSON.parse(buildMatchJson({ ...match, tacticalAnalysis: texto }));
    expect(restaurado.tacticalAnalysis).toBe(texto);
  });
});

// ── 30 / 31 · LA FASE EN EL CSV DE ACCIONES ─────────────────────────────
//
// Se añade AL FINAL para no mover ninguna columna existente: una hoja o un
// script que leyera por posición sigue funcionando igual. Y un evento sin
// fase deja la celda vacía, como el resto de columnas opcionales: escribir
// «No registrada» convertiría la ausencia en un valor.

describe("CSV de acciones · fase de juego", () => {
  const conFase = (phaseOfPlay?: any): MatchData => ({
    ...match,
    events: [
      { ...match.events[0], id: "f1", type: ActionType.LOSS, phaseOfPlay },
    ],
  });

  it("30 · la cabecera incluye la columna «fase», la última", () => {
    const cabecera = buildActionsCsv(match).split("\n")[0];
    expect(cabecera).toContain('"fase"');
    expect(cabecera.trim().endsWith('"fase"')).toBe(true);
  });

  it("las columnas anteriores no se mueven ni cambian de nombre", () => {
    const cabecera = buildActionsCsv(match).split("\n")[0].replace(/^﻿/, "");
    expect(cabecera.split(",").map((c) => c.replace(/"/g, ""))).toEqual([
      "fecha", "periodo", "tiempo", "equipo", "jugador", "tipo_accion", "accion_texto",
      "resultado", "x", "y", "zona", "zona_texto", "destino", "destino_texto",
      "zona_portero", "respuesta_portero", "resultado_salida", "lado_corner",
      "desenlace_balon_parado", "accion_desde", "fase",
    ]);
  });

  it("una acción con fase la exporta con su nombre completo", () => {
    const fila = buildActionsCsv(conFase("attack_positional")).split("\n")[1];
    expect(fila.trim().endsWith('"Ataque posicional"')).toBe(true);
  });

  it("las cuatro fases se exportan legibles", () => {
    const de = (p: string) => buildActionsCsv(conFase(p)).split("\n")[1];
    expect(de("attack_transition")).toContain('"Transición ofensiva"');
    expect(de("defense_organized")).toContain('"Defensa organizada"');
    expect(de("defense_transition")).toContain('"Transición defensiva"');
  });

  it("31 · un evento histórico sin fase deja la celda VACÍA, no inventa valor", () => {
    const fila = buildActionsCsv(conFase(undefined)).split("\n")[1];
    expect(fila.trim().endsWith('""')).toBe(true);
    expect(fila).not.toContain("No registrada");
    expect(fila).not.toContain("Ataque posicional");
  });

  it("el JSON de respaldo conserva la fase sin ningún cambio extra", () => {
    const parsed = JSON.parse(buildMatchJson(conFase("defense_transition")));
    expect(parsed.events[0].phaseOfPlay).toBe("defense_transition");
    const sinFase = JSON.parse(buildMatchJson(conFase(undefined)));
    expect("phaseOfPlay" in sinFase.events[0]).toBe(false);
  });
});
