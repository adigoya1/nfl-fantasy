import type { AppProps } from "next/app";
import { SessionProvider } from "next-auth/react";
import "../styles/globals.css";

/**
 * Custom App -- there wasn't one before (Next.js falls back to a default),
 * which meant styles/globals.css was never actually being imported anywhere.
 * Also wraps every page in NextAuth's SessionProvider so useSession() works
 * without each page fetching /api/auth/session itself.
 */
export default function App({ Component, pageProps: { session, ...pageProps } }: AppProps) {
  return (
    <SessionProvider session={session}>
      <Component {...pageProps} />
    </SessionProvider>
  );
}
