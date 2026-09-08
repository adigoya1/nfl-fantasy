import Head from "next/head";
import { useState } from "react";
import { useRouter } from "next/router";
import { useSession, signIn } from "next-auth/react";

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
    return <main className="max-w-md mx-auto p-10 text-center text-gray-500">Loading...</main>;
  }

  if (!session) {
    return (
      <main className="max-w-md mx-auto p-10 text-center">
        <h1 className="text-2xl font-bold mb-2">Create Your Team</h1>
        <p className="text-gray-600 mb-6">Sign in with Google first -- your team is tied to your account.</p>
        <button
          onClick={() => signIn("google", { callbackUrl: "/create-team" })}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg"
        >
          Sign in with Google
        </button>
      </main>
    );
  }

  return (
    <main className="max-w-md mx-auto p-10">
      <Head>
        <title>FGL — Create Your Team</title>
      </Head>
      <h1 className="text-2xl font-bold mb-1">Create Your Team</h1>
      <p className="text-gray-600 text-sm mb-6">
        Signed in as {session.user?.email}. Pick a team name and you'll get a real, auto-drafted,
        budget-respecting squad immediately.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Team name</label>
          <input
            required
            minLength={2}
            maxLength={40}
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="e.g. Gridiron Gurus"
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>

        {error && <div className="bg-red-50 text-red-700 text-sm rounded p-2">{error}</div>}

        <button
          type="submit"
          disabled={busy}
          className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg disabled:opacity-50"
        >
          {busy ? "Drafting your squad..." : "Create Team"}
        </button>
      </form>
    </main>
  );
}
