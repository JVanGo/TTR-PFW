import { describe, expect, it } from "vitest";
import { estimateTtr } from "./conversions";

describe("estimateTtr", () => {
  it("uses the regression for A1–B3 classes, ignoring classement points", () => {
    expect(estimateTtr(1085.87, "A1", null)).toBe(2808);
    expect(estimateTtr(768.3, "A2", null)).toBe(2275);
    expect(estimateTtr(200, "B3", 999)).toBe(1322);
  });

  it("returns null for C1–D3 classes with no classement points entered", () => {
    expect(estimateTtr(200, "C1", null)).toBeNull();
    expect(estimateTtr(50, "D3", null)).toBeNull();
  });

  it("anchors C1's top classement points at 1345 and D3's zero at 800", () => {
    expect(estimateTtr(0, "C1", 11.5)).toBe(1345);
    expect(estimateTtr(0, "D3", 0)).toBe(800);
  });

  it("is continuous across classement boundaries — no cliff", () => {
    const bottomOfC1 = estimateTtr(0, "C1", -5.5);
    const topOfC2 = estimateTtr(0, "C2", 11.5);
    expect(bottomOfC1).toBe(topOfC2);
  });

  it("scales classement points within a class", () => {
    expect(estimateTtr(0, "C3", 5)).toBe(1116);
    expect(estimateTtr(0, "D1", -2)).toBe(981);
  });
});
