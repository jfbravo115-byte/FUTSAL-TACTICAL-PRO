import { describe, expect, it } from "vitest";
import { summarizeQuickZones } from "./matchZonesService";
import { ActionType, GameState, MatchData, Period } from "../types/futsal";

const base: MatchData = {
  teamName: "Local", opponentName: "Rival", period: Period.FIRST, matchClock: 0, isClockRunning: false,
  fouls: { team: 0, opponent: 0 },
  timeoutsUsed: { team: { period1: false, period2: false }, opponent: { period1: false, period2: false } },
  players: [], events: [],
};

function ev(id: string, type: ActionType, zone: string, isOpponent = false) {
  return { id, timestamp: 0, wallClock: 0, period: Period.FIRST, playerIds: [], type, gameState: GameState.FOUR_VS_FOUR, originGrid: zone, metadata: { isOpponent } };
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
});
