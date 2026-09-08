import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";
import { validateLineup, RosterPlayer } from "../../../../lib/roster";
import { computeLineupLock } from "../../../../lib/lineupLock";
import { getSessionUserId } from "../../../../lib/auth";

/**
 * POST /api/fantasy-team/[id]/lineup
 *
 * Body: { starterPlayerIds: string[] }
 *
 * Sets which of the team's 13 players are starting this week, validated
 * against lib/roster.ts's lineup rules (9 starters: the fixed per-position
 * slots + 1 FLEX). Bench order is derived from whatever order the
 * non-starters were sent in.
 *
 * Captaincy is handled separately via /api/fantasy-team/[id]/chips (the
 * CAPTAIN chip) -- it's no longer a persistent per-player flag you set
 * alongside the lineup every week.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const id = String(req.query.id);
  const { starterPlayerIds } = req.body ?? {};

  if (!Array.isArray(starterPlayerIds)) {
    return res.status(400).json({ error: "Body must include starterPlayerIds (string[])" });
  }

  const team = await prisma.fantasyTeam.findUnique({
    where: { id },
    include: { rosterSlots: { include: { player: true } } },
  });
  if (!team) {
    return res.status(404).json({ error: "Fantasy team not found" });
  }

  const sessionUserId = await getSessionUserId(req, res);
  if (sessionUserId !== team.userId) {
    return res.status(403).json({ error: "You don't own this team." });
  }

  const allGames = await prisma.game.findMany({ select: { week: true, status: true, kickoffAt: true } });
  const lock = computeLineupLock(allGames, new Date());
  if (lock.locked) {
    return res.status(423).json({ error: `Lineups are locked -- Week ${lock.week}'s games have already started.` });
  }

  const squad: RosterPlayer[] = team.rosterSlots.map((s) => ({
    id: s.playerId,
    position: s.player.position,
    currentPrice: s.player.currentPrice,
  }));

  const lineupCheck = validateLineup(squad, starterPlayerIds);
  if (!lineupCheck.valid) {
    return res.status(422).json({ error: "Invalid lineup", details: lineupCheck.errors });
  }

  const starterSet = new Set(starterPlayerIds);
  const benchPlayerIds = team.rosterSlots.map((s) => s.playerId).filter((pid) => !starterSet.has(pid));

  const updates = team.rosterSlots.map((slot) => {
    const isStarter = starterSet.has(slot.playerId);
    const benchOrder = isStarter ? null : benchPlayerIds.indexOf(slot.playerId);
    return prisma.rosterSlot.update({
      where: { id: slot.id },
      data: { isStarter, benchOrder },
    });
  });

  await prisma.$transaction(updates);

  return res.status(200).json({ ok: true });
}
