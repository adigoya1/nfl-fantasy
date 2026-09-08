/**
 * The 32 NFL teams, keyed by the abbreviation ESPN's fantasy API uses
 * (proTeamId -> abbreviation, verified against the espn-api open-source
 * library's constant.py). scripts/load-players.ts maps each player's
 * proTeamId to one of these abbreviations to link them to a Team row.
 */
export const NFL_TEAMS: Array<{ abbr: string; name: string; division: string }> = [
  { abbr: "BUF", name: "Buffalo Bills", division: "AFC East" },
  { abbr: "MIA", name: "Miami Dolphins", division: "AFC East" },
  { abbr: "NE", name: "New England Patriots", division: "AFC East" },
  { abbr: "NYJ", name: "New York Jets", division: "AFC East" },
  { abbr: "BAL", name: "Baltimore Ravens", division: "AFC North" },
  { abbr: "CIN", name: "Cincinnati Bengals", division: "AFC North" },
  { abbr: "CLE", name: "Cleveland Browns", division: "AFC North" },
  { abbr: "PIT", name: "Pittsburgh Steelers", division: "AFC North" },
  { abbr: "HOU", name: "Houston Texans", division: "AFC South" },
  { abbr: "IND", name: "Indianapolis Colts", division: "AFC South" },
  { abbr: "JAX", name: "Jacksonville Jaguars", division: "AFC South" },
  { abbr: "TEN", name: "Tennessee Titans", division: "AFC South" },
  { abbr: "DEN", name: "Denver Broncos", division: "AFC West" },
  { abbr: "KC", name: "Kansas City Chiefs", division: "AFC West" },
  { abbr: "LV", name: "Las Vegas Raiders", division: "AFC West" },
  { abbr: "LAC", name: "Los Angeles Chargers", division: "AFC West" },
  { abbr: "DAL", name: "Dallas Cowboys", division: "NFC East" },
  { abbr: "NYG", name: "New York Giants", division: "NFC East" },
  { abbr: "PHI", name: "Philadelphia Eagles", division: "NFC East" },
  { abbr: "WSH", name: "Washington Commanders", division: "NFC East" },
  { abbr: "CHI", name: "Chicago Bears", division: "NFC North" },
  { abbr: "DET", name: "Detroit Lions", division: "NFC North" },
  { abbr: "GB", name: "Green Bay Packers", division: "NFC North" },
  { abbr: "MIN", name: "Minnesota Vikings", division: "NFC North" },
  { abbr: "ATL", name: "Atlanta Falcons", division: "NFC South" },
  { abbr: "CAR", name: "Carolina Panthers", division: "NFC South" },
  { abbr: "NO", name: "New Orleans Saints", division: "NFC South" },
  { abbr: "TB", name: "Tampa Bay Buccaneers", division: "NFC South" },
  { abbr: "ARI", name: "Arizona Cardinals", division: "NFC West" },
  { abbr: "LAR", name: "Los Angeles Rams", division: "NFC West" },
  { abbr: "SF", name: "San Francisco 49ers", division: "NFC West" },
  { abbr: "SEA", name: "Seattle Seahawks", division: "NFC West" },
];

/** Full team name (as stored on Team.name) -> abbreviation, for compact UI display. */
export const ABBR_BY_TEAM_NAME: Record<string, string> = Object.fromEntries(
  NFL_TEAMS.map((t) => [t.name, t.abbr])
);

/**
 * ESPN's proTeamId -> abbreviation mapping, verified against the espn-api
 * open-source library (github.com/cwendt94/espn-api). IDs 31 and 32 are
 * unused by ESPN (historical gaps); 0 means a free agent with no NFL team.
 */
export const ESPN_PRO_TEAM_ID_MAP: Record<number, string> = {
  1: "ATL", 2: "BUF", 3: "CHI", 4: "CIN", 5: "CLE", 6: "DAL", 7: "DEN",
  8: "DET", 9: "GB", 10: "TEN", 11: "IND", 12: "KC", 13: "LV", 14: "LAR",
  15: "MIA", 16: "MIN", 17: "NE", 18: "NO", 19: "NYG", 20: "NYJ", 21: "PHI",
  22: "ARI", 23: "PIT", 24: "LAC", 25: "SF", 26: "SEA", 27: "TB", 28: "WSH",
  29: "CAR", 30: "JAX", 33: "BAL", 34: "HOU",
};
