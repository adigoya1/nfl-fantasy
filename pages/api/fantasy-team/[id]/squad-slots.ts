import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";
import { getSessionUserId } from "../../../../lib/auth";
import { SQUAD_REQUIREMENTS, TOTAL_SQUAD_SIZE } from "../../../../lib/roster";
import { pickStarters, DraftPlayer } from "../../../../lib/autoDraft";

/**
 * POST   /api/fantasy-team/[id]/squad-slots  body: { playerId }  -- add a player
 * DELETE /api/fantasy-team/[id]/squad-slots  body: { playerId }  -- remove a player
 *
 * Fills a brand-new team's empty roster one player at a time (see
 * pages/build-squad.tsx) -- unlike /transfers, there's no "outgoing"
 * player, since the whole point is going from 0 to 13. Enforces the same
 * position caps and budget as a full squad (lib/roster.ts's
 * SQUAD_REQUIREMENTS), just incrementally.
 *
 * The moment the roster hits exactly 13 (TOTAL_SQUAD_SIZE), it's
 * automatically a complete, valid squad -- because each position was
 * capped along the way and the caps sum to 13 -- so this also picks a
 * starting lineup for you right then (lib/autoDraft.ts's pickStarters,
 * favoring the priciest players at each position) so My Team isn't a
 * confusing "0 starters" screen the instant you finish. You can freely
 * change who's starting afterward the normal way.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST" && req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const id = String(req.query.id);
  const { playerId } = req.body ?? {};
  if (typeof playerId !== "string") {
    return res.status(400).json({ error: "Body must include playerId (string)" });
  }

  const team = await prisma.fantasyTeam.findUnique({
    where: { id },
    include: { rosterSlots: true },
  });
  if (!team) {
    return res.status(404).json({ error: "Fantasy team not found" });
  }

  const sessionUserId = await getSessionUserId(req, res);
  if (sessionUserId !== team.userId) {
    return res.status(403).json({ error: "You don't own this team." });
  }

  if (req.method === "DELETE") {
    const slot = team.rosterSlots.find((s) => s.playerId === playerId);
    if (!slot) {
      return res.status(422).json({ error: "That player isn't on this team's roster." });
    }
    const player = await prisma.player.findUnique({ where: { id: playerId } });

    await prisma.$transaction([
      prisma.rosterSlot.delete({ where: { id: slot.id } }),
      prisma.fantasyTeam.update({
        where: { id: team.id },
        data: { budgetRemaining: team.budgetRemaining + (player?.currentPrice ?? 0) },
      }),
    ]);

    return res.status(200).json({ ok: true });
  }

  // POST: add a player.
  if (team.rosterSlots.some((s) => s.playerId === playerId)) {
    return res.status(422).json({ error: "That player is already on this team's roster." });
  }
  if (team.rosterSlots.length >= TOTAL_SQUAD_SIZE) {
    return res.status(422).json({ error: `Squad is already full (${TOTAL_SQUAD_SIZE} players).` });
  }

  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player || !player.active) {
    return res.status(404).json({ error: "Player not found." });
  }

  const requiredAtPosition = SQUAD_REQUIREMENTS[player.position];
  const currentAtPosition = await prisma.rosterSlot.count({
    where: { fantasyTeamId: team.id, player: { position: player.position } },
  });
  if (currentAtPosition >= requiredAtPosition) {
    return res.status(422).json({
      error: `You already have ${requiredAtPosition} ${player.position}${requiredAtPosition === 1 ? "" : "s"} -- that's the max.`,
    });
  }

  const newBudgetRemaining = team.budgetRemaining - player.currentPrice;
  if (newBudgetRemaining < -1e-9) {
    return res.status(422).json({
      error: `Not enough budget: ${player.name} costs $${player.currentPrice.toFixed(1)}M, ` +
        `you have $${team.budgetRemaining.toFixed(1)}M left.`,
    });
  }

  await prisma.$transaction([
    prisma.rosterSlot.create({
      data: { fantasyTeamId: team.id, playerId: player.id, isStarter: false, benchOrder: null },
    }),
    prisma.fantasyTeam.update({
      where: { id: team.id },
      data: { budgetRemaining: newBudgetRemaining },
    }),
  ]);

  const newRosterCount = team.rosterSlots.length + 1;
  let squadComplete = false;

  if (newRosterCount === TOTAL_SQUAD_SIZE) {
    squadComplete = true;
    const fullRoster = await prisma.rosterSlot.findMany({
      where: { fantasyTeamId: team.id },
      include: { player: true },
    });
    const squad: DraftPlayer[] = fullRoster.map((s) => ({
      id: s.playerId,
      position: s.player.position,
      currentPrice: s.player.currentPrice,
    }));
    const { starterIds } = pickStarters(squad);
    const starterSet = new Set(starterIds);
    const benchIds = squad.map((p) => p.id).filter((pid) => !starterSet.has(pid));

    await prisma.$transaction(
      fullRoster.map((s) =>
        prisma.rosterSlot.update({
          where: { id: s.id },
          data: {
            isStarter: starterSet.has(s.playerId),
            benchOrder: starterSet.has(s.playerId) ? null : benchIds.indexOf(s.playerId),
          },
        })
      )
    );
  }

  return res.status(200).json({ ok: true, budgetRemaining: newBudgetRemaining, rosterCount: newRosterCount, squadComplete });
}
