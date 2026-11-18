import { describe, expect, it } from "vitest";
import { klassierungForDtr } from "./klassierung";

describe("klassierungForDtr", () => {
  it("keeps D3 and D2's original cutoffs", () => {
    expect(klassierungForDtr(975)).toBe("D3");
    expect(klassierungForDtr(976)).toBe("D2");
    expect(klassierungForDtr(1100)).toBe("D2");
  });

  it("bands D1 through B1 on round hundreds", () => {
    expect(klassierungForDtr(1101)).toBe("D1");
    expect(klassierungForDtr(1199)).toBe("D1");
    expect(klassierungForDtr(1200)).toBe("C3");
    expect(klassierungForDtr(1299)).toBe("C3");
    expect(klassierungForDtr(1300)).toBe("C2");
    expect(klassierungForDtr(1400)).toBe("C1");
    expect(klassierungForDtr(1500)).toBe("B3");
    expect(klassierungForDtr(1699)).toBe("B2");
    expect(klassierungForDtr(1700)).toBe("B1");
    expect(klassierungForDtr(1799)).toBe("B1");
  });

  it("gives A3 the double-width 1800-1999 band", () => {
    expect(klassierungForDtr(1800)).toBe("A3");
    expect(klassierungForDtr(1999)).toBe("A3");
  });

  it("splits 2000+ into A2 and A1 at 2400", () => {
    expect(klassierungForDtr(2000)).toBe("A2");
    expect(klassierungForDtr(2399)).toBe("A2");
    expect(klassierungForDtr(2400)).toBe("A1");
    expect(klassierungForDtr(2618)).toBe("A1");
  });
});
