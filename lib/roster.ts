/**
 * Squad + lineup rules shared by the roster API routes and the My Team UI.
 * Pure functions, no DB access, so they're easy to unit test.
 *
 * NOTE ON A DESIGN DOC FIX: the original design doc listed starting slots as
 * QB1/RB2/WR3/TE1/FLEX1/K1/DEF1, which sums to 10 -- but the doc also says
 * "9 starters" for the squad. That's an arithmetic bug in the doc. The
 * number that actually makes the doc's own math work (and matches the
 * standard ESPN/Yahoo default lineup, which is QB1/RB2/WR2/TE1/FLEX1/K1/
 * DEF1 = 9) is 2 starting WRs, not 3. This file uses the corrected,
 * internally-consistent version.
 *
 * SQUAD SIZE: a 13-man squad (9 starters + 4 bench), tighter than FPL's own
 * 15/11/4 split since NFL rosters need less bench depth per fantasy
 * position than soccer does. Captaincy is also no longer a default weekly
 * 2x for whoever you designate -- it's the CAPTAIN chip (see lib/chips.ts),
 * usable once per season, alongside BENCH_BOOST and FREE_HIT. Most weeks,
 * nobody gets a multiplier at all.
 *
 * BUDGET: $85.0M, not $100M. When the squad shrank from 15 to 13 players
 * (dropping a bench RB and a bench WR), the old $100M cap against
 * POSITION_PRICE_RANGES (lib/pricing.ts) stopped meaning the same thing --
 * with 2 fewer players to buy, $100M covers ~76% of the way from the
 * cheapest possible squad to the most expensive one, versus ~54% under the
 * old 15-man squad. That's why an early demo squad could nearly max out
 * every position and "look too good": the cap wasn't actually scarce
 * anymore. $85.0M lands at ~52% against the new squad shape -- close enough
 * to the original ~54% scarcity to feel the same, and a rounder number than
 * the "exact" $86-87M an unrounded proportional scaling would give.
 * POSITION_PRICE_RANGES itself doesn't need to change -- those ranges price
 * a player's value relative to their own position, independent of how many
 * of that position you're allowed to roster.
 */
import { Position } from "@prisma/client";

export const SQUAD_BUDGET = 85.0;

/** Full 13-man squad composition, by position. */
export const SQUAD_REQUIREMENTS: Record<Position, number> = {
  QB: 2,
  RB: 3,
  WR: 4,
  TE: 2,
  K: 1,
  DEF: 1,
};

/** Fixed (non-FLEX) starting slots, by position. */
export const STARTER_REQUIREMENTS: Record<Position, number> = {
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
  K: 1,
  DEF: 1,
};

/** Positions eligible to fill the single FLEX starting slot. */
export const FLEX_ELIGIBLE: Position[] = [Position.RB, Position.WR, Position.TE];

export const FLEX_SLOTS = 1;

export const TOTAL_SQUAD_SIZE = Object.values(SQUAD_REQUIREMENTS).reduce((a, b) => a + b, 0); // 15
export const TOTAL_STARTERS = Object.values(STARTER_REQUIREMENTS).reduce((a, b) => a + b, 0) + FLEX_SLOTS; // 9

export interface RosterPlayer {
  id: string;
  position: Position;
  currentPrice: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Checks that a full squad (15 players) matches SQUAD_REQUIREMENTS exactly. */
export function validateSquadComposition(players: RosterPlayer[]): ValidationResult {
  const errors: string[] = [];

  if (players.length !== TOTAL_SQUAD_SIZE) {
    errors.push(`Squad must have exactly ${TOTAL_SQUAD_SIZE} players (got ${players.length}).`);
  }

  const countByPosition = countPositions(players);
  for (const position of Object.keys(SQUAD_REQUIREMENTS) as Position[]) {
    const required = SQUAD_REQUIREMENTS[position];
    const actual = countByPosition[position] ?? 0;
    if (actual !== required) {
      errors.push(`Squad needs exactly ${required} ${position}, got ${actual}.`);
    }
  }

  const totalCost = players.reduce((sum, p) => sum + p.currentPrice, 0);
  if (totalCost > SQUAD_BUDGET + 1e-9) {
    errors.push(`Squad costs $${totalCost.toFixed(1)}M, over the $${SQUAD_BUDGET.toFixed(1)}M cap.`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Checks that a proposed starting lineup (a subset of the full squad) is
 * legal: exactly the right number of starters at each fixed position, plus
 * exactly one FLEX-eligible player filling the FLEX slot, and nobody
 * double-counted between fixed slots and FLEX.
 */
export function validateLineup(squad: RosterPlayer[], starterIds: string[]): ValidationResult {
  const errors: string[] = [];
  const starterIdSet = new Set(starterIds);

  if (starterIdSet.size !== starterIds.length) {
    errors.push("Starter list contains duplicate players.");
  }
  if (starterIds.length !== TOTAL_STARTERS) {
    errors.push(`Lineup must have exactly ${TOTAL_STARTERS} starters (got ${starterIds.length}).`);
  }

  const squadById = new Map(squad.map((p) => [p.id, p]));
  const starters: RosterPlayer[] = [];
  for (const id of starterIds) {
    const player = squadById.get(id);
    if (!player) {
      errors.push(`Player ${id} isn't on this squad.`);
      continue;
    }
    starters.push(player);
  }

  // Greedily satisfy each position's fixed requirement first, then check
  // that exactly one FLEX-eligible leftover fills the FLEX slot.
  const remaining = [...starters];
  for (const position of Object.keys(STARTER_REQUIREMENTS) as Position[]) {
    const required = STARTER_REQUIREMENTS[position];
    const atPosition = remaining.filter((p) => p.position === position);
    if (atPosition.length < required) {
      errors.push(`Lineup needs at least ${required} starting ${position}, got ${atPosition.length}.`);
    }
    // Remove exactly `required` of them from the pool being considered for FLEX.
    let toRemove = required;
    for (let i = remaining.length - 1; i >= 0 && toRemove > 0; i--) {
      if (remaining[i].position === position) {
        remaining.splice(i, 1);
        toRemove -= 1;
      }
    }
  }

  const flexCandidates = remaining.filter((p) => FLEX_ELIGIBLE.includes(p.position));
  if (remaining.length !== FLEX_SLOTS || flexCandidates.length !== FLEX_SLOTS) {
    errors.push(
      `Lineup must fill the FLEX slot with exactly ${FLEX_SLOTS} extra RB/WR/TE beyond the fixed slots ` +
        `(found ${remaining.length} leftover starters, ${flexCandidates.length} of them FLEX-eligible).`
    );
  }

  return { valid: errors.length === 0, errors };
}

function countPositions(players: RosterPlayer[]): Partial<Record<Position, number>> {
  const counts: Partial<Record<Position, number>> = {};
  for (const p of players) {
    counts[p.position] = (counts[p.position] ?? 0) + 1;
  }
  return counts;
}
