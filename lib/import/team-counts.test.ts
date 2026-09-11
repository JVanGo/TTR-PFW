import { describe, expect, it } from "vitest";
import { extractTeamCounts } from "./team-counts";

describe("extractTeamCounts", () => {
  it("takes the highest numbered team found in the main document", () => {
    const main = "Recken 2 - Ettelbréck 1\nHouwald 4 - Recken 3\nRecken 5 - Cado 1";
    const result = extractTeamCounts(["Recken"], main, null);
    expect(result.counts.get("Recken")).toBe(5);
    expect(result.unmatched).toEqual([]);
  });

  it("counts a bare (unnumbered) appearance in the top-tier document as team 1", () => {
    const main = "";
    const topTier = "Recken Union Lëtzebuerg\nBartreng Lëntgen";
    const result = extractTeamCounts(["Bartreng"], main, topTier);
    expect(result.counts.get("Bartreng")).toBe(1);
  });

  it("combines a top-tier team-1 appearance with the main document's higher numbers", () => {
    // Real 2026-2027 shape: Bartreng plays bare in the top tier (team 1) and
    // as "Bartreng 2".."Bartreng 10" in the main document — no "Bartreng 1"
    // there, since that's the top-tier appearance.
    const main = "Bartreng 2 - X 1\nY 1 - Bartreng 10\nBartreng 7 - Z 3";
    const topTier = "Bartreng Lëntgen";
    const result = extractTeamCounts(["Bartreng"], main, topTier);
    expect(result.counts.get("Bartreng")).toBe(10);
  });

  it("does not add an extra team just for the top-tier appearance when the main document already covers it", () => {
    // A club present in the top tier with no lower-tier teams at all is 1 team total, not 2.
    const main = "";
    const topTier = "Bartreng Lëntgen";
    const result = extractTeamCounts(["Bartreng"], main, topTier);
    expect(result.counts.get("Bartreng")).toBe(1);
  });

  it("reports a club found in neither document as unmatched, not zero", () => {
    const result = extractTeamCounts(["Ghost Club"], "Recken 2 - Ettelbréck 1", "Bartreng Lëntgen");
    expect(result.counts.has("Ghost Club")).toBe(false);
    expect(result.unmatched).toEqual(["Ghost Club"]);
  });

  it("doesn't match a club name that's only a substring of another token", () => {
    // "Ell" must not match inside "Wëllen" or similar longer tokens.
    const main = "Wëllen 2 - Ettelbréck 1";
    const result = extractTeamCounts(["Ell"], main, null);
    expect(result.counts.has("Ell")).toBe(false);
    expect(result.unmatched).toEqual(["Ell"]);
  });

  it("is a known miss when the same club is spelled differently across documents (Hueschtert-F. vs Hueschtert-Folscht)", () => {
    const main = "Iechternach 1 - Hueschtert-F. 2";
    const topTier = "Fluessweiler Hueschtert-Folscht";
    // Matching against the app's own "Hueschtert-Folscht" spelling misses the
    // main document's abbreviated form entirely — this is the documented
    // limitation, not a bug: it's still counted via the top-tier bare match.
    const result = extractTeamCounts(["Hueschtert-Folscht"], main, topTier);
    expect(result.counts.get("Hueschtert-Folscht")).toBe(1);
  });
});
