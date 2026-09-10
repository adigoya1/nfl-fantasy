/**
 * Pure logic for the weekly free-transfer rollover, matching how real FPL
 * banks unused transfers: once a week is fully over, every team gets +1
 * free transfer for next week -- except a team that played FREE_HIT that
 * week, which skips the rollover (it already got unlimited free transfers
 * for the week, so also banking one would double-dip). Uncapped for now:
 * freeTransfers can keep stacking indefinitely if a manager never spends
 * them (real FPL caps the stockpile -- add a cap here if that's wanted
 * later).
 *
 * DB wiring lives in pages/api/week/[week]/score.ts, which already checks
 * "is this week over" for the Free Hit revert (lib/freeHit.ts) -- this
 * rides along with that same check. `lastTransferRolloverWeek` on
 * FantasyTeam guards against double-crediting a team no matter how many
 * times this endpoint gets re-polled after the week has already ended.
 */

export interface TeamRolloverInput {
  id: string;
  freeTransfers: number;
  lastTransferRolloverWeek: number | null;
  playedFreeHitThisWeek: boolean;
}

export interface RolloverPlan {
  fantasyTeamId: string;
  freeTransfers: number;
}

/**
 * Decides whether `week`'s rollover still needs to be applied to this team,
 * and what freeTransfers should become if so. Returns null if this team has
 * already been rolled over for `week` (or a later week), so callers can
 * safely re-run this every time the endpoint gets polled without
 * double-crediting anyone.
 */
export function planTransferRollover(team: TeamRolloverInput, week: number): RolloverPlan | null {
  if (team.lastTransferRolloverWeek !== null && team.lastTransferRolloverWeek >= week) {
    return null;
  }

  return {
    fantasyTeamId: team.id,
    freeTransfers: team.playedFreeHitThisWeek ? team.freeTransfers : team.freeTransfers + 1,
  };
}
