import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "../../../../lib/prisma";
import { scoreGame, computeBps, awardBonusPoints, RawStatLine } from "../../../../lib/scoring";
import { isWeekFullyFinal, planRevert, RosterSlotLike } from "../../../../lib/freeHit";
import { planTransferRollover } from "../../../../lib/transferRollover";

/**
 * POST /api/week/[week]/score
 *
 * Recomputes fantasy points + BPS bonus points for every PlayerGameStat row
 * tied to games in the given week. Also picks up IN_PROGRESS games, not
 * just FINAL ones, so this can power a live/provisional leaderboard while
 * games are still being played (design doc section 5) — just re-run this
 * on a short interval (e.g. every 2-5 minutes) alongside
 * scripts/load-week-stats.ts during game windows. The response's
 * `provisional` flag tells the caller whether any of the underlying games
 * are still in progress, so the UI can label the numbers accordingly.
 *
 * This is also where Free Hit's auto-revert lives: once every game in the
 * week has gone FINAL, any team that played FREE_HIT this week gets its
 * pre-Free-Hit roster/budget/free-transfers restored (see lib/freeHit.ts).
 * Piggybacking on this endpoint means no separate cron job is needed --
 * whatever's already re-running this every few minutes during game windows
 * (per the README) naturally catches the moment the week finishes.
 *
 * Same idea powers the weekly free-transfer rollover (lib/transferRollover.ts):
 * once the week is over, every team banks +1 free transfer for next week,
 * except a team that played FREE_HIT this week (it already got unlimited
 * transfers, so it doesn't also stack a banked one). `lastTransferRolloverWeek`
 * on FantasyTeam makes this idempotent the same way FreeHitSnapshot.restoredAt
 * does for the revert.
 *
 * Caveat: this checks the status of every Game row for the week, not just
 * ones with stats loaded, so it correctly waits out a week that still has
 * games pending -- but only if scripts/load-week-games.ts has actually been
 * run for the full week. If a game for this week has never been loaded at
 * all, it won't exist as a Game row yet and this will look like the week is
 * already over. Always run load-week-games.ts for the whole week (not a
 * subset) before relying on this.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const week = Number(req.query.week);
  if (!Number.isInteger(week)) {
    return res.status(400).json({ error: "week must be an integer" });
  }

  const stats = await prisma.playerGameStat.findMany({
    where: { game: { week, status: { in: ["FINAL", "IN_PROGRESS"] } } },
    include: { game: true },
  });

  if (stats.length === 0) {
    return res.status(200).json({ week, updated: 0, note: "No FINAL or IN_PROGRESS games found for this week" });
  }

  const provisional = stats.some((s) => s.game.status === "IN_PROGRESS");

  // 1. Raw fantasy points per player-game.
  const pointsByPlayer = new Map<string, number>();
  const bpsEntriesByGame = new Map<string, { playerId: string; bps: number }[]>();

  for (const s of stats) {
    const statLine: RawStatLine = {
      passYds: s.passYds,
      passTds: s.passTds,
      interceptionsThrown: s.interceptionsThrown,
      rushYds: s.rushYds,
      rushTds: s.rushTds,
      receptions: s.receptions,
      recYds: s.recYds,
      recTds: s.recTds,
      fumblesLost: s.fumblesLost,
      twoPtConversions: s.twoPtConversions,
      fgMade0to39: s.fgMade0to39,
      fgMade40to49: s.fgMade40to49,
      fgMade50Plus: s.fgMade50Plus,
      fgMissed: s.fgMissed,
      xpMade: s.xpMade,
      dstSacks: s.dstSacks,
      dstInterceptions: s.dstInterceptions,
      dstFumbleRecoveries: s.dstFumbleRecoveries,
      dstDefensiveTds: s.dstDefensiveTds,
      dstPointsAllowed: s.dstPointsAllowed,
    };

    pointsByPlayer.set(s.playerId, scoreGame(statLine));

    const bps = computeBps(statLine);
    const list = bpsEntriesByGame.get(s.gameId) ?? [];
    list.push({ playerId: s.playerId, bps });
    bpsEntriesByGame.set(s.gameId, list);
  }

  // 2. Bonus points, computed per game (not per week) since BPS ranks
  //    individual performances within a single matchup.
  const bonusByPlayer = new Map<string, number>();
  for (const entries of bpsEntriesByGame.values()) {
    const bonuses = awardBonusPoints(entries);
    for (const [playerId, bonus] of Object.entries(bonuses)) {
      bonusByPlayer.set(playerId, (bonusByPlayer.get(playerId) ?? 0) + bonus);
    }
  }

  // 3. Upsert PlayerWeekScore rows.
  const upserts = Array.from(pointsByPlayer.entries()).map(([playerId, fantasyPoints]) =>
    prisma.playerWeekScore.upsert({
      where: { playerId_week: { playerId, week } },
      update: {
        fantasyPoints,
        bonusPoints: bonusByPlayer.get(playerId) ?? 0,
      },
      create: {
        playerId,
        week,
        fantasyPoints,
        bonusPoints: bonusByPlayer.get(playerId) ?? 0,
      },
    })
  );

  await prisma.$transaction(upserts);

  const freeHitRevertsApplied = await revertFreeHitSnapshotsIfWeekIsOver(week);
  const freeTransferRolloversApplied = await applyFreeTransferRolloverIfWeekIsOver(week);

  return res.status(200).json({
    week,
    updated: upserts.length,
    provisional,
    freeHitRevertsApplied,
    freeTransferRolloversApplied,
  });
}

/**
 * Checks every Game row for this week (not just ones with stats loaded) and,
 * if the week is fully over, restores any still-pending FreeHitSnapshot for
 * this week. Returns how many teams got reverted, mostly so it shows up
 * in the endpoint's response during manual testing.
 */
async function revertFreeHitSnapshotsIfWeekIsOver(week: number): Promise<number> {
  const games = await prisma.game.findMany({ where: { week }, select: { status: true } });
  if (!isWeekFullyFinal(games.map((g) => g.status))) {
    return 0;
  }

  const pending = await prisma.freeHitSnapshot.findMany({
    where: { week: week, restoredAt: null },
  });

  for (const snapshot of pending) {
    const plan = planRevert({ ...snapshot, roster: snapshot.roster as unknown as RosterSlotLike[] });
    await prisma.$transaction([
      prisma.rosterSlot.deleteMany({ where: { fantasyTeamId: plan.fantasyTeamId } }),
      prisma.rosterSlot.createMany({
        data: plan.roster.map((slot) => ({
          fantasyTeamId: plan.fantasyTeamId,
          playerId: slot.playerId,
          isStarter: slot.isStarter,
          benchOrder: slot.benchOrder,
        })),
      }),
      prisma.fantasyTeam.update({
        where: { id: plan.fantasyTeamId },
        data: { budgetRemaining: plan.budgetRemaining, freeTransfers: plan.freeTransfers },
      }),
      prisma.freeHitSnapshot.update({
        where: { id: plan.snapshotId },
        data: { restoredAt: new Date() },
      }),
    ]);
  }

  return pending.length;
}

/**
 * Once this week's games are all FINAL, credits every team +1 free
 * transfer for next week -- except a team that played FREE_HIT this week
 * (see lib/transferRollover.ts). Safe to call on every poll after the week
 * ends: `lastTransferRolloverWeek` means a team already rolled over for
 * this week (or later) is skipped instead of re-credited.
 */
async function applyFreeTransferRolloverIfWeekIsOver(week: number): Promise<number> {
  const games = await prisma.game.findMany({ where: { week }, select: { status: true } });
  if (!isWeekFullyFinal(games.map((g) => g.status))) {
    return 0;
  }

  const [teams, freeHitUsages] = await Promise.all([
    prisma.fantasyTeam.findMany({
      select: { id: true, freeTransfers: true, lastTransferRolloverWeek: true },
    }),
    prisma.chipUsage.findMany({
      where: { chip: "FREE_HIT", week },
      select: { fantasyTeamId: true },
    }),
  ]);
  const freeHitTeamIds = new Set(freeHitUsages.map((u) => u.fantasyTeamId));

  let applied = 0;
  for (const team of teams) {
    const plan = planTransferRollover(
      { ...team, playedFreeHitThisWeek: freeHitTeamIds.has(team.id) },
      week
    );
    if (!plan) continue;

    await prisma.fantasyTeam.update({
      where: { id: plan.fantasyTeamId },
      data: { freeTransfers: plan.freeTransfers, lastTransferRolloverWeek: week },
    });
    applied++;
  }

  return applied;
}
