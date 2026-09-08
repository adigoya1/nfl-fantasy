import Head from "next/head";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";

/**
 * Shared page chrome: a purple header/nav bar (FPL-style branding) plus a
 * centered content well. Every page renders through this instead of
 * duplicating its own <Head> and nav links.
 *
 * Nav links always show, regardless of sign-in state -- each destination
 * page already has its own "sign in with Google" gate, so an unauthenticated
 * visitor clicking "My Team" just lands on that prompt instead of the page
 * breaking or the link being hidden.
 */
export default function Layout({ children, title = "FGL" }: { children: React.ReactNode; title?: string }) {
  const { data: session } = useSession();

  return (
    <div className="min-h-screen bg-slate-100">
      <Head>
        <title>{title}</title>
      </Head>

      <header className="bg-fpl-purple sticky top-0 z-10 shadow-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="bg-fpl-green text-fpl-purple font-extrabold text-sm px-2.5 py-1 rounded-md tracking-tight">
              FGL
            </span>
            <span className="text-white/90 font-semibold text-sm hidden sm:inline">Fantasy Gridiron League</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm font-medium overflow-x-auto">
            <NavLink href="/my-team">My Team</NavLink>
            <NavLink href="/transfers">Transfers</NavLink>
            <NavLink href="/leaderboard">Leaderboard</NavLink>
            {session && (
              <button
                onClick={() => signOut({ callbackUrl: "/" })}
                className="ml-1 text-white/50 hover:text-white text-xs px-2 py-2 whitespace-nowrap transition"
              >
                Sign out
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">{children}</main>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-white/80 hover:text-fpl-green hover:bg-white/5 px-3 py-2 rounded-lg whitespace-nowrap transition"
    >
      {children}
    </Link>
  );
}
