import type { NextApiRequest, NextApiResponse } from "next";
import { Chip } from "@prisma/client";
import { prisma } from "../../../../lib/prisma";
import { isPreseasonTransferWindow } from "../../../../lib/preseason";
import { getSessionUserId } from "../../../../lib/auth";

const POINTS_HIT_PER_EXTRA_TRANSFER = -4;

/**
 * POST /api/fantasy-team/[id]/transfers
 *
 * Body: { playerOutId: string, playerInId: string, week: number }
 *
 * Swaps one player on the roster for another, deducting the price
 * difference from budgetRemaining and consuming a free transfer (or
 * applying a -4 point hit if none are left) -- unless either of these is
 * true, in which case transfers are unlimited and free this week:
 *   - the FREE_HIT chip is active for this week, or
 *   - it's Week 1 and Week 1's opener hasn't kicked off yet (see
 *     lib/preseason.ts) -- there's no real squad to protect before the
 *     season has even started.
 * Once that week's games all go FINAL, Free-Hit-driven changes are
 * automatically undone by pages/api/week/[week]/score.ts (see
 * lib/freeHit.ts), restoring the squad + budget + free transfers to exactly
 * what they were right before Free Hit was activated. Preseason transfers
 * are never undone -- they're just genuinely free, not temporary.
 *
 * Design-doc simplification: a transfer must swap like-for-like position
 * (e.g. WR for WR) so the squad's position composition never needs
 * re-validating -- letting transfers change position too is a reasonable
 * next step, but needs lib/roster.ts's full squad-composition check wired
 * in here.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const id = String(req.query.id);
  const { playerOutId, playerInId, week } = req.body ?? {};

  if (typeof playerOutId !== "string" || typeof playerInId !== "string" || !Number.isInteger(week)) {
    return res.status(400).json({
      error: "Body must include playerOutId (string), playerInId (string), week (integer)",
    });
  }
  if (playerOutId === playerInId) {
    return res.status(422).json({ error: "playerOutId and playerInId must be different." });
  }

  const team = await prisma.fantasyTeam.findUnique({
    where: { id },
    include: { rosterSlots: true, chipUsages: true },
  });
  if (!team) {
    return res.status(404).json({ error: "Fantasy team not found" });
  }

  const sessionUserId = await getSessionUserId(req, res);
  if (sessionUserId !== team.userId) {
    return res.status(403).json({ error: "You don't own this team." });
  }

  const freeHitActive = team.chipUsages.some((u) => u.chip === Chip.FREE_HIT && u.week === week);

  const week1Opener =
    week === 1
      ? await prisma.game.findFirst({
          where: { week: 1 },
          orderBy: { kickoffAt: "asc" },
          select: { kickoffAt: true },
        })
      : null;
  const preseasonActive = isPreseasonTransferWindow(week, new Date(), week1Opener?.kickoffAt ?? null);

  const outgoingSlot = team.rosterSlots.find((s) => s.playerId === playerOutId);
  if (!outgoingSlot) {
    return res.status(422).json({ error: "playerOutId isn't on this team's roster." });
  }
  if (team.rosterSlots.some((s) => s.playerId === playerInId)) {
    return res.status(422).json({ error: "playerInId is already on this team's roster." });
  }

  const [playerOut, playerIn] = await Promise.all([
    prisma.player.findUnique({ where: { id: playerOutId } }),
    prisma.player.findUnique({ where: { id: playerInId } }),
  ]);
  if (!playerOut || !playerIn) {
    return res.status(404).json({ error: "One of the players wasn't found." });
  }
  if (playerOut.position !== playerIn.position) {
    return res.status(422).json({
      error: `Position mismatch: can't swap a ${playerOut.position} for a ${playerIn.position}. ` +
        `Transfers must be like-for-like position in this version.`,
    });
  }

  const newBudgetRemaining = team.budgetRemaining + playerOut.currentPrice - playerIn.currentPrice;
  if (newBudgetRemaining < -1e-9) {
    return res.status(422).json({
      error: `Not enough budget: this move needs $${(playerIn.currentPrice - playerOut.currentPrice).toFixed(1)}M ` +
        `more than the $${team.budgetRemaining.toFixed(1)}M remaining.`,
    });
  }

  const usingFreeTransfer = team.freeTransfers > 0;
  const pointsHit = freeHitActive || preseasonActive ? 0 : usingFreeTransfer ? 0 : POINTS_HIT_PER_EXTRA_TRANSFER;

  await prisma.$transaction([
    prisma.rosterSlot.update({
      where: { id: outgoingSlot.id },
      data: { playerId: playerInId },
    }),
    prisma.fantasyTeam.update({
      where: { id: team.id },
      data: {
        budgetRemaining: newBudgetRemaining,
        freeTransfers:
          freeHitActive || preseasonActive || !usingFreeTransfer
            ? team.freeTransfers
            : team.freeTransfers - 1,
      },
    }),
    prisma.transfer.create({
      data: {
        fantasyTeamId: team.id,
        playerOutId,
        playerInId,
        week,
        pointsHit,
      },
    }),
  ]);

  return res.status(200).json({
    ok: true,
    budgetRemaining: newBudgetRemaining,
    pointsHit,
    usedFreeTransfer: usingFreeTransfer && !freeHitActive && !preseasonActive,
    freeHitActive,
    preseasonActive,
  });
}
