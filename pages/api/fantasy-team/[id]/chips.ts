import type { NextApiRequest, NextApiResponse } from "next";
import { Chip, Prisma } from "@prisma/client";
import { prisma } from "../../../../lib/prisma";
import { canActivateChip, ALL_CHIPS } from "../../../../lib/chips";
import { buildRosterSnapshot } from "../../../../lib/freeHit";
import { computeLineupLock } from "../../../../lib/lineupLock";
import { getSessionUserId } from "../../../../lib/auth";

/**
 * GET  /api/fantasy-team/[id]/chips -- list this team's chip usage.
 * POST /api/fantasy-team/[id]/chips -- activate a chip.
 *
 * Body (POST): { chip: "CAPTAIN" | "BENCH_BOOST" | "FREE_HIT", week: number, captainPlayerId?: string }
 * `captainPlayerId` is required (and only meaningful) when chip is CAPTAIN
 * -- it must be one of that week's starters.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = String(req.query.id);

  if (req.method === "GET") {
    const usages = await prisma.chipUsage.findMany({ where: { fantasyTeamId: id } });
    return res.status(200).json({
      used: usages,
      available: ALL_CHIPS.filter((c) => !usages.some((u) => u.chip === c)),
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { chip, week, captainPlayerId } = req.body ?? {};
  if (!ALL_CHIPS.includes(chip)) {
    return res.status(400).json({ error: `chip must be one of ${ALL_CHIPS.join(", ")}` });
  }
  if (!Number.isInteger(week)) {
    return res.status(400).json({ error: "week must be an integer" });
  }
  if (chip === Chip.CAPTAIN && typeof captainPlayerId !== "string") {
    return res.status(400).json({ error: "captainPlayerId is required when activating the CAPTAIN chip" });
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

  // Locked the same instant lineups are (see lib/lineupLock.ts): all three
  // chips directly multiply or unlock THIS week's score (Captain doubles a
  // starter, Bench Boost turns the bench on, Free Hit lets you dodge a bad
  // week) -- activating one after seeing how the early games are going is
  // exactly the exploit the lineup lock exists to prevent.
  const allGames = await prisma.game.findMany({ select: { week: true, status: true, kickoffAt: true } });
  const lock = computeLineupLock(allGames, new Date());
  if (lock.locked) {
    return res.status(423).json({ error: `Chips are locked -- Week ${lock.week}'s games have already started.` });
  }

  const check = canActivateChip(
    chip,
    week,
    team.chipUsages.map((u) => ({ chip: u.chip, week: u.week }))
  );
  if (!check.valid) {
    return res.status(422).json({ error: check.error });
  }

  if (chip === Chip.CAPTAIN) {
    const slot = team.rosterSlots.find((s) => s.playerId === captainPlayerId);
    if (!slot) {
      return res.status(422).json({ error: "captainPlayerId isn't on this team's roster." });
    }
    if (!slot.isStarter) {
      return res.status(422).json({ error: "The Captain chip can only be used on a current starter." });
    }
  }

  // Free Hit's changes are supposed to be temporary for just this week,
  // so snapshot the roster + budget/free-transfers *before* creating the
  // ChipUsage record, capturing exactly what the squad looked like at the
  // moment of activation (i.e. before any transfers made under this Free
  // Hit). pages/api/week/[week]/score.ts restores this once the
  // week's games all go FINAL.
  const [usage] = await prisma.$transaction([
    prisma.chipUsage.create({
      data: {
        fantasyTeamId: id,
        chip,
        week,
        captainPlayerId: chip === Chip.CAPTAIN ? captainPlayerId : null,
      },
    }),
    ...(chip === Chip.FREE_HIT
      ? [
          prisma.freeHitSnapshot.create({
            data: {
              fantasyTeamId: id,
              week,
              budgetRemaining: team.budgetRemaining,
              freeTransfers: team.freeTransfers,
              roster: buildRosterSnapshot(team.rosterSlots) as unknown as Prisma.InputJsonValue,
            },
          }),
        ]
      : []),
  ]);

  return res.status(200).json({ ok: true, usage });
}
