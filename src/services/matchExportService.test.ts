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
