import type { NextApiRequest, NextApiResponse } from "next";
import { Position } from "@prisma/client";
import { prisma } from "../../../lib/prisma";

/**
 * GET /api/players?position=WR&search=jones&maxPrice=8&excludeTeamId=xyz
 *
 * Simple player search/filter for the Transfers page. `excludeTeamId`
 * leaves out anyone already on that FantasyTeam's roster, so the UI only
 * shows players actually available to bring in.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { position, search, maxPrice, excludeTeamId } = req.query;

  const where: any = { active: true };
  if (typeof position === "string" && position in Position) {
    where.position = position as Position;
  }
  if (typeof search === "string" && search.trim().length > 0) {
    where.name = { contains: search.trim(), mode: "insensitive" };
  }
  if (typeof maxPrice === "string" && !Number.isNaN(Number(maxPrice))) {
    where.currentPrice = { lte: Number(maxPrice) };
  }

  if (typeof excludeTeamId === "string") {
    const rosterPlayerIds = (
      await prisma.rosterSlot.findMany({ where: { fantasyTeamId: excludeTeamId }, select: { playerId: true } })
    ).map((r) => r.playerId);
    if (rosterPlayerIds.length > 0) {
      where.id = { notIn: rosterPlayerIds };
    }
  }

  const players = await prisma.player.findMany({
    where,
    include: { team: true },
    orderBy: { currentPrice: "desc" },
    take: 100,
  });

  return res.status(200).json({
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      position: p.position,
      currentPrice: p.currentPrice,
      team: { name: p.team.name },
    })),
  });
}
