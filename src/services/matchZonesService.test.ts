import { describe, expect, it } from "vitest";
import { buildZoneDashboard, summarizeQuickZones, zoneMetricValue } from "./matchZonesService";
import { ActionType, GameState, GoalieAction, MatchData, Period } from "../types/futsal";

const base: MatchData = {
  teamName: "Local", opponentName: "Rival", period: Period.FIRST, matchClock: 0, isClockRunning: false,
  fouls: { team: 0, opponent: 0 },
  timeoutsUsed: { team: { period1: false, period2: false }, opponent: { period1: false, period2: false } },
  players: [], events: [],
};

function ev(id: string, type: ActionType | GoalieAction, zone: string, isOpponent = false, destinationGrid?: string) {
  return { id, timestamp: 0, wallClock: 0, period: Period.FIRST, playerIds: [], type, gameState: GameState.FOUR_VS_FOUR, originGrid: zone, destinationGrid, metadata: { isOpponent } };
}

describe("Zonas simples", () => {
  it("consume originGrid lógico sin transformarlo", () => {
    const zones = summarizeQuickZones({ ...base, events: [ev("1", ActionType.SHOT, "A1"), ev("2", ActionType.GOAL, "A1"), ev("3", ActionType.STEAL, "B2"), ev("4", ActionType.LOSS, "C3")] });
    const a1 = zones.find((z) => z.zone === "A1")!;
    expect(a1.total).toBe(2);
    expect(a1.shots).toBe(2);
    expect(a1.goals).toBe(1);
    expect(zones.find((z) => z.zone === "B2")!.recoveries).toBe(1);
    expect(zones.find((z) => z.zone === "C3")!.losses).toBe(1);
  });

  it("separa acciones propias y rivales", () => {
    const md = { ...base, events: [ev("1", ActionType.SHOT, "A1", false), ev("2", ActionType.SHOT, "A1", true)] };
    expect(summarizeQuickZones(md, false).find((z) => z.zone === "A1")!.total).toBe(1);
    expect(summarizeQuickZones(md, true).find((z) => z.zone === "A1")!.total).toBe(1);
  });

  it("construye destino de portería, fuera y porcentajes sin inventar datos", () => {
    const md = {
      ...base,
      events: [
        ev("1", ActionType.GOAL, "A1", false, "G1"),
        ev("2", ActionType.SHOT, "A1", false, "G2"),
        ev("3", ActionType.SHOT, "B1", false, "OUT"),
        ev("4", ActionType.STEAL, "B2"),
        ev("5", ActionType.LOSS, "C3"),
      ],
    };
    const dashboard = buildZoneDashboard(md, false);
    expect(dashboard.totals.attempts).toBe(3);
    expect(dashboard.totals.onTarget).toBe(2);
    expect(dashboard.totals.goals).toBe(1);
    expect(dashboard.totals.accuracyPct).toBe(67);
    expect(dashboard.totals.conversionPct).toBe(33);
    expect(dashboard.out).toBe(1);
    expect(dashboard.goal.find((z) => z.zone === "G1")).toEqual({ zone: "G1", attempts: 1, goals: 1 });
  });

  it("cuenta GOAL_CONCEDED como intento/gol del lado que indique metadata.isOpponent", () => {
    const md = { ...base, events: [ev("1", GoalieAction.GOAL_CONCEDED, "C1", true, "G3")] };
    expect(buildZoneDashboard(md, false).totals.attempts).toBe(0);
    expect(buildZoneDashboard(md, true).totals).toMatchObject({ attempts: 1, goals: 1 });
  });

  it("expone un valor estable para cada filtro de la matriz", () => {
    const zone = { zone: "A1", total: 7, shots: 4, recoveries: 2, losses: 1, goals: 1 };
    expect(zoneMetricValue(zone, "all")).toBe(7);
    expect(zoneMetricValue(zone, "shots")).toBe(4);
    expect(zoneMetricValue(zone, "recoveries")).toBe(2);
    expect(zoneMetricValue(zone, "losses")).toBe(1);
  });
});
