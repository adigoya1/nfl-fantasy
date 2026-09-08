import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { getSessionUserId } from "../../../lib/auth";
import { SQUAD_BUDGET } from "../../../lib/roster";

/**
 * POST /api/fantasy-team
 *
 * Body: { teamName: string }
 *
 * Requires a signed-in Google session (see pages/api/auth/[...nextauth].ts)
 * -- the created team is tied to that account's internal userId, not a
 * link. Creates an empty team (full $85M budget, zero roster) -- the
 * manager builds their actual squad afterward on /build-squad
 * (pages/api/fantasy-team/[id]/squad-slots.ts adds one player at a time).
 *
 * This used to auto-draft a full squad immediately, but that produced
 * bland, budget-scraping squads (lots of $4.1M replacement-level players)
 * since the draft logic greedily fills every slot -- starting blank and
 * letting each manager actually pick their own players is both more fun
 * and avoids that. scripts/seed-demo-team.ts still auto-drafts (via
 * lib/autoDraft.ts) for quick dev/testing purposes.
 *
 * One team per account: if this user already has one, returns it instead
 * of creating a second (409, with the existing team's id).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const userId = await getSessionUserId(req, res);
  if (!userId) {
    return res.status(401).json({ error: "Sign in with Google first." });
  }

  const { teamName } = req.body ?? {};
  if (typeof teamName !== "string" || teamName.trim().length < 2 || teamName.trim().length > 40) {
    return res.status(400).json({ error: "teamName must be 2-40 characters." });
  }
  const cleanTeamName = teamName.trim();

  const alreadyOwned = await prisma.fantasyTeam.findFirst({ where: { userId } });
  if (alreadyOwned) {
    return res.status(409).json({
      error: "You already have a team.",
      id: alreadyOwned.id,
      name: alreadyOwned.name,
    });
  }

  const nameTaken = await prisma.fantasyTeam.findFirst({ where: { name: cleanTeamName } });
  if (nameTaken) {
    return res.status(409).json({ error: `"${cleanTeamName}" is already taken -- pick a different team name.` });
  }

  const activePlayerCount = await prisma.player.count({ where: { active: true } });
  if (activePlayerCount === 0) {
    return res.status(503).json({
      error: "No players loaded yet. The site admin needs to run \"npm run load:players\" first.",
    });
  }

  const team = await prisma.fantasyTeam.create({
    data: {
      userId,
      name: cleanTeamName,
      budgetRemaining: SQUAD_BUDGET,
      freeTransfers: 1,
    },
  });

  return res.status(201).json({
    id: team.id,
    name: team.name,
    budgetRemaining: team.budgetRemaining,
  });
}
