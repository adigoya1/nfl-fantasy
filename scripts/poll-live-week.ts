/**
 * Live game-day poller: repeatedly runs the weekly stats pipeline
 * (load-week-games -> load-week-stats -> POST /score) on an interval, so
 * you don't have to re-type those three commands from the README by hand
 * every few minutes during a real game window (Thu/Sun/Mon).
 *
 * Automatically calls POST /prices exactly ONCE, right after every game in
 * the week has gone FINAL, then stops itself. Prices must only run once per
 * week -- pages/api/week/[week]/prices.ts measures each player's price
 * movement against their price at the *start* of the week, so calling it
 * again mid-week (or twice) would apply that same week's performance more
 * than once and make prices drift too far.
 *
 * Run (leave it running in its own terminal window):
 *   npx tsx scripts/poll-live-week.ts <week> [intervalMinutes] [baseUrl]
 *   e.g. npx tsx scripts/poll-live-week.ts 1
 *   e.g. npx tsx scripts/poll-live-week.ts 1 3 http://localhost:3000
 *
 * Requires `npm run dev` running in a separate terminal (or a deployed
 * baseUrl passed as the third argument). Defaults to a 3-minute interval
 * and http://localhost:3000.
 */
import { spawn } from "child_process";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", shell: true });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

async function postJson(url: string): Promise<any> {
  const res = await fetch(url, { method: "POST" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`POST ${url} failed: ${res.status} ${JSON.stringify(body)}`);
  return body;
}

async function isWeekFullyFinal(week: number): Promise<boolean> {
  const games = await prisma.game.findMany({ where: { week }, select: { status: true } });
  return games.length > 0 && games.every((g) => g.status === "FINAL");
}

async function main() {
  const week = Number(process.argv[2]);
  const intervalMinutes = Number(process.argv[3] ?? 3);
  const baseUrl = process.argv[4] ?? "http://localhost:3000";

  if (!Number.isInteger(week) || week < 1) {
    console.error("Usage: npx tsx scripts/poll-live-week.ts <week> [intervalMinutes] [baseUrl]");
    process.exit(1);
  }

  console.log(`Polling week ${week} every ${intervalMinutes} minute(s) against ${baseUrl}.`);
  console.log("Press Ctrl+C to stop.\n");

  while (true) {
    const stamp = new Date().toLocaleTimeString();
    console.log(`\n[${stamp}] --- poll cycle start ---`);
    try {
      await run("npx", ["tsx", "scripts/load-week-games.ts", String(week)]);
      await run("npx", ["tsx", "scripts/load-week-stats.ts", String(week)]);
      const scoreResult = await postJson(`${baseUrl}/api/week/${week}/score`);
      console.log(`[${stamp}] score response:`, scoreResult);

      if (await isWeekFullyFinal(week)) {
        console.log(`[${stamp}] All week ${week} games are FINAL. Running prices once...`);
        const pricesResult = await postJson(`${baseUrl}/api/week/${week}/prices`);
        console.log(`[${stamp}] prices response:`, pricesResult);
        console.log(`[${stamp}] Week ${week} is fully processed. Stopping poller.`);
        break;
      }
    } catch (e) {
      console.error(`[${stamp}] Error during poll cycle:`, e);
      console.log("Will retry next cycle.");
    }

    await new Promise((r) => setTimeout(r, intervalMinutes * 60 * 1000));
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
