import Layout from "../components/Layout";

/**
 * Bare-bones privacy policy page. Exists mainly so the Google OAuth consent
 * screen (Branding page) has a URL to point at when publishing the app to
 * production -- this is a friend league with a handful of users, not a
 * commercial product, so this is intentionally short and plain-language
 * rather than a lawyer-drafted document.
 */
export default function PrivacyPage() {
  return (
    <Layout title="FGL — Privacy Policy">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-sm border p-6 sm:p-10 text-gray-800">
        <h1 className="text-2xl font-bold mb-2 text-fpl-purple">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-8">Last updated September 8, 2026</p>

        <div className="space-y-6 text-sm leading-relaxed">
        <p>
          FGL ("this app") is a small fantasy football game built for a private group of
          friends. It is not a commercial product, and it does not sell or share your
          information with anyone.
        </p>

        <section>
          <h2 className="font-semibold text-base mb-1">What we collect</h2>
          <p>
            When you sign in with Google, we receive your name, email address, and profile
            picture from Google. We use this only to identify your account and attach it to
            the fantasy team you create.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-1">What we store</h2>
          <p>
            Your team name, roster selections, transfers, and league scores are stored so the
            game works across weeks. Nothing else about you is tracked, and none of this data
            is used for advertising.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-1">Who can see it</h2>
          <p>
            Other players in the league can see your team name and its standing on the
            leaderboard. Your email address is not shown to other players.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-1">Sharing</h2>
          <p>We don't share, sell, or use your data for anything beyond running this game.</p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-1">Deleting your data</h2>
          <p>
            If you'd like your account and team data removed, just contact whoever runs your
            league and ask them to delete it.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-base mb-1">Questions</h2>
          <p>Reach out to the league organizer with any questions about this policy.</p>
        </section>
        </div>
      </div>
    </Layout>
  );
}
