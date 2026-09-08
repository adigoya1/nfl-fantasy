/**
 * One-off diagnostic: dumps raw ESPN fields for a few well-known tight ends
 * so we can see exactly what defaultPositionId / eligibleSlots ESPN is
 * actually sending, since TEs are showing up mislabeled as WR.
 *
 * Run: npx tsx scripts/debug-position.ts
 */
const CURRENT_SEASON = 2026;
const ESPN_URL = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${CURRENT_SEASON}/segments/0/leaguedefaults/3?view=kona_player_info`;

const TARGET_NAMES = ["Travis Kelce", "George Kittle", "Trey McBride", "Sam LaPorta", "Brock Bowers", "Mark Andrews"];

function unwrapPlayer(entry: any): any {
  return entry?.player ?? entry;
}

async function main() {
  const filter = { players: { limit: 3000, sortDraftRanks: { sortPriority: 100, sortAsc: true, value: "PPR" } } };
  const res = await fetch(ESPN_URL, {
    headers: { Accept: "application/json", "x-fantasy-filter": JSON.stringify(filter) },
  });
  if (!res.ok) {
    throw new Error(`ESPN request failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  const rawEntries: any[] = Array.isArray(json) ? json : json?.players ?? [];
  console.log(`Fetched ${rawEntries.length} raw entries.\n`);

  for (const entry of rawEntries) {
    const player = unwrapPlayer(entry);
    const name = player?.fullName ?? `${player?.firstName ?? ""} ${player?.lastName ?? ""}`.trim();
    if (!TARGET_NAMES.some((t) => name.includes(t))) continue;

    console.log(`--- ${name} ---`);
    console.log("defaultPositionId:", player?.defaultPositionId);
    console.log("eligibleSlots:", player?.eligibleSlots);
    console.log("proTeamId:", player?.proTeamId);
    console.log("active:", player?.active);
    console.log(JSON.stringify(player, null, 2).slice(0, 1500));
    console.log();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
