/**
 * One-off diagnostic for the "no matching players found" transfer bug:
 * counts players per position, active vs. inactive, to see whether the DB
 * actually has a healthy player pool or whether something (a partial
 * load:players run, an `active` flag issue, etc.) left it nearly empty.
 *
 * Run: npx tsx scripts/debug-player-counts.ts
 */
import { PrismaClient, Position } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const total = await prisma.player.count();
  console.log(`Total players in DB: ${total}\n`);

  for (const position of Object.values(Position)) {
    const active = await prisma.player.count({ where: { position, active: true } });
    const inactive = await prisma.player.count({ where: { position, active: false } });
    console.log(`${position}: ${active} active, ${inactive} inactive`);
  }

  console.log("\nSample of 5 RB rows (any active status):");
  const sample = await prisma.player.findMany({
    where: { position: Position.RB },
    take: 5,
    select: { name: true, active: true, currentPrice: true, externalId: true },
  });
  console.log(sample);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
