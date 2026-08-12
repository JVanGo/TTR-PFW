import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import {
  type ForfeitEntry,
  type MatchCandidateRow,
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
  it("decodes family-half.round, ignoring the leading family letters", () => {
    expect(parseSpT("S-2.8")).toEqual({ half: 2, round: 8 });
    expect(parseSpT("MIN-1.3")).toEqual({ half: 1, round: 3 });
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
      ...overrides,
    };
  }
  function entry(overrides: Partial<ForfeitEntry> = {}): ForfeitEntry {
    return {
      flttPlayerId: "1",
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

  it("flags an entry whose matched games include no 0-3 board at all", () => {
    const rows = [row({ id: "a", score: "1-3" }), row({ id: "b", score: "2-3" })];
    const result = matchForfeits(rows, [entry()]);
    expect(result.forfeitedRowIds.size).toBe(0);
    expect(result.reviewLines).toHaveLength(1);
    expect(result.reviewLines[0]).toContain('none with the "0-3" forfeit score');
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
