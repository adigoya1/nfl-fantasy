import { describe, it, expect } from "vitest";
import { isPreseasonTransferWindow } from "./preseason";

describe("isPreseasonTransferWindow", () => {
  it("is never true for any week other than 1", () => {
    const now = new Date("2026-09-01T00:00:00Z");
    const kickoff = new Date("2026-09-05T00:00:00Z");
    expect(isPreseasonTransferWindow(2, now, kickoff)).toBe(false);
    expect(isPreseasonTransferWindow(5, now, null)).toBe(false);
  });

  it("is true for week 1 when Week 1's schedule hasn't been loaded yet", () => {
    const now = new Date("2026-09-01T00:00:00Z");
    expect(isPreseasonTransferWindow(1, now, null)).toBe(true);
  });

  it("is true for week 1 before the opener kicks off", () => {
    const now = new Date("2026-09-01T00:00:00Z");
    const kickoff = new Date("2026-09-05T00:00:00Z");
    expect(isPreseasonTransferWindow(1, now, kickoff)).toBe(true);
  });

  it("is false for week 1 once the opener has kicked off", () => {
    const now = new Date("2026-09-05T00:00:01Z");
    const kickoff = new Date("2026-09-05T00:00:00Z");
    expect(isPreseasonTransferWindow(1, now, kickoff)).toBe(false);
  });

  it("is false for week 1 at the exact kickoff instant", () => {
    const kickoff = new Date("2026-09-05T00:00:00Z");
    expect(isPreseasonTransferWindow(1, kickoff, kickoff)).toBe(false);
  });
});
