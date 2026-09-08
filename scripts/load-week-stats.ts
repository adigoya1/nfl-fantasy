/**
 * Loads real per-player box score stats for a given week from ESPN's
 * PUBLIC site "summary" endpoint (site.api.espn.com) — the same box score
 * data ESPN.com's own game pages read from.
 *
 * IMPORTANT — why this endpoint and not the fantasy API: getting real
 * weekly per-player stats out of ESPN's *fantasy* API (the one
 * scripts/load-players.ts uses for preseason projections) turns out to
 * require a real league context (a numeric league id, sometimes auth
 * cookies too) — confirmed by reading the open-source espn-api library's
 * League.box_scores()/free_agents() methods, which all call endpoints
 * scoped to `leagues/{leagueId}`, unlike the "leaguedefaults" template
 * scripts/load-players.ts hits. The public site API used here needs no
 * league at all, so it's the more robust choice for this job.
 *
 * Run: npx tsx scripts/load-week-stats.ts <week>
 *   e.g. npx tsx scripts/load-week-stats.ts 1
 *
 * Run scripts/load-week-games.ts for the same week FIRST — this script
 * looks up Game rows (by week) to know which game each stat line belongs
 * to. Picks up both FINAL and IN_PROGRESS games, so re-running this (and
 * load-week-games.ts, to refresh scores/status) every few minutes during
 * game windows gives live, provisional stats — box score numbers just get
 * overwritten as they change until the game goes FINAL. Scheduled games
 * that haven't kicked off yet are skipped since there's nothing to fetch.
 *
 * KNOWN SIMPLIFICATIONS (documented, not silent):
 *   - Field goal distance isn't broken out by this box score endpoint (it
 *     only gives a single "M/A" made/attempted total), so every made FG is
 *     scored as the middle 40-49 yard tier (4 pts) rather than its real
 *     distance. Getting real per-kick distance would need play-by-play
 *     parsing, which is a reasonable follow-up but out of scope here.
 *   - 2-point conversions aren't in this box score view either and default
 *     to 0. They're rare enough that this is a minor, acceptable gap —
 *     use data/price-overrides.json-style manual correction if one comes
 *     up that actually matters for your league.
 *
 * UNVERIFIED CAVEAT: this endpoint's *shape* was confirmed against a real
 * completed 2025 game before writing this script, but as of writing this
 * (Aug 2026) the 2026 regular season hasn't started yet, so this exact
 * code has not been run against a real 2026 week. Run it against Week 1
 * as soon as those games go FINAL and sanity-check a few known players in
 * Prisma Studio before trusting it fully.
 */
import { PrismaClient, Position } from "@prisma/client";
import type { RawStatLine } from "../lib/scoring";
import { NFL_TEAMS } from "../lib/nflTeams";

const TEAM_ABBR_BY_NAME = new Map(NFL_TEAMS.map((t) => [t.name, t.abbr]));

const prisma = new PrismaClient();

function summaryUrl(espnEventId: string): string {
  return `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${espnEventId}`;
}

function emptyStatLine(): RawStatLine {
  return {
    passYds: 0,
    passTds: 0,
    interceptionsThrown: 0,
    rushYds: 0,
    rushTds: 0,
    receptions: 0,
    recYds: 0,
    recTds: 0,
    fumblesLost: 0,
    twoPtConversions: 0,
    fgMade0to39: 0,
    fgMade40to49: 0,
    fgMade50Plus: 0,
    fgMissed: 0,
    xpMade: 0,
    dstSacks: 0,
    dstInterceptions: 0,
    dstFumbleRecoveries: 0,
    dstDefensiveTds: 0,
    dstPointsAllowed: null,
  };
}

/** Pulls a "M/A" string ("2/3") apart into [made, attempted]. */
function parseMadeAttempted(value: string | undefined): [number, number] {
  if (!value) return [0, 0];
  const [made, attempted] = value.split("/").map((n) => Number(n) || 0);
  return [made ?? 0, attempted ?? made ?? 0];
}

/**
 * "sacksYardsLost" comes back as a dash-separated "sacks-yards" string
 * (e.g. "3-9" = 3 sacks for 9 yards) — a different format from the
 * slash-separated "made/attempted" fields above. Returns just the sack count.
 */
function parseSacksFromYardsLost(value: string | undefined): number {
  if (!value) return 0;
  const [sacks] = value.split("-").map((n) => Number(n) || 0);
  return sacks ?? 0;
}

/** Merges a positional stats[] array with a category's labels[] array. */
function statsByLabel(labels: string[], stats: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  labels.forEach((label, i) => {
    out[label] = stats[i] ?? "0";
  });
  return out;
}

interface ParsedGame {
  espnEventId: string;
  offensiveStats: Map<string, RawStatLine>; // keyed by athlete (ESPN player) id
  teamAggregates: Map<string, { sacksAllowed: number; interceptionsThrown: number; fumblesLost: number; ownDefensiveTds: number }>; // keyed by team abbreviation
}

async function fetchAndParseGame(espnEventId: string): Promise<ParsedGame> {
  const res = await fetch(summaryUrl(espnEventId));
  if (!res.ok) {
    throw new Error(`ESPN summary request failed for event ${espnEventId}: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();

  const offensiveStats = new Map<string, RawStatLine>();

  const playerGroups: any[] = json?.boxscore?.players ?? [];
  for (const group of playerGroups) {
    for (const category of group?.statistics ?? []) {
      const labels: string[] = category?.labels ?? [];
      for (const entry of category?.athletes ?? []) {
        const athleteId = String(entry?.athlete?.id ?? "");
        if (!athleteId) continue;
        const byLabel = statsByLabel(labels, entry?.stats ?? []);
        const line = offensiveStats.get(athleteId) ?? emptyStatLine();

        switch (category.name) {
          case "passing":
            line.passYds += Number(byLabel["YDS"] ?? 0);
            line.passTds += Number(byLabel["TD"] ?? 0);
            line.interceptionsThrown += Number(byLabel["INT"] ?? 0);
            break;
          case "rushing":
            line.rushYds += Number(byLabel["YDS"] ?? 0);
            line.rushTds += Number(byLabel["TD"] ?? 0);
            break;
          case "receiving":
            line.receptions += Number(byLabel["REC"] ?? 0);
            line.recYds += Number(byLabel["YDS"] ?? 0);
            line.recTds += Number(byLabel["TD"] ?? 0);
            break;
          case "fumbles":
            line.fumblesLost += Number(byLabel["LOST"] ?? 0);
            break;
          case "kicking": {
            const [fgMade, fgAttempted] = parseMadeAttempted(byLabel["FG"]);
            const [xpMade] = parseMadeAttempted(byLabel["XP"]);
            // Distance tier isn't available from this view — see file header.
            line.fgMade40to49 += fgMade;
            line.fgMissed += Math.max(0, fgAttempted - fgMade);
            line.xpMade += xpMade;
            break;
          }
          default:
            break; // punting, kick/punt returns, defensive (individual) -- not needed for our scoring model
        }

        offensiveStats.set(athleteId, line);
      }
    }
  }

  const teamAggregates = new Map<
    string,
    { sacksAllowed: number; interceptionsThrown: number; fumblesLost: number; ownDefensiveTds: number }
  >();
  const teamBlocks: any[] = json?.boxscore?.teams ?? [];
  for (const block of teamBlocks) {
    const abbr = block?.team?.abbreviation;
    if (!abbr) continue;
    const stats: any[] = block?.statistics ?? [];
    const byName = new Map(stats.map((s) => [s.name, s]));

    const sacksAllowed = parseSacksFromYardsLost(byName.get("sacksYardsLost")?.displayValue);
    const interceptionsThrown = Number(byName.get("interceptions")?.displayValue ?? 0);
    const fumblesLost = Number(byName.get("fumblesLost")?.displayValue ?? 0);
    const ownDefensiveTds = Number(byName.get("defensiveTouchdowns")?.displayValue ?? 0);

    teamAggregates.set(abbr, { sacksAllowed, interceptionsThrown, fumblesLost, ownDefensiveTds });
  }

  return { espnEventId, offensiveStats, teamAggregates };
}

async function main() {
  const week = Number(process.argv[2]);
  if (!Number.isInteger(week) || week < 1) {
    console.error("Usage: npx tsx scripts/load-week-stats.ts <week>");
    process.exit(1);
  }

  const games = await prisma.game.findMany({
    where: { week, status: { in: ["FINAL", "IN_PROGRESS"] } },
    include: { homeTeam: true, awayTeam: true },
  });

  if (games.length === 0) {
    console.log(
      `No FINAL or IN_PROGRESS games found for week ${week}. Run "npx tsx scripts/load-week-games.ts ${week}" ` +
        `first, and make sure those games have at least kicked off.`
    );
    return;
  }

  const inProgressCount = games.filter((g) => g.status === "IN_PROGRESS").length;
  console.log(
    `Found ${games.length} games for week ${week} (${inProgressCount} still IN_PROGRESS). Fetching box scores...`
  );
  if (inProgressCount > 0) {
    console.log(
      "  Note: stats for IN_PROGRESS games are live/provisional and will change — re-run this " +
        "(and load-week-games.ts, to refresh scores/status) periodically until those games go FINAL."
    );
  }

  const players = await prisma.player.findMany({ where: { active: true } });
  const playerByExternalId = new Map(players.filter((p) => p.externalId).map((p) => [p.externalId as string, p]));
  const defPlayerByTeamId = new Map(players.filter((p) => p.position === Position.DEF).map((p) => [p.teamId, p]));

  let matched = 0;
  let unmatched = 0;
  let written = 0;

  for (const game of games) {
    if (!game.espnEventId) {
      console.warn(`  Skipping game ${game.id} — no espnEventId (was it created before this feature existed?).`);
      continue;
    }

    const parsed = await fetchAndParseGame(game.espnEventId);

    // Offensive players + kickers.
    for (const [athleteId, line] of parsed.offensiveStats) {
      const player = playerByExternalId.get(athleteId);
      if (!player) {
        unmatched += 1;
        continue;
      }
      matched += 1;

      await prisma.playerGameStat.upsert({
        where: { playerId_gameId: { playerId: player.id, gameId: game.id } },
        update: { ...line },
        create: { playerId: player.id, gameId: game.id, ...line },
      });
      written += 1;
    }

    // Team D/ST units — one PlayerGameStat per team, built from the
    // opponent's offensive-allowed numbers (see file header for why: a
    // team's own defensive sacks/INTs/fumble recoveries show up in the box
    // score as the OPPONENT's "sacks allowed" / "interceptions thrown" /
    // "fumbles lost", while defensive TDs are already attributed to the
    // scoring team directly).
    const homeAbbr = TEAM_ABBR_BY_NAME.get(game.homeTeam.name);
    const awayAbbr = TEAM_ABBR_BY_NAME.get(game.awayTeam.name);
    const homeAgg = homeAbbr ? parsed.teamAggregates.get(homeAbbr) : undefined;
    const awayAgg = awayAbbr ? parsed.teamAggregates.get(awayAbbr) : undefined;

    const dstEntries: Array<{ teamId: string; own: typeof homeAgg; opponent: typeof awayAgg; opponentScore: number | null }> = [
      { teamId: game.homeTeamId, own: homeAgg, opponent: awayAgg, opponentScore: game.awayScore },
      { teamId: game.awayTeamId, own: awayAgg, opponent: homeAgg, opponentScore: game.homeScore },
    ];

    for (const { teamId, own, opponent, opponentScore } of dstEntries) {
      const defPlayer = defPlayerByTeamId.get(teamId);
      if (!defPlayer) continue;

      const line = emptyStatLine();
      line.dstSacks = opponent?.sacksAllowed ?? 0;
      line.dstInterceptions = opponent?.interceptionsThrown ?? 0;
      line.dstFumbleRecoveries = opponent?.fumblesLost ?? 0;
      line.dstDefensiveTds = own?.ownDefensiveTds ?? 0;
      line.dstPointsAllowed = opponentScore ?? 0;

      await prisma.playerGameStat.upsert({
        where: { playerId_gameId: { playerId: defPlayer.id, gameId: game.id } },
        update: { ...line },
        create: { playerId: defPlayer.id, gameId: game.id, ...line },
      });
      written += 1;
    }
  }

  console.log(`Done. Wrote/updated ${written} PlayerGameStat rows for week ${week}.`);
  console.log(`Matched ${matched} offensive/kicker athletes to existing players; ${unmatched} unmatched.`);
  if (matched + unmatched > 0 && unmatched / (matched + unmatched) > 0.3) {
    console.warn(
      "\n*** WARNING: more than 30% of athletes in these box scores didn't match any Player row. ***\n" +
        "This could mean ESPN's site-API athlete ids don't line up with the fantasy-API player ids\n" +
        "used in scripts/load-players.ts, or that load:players hasn't been run recently. Spot-check\n" +
        "a specific well-known player's id in both API responses before trusting these stats.\n"
    );
  }
  console.log(`Next: POST /api/week/${week}/score to turn these raw stats into fantasy points.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
