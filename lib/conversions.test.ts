import { describe, expect, it } from "vitest";
import { estimateTtr } from "./conversions";

describe("estimateTtr", () => {
  it("uses the regression for A1–C3 classes", () => {
    expect(estimateTtr(1085.87, "A1")).toBe(2808);
    expect(estimateTtr(768.3, "A2")).toBe(2275);
    expect(estimateTtr(200, "C1")).toBe(1322);
  });

  it("uses the anchored formula for D1–D3", () => {
    expect(estimateTtr(62.78, "D3")).toBe(701);
    expect(estimateTtr(74.22, "D3")).toBe(720);
    expect(estimateTtr(200, "D1")).toBe(931);
  });
});
