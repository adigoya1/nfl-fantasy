/**
 * Price / valuation algorithm. Pure functions; wired up to Prisma queries
 * in scripts/load-players.ts (preseason) and a scheduled job (in-season).
 */

const PRICE_FLOOR = 4.0;
const PRICE_CEILING = 10.0;
const WEEKLY_STEP = 0.1;
const MAX_WEEKLY_MOVE = 0.3;

// --- Preseason initial pricing ----------------------------------------------

export interface PreseasonInputs {
  /** 0-1, this player's ESPN-projected season fantasy points, normalized within their position group */
  normalizedProjectedPoints: number;
  /**
   * 0-1, ESPN's own PPR draft rank for this player, normalized (and
   * inverted, so 1 = best rank) within their position group. Optional —
   * not every player ESPN returns has a draft rank (deep bench/practice
   * squad names sometimes don't). Acts as a secondary smoothing signal on
   * top of raw projected points, which can be noisy for committee
   * backfields or unresolved camp battles.
   */
  normalizedDraftRank?: number | null;
}

export interface PriceRange {
  min: number;
  max: number;
}

/**
 * Positions differ a lot in scoring ceiling — a kicker's best week never
 * looks like a QB's best week — so pricing every position against the same
 * $4-10M span makes the top kicker as "expensive" as a star WR just because
 * they're #1 within a small K pool. Give each position its own span instead;
 * QB keeps the full range (highest weekly ceiling, only one per team), K/DEF
 * get compressed ranges reflecting their lower and less-variable scoring.
 * Tune these after a playtest season.
 */
export const POSITION_PRICE_RANGES: Record<string, PriceRange> = {
  QB: { min: 4.5, max: 10.0 },
  RB: { min: 4.0, max: 9.5 },
  WR: { min: 4.0, max: 9.5 },
  TE: { min: 4.0, max: 8.0 },
  K: { min: 4.0, max: 5.5 },
  DEF: { min: 4.0, max: 6.5 },
};

export const DEFAULT_PRICE_RANGE: PriceRange = { min: PRICE_FLOOR, max: PRICE_CEILING };

/** Min-max normalizes a value against a position group's [min, max] range. Clamps to [0, 1]. */
export function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0.5; // no spread in the group — treat as average
  const n = (value - min) / (max - min);
  return Math.min(1, Math.max(0, n));
}

/**
 * Weighted blend of ESPN-projected season points (85%) and ESPN's own
 * draft rank as a smoothing signal (15%), scaled to fill the given price
 * range exactly.
 *
 * Unlike a college fantasy game — where no stats API knows this year's
 * depth chart — NFL projections already bake in beat-writer reporting,
 * camp battles, injury designations, and expert judgment. So the honest
 * approach here is to trust the projection as the primary signal rather
 * than reconstructing it from more indirect proxies.
 */
export function computePreseasonPrice(
  inputs: PreseasonInputs,
  range: PriceRange = DEFAULT_PRICE_RANGE
): number {
  const span = range.max - range.min;
  const rankComponent = inputs.normalizedDraftRank ?? inputs.normalizedProjectedPoints;
  const weighted = 0.85 * inputs.normalizedProjectedPoints + 0.15 * rankComponent;

  const raw = range.min + span * weighted;
  const rounded = Math.round(raw * 10) / 10;
  return Math.min(range.max, Math.max(range.min, rounded));
}

// --- In-season dynamic pricing (weekly) -------------------------------------

export type OwnershipTier = "LOW" | "MEDIUM" | "HIGH";

export function ownershipTier(ownershipPct: number): OwnershipTier {
  if (ownershipPct >= 0.25) return "HIGH";
  if (ownershipPct >= 0.05) return "MEDIUM";
  return "LOW";
}

/**
 * Higher-owned players need a bigger swing in transfer % to move, mirroring
 * how FPL weights transfers relative to existing ownership.
 */
const RISE_THRESHOLDS: Record<OwnershipTier, number> = {
  LOW: 0.08,
  MEDIUM: 0.15,
  HIGH: 0.25,
};

const FALL_THRESHOLDS: Record<OwnershipTier, number> = {
  LOW: -0.08,
  MEDIUM: -0.12,
  HIGH: -0.18,
};

export interface WeeklyPriceInputs {
  currentPrice: number;
  startingPrice: number;
  transfersIn: number;
  transfersOut: number;
  totalActiveManagers: number;
  ownershipPct: number;
  /** This player's fantasy points this week */
  weeklyPoints: number;
  /** Mean fantasy points this week across the player's position group */
  positionAvg: number;
  /** Std deviation of fantasy points this week across the position group */
  positionStdDev: number;
}

export interface WeeklyPriceResult {
  newPrice: number;
  delta: number;
  pricePressure: number;
}

/**
 * Computes one week's price movement for a single player.
 * Blends transfer demand (60%) with performance z-score (40%) — with a
 * full 17-week NFL season and a much larger potential manager base than a
 * college-only game, pure demand-based pricing (closer to how FPL itself
 * works) becomes more viable over time; keep the performance term for
 * launch while the userbase is still small.
 */
export function computeWeeklyPriceChange(
  inputs: WeeklyPriceInputs
): WeeklyPriceResult {
  const netTransferPct =
    inputs.totalActiveManagers > 0
      ? (inputs.transfersIn - inputs.transfersOut) / inputs.totalActiveManagers
      : 0;

  const rawZ =
    inputs.positionStdDev > 0
      ? (inputs.weeklyPoints - inputs.positionAvg) / inputs.positionStdDev
      : 0;
  // Squash z-score into roughly [-1, 1] so it's comparable in scale to netTransferPct.
  const normalizedZ = Math.max(-1, Math.min(1, rawZ / 3));

  const pricePressure = 0.6 * netTransferPct + 0.4 * normalizedZ;

  const tier = ownershipTier(inputs.ownershipPct);
  let delta = 0;
  if (pricePressure > RISE_THRESHOLDS[tier]) {
    delta = WEEKLY_STEP;
  } else if (pricePressure < FALL_THRESHOLDS[tier]) {
    delta = -WEEKLY_STEP;
  }

  delta = Math.max(-MAX_WEEKLY_MOVE, Math.min(MAX_WEEKLY_MOVE, delta));

  const floor = Math.max(PRICE_FLOOR, inputs.startingPrice * 0.5);
  let newPrice = Math.round((inputs.currentPrice + delta) * 10) / 10;
  newPrice = Math.min(PRICE_CEILING, Math.max(floor, newPrice));

  return {
    newPrice,
    delta: Math.round((newPrice - inputs.currentPrice) * 10) / 10,
    pricePressure: Math.round(pricePressure * 1000) / 1000,
  };
}
