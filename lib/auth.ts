import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "../pages/api/auth/[...nextauth]";

/**
 * Small helper so every API route doesn't repeat the same
 * getServerSession(req, res, authOptions) call. Returns the signed-in
 * user's internal userId (see pages/api/auth/[...nextauth].ts's jwt
 * callback), or null if nobody's signed in.
 */
export async function getSessionUserId(req: NextApiRequest, res: NextApiResponse): Promise<string | null> {
  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  return userId ?? null;
}
