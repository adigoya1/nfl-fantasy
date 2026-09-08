/**
 * Leaderboard helpers — section 5 of the design doc.
 * These operate on already-fetched arrays so they're trivial to unit test;
 * the Prisma queries that produce the arrays live in the API routes.
 */

export interface FantasyTeamWeekTotal {
  fantasyTeamId: string;
  fantasyTeamName: string;
  weekPoints: number;
  seasonPointsBeforeThisWeek: number;
}

export interface LeaderboardRow {
  fantasyTeamId: string;
  fantasyTeamName: string;
  weekPoints: number;
  seasonPoints: number;
  weekRank: number;
  overallRank: number;
}

export function buildLeaderboard(
  totals: FantasyTeamWeekTotal[]
): LeaderboardRow[] {
  const withSeasonTotals = totals.map((t) => ({
    ...t,
    seasonPoints: t.seasonPointsBeforeThisWeek + t.weekPoints,
  }));

  const byWeek = [...withSeasonTotals].sort(
    (a, b) => b.weekPoints - a.weekPoints
  );
  const byOverall = [...withSeasonTotals].sort(
    (a, b) => b.seasonPoints - a.seasonPoints
  );

  const weekRankById = new Map<string, number>();
  byWeek.forEach((row, i) => weekRankById.set(row.fantasyTeamId, i + 1));

  const overallRankById = new Map<string, number>();
  byOverall.forEach((row, i) => overallRankById.set(row.fantasyTeamId, i + 1));

  return withSeasonTotals.map((row) => ({
    fantasyTeamId: row.fantasyTeamId,
    fantasyTeamName: row.fantasyTeamName,
    weekPoints: row.weekPoints,
    seasonPoints: row.seasonPoints,
    weekRank: weekRankById.get(row.fantasyTeamId)!,
    overallRank: overallRankById.get(row.fantasyTeamId)!,
  }));
}
