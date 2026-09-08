import { useSession, signIn } from "next-auth/react";
import Layout from "../components/Layout";

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
 *
 * Styled to evoke the official Fantasy Premier League site: deep purple
 * hero, bright green pill CTAs.
 */
export default function HomePage() {
  const { data: session, status } = useSession();

  return (
    <Layout title="FGL — Fantasy Gridiron League">
      <div
        className="relative overflow-hidden rounded-3xl text-white px-8 py-16 sm:py-20 text-center"
        style={{ backgroundImage: "linear-gradient(to bottom right, #37003c, #37003c, #240028)" }}
      >

        <div
          className="absolute inset-0 opacity-[0.08] pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(white 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        <div className="relative">
          <span className="inline-block bg-fpl-green text-fpl-purple font-extrabold text-xs tracking-widest uppercase px-3 py-1 rounded-full mb-5">
            Fantasy Gridiron League
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-3">FGL</h1>
          <p className="text-white/70 max-w-md mx-auto mb-10">
            FPL-style fantasy football for real NFL players -- pick a squad, manage transfers, use chips, and see
            who's on top of the leaderboard each week.
          </p>

          {status === "loading" ? (
            <p className="text-white/50">Loading...</p>
          ) : !session ? (
            <div className="flex flex-col gap-3 items-center">
              <button
                onClick={() => signIn("google", { callbackUrl: "/create-team" })}
                className="w-full max-w-xs bg-fpl-green text-fpl-purple px-6 py-3 rounded-full font-bold hover:brightness-95 transition"
              >
                Sign in with Google
              </button>
              <a
                href="/leaderboard"
                className="w-full max-w-xs bg-white/10 text-white px-6 py-3 rounded-full font-semibold hover:bg-white/20 transition"
              >
                View Leaderboard
              </a>
            </div>
          ) : (
            <div className="flex flex-col gap-3 items-center">
              <p className="text-xs text-white/50">Signed in as {session.user?.email}</p>
              <a
                href="/my-team"
                className="w-full max-w-xs bg-fpl-green text-fpl-purple px-6 py-3 rounded-full font-bold hover:brightness-95 transition"
              >
                My Team
              </a>
              <a
                href="/leaderboard"
                className="w-full max-w-xs bg-white/10 text-white px-6 py-3 rounded-full font-semibold hover:bg-white/20 transition"
              >
                View Leaderboard
              </a>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-6">
        Sign in with Google to create or manage your team -- your team is tied to your account.
      </p>
    </Layout>
  );
}
