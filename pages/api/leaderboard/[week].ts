import type { NextApiRequest, NextApiResponse } from "next";
import { Chip } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { buildLeaderboard, FantasyTeamWeekTotal } from "../../../lib/rankings";
import { CAPTAIN_MULTIPLIER } from "../../../lib/chips";

/**
 * GET /api/leaderboard/[week]
 * Returns overall + week ranks for every fantasy team (design doc section 5).
 * In production, cache this response in Redis and only recompute after a
 * scoring/price job finishes — see design doc 7.1.
 *
 * Chip-aware scoring: a player only gets CAPTAIN_MULTIPLIER applied for a
 * given week if that team actually played its CAPTAIN chip that week
 * (naming that exact player) — most weeks nobody gets a multiplier at all.
 * Bench players only count toward a week's total if BENCH_BOOST was played
 * that week. Both current and past weeks are chip-aware, since ChipUsage
 * rows are permanent per-week records.
 *
 * KNOWN SIMPLIFICATION: "isStarter" on RosterSlot is the team's *current*
 * lineup, not a per-week historical snapshot — so past weeks' totals
 * assume the roster's current starter/bench split applied back then too.
 * This was already true before chips existed; a real historical lineup
 * snapshot per week is a good next step if managers change their
 * lineup meaningfully often.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const week = Number(req.query.week);
  if (!Number.isInteger(week)) {
    return res.status(400).json({ error: "week must be an integer" });
  }

  const teams = await prisma.fantasyTeam.findMany({
    include: {
      rosterSlots: { include: { player: { include: { weekScores: true } } } },
      chipUsages: true,
    },
  });

  const totals: FantasyTeamWeekTotal[] = teams.map((team) => {
    let weekPoints = 0;
    let seasonPointsBeforeThisWeek = 0;

    const benchBoostWeeks = new Set(
      team.chipUsages.filter((u) => u.chip === Chip.BENCH_BOOST).map((u) => u.week)
    );
    const captainByWeek = new Map(
      team.chipUsages.filter((u) => u.chip === Chip.CAPTAIN).map((u) => [u.week, u.captainPlayerId])
    );

    for (const slot of team.rosterSlots) {
      for (const score of slot.player.weekScores) {
        const isThisWeek = score.week === week;
        const isPastWeek = score.week < week;
        if (!isThisWeek && !isPastWeek) continue;

        const benchBoosted = benchBoostWeeks.has(score.week);
        if (!slot.isStarter && !benchBoosted) continue; // bench only counts on a Bench Boost week

        const captainThisWeek = captainByWeek.get(score.week);
        const multiplier = captainThisWeek === slot.playerId ? CAPTAIN_MULTIPLIER : 1;

        const total = (score.fantasyPoints + score.bonusPoints) * multiplier;
        if (isThisWeek) {
          weekPoints += total;
        } else {
          seasonPointsBeforeThisWeek += total;
        }
      }
    }

    return {
      fantasyTeamId: team.id,
      fantasyTeamName: team.name,
      weekPoints,
      seasonPointsBeforeThisWeek,
    };
  });

  return res.status(200).json(buildLeaderboard(totals));
}
