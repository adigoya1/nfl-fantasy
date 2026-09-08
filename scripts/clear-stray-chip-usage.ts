/**
 * One-off cleanup: deletes a specific team's ChipUsage rows, so a leftover
 * test activation (e.g. an early FREE_HIT test that predates the Week-1
 * restriction) doesn't keep silently affecting transfers or block using
 * that chip for real later.
 *
 * Run: npx tsx scripts/clear-stray-chip-usage.ts <fantasyTeamId>
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const teamId = process.argv[2];
  if (!teamId) {
    throw new Error("Usage: npx tsx scripts/clear-stray-chip-usage.ts <fantasyTeamId>");
  }

  const result = await prisma.chipUsage.deleteMany({ where: { fantasyTeamId: teamId } });
  console.log(`Deleted ${result.count} ChipUsage row(s) for team ${teamId}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
