/**
 * Loads real NFL game schedule + scores for a given week from ESPN's
 * PUBLIC site scoreboard endpoint (site.api.espn.com) — the same data
 * ESPN.com's own scoreboard page reads from. Unlike the internal fantasy
 * "leaguedefaults" endpoint scripts/load-players.ts uses, this one needs
 * no league context at all, so it's low-risk and easy to verify (its shape
 * was confirmed directly against a real completed 2025 game before this
 * script was written).
 *
 * Run: npx tsx scripts/load-week-games.ts <week>
 *   e.g. npx tsx scripts/load-week-games.ts 1
 *
 * Run this BEFORE scripts/load-week-stats.ts — that script needs the Game
 * rows this one creates in order to know which game each player's stat
 * line belongs to.
 */
import { PrismaClient } from "@prisma/client";
import { NFL_TEAMS } from "../lib/nflTeams";

const prisma = new PrismaClient();

// The season these Weeks belong to. Update this once the 2027 season
// rolls around.
const SEASON = 2026;

function scoreboardUrl(week: number): string {
  return `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=${week}&seasontype=2&year=${SEASON}`;
}

async function fetchWeekEvents(week: number): Promise<any[]> {
  const res = await fetch(scoreboardUrl(week));
  if (!res.ok) {
    throw new Error(`ESPN scoreboard request failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  return json?.events ?? [];
}

function mapStatus(statusType: any): "SCHEDULED" | "IN_PROGRESS" | "FINAL" {
  if (statusType?.completed) return "FINAL";
  if (statusType?.state === "in") return "IN_PROGRESS";
  return "SCHEDULED";
}

/**
 * ESPN only includes a `situation` object on a competition while it's live
 * (IN_PROGRESS) -- it disappears once the game goes FINAL and never
 * appears before kickoff. `situation.possession` is the ball-carrying
 * team's id, which lines up with `competitor.team.id` (not the outer
 * `competitor.id`, which is a different ESPN identifier), so resolve it by
 * comparing against the home/away team ids we already looked up.
 */
function readSituation(
  competition: any,
  home: any,
  away: any,
  homeTeamId: string,
  awayTeamId: string
): { isRedZone: boolean; possessionTeamId: string | null } {
  const situation = competition?.situation;
  if (!situation) return { isRedZone: false, possessionTeamId: null };

  const possessionEspnTeamId = situation.possession ? String(situation.possession) : null;
  let possessionTeamId: string | null = null;
  if (possessionEspnTeamId && String(home?.team?.id) === possessionEspnTeamId) {
    possessionTeamId = homeTeamId;
  } else if (possessionEspnTeamId && String(away?.team?.id) === possessionEspnTeamId) {
    possessionTeamId = awayTeamId;
  }

  return { isRedZone: Boolean(situation.isRedZone), possessionTeamId };
}

async function main() {
  const week = Number(process.argv[2]);
  if (!Number.isInteger(week) || week < 1) {
    console.error("Usage: npx tsx scripts/load-week-games.ts <week>");
    process.exit(1);
  }

  console.log(`Fetching ESPN scoreboard for ${SEASON} week ${week}...`);
  const events = await fetchWeekEvents(week);
  console.log(`Fetched ${events.length} games.`);

  const teams = await prisma.team.findMany();
  const teamNameByAbbr = new Map(NFL_TEAMS.map((t) => [t.abbr, t.name]));
  const teamIdByName = new Map(teams.map((t) => [t.name, t.id]));

  let written = 0;
  let skipped = 0;

  for (const event of events) {
    const competition = event?.competitions?.[0];
    const competitors: any[] = competition?.competitors ?? [];
    const home = competitors.find((c) => c.homeAway === "home");
    const away = competitors.find((c) => c.homeAway === "away");

    const homeAbbr = home?.team?.abbreviation;
    const awayAbbr = away?.team?.abbreviation;
    const homeTeamId = homeAbbr ? teamIdByName.get(teamNameByAbbr.get(homeAbbr) ?? "") : undefined;
    const awayTeamId = awayAbbr ? teamIdByName.get(teamNameByAbbr.get(awayAbbr) ?? "") : undefined;

    if (!homeTeamId || !awayTeamId) {
      console.warn(
        `  Skipping "${event?.shortName ?? event?.id}" — couldn't resolve team(s) ` +
          `(home=${homeAbbr}, away=${awayAbbr}). Check nflTeams.ts abbreviations against ESPN's.`
      );
      skipped += 1;
      continue;
    }

    const statusType = competition?.status?.type;
    const status = mapStatus(statusType);
    const homeScore = status === "SCHEDULED" ? null : Number(home.score ?? 0);
    const awayScore = status === "SCHEDULED" ? null : Number(away.score ?? 0);
    // Only IN_PROGRESS games carry a real situation -- explicitly clearing
    // it otherwise means a game doesn't stay stuck "in the red zone" after
    // it goes FINAL (ESPN just stops sending the field, it doesn't zero it).
    const { isRedZone, possessionTeamId } =
      status === "IN_PROGRESS"
        ? readSituation(competition, home, away, homeTeamId, awayTeamId)
        : { isRedZone: false, possessionTeamId: null };

    await prisma.game.upsert({
      where: { espnEventId: String(event.id) },
      update: {
        week,
        homeTeamId,
        awayTeamId,
        kickoffAt: new Date(event.date),
        status,
        homeScore,
        awayScore,
        isRedZone,
        possessionTeamId,
      },
      create: {
        espnEventId: String(event.id),
        week,
        homeTeamId,
        awayTeamId,
        kickoffAt: new Date(event.date),
        status,
        homeScore,
        awayScore,
        isRedZone,
        possessionTeamId,
      },
    });

    written += 1;
  }

  console.log(`Done. Wrote/updated ${written} games for week ${week}. Skipped ${skipped}.`);
  console.log(
    `Next: run "npx tsx scripts/load-week-stats.ts ${week}" — it picks up both FINAL and IN_PROGRESS ` +
      `games, so re-running both scripts every few minutes during game windows keeps stats live.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
