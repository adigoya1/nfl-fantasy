import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";

/**
 * GET /api/week/[week]/player-scores
 *
 * Returns { week, points: { [playerId]: number } } for every player who has
 * a PlayerWeekScore row this week -- points = fantasyPoints + bonusPoints.
 * Deliberately NOT chip-aware (no captain doubling): that's a team-level
 * concern already reflected in /api/leaderboard/[week]'s totals. This
 * endpoint just answers "what did this player themselves score," which is
 * what a player card should show regardless of who's captain.
 *
 * Powers the live points shown on each PlayerCard in pages/my-team.tsx,
 * polled the same way fixturesByTeam is (every 30s while the page is open).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const week = Number(req.query.week);
  if (!Number.isInteger(week)) {
    return res.status(400).json({ error: "week must be an integer" });
  }

  const scores = await prisma.playerWeekScore.findMany({
    where: { week },
    select: { playerId: true, fantasyPoints: true, bonusPoints: true },
  });

  const points: Record<string, number> = {};
  for (const s of scores) {
    points[s.playerId] = s.fantasyPoints + s.bonusPoints;
  }

  return res.status(200).json({ week, points });
}
