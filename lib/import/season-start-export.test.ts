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
  it("parses class, PFW, and classement points per row", () => {
    const buf = buildWorkbook([
      {
        licenceNumber: 25898,
        lastname: "RAKOTONJANAHARY",
        firstname: "Michaël",
        ranking: "C1",
        rankingPoints: 11.5,
        performancePfInitial: 206.81,
        performancePf: 216.27,
        clubName: "Weimeschhaff",
      },
    ]);
    expect(parseSeasonStartExport(buf)).toEqual([
      { flttPlayerId: "25898", class: "C1", pfw: 206.81, classementPoints: 11.5 },
    ]);
  });

  it("carries a null rankingPoints through as null (A1/A2 don't use classement)", () => {
    const buf = buildWorkbook([
      { licenceNumber: 27551, ranking: "A1", rankingPoints: null, performancePfInitial: 848.86 },
    ]);
    expect(parseSeasonStartExport(buf)).toEqual([
      { flttPlayerId: "27551", class: "A1", pfw: 848.86, classementPoints: null },
    ]);
  });

  it("clamps rankingPoints to the -5.5..11.5 classement range", () => {
    const buf = buildWorkbook([
      { licenceNumber: 1, ranking: "A3", rankingPoints: 16.5, performancePfInitial: 444.71 },
      { licenceNumber: 2, ranking: "D2", rankingPoints: -6.5, performancePfInitial: 86.71 },
    ]);
    const parsed = parseSeasonStartExport(buf);
    expect(parsed[0].classementPoints).toBe(11.5);
    expect(parsed[1].classementPoints).toBe(-5.5);
  });

  it("skips rows with an invalid class or missing licence", () => {
    const buf = buildWorkbook([
      { licenceNumber: 1, ranking: "ZZ", performancePfInitial: 100 },
      { ranking: "C1", performancePfInitial: 100 },
    ]);
    expect(parseSeasonStartExport(buf)).toEqual([]);
  });

  it("skips a row with an unusable PFW (0, or not a number) for a class that needs it", () => {
    const buf = buildWorkbook([
      { licenceNumber: 1, ranking: "B1", performancePfInitial: 0 },
      { licenceNumber: 2, ranking: "B1", performancePfInitial: "not-a-number" },
    ]);
    expect(parseSeasonStartExport(buf)).toEqual([]);
  });

  it("keeps a classement-class row despite an unusable PFW, since it's never read", () => {
    const buf = buildWorkbook([
      { licenceNumber: 1, ranking: "C1", rankingPoints: 5, performancePfInitial: 0 },
    ]);
    expect(parseSeasonStartExport(buf)).toEqual([
      { flttPlayerId: "1", class: "C1", pfw: 0, classementPoints: 5 },
    ]);
  });
});
