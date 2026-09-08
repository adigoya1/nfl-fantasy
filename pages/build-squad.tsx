import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useSession, signIn } from "next-auth/react";
import { Position } from "@prisma/client";
import { SQUAD_REQUIREMENTS } from "../lib/roster";

/**
 * Squad builder for a brand-new team: teams start with an empty roster and
 * the full $85M budget (pages/api/fantasy-team/index.ts), and this page is
 * where a manager actually picks their 13 players, position by position,
 * backed by POST/DELETE /api/fantasy-team/[id]/squad-slots.
 *
 * Replaces the old approach of auto-drafting a full squad immediately on
 * team creation, which tended to produce bland squads padded with cheap
 * ($4.1M-ish) replacement-level players since the auto-draft greedily fills
 * every slot from the bottom up.
 */

interface RosterEntry {
  player: { id: string; name: string; position: Position; currentPrice: number; team: { name: string } };
}

interface TeamResponse {
  id: string;
  name: string;
  budgetRemaining: number;
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

const POSITION_ORDER: Position[] = [Position.QB, Position.RB, Position.WR, Position.TE, Position.K, Position.DEF];

export default function BuildSquadPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [teamId, setTeamId] = useState<string | undefined>(undefined);
  const [resolvingTeam, setResolvingTeam] = useState(true);

  const [team, setTeam] = useState<TeamResponse | null>(null);
  const [activePosition, setActivePosition] = useState<Position | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchPlayer[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  function loadTeam() {
    if (!teamId) return;
    fetch(`/api/fantasy-team/${teamId}`)
      .then((res) => res.json())
      .then((data: TeamResponse) => {
        setTeam(data);
        if (data.squadComplete) router.push("/my-team");
      });
  }

  useEffect(loadTeam, [teamId]);

  useEffect(() => {
    if (!teamId || !activePosition) {
      setResults([]);
      return;
    }
    const params = new URLSearchParams({ position: activePosition, excludeTeamId: teamId });
    if (search.trim()) params.set("search", search.trim());
    fetch(`/api/players?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => setResults(data.players ?? []));
  }, [teamId, activePosition, search]);

  if (sessionStatus === "loading" || resolvingTeam) {
    return <main className="max-w-3xl mx-auto p-6 text-gray-500">Loading...</main>;
  }

  if (!session) {
    return (
      <main className="max-w-md mx-auto p-10 text-center">
        <h1 className="text-2xl font-bold mb-2">Build Your Squad</h1>
        <p className="text-gray-600 mb-6">Sign in with Google first.</p>
        <button
          onClick={() => signIn("google", { callbackUrl: "/build-squad" })}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg"
        >
          Sign in with Google
        </button>
      </main>
    );
  }

  if (!teamId || !team) return <main className="max-w-3xl mx-auto p-6 text-gray-500">Loading...</main>;

  const countsByPosition: Record<string, number> = {};
  for (const r of team.roster) {
    countsByPosition[r.player.position] = (countsByPosition[r.player.position] ?? 0) + 1;
  }
  const totalNeeded = Object.values(SQUAD_REQUIREMENTS).reduce((a, b) => a + b, 0);
  const totalHave = team.roster.length;

  async function handleAdd(player: SearchPlayer) {
    if (!teamId) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/fantasy-team/${teamId}/squad-slots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: player.id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't add player");
      setSearch("");
      if (body.squadComplete) {
        router.push("/my-team");
        return;
      }
      loadTeam();
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(playerId: string) {
    if (!teamId) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/fantasy-team/${teamId}/squad-slots`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't remove player");
      loadTeam();
    } catch (e: any) {
      setMessage(`Error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="max-w-4xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6 flex-wrap gap-2">
        <h1 className="text-2xl font-bold">Build Your Squad: {team.name}</h1>
        <div className="flex gap-4 text-sm items-center">
          <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full">
            Budget left: ${team.budgetRemaining.toFixed(1)}M
          </span>
          <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full">
            {totalHave} / {totalNeeded} players
          </span>
        </div>
      </div>

      {message && <div className="bg-red-50 text-red-700 text-sm rounded p-2 mb-4">{message}</div>}

      <div className="space-y-4">
        {POSITION_ORDER.map((position) => {
          const have = countsByPosition[position] ?? 0;
          const need = SQUAD_REQUIREMENTS[position];
          const done = have >= need;
          const rosterAtPosition = team.roster.filter((r) => r.player.position === position);

          return (
            <div key={position} className={`border rounded-xl p-4 ${done ? "bg-green-50" : "bg-white"}`}>
              <div className="flex justify-between items-center mb-2">
                <h2 className="font-bold">
                  {position} <span className="text-sm font-normal text-gray-500">({have}/{need})</span>
                </h2>
                {!done && (
                  <button
                    onClick={() => setActivePosition(activePosition === position ? null : position)}
                    className="text-sm bg-blue-600 text-white px-3 py-1 rounded"
                  >
                    {activePosition === position ? "Close" : "Add player"}
                  </button>
                )}
              </div>

              {rosterAtPosition.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {rosterAtPosition.map((r) => (
                    <span
                      key={r.player.id}
                      className="bg-white border rounded-full px-3 py-1 text-sm flex items-center gap-2"
                    >
                      {r.player.name} <span className="text-gray-500">${r.player.currentPrice.toFixed(1)}M</span>
                      <button
                        onClick={() => handleRemove(r.player.id)}
                        disabled={busy}
                        className="text-red-500 hover:text-red-700"
                        title="Remove"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {activePosition === position && (
                <div>
                  <input
                    type="text"
                    autoFocus
                    placeholder={`Search ${position}s...`}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 mb-2"
                  />
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {results.map((p) => {
                      const affordable = team.budgetRemaining - p.currentPrice >= -1e-9;
                      return (
                        <button
                          key={p.id}
                          disabled={!affordable || busy}
                          onClick={() => handleAdd(p)}
                          className={`w-full text-left border rounded-lg px-3 py-2 flex justify-between items-center ${
                            affordable ? "bg-white hover:bg-green-50" : "bg-gray-50 opacity-50 cursor-not-allowed"
                          }`}
                        >
                          <span>
                            {p.name} <span className="text-xs text-gray-500 ml-1">({p.team.name})</span>
                          </span>
                          <span className="text-sm text-gray-700">${p.currentPrice.toFixed(1)}M</span>
                        </button>
                      );
                    })}
                    {results.length === 0 && <p className="text-sm text-gray-500">No matching players found.</p>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
