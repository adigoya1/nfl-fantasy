import { useEffect, useState } from "react";
import type { LeaderboardRow } from "../lib/rankings";
import Layout from "../components/Layout";

/**
 * Minimal leaderboard screen (design doc section 6.1 "Leaderboards").
 * Fetches /api/leaderboard/[week] and renders Overall + Week ranks.
 * Styled like the FPL "Gameweek" leaderboard: purple header row, subtle
 * zebra striping, medal-style badges for the top 3 overall ranks.
 */

const RANK_BADGE: Record<number, string> = {
  1: "bg-yellow-400 text-yellow-900",
  2: "bg-gray-300 text-gray-700",
  3: "bg-amber-600 text-amber-50",
};

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
    <Layout title="FGL — Leaderboard">
      <div className="flex justify-between items-center mb-5 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-fpl-purple dark:text-fpl-green">Leaderboard</h1>
        <div className="flex items-center gap-2">
          <label htmlFor="week" className="text-sm text-gray-500 dark:text-gray-400">
            Week
          </label>
          <input
            id="week"
            type="number"
            min={1}
            max={18}
            value={week}
            onChange={(e) => setWeek(Number(e.target.value))}
            className="border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white rounded-lg px-2 py-1 w-20 focus:outline-none focus:ring-2 focus:ring-fpl-purple/30 focus:border-fpl-purple"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border dark:border-slate-700 overflow-hidden">
        {loading ? (
          <p className="p-6 text-center text-gray-400 dark:text-gray-500">Loading…</p>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-fpl-purple dark:bg-fpl-purpleDark text-white text-left">
                <th className="py-3 px-4 font-semibold">Overall</th>
                <th className="py-3 px-2 font-semibold">Wk Rank</th>
                <th className="py-3 px-2 font-semibold">Team</th>
                <th className="py-3 px-4 font-semibold text-right">Wk Pts</th>
                <th className="py-3 px-4 font-semibold text-right">Season Pts</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .sort((a, b) => a.overallRank - b.overallRank)
                .map((row, i) => (
                  <tr
                    key={row.fantasyTeamId}
                    className={i % 2 === 0 ? "bg-white dark:bg-slate-800" : "bg-gray-50 dark:bg-slate-900"}
                  >
                    <td className="py-2.5 px-4">
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                          RANK_BADGE[row.overallRank] ?? "bg-fpl-purple/10 dark:bg-fpl-purple/40 text-fpl-purple dark:text-white"
                        }`}
                      >
                        {row.overallRank}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-gray-500 dark:text-gray-400">{row.weekRank}</td>
                    <td className="py-2.5 px-2 font-medium text-gray-800 dark:text-gray-100">
                      {row.fantasyTeamName}
                    </td>
                    <td className="py-2.5 px-4 text-right text-gray-700 dark:text-gray-300">{row.weekPoints}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-fpl-purple dark:text-fpl-green">
                      {row.seasonPoints}
                    </td>
                  </tr>
                ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-400 dark:text-gray-500">
                    No data yet for this week.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
