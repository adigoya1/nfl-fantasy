/**
 * One-off diagnostic: prints projected points + draft rank for a handful of
 * well-known QBs, to check whether ESPN's preseason projection data is
 * actually populated for the "obviously good" QBs, or whether some of them
 * are silently coming back with a zero projection this early in preseason.
 *
 * Run: npx tsx scripts/debug-qb.ts
 */
const CURRENT_SEASON = 2026;
const ESPN_URL = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${CURRENT_SEASON}/segments/0/leaguedefaults/3?view=kona_player_info`;

const TARGET_NAMES = [
  "Josh Allen", "Lamar Jackson", "Joe Burrow", "Drake Maye", "Jayden Daniels",
  "Patrick Mahomes", "Jalen Hurts", "Kyler Murray", "Justin Herbert", "Jared Goff",
];

function unwrapPlayer(entry: any): any {
  return entry?.player ?? entry;
}

function extractProjectedPoints(player: any): number {
  const stats: any[] = player?.stats ?? [];
  const seasonProjection = stats.find(
    (s: any) => s.seasonId === CURRENT_SEASON && s.scoringPeriodId === 0 && s.statSourceId === 1
  );
  return seasonProjection?.appliedTotal ?? 0;
}

function extractDraftRank(player: any): number | null {
  const ranks = player?.draftRanksByRankType;
  return ranks?.PPR?.rank ?? ranks?.STANDARD?.rank ?? null;
}

async function main() {
  const filter = { players: { limit: 3000, sortDraftRanks: { sortPriority: 100, sortAsc: true, value: "PPR" } } };
  const res = await fetch(ESPN_URL, {
    headers: { Accept: "application/json", "x-fantasy-filter": JSON.stringify(filter) },
  });
  if (!res.ok) throw new Error(`ESPN request failed: ${res.status} ${res.statusText}`);
  const json = await res.json();
  const rawEntries: any[] = Array.isArray(json) ? json : json?.players ?? [];

  console.log(`Fetched ${rawEntries.length} raw entries.\n`);
  console.log(`Name                  | defaultPositionId | eligibleSlots (first 3) | projectedPoints | draftRank | statSourceIds present`);
  console.log("-".repeat(110));

  for (const entry of rawEntries) {
    const player = unwrapPlayer(entry);
    const name = player?.fullName ?? `${player?.firstName ?? ""} ${player?.lastName ?? ""}`.trim();
    if (!TARGET_NAMES.some((t) => name.includes(t))) continue;

    const stats: any[] = player?.stats ?? [];
    const sourceIds = [...new Set(stats.map((s: any) => `src${s.statSourceId}/period${s.scoringPeriodId}`))].join(", ");

    console.log(
      `${name.padEnd(21)} | ${String(player?.defaultPositionId).padEnd(18)} | ${JSON.stringify((player?.eligibleSlots ?? []).slice(0, 3)).padEnd(23)} | ${String(extractProjectedPoints(player)).padEnd(15)} | ${String(extractDraftRank(player)).padEnd(9)} | ${sourceIds}`
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
