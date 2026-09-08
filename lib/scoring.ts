/**
 * Fantasy scoring engine — standard PPR (point-per-reception) scoring,
 * matching the defaults most NFL fantasy platforms (ESPN, Yahoo, Sleeper)
 * ship with, plus an FPL-style bonus-points layer (section 3.1) on top.
 *
 * Pure functions, no DB/network access, so they're easy to unit test.
 */

export interface RawStatLine {
  passYds: number;
  passTds: number;
  interceptionsThrown: number;
  rushYds: number;
  rushTds: number;
  receptions: number;
  recYds: number;
  recTds: number;
  fumblesLost: number;
  twoPtConversions: number;
  fgMade0to39: number;
  fgMade40to49: number;
  fgMade50Plus: number;
  fgMissed: number;
  xpMade: number;
  dstSacks: number;
  dstInterceptions: number;
  dstFumbleRecoveries: number;
  dstDefensiveTds: number;
  /** null for offensive/kicker players — only D/ST units carry this */
  dstPointsAllowed: number | null;
}

export const SCORING_TABLE = {
  passYdsPerPoint: 25, // 0.04 pts/yard
  passTd: 4,
  interceptionThrown: -2,
  rushYdsPerPoint: 10, // 0.1 pts/yard
  rushTd: 6,
  reception: 1, // full PPR
  recYdsPerPoint: 10,
  recTd: 6,
  fumbleLost: -2,
  twoPtConversion: 2,
  fgMade0to39: 3,
  fgMade40to49: 4,
  fgMade50Plus: 5,
  fgMissed: -1,
  xpMade: 1,
  dstSack: 1,
  dstInterception: 2,
  dstFumbleRecovery: 2,
  dstDefensiveTd: 6,
} as const;

/**
 * D/ST points-allowed tiers, evaluated top-down; first match wins. Matches
 * the standard tiering most platforms (ESPN included) default to.
 */
const DST_POINTS_ALLOWED_TIERS: Array<{ max: number; points: number }> = [
  { max: 0, points: 10 },
  { max: 6, points: 7 },
  { max: 13, points: 4 },
  { max: 20, points: 1 },
  { max: 27, points: 0 },
  { max: 34, points: -1 },
  { max: Infinity, points: -4 },
];

function dstPointsAllowedScore(pointsAllowed: number): number {
  const tier = DST_POINTS_ALLOWED_TIERS.find((t) => pointsAllowed <= t.max);
  return tier ? tier.points : 0;
}

/** Computes raw fantasy points for a single player's single-game stat line. */
export function scoreGame(stat: RawStatLine): number {
  const t = SCORING_TABLE;
  let points = 0;

  points += stat.passYds / t.passYdsPerPoint;
  points += stat.passTds * t.passTd;
  points += stat.interceptionsThrown * t.interceptionThrown;

  points += stat.rushYds / t.rushYdsPerPoint;
  points += stat.rushTds * t.rushTd;

  points += stat.receptions * t.reception;
  points += stat.recYds / t.recYdsPerPoint;
  points += stat.recTds * t.recTd;

  points += stat.fumblesLost * t.fumbleLost;
  points += stat.twoPtConversions * t.twoPtConversion;

  points += stat.fgMade0to39 * t.fgMade0to39;
  points += stat.fgMade40to49 * t.fgMade40to49;
  points += stat.fgMade50Plus * t.fgMade50Plus;
  points += stat.fgMissed * t.fgMissed;
  points += stat.xpMade * t.xpMade;

  points += stat.dstSacks * t.dstSack;
  points += stat.dstInterceptions * t.dstInterception;
  points += stat.dstFumbleRecoveries * t.dstFumbleRecovery;
  points += stat.dstDefensiveTds * t.dstDefensiveTd;

  if (stat.dstPointsAllowed !== null) {
    points += dstPointsAllowedScore(stat.dstPointsAllowed);
  }

  return Math.round(points * 100) / 100;
}

/**
 * BPS (Bonus Points System) — a broader "impact" score used only to rank
 * performances within a single game, not part of raw fantasy points. This
 * is the FPL-style twist on top of standard PPR: three bonus points get
 * handed out per game regardless of scoring system. Weights are a starting
 * point; tune after a playtest season.
 */
export function computeBps(stat: RawStatLine): number {
  return (
    stat.passYds * 0.05 +
    stat.passTds * 3 +
    stat.rushYds * 0.15 +
    stat.rushTds * 4 +
    stat.recYds * 0.15 +
    stat.recTds * 4 +
    stat.receptions * 0.5 +
    stat.dstSacks * 2 +
    stat.dstInterceptions * 4 +
    stat.dstFumbleRecoveries * 3 +
    stat.dstDefensiveTds * 8 -
    stat.interceptionsThrown * 3 -
    stat.fumblesLost * 3
  );
}

export interface PlayerGameBps {
  playerId: string;
  bps: number;
}

/** Awards +3/+2/+1 bonus points to the top three BPS scorers in a single game. */
export function awardBonusPoints(
  playersInGame: PlayerGameBps[]
): Record<string, number> {
  const sorted = [...playersInGame].sort((a, b) => b.bps - a.bps);
  const bonuses: Record<string, number> = {};
  const bonusValues = [3, 2, 1];

  let rank = 0;
  let lastBps: number | null = null;
  for (const entry of sorted) {
    if (entry.bps !== lastBps) {
      rank += 1;
      lastBps = entry.bps;
    }
    if (rank > 3) break;
    // Ties at a rank share that rank's bonus (standard FPL tie-handling).
    bonuses[entry.playerId] = bonusValues[rank - 1] ?? 0;
  }
  return bonuses;
}
