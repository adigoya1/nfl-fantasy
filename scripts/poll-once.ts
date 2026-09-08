/**
 * Single-pass version of poll-live-week.ts's loop body: run the weekly
 * stats pipeline (load-week-games -> load-week-stats -> POST /score) once
 * and exit, firing the one-time price update if the week just went fully
 * FINAL. Built so a scheduler can provide the "loop" instead of a
 * long-running local process -- see .github/workflows/poll-live.yml, which
 * calls this on a cron so live scoring/red-zone data keeps updating even
 * with no laptop open. poll-live-week.ts is still the right tool for
 * running this by hand from your own machine.
 *
 * Run:
 *   npx tsx scripts/poll-once.ts <week> [baseUrl]
 *   e.g. npx tsx scripts/poll-once.ts 1 https://playfgl.vercel.app
 *
 * Exits non-zero on failure so a CI run shows as failed/red rather than
 * silently doing nothing.
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
  const baseUrl = process.argv[3] ?? "http://localhost:3000";

  if (!Number.isInteger(week) || week < 1) {
    console.error("Usage: npx tsx scripts/poll-once.ts <week> [baseUrl]");
    process.exit(1);
  }

  console.log(`Polling week ${week} once against ${baseUrl}.`);

  await run("npx", ["tsx", "scripts/load-week-games.ts", String(week)]);
  await run("npx", ["tsx", "scripts/load-week-stats.ts", String(week)]);
  const scoreResult = await postJson(`${baseUrl}/api/week/${week}/score`);
  console.log("score response:", scoreResult);

  if (await isWeekFullyFinal(week)) {
    console.log(`Week ${week} is fully FINAL. Running prices...`);
    const pricesResult = await postJson(`${baseUrl}/api/week/${week}/prices`);
    console.log("prices response:", pricesResult);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
