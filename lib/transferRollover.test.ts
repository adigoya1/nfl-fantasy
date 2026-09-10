import { describe, it, expect } from "vitest";
import { planTransferRollover } from "./transferRollover";

describe("planTransferRollover", () => {
  it("adds 1 free transfer for a team that didn't play Free Hit", () => {
    const plan = planTransferRollover(
      { id: "team-1", freeTransfers: 1, lastTransferRolloverWeek: null, playedFreeHitThisWeek: false },
      1
    );
    expect(plan).toEqual({ fantasyTeamId: "team-1", freeTransfers: 2 });
  });

  it("stacks on top of unused transfers rather than resetting to 1", () => {
    const plan = planTransferRollover(
      { id: "team-1", freeTransfers: 0, lastTransferRolloverWeek: 1, playedFreeHitThisWeek: false },
      2
    );
    expect(plan).toEqual({ fantasyTeamId: "team-1", freeTransfers: 1 });
  });

  it("does not add a transfer for a team that played Free Hit that week", () => {
    const plan = planTransferRollover(
      { id: "team-1", freeTransfers: 3, lastTransferRolloverWeek: 1, playedFreeHitThisWeek: true },
      2
    );
    expect(plan).toEqual({ fantasyTeamId: "team-1", freeTransfers: 3 });
  });

  it("returns null when this team already rolled over for this exact week", () => {
    const plan = planTransferRollover(
      { id: "team-1", freeTransfers: 1, lastTransferRolloverWeek: 2, playedFreeHitThisWeek: false },
      2
    );
    expect(plan).toBeNull();
  });

  it("returns null when this team already rolled over for a later week (stale re-poll)", () => {
    const plan = planTransferRollover(
      { id: "team-1", freeTransfers: 1, lastTransferRolloverWeek: 3, playedFreeHitThisWeek: false },
      2
    );
    expect(plan).toBeNull();
  });

  it("applies normally for a team that's never been rolled over before", () => {
    const plan = planTransferRollover(
      { id: "team-1", freeTransfers: 1, lastTransferRolloverWeek: null, playedFreeHitThisWeek: false },
      5
    );
    expect(plan).toEqual({ fantasyTeamId: "team-1", freeTransfers: 2 });
  });
});
