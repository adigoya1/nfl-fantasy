import { describe, it, expect } from "vitest";
import { validateSquadComposition, validateLineup, RosterPlayer } from "./roster";
import { Position } from "@prisma/client";

function p(id: string, position: Position, currentPrice: number): RosterPlayer {
  return { id, position, currentPrice };
}

const validSquad: RosterPlayer[] = [
  p("qb1", Position.QB, 9.0),
  p("qb2", Position.QB, 4.5),
  p("rb1", Position.RB, 8.0),
  p("rb2", Position.RB, 6.5),
  p("rb3", Position.RB, 4.5),
  p("wr1", Position.WR, 8.5),
  p("wr2", Position.WR, 7.0),
  p("wr3", Position.WR, 5.5),
  p("wr4", Position.WR, 4.0),
  p("te1", Position.TE, 6.0),
  p("te2", Position.TE, 4.0),
  p("k1", Position.K, 4.5),
  p("def1", Position.DEF, 5.0),
];

describe("validateSquadComposition", () => {
  it("accepts a real 13-man squad under budget", () => {
    expect(validateSquadComposition(validSquad).valid).toBe(true);
  });

  it("rejects a squad with the wrong position counts", () => {
    const bad = validSquad.map((x) => (x.id === "te2" ? { ...x, position: Position.QB } : x));
    const result = validateSquadComposition(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/QB/);
  });

  it("rejects a squad over the salary cap", () => {
    const overBudget = validSquad.map((x, i) => (i === 0 ? { ...x, currentPrice: 50.0 } : x));
    const result = validateSquadComposition(overBudget);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/cap/);
  });

  it("rejects a squad with the wrong total size", () => {
    const result = validateSquadComposition(validSquad.slice(0, 12));
    expect(result.valid).toBe(false);
  });
});

describe("validateLineup", () => {
  it("accepts a legal 9-starter lineup with an RB in the FLEX slot", () => {
    const lineup = ["qb1", "rb1", "rb2", "wr1", "wr2", "te1", "rb3", "k1", "def1"];
    expect(validateLineup(validSquad, lineup).valid).toBe(true);
  });

  it("accepts a legal lineup with a WR in the FLEX slot instead", () => {
    const lineup = ["qb1", "rb1", "rb2", "wr1", "wr2", "te1", "wr3", "k1", "def1"];
    expect(validateLineup(validSquad, lineup).valid).toBe(true);
  });

  it("rejects a lineup missing the FLEX starter (only 8 players)", () => {
    const lineup = ["qb1", "rb1", "rb2", "wr1", "wr2", "te1", "k1", "def1"];
    expect(validateLineup(validSquad, lineup).valid).toBe(false);
  });

  it("rejects a lineup that tries to start a 2nd QB in the FLEX slot", () => {
    const lineup = ["qb1", "qb2", "rb1", "rb2", "wr1", "wr2", "te1", "k1", "def1"];
    expect(validateLineup(validSquad, lineup).valid).toBe(false);
  });

  it("rejects a lineup with a duplicate player", () => {
    const lineup = ["qb1", "qb1", "rb1", "rb2", "wr1", "wr2", "te1", "k1", "def1"];
    expect(validateLineup(validSquad, lineup).valid).toBe(false);
  });

  it("rejects a player not on the squad", () => {
    const lineup = ["qb1", "rb1", "rb2", "wr1", "wr2", "te1", "not-on-squad", "k1", "def1"];
    expect(validateLineup(validSquad, lineup).valid).toBe(false);
  });
});
