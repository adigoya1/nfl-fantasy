import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "../../../lib/prisma";

/**
 * NextAuth config: Google sign-in only, JWT sessions (no database adapter,
 * so no Account/Session/VerificationToken tables needed -- this app's own
 * `User` model is all that's required). On every sign-in, we upsert our own
 * User row keyed by the real Google email, and stash its id in the JWT --
 * that internal userId is what FantasyTeam.userId is checked against
 * everywhere else (see lib/auth.ts, and the ownership checks in
 * transfers.ts/chips.ts/lineup.ts), replacing the old "whoever has the link
 * owns the team" model.
 *
 * Requires GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / NEXTAUTH_SECRET /
 * NEXTAUTH_URL in .env -- see README's "Setting up Google sign-in" section.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, profile }) {
      if (profile?.email) {
        const user = await prisma.user.upsert({
          where: { email: profile.email },
          update: { displayName: profile.name ?? profile.email },
          create: { email: profile.email, displayName: profile.name ?? profile.email },
        });
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        (session.user as typeof session.user & { id: string }).id = token.userId as string;
      }
      return session;
    },
  },
};

export default NextAuth(authOptions);
