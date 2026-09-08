import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useSession, signIn } from "next-auth/react";
import { Position } from "@prisma/client";

/**
 * Real Transfers page, backed by /api/fantasy-team/[id] (to show your
 * roster) and /api/players (to search for replacements) and
 * /api/fantasy-team/[id]/transfers (to execute a swap). Team ownership is
 * the signed-in Google session, not a ?teamId= link -- same model as
 * /my-team (see pages/api/fantasy-team/mine.ts).
 *
 * Flow: click a player on your roster to select them as "outgoing", pick a
 * replacement of the same position from the search results, confirm.
 * Transfers must be like-for-like position (see the API route's comment
 * for why) -- the position filter is locked to match your outgoing pick.
 */

interface RosterEntry {
  player: { id: string; name: string; position: Position; currentPrice: number; team: { name: string } };
}

interface TeamResponse {
  id: string;
  name: string;
  budgetRemaining: number;
  freeTransfers: number;
  preseasonActive: boolean;
  squadComplete: boolean;
  roster: RosterEntry[];
}

interface SearchPlayer {
  id: string;
  name: string;
  position: Position;
  currentPrice: number;
  team: { name: string };
}

export default function TransfersPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [teamId, setTeamId] = useState<string | undefined>(undefined);
  const [resolvingTeam, setResolvingTeam] = useState(true);

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

  const [team, setTeam] = useState<TeamResponse | null>(null);
  const [outgoing, setOutgoing] = useState<RosterEntry["player"] | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchPlayer[]>([]);
  const [week, setWeek] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function loadTeam() {
    if (!teamId) return;
    fetch(`/api/fantasy-team/${teamId}`)
      .then((res) => res.json())
      .then((data: TeamResponse) => {
        if (!data.squadComplete) {
          router.push("/build-squad");
          return;
        }
        setTeam(data);
      });
  }

  useEffect(loadTeam, [teamId]);

  useEffect(() => {
    if (!teamId || !outgoing) {
      setResults([]);
      return;
    }
    const params = new URLSearchParams({ position: outgoing.position, excludeTeamId: teamId });
    if (search.trim()) params.set("search", search.trim());
    fetch(`/api/players?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setResults(data.players ?? []));
  }, [teamId, outgoing, search]);

  if (sessionStatus === "loading" || resolvingTeam) {
    return <main className="max-w-3xl mx-auto p-6 text-gray-500">Loading...</main>;
  }

  if (!session) {
    return (
      <main className="max-w-md mx-auto p-10 text-center">
        <h1 className="text-2xl font-bold mb-2">Transfers</h1>
        <p className="text-gray-600 mb-6">Sign in with Google to manage your team's transfers.</p>
        <button
          onClick={() => signIn("google", { callbackUrl: "/transfers" })}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg"
        >
          Sign in with Google
        </button>
      </main>
    );
  }

  if (!teamId) {
    return <main className="max-w-3xl mx-auto p-6 text-gray-500">Taking you to create your team...</main>;
  }

  if (!team) return <main className="max-w-3xl mx-auto p-6">Loading...</main>;

  async function handleTransferIn(playerIn: SearchPlayer) {
    if (!outgoing) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/fantasy-team/${teamId}/transfers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerOutId: outgoing.id, playerInId: playerIn.id, week }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Transfer failed");
      setMessage(
        `Transferred in ${playerIn.name} for ${outgoing.name}. ` +
          (body.preseasonActive
            ? "Free -- unlimited transfers before Week 1 starts."
            : body.usedFreeTransfer
            ? "Used a free transfer."
            : `Took a ${body.pointsHit}-point hit.`)
      );
      setOutgoing(null);
      setSearch("");
      loadTeam();
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="max-w-4xl mx-auto p-6">
      <Head>
        <title>FGL — Transfers</title>
      </Head>
      <div className="flex justify-between items-center mb-6 flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Transfers</h1>
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
          <a href="/my-team" className="text-blue-600 underline text-sm">
            &larr; Back to My Team
          </a>
        </div>
      </div>

      {message && <div className="bg-blue-50 text-blue-800 text-sm rounded p-2 mb-4">{message}</div>}

      <div className="grid grid-cols-2 gap-6">
        <div>
          <h2 className="text-sm font-bold text-gray-500 mb-2">Your Roster (click a player to transfer out)</h2>
          <div className="space-y-2">
            {team.roster.map((r) => (
              <button
                key={r.player.id}
                onClick={() => setOutgoing(r.player)}
                className={`w-full text-left border rounded-lg px-3 py-2 flex justify-between items-center ${
                  outgoing?.id === r.player.id ? "bg-red-50 border-red-400 ring-2 ring-red-400" : "bg-white hover:bg-gray-50"
                }`}
              >
                <span>
                  <span className="text-xs text-gray-500 mr-2">{r.player.position}</span>
                  {r.player.name}
                  <span className="text-xs text-gray-500 ml-2">({r.player.team.name})</span>
                </span>
                <span className="text-sm text-gray-700">${r.player.currentPrice.toFixed(1)}M</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-bold text-gray-500 mb-2">
            {outgoing ? `Replace ${outgoing.name} (${outgoing.position})` : "Select a player to transfer out first"}
          </h2>
          {outgoing && (
            <>
              <input
                type="text"
                placeholder={`Search ${outgoing.position}s...`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 mb-3"
              />
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {results.map((p) => {
                  const affordable = team.budgetRemaining + outgoing.currentPrice - p.currentPrice >= -1e-9;
                  return (
                    <button
                      key={p.id}
                      disabled={!affordable || busy}
                      onClick={() => handleTransferIn(p)}
                      className={`w-full text-left border rounded-lg px-3 py-2 flex justify-between items-center ${
                        affordable ? "bg-white hover:bg-green-50" : "bg-gray-50 opacity-50 cursor-not-allowed"
                      }`}
                    >
                      <span>
                        {p.name}
                        <span className="text-xs text-gray-500 ml-2">({p.team.name})</span>
                      </span>
                      <span className="text-sm text-gray-700">${p.currentPrice.toFixed(1)}M</span>
                    </button>
                  );
                })}
                {results.length === 0 && <p className="text-sm text-gray-500">No matching players found.</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
