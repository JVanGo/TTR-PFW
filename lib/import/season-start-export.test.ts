import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { parseSeasonStartExport } from "./season-start-export";

function buildWorkbook(rows: Record<string, unknown>[]): Buffer {
  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, sheet, "Worksheet");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

describe("parseSeasonStartExport", () => {
  it("parses class and classement points, and PFW from performancePf (not performancePfInitial)", () => {
    const buf = buildWorkbook([
      {
        licenceNumber: 25898,
        lastname: "RAKOTONJANAHARY",
        firstname: "Michaël",
        ranking: "C1",
        rankingPoints: 11.5,
        performancePfInitial: 206.81, // prior season's start — not what we want
        performancePf: 200, // below the B3 promotion threshold
        clubName: "Weimeschhaff",
      },
    ]);
    expect(parseSeasonStartExport(buf)).toEqual([
      { flttPlayerId: "25898", class: "C1", pfw: 200, classementPoints: 11.5 },
    ]);
  });

  it("promotes a classement-class row (C1-D3) to B3 when performancePf clears the promotion threshold", () => {
    const buf = buildWorkbook([
      { licenceNumber: 1, ranking: "C1", rankingPoints: 11.5, performancePf: 215 },
      { licenceNumber: 2, ranking: "D3", rankingPoints: 0, performancePf: 300 },
      { licenceNumber: 3, ranking: "C1", rankingPoints: 11.5, performancePf: 214.99 },
    ]);
    const parsed = parseSeasonStartExport(buf);
    expect(parsed[0]).toEqual({ flttPlayerId: "1", class: "B3", pfw: 215, classementPoints: 11.5 });
    expect(parsed[1]).toEqual({ flttPlayerId: "2", class: "B3", pfw: 300, classementPoints: 0 });
    expect(parsed[2]).toEqual({
      flttPlayerId: "3",
      class: "C1",
      pfw: 214.99,
      classementPoints: 11.5,
    });
  });

  it("doesn't promote a non-classement class (B1-A1) even above the threshold — already PFW-based", () => {
    const buf = buildWorkbook([
      { licenceNumber: 1, ranking: "B1", rankingPoints: null, performancePf: 400 },
    ]);
    expect(parseSeasonStartExport(buf)).toEqual([
      { flttPlayerId: "1", class: "B1", pfw: 400, classementPoints: null },
    ]);
  });

  it("carries a null rankingPoints through as null (A1/A2 don't use classement)", () => {
    const buf = buildWorkbook([
      { licenceNumber: 27551, ranking: "A1", rankingPoints: null, performancePf: 848.86 },
    ]);
    expect(parseSeasonStartExport(buf)).toEqual([
      { flttPlayerId: "27551", class: "A1", pfw: 848.86, classementPoints: null },
    ]);
  });

  it("clamps rankingPoints to the -5.5..11.5 classement range", () => {
    const buf = buildWorkbook([
      { licenceNumber: 1, ranking: "A3", rankingPoints: 16.5, performancePf: 444.71 },
      { licenceNumber: 2, ranking: "D2", rankingPoints: -6.5, performancePf: 86.71 },
    ]);
    const parsed = parseSeasonStartExport(buf);
    expect(parsed[0].classementPoints).toBe(11.5);
    expect(parsed[1].classementPoints).toBe(-5.5);
  });

  it("skips rows with an invalid class or missing licence", () => {
    const buf = buildWorkbook([
      { licenceNumber: 1, ranking: "ZZ", performancePf: 100 },
      { ranking: "C1", performancePf: 100 },
    ]);
    expect(parseSeasonStartExport(buf)).toEqual([]);
  });

  it("skips a row with an unusable PFW (0, or not a number) for a class that needs it", () => {
    const buf = buildWorkbook([
      { licenceNumber: 1, ranking: "B1", performancePf: 0 },
      { licenceNumber: 2, ranking: "B1", performancePf: "not-a-number" },
    ]);
    expect(parseSeasonStartExport(buf)).toEqual([]);
  });

  it("keeps a classement-class row despite an unusable PFW, since it's never read", () => {
    const buf = buildWorkbook([
      { licenceNumber: 1, ranking: "C1", rankingPoints: 5, performancePf: 0 },
    ]);
    expect(parseSeasonStartExport(buf)).toEqual([
      { flttPlayerId: "1", class: "C1", pfw: 0, classementPoints: 5 },
    ]);
  });
});
