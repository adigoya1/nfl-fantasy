# FGL (Fantasy Gridiron League)

An FPL-style fantasy football game built around real NFL players and the
32 NFL teams. Branded "FGL" rather than "NFL Fantasy" deliberately -- the
app uses real NFL player/team data internally (completely normal for any
fantasy platform), but naming the product itself after the NFL's own
trademarked name isn't, once this has a real public URL people click into.

This started as the NFL pivot of an earlier SEC-college-football version of
the same app; the core architecture (data model, scoring engine, pricing
engine, UI layout) carries over almost unchanged — the big win of moving to
the NFL is that **real season projections already exist** for every player,
so pricing no longer needs the recruiting-rating/depth-chart workarounds
the college version needed.

## What's here

- `prisma/schema.prisma` — the data model. Same shape as before, with `Team`
  now carrying `conference` ("AFC"/"NFC") and `division` (e.g. "AFC East").
- `lib/scoring.ts` — standard PPR scoring (point-per-reception, matching
  ESPN/Yahoo/Sleeper defaults) plus an FPL-style bonus-points layer on top.
  Unit tested in `lib/scoring.test.ts`.
- `lib/pricing.ts` — preseason pricing driven by real ESPN projections
  (see "How pricing works" below), and the same weekly demand + performance
  hybrid price-change algorithm as before for in-season updates.
- `lib/rankings.ts` — overall/week leaderboard math (unchanged, sport-agnostic).
- `lib/nflTeams.ts` — the 32 NFL teams plus the ESPN proTeamId -> team
  mapping `scripts/load-players.ts` needs to link players to teams.
- `pages/api/week/[week]/score.ts`, `.../prices.ts` — unchanged stub
  jobs for weekly scoring/pricing once a week's games are final.
- `pages/api/leaderboard/[week].ts`, `pages/leaderboard.tsx`,
  `pages/my-team.tsx` — unchanged UI/API, sport-agnostic.
- `scripts/load-players.ts` — real ETL against ESPN's fantasy football API
  (no key needed — see below).
- `scripts/load-week-games.ts` — real weekly schedule + scores from ESPN's
  public site scoreboard API (no key, no league needed).
- `scripts/load-week-stats.ts` — real weekly per-player box score stats
  (passing/rushing/receiving/kicking/D-ST) from ESPN's public site summary
  API, turned into `PlayerGameStat` rows that `pages/api/week/[week]/score.ts`
  then scores.

- `lib/roster.ts` — squad/lineup rules: a **13-man squad** (9 starters + 4
  bench, with 1 FLEX slot) and an **$85M budget cap**, shared by the API
  routes and the My Team page. Unit tested in `lib/roster.test.ts`. Note:
  this also fixes an arithmetic bug in the original design doc, which
  listed 3 starting WRs (summing to 10 starters) while also saying "9
  starters" — the corrected, standard-fantasy-football version uses 2
  starting WRs.
  - The budget was recalibrated from $100M to $85M when the squad shrank
    from 15 to 13 players. Against `POSITION_PRICE_RANGES` in
    `lib/pricing.ts`, $100M covered ~76% of the range from the cheapest to
    the most expensive possible 13-man squad (vs. ~54% for the old 15-man
    squad) — which is why an early demo squad could nearly max out every
    position. $85M lands back at ~52%, close enough to the original
    scarcity to feel the same, and a rounder number than the ~$87M an exact
    proportional scaling would give. The position price ranges themselves
    didn't need to change, since they price a player relative to others at
    their own position, independent of squad size.
- `lib/chips.ts` — the chip system: **Captain**, **Bench Boost**, and
  **Free Hit**, each usable exactly once per team per season (see "How
  chips work" below). Unit tested in `lib/chips.test.ts`.
- `lib/freeHit.ts` — Free Hit's auto-revert logic: snapshotting a team's
  roster/budget/free-transfers on activation, and deciding when a week
  counts as fully over. Unit tested in `lib/freeHit.test.ts`.
- `lib/preseason.ts` — decides whether Week 1 transfers are still free and
  unlimited (see "How preseason transfers work" below). Unit tested in
  `lib/preseason.test.ts`.
- `pages/api/fantasy-team/[id]/index.ts`, `.../lineup.ts`, `.../transfers.ts`,
  `.../chips.ts` — real roster CRUD: fetch a team's roster + chip usage +
  preseason status, set starters (server-side validated against
  `lib/roster.ts`), execute a transfer (budget + free-transfer/point-hit
  accounting, waived during an active Free Hit week or the Week 1 preseason
  window), and activate a chip.
- `pages/api/players/index.ts` — player search/filter, used by the
  Transfers page.
- `pages/my-team.tsx`, `pages/transfers.tsx` — real pages backed by the
  above, replacing the old hard-coded sample data.
- `scripts/seed-demo-team.ts` — drafts a real, valid, budget-respecting
  13-man squad from whatever players `load-players.ts` already loaded, so
  there's something real to click around in without manually picking 13
  players by hand. Dev/testing convenience -- real managers build their
  squad by hand on `/build-squad` instead (see below), since auto-drafting
  every real team tended to produce bland squads padded with cheap,
  replacement-level players.
- `lib/autoDraft.ts` — the auto-draft logic (valid squad + starting lineup
  from a pool of players), used by `seed-demo-team.ts` and also by
  `pages/api/fantasy-team/[id]/squad-slots.ts` to auto-pick a *starting
  lineup* (not the squad itself) the instant a manually-built squad hits
  13 players.
- `pages/build-squad.tsx`, `pages/api/fantasy-team/[id]/squad-slots.ts` —
  where a new team actually gets its players: add/remove one at a time,
  position by position, against the real budget and position caps, until
  the squad hits 13.
- `pages/api/auth/[...nextauth].ts`, `lib/auth.ts` — Google sign-in via
  NextAuth (JWT sessions, no adapter/extra tables needed), plus a small
  helper API routes use to check who's signed in.
- `pages/_app.tsx` — wraps every page in NextAuth's `SessionProvider`.
  Didn't exist before, which also meant `styles/globals.css` was never
  actually imported anywhere -- both fixed by this one file.
- `pages/api/fantasy-team/index.ts`, `pages/api/fantasy-team/mine.ts`,
  `pages/create-team.tsx` — self-serve team creation tied to a signed-in
  Google account, and a way for `/my-team`/`/transfers` to resolve "your
  team" from your session instead of a URL (see "How people get their own
  team" below).
- `pages/index.tsx` — landing page (the site root used to 404 with nothing
  here) linking to sign-in / My Team / the Leaderboard depending on session
  state.

## How chips work

There's no default weekly captain anymore — most weeks, every starter just
scores their normal points. Instead there are three chips, each usable
**exactly once per team, for the whole season** (enforced by a unique
constraint on `(fantasyTeamId, chip)` in the DB, and re-checked in
`lib/chips.ts`):

- **Captain** — doubles one starter's points for a single week you
  choose. On the My Team page, click "Activate" under Captain, then click
  the starter you want to name captain.
- **Bench Boost** — for one week, all 4 bench players also score
  (normally only the 9 starters count).
- **Free Hit** — for one week, transfers are unlimited and free (no
  point-hit, doesn't consume a free transfer), and every change
  automatically reverts once that week ends. **Not usable in Week 1**
  (`MIN_FREE_HIT_WEEK` in `lib/chips.ts`) — with a freshly drafted squad,
  there's nothing yet for Free Hit to temporarily fix, so activating it
  Week 1 would just burn the season's only use for no benefit.

Only one chip can be active for a team in any given week. The
leaderboard route (`pages/api/leaderboard/[week].ts`) is chip-aware for
both the current week and every past week, since chip usage is a permanent
per-week record.

**How Free Hit's auto-revert works:** activating Free Hit
(`lib/freeHit.ts`) takes a snapshot of the team's roster, `budgetRemaining`,
and `freeTransfers` at that exact moment, before any transfers happen under
it. `pages/api/week/[week]/score.ts` — the same endpoint the weekly
stats pipeline already polls every few minutes during game windows — checks
on every run whether that week's games have *all* gone FINAL, and if
so, restores any pending snapshot: RosterSlot rows are replaced with the
pre-Free-Hit roster, and budget/free-transfers are reset. No separate cron
job needed; it rides along with scoring.

Two things worth knowing:
- **Activate Free Hit before making that week's transfers.** The
  snapshot captures whatever the roster looks like at activation time, so a
  transfer made before activating won't be undone.
- **Run `load-week-games.ts` for the entire week**, not just the games you
  care about, before relying on this. The revert check looks at every `Game`
  row for the week; a game that was never loaded at all is indistinguishable
  from "no games left," which would revert prematurely.

## How preseason transfers work

Before Week 1's opener has actually kicked off, transfers are unlimited
and free -- no point-hit, and `freeTransfers` doesn't move -- since there's
no real squad performance to protect yet (`lib/preseason.ts`,
`isPreseasonTransferWindow`). This only ever applies to Week 1: once the
first Week 1 game kicks off, the normal free-transfer economy takes over
for the rest of Week 1 and every week after.

The check is date-based against the real `Game.kickoffAt` for Week 1's
earliest game (loaded by `scripts/load-week-games.ts`), not a hardcoded
flag -- so it turns itself off automatically once the season starts. If
Week 1's schedule hasn't been loaded yet at all, it's treated as still
preseason (there's certainly no game to have kicked off). Both
`pages/api/fantasy-team/[id]/transfers.ts` (to decide the actual point-hit)
and `pages/api/fantasy-team/[id]/index.ts` (to show "Unlimited transfers"
on the My Team / Transfers pages before a manager even attempts one) check
this the same way.

## How people get their own team

Real accounts now, via Google sign-in (NextAuth, `pages/api/auth/[...nextauth].ts`)
— not a shareable link. Visiting `/create-team` (linked from the homepage)
prompts sign-in first, then lets you type a team name; the team is created
empty (full $85M budget, zero roster) and you're sent to `/build-squad` to
pick your actual 13 players, position by position (`POST`/`DELETE
/api/fantasy-team/[id]/squad-slots`). The moment your squad hits 13, a
starting lineup is auto-picked for you (`lib/autoDraft.ts`'s `pickStarters`,
favoring your priciest players) so `/my-team` isn't a confusing "0 starters"
screen — change who's starting from there the normal way any time. The team
is tied to your Google account's email —
`/my-team` and `/transfers` resolve "your team" from your session
(`GET /api/fantasy-team/mine`), and every mutating route (`squad-slots.ts`,
`transfers.ts`, `chips.ts`, `lineup.ts`) checks that the signed-in account
actually owns the team before allowing a change, returning 403 otherwise.
One team per account; trying to create a second just takes you back to your
existing one. `/my-team` and `/transfers` also both redirect to
`/build-squad` automatically if your squad isn't at 13 players yet.

Since Week 1 preseason transfers are unlimited and free (see "How preseason
transfers work" above), the auto-draft doesn't need to be a real draft --
managers can freely reshape whatever they're handed via Transfers before the
season's opener kicks off.

Every team created this way shows up automatically on `/leaderboard` and
`/api/leaderboard/[week]`, which already ranks *all* `FantasyTeam` rows
against each other — nothing extra needed there for a league to work once
more than one team exists. The leaderboard itself is still public/unauthenticated
by design — you want rivals to see each other's scores.

**Deliberately not enforced:** an invite-only league (anyone with a Google
account can make a team and show up on the leaderboard) or admin tools to
remove/rename a team. Fine for a friend league behind an unlisted URL; add
an allowlist of emails in the NextAuth `signIn` callback if you want to
lock it down further.

### Setting up Google sign-in

You need your own Google OAuth credentials — free, but you have to create
them yourself (nobody else can do this part for you):

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and
   create a new project (or reuse one you already have).
2. In the left sidebar: **APIs & Services -> OAuth consent screen**. Choose
   **External**, fill in an app name (e.g. "NFL Fantasy") and your email for
   the required fields, and save. You can leave it in "Testing" mode and
   just add your friends' Google emails as test users — no need to publish
   it for a private league.
3. **APIs & Services -> Credentials -> Create Credentials -> OAuth client
   ID**. Application type: **Web application**.
4. Under **Authorized redirect URIs**, add:
   - `http://localhost:3000/api/auth/callback/google` (for local dev)
   - `https://your-vercel-url.vercel.app/api/auth/callback/google` (once
     you've deployed — see "Making it public" below; you can add this one
     later and edit it after you know your real Vercel URL)
5. Click **Create**. Copy the **Client ID** and **Client Secret** it gives
   you into your `.env`:
   ```
   GOOGLE_CLIENT_ID="...apps.googleusercontent.com"
   GOOGLE_CLIENT_SECRET="..."
   ```
6. Also make sure `NEXTAUTH_SECRET` is set to a real random value (not the
   placeholder) — generate one with `openssl rand -base64 32`, or any
   random 32+ character string. `NEXTAUTH_URL` should match whatever
   origin you're running on (`http://localhost:3000` locally; your Vercel
   URL in production — Vercel sets this automatically if you don't).
7. Restart `npm run dev`. Visiting the site and clicking "Sign in with
   Google" should now work.

If you deploy to Vercel before finishing step 4's second redirect URI, sign-in
will fail there with a "redirect_uri_mismatch" error until you add it — that
error message itself tells you the exact URI Google expected, which you can
copy straight into the Google Cloud Console.

## What's *not* here (on purpose)

- An invite-only/allowlisted league — see the note above.
- Multiple teams per Google account, or a team-transfer/ownership-handoff
  flow.
- Redis caching — add it once live-game traffic is actually a problem.
- Transfers that change a player's position (e.g. swapping a WR in for an
  RB) — the transfers API only allows like-for-like position swaps for now,
  since that sidesteps needing to re-validate full squad composition on
  every transfer. Worth lifting once someone actually wants to change
  formation via transfers.

## Getting started

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL at minimum
npx prisma migrate dev --name init
npm run seed                # loads the 32 NFL teams
npm run dev                 # http://localhost:3000
```

## Making it public (so friends can actually reach it)

Running on `localhost:3000` only your own machine can see it. The easiest
way to make it a real, public site your league can use is [Vercel](https://vercel.com)
— it's built by the Next.js team, has a free tier that's plenty for a
friend league, and needs no server management:

1. Push this project to a GitHub repo, if it isn't already
   (`git init && git add -A && git commit -m "init"`, create a repo on
   GitHub, `git remote add origin <url> && git push -u origin main`).
2. Go to [vercel.com](https://vercel.com), sign in with GitHub, click
   **Add New Project**, and import that repo.
3. Before deploying, add these environment variables in Vercel's project
   settings — same values as your local `.env`:
   `DATABASE_URL` (your Neon connection string — Neon's already a cloud
   database, so both your laptop and Vercel talk to the same one),
   `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. You can
   skip `NEXTAUTH_URL` — Vercel sets it automatically to your deployment URL.
4. Click **Deploy**. A few minutes later you'll have a public URL like
   `https://nfl-fantasy-yourname.vercel.app` — that's the link to send your
   league.
5. Go back to Google Cloud Console (see "Setting up Google sign-in" above)
   and add `https://<your-real-vercel-url>/api/auth/callback/google` to the
   OAuth client's Authorized redirect URIs — sign-in will fail on the
   deployed site until you do this one extra step.

Two things worth knowing:
- `npm run poll:week` (see below) still runs from your own machine and
  writes straight to the same Neon database, so it works exactly the same
  whether the site itself is on `localhost` or deployed — just pass the
  public URL as its third argument so the `/score`/`/prices` calls land on
  the live site: `npm run poll:week -- 1 3 https://nfl-fantasy-yourname.vercel.app`.
- This still isn't real auth — anyone with a team's link can manage it, and
  anyone who finds the site can make a new team. Fine for a friend league
  behind an unguessable Vercel URL; add NextAuth first if that's not enough.

## Loading real players

No API key needed — just run:

```bash
npm run load:players
```

This fetches ESPN's full fantasy player pool (all active NFL players plus
each team's D/ST as its own draftable entity), pulls each player's
**ESPN-projected season fantasy points** and **ESPN PPR draft rank**,
computes a real preseason price per player, and upserts everything into the
database. Safe to re-run — players are keyed by `externalId`.

### How pricing works

Unlike the college-football version, there's no need to reconstruct "is
this player going to play" from recruiting ratings and scraped depth
charts — ESPN's own projections already bake in beat-writer reporting, camp
battles, and injury designations. So `computePreseasonPrice()` weighs:

- **85%** the player's ESPN-projected season fantasy points, normalized
  within their position group
- **15%** the player's ESPN PPR draft rank (inverted so a better rank = a
  higher score), as a smoothing signal on top of the raw projection

Each position still gets its own price ceiling (`POSITION_PRICE_RANGES` in
`lib/pricing.ts`) so kickers and defenses — lower-scoring, less-variable
positions — don't price like a star WR just because they're #1 within a
small position pool.

### A caveat worth taking seriously

`scripts/load-players.ts` hits `lm-api-reads.fantasy.espn.com`, which is
**not an official public API** — it's the same endpoint ESPN's own fantasy
app uses internally, reverse-engineered by the open-source fantasy
community (this script's request shape is verified against the
[`espn-api`](https://github.com/cwendt94/espn-api) Python library's
source). It's free and needs no login for this particular data, and it's
widely used by hobby projects, but ESPN could change the response shape at
any time without notice.

To guard against a silent breakage, the script counts how many players got
a real nonzero projection and prints a loud warning if that number looks
too low — if you see that warning, check `extractProjectedPoints()` and
`extractDraftRank()` in `scripts/load-players.ts` against a fresh look at
the actual API response before trusting the prices it produced.

### Manual price corrections

For anything even a real projection can't capture — breaking injury or
trade news after ESPN's projection last ran, a training-camp depth chart
surprise — edit `data/price-overrides.json`:

```json
[
  { "name": "Some Player", "team": "Kansas City Chiefs", "price": 7.5, "reason": "Named starter after camp battle" }
]
```

`name` and `team` must match exactly what's in the database (check
`npx prisma studio` if unsure). Re-run `npm run load:players` after editing
this file — overrides are re-applied every time.

## Weekly stats pipeline (once the season starts)

Run these two scripts in order, then hit the existing scoring API:

```bash
npx tsx scripts/load-week-games.ts 1    # schedule + scores for week 1
npx tsx scripts/load-week-stats.ts 1    # box score stats for week 1
curl -X POST http://localhost:3000/api/week/1/score
```

(`npm run load:week-games -- 1` / `npm run load:week-stats -- 1` work too —
note the `--` before the week number when going through npm.)

**This also works live, not just after games end.** All three steps pick up
`IN_PROGRESS` games, not just `FINAL` ones — re-run the same three commands
every 2-5 minutes during game windows (Sunday afternoons, etc.) and scores
update as the games do, powering the "Live Week" view from the design
doc's UI section. The scoring endpoint's response includes a `provisional`
boolean when any of that week's included games are still `IN_PROGRESS`, so
the frontend can label live numbers accordingly instead of presenting them
as final. Once ESPN marks a game `FINAL`, the next `load-week-games.ts` run
picks that up automatically and `provisional` drops to `false` once all of
that week's games are done.

A real deployment would put this on a short interval (Vercel Cron / GitHub
Actions) rather than running it by hand — see section 7.1 of the design
doc.

### Running it live: `scripts/poll-live-week.ts`

Rather than re-typing the three commands above every few minutes during a
real game window, run:

```bash
npm run poll:week -- 1        # poll week 1 every 3 minutes (default)
npm run poll:week -- 1 5      # every 5 minutes instead
```

Leave it running in its own terminal (alongside `npm run dev` in another).
It loops `load-week-games.ts` -> `load-week-stats.ts` -> `POST /score`
automatically, then — the moment every game in the week has gone
`FINAL` — calls `POST /prices` exactly **once** and stops itself.

That "exactly once" matters: `/prices` measures each player's price move
against their price at the *start* of the week, so calling it again mid-week
(the way `/score` is meant to be re-run) would apply that week's performance
more than once and make prices drift too far. This is why the poller — not
a naive "run everything on the same interval" cron — is the right shape for
this job even in a real deployment (Vercel Cron would call `/score` on a
short interval and a separate once-a-week cron for `/prices`, timed for
after the week's last game).

If ESPN's response shape ever changes silently, both `load-week-games.ts`
and `load-week-stats.ts` print a loud warning (a low game-match rate, or
>30% of box-score athletes not matching a `Player` row) — the poller will
keep printing those warnings on every cycle until you fix it, rather than
failing silently.

`load-week-games.ts` and `load-week-stats.ts` deliberately use ESPN's
**public site API** (`site.api.espn.com`, the same data ESPN.com's own
scoreboard/box-score pages read from) rather than the internal fantasy API
`load-players.ts` uses. Getting real weekly per-player stats out of the
fantasy API turns out to require a real ESPN league id (confirmed by
reading the `espn-api` library's source — its `box_scores()`/`free_agents()`
methods all hit `leagues/{leagueId}` endpoints), so the public site API is
the more robust, key-free choice for this job.

**Known simplifications**, both documented in `load-week-stats.ts`:

- Field goal distance isn't broken out by this box score view (just a
  single "made/attempted" total), so every made FG scores as the 40-49
  yard tier (4 pts) rather than its real distance. Real per-kick distance
  would need play-by-play parsing — a reasonable future improvement.
- 2-point conversions aren't in this view and default to 0. Rare enough to
  be a minor gap; use a `data/price-overrides.json`-style manual fix if one
  ever actually matters for your league.

**Important caveat:** this pipeline's *shape* was verified against a real
completed 2025 game before shipping, but the 2026 season hadn't started yet
as of writing this, so it hasn't been run against real 2026 data. Both
scripts print self-diagnostic warnings (a low game-to-team match rate in
`load-week-games.ts`, a low player-match rate in `load-week-stats.ts`) to
catch silent breakage — if either fires on your first real week, check a
specific known player/game in the raw ESPN response before trusting the
output.

## Running the logic tests

```bash
npm test
```

## Suggested next steps

1. ~~Load real players and generate real preseason prices~~ — done by
   `scripts/load-players.ts`.
2. ~~Write the weekly in-season stats job~~ — done by
   `scripts/load-week-games.ts` + `scripts/load-week-stats.ts` (see above);
   verify against real data once Week 1 games actually go FINAL.
3. Point a scheduler (Vercel Cron / GitHub Actions) at
   `load-week-games.ts` → `load-week-stats.ts` → `POST /api/week/[week]/score`
   → `POST /api/week/[week]/prices`, in that order, once a week.
4. Build real roster-management UI (drag/drop lineup + transfers) on top of
   `RosterSlot` and `Transfer`.
