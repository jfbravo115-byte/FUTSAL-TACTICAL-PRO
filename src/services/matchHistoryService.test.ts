import { describe, expect, it } from "vitest";
import { combineMatchHistory, matchHistorySignature } from "./matchHistoryService";
import { MatchData, Period, Role, SavedMatch } from "../types/futsal";
import { LocalFinalCopy } from "./matchSnapshotService";

function match(id: string, timestamp = "2026-09-06T10:00:00.000Z"): SavedMatch {
  const data: MatchData = {
    teamName: "Local",
    opponentName: "Rival",
    period: Period.FINISHED,
    matchClock: 0,
    isClockRunning: false,
    fouls: { team: 0, opponent: 0 },
    timeoutsUsed: { team: { period1: false, period2: false }, opponent: { period1: false, period2: false } },
    players: [{
      id: "p1", number: 7, name: "Juan", role: Role.PLAYER, isOnPitch: false,
      plusMinus: 0, individualTimeSeconds: 500, rotationTimeSeconds: 0, isOpponent: false,
      stats: { goals: 0, assists: 0, steals: 0, interceptions: 0, losses: 0, errors: 0, fouls: 0, yellowCards: 0, redCards: 0, shots: 0, shotsOffTarget: 0, saves: 0, conceded: 0 },
    }],
    events: [], timestamp,
  };
  return { ...data, id };
}

describe("Historial 2.0 — combinación local/remoto (H)", () => {
  it("muestra partidos locales aunque el remoto esté vacío/fallando", () => {
    const local: LocalFinalCopy[] = [{ id: "futsal_final_copy_v1_x", matchData: match("x"), syncStatus: "pending" }];
    const out = combineMatchHistory([], local);
    expect(out).toHaveLength(1);
    expect(out[0].historySource).toBe("local");
    expect(out[0].syncStatus).toBe("pending");
  });

  it("deduplica la misma copia local + remoto", () => {
    const remote = match("remote-1");
    const local: LocalFinalCopy[] = [{ id: "futsal_final_copy_v1_x", matchData: { ...remote }, syncStatus: "synced", remoteId: "remote-1" }];
    const out = combineMatchHistory([remote], local);
    expect(out).toHaveLength(1);
    expect(out[0].historySource).toBe("both");
    expect(out[0].localStorageId).toBe("futsal_final_copy_v1_x");
  });

  it("la firma es estable para el mismo partido", () => {
    expect(matchHistorySignature(match("a"))).toBe(matchHistorySignature(match("b")));
  });
});
