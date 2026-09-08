import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";

/**
 * GET /api/games/[week]
 *
 * Returns that week's NFL schedule (see scripts/load-week-games.ts for how
 * it's populated), keyed by team name on each side so the client can look up
 * "who does my player's team play this week" without a second round trip.
 * Used by the My Team page to show each starter/bench player's opponent
 * instead of their price, and to drive the live/red-zone badges: `status`
 * tells the client whether a game is live, and `possessionTeam` +
 * `isRedZone` (both only meaningful while status is IN_PROGRESS) say which
 * team currently has the ball and whether they're inside the 20.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const week = Number(req.query.week);
  if (!Number.isInteger(week) || week < 1) {
    return res.status(400).json({ error: "Invalid week" });
  }

  const games = await prisma.game.findMany({
    where: { week },
    include: { homeTeam: true, awayTeam: true, possessionTeam: true },
    orderBy: { kickoffAt: "asc" },
  });

  return res.status(200).json({
    games: games.map((g) => ({
      id: g.id,
      week: g.week,
      status: g.status,
      kickoffAt: g.kickoffAt,
      homeTeam: g.homeTeam.name,
      awayTeam: g.awayTeam.name,
      isRedZone: g.isRedZone,
      possessionTeam: g.possessionTeam?.name ?? null,
    })),
  });
}
