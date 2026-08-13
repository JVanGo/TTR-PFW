import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import {
  type ForfeitEntry,
  type MatchCandidateRow,
  findMarkerOnlyForfeits,
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
