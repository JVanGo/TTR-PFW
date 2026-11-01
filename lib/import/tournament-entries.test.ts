import { describe, expect, it } from "vitest";
import {
  assignPlacersByLayout,
  categoryClasses,
  decideSmallCategory,
  parseTournamentPdfText,
  pdfPlacements,
  r2LabelMatchesPdfCategory,
  youthCategoryClasses,
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
});

describe("youth tournaments", () => {
  // Shaped like 2026-05-17-lenger.pdf: categories named differently from R2's labels.
  const text = `Catégorie Individuel PrM-CAD D2-D3 participants: 4 (2) 4 2 Catégorie Individuel PrM-CAD D1 participants: 11
1. TETTAMANTI Matteo (Bartreng) D2 Individuel PrM-CAD D2-D3-1 1. VINTERA Artur (Mamer) D1 +1,5
3. CONG Zhaoping (Lëntgen) D3 Individuel PrM-CAD D2-D3-3 3. IABANJI Valentim (Diddeleng) D1 +0,5
Catégorie Ind. PrM-JUN C3 & JUN D participants: 17 (12) 17 12 Catégorie Individuel PrM-JUN C1-C2 participants: 7 (3)
1. TRINDADE ARAUJO André (Weimeschhaff) C3 +1,5 2. CONSTANTIN Eduard-Stefan (Zéisseng) C1
3. ZHOU Eddie (Houwald) C2 +0,5`;
  const parsed = parseTournamentPdfText(text);
  const placers: Record<string, string[]> = {
    "Individuel PrM-CAD D2-D3": ["tettamanti matteo", "cong zhaoping"],
    "Individuel PrM-CAD D1": ["vintera artur", "iabanji valentim"],
    "Ind. PrM-JUN C3 & JUN D": ["trindade araujo andre"],
    "Individuel PrM-JUN C1-C2": ["constantin eduard stefan", "zhou eddie"],
  };
  for (const [name, list] of Object.entries(placers)) {
    parsed.categories[name].placers = list.map((n, i) => ({
      name: n,
      place: Math.min(i + 1, 3) as 1 | 2 | 3,
    }));
  }
  const file: TournamentEntriesFile = {
    syncedAt: "",
    tournaments: [{ isoDate: "2026-05-17", source: "lenger.pdf", ...parsed }],
  };
  const decide = (category: string, playerName: string) =>
    decideSmallCategory(file, { isoDate: "2026-05-17", category, playerName }).kind;

  it("reduces the higher class of a small youth category, found by the placer's name", () => {
    expect(decide("D2-D3•CAD", "TETTAMANTI Matteo")).toBe("reduced"); // 2 D2s
    expect(decide("C1•JUN", "CONSTANTIN Eduard-Stefan")).toBe("reduced"); // 3 C1s
  });

  it("keeps the full bonus for the lower class and for big categories", () => {
    expect(decide("D2-D3•CAD", "CONG Zhaoping")).toBe("full"); // D3, lower class
    expect(decide("C1•JUN", "ZHOU Eddie")).toBe("full"); // C2, lower class
    expect(decide("D1•CAD", "IABANJI Valentim")).toBe("full"); // 11 entrants
    expect(decide("C3•JUN", "TRINDADE ARAUJO André")).toBe("full"); // 12 C3s
  });

  it("reads the classes a youth category name covers", () => {
    expect(youthCategoryClasses("Ind. PrM-JUN C3 & JUN D")).toEqual(["C3", "D1", "D2", "D3"]);
    expect(youthCategoryClasses("Individuel MIN/CAD D3")).toEqual(["D3"]);
    expect(youthCategoryClasses("PrM-JUN A-B")).toEqual(["A1", "A2", "A3", "B1", "B2", "B3"]);
  });
});

describe("assignPlacersByLayout", () => {
  it("splits two columns even when a text run crosses the boundary", () => {
    const width = 595;
    const result = assignPlacersByLayout([
      {
        width,
        items: [
          { str: "Catégorie D3", x: 39, y: 707 },
          { str: "participants: 18 18", x: 199, y: 707 },
          { str: "Catégorie D2-D3", x: 314, y: 707 },
          { str: "participants: 37 (21)", x: 480, y: 707 },
          { str: "1. MIELCZAREK Simon (Iechternach)", x: 44, y: 690 },
          { str: "+1,5 D3 D3-11. KOROTICH Mikhail (Zolwer)", x: 260, y: 690 },
          { str: "RIES Alex (Recken)", x: 44, y: 640 },
          { str: "D3 +0,5 D3-4 PENG Michael Yitong (Stroossen)", x: 230, y: 640 },
        ],
      },
    ]);
    expect(result["D3"]).toEqual([
      { name: "mielczarek simon", place: 1 },
      { name: "ries alex", place: 3 },
    ]);
    expect(result["D2-D3"]).toEqual([
      { name: "korotich mikhail", place: 1 },
      { name: "peng michael yitong", place: 3 },
    ]);
  });
});

describe("pdfPlacements and label matching", () => {
  it("lists every club placement with the rule applied, skipping doubles and regionals", () => {
    const parsed = parseTournamentPdfText(
      "Catégorie C1-C2 participants: 9 (3)\n1. FEITZ Tom (Helleng) C1 +1,5\n2. GÁSPÁR Milan (Rued) C2 +1",
    );
    parsed.categories["C1-C2"].placers = [
      { name: "feitz tom", place: 1 },
      { name: "gaspar milan", place: 2 },
    ];
    const club = { isoDate: "2025-09-07", source: "2025-09-07-baerdref.pdf", ...parsed };
    const regional = { ...club, source: "2025-11-23-championnats-regionaux-est.pdf" };
    const list = pdfPlacements({ syncedAt: "", tournaments: [club, regional] });
    expect(list.map((p) => [p.name, p.place, p.reduced])).toEqual([
      ["feitz tom", 1, true], // C1, only 3 C1s
      ["gaspar milan", 2, false], // C2, lower class
    ]);
  });

  it("matches R2 labels to PDF categories", () => {
    expect(r2LabelMatchesPdfCategory("C1-C2", "C1-C2")).toBe(true);
    expect(r2LabelMatchesPdfCategory("C1-C2", "B3-C1")).toBe(false);
    expect(r2LabelMatchesPdfCategory("C3•JUN", "Ind. PrM-JUN C3 & JUN D")).toBe(true);
    expect(r2LabelMatchesPdfCategory("C1•JUN", "Ind. PrM-JUN C3 & JUN D")).toBe(false);
  });
});
