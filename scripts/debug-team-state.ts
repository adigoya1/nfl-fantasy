/**
 * One-off diagnostic: prints a FantasyTeam's current budget/free-transfers
 * plus every Transfer row logged for it, to check whether freeTransfers
 * genuinely didn't decrement or the UI just isn't showing the fresh value.
 *
 * Run: npx tsx scripts/debug-team-state.ts <fantasyTeamId>
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const teamId = process.argv[2];
  if (!teamId) {
    throw new Error("Usage: npx tsx scripts/debug-team-state.ts <fantasyTeamId>");
  }

  const team = await prisma.fantasyTeam.findUnique({ where: { id: teamId } });
  console.log("FantasyTeam row:", team);

  const transfers = await prisma.transfer.findMany({
    where: { fantasyTeamId: teamId },
    orderBy: { createdAt: "asc" },
  });
  console.log(`\n${transfers.length} Transfer row(s):`);
  console.log(transfers);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
