import { useState } from "react";
import { useRouter } from "next/router";
import { useSession, signIn } from "next-auth/react";
import Layout from "../components/Layout";

/**
 * "Create Your Team" page, backed by POST /api/fantasy-team. Requires a
 * Google sign-in (see pages/api/auth/[...nextauth].ts) -- the created team
 * is tied to that account, not a shareable link. If this account already
 * has a team, the API returns it (409) and we just redirect to My Team
 * instead of erroring.
 */
export default function CreateTeamPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [teamName, setTeamName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/fantasy-team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamName }),
      });
      const body = await res.json();
      if (res.status === 409 && body.id) {
        // Already have a team -- just take them to it.
        router.push("/my-team");
        return;
      }
      if (!res.ok) throw new Error(body.error ?? "Couldn't create your team.");
      router.push("/my-team");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") {
    return (
      <Layout title="FGL — Create Your Team">
        <p className="text-center text-gray-400 dark:text-gray-500">Loading...</p>
      </Layout>
    );
  }

  if (!session) {
    return (
      <Layout title="FGL — Create Your Team">
        <div className="max-w-md mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-sm border dark:border-slate-700 p-10 text-center">
          <h1 className="text-2xl font-bold mb-2 text-fpl-purple dark:text-fpl-green">Create Your Team</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Sign in with Google first -- your team is tied to your account.
          </p>
          <button
            onClick={() => signIn("google", { callbackUrl: "/create-team" })}
            className="bg-fpl-purple text-white px-5 py-2.5 rounded-full font-semibold hover:brightness-110 transition"
          >
            Sign in with Google
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="FGL — Create Your Team">
      <div className="max-w-md mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-sm border dark:border-slate-700 overflow-hidden">
        <div className="bg-fpl-purple dark:bg-fpl-purpleDark px-6 py-5">
          <h1 className="text-xl font-bold text-white">Create Your Team</h1>
        </div>
        <div className="p-6">
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
            Signed in as <span className="font-medium text-gray-700 dark:text-gray-200">{session.user?.email}</span>.
            Pick a team name, then you'll build your own 13-man squad -- $85M budget, real players, position by
            position.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-200">Team name</label>
              <input
                required
                minLength={2}
                maxLength={40}
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="e.g. Gridiron Gurus"
                className="w-full border border-gray-300 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:placeholder-gray-500 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-fpl-purple/30 focus:border-fpl-purple"
              />
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-sm rounded-lg p-2.5">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full bg-fpl-green text-fpl-purple font-bold px-4 py-2.5 rounded-full disabled:opacity-50 hover:brightness-95 transition"
            >
              {busy ? "Drafting your squad..." : "Create Team"}
            </button>
          </form>
        </div>
      </div>
    </Layout>
  );
}
