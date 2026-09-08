import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useSession, signIn } from "next-auth/react";
import { Position, Chip } from "@prisma/client";
import { validateLineup, RosterPlayer, STARTER_REQUIREMENTS, FLEX_ELIGIBLE } from "../lib/roster";
import { ALL_CHIPS, MIN_FREE_HIT_WEEK } from "../lib/chips";
import { ABBR_BY_TEAM_NAME } from "../lib/nflTeams";
import Layout from "../components/Layout";

/**
 * Real My Team page, backed by /api/fantasy-team/[id]. Team ownership is
 * now the signed-in Google session, not a ?teamId= link (see
 * pages/api/fantasy-team/mine.ts) -- signed-out visitors get a sign-in
 * prompt, and signed-in visitors with no team yet get sent to
 * /create-team.
 *
 * Interaction model (deliberately simple, no drag-and-drop library):
 *   1. Click a bench player to stage it as "coming in".
 *   2. Click a starter to swap it out for the staged bench player. The
 *      swap is validated client-side with the exact same lib/roster.ts
 *      logic the API uses, so illegal swaps (e.g. bringing in a 3rd
 *      starting WR when the FLEX slot's already taken by an RB) are
 *      rejected immediately with an explanation.
 *   3. "Save Lineup" posts the whole thing to the API.
 *   4. Chips (Captain / Bench Boost / Free Hit) are each usable once per
 *      season and activated separately, below -- there's no default weekly
 *      captain anymore. Activating Captain switches the page into
 *      "pick a captain" mode: click one of your current starters to name
 *      them captain for the week you entered.
 *
 * Styled as an FPL-style "pitch" -- starters sit on a green pitch background
 * grouped by position, bench sits below as a separate strip, echoing the
 * official Fantasy Premier League team view.
 */

interface RosterEntry {
  rosterSlotId: string;
  isStarter: boolean;
  benchOrder: number | null;
  player: {
    id: string;
    name: string;
    position: Position;
    currentPrice: number;
    photoUrl: string | null;
    team: { name: string };
  };
}

interface ChipUsageEntry {
  chip: Chip;
  week: number;
  captainPlayerId: string | null;
}

interface TeamResponse {
  id: string;
  name: string;
  budgetRemaining: number;
  freeTransfers: number;
  preseasonActive: boolean;
  squadComplete: boolean;
  roster: RosterEntry[];
  chipUsages: ChipUsageEntry[];
}

const POSITION_ORDER: Position[] = [Position.QB, Position.RB, Position.WR, Position.TE, Position.K, Position.DEF];

const CHIP_LABELS: Record<Chip, string> = {
  CAPTAIN: "Captain",
  BENCH_BOOST: "Bench Boost",
  FREE_HIT: "Free Hit",
};

const POSITION_ACCENT: Record<Position, string> = {
  QB: "bg-fpl-pink",
  RB: "bg-fpl-green",
  WR: "bg-sky-400",
  TE: "bg-amber-400",
  K: "bg-slate-400",
  DEF: "bg-fpl-purpleLight",
};

type CardStat = "opponent" | "price";

interface FixtureInfo {
  opponentAbbr: string;
  isHome: boolean;
}

/** What to print on a player card's bottom line for the selected view. */
function statText(entry: RosterEntry, cardStat: CardStat, fixturesByTeam: Record<string, FixtureInfo | undefined>): string {
  if (cardStat === "price") return `$${entry.player.currentPrice.toFixed(1)}M`;
  const fixture = fixturesByTeam[entry.player.team.name];
  if (!fixture) return "BYE";
  return `${fixture.isHome ? "vs" : "@"} ${fixture.opponentAbbr}`;
}

function PlayerCard({
  entry,
  cardStat,
  fixturesByTeam,
  isPendingIn,
  isCaptainPick,
  isFlex,
  onClick,
}: {
  entry: RosterEntry;
  cardStat: CardStat;
  fixturesByTeam: Record<string, FixtureInfo | undefined>;
  isPendingIn?: boolean;
  isCaptainPick?: boolean;
  isFlex?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`relative rounded-xl shadow-md w-32 sm:w-36 text-center cursor-pointer transition overflow-hidden ${
        isPendingIn
          ? "ring-4 ring-yellow-400"
          : isCaptainPick
          ? "ring-4 ring-fpl-green"
          : "hover:-translate-y-0.5 hover:shadow-lg"
      }`}
    >
      <div className={`h-1.5 ${POSITION_ACCENT[entry.player.position]}`} />
      <div className="bg-white px-2 py-2">
        <div className="text-[10px] text-gray-400 flex justify-center gap-1 uppercase tracking-wide">
          <span>{ABBR_BY_TEAM_NAME[entry.player.team.name] ?? entry.player.team.name}</span>
          {isFlex && <span className="text-fpl-purple font-bold">FLEX</span>}
        </div>
        <div className="font-semibold text-sm truncate text-gray-800">{entry.player.name}</div>
        <div className="text-xs text-gray-500">{statText(entry, cardStat, fixturesByTeam)}</div>
      </div>
    </div>
  );
}

export default function MyTeamPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [teamId, setTeamId] = useState<string | undefined>(undefined);
  const [resolvingTeam, setResolvingTeam] = useState(true);

  const [team, setTeam] = useState<TeamResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Resolve "my team" from the session, instead of a ?teamId= query param.
  useEffect(() => {
    if (sessionStatus === "loading") return;
    if (!session) {
      setResolvingTeam(false);
      return;
    }
    fetch("/api/fantasy-team/mine")
      .then(async (res) => {
        if (res.status === 404) {
          router.push("/create-team");
          return;
        }
        const data = await res.json();
        setTeamId(data.id);
      })
      .finally(() => setResolvingTeam(false));
  }, [session, sessionStatus]);

  const [starterIds, setStarterIds] = useState<Set<string>>(new Set());
  const [pendingInId, setPendingInId] = useState<string | null>(null);
  const [swapError, setSwapError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [week, setWeek] = useState(1);
  const [pickingCaptain, setPickingCaptain] = useState(false);
  const [chipMessage, setChipMessage] = useState<string | null>(null);
  const [chipBusy, setChipBusy] = useState(false);

  // What each player card's bottom line shows -- defaults to the week's
  // opponent (the more useful view when setting a lineup) rather than price.
  const [cardStat, setCardStat] = useState<CardStat>("opponent");
  const [fixturesByTeam, setFixturesByTeam] = useState<Record<string, FixtureInfo | undefined>>({});

  useEffect(() => {
    fetch(`/api/games/${week}`)
      .then((res) => res.json())
      .then((data: { games: { homeTeam: string; awayTeam: string }[] }) => {
        const byTeam: Record<string, FixtureInfo> = {};
        for (const g of data.games ?? []) {
          byTeam[g.homeTeam] = { opponentAbbr: ABBR_BY_TEAM_NAME[g.awayTeam] ?? g.awayTeam, isHome: true };
          byTeam[g.awayTeam] = { opponentAbbr: ABBR_BY_TEAM_NAME[g.homeTeam] ?? g.homeTeam, isHome: false };
        }
        setFixturesByTeam(byTeam);
      })
      .catch(() => setFixturesByTeam({}));
  }, [week]);

  function loadTeam() {
    if (!teamId) return;
    setLoading(true);
    fetch(`/api/fantasy-team/${teamId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load team");
        return res.json() as Promise<TeamResponse>;
      })
      .then((data) => {
        if (!data.squadComplete) {
          router.push("/build-squad");
          return;
        }
        setTeam(data);
        setStarterIds(new Set(data.roster.filter((r) => r.isStarter).map((r) => r.player.id)));
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(loadTeam, [teamId]);

  const squad: RosterPlayer[] = useMemo(
    () => team?.roster.map((r) => ({ id: r.player.id, position: r.player.position, currentPrice: r.player.currentPrice })) ?? [],
    [team]
  );

  // Which starters are filling their position's fixed slots vs the FLEX slot,
  // purely for display -- same logic validateLineup uses internally.
  const flexPlayerId = useMemo(() => {
    if (!team) return null;
    const remaining = team.roster.filter((r) => starterIds.has(r.player.id)).map((r) => r.player);
    for (const position of Object.keys(STARTER_REQUIREMENTS) as Position[]) {
      const atPosition = remaining.filter((p) => p.position === position).slice(0, STARTER_REQUIREMENTS[position]);
      for (const chosen of atPosition) {
        const idx = remaining.findIndex((p) => p.id === chosen.id);
        remaining.splice(idx, 1);
      }
    }
    return remaining.find((p) => FLEX_ELIGIBLE.includes(p.position))?.id ?? null;
  }, [team, starterIds]);

  if (sessionStatus === "loading" || resolvingTeam) {
    return (
      <Layout title="FGL — My Team">
        <p className="text-center text-gray-400">Loading...</p>
      </Layout>
    );
  }

  if (!session) {
    return (
      <Layout title="FGL — My Team">
        <div className="max-w-md mx-auto bg-white rounded-2xl shadow-sm border p-10 text-center">
          <h1 className="text-2xl font-bold mb-2 text-fpl-purple">My Team</h1>
          <p className="text-gray-500 mb-6">Sign in with Google to see your team.</p>
          <button
            onClick={() => signIn("google", { callbackUrl: "/my-team" })}
            className="bg-fpl-purple text-white px-5 py-2.5 rounded-full font-semibold hover:brightness-110 transition"
          >
            Sign in with Google
          </button>
        </div>
      </Layout>
    );
  }

  if (!teamId) {
    // Session resolved but no team yet -- the effect above already redirects
    // to /create-team; this is just what renders in the brief gap before that.
    return (
      <Layout title="FGL — My Team">
        <p className="text-center text-gray-400">Taking you to create your team...</p>
      </Layout>
    );
  }

  if (loading) {
    return (
      <Layout title="FGL — My Team">
        <p className="text-center text-gray-400">Loading...</p>
      </Layout>
    );
  }
  if (error || !team) {
    return (
      <Layout title="FGL — My Team">
        <p className="text-center text-red-600">Error: {error}</p>
      </Layout>
    );
  }

  function handleCardClick(playerId: string, isStarter: boolean) {
    if (pickingCaptain) {
      if (isStarter) handleActivateCaptain(playerId);
      return;
    }
    if (isStarter) {
      handleStarterClick(playerId);
    } else {
      handleBenchClick(playerId);
    }
  }

  function handleBenchClick(playerId: string) {
    setSwapError(null);
    setSaveMessage(null);
    setPendingInId((current) => (current === playerId ? null : playerId));
  }

  function handleStarterClick(outgoingPlayerId: string) {
    setSaveMessage(null);
    if (!pendingInId) return; // clicking a starter with nothing staged does nothing
    const candidate = new Set(starterIds);
    candidate.delete(outgoingPlayerId);
    candidate.add(pendingInId);
    const check = validateLineup(squad, Array.from(candidate));
    if (!check.valid) {
      setSwapError(check.errors.join(" "));
      return;
    }
    setSwapError(null);
    setStarterIds(candidate);
    setPendingInId(null);
  }

  async function handleSave() {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch(`/api/fantasy-team/${teamId}/lineup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starterPlayerIds: Array.from(starterIds) }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.details?.join(" ") ?? body.error ?? "Save failed");
      setSaveMessage("Lineup saved.");
    } catch (e: any) {
      setSaveMessage(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function activateChip(chip: Chip, captainPlayerId?: string) {
    setChipBusy(true);
    setChipMessage(null);
    try {
      const res = await fetch(`/api/fantasy-team/${teamId}/chips`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chip, week, captainPlayerId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't activate chip");
      setChipMessage(`${CHIP_LABELS[chip]} activated for week ${week}.`);
      loadTeam();
    } catch (e: any) {
      setChipMessage(`Error: ${e.message}`);
    } finally {
      setChipBusy(false);
      setPickingCaptain(false);
    }
  }

  function handleActivateCaptain(playerId: string) {
    activateChip(Chip.CAPTAIN, playerId);
  }

  const usedChips = new Set(team.chipUsages.map((u) => u.chip));

  const starters = team.roster.filter((r) => starterIds.has(r.player.id));
  const bench = team.roster
    .filter((r) => !starterIds.has(r.player.id))
    .sort((a, b) => (a.benchOrder ?? 99) - (b.benchOrder ?? 99));

  return (
    <Layout title={`FGL — ${team.name}`}>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-fpl-purple">{team.name}</h1>
        <div className="flex gap-2 text-sm items-center flex-wrap">
          <span className="bg-fpl-green/20 text-fpl-purple font-semibold px-3 py-1 rounded-full">
            Budget left: ${team.budgetRemaining.toFixed(1)}M
          </span>
          {team.preseasonActive ? (
            <span className="bg-fpl-pink/10 text-fpl-pink font-semibold px-3 py-1 rounded-full">
              Unlimited transfers (preseason)
            </span>
          ) : (
            <span className="bg-fpl-purple/10 text-fpl-purple font-semibold px-3 py-1 rounded-full">
              Free transfers: {team.freeTransfers}
            </span>
          )}
          <a
            href="/transfers"
            className="bg-fpl-purple text-white text-sm font-medium px-3 py-1.5 rounded-full hover:brightness-110 transition"
          >
            Make a transfer &rarr;
          </a>
        </div>
      </div>

      <div className="flex justify-end items-center gap-4 mb-6 flex-wrap text-sm">
        <label className="text-gray-500 flex items-center gap-2">
          Week
          <input
            type="number"
            min={1}
            value={week}
            onChange={(e) => setWeek(Number(e.target.value) || 1)}
            className="w-16 border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-fpl-purple/30 focus:border-fpl-purple"
          />
        </label>
        <label className="text-gray-500 flex items-center gap-2">
          View
          <select
            value={cardStat}
            onChange={(e) => setCardStat(e.target.value as CardStat)}
            className="border border-gray-300 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-fpl-purple/30 focus:border-fpl-purple"
          >
            <option value="opponent">Opponent</option>
            <option value="price">Price</option>
          </select>
        </label>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border overflow-hidden mb-6">
        <div className="px-4 py-3 bg-fpl-purple/5 border-b">
          <h2 className="text-sm font-bold text-fpl-purple uppercase tracking-wide">Chips</h2>
        </div>
        <div className="p-4">
          {pickingCaptain && (
            <div className="bg-fpl-purple/10 text-fpl-purple text-sm rounded-lg p-2.5 mb-3">
              Click a starter below to name them Captain for week {week} (2x points that week only).{" "}
              <button className="underline font-medium" onClick={() => setPickingCaptain(false)}>
                Cancel
              </button>
            </div>
          )}
          <div className="flex gap-3 flex-wrap">
            {ALL_CHIPS.map((chip) => {
              const usage = team.chipUsages.find((u) => u.chip === chip);
              const isUsed = usedChips.has(chip);
              const blockedThisWeek = chip === Chip.FREE_HIT && week < MIN_FREE_HIT_WEEK;
              return (
                <div key={chip} className="border rounded-xl px-3 py-2 text-sm min-w-[8rem]">
                  <div className="font-semibold text-gray-700">{CHIP_LABELS[chip]}</div>
                  {isUsed ? (
                    <div className="text-xs text-gray-400">Used, week {usage!.week}</div>
                  ) : blockedThisWeek ? (
                    <div className="text-xs text-gray-400 mt-1">Available from Week {MIN_FREE_HIT_WEEK}</div>
                  ) : chip === Chip.CAPTAIN ? (
                    <button
                      disabled={chipBusy}
                      onClick={() => setPickingCaptain(true)}
                      className="text-xs bg-fpl-green text-fpl-purple font-bold px-2 py-1 rounded-full mt-1 disabled:opacity-50 hover:brightness-95 transition"
                    >
                      Activate
                    </button>
                  ) : (
                    <button
                      disabled={chipBusy}
                      onClick={() => activateChip(chip)}
                      className="text-xs bg-fpl-green text-fpl-purple font-bold px-2 py-1 rounded-full mt-1 disabled:opacity-50 hover:brightness-95 transition"
                    >
                      Activate
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {chipMessage && <div className="text-sm text-gray-700 mt-2">{chipMessage}</div>}
        </div>
      </div>

      {swapError && <div className="bg-red-50 text-red-700 text-sm rounded-lg p-2.5 mb-3">{swapError}</div>}
      {pendingInId && !swapError && !pickingCaptain && (
        <div className="bg-yellow-50 text-yellow-800 text-sm rounded-lg p-2.5 mb-3">
          Now click a starter to swap out for this player (or click it again to cancel).
        </div>
      )}

      <div className="pitch-bg rounded-2xl p-6 space-y-5 shadow-inner">
        {POSITION_ORDER.map((position) => {
          const atPosition = starters.filter((r) => r.player.position === position);
          if (atPosition.length === 0) return null;
          return (
            <div key={position} className="flex items-center gap-3 flex-wrap">
              <div className="w-14 text-xs font-bold text-white/80 uppercase tracking-wide">{position}</div>
              <div className="flex gap-3 flex-wrap">
                {atPosition.map((r) => (
                  <PlayerCard
                    key={r.player.id}
                    entry={r}
                    cardStat={cardStat}
                    fixturesByTeam={fixturesByTeam}
                    isFlex={flexPlayerId === r.player.id}
                    isCaptainPick={pickingCaptain}
                    onClick={() => handleCardClick(r.player.id, true)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wide mt-6 mb-2">Bench</h2>
      <div className="flex gap-3 flex-wrap bg-white rounded-2xl border p-4 shadow-sm">
        {bench.map((r) => (
          <PlayerCard
            key={r.player.id}
            entry={r}
            cardStat={cardStat}
            fixturesByTeam={fixturesByTeam}
            isPendingIn={pendingInId === r.player.id}
            onClick={() => handleCardClick(r.player.id, false)}
          />
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-fpl-purple text-white px-5 py-2.5 rounded-full font-semibold disabled:opacity-50 hover:brightness-110 transition"
        >
          {saving ? "Saving..." : "Save Lineup"}
        </button>
        {saveMessage && <span className="text-sm text-gray-700">{saveMessage}</span>}
      </div>
    </Layout>
  );
}
