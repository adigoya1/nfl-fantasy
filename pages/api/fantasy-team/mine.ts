import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../lib/prisma";
import { getSessionUserId } from "../../../lib/auth";

/**
 * GET /api/fantasy-team/mine
 *
 * Resolves the signed-in Google account's own team, if it has one. Lets
 * pages/my-team.tsx and pages/transfers.tsx find "your" team without a
 * ?teamId= link -- ownership is now the session, not a URL.
 *
 * One team per user for now (see prisma schema: FantasyTeam.userId isn't
 * unique, but this endpoint always returns the first one) -- multi-team
 * users would need a picker UI, out of scope for now.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const userId = await getSessionUserId(req, res);
  if (!userId) {
    return res.status(401).json({ error: "Not signed in" });
  }

  const team = await prisma.fantasyTeam.findFirst({ where: { userId } });
  if (!team) {
    return res.status(404).json({ error: "No team yet" });
  }

  return res.status(200).json({ id: team.id, name: team.name });
}
