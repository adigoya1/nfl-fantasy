/**
 * One-off diagnostic: directly sets freeTransfers to 0 for a team, then
 * immediately re-reads it, to check whether the write itself sticks at the
 * DB level -- isolating whether the bug is in Prisma/Postgres or somewhere
 * in the transfers API route's request handling.
 *
 * Run: npx tsx scripts/debug-free-transfers.ts <fantasyTeamId>
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const teamId = process.argv[2];
  if (!teamId) {
    throw new Error("Usage: npx tsx scripts/debug-free-transfers.ts <fantasyTeamId>");
  }

  const before = await prisma.fantasyTeam.findUnique({ where: { id: teamId } });
  console.log("BEFORE:", before);

  const updated = await prisma.fantasyTeam.update({
    where: { id: teamId },
    data: { freeTransfers: 0 },
  });
  console.log("UPDATE RETURNED:", updated);

  const after = await prisma.fantasyTeam.findUnique({ where: { id: teamId } });
  console.log("RE-FETCHED AFTER:", after);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
