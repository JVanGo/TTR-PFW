import { describe, expect, it } from "vitest";
import {
  categoryClasses,
  decideSmallCategory,
  parseTournamentPdfText,
  type TournamentEntriesFile,
} from "./tournament-entries";

// Trimmed from the real unpdf output of 2025-12-28-recken.pdf (two columns glued together).
const RECKEN_TEXT = `Catégorie D3 participants: 18 18 Catégorie D2-D3 participants: 37 (21)
1. MIELCZAREK Simon (Iechternach) D3 +1,5 D3 D3-11. KOROTICH Mikhail (Zolwer) D2 +1,5
RIES Alex (Recken) D3 +0,5 D3-4 PENG Michael Yitong (Stroossen) D2 +0,5
Catégorie C2-C3 participants: 37 (18) 37 18 Catégorie C1-C2 participants: 27 (5)
2. GLOD Carlo (Scheierbierg) C3 +1 C2-C3-22. BASTOS SOARES Rodrigo (Lëntgen) C1 +1
PACHT David (Bartreng) C2 +0,5 C2-C3-4FEITZ Tom (Helleng) C1 +0,5
1. GÁSPÁR Milan (Rued) C2 +1,5
NEVES DOS SANTOS Samuel (Nidderkäerjeng)
C2 +0,5
2. XIA Aaron (Xunming) (Houwald) B3 B3-C1-2
Catégorie A-B1 participants: 19 (0/2/3)
1. KOOB Jerry (Hueschtert-F.) A3
Catégorie A1-A3 participants: 31 (1/2/28) 31 1/2/28
2. WANTZ Gene (Recken) A1 A1-A3-2`;

function fileFor(text: string, isoDate = "2025-12-28"): TournamentEntriesFile {
  return {
    syncedAt: "",
    tournaments: [{ isoDate, source: "test.pdf", ...parseTournamentPdfText(text) }],
  };
}

describe("parseTournamentPdfText", () => {
  it("reads category counts, including multi-class ones", () => {
    const { categories } = parseTournamentPdfText(RECKEN_TEXT);
    expect(categories["D3"]).toEqual({ participants: 18, classCounts: null });
    expect(categories["D2-D3"]).toEqual({ participants: 37, classCounts: [21] });
    expect(categories["A1-A3"]).toEqual({ participants: 31, classCounts: [1, 2, 28] });
  });

  it("reads placer classes through glued columns, line wraps and bracketed names", () => {
    const { placers } = parseTournamentPdfText(RECKEN_TEXT);
    const byName = Object.fromEntries(placers.map((p) => [p.name, p.playerClass]));
    expect(byName["korotich mikhail"]).toBe("D2");
    expect(byName["peng michael yitong"]).toBe("D2");
    expect(byName["feitz tom"]).toBe("C1");
    expect(byName["neves dos santos samuel"]).toBe("C2");
    expect(byName["xia aaron"]).toBe("B3");
  });
});

describe("categoryClasses", () => {
  it("expands ranges", () => {
    expect(categoryClasses("D2-D3")).toEqual(["D2", "D3"]);
    expect(categoryClasses("A-B1")).toEqual(["A1", "A2", "A3", "B1"]);
    expect(categoryClasses("D3")).toEqual(["D3"]);
    expect(categoryClasses("C3•JUN")).toBeNull();
  });
});

describe("decideSmallCategory", () => {
  const file = fileFor(RECKEN_TEXT);
  const decide = (category: string, playerName: string, isoDate = "2025-12-28") =>
    decideSmallCategory(file, { isoDate, category, playerName }).kind;

  it("reduces a higher-class placer when fewer than 6 of that class entered", () => {
    expect(decide("C1-C2", "FEITZ Tom")).toBe("reduced"); // 5 C1s
  });

  it("keeps the full bonus for the lower class of a small category", () => {
    expect(decide("C1-C2", "GÁSPÁR Milan")).toBe("full");
  });

  it("keeps the full bonus when the higher class had 6 or more", () => {
    expect(decide("D2-D3", "KOROTICH Mikhail")).toBe("full"); // 21 D2s
    const six = fileFor("Catégorie D3 participants: 6 6\n1. RIES Alex (Recken) D3 +1,5");
    expect(
      decideSmallCategory(six, { isoDate: "2025-12-28", category: "D3", playerName: "RIES Alex" })
        .kind,
    ).toBe("full");
  });

  it("pools all but the lowest class in multi-class categories", () => {
    expect(decide("A-B1", "KOOB Jerry")).toBe("reduced"); // 0+2+3 = 5 A players
    expect(decide("A1-A3", "WANTZ Gene")).toBe("reduced"); // A1+A2 = 3
  });

  it("counts every entrant in a single-class category", () => {
    const small = fileFor("Catégorie D3 participants: 5 5\n1. RIES Alex (Recken) D3 +1,5");
    expect(
      decideSmallCategory(small, { isoDate: "2025-12-28", category: "D3", playerName: "RIES Alex" })
        .kind,
    ).toBe("reduced");
    expect(decide("D3", "RIES Alex")).toBe("full"); // 18 entrants
  });

  it("matches a shortened first name and a PDF dated one day off", () => {
    expect(decide("C1-C2", "FEITZ Tommy", "2025-12-27")).toBe("reduced");
  });

  it("leaves youth categories alone", () => {
    expect(decide("C3•JUN", "FEITZ Tom")).toBe("youth");
  });
});
