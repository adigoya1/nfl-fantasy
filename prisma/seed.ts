import { PrismaClient } from "@prisma/client";
import { NFL_TEAMS } from "../lib/nflTeams";

const prisma = new PrismaClient();

async function main() {
  for (const team of NFL_TEAMS) {
    const conference = team.division.split(" ")[0]; // "AFC East" -> "AFC"
    await prisma.team.upsert({
      where: { name: team.name },
      update: { conference, division: team.division },
      create: { name: team.name, conference, division: team.division },
    });
  }
  console.log(`Seeded ${NFL_TEAMS.length} NFL teams.`);
  console.log(
    "Next: run `npm run load:players` (no API key needed) to pull real " +
      "rosters and ESPN-projected fantasy points, and generate real " +
      "preseason prices."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
