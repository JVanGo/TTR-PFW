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

  describe("adjacentOnlyCounts (teams in NL1–NL3)", () => {
    // Real 2026-2027 shape: headings repeat per match day, and a page header
    // can sit in the middle of a section without ending it.
    const main = [
      "S-1.1 19.09.2026",
      "NL 2",
      "Recken 2 - Ettelbréck 1",
      "NL 3",
      "Scheierbierg 1 - Scheierbierg 2",
      "Houwald 2 - Houwald 3",
      "F L T T : Mannschaftsmeisterschaft 'SENIORS' 2026 - 2027 : SPIELPLAN (Teilrunde 1)",
      "Lënster 2 - Union 2",
      "PROM - DIS 1",
      "Recken 3 - Briddel 1",
      "DIV 1 - DIS 1",
      "Houwald 5 - Ell 2",
      "S-1.2 26.09.2026",
      "NL 3",
      "Lënster 1 - Féngeg 1",
    ].join("\n");
    const topTier = "Recken Union Lëtzebuerg\nHouwald Lénger";
    const clubs = ["Recken", "Houwald", "Scheierbierg", "Lënster", "Ettelbréck", "Briddel", "Ell"];
    const result = extractTeamCounts(clubs, main, topTier);

    it("counts the top-tier team plus every NL 2 / NL 3 team", () => {
      expect(result.adjacentOnlyCounts.get("Recken")).toBe(2);
      expect(result.adjacentOnlyCounts.get("Houwald")).toBe(3);
      expect(result.adjacentOnlyCounts.get("Scheierbierg")).toBe(2);
      expect(result.adjacentOnlyCounts.get("Lënster")).toBe(2);
      expect(result.adjacentOnlyCounts.get("Ettelbréck")).toBe(1);
    });

    it("is 0 for a club whose teams all play below NL 3", () => {
      expect(result.adjacentOnlyCounts.get("Briddel")).toBe(0);
      expect(result.adjacentOnlyCounts.get("Ell")).toBe(0);
    });

    it("doesn't change the total team count", () => {
      expect(result.counts.get("Recken")).toBe(3);
      expect(result.counts.get("Houwald")).toBe(5);
    });
  });
});
