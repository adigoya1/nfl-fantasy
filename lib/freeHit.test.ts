import { describe, it, expect } from "vitest";
import { buildRosterSnapshot, isWeekFullyFinal, planRevert } from "./freeHit";

describe("buildRosterSnapshot", () => {
  it("keeps only the fields that matter, in the same order", () => {
    const rosterSlots = [
      { playerId: "qb1", isStarter: true, benchOrder: null },
      { playerId: "wr4", isStarter: false, benchOrder: 2 },
    ];
    expect(buildRosterSnapshot(rosterSlots)).toEqual([
      { playerId: "qb1", isStarter: true, benchOrder: null },
      { playerId: "wr4", isStarter: false, benchOrder: 2 },
    ]);
  });

  it("doesn't mutate or leak extra fields from a richer input shape", () => {
    const rosterSlots = [
      { playerId: "qb1", isStarter: true, benchOrder: null, id: "slot-1", fantasyTeamId: "team-1" },
    ];
    const snapshot = buildRosterSnapshot(rosterSlots as any);
    expect(snapshot).toEqual([{ playerId: "qb1", isStarter: true, benchOrder: null }]);
    expect(Object.keys(snapshot[0])).toEqual(["playerId", "isStarter", "benchOrder"]);
  });
});

describe("isWeekFullyFinal", () => {
  it("is false when no games are known for the week", () => {
    expect(isWeekFullyFinal([])).toBe(false);
  });

  it("is true when every game is FINAL", () => {
    expect(isWeekFullyFinal(["FINAL", "FINAL", "FINAL"])).toBe(true);
  });

  it("is false while any game is still IN_PROGRESS", () => {
    expect(isWeekFullyFinal(["FINAL", "IN_PROGRESS", "FINAL"])).toBe(false);
  });

  it("is false while any game hasn't kicked off yet", () => {
    expect(isWeekFullyFinal(["FINAL", "SCHEDULED"])).toBe(false);
  });
});

describe("planRevert", () => {
  it("maps a stored snapshot straight into the fields the revert job writes", () => {
    const snapshot = {
      id: "snap-1",
      fantasyTeamId: "team-1",
      budgetRemaining: 12.3,
      freeTransfers: 1,
      roster: [{ playerId: "qb1", isStarter: true, benchOrder: null }],
    };
    expect(planRevert(snapshot)).toEqual({
      fantasyTeamId: "team-1",
      snapshotId: "snap-1",
      budgetRemaining: 12.3,
      freeTransfers: 1,
      roster: [{ playerId: "qb1", isStarter: true, benchOrder: null }],
    });
  });
});
