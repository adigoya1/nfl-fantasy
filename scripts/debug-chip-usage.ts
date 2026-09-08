/**
 * One-off diagnostic: lists every ChipUsage row for a team, to check for a
 * leftover FREE_HIT activation that's silently making every transfer free
 * (freeHitActive short-circuits the point-hit logic in transfers.ts
 * regardless of freeTransfers).
 *
 * Run: npx tsx scripts/debug-chip-usage.ts <fantasyTeamId>
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const teamId = process.argv[2];
  if (!teamId) {
    throw new Error("Usage: npx tsx scripts/debug-chip-usage.ts <fantasyTeamId>");
  }

  const usages = await prisma.chipUsage.findMany({ where: { fantasyTeamId: teamId } });
  console.log(`${usages.length} ChipUsage row(s):`);
  console.log(usages);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
