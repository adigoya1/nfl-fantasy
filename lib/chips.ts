/**
 * Chip rules -- pure functions, no DB access, shared by the chips API route
 * and the My Team UI.
 *
 * Three chips, each usable exactly once per team for the whole season:
 *   - CAPTAIN: doubles one starter's points for a single chosen week.
 *     Without it, nobody gets a multiplier -- this replaces the earlier
 *     "always pick a captain every week" design.
 *   - BENCH_BOOST: all bench players also score, for a single week.
 *   - FREE_HIT: unlimited transfers with no point-hit, for a single
 *     week. Automatically reverts afterward -- see lib/freeHit.ts for
 *     the snapshot/restore logic (taken on activation in
 *     pages/api/fantasy-team/[id]/chips.ts, restored once the week's
 *     games all go FINAL in pages/api/week/[week]/score.ts). Not usable
 *     in Week 1 -- see MIN_FREE_HIT_WEEK below.
 *
 * Only one chip may be active for a team in any given week.
 */
import { Chip } from "@prisma/client";

export const ALL_CHIPS: Chip[] = [Chip.CAPTAIN, Chip.BENCH_BOOST, Chip.FREE_HIT];
export const CAPTAIN_MULTIPLIER = 2;

/**
 * Free Hit's whole point is to temporarily fix a squad that's already been
 * hurt by injuries, bye weeks, or bad early picks, since it reverts right
 * back afterward. In Week 1 your squad is as fresh as it'll ever be, so
 * spending the one-time-per-season chip there just to revert it a week
 * later has no upside -- block it until Week 2.
 */
export const MIN_FREE_HIT_WEEK = 2;

export interface ChipUsageRecord {
  chip: Chip;
  week: number;
}

export interface ChipValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Checks whether `chip` can be activated for `week`, given every chip
 * this team has already used (across all past weeks, including any
 * already recorded for this same week).
 */
export function canActivateChip(
  chip: Chip,
  week: number,
  alreadyUsed: ChipUsageRecord[]
): ChipValidationResult {
  if (chip === Chip.FREE_HIT && week < MIN_FREE_HIT_WEEK) {
    return { valid: false, error: `Free Hit can't be used until Week ${MIN_FREE_HIT_WEEK}.` };
  }
  if (alreadyUsed.some((u) => u.chip === chip)) {
    return { valid: false, error: `The ${chip} chip has already been used this season.` };
  }
  const conflicting = alreadyUsed.find((u) => u.week === week);
  if (conflicting) {
    return { valid: false, error: `${conflicting.chip} is already active for week ${week} -- only one chip per week.` };
  }
  return { valid: true };
}
