import { describe, it, expect } from "vitest";
import { computeLineupLock, GameLite } from "./lineupLock";

function game(week: number, status: string, kickoffAt: string): GameLite {
  return { week, status, kickoffAt: new Date(kickoffAt) };
}

describe("computeLineupLock", () => {
  it("is unlocked when no games are loaded at all", () => {
    expect(computeLineupLock([], new Date("2026-09-10T00:00:00Z"))).toEqual({
      locked: false,
      week: null,
      firstKickoffAt: null,
    });
  });

  it("is unlocked before the current week's first kickoff", () => {
    const games = [
      game(1, "SCHEDULED", "2026-09-10T17:00:00Z"),
      game(1, "SCHEDULED", "2026-09-10T20:00:00Z"),
    ];
    const result = computeLineupLock(games, new Date("2026-09-10T16:59:59Z"));
    expect(result.locked).toBe(false);
    expect(result.week).toBe(1);
  });

  it("is locked once the current week's first kickoff has passed, even if other games in that week haven't started", () => {
    const games = [
      game(1, "IN_PROGRESS", "2026-09-10T17:00:00Z"),
      game(1, "SCHEDULED", "2026-09-14T17:00:00Z"),
    ];
    const result = computeLineupLock(games, new Date("2026-09-10T18:00:00Z"));
    expect(result.locked).toBe(true);
    expect(result.week).toBe(1);
  });

  it("is unlocked again once every loaded week is FINAL", () => {
    const games = [game(1, "FINAL", "2026-09-10T17:00:00Z"), game(1, "FINAL", "2026-09-14T17:00:00Z")];
    const result = computeLineupLock(games, new Date("2026-09-15T00:00:00Z"));
    expect(result.locked).toBe(false);
    expect(result.week).toBe(null);
  });

  it("skips past fully-final earlier weeks to find the current one", () => {
    const games = [
      game(1, "FINAL", "2026-09-10T17:00:00Z"),
      game(2, "SCHEDULED", "2026-09-17T17:00:00Z"),
    ];
    const result = computeLineupLock(games, new Date("2026-09-16T00:00:00Z"));
    expect(result.locked).toBe(false);
    expect(result.week).toBe(2);
  });

  it("is locked at the exact kickoff instant", () => {
    const games = [game(1, "IN_PROGRESS", "2026-09-10T17:00:00Z")];
    const kickoff = new Date("2026-09-10T17:00:00Z");
    expect(computeLineupLock(games, kickoff).locked).toBe(true);
  });
});
