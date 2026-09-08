import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useSession, signIn, signOut } from "next-auth/react";
import { Position, Chip } from "@prisma/client";
import { validateLineup, RosterPlayer, STARTER_REQUIREMENTS, FLEX_ELIGIBLE } from "../lib/roster";
import { ALL_CHIPS, MIN_FREE_HIT_WEEK } from "../lib/chips";

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

function PlayerCard({
  entry,
  isPendingIn,
  isCaptainPick,
  isFlex,
  onClick,
}: {
  entry: RosterEntry;
  isPendingIn?: boolean;
  isCaptainPick?: boolean;
  isFlex?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`border rounded-lg px-3 py-2 shadow-sm w-36 text-center cursor-pointer transition ${
        isPendingIn
          ? "bg-yellow-100 border-yellow-400 ring-2 ring-yellow-400"
          : isCaptainPick
          ? "bg-blue-50 border-blue-400 ring-2 ring-blue-400"
          : "bg-white hover:bg-gray-50"
      }`}
    >
      <div className="text-xs text-gray-500 flex justify-center gap-1">
        <span>{entry.player.team.name}</span>
        {isFlex && <span className="text-blue-600 font-semibold">FLEX</span>}
      </div>
      <div className="font-medium text-sm truncate">{entry.player.name}</div>
      <div className="text-xs text-gray-600">${entry.player.currentPrice.toFixed(1)}M</div>
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

  const [chipWeek, setChipWeek] = useState(1);
  const [pickingCaptain, setPickingCaptain] = useState(false);
  const [chipMessage, setChipMessage] = useState<string | null>(null);
  const [chipBusy, setChipBusy] = useState(false);

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
    return <main className="max-w-4xl mx-auto p-6 text-gray-500">Loading...</main>;
  }

  if (!session) {
    return (
      <main className="max-w-md mx-auto p-10 text-center">
        <h1 className="text-2xl font-bold mb-2">My Team</h1>
        <p className="text-gray-600 mb-6">Sign in with Google to see your team.</p>
        <button
          onClick={() => signIn("google", { callbackUrl: "/my-team" })}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg"
        >
          Sign in with Google
        </button>
      </main>
    );
  }

  if (!teamId) {
    // Session resolved but no team yet -- the effect above already redirects
    // to /create-team; this is just what renders in the brief gap before that.
    return <main className="max-w-4xl mx-auto p-6 text-gray-500">Taking you to create your team...</main>;
  }

  if (loading) return <main className="max-w-4xl mx-auto p-6">Loading...</main>;
  if (error || !team) return <main className="max-w-4xl mx-auto p-6 text-red-600">Error: {error}</main>;

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
        body: JSON.stringify({ chip, week: chipWeek, captainPlayerId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't activate chip");
      setChipMessage(`${CHIP_LABELS[chip]} activated for week ${chipWeek}.`);
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
    <main className="max-w-4xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6 flex-wrap gap-2">
        <h1 className="text-2xl font-bold">{team.name}</h1>
        <div className="flex gap-4 text-sm items-center">
          <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full">
            Budget left: ${team.budgetRemaining.toFixed(1)}M
          </span>
          {team.preseasonActive ? (
            <span className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full">
              Unlimited transfers (preseason)
            </span>
          ) : (
            <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full">Free transfers: {team.freeTransfers}</span>
          )}
          <a href="/transfers" className="text-blue-600 underline text-sm">
            Make a transfer &rarr;
          </a>
          <button onClick={() => signOut({ callbackUrl: "/" })} className="text-gray-500 underline text-sm">
            Sign out
          </button>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-gray-500">Chips</h2>
          <label className="text-xs text-gray-500 flex items-center gap-2">
            Week
            <input
              type="number"
              min={1}
              value={chipWeek}
              onChange={(e) => setChipWeek(Number(e.target.value) || 1)}
              className="w-16 border rounded px-1 py-0.5"
            />
          </label>
        </div>
        {pickingCaptain && (
          <div className="bg-blue-50 text-blue-800 text-sm rounded p-2 mb-3">
            Click a starter below to name them Captain for week {chipWeek} (2x points that week only).{" "}
            <button className="underline" onClick={() => setPickingCaptain(false)}>
              Cancel
            </button>
          </div>
        )}
        <div className="flex gap-3 flex-wrap">
          {ALL_CHIPS.map((chip) => {
            const usage = team.chipUsages.find((u) => u.chip === chip);
            const isUsed = usedChips.has(chip);
            const blockedThisWeek = chip === Chip.FREE_HIT && chipWeek < MIN_FREE_HIT_WEEK;
            return (
              <div key={chip} className="border rounded-lg px-3 py-2 text-sm">
                <div className="font-medium">{CHIP_LABELS[chip]}</div>
                {isUsed ? (
                  <div className="text-xs text-gray-500">Used, week {usage!.week}</div>
                ) : blockedThisWeek ? (
                  <div className="text-xs text-gray-400 mt-1">Available from Week {MIN_FREE_HIT_WEEK}</div>
                ) : chip === Chip.CAPTAIN ? (
                  <button
                    disabled={chipBusy}
                    onClick={() => setPickingCaptain(true)}
                    className="text-xs bg-blue-600 text-white px-2 py-1 rounded mt-1 disabled:opacity-50"
                  >
                    Activate
                  </button>
                ) : (
                  <button
                    disabled={chipBusy}
                    onClick={() => activateChip(chip)}
                    className="text-xs bg-blue-600 text-white px-2 py-1 rounded mt-1 disabled:opacity-50"
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

      {swapError && <div className="bg-red-50 text-red-700 text-sm rounded p-2 mb-3">{swapError}</div>}
      {pendingInId && !swapError && !pickingCaptain && (
        <div className="bg-yellow-50 text-yellow-800 text-sm rounded p-2 mb-3">
          Now click a starter to swap out for this player (or click it again to cancel).
        </div>
      )}

      <div className="bg-green-50 rounded-xl p-6 space-y-4">
        {POSITION_ORDER.map((position) => {
          const atPosition = starters.filter((r) => r.player.position === position);
          if (atPosition.length === 0) return null;
          return (
            <div key={position} className="flex items-center gap-3">
              <div className="w-14 text-xs font-bold text-gray-500">{position}</div>
              <div className="flex gap-3 flex-wrap">
                {atPosition.map((r) => (
                  <PlayerCard
                    key={r.player.id}
                    entry={r}
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

      <h2 className="text-sm font-bold text-gray-500 mt-6 mb-2">Bench</h2>
      <div className="flex gap-3 flex-wrap bg-gray-50 rounded-xl p-4">
        {bench.map((r) => (
          <PlayerCard
            key={r.player.id}
            entry={r}
            isPendingIn={pendingInId === r.player.id}
            onClick={() => handleCardClick(r.player.id, false)}
          />
        ))}
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Lineup"}
        </button>
        {saveMessage && <span className="text-sm text-gray-700">{saveMessage}</span>}
      </div>
    </main>
  );
}
