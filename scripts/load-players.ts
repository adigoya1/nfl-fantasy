/**
 * Loads real NFL player data from ESPN's fantasy football API and generates
 * real preseason prices using the actual algorithm in lib/pricing.ts.
 *
 * No API key needed — unlike the college-football version of this app, ESPN's
 * fantasy player endpoint is public. Run:
 *   npm run load:players
 *
 * What it does:
 *   1. Fetches ESPN's full player pool for the season via the "leaguedefaults"
 *      endpoint (a generic PPR-scoring template ESPN exposes with no real
 *      league or login required) with the `x-fantasy-filter` header ESPN's
 *      own app uses to page through players.
 *   2. For each relevant player (QB/RB/WR/TE/K/D-ST), pulls their
 *      ESPN-projected season fantasy points (statSourceId 1, scoringPeriodId
 *      0 = full season) and their ESPN PPR draft rank.
 *   3. Maps their NFL team (ESPN's numeric proTeamId) to our Team rows.
 *   4. Normalizes projected points and draft rank within each position
 *      group, then calls computePreseasonPrice() from lib/pricing.ts.
 *   5. Applies any manual corrections from data/price-overrides.json (see
 *      that file for why this exists).
 *   6. Upserts Player rows (keyed by externalId) and a week-0
 *      PriceHistory row for each.
 *
 * IMPORTANT CAVEAT: this is an undocumented, reverse-engineered ESPN
 * endpoint (there is no official public API for this data) — widely used by
 * open-source fantasy tools, but ESPN can change its shape without notice.
 * This script checks how many players actually got a real projection and
 * prints a loud warning if that number looks wrong, so a silent breakage
 * doesn't quietly produce garbage prices. If you see that warning, the
 * response shape has probably changed and the parsing logic below (see
 * `extractProjectedPoints` and `extractDraftRank`) needs a look.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { PrismaClient, Position } from "@prisma/client";
import { computePreseasonPrice, normalize, POSITION_PRICE_RANGES, DEFAULT_PRICE_RANGE } from "../lib/pricing";
import { NFL_TEAMS, ESPN_PRO_TEAM_ID_MAP } from "../lib/nflTeams";

const CURRENT_SEASON = 2026;
const ESPN_URL = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${CURRENT_SEASON}/segments/0/leaguedefaults/3?view=kona_player_info`;

// ESPN's defaultPositionId -> our Position enum. Anything not listed here
// (OL/DL/LB/DB/P/HC/etc.) is skipped.
const ESPN_POSITION_MAP: Record<number, Position> = {
  0: Position.QB,
  2: Position.RB,
  4: Position.WR,
  6: Position.TE,
  16: Position.DEF, // D/ST
  17: Position.K,
};

const prisma = new PrismaClient();

async function fetchEspnPlayerPool(): Promise<any[]> {
  const filter = { players: { limit: 3000, sortDraftRanks: { sortPriority: 100, sortAsc: true, value: "PPR" } } };
  const res = await fetch(ESPN_URL, {
    headers: {
      Accept: "application/json",
      "x-fantasy-filter": JSON.stringify(filter),
    },
  });
  if (!res.ok) {
    throw new Error(`ESPN request failed: ${res.status} ${res.statusText}: ${await res.text()}`);
  }
  const json = await res.json();
  // Defensive: this endpoint is undocumented, so accept either a bare array
  // or a { players: [...] } wrapper depending on how ESPN shapes it today.
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.players)) return json.players;
  throw new Error("Unexpected ESPN response shape — no players array found.");
}

/**
 * ESPN entries are sometimes { player: {...} }, sometimes the player fields
 * are at the top level. Normalize to "the object with fullName/stats/etc."
 */
function unwrapPlayer(entry: any): any {
  return entry?.player ?? entry;
}

/** statSourceId 1 = projected, scoringPeriodId 0 = full-season total. */
function extractProjectedPoints(player: any): number {
  const stats: any[] = player?.stats ?? [];
  const seasonProjection = stats.find(
    (s) => s.seasonId === CURRENT_SEASON && s.scoringPeriodId === 0 && s.statSourceId === 1
  );
  return seasonProjection?.appliedTotal ?? 0;
}

function extractDraftRank(player: any): number | null {
  const ranks = player?.draftRanksByRankType;
  return ranks?.PPR?.rank ?? ranks?.STANDARD?.rank ?? null;
}

interface RawPlayerInputs {
  externalId: string;
  name: string;
  position: Position;
  teamAbbr: string | null;
  projectedPoints: number;
  draftRank: number | null;
}

/**
 * ESPN's `defaultPositionId` is unreliable for this endpoint — verified
 * against live data on 2026-08-31, every tight end (Kelce, Kittle, McBride,
 * LaPorta, Bowers, Andrews) comes back with defaultPositionId 4 (WR), even
 * though `eligibleSlots` correctly includes 6 (TE). The open-source
 * `espn-api` library hits the same issue and works around it by deriving
 * position from `eligibleSlots` instead — we do the same here: scan
 * eligibleSlots in order and take the first entry that's one of our known
 * single (non-flex) positions.
 */
function resolvePosition(player: any): Position | undefined {
  const eligibleSlots: number[] = player?.eligibleSlots ?? [];
  for (const slot of eligibleSlots) {
    const position = ESPN_POSITION_MAP[slot];
    if (position !== undefined) return position;
  }
  // Fallback for the unlikely case eligibleSlots is missing/empty.
  return ESPN_POSITION_MAP[player?.defaultPositionId];
}

function parsePlayerPool(rawEntries: any[]): RawPlayerInputs[] {
  const results: RawPlayerInputs[] = [];
  for (const entry of rawEntries) {
    const player = unwrapPlayer(entry);
    const position = resolvePosition(player);
    if (position === undefined) continue;
    if (player?.active === false) continue;

    const id = player?.id ?? entry?.id;
    const name = player?.fullName ?? `${player?.firstName ?? ""} ${player?.lastName ?? ""}`.trim();
    if (!id || !name) continue;

    const teamAbbr = ESPN_PRO_TEAM_ID_MAP[player?.proTeamId] ?? null;

    results.push({
      externalId: String(id),
      name,
      position,
      teamAbbr,
      projectedPoints: extractProjectedPoints(player),
      draftRank: extractDraftRank(player),
    });
  }
  return results;
}

function normalizeGroup(players: RawPlayerInputs[]) {
  const byPosition = new Map<Position, RawPlayerInputs[]>();
  for (const p of players) {
    const list = byPosition.get(p.position) ?? [];
    list.push(p);
    byPosition.set(p.position, list);
  }

  const priced: Array<RawPlayerInputs & { price: number }> = [];
  for (const [, group] of byPosition) {
    const points = group.map((g) => g.projectedPoints);
    const pointsMin = Math.min(...points);
    const pointsMax = Math.max(...points);

    const ranked = group.filter((g) => g.draftRank !== null);
    const ranks = ranked.map((g) => g.draftRank as number);
    const rankMin = ranks.length ? Math.min(...ranks) : 0;
    const rankMax = ranks.length ? Math.max(...ranks) : 0;

    const range = POSITION_PRICE_RANGES[group[0].position] ?? DEFAULT_PRICE_RANGE;

    for (const g of group) {
      const normalizedProjectedPoints = normalize(g.projectedPoints, pointsMin, pointsMax);
      // Lower rank number = better, so invert after normalizing.
      const normalizedDraftRank =
        g.draftRank !== null ? 1 - normalize(g.draftRank, rankMin, rankMax) : null;

      const price = computePreseasonPrice(
        { normalizedProjectedPoints, normalizedDraftRank },
        range
      );
      priced.push({ ...g, price });
    }
  }
  return priced;
}

interface PriceOverride {
  name: string;
  team: string;
  price: number;
  reason?: string;
}

/**
 * Manual corrections for cases even a real projection can't capture yet —
 * breaking injury/trade news after ESPN's projection ran, a preseason depth
 * chart surprise, etc. See data/price-overrides.json.
 */
function loadOverrides(): PriceOverride[] {
  const overridesPath = path.resolve(process.cwd(), "data/price-overrides.json");
  if (!existsSync(overridesPath)) return [];
  try {
    return JSON.parse(readFileSync(overridesPath, "utf-8"));
  } catch (err) {
    console.warn(`Couldn't parse data/price-overrides.json (${(err as Error).message}) — ignoring it.`);
    return [];
  }
}

function applyOverrides<T extends { name: string; teamAbbr: string | null; price: number }>(
  priced: T[],
  overrides: PriceOverride[],
  teamNameByAbbr: Map<string, string>
): T[] {
  if (overrides.length === 0) return priced;

  const key = (name: string, team: string) => `${name.toLowerCase().trim()}|${team.toLowerCase().trim()}`;
  const overrideByKey = new Map(overrides.map((o) => [key(o.name, o.team), o]));

  let applied = 0;
  const result = priced.map((p) => {
    const teamName = p.teamAbbr ? teamNameByAbbr.get(p.teamAbbr) ?? p.teamAbbr : "";
    const override = overrideByKey.get(key(p.name, teamName));
    if (!override) return p;
    applied += 1;
    console.log(
      `  Override: ${p.name} (${teamName}) $${p.price}M -> $${override.price}M` +
        (override.reason ? ` (${override.reason})` : "")
    );
    return { ...p, price: override.price };
  });

  console.log(`Applied ${applied}/${overrides.length} price overrides.`);
  return result;
}

async function main() {
  console.log("Fetching ESPN's full player pool (no API key needed)...");
  const rawEntries = await fetchEspnPlayerPool();
  console.log(`Fetched ${rawEntries.length} raw entries from ESPN.`);

  const players = parsePlayerPool(rawEntries);
  console.log(`Parsed ${players.length} relevant (QB/RB/WR/TE/K/D-ST) players.`);

  const withProjection = players.filter((p) => p.projectedPoints > 0).length;
  const projectionRate = players.length > 0 ? withProjection / players.length : 0;
  console.log(`${withProjection}/${players.length} (${Math.round(projectionRate * 100)}%) have a nonzero projection.`);
  if (projectionRate < 0.3) {
    console.warn(
      "\n*** WARNING: fewer than 30% of players have a projection. ***\n" +
        "ESPN's response shape may have changed — check extractProjectedPoints()\n" +
        "in this file against a fresh look at the API response before trusting\n" +
        "the prices this run produces.\n"
    );
  }

  const priced = normalizeGroup(players);

  const teamNameByAbbr = new Map(NFL_TEAMS.map((t) => [t.abbr, t.name]));
  const overridden = applyOverrides(priced, loadOverrides(), teamNameByAbbr);

  console.log(`Computed preseason prices for ${overridden.length} players. Writing to DB...`);

  const teams = await prisma.team.findMany();
  const teamIdByName = new Map(teams.map((t) => [t.name, t.id]));

  let written = 0;
  let skippedNoTeam = 0;
  for (const p of overridden) {
    const teamName = p.teamAbbr ? teamNameByAbbr.get(p.teamAbbr) : undefined;
    const teamId = teamName ? teamIdByName.get(teamName) : undefined;
    if (!teamId) {
      skippedNoTeam += 1;
      continue; // free agents / practice squad players with no active NFL team
    }

    const player = await prisma.player.upsert({
      where: { externalId: p.externalId },
      update: { name: p.name, position: p.position, teamId, currentPrice: p.price },
      create: {
        externalId: p.externalId,
        name: p.name,
        position: p.position,
        teamId,
        currentPrice: p.price,
      },
    });

    await prisma.priceHistory.upsert({
      where: { playerId_week: { playerId: player.id, week: 0 } },
      update: { price: p.price, delta: 0 },
      create: { playerId: player.id, week: 0, price: p.price, delta: 0 },
    });

    written += 1;
  }

  console.log(`Done. Wrote/updated ${written} players with real preseason prices.`);
  if (skippedNoTeam > 0) {
    console.log(`Skipped ${skippedNoTeam} players with no active NFL team (free agents, practice squad, etc.).`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
