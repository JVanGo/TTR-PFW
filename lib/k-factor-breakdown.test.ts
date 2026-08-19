import { describe, expect, it } from "vitest";
import { buildKFactorBreakdown } from "@/lib/k-factor-breakdown";

describe("buildKFactorBreakdown", () => {
  it("returns just the base for an adult with no bonuses (K=16)", () => {
    const breakdown = buildKFactorBreakdown({
      kFactor: 16,
      ageBonus: 0,
      isNewcomerBonus: false,
      isReturningBonus: false,
    });
    expect(breakdown).toEqual({ base: 16, items: [], total: 16 });
  });

  it("includes only the age bonus for an experienced, active youth player (K=24)", () => {
    const breakdown = buildKFactorBreakdown({
      kFactor: 24,
      ageBonus: 8,
      isNewcomerBonus: false,
      isReturningBonus: false,
    });
    expect(breakdown).toEqual({
      base: 16,
      items: [{ reason: "age", amount: 8 }],
      total: 24,
    });
  });

  it("includes the newcomer bonus alone for a brand-new adult (K=20)", () => {
    const breakdown = buildKFactorBreakdown({
      kFactor: 20,
      ageBonus: 0,
      isNewcomerBonus: true,
      isReturningBonus: false,
    });
    expect(breakdown).toEqual({
      base: 16,
      items: [{ reason: "newcomer", amount: 4 }],
      total: 20,
    });
  });

  it("includes the returning bonus alone for a stale-but-experienced player (K=20)", () => {
    const breakdown = buildKFactorBreakdown({
      kFactor: 20,
      ageBonus: 0,
      isNewcomerBonus: false,
      isReturningBonus: true,
    });
    expect(breakdown).toEqual({
      base: 16,
      items: [{ reason: "returning", amount: 4 }],
      total: 20,
    });
  });

  it("stacks all three bonuses for a new, returning u15 player (K=32)", () => {
    const breakdown = buildKFactorBreakdown({
      kFactor: 32,
      ageBonus: 8,
      isNewcomerBonus: true,
      isReturningBonus: true,
    });
    expect(breakdown).toEqual({
      base: 16,
      items: [
        { reason: "age", amount: 8 },
        { reason: "newcomer", amount: 4 },
        { reason: "returning", amount: 4 },
      ],
      total: 32,
    });
  });
});
