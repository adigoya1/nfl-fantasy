import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";
import { isPreseasonTransferWindow } from "../../../../lib/preseason";
import { TOTAL_SQUAD_SIZE } from "../../../../lib/roster";

/**
 * GET /api/fantasy-team/[id]
 *
 * Returns a fantasy team's full roster (with each player's real position,
 * team, price and photo) plus budget/transfer state. No auth check here
 * yet -- see README's "What's not here" section; add an ownership check
 * once NextAuth is wired up.
 *
 * Also returns `preseasonActive`, so the UI can show "Unlimited transfers"
 * instead of a free-transfer count before Week 1's opener kicks off (see
 * lib/preseason.ts) -- without this, the badge would only reflect reality
 * after a manager actually attempts a transfer.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const id = String(req.query.id);

  const team = await prisma.fantasyTeam.findUnique({
    where: { id },
    include: {
      rosterSlots: {
        include: {
          player: { include: { team: true } },
        },
      },
      chipUsages: true,
    },
  });

  if (!team) {
    return res.status(404).json({ error: "Fantasy team not found" });
  }

  const week1Opener = await prisma.game.findFirst({
    where: { week: 1 },
    orderBy: { kickoffAt: "asc" },
    select: { kickoffAt: true },
  });
  const preseasonActive = isPreseasonTransferWindow(1, new Date(), week1Opener?.kickoffAt ?? null);

  const roster = team.rosterSlots.map((slot) => ({
    rosterSlotId: slot.id,
    isStarter: slot.isStarter,
    benchOrder: slot.benchOrder,
    player: {
      id: slot.player.id,
      name: slot.player.name,
      position: slot.player.position,
      currentPrice: slot.player.currentPrice,
      photoUrl: slot.player.photoUrl,
      team: { name: slot.player.team.name },
    },
  }));

  return res.status(200).json({
    id: team.id,
    name: team.name,
    budgetRemaining: team.budgetRemaining,
    freeTransfers: team.freeTransfers,
    preseasonActive,
    squadComplete: roster.length === TOTAL_SQUAD_SIZE,
    roster,
    chipUsages: team.chipUsages,
  });
}
