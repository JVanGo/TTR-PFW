import { describe, expect, it } from "vitest";
import { estimateTtr } from "./conversions";

describe("estimateTtr", () => {
  it("uses the regression above the breakpoint (~TTR 1200)", () => {
    expect(estimateTtr(1085.87)).toBe(2808);
    expect(estimateTtr(768.3)).toBe(2275);
    expect(estimateTtr(200)).toBe(1322);
  });

  it("meets the regression exactly at the breakpoint — no jump", () => {
    expect(estimateTtr(127.52)).toBe(1200);
  });

  it("tapers linearly below the breakpoint down to the TTR 700 floor", () => {
    expect(estimateTtr(100)).toBe(987);
    expect(estimateTtr(90)).toBe(910);
    expect(estimateTtr(74.22)).toBe(788);
    expect(estimateTtr(62.78)).toBe(700);
  });
});
