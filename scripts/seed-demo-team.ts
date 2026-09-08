/**
 * Creates a demo User + FantasyTeam with a real, valid squad drafted from
 * whatever real players scripts/load-players.ts has already loaded -- so
 * there's something real to click around in on the My Team / Transfers
 * pages, or to use as a throwaway test team.
 *
 * As of the self-serve "Create Your Team" flow (pages/create-team.tsx,
 * POST /api/fantasy-team), this script isn't the only way to get a team
 * anymore -- real managers should use that instead. This is now mainly a
 * dev/testing convenience, and the auto-draft logic it uses now lives in
 * lib/autoDraft.ts, shared with that API route.
 *
 * Run: npx tsx scripts/seed-demo-team.ts
 *
 * Safe to re-run: it deletes and rebuilds the demo team's roster each time
 * (handy after re-running load:players, since prices/players can change).
 */
import { PrismaClient } from "@prisma/client";
import { validateSquadComposition, validateLineup, SQUAD_BUDGET } from "../lib/roster";
import { autoDraftTeam, DraftPlayer } from "../lib/autoDraft";

const prisma = new PrismaClient();

const DEMO_USER_EMAIL = "demo@example.com";
const DEMO_TEAM_NAME = "Demo Squad";

async function main() {
  const players = await prisma.player.findMany({ where: { active: true } });
  if (players.length === 0) {
    throw new Error('No players in the database yet -- run "npm run load:players" first.');
  }

  const pool: DraftPlayer[] = players.map((p) => ({ id: p.id, position: p.position, currentPrice: p.currentPrice }));
  const { squad, starterIds, totalCost, budgetRemaining } = autoDraftTeam(pool);

  const squadCheck = validateSquadComposition(squad);
  if (!squadCheck.valid) {
    throw new Error(`Drafted squad failed validation (this would be a bug in lib/autoDraft.ts): ${squadCheck.errors.join("; ")}`);
  }

  const lineupCheck = validateLineup(squad, starterIds);
  if (!lineupCheck.valid) {
    throw new Error(`Drafted lineup failed validation (this would be a bug in lib/autoDraft.ts): ${lineupCheck.errors.join("; ")}`);
  }

  const user = await prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: {},
    create: { email: DEMO_USER_EMAIL, displayName: "Demo Manager" },
  });

  let team = await prisma.fantasyTeam.findFirst({ where: { userId: user.id, name: DEMO_TEAM_NAME } });
  if (team) {
    // Safe to re-run: wipe the old roster AND chip usage, since a stale
    // "already used" chip from a previous test run would otherwise
    // permanently block re-testing the chip flow on the fresh squad.
    await prisma.rosterSlot.deleteMany({ where: { fantasyTeamId: team.id } });
    await prisma.chipUsage.deleteMany({ where: { fantasyTeamId: team.id } });
    team = await prisma.fantasyTeam.update({
      where: { id: team.id },
      data: { budgetRemaining, freeTransfers: 1 },
    });
  } else {
    team = await prisma.fantasyTeam.create({
      data: { userId: user.id, name: DEMO_TEAM_NAME, budgetRemaining, freeTransfers: 1 },
    });
  }

  const starterSet = new Set(starterIds);
  const benchPlayerIds = squad.map((p) => p.id).filter((id) => !starterSet.has(id));

  await prisma.rosterSlot.createMany({
    data: squad.map((p) => ({
      fantasyTeamId: team!.id,
      playerId: p.id,
      isStarter: starterSet.has(p.id),
      benchOrder: starterSet.has(p.id) ? null : benchPlayerIds.indexOf(p.id),
    })),
  });

  console.log(`Demo team ready: "${DEMO_TEAM_NAME}" (fantasyTeamId: ${team.id})`);
  console.log(`Squad cost: $${totalCost.toFixed(1)}M / $${SQUAD_BUDGET.toFixed(1)}M (budget remaining: $${budgetRemaining.toFixed(1)}M)`);
  console.log(`Visit /my-team?teamId=${team.id} to see it.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
