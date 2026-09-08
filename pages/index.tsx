import Head from "next/head";
import { useSession, signIn, signOut } from "next-auth/react";

/**
 * Landing page. Previously the site root 404'd -- there was no pages/index.tsx
 * at all, which is a bad first impression for a link you're sending friends.
 * Team ownership is a Google sign-in now (see pages/api/auth/[...nextauth].ts),
 * so the CTA here adapts: signed-out visitors sign in first, signed-in
 * visitors go straight to their team (or Create Team resolves that either
 * way -- it redirects existing owners to their team automatically).
 *
 * Branded as "FGL" (Fantasy Gridiron League) rather than "NFL Fantasy" --
 * the app uses real NFL player/team data internally (completely normal for
 * a fantasy platform), but naming the *product itself* after the NFL's own
 * trademarked name is worth avoiding once this has a real public URL.
 */
export default function HomePage() {
  const { data: session, status } = useSession();

  return (
    <main className="max-w-xl mx-auto p-10 text-center">
      <Head>
        <title>FGL — Fantasy Gridiron League</title>
      </Head>
      <h1 className="text-3xl font-bold mb-2">FGL</h1>
      <p className="text-sm text-gray-400 mb-4">Fantasy Gridiron League</p>
      <p className="text-gray-600 mb-8">
        FPL-style fantasy football for real NFL players -- pick a squad, manage transfers, use chips, and see
        who's on top of the leaderboard each week.
      </p>

      {status === "loading" ? (
        <p className="text-gray-400">Loading...</p>
      ) : !session ? (
        <div className="flex flex-col gap-3 items-center">
          <button
            onClick={() => signIn("google", { callbackUrl: "/create-team" })}
            className="w-full max-w-xs bg-blue-600 text-white px-4 py-3 rounded-lg font-medium"
          >
            Sign in with Google
          </button>
          <a
            href="/leaderboard"
            className="w-full max-w-xs bg-gray-100 text-gray-800 px-4 py-3 rounded-lg font-medium"
          >
            View Leaderboard
          </a>
        </div>
      ) : (
        <div className="flex flex-col gap-3 items-center">
          <p className="text-sm text-gray-500">Signed in as {session.user?.email}</p>
          <a href="/my-team" className="w-full max-w-xs bg-blue-600 text-white px-4 py-3 rounded-lg font-medium">
            My Team
          </a>
          <a
            href="/leaderboard"
            className="w-full max-w-xs bg-gray-100 text-gray-800 px-4 py-3 rounded-lg font-medium"
          >
            View Leaderboard
          </a>
          <button onClick={() => signOut()} className="text-xs text-gray-400 underline mt-2">
            Sign out
          </button>
        </div>
      )}

      <p className="text-xs text-gray-400 mt-8">
        Sign in with Google to create or manage your team -- your team is tied to your account.
      </p>
    </main>
  );
}
