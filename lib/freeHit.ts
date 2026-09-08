/**
 * Pure logic for Free Hit's auto-revert behavior. The DB wiring lives in
 * pages/api/fantasy-team/[id]/chips.ts (takes the snapshot when Free Hit is
 * activated) and pages/api/week/[week]/score.ts (restores it once that
 * week's games are all FINAL). Kept here, pure, so both call sites share
 * the exact same "is this week actually over" and "what does a snapshot
 * round-trip into" logic instead of re-deriving it twice.
 */

export interface RosterSlotLike {
  playerId: string;
  isStarter: boolean;
  benchOrder: number | null;
}

/**
 * Shapes a team's current roster into the exact JSON this gets stored as on
 * FreeHitSnapshot.roster. Trivial today, but centralizing it means a future
 * field added to RosterSlot doesn't silently leak into (or out of) the
 * snapshot without a deliberate decision.
 */
export function buildRosterSnapshot(rosterSlots: RosterSlotLike[]): RosterSlotLike[] {
  return rosterSlots.map((s) => ({
    playerId: s.playerId,
    isStarter: s.isStarter,
    benchOrder: s.benchOrder,
  }));
}

/**
 * A week counts as "over" for auto-revert purposes once every game
 * scheduled for it has gone FINAL. Deliberately requires at least one game
 * and checks ALL of that week's games (not just ones a player happens to be
 * on) -- checking only games with stats loaded so far (as the scoring
 * endpoint's own `provisional` flag does) would revert prematurely if
 * scripts/load-week-games.ts hasn't been run for the full week yet, since
 * games that haven't been loaded at all look identical to "no games left."
 */
export function isWeekFullyFinal(gameStatuses: string[]): boolean {
  return gameStatuses.length > 0 && gameStatuses.every((status) => status === "FINAL");
}

export interface FreeHitSnapshotLike {
  id: string;
  fantasyTeamId: string;
  budgetRemaining: number;
  freeTransfers: number;
  roster: RosterSlotLike[];
}

export interface RevertPlan {
  fantasyTeamId: string;
  snapshotId: string;
  budgetRemaining: number;
  freeTransfers: number;
  roster: RosterSlotLike[];
}

/**
 * Turns a stored snapshot back into the plain data the revert job needs to
 * write: replace the team's RosterSlot rows with `roster`, and reset
 * budgetRemaining/freeTransfers on FantasyTeam. Separated from the Prisma
 * calls themselves so this mapping is unit-testable without a database.
 */
export function planRevert(snapshot: FreeHitSnapshotLike): RevertPlan {
  return {
    fantasyTeamId: snapshot.fantasyTeamId,
    snapshotId: snapshot.id,
    budgetRemaining: snapshot.budgetRemaining,
    freeTransfers: snapshot.freeTransfers,
    roster: snapshot.roster,
  };
}
