import Head from "next/head";
import { useEffect, useState } from "react";
import type { LeaderboardRow } from "../lib/rankings";

/**
 * Minimal leaderboard screen (design doc section 6.1 "Leaderboards").
 * Fetches /api/leaderboard/[week] and renders Overall + Week ranks.
 * Swap in a proper design system / NFL team color accents later.
 */
export default function LeaderboardPage() {
  const [week, setWeek] = useState(1);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/leaderboard/${week}`)
      .then((r) => r.json())
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [week]);

  return (
    <main className="max-w-3xl mx-auto p-6">
      <Head>
        <title>FGL — Leaderboard</title>
      </Head>
      <h1 className="text-2xl font-bold mb-4">FGL — Leaderboard</h1>

      <div className="flex items-center gap-2 mb-4">
        <label htmlFor="week" className="text-sm text-gray-600">
          Week
        </label>
        <input
          id="week"
          type="number"
          min={1}
          max={18}
          value={week}
          onChange={(e) => setWeek(Number(e.target.value))}
          className="border rounded px-2 py-1 w-20"
        />
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b">
              <th className="py-2">Overall Rank</th>
              <th>Wk Rank</th>
              <th>Team</th>
              <th className="text-right">Wk Pts</th>
              <th className="text-right">Season Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .sort((a, b) => a.overallRank - b.overallRank)
              .map((row) => (
                <tr key={row.fantasyTeamId} className="border-b">
                  <td className="py-2">{row.overallRank}</td>
                  <td>{row.weekRank}</td>
                  <td>{row.fantasyTeamName}</td>
                  <td className="text-right">{row.weekPoints}</td>
                  <td className="text-right font-semibold">{row.seasonPoints}</td>
                </tr>
              ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-gray-500">
                  No data yet for this week.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </main>
  );
}
