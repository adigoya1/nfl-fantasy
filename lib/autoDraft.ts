/**
 * Shared auto-draft logic: builds a valid, budget-respecting squad and a
 * legal starting lineup from a pool of players, with no human input needed.
 *
 * Originally lived only in scripts/seed-demo-team.ts (for the one CLI-made
 * demo team); pulled out here so pages/api/fantasy-team/index.ts (the
 * self-serve "Create Your Team" flow) can build a real starting squad for
 * every new manager the same way, without a real draft UI. Since preseason
 * transfers are unlimited and free (lib/preseason.ts), a manager can freely
 * reshape whatever this hands them before Week 1's opener kicks off -- this
 * auto-draft is a starting point, not a final answer.
 */
import { Position } from "@prisma/client";
import {
  SQUAD_REQUIREMENTS,
  SQUAD_BUDGET,
  STARTER_REQUIREMENTS,
  FLEX_ELIGIBLE,
} from "./roster";

export interface DraftPlayer {
  id: string;
  position: Position;
  currentPrice: number;
}

/**
 * Drafts a valid, budget-respecting squad: start with the cheapest legal
 * player at each position (guarantees fitting under the cap), then greedily
 * upgrade individual slots to pricier players at the same position while
 * budget allows, so the squad isn't just bargain-bin players.
 */
export function draftSquad(pool: DraftPlayer[]): DraftPlayer[] {
  const byPosition = new Map<Position, DraftPlayer[]>();
  for (const position of Object.keys(SQUAD_REQUIREMENTS) as Position[]) {
    const candidates = pool
      .filter((p) => p.position === position)
      .sort((a, b) => a.currentPrice - b.currentPrice);
    if (candidates.length < SQUAD_REQUIREMENTS[position]) {
      throw new Error(
        `Not enough ${position} players loaded (need ${SQUAD_REQUIREMENTS[position]}, found ${candidates.length}). ` +
          `Run "npm run load:players" first.`
      );
    }
    byPosition.set(position, candidates);
  }

  // Pass 1: cheapest N per position.
  const squad: DraftPlayer[] = [];
  const usedByPosition = new Map<Position, DraftPlayer[]>();
  for (const position of Object.keys(SQUAD_REQUIREMENTS) as Position[]) {
    const cheapest = byPosition.get(position)!.slice(0, SQUAD_REQUIREMENTS[position]);
    squad.push(...cheapest);
    usedByPosition.set(position, cheapest);
  }

  // Pass 2: greedily upgrade to pricier players at the same position while
  // there's budget left, so the squad isn't uniformly bottom-of-the-barrel.
  let spent = squad.reduce((sum, p) => sum + p.currentPrice, 0);
  let upgraded = true;
  while (upgraded) {
    upgraded = false;
    for (const position of Object.keys(SQUAD_REQUIREMENTS) as Position[]) {
      const used = usedByPosition.get(position)!;
      const all = byPosition.get(position)!;
      const usedIds = new Set(used.map((p) => p.id));
      const nextBest = all.filter((p) => !usedIds.has(p.id)).sort((a, b) => b.currentPrice - a.currentPrice)[0];
      if (!nextBest) continue;

      // Try swapping in `nextBest` for the cheapest currently-used player at
      // this position that it would actually be an upgrade over.
      const cheapestUsed = [...used].sort((a, b) => a.currentPrice - b.currentPrice)[0];
      const delta = nextBest.currentPrice - cheapestUsed.currentPrice;
      if (delta > 0 && spent + delta <= SQUAD_BUDGET + 1e-9) {
        const idx = used.findIndex((p) => p.id === cheapestUsed.id);
        used[idx] = nextBest;
        const squadIdx = squad.findIndex((p) => p.id === cheapestUsed.id);
        squad[squadIdx] = nextBest;
        spent += delta;
        upgraded = true;
      }
    }
  }

  return squad;
}

/**
 * Picks a legal starting lineup (fixed slots + 1 FLEX) from a valid squad,
 * favoring the priciest players. No captain is picked here -- captaincy is
 * the CAPTAIN chip (see lib/chips.ts), activated separately.
 */
export function pickStarters(squad: DraftPlayer[]): { starterIds: string[] } {
  const starters: DraftPlayer[] = [];
  const remaining = [...squad];

  for (const position of Object.keys(STARTER_REQUIREMENTS) as Position[]) {
    const atPosition = remaining
      .filter((p) => p.position === position)
      .sort((a, b) => b.currentPrice - a.currentPrice)
      .slice(0, STARTER_REQUIREMENTS[position]);
    starters.push(...atPosition);
    for (const chosen of atPosition) {
      const idx = remaining.findIndex((p) => p.id === chosen.id);
      remaining.splice(idx, 1);
    }
  }

  const flexPick = remaining
    .filter((p) => FLEX_ELIGIBLE.includes(p.position))
    .sort((a, b) => b.currentPrice - a.currentPrice)[0];
  starters.push(flexPick);

  return { starterIds: starters.map((p) => p.id) };
}

export interface AutoDraftResult {
  squad: DraftPlayer[];
  starterIds: string[];
  totalCost: number;
  budgetRemaining: number;
}

/** Runs the full auto-draft: squad + starting lineup + budget math, in one call. */
export function autoDraftTeam(pool: DraftPlayer[]): AutoDraftResult {
  const squad = draftSquad(pool);
  const { starterIds } = pickStarters(squad);
  const totalCost = squad.reduce((sum, p) => sum + p.currentPrice, 0);
  const budgetRemaining = Math.round((SQUAD_BUDGET - totalCost) * 10) / 10;
  return { squad, starterIds, totalCost, budgetRemaining };
}
