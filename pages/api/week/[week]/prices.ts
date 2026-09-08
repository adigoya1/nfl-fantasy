import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";
import { computeWeeklyPriceChange } from "../../../../lib/pricing";

/**
 * POST /api/week/[week]/prices
 *
 * Runs the weekly price-change job (design doc section 4.2) after a
 * week's scoring has been finalized via /score. Stub — the ownership
 * and transfer-count math here assumes a RosterSlot table with one row per
 * (fantasyTeam, player); replace with real aggregate queries as the app
 * grows past a handful of managers.
 *
 * NOT idempotent by nature -- it mutates currentPrice relative to itself,
 * so calling it twice for the same week would apply that week's price
 * movement twice. poll-live-week.ts previously got away with this only
 * because it's a single long-running process that calls this once and then
 * stops itself. Once scripts/poll-once.ts + a recurring cron entered the
 * picture (.github/workflows/poll-live.yml), "only ever called once" could
 * no longer be guaranteed by the caller, so the guard now lives here
 * instead: if PriceHistory already has rows for this week, this is a
 * repeat call and it's a no-op.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const week = Number(req.query.week);
  if (!Number.isInteger(week)) {
    return res.status(400).json({ error: "week must be an integer" });
  }

  const alreadyRun = await prisma.priceHistory.findFirst({ where: { week } });
  if (alreadyRun) {
    return res.status(200).json({ week, playersRepriced: 0, alreadyRun: true });
  }

  const totalActiveManagers = await prisma.fantasyTeam.count();
  const players = await prisma.player.findMany({
    include: {
      weekScores: { where: { week: week } },
      rosterSlots: true,
      priceHistory: { orderBy: { week: "asc" }, take: 1 },
    },
  });

  const scoresByPosition = new Map<string, number[]>();
  for (const p of players) {
    const score = p.weekScores[0]?.fantasyPoints ?? 0;
    const list = scoresByPosition.get(p.position) ?? [];
    list.push(score);
    scoresByPosition.set(p.position, list);
  }

  function meanAndStdDev(nums: number[]) {
    if (nums.length === 0) return { mean: 0, stdDev: 0 };
    const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length;
    return { mean, stdDev: Math.sqrt(variance) };
  }

  const updates = [];
  for (const p of players) {
    const { mean, stdDev } = meanAndStdDev(scoresByPosition.get(p.position) ?? []);
    const ownershipPct =
      totalActiveManagers > 0 ? p.rosterSlots.length / totalActiveManagers : 0;
    const startingPrice = p.priceHistory[0]?.price ?? p.currentPrice;
    const weeklyPoints = p.weekScores[0]?.fantasyPoints ?? 0;

    // NOTE: transfersIn/transfersOut require a Transfer table query scoped
    // to this week; left as 0/0 placeholders in this stub.
    const { newPrice, delta } = computeWeeklyPriceChange({
      currentPrice: p.currentPrice,
      startingPrice,
      transfersIn: 0,
      transfersOut: 0,
      totalActiveManagers,
      ownershipPct,
      weeklyPoints,
      positionAvg: mean,
      positionStdDev: stdDev,
    });

    if (delta !== 0) {
      updates.push(
        prisma.player.update({
          where: { id: p.id },
          data: { currentPrice: newPrice },
        }),
        prisma.priceHistory.create({
          data: { playerId: p.id, week: week, price: newPrice, delta },
        })
      );
    }
  }

  await prisma.$transaction(updates);

  return res.status(200).json({ week, playersRepriced: updates.length / 2 });
}
