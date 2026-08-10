import { describe, expect, it } from "vitest";
import { klassierungForDtr } from "./klassierung";

describe("klassierungForDtr", () => {
  it("keeps 9 and 10's original cutoffs", () => {
    expect(klassierungForDtr(975)).toBe("9");
    expect(klassierungForDtr(976)).toBe("10");
    expect(klassierungForDtr(1100)).toBe("10");
  });

  it("bands 11 through 17 on round hundreds", () => {
    expect(klassierungForDtr(1101)).toBe("11");
    expect(klassierungForDtr(1199)).toBe("11");
    expect(klassierungForDtr(1200)).toBe("12");
    expect(klassierungForDtr(1299)).toBe("12");
    expect(klassierungForDtr(1300)).toBe("13");
    expect(klassierungForDtr(1699)).toBe("16");
    expect(klassierungForDtr(1700)).toBe("17");
    expect(klassierungForDtr(1799)).toBe("17");
  });

  it("doubles 18's width into the open-ended 18+ band", () => {
    expect(klassierungForDtr(1800)).toBe("18+");
    expect(klassierungForDtr(1900)).toBe("18+");
    expect(klassierungForDtr(1999)).toBe("18+");
  });

  it("starts N at 2000", () => {
    expect(klassierungForDtr(2000)).toBe("N");
    expect(klassierungForDtr(2612)).toBe("N");
  });
});
