import { describe, expect, it } from "vitest";
import {
  mapPlayerHistoryToSeasonData,
  type PlayerHistory,
  type PlayerHistorySeason,
  type RencontresRawRow,
} from "./r2-player-history";

function row(overrides: Partial<RencontresRawRow> & { isoDate: string }): RencontresRawRow {
  return {
    id: "row",
    season: "25-26",
    rowType: "match",
    date: overrides.isoDate,
    competition: "CH SEN N2-D5 (R1)",
    round: "",
    matchLabel: "",
    playerRanking: "",
    points: "",
    score: "3-0",
    opponentRanking: "",
    opponent: "OPPONENT Name",
    rowNumber: 1,
    playerScore: 3,
    opponentScore: 0,
    won: true,
    tournamentPlacement: null,
    rawCells: [],
    ...overrides,
  };
}

function season(overrides: Partial<PlayerHistorySeason> & { season: string }): PlayerHistorySeason {
  return {
    rencontresRows: [],
    performanceRows: [],
    matches: [],
    tournamentPlacements: [],
    unifiedMatches: [],
    ...overrides,
  };
}

function history(seasons: PlayerHistorySeason[]): PlayerHistory {
  return {
    player: { flttPlayerId: "1", name: "TEST Player", flttUrl: "" },
    sourceUrl: "",
    currentSeason: "25-26",
    excludedSeasons: [],
    seasons,
    matches: [],
    tournamentPlacements: [],
    unifiedMatches: [],
    unmatchedPerformanceRows: [],
    crawledAt: "2026-01-01T00:00:00Z",
  };
}

describe("mapPlayerHistoryToSeasonData", () => {
  it("falls back to the earliest match's plain playerRanking when no row carries the richer snapshot", () => {
    const h = history([
      season({
        season: "25-26",
        rencontresRows: [
          row({ isoDate: "2026-01-03", playerRanking: "C2", points: "" }),
          row({ isoDate: "2026-02-01", playerRanking: "B2", points: "" }),
        ],
      }),
    ]);
    const mapped = mapPlayerHistoryToSeasonData(h, "25-26");
    expect(mapped.seasonStartSnapshot).toBeNull();
    expect(mapped.earliestKnownClass).toBe("C2");
  });

  it("prefers the richer seasonStartSnapshot over the plain-ranking fallback when both exist", () => {
    const h = history([
      season({
        season: "25-26",
        rencontresRows: [
          row({
            isoDate: "2026-01-03",
            playerRanking: "C2",
            points: JSON.stringify({
              score: 3,
              licence1: { licenceNumber: "1" },
              licence2: null,
              performance: "155.48",
              rgl: 1026,
              points: 0,
              ranking: "C2",
              forfeit: false,
              pointsTemp: 0,
            }),
          }),
        ],
      }),
    ]);
    const mapped = mapPlayerHistoryToSeasonData(h, "25-26");
    expect(mapped.seasonStartSnapshot).not.toBeNull();
    // The plain-ranking fallback is still computed independently — the
    // priority chain in ttr-simulation-io.ts is what decides seasonStart
    // wins over earliestKnownClass, not this function.
    expect(mapped.earliestKnownClass).toBe("C2");
  });

  it("is null when no match row has a recognizable class", () => {
    const h = history([
      season({
        season: "25-26",
        rencontresRows: [row({ isoDate: "2026-01-03", playerRanking: "" })],
      }),
    ]);
    const mapped = mapPlayerHistoryToSeasonData(h, "25-26");
    expect(mapped.earliestKnownClass).toBeNull();
  });
});
