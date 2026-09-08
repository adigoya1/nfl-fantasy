import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useSession, signIn } from "next-auth/react";
import { Position } from "@prisma/client";
import { SQUAD_REQUIREMENTS } from "../lib/roster";
import Layout from "../components/Layout";

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
    return (
      <Layout title="FGL — Build Your Squad">
        <p className="text-center text-gray-400 dark:text-gray-500">Loading...</p>
      </Layout>
    );
  }

  if (!session) {
    return (
      <Layout title="FGL — Build Your Squad">
        <div className="max-w-md mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-sm border dark:border-slate-700 p-10 text-center">
          <h1 className="text-2xl font-bold mb-2 text-fpl-purple dark:text-fpl-green">Build Your Squad</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6">Sign in with Google first.</p>
          <button
            onClick={() => signIn("google", { callbackUrl: "/build-squad" })}
            className="bg-fpl-purple text-white px-5 py-2.5 rounded-full font-semibold hover:brightness-110 transition"
          >
            Sign in with Google
          </button>
        </div>
      </Layout>
    );
  }

  if (!teamId || !team) {
    return (
      <Layout title="FGL — Build Your Squad">
        <p className="text-center text-gray-400 dark:text-gray-500">Loading...</p>
      </Layout>
    );
  }

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
    <Layout title="FGL — Build Your Squad">
      <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-fpl-purple dark:text-fpl-green">Build Your Squad: {team.name}</h1>
        <div className="flex gap-2 text-sm items-center flex-wrap">
          <span className="bg-fpl-green/20 dark:bg-fpl-green/15 text-fpl-purple dark:text-fpl-green font-semibold px-3 py-1 rounded-full">
            Budget left: ${team.budgetRemaining.toFixed(1)}M
          </span>
          <span className="bg-fpl-purple/10 dark:bg-fpl-purple/40 text-fpl-purple dark:text-white font-semibold px-3 py-1 rounded-full">
            {totalHave} / {totalNeeded} players
          </span>
        </div>
      </div>

      {message && (
        <div className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm rounded-lg p-2.5 mb-4">
          {message}
        </div>
      )}

      <div className="space-y-4">
        {POSITION_ORDER.map((position) => {
          const have = countsByPosition[position] ?? 0;
          const need = SQUAD_REQUIREMENTS[position];
          const done = have >= need;
          const rosterAtPosition = team.roster.filter((r) => r.player.position === position);

          return (
            <div
              key={position}
              className={`rounded-2xl p-4 shadow-sm border dark:border-slate-700 ${
                done ? "bg-fpl-green/10 dark:bg-fpl-green/10 border-fpl-green/30 dark:border-fpl-green/30" : "bg-white dark:bg-slate-800"
              }`}
            >
              <div className="flex justify-between items-center mb-2">
                <h2 className="font-bold text-fpl-purple dark:text-fpl-green">
                  {position}{" "}
                  <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                    ({have}/{need})
                  </span>
                </h2>
                {!done && (
                  <button
                    onClick={() => setActivePosition(activePosition === position ? null : position)}
                    className="text-sm bg-fpl-purple text-white px-3 py-1.5 rounded-full font-medium hover:brightness-110 transition"
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
                      className="bg-white dark:bg-slate-900 border dark:border-slate-700 rounded-full px-3 py-1 text-sm flex items-center gap-2 shadow-sm dark:text-gray-100"
                    >
                      {r.player.name}{" "}
                      <span className="text-gray-500 dark:text-gray-400">${r.player.currentPrice.toFixed(1)}M</span>
                      <button
                        onClick={() => handleRemove(r.player.id)}
                        disabled={busy}
                        className="text-fpl-pink hover:brightness-110"
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
                    className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:placeholder-gray-500 rounded-lg px-3 py-2 mb-2 focus:outline-none focus:ring-2 focus:ring-fpl-purple/30 focus:border-fpl-purple"
                  />
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {results.map((p) => {
                      const affordable = team.budgetRemaining - p.currentPrice >= -1e-9;
                      return (
                        <button
                          key={p.id}
                          disabled={!affordable || busy}
                          onClick={() => handleAdd(p)}
                          className={`w-full text-left border dark:border-slate-700 rounded-lg px-3 py-2 flex justify-between items-center transition ${
                            affordable
                              ? "bg-white dark:bg-slate-900 hover:bg-fpl-green/10 hover:border-fpl-green"
                              : "bg-gray-50 dark:bg-slate-800 opacity-50 cursor-not-allowed"
                          }`}
                        >
                          <span className="dark:text-gray-100">
                            {p.name}{" "}
                            <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">({p.team.name})</span>
                          </span>
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            ${p.currentPrice.toFixed(1)}M
                          </span>
                        </button>
                      );
                    })}
                    {results.length === 0 && (
                      <p className="text-sm text-gray-500 dark:text-gray-400">No matching players found.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Layout>
  );
}
