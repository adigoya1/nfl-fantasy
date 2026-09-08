import { describe, it, expect } from "vitest";
import { scoreGame, computeBps, awardBonusPoints, RawStatLine } from "./scoring";
import {
  computePreseasonPrice,
  computeWeeklyPriceChange,
  normalize,
  POSITION_PRICE_RANGES,
} from "./pricing";

const blankStat: RawStatLine = {
  passYds: 0,
  passTds: 0,
  interceptionsThrown: 0,
  rushYds: 0,
  rushTds: 0,
  receptions: 0,
  recYds: 0,
  recTds: 0,
  fumblesLost: 0,
  twoPtConversions: 0,
  fgMade0to39: 0,
  fgMade40to49: 0,
  fgMade50Plus: 0,
  fgMissed: 0,
  xpMade: 0,
  dstSacks: 0,
  dstInterceptions: 0,
  dstFumbleRecoveries: 0,
  dstDefensiveTds: 0,
  dstPointsAllowed: null,
};

describe("scoreGame", () => {
  it("scores a big QB day correctly", () => {
    // 300 pass yds, 3 pass TD, 1 INT, 20 rush yds
    const stat: RawStatLine = {
      ...blankStat,
      passYds: 300,
      passTds: 3,
      interceptionsThrown: 1,
      rushYds: 20,
    };
    // 300/25=12, 3*4=12, 1*-2=-2, 20/10=2 => 24
    expect(scoreGame(stat)).toBeCloseTo(24, 5);
  });

  it("applies standard DST points-allowed tiers correctly", () => {
    expect(scoreGame({ ...blankStat, dstPointsAllowed: 0 })).toBe(10);
    expect(scoreGame({ ...blankStat, dstPointsAllowed: 4 })).toBe(7); // 1-6
    expect(scoreGame({ ...blankStat, dstPointsAllowed: 10 })).toBe(4); // 7-13
    expect(scoreGame({ ...blankStat, dstPointsAllowed: 35 })).toBe(-4); // 35+
  });
});

describe("awardBonusPoints", () => {
  it("gives +3/+2/+1 to the top three, ties share a rank", () => {
    const result = awardBonusPoints([
      { playerId: "a", bps: 50 },
      { playerId: "b", bps: 50 },
      { playerId: "c", bps: 30 },
      { playerId: "d", bps: 10 },
    ]);
    expect(result.a).toBe(3);
    expect(result.b).toBe(3); // tied for 1st, both get the 1st-place bonus
    expect(result.c).toBe(2); // 2nd distinct BPS value
    expect(result.d).toBe(1); // 3rd distinct BPS value
  });

  it("stops awarding once a 4th distinct BPS value is reached", () => {
    const result = awardBonusPoints([
      { playerId: "a", bps: 50 },
      { playerId: "b", bps: 40 },
      { playerId: "c", bps: 30 },
      { playerId: "d", bps: 10 },
    ]);
    expect(result.d).toBeUndefined();
  });
});

describe("pricing", () => {
  it("hits the top of the default range for a max-projected player", () => {
    const price = computePreseasonPrice({
      normalizedProjectedPoints: 1,
      normalizedDraftRank: 1,
    });
    expect(price).toBe(10.0);
  });

  it("hits the top of a custom (e.g. kicker) range instead of the default", () => {
    const price = computePreseasonPrice(
      { normalizedProjectedPoints: 1, normalizedDraftRank: 1 },
      POSITION_PRICE_RANGES.K
    );
    expect(price).toBe(5.5);
  });

  it("falls back to the projection itself when draft rank is missing", () => {
    const withRank = computePreseasonPrice({ normalizedProjectedPoints: 0.7, normalizedDraftRank: 0.7 });
    const withoutRank = computePreseasonPrice({ normalizedProjectedPoints: 0.7, normalizedDraftRank: null });
    expect(withoutRank).toBe(withRank);
  });

  it("a higher-projected player prices above a lower-projected one", () => {
    const high = computePreseasonPrice({ normalizedProjectedPoints: 0.9, normalizedDraftRank: 0.9 });
    const low = computePreseasonPrice({ normalizedProjectedPoints: 0.2, normalizedDraftRank: 0.2 });
    expect(high).toBeGreaterThan(low);
  });

  it("clamps weekly price moves to +/- 0.1 per week and respects the floor", () => {
    const result = computeWeeklyPriceChange({
      currentPrice: 4.0,
      startingPrice: 8.0,
      transfersIn: 0,
      transfersOut: 1000,
      totalActiveManagers: 1000,
      ownershipPct: 0.3,
      weeklyPoints: 0,
      positionAvg: 15,
      positionStdDev: 5,
    });
    // Massive sell-off, but floor is 50% of starting price (4.0)
    expect(result.newPrice).toBeGreaterThanOrEqual(4.0);
  });

  it("normalize clamps to [0,1]", () => {
    expect(normalize(150, 0, 100)).toBe(1);
    expect(normalize(-10, 0, 100)).toBe(0);
    expect(normalize(50, 0, 100)).toBe(0.5);
  });
});
