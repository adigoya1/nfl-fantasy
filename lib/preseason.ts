/**
 * Pure logic for the preseason transfer window: before the season's very
 * first game has actually kicked off, there's no real squad performance to
 * protect yet, so charging a -4 point-hit or burning a season-long free
 * transfer just for building your Week 1 squad doesn't make sense. This
 * mirrors real FPL, where transfers are unlimited and free right up until
 * your first gameweek deadline.
 *
 * Only ever applies to Week 1. Once Week 1's opener kicks off, the normal
 * free-transfer economy (lib logic in pages/api/fantasy-team/[id]/transfers.ts)
 * takes over for the rest of Week 1 and every week after -- there's no
 * equivalent "preseason" window for any other week.
 */
export function isPreseasonTransferWindow(
  week: number,
  now: Date,
  earliestWeek1Kickoff: Date | null
): boolean {
  if (week !== 1) return false;
  // Week 1's schedule hasn't even been loaded yet (scripts/load-week-games.ts
  // hasn't run for week 1) -- there's certainly no game to have kicked off,
  // so this is unambiguously still preseason.
  if (!earliestWeek1Kickoff) return true;
  return now.getTime() < earliestWeek1Kickoff.getTime();
}
