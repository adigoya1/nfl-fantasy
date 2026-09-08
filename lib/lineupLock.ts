/**
 * Pure logic for locking roster changes once the week's games have begun.
 *
 * The app doesn't snapshot lineups per week (see the leaderboard route's
 * "KNOWN SIMPLIFICATION" comment) -- RosterSlot.isStarter is just "the
 * current lineup". That means live scoring is always reading whatever the
 * roster looks like RIGHT NOW, so without a lock, a manager could watch the
 * early games, see who's doing well, and edit their lineup (or captain
 * pick) into the late games -- exactly what a real fantasy deadline exists
 * to prevent.
 *
 * "Current week" here means: the lowest-numbered loaded week that isn't
 * fully FINAL yet -- i.e. whichever week is presently being played, or is
 * next up. Once every loaded week is FINAL, nothing is locked (the next
 * week hasn't started yet, even if scripts/load-week-games.ts hasn't been
 * run for it). Locked as soon as that week's earliest kickoff has passed,
 * regardless of whether the week has finished.
 */

export interface GameLite {
  week: number;
  status: string; // "SCHEDULED" | "IN_PROGRESS" | "FINAL"
  kickoffAt: Date;
}

export interface LineupLockStatus {
  locked: boolean;
  week: number | null;
  firstKickoffAt: Date | null;
}

export function computeLineupLock(games: GameLite[], now: Date): LineupLockStatus {
  if (games.length === 0) {
    return { locked: false, week: null, firstKickoffAt: null };
  }

  const weeks = Array.from(new Set(games.map((g) => g.week))).sort((a, b) => a - b);

  for (const week of weeks) {
    const weekGames = games.filter((g) => g.week === week);
    const allFinal = weekGames.every((g) => g.status === "FINAL");
    if (allFinal) continue;

    const firstKickoffAt = weekGames.reduce(
      (earliest, g) => (g.kickoffAt < earliest ? g.kickoffAt : earliest),
      weekGames[0].kickoffAt
    );
    return { locked: now.getTime() >= firstKickoffAt.getTime(), week, firstKickoffAt };
  }

  // Every loaded week is FINAL -- the next week hasn't started (or hasn't
  // even been loaded), so there's nothing to lock against yet.
  return { locked: false, week: null, firstKickoffAt: null };
}
