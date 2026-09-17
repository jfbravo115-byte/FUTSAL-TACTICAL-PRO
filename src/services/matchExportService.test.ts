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
    expect(fila).toContain('"Tiro"');
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
