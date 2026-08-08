import { describe, expect, it } from "vitest";
import { estimateTtr } from "./conversions";

describe("estimateTtr", () => {
  it("uses the regression for A1–B3 classes, ignoring classement points — shifted +165, capped at 2600", () => {
    expect(estimateTtr(1085.87, "A1", null)).toBe(2600); // 2983 uncapped, hits the ceiling
    expect(estimateTtr(768.3, "A2", null)).toBe(2440);
    expect(estimateTtr(200, "B3", 999)).toBe(1487);
  });

  it("returns null for C1–D3 classes with no classement points entered", () => {
    expect(estimateTtr(200, "C1", null)).toBeNull();
    expect(estimateTtr(50, "D3", null)).toBeNull();
  });

  it("anchors D2's 0 points at 1025 and C2's +6 points at 1325", () => {
    expect(estimateTtr(0, "D2", 0)).toBe(1025);
    expect(estimateTtr(0, "C2", 6)).toBe(1325);
  });

  it("is continuous across classement boundaries — no cliff", () => {
    const bottomOfC1 = estimateTtr(0, "C1", -5.5);
    const topOfC2 = estimateTtr(0, "C2", 11.5);
    expect(bottomOfC1).toBe(topOfC2);
  });

  it("scales classement points within a class", () => {
    expect(estimateTtr(0, "C3", 5)).toBe(1230);
    expect(estimateTtr(0, "D1", -2)).toBe(1104);
  });

  it("keeps B3's floor exactly on C1's ceiling — no gap, no overlap", () => {
    const c1Top = estimateTtr(0, "C1", 11.5);
    expect(estimateTtr(174, "B3", null)).toBe(c1Top); // 1443, both sides
  });
});
