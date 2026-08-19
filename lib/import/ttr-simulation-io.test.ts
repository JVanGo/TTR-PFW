import { describe, expect, it } from "vitest";
import {
  previousSeasonLabel,
  seasonStartYear,
  previousNSeasons,
  staleLastMatchSentinelIso,
} from "./ttr-simulation-io";

describe("previousSeasonLabel", () => {
  it("steps a SEASON_LABEL back by one year on both sides", () => {
    expect(previousSeasonLabel("2026-2027")).toBe("2025-2026");
    expect(previousSeasonLabel("2025-2026")).toBe("2024-2025");
  });
});

describe("seasonStartYear", () => {
  it("extracts the numeric start year from a short season label", () => {
    expect(seasonStartYear("25-26")).toBe(25);
    expect(seasonStartYear("09-10")).toBe(9);
  });
});

describe("previousNSeasons", () => {
  it("returns the n seasons immediately before current, most recent first", () => {
    expect(previousNSeasons("25-26", 2)).toEqual(["24-25", "23-24"]);
    expect(previousNSeasons("25-26", 4)).toEqual(["24-25", "23-24", "22-23", "21-22"]);
  });

  it("pads and wraps across the century boundary", () => {
    expect(previousNSeasons("02-03", 4)).toEqual(["01-02", "00-01", "99-00", "98-99"]);
  });
});

describe("staleLastMatchSentinelIso", () => {
  it("returns a date exactly LAST_ACTIVE_DATE_SEASON_LOOKBACK (4) years before season start", () => {
    expect(staleLastMatchSentinelIso("2025-07-01")).toBe("2021-07-01");
  });
});
