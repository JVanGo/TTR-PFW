import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import {
  type ForfeitEntry,
  type ForfeitExclusion,
  type MatchCandidateRow,
  type PerformanceGapConfirmedForfeit,
  type PerformanceGapRow,
  excludeKnownFalsePositives,
  findMarkerOnlyForfeits,
  findPerformanceGapForfeits,
  matchForfeits,
  parseForfeits,
  parseSpT,
} from "./forfeits";
import type { ForfeitOverride } from "./forfeit-overrides";

function buildWorkbook(sheets: Record<string, Record<string, unknown>[]>): Buffer {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), name);
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

describe("parseSpT", () => {
  it("decodes family-half.round", () => {
    expect(parseSpT("S-2.8")).toEqual({ family: "S", half: 2, round: 8 });
    expect(parseSpT("MIN-1.3")).toEqual({ family: "MIN", half: 1, round: 3 });
  });

  it("returns null for an unrecognized shape", () => {
    expect(parseSpT("not-a-spt")).toBeNull();
    expect(parseSpT("")).toBeNull();
  });
});

describe("parseForfeits", () => {
  it("parses FF and FFp sheets identically", () => {
    const buf = buildWorkbook({
      FF: [
        {
          SpT: "S-2.8",
          MatchNr: "ZU-0182",
          Club: "LN",
          Equipe: "Lenneng 4",
          NOM: "APEL",
          Prenom: "Bob",
          Lic: 23847,
          Class: "C1",
        },
      ],
      FFp: [
        {
          SpT: "S-1.2",
          MatchNr: "XC-0171",
          Club: "LN",
          Equipe: "Lenneng 3",
          NOM: "OMS",
          Prenom: "Mara",
          Lic: 21018,
          Class: "B2",
        },
      ],
    });
    const entries = parseForfeits(buf);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      flttPlayerId: "23847",
      half: 2,
      round: 8,
      team: "Lenneng 4",
    });
    expect(entries[1]).toMatchObject({
      flttPlayerId: "21018",
      half: 1,
      round: 2,
      team: "Lenneng 3",
    });
  });

  it("skips rows with a missing licence or an unparseable SpT", () => {
    const buf = buildWorkbook({
      FF: [
        { SpT: "S-2.8", Equipe: "Lenneng 4", Lic: "" },
        { SpT: "garbage", Equipe: "Lenneng 4", Lic: 1 },
        { SpT: "S-2.8", Equipe: "", Lic: 1 },
      ],
    });
    expect(parseForfeits(buf)).toEqual([]);
  });
});

describe("matchForfeits", () => {
  function row(overrides: Partial<MatchCandidateRow>): MatchCandidateRow {
    return {
      id: "id",
      flttPlayerId: "1",
      round: 8,
      competition: "CH SEN N2-D5 (R2)",
      matchLabel: "Lenneng 4 - Bäerdref 2",
      score: "0-3",
      isoDate: "2026-04-18",
      opponentName: "Bäerdref 2 Opponent",
      hasForfeitMarker: false,
      ...overrides,
    };
  }
  function entry(overrides: Partial<ForfeitEntry> = {}): ForfeitEntry {
    return {
      flttPlayerId: "1",
      family: "S",
      half: 2,
      round: 8,
      team: "Lenneng 4",
      sourceLabel: "APEL Bob (FF, S-2.8/ZU-0182)",
      ...overrides,
    };
  }

  it("applies a clean 0-3 sweep", () => {
    const rows = [row({ id: "a", score: "0-3" }), row({ id: "b", score: "0-3" })];
    const result = matchForfeits(rows, [entry()]);
    expect(result.forfeitedRowIds).toEqual(new Set(["a", "b"]));
    expect(result.reviewLines).toEqual([]);
  });

  it("applies the forfeit to just the 0-3 board, leaving a real played board in the same tie untouched", () => {
    const rows = [row({ id: "a", score: "0-3" }), row({ id: "b", score: "1-3" })];
    const result = matchForfeits(rows, [entry()]);
    expect(result.forfeitedRowIds).toEqual(new Set(["a"]));
    expect(result.reviewLines).toEqual([]);
  });

  it("flags an entry whose matched games include neither forfeit score at all", () => {
    const rows = [row({ id: "a", score: "1-3" }), row({ id: "b", score: "2-3" })];
    const result = matchForfeits(rows, [entry()]);
    expect(result.forfeitedRowIds.size).toBe(0);
    expect(result.reviewLines).toHaveLength(1);
    expect(result.reviewLines[0]).toContain('none with a "0-3"/"0-0" forfeit score');
  });

  it('treats a "0-0" board as a forfeit too, within a named entry', () => {
    // Confirmed with Jeff on 2026-08-13 (RAGNACCI Tun, CONG Zhaoping): a
    // regular single-sided forfeit sometimes gets recorded as "0-0" instead
    // of "0-3" by mistake. Only trusted here, scoped to a player Forfaits.xlsx
    // already names as having forfeited this exact tie — not a general
    // "0-0 always means forfeit" rule (a real mutual double-forfeit also
    // legitimately shows "0-0").
    const rows = [row({ id: "a", score: "0-0" }), row({ id: "b", score: "0-3" })];
    const result = matchForfeits(rows, [entry()]);
    expect(result.forfeitedRowIds).toEqual(new Set(["a", "b"]));
    expect(result.reviewLines).toEqual([]);
  });

  it("applies an override to every matched candidate, bypassing the score check entirely", () => {
    const rows = [row({ id: "a", score: "0-0" }), row({ id: "b", score: "0-0" })];
    const overrides: ForfeitOverride[] = [
      {
        flttPlayerId: "1",
        name: "APEL Bob",
        half: 2,
        round: 8,
        team: "Lenneng 4",
        note: "test override",
      },
    ];
    const result = matchForfeits(rows, [entry()], overrides);
    expect(result.forfeitedRowIds).toEqual(new Set(["a", "b"]));
    expect(result.reviewLines).toEqual([]);
  });

  it("narrows an override to one specific date when round+half+team alone still matches multiple ties", () => {
    // Confirmed with real data (SWARTENBROUCKX Gaetan, NL1) — a competition
    // whose round numbers aren't unique across the season, so round+half+team
    // still lands on more than one real tie. Would otherwise hit the
    // multi-date bail-out below, which is why the override check runs first.
    const rows = [
      row({ id: "real-1", score: "0-3", isoDate: "2026-01-24" }),
      row({ id: "real-2", score: "0-3", isoDate: "2026-01-24" }),
      row({ id: "unrelated-1", score: "3-0", isoDate: "2026-03-15" }),
      row({ id: "unrelated-2", score: "0-3", isoDate: "2026-03-15" }),
    ];
    const overrides: ForfeitOverride[] = [
      {
        flttPlayerId: "1",
        name: "SWARTENBROUCKX Gaetan",
        half: 2,
        round: 8,
        team: "Lenneng 4",
        isoDate: "2026-01-24",
        note: "test override",
      },
    ];
    const result = matchForfeits(rows, [entry()], overrides);
    expect(result.forfeitedRowIds).toEqual(new Set(["real-1", "real-2"]));
    expect(result.reviewLines).toEqual([]);
  });

  it("flags an override whose isoDate doesn't match any candidate", () => {
    const rows = [row({ id: "a", score: "0-3", isoDate: "2025-09-01" })];
    const overrides: ForfeitOverride[] = [
      {
        flttPlayerId: "1",
        name: "APEL Bob",
        half: 2,
        round: 8,
        team: "Lenneng 4",
        isoDate: "2099-01-01",
        note: "test override",
      },
    ];
    const result = matchForfeits(rows, [entry()], overrides);
    expect(result.forfeitedRowIds.size).toBe(0);
    expect(result.reviewLines).toHaveLength(1);
    expect(result.reviewLines[0]).toContain("expects a game on 2099-01-01");
  });

  it("flags when no candidate game is found", () => {
    const result = matchForfeits([], [entry()]);
    expect(result.forfeitedRowIds.size).toBe(0);
    expect(result.reviewLines[0]).toContain("no matching game found");
  });

  it("flags candidates spanning more than one date", () => {
    const rows = [
      row({ id: "a", score: "0-3", isoDate: "2026-04-18" }),
      row({ id: "b", score: "0-3", isoDate: "2025-11-29" }),
    ];
    const result = matchForfeits(rows, [entry()]);
    expect(result.forfeitedRowIds.size).toBe(0);
    expect(result.reviewLines[0]).toContain("different dates");
  });

  it("doesn't match a row from a different round, half, or team", () => {
    const rows = [
      row({ id: "wrong-round", round: 7 }),
      row({ id: "wrong-half", competition: "CH SEN N2-D5 (R1)" }),
      row({ id: "wrong-team", matchLabel: "Bäerdref 2 - Houwald 1" }),
    ];
    const result = matchForfeits(rows, [entry()]);
    expect(result.forfeitedRowIds.size).toBe(0);
    expect(result.reviewLines[0]).toContain("no matching game found");
  });

  it("doesn't let a same round+half+team game from a DIFFERENT competition family contaminate the candidates", () => {
    // Confirmed with real data (BONNE RAAD Timothée, "Stroossen 2") — a
    // player can play the same team number in two different age-category
    // leagues, and both can land on the same round number under the same
    // "(Rx)" half tag. The family code (CH CAD vs CH MIN here) is what tells
    // them apart.
    const rows = [
      row({ id: "cad", score: "0-3", competition: "CH CAD (R2)" }),
      row({ id: "min", score: "3-1", competition: "CH MIN (R2)" }),
    ];
    const result = matchForfeits(rows, [entry({ family: "C" })]);
    expect(result.forfeitedRowIds).toEqual(new Set(["cad"]));
    expect(result.reviewLines).toEqual([]);
  });

  it("still matches a family across a differently-labeled competition for the same age category", () => {
    // Confirmed with real data (CHOURIS Hector) — "CH CAD" (the regular
    // league) and "M•supp CAD" (supplementary/makeup Cadets matches) are both
    // family "C". An over-strict "starts with CH CAD" match wrongly excluded
    // his own real forfeit here as "no matching game found".
    const rows = [row({ id: "a", score: "0-3", competition: "M•supp CAD (R2)" })];
    const result = matchForfeits(rows, [entry({ family: "C" })]);
    expect(result.forfeitedRowIds).toEqual(new Set(["a"]));
    expect(result.reviewLines).toEqual([]);
  });

  it("falls back to round+half+team alone for a family code with no known competition mapping", () => {
    const rows = [row({ id: "a", score: "0-3", competition: "CH SEN N2-D5 (R2)" })];
    const result = matchForfeits(rows, [entry({ family: "N" })]);
    expect(result.forfeitedRowIds).toEqual(new Set(["a"]));
  });

  it("gives multiple same-day forfeited boards their own row ids", () => {
    const rows = [
      row({ id: "a", score: "0-3" }),
      row({ id: "b", score: "0-3" }),
      row({ id: "c", score: "0-3" }),
    ];
    const result = matchForfeits(rows, [entry()]);
    expect(result.forfeitedRowIds).toEqual(new Set(["a", "b", "c"]));
  });
});

describe("findMarkerOnlyForfeits", () => {
  function row(overrides: Partial<MatchCandidateRow>): MatchCandidateRow {
    return {
      id: "id",
      flttPlayerId: "26913",
      round: 3,
      competition: "CH CAD (R2)",
      matchLabel: "Lëntgen 4 - Stroossen 2",
      score: "0-3",
      isoDate: "2026-01-24",
      opponentName: "PENG Michael Yitong",
      hasForfeitMarker: true,
      ...overrides,
    };
  }

  it("picks up a marked 0-3 row not already caught by the spreadsheet match", () => {
    const rows = [row({ id: "a" }), row({ id: "b" })];
    const result = findMarkerOnlyForfeits(rows, new Set());
    expect(result.forfeitedRowIds).toEqual(new Set(["a", "b"]));
    expect(result.noteLines).toHaveLength(2);
  });

  it("skips a row already found via Forfaits.xlsx, without duplicating or double-noting it", () => {
    const rows = [row({ id: "a" }), row({ id: "b" })];
    const result = findMarkerOnlyForfeits(rows, new Set(["a"]));
    expect(result.forfeitedRowIds).toEqual(new Set(["b"]));
    expect(result.noteLines).toHaveLength(1);
  });

  it("ignores a marked row that isn't an exact 0-3", () => {
    const rows = [row({ id: "a", score: "1-3" })];
    const result = findMarkerOnlyForfeits(rows, new Set());
    expect(result.forfeitedRowIds.size).toBe(0);
  });

  it("ignores an unmarked row even if it happens to be 0-3", () => {
    const rows = [row({ id: "a", hasForfeitMarker: false })];
    const result = findMarkerOnlyForfeits(rows, new Set());
    expect(result.forfeitedRowIds.size).toBe(0);
  });
});

describe("excludeKnownFalsePositives", () => {
  function row(overrides: Partial<MatchCandidateRow>): MatchCandidateRow {
    return {
      id: "id",
      flttPlayerId: "25817",
      round: 4,
      competition: "CH SEN N2-D5 (R1)",
      matchLabel: "Beetebuerg-P. 2 - Zolwer 1",
      score: "0-3",
      isoDate: "2025-10-11",
      opponentName: "BIERNACKI Kacper",
      hasForfeitMarker: false,
      ...overrides,
    };
  }

  // Confirmed with real data (BRITTNACHER Jürgen, 2026-08-13): a real,
  // played match that just ended 0-3, wrongly swept in by the general
  // pattern alongside his teammate's actual forfeit that same day.
  const exclusion: ForfeitExclusion = {
    flttPlayerId: "25817",
    name: "BRITTNACHER Jürgen",
    isoDate: "2025-10-11",
    opponentName: "BIERNACKI Kacper",
    note: "test exclusion",
  };

  it("removes a row matching an exclusion from an already-computed forfeit set", () => {
    const rows = [row({ id: "biernacki" }), row({ id: "hamrouni", opponentName: "HAMROUNI Slim" })];
    const result = excludeKnownFalsePositives(rows, new Set(["biernacki", "hamrouni"]), [
      exclusion,
    ]);
    expect(result).toEqual(new Set(["hamrouni"]));
  });

  it("leaves the set untouched when nothing matches an exclusion", () => {
    const rows = [row({ id: "hamrouni", opponentName: "HAMROUNI Slim" })];
    const result = excludeKnownFalsePositives(rows, new Set(["hamrouni"]), [exclusion]);
    expect(result).toEqual(new Set(["hamrouni"]));
  });

  it("is a no-op with an empty exclusion list", () => {
    const rows = [row({ id: "biernacki" })];
    const result = excludeKnownFalsePositives(rows, new Set(["biernacki"]), []);
    expect(result).toEqual(new Set(["biernacki"]));
  });
});

describe("findPerformanceGapForfeits", () => {
  // A fixed "today" for every test below: close enough to the rows' default
  // isoDate (2026-05-16) that the trailing-12-month window doesn't
  // accidentally swallow rows that aren't testing that behavior
  // specifically, but far enough past it (14 days) to clear
  // PERFORMANCE_CRAWL_LAG_SAFETY_DAYS too, for the same reason.
  const NOW = "2026-05-30";

  function row(overrides: Partial<PerformanceGapRow>): PerformanceGapRow {
    return {
      id: "id",
      flttPlayerId: "25657",
      playerName: "HANSEN Finja",
      round: 1,
      competition: "CH JEU (R1)",
      matchLabel: "Diddeleng 2 - Lénger 1",
      score: "0-3",
      isoDate: "2026-05-16",
      opponentName: "VALENTE Noah",
      hasForfeitMarker: false,
      hasPerformance: false,
      ...overrides,
    };
  }

  // Confirmed for real against fltt.lu (2026-08-14): HANSEN Finja forfeited
  // 6 games neither Forfaits.xlsx nor the internal marker caught, spread
  // across 3 ties on one day — this is the shape one of those rows takes.
  it("surfaces a missing-Performance row for an otherwise-normal player", () => {
    const rows = [
      row({ id: "target" }),
      // Establishes the player has Performance data elsewhere this season —
      // without this, the crawl-gap skip would swallow "target" too.
      row({
        id: "other-present",
        opponentName: "SOMEONE ELSE",
        isoDate: "2026-01-01",
        hasPerformance: true,
      }),
      // The opponent's own mirror row — a normal row, not a known forfeit.
      row({
        id: "mirror",
        flttPlayerId: "25618",
        playerName: "VALENTE Noah",
        opponentName: "HANSEN Finja",
        score: "3-0",
        hasPerformance: false,
      }),
    ];
    const result = findPerformanceGapForfeits(rows, new Set(), NOW);
    expect(result.reviewLines).toHaveLength(1);
    expect(result.reviewLines[0]).toContain("HANSEN Finja");
  });

  it("excludes TOU tournaments and the COU FELTEN cup, same as the rating simulation", () => {
    const rows = [
      row({ id: "tou", competition: "TOU Diddeleng" }),
      row({ id: "cup", competition: "COU FELTEN (Q)" }),
    ];
    const result = findPerformanceGapForfeits(rows, new Set(), NOW);
    expect(result.reviewLines).toHaveLength(0);
  });

  it("silently drops the winning side of an already-known forfeit", () => {
    const rows = [
      row({
        id: "loser",
        flttPlayerId: "A",
        playerName: "Loser Name",
        opponentName: "Winner Name",
        score: "0-3",
      }),
      row({
        id: "winner",
        flttPlayerId: "B",
        playerName: "Winner Name",
        opponentName: "Loser Name",
        score: "3-0",
      }),
      row({
        id: "a-present",
        flttPlayerId: "A",
        playerName: "Loser Name",
        opponentName: "X",
        isoDate: "2026-04-01",
        hasPerformance: true,
      }),
      row({
        id: "b-present",
        flttPlayerId: "B",
        playerName: "Winner Name",
        opponentName: "Y",
        isoDate: "2026-04-01",
        hasPerformance: true,
      }),
    ];
    // "loser" is already a known forfeit (e.g. from Forfaits.xlsx).
    const result = findPerformanceGapForfeits(rows, new Set(["loser"]), NOW);
    expect(result.reviewLines).toHaveLength(0);
  });

  // Confirmed with Jeff on 2026-08-15: FLTT's Performance table is a rolling
  // trailing-12-months window measured from crawl time, not tied to the FLTT
  // season. A match old enough to have plausibly rolled off that window must
  // never be treated as a forfeit candidate — including during season
  // rollover work, when this can run many months after the match was played.
  it("excludes a match old enough to have rolled out of FLTT's 12-month Performance window", () => {
    const rows = [
      // Over a year before NOW — well past the window, even with a safety
      // margin. Should be excluded purely on age, despite otherwise looking
      // exactly like the surfaced HANSEN Finja case above.
      row({ id: "aged-out", isoDate: "2025-01-01" }),
      // Recent and present, so the player clearly isn't a Poos-Piotr-style
      // whole-season crawl gap — isolates the age cutoff as the reason.
      row({
        id: "recent-present",
        opponentName: "SOMEONE ELSE",
        isoDate: "2026-05-01",
        hasPerformance: true,
      }),
    ];
    const result = findPerformanceGapForfeits(rows, new Set(), NOW);
    expect(result.reviewLines).toHaveLength(0);
  });

  // Confirmed for real against fltt.lu (2026-10-02): MINDEN Christophe's
  // CH SEN N2-D5 Performance rows existed for his Sept 19 and Sept 26
  // matchdays but not yet for Sept 30 (2 days before the check) — FLTT's own
  // Performance crawl just hadn't caught up to the newest matchday, not a
  // forfeit. A just-played match must never be treated as a candidate,
  // mirroring the aged-out-the-other-end case above.
  it("excludes a match too recent for FLTT's own Performance crawl to have caught up to yet", () => {
    const rows = [
      // 2 days before NOW — well inside the crawl-lag margin.
      row({ id: "too-new", isoDate: "2026-05-28", score: "3-2" }),
      // Recent and present, so the player clearly isn't a Poos-Piotr-style
      // whole-season crawl gap — isolates the lag cutoff as the reason.
      row({
        id: "recent-present",
        opponentName: "SOMEONE ELSE",
        isoDate: "2026-05-10",
        hasPerformance: true,
      }),
    ];
    const result = findPerformanceGapForfeits(rows, new Set(), NOW);
    expect(result.reviewLines).toHaveLength(0);
  });

  // Confirmed for real against fltt.lu (2026-08-14): POOS Piotr's entire
  // season showed zero joined Performance rows despite fltt.lu's live page
  // having real Performance data for every one of his games — a crawl gap in
  // the source data, not a forfeit, and indistinguishable from a real
  // forfeit by looking at any single row.
  it("skips every row for a player with zero Performance rows anywhere this season", () => {
    const rows = [
      row({
        id: "piotr-1",
        flttPlayerId: "28049",
        playerName: "POOS Piotr",
        opponentName: "LAMBERTY Leonie",
      }),
      row({
        id: "piotr-2",
        flttPlayerId: "28049",
        playerName: "POOS Piotr",
        opponentName: "ZOLLER Philippe",
      }),
      row({
        id: "piotr-3",
        flttPlayerId: "28049",
        playerName: "POOS Piotr",
        opponentName: "KOVAL Niko",
        score: "3-1",
      }),
    ];
    const result = findPerformanceGapForfeits(rows, new Set(), NOW);
    expect(result.reviewLines).toHaveLength(0);
  });

  it("doesn't re-surface a row that's already a known forfeit", () => {
    const rows = [
      row({ id: "known" }),
      row({
        id: "other-present",
        opponentName: "SOMEONE ELSE",
        isoDate: "2026-01-01",
        hasPerformance: true,
      }),
    ];
    const result = findPerformanceGapForfeits(rows, new Set(["known"]), NOW);
    expect(result.reviewLines).toHaveLength(0);
  });

  describe("with a confirmed list", () => {
    function confirmed(
      overrides: Partial<PerformanceGapConfirmedForfeit>,
    ): PerformanceGapConfirmedForfeit {
      return {
        flttPlayerId: "25657",
        name: "HANSEN Finja",
        isoDate: "2026-05-16",
        ...overrides,
      };
    }

    it("moves a matched candidate into confirmedForfeitRowIds instead of reviewLines", () => {
      const rows = [
        row({ id: "target" }),
        row({
          id: "other-present",
          opponentName: "SOMEONE ELSE",
          isoDate: "2026-01-01",
          hasPerformance: true,
        }),
      ];
      const result = findPerformanceGapForfeits(rows, new Set(), NOW, [confirmed({})]);
      expect(result.confirmedForfeitRowIds).toEqual(new Set(["target"]));
      expect(result.reviewLines).toHaveLength(0);
    });

    it("matches on (flttPlayerId, isoDate) regardless of which opponent the row names", () => {
      const rows = [
        row({ id: "board-1", opponentName: "SCHOLTES Pit" }),
        row({ id: "board-2", opponentName: "VALENTE Noah" }),
        row({
          id: "other-present",
          opponentName: "SOMEONE ELSE",
          isoDate: "2026-01-01",
          hasPerformance: true,
        }),
      ];
      const result = findPerformanceGapForfeits(rows, new Set(), NOW, [confirmed({})]);
      expect(result.confirmedForfeitRowIds).toEqual(new Set(["board-1", "board-2"]));
    });

    it("matches on the row's own identity even when that row belongs to the winning opponent, not the forfeiting player", () => {
      // Mirrors PIRES Yannick's real case: EIFFES-SCHAUS Lex is the one who
      // actually forfeited, but only the winning opponent's (Pires') own row
      // made it into the candidate set — so the confirmed entry has to be
      // keyed on Pires' identity, not Lex's, for it to match anything here.
      const rows = [
        row({
          id: "opponent-row",
          flttPlayerId: "27886",
          playerName: "PIRES Yannick",
          opponentName: "EIFFES-SCHAUS Lex",
          isoDate: "2026-02-07",
        }),
        row({
          id: "other-present",
          flttPlayerId: "27886",
          playerName: "PIRES Yannick",
          opponentName: "SOMEONE ELSE",
          isoDate: "2026-01-01",
          hasPerformance: true,
        }),
      ];
      const result = findPerformanceGapForfeits(rows, new Set(), NOW, [
        confirmed({ flttPlayerId: "27886", name: "PIRES Yannick", isoDate: "2026-02-07" }),
      ]);
      expect(result.confirmedForfeitRowIds).toEqual(new Set(["opponent-row"]));
    });

    it("leaves an unmatched candidate in reviewLines untouched", () => {
      const rows = [
        row({ id: "unrelated", flttPlayerId: "99999", playerName: "Someone Else Entirely" }),
        row({
          id: "other-present",
          flttPlayerId: "99999",
          playerName: "Someone Else Entirely",
          opponentName: "SOMEONE ELSE",
          isoDate: "2026-01-01",
          hasPerformance: true,
        }),
      ];
      const result = findPerformanceGapForfeits(rows, new Set(), NOW, [confirmed({})]);
      expect(result.confirmedForfeitRowIds.size).toBe(0);
      expect(result.reviewLines).toHaveLength(1);
    });
  });
});
