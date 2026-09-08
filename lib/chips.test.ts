import { describe, it, expect } from "vitest";
import { canActivateChip } from "./chips";
import { Chip } from "@prisma/client";

describe("canActivateChip", () => {
  it("allows any chip when nothing has been used yet", () => {
    expect(canActivateChip(Chip.CAPTAIN, 3, []).valid).toBe(true);
    expect(canActivateChip(Chip.BENCH_BOOST, 3, []).valid).toBe(true);
    expect(canActivateChip(Chip.FREE_HIT, 3, []).valid).toBe(true);
  });

  it("rejects re-using a chip that's already been played this season", () => {
    const used = [{ chip: Chip.CAPTAIN, week: 2 }];
    const result = canActivateChip(Chip.CAPTAIN, 5, used);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/already been used/);
  });

  it("allows a different, unused chip in a later week", () => {
    const used = [{ chip: Chip.CAPTAIN, week: 2 }];
    expect(canActivateChip(Chip.BENCH_BOOST, 5, used).valid).toBe(true);
  });

  it("rejects a second chip in the same week as an existing one", () => {
    const used = [{ chip: Chip.CAPTAIN, week: 4 }];
    const result = canActivateChip(Chip.FREE_HIT, 4, used);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/only one chip per week/);
  });

  it("allows the same chip type check to pass for a genuinely fresh week and chip", () => {
    const used = [
      { chip: Chip.CAPTAIN, week: 2 },
      { chip: Chip.BENCH_BOOST, week: 7 },
    ];
    expect(canActivateChip(Chip.FREE_HIT, 10, used).valid).toBe(true);
  });

  it("blocks Free Hit in Week 1", () => {
    const result = canActivateChip(Chip.FREE_HIT, 1, []);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Week 2/);
  });

  it("allows Free Hit starting Week 2", () => {
    expect(canActivateChip(Chip.FREE_HIT, 2, []).valid).toBe(true);
  });

  it("still allows Captain and Bench Boost in Week 1", () => {
    expect(canActivateChip(Chip.CAPTAIN, 1, []).valid).toBe(true);
    expect(canActivateChip(Chip.BENCH_BOOST, 1, []).valid).toBe(true);
  });

  it("reports the Week 1 restriction even if Free Hit was already used (restriction is checked first)", () => {
    const used = [{ chip: Chip.FREE_HIT, week: 2 }];
    const result = canActivateChip(Chip.FREE_HIT, 1, used);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Week 2/);
  });
});
