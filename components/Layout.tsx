import Head from "next/head";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useDarkMode } from "../lib/useDarkMode";

/**
 * Shared page chrome: a purple header/nav bar (FPL-style branding) plus a
 * centered content well. Every page renders through this instead of
 * duplicating its own <Head> and nav links.
 *
 * Nav links always show, regardless of sign-in state -- each destination
 * page already has its own "sign in with Google" gate, so an unauthenticated
 * visitor clicking "My Team" just lands on that prompt instead of the page
 * breaking or the link being hidden.
 *
 * Also owns the dark mode toggle (see lib/useDarkMode.ts + pages/_document.tsx
 * for how the "dark" class actually gets applied without a flash on load).
 */
export default function Layout({ children, title = "FGL" }: { children: React.ReactNode; title?: string }) {
  const { data: session } = useSession();
  const [isDark, toggleDark] = useDarkMode();

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 transition-colors">
      <Head>
        <title>{title}</title>
      </Head>

      <header className="bg-fpl-purple dark:bg-fpl-purpleDark sticky top-0 z-10 shadow-md">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <span className="font-display bg-fpl-green text-fpl-purple font-extrabold text-sm px-2.5 py-1 rounded-md tracking-tight">
              FGL
            </span>
            <span className="text-white/90 font-semibold text-sm hidden sm:inline">Fantasy Gridiron League</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm font-medium overflow-x-auto">
            <NavLink href="/my-team">My Team</NavLink>
            <NavLink href="/transfers">Transfers</NavLink>
            <NavLink href="/leaderboard">Leaderboard</NavLink>
            <button
              onClick={toggleDark}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
              className="ml-1 w-8 h-8 shrink-0 flex items-center justify-center rounded-full text-white/80 hover:text-fpl-green hover:bg-white/5 transition"
            >
              {isDark ? (
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M12 4.5a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1Zm0 13a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1Zm7.5-6.5a1 1 0 0 1-1 1h-1a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1Zm-13 0a1 1 0 0 1-1 1h-1a1 1 0 1 1 0-2h1a1 1 0 0 1 1 1Zm10.6-5.6a1 1 0 0 1 0 1.4l-.7.7a1 1 0 1 1-1.4-1.4l.7-.7a1 1 0 0 1 1.4 0Zm-9.6 9.6a1 1 0 0 1 0 1.4l-.7.7a1 1 0 1 1-1.4-1.4l.7-.7a1 1 0 0 1 1.4 0Zm9.6 1.4a1 1 0 0 1-1.4 0l-.7-.7a1 1 0 1 1 1.4-1.4l.7.7a1 1 0 0 1 0 1.4Zm-9.6-9.6a1 1 0 0 1-1.4 0l-.7-.7a1 1 0 0 1 1.4-1.4l.7.7a1 1 0 0 1 0 1.4ZM12 7.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M20.354 15.354A9 9 0 0 1 8.646 3.646a9.003 9.003 0 1 0 11.708 11.708Z" />
                </svg>
              )}
            </button>
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
