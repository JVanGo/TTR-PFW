import { describe, expect, it } from "vitest";
import {
  ratingDelta,
  simulateSeason,
  winProbability,
  type RawSeasonMatch,
  type RawSeasonPlacement,
  type SimPlayer,
} from "./ttr-simulation";

function player(overrides: Partial<SimPlayer> & { id: string; name: string }): SimPlayer {
  return {
    nameKey: overrides.name.toLowerCase(),
    startingTtr: 1000,
    ageCategory: null,
    careerMatchesBeforeSeason: 100,
    lastMatchIsoDateBeforeSeason: "2025-01-01",
    ...overrides,
  };
}

function match(
  overrides: Partial<RawSeasonMatch> & { playerNameKey: string; opponentNameKey: string },
): RawSeasonMatch {
  return {
    sortKey: "1",
    isoDate: "2025-09-01",
    competition: "Championnat",
    opponentName: overrides.opponentNameKey,
    score: "3-0",
    won: true,
    ...overrides,
  };
}

const SEASON_START = "2025-07-01";
const YOUTH_GROWTH_DATE = "2026-01-01";
// Deliberately far outside every test's match dates — for tests that don't
// exercise the youth growth bonus at all, just need a well-formed period.
const IRRELEVANT_GROWTH_PERIODS = [{ start: "2099-01-01", end: "2099-01-02" }];
// Mirrors production's two Teilrunde windows (see YOUTH_GROWTH_PERIODS in
// ttr-simulation-io.ts): Aug 1 - Jan 1, then Jan 1 - Aug 1.
const STANDARD_GROWTH_PERIODS = [
  { start: "2025-08-01", end: "2026-01-01" },
  { start: "2026-01-01", end: "2026-08-01" },
];

describe("winProbability / ratingDelta against the PDF's worked table (K=16)", () => {
  // DëschTennisRating.pdf, page 3: TTR-diff -> (win%, delta on win, delta on loss)
  const cases: [diff: number, winPct: number, winDelta: number, lossDelta: number][] = [
    [0, 50, 8, -8],
    [21, 58, 7, -9],
    [50, 68, 5, -11],
    [100, 82, 3, -13],
    [150, 91, 1, -15],
    [224, 97, 0, -16],
  ];

  it.each(cases)(
    "diff=%i -> %i%% win, +%i on win, %i on loss",
    (diff, winPct, winDelta, lossDelta) => {
      const pa = winProbability(1100, 1100 - diff);
      expect(Math.round(pa * 100)).toBe(winPct);
      expect(Math.round(ratingDelta(1, pa, 16))).toBe(winDelta);
      expect(Math.round(ratingDelta(0, pa, 16))).toBe(lossDelta);
    },
  );
});

describe("simulateSeason", () => {
  it("applies a single graded match symmetrically to both tracked players", () => {
    const players = [
      player({ id: "a", name: "Alice", startingTtr: 1100 }),
      player({ id: "b", name: "Bob", startingTtr: 1100 }),
    ];
    const matches = [match({ playerNameKey: "alice", opponentNameKey: "bob", won: true })];
    const { matchRows, summary } = simulateSeason({
      players,
      staticTtrByNameKey: new Map(),
      matches,
      placements: [],
      youthGrowthPeriods: IRRELEVANT_GROWTH_PERIODS,
      seasonStartIsoDate: SEASON_START,
    });

    expect(summary.matchesGraded).toBe(2);
    const alice = matchRows.find((r) => r.playerId === "a")!;
    const bob = matchRows.find((r) => r.playerId === "b")!;
    expect(alice.result).toBe("W");
    expect(bob.result).toBe("L");
    expect(alice.ttrDelta).toBe(8);
    expect(bob.ttrDelta).toBe(-8);
    expect(alice.newTtr).toBe(1108);
    expect(bob.newTtr).toBe(1092);
  });

  it("dedupes a real match that appears twice (once per Mongo perspective)", () => {
    const players = [
      player({ id: "a", name: "Alice", startingTtr: 1100 }),
      player({ id: "b", name: "Bob", startingTtr: 1100 }),
    ];
    const matches = [
      match({ sortKey: "1", playerNameKey: "alice", opponentNameKey: "bob", won: true }),
      match({ sortKey: "2", playerNameKey: "bob", opponentNameKey: "alice", won: false }),
    ];
    const { matchRows, summary } = simulateSeason({
      players,
      staticTtrByNameKey: new Map(),
      matches,
      placements: [],
      youthGrowthPeriods: IRRELEVANT_GROWTH_PERIODS,
      seasonStartIsoDate: SEASON_START,
    });

    expect(summary.matchesGraded).toBe(2); // one real match, one row per side
    expect(matchRows).toHaveLength(2);
  });

  it("keeps a player's rating stable across a matchday: same-day matches don't see each other's movement", () => {
    const players = [
      player({ id: "a", name: "Alice", startingTtr: 1100 }),
      player({ id: "b", name: "Bob", startingTtr: 1100 }),
      player({ id: "c", name: "Carol", startingTtr: 1100 }),
    ];
    // Alice beats both Bob and Carol on the same day.
    const matches = [
      match({ sortKey: "1", playerNameKey: "alice", opponentNameKey: "bob", won: true }),
      match({ sortKey: "2", playerNameKey: "alice", opponentNameKey: "carol", won: true }),
    ];
    const { matchRows } = simulateSeason({
      players,
      staticTtrByNameKey: new Map(),
      matches,
      placements: [],
      youthGrowthPeriods: IRRELEVANT_GROWTH_PERIODS,
      seasonStartIsoDate: SEASON_START,
    });

    const aliceRows = matchRows.filter((r) => r.playerId === "a");
    expect(aliceRows).toHaveLength(2);
    // Both wins are against a same-strength opponent starting the day at 1100
    // -> both individual deltas are +8, not a smaller second delta reflecting
    // an already-higher Alice.
    expect(aliceRows[0].ttrDelta).toBe(8);
    expect(aliceRows[1].ttrDelta).toBe(8);
    // The day settles once: both rows show the same final total (1100+8+8=1116).
    expect(aliceRows[0].newTtr).toBe(1116);
    expect(aliceRows[1].newTtr).toBe(1116);
  });

  it("uses a same-day opponent's start-of-day rating, not their already-updated rating from an earlier match that day", () => {
    const players = [
      player({ id: "a", name: "Alice", startingTtr: 1100 }),
      player({ id: "b", name: "Bob", startingTtr: 1100 }),
      player({ id: "d", name: "Dave", startingTtr: 1100 }),
    ];
    // Bob beats Dave first, then loses to Alice, all on the same day.
    const matches = [
      match({ sortKey: "1", playerNameKey: "bob", opponentNameKey: "dave", won: true }),
      match({ sortKey: "2", playerNameKey: "alice", opponentNameKey: "bob", won: true }),
    ];
    const { matchRows } = simulateSeason({
      players,
      staticTtrByNameKey: new Map(),
      matches,
      placements: [],
      youthGrowthPeriods: IRRELEVANT_GROWTH_PERIODS,
      seasonStartIsoDate: SEASON_START,
    });

    const aliceRow = matchRows.find((r) => r.playerId === "a")!;
    // If Bob's post-Dave rating (1108) leaked in, Alice's win would be worth
    // slightly more than +8. It must still read Bob's start-of-day 1100.
    expect(aliceRow.opponentTtr).toBe(1100);
    expect(aliceRow.ttrDelta).toBe(8);
  });

  it("processes matches in chronological order so later results see earlier updates", () => {
    const players = [
      player({ id: "a", name: "Alice", startingTtr: 1100 }),
      player({ id: "b", name: "Bob", startingTtr: 1100 }),
      player({ id: "c", name: "Carol", startingTtr: 1100 }),
    ];
    const matches = [
      match({
        sortKey: "2",
        isoDate: "2025-09-05",
        playerNameKey: "alice",
        opponentNameKey: "carol",
        won: true,
      }),
      match({
        sortKey: "1",
        isoDate: "2025-09-01",
        playerNameKey: "alice",
        opponentNameKey: "bob",
        won: true,
      }),
    ];
    const { matchRows } = simulateSeason({
      players,
      staticTtrByNameKey: new Map(),
      matches,
      placements: [],
      youthGrowthPeriods: IRRELEVANT_GROWTH_PERIODS,
      seasonStartIsoDate: SEASON_START,
    });

    const aliceRows = matchRows
      .filter((r) => r.playerId === "a")
      .sort((x, y) => x.matchDate.localeCompare(y.matchDate));
    expect(aliceRows[0].matchDate).toBe("2025-09-01");
    expect(aliceRows[0].opponentTtr).toBe(1100);
    expect(aliceRows[0].newTtr).toBe(1108);
    // The second match must start from her post-first-match rating (1108), not her original 1100.
    expect(aliceRows[1].matchDate).toBe("2025-09-05");
    const aliceTtrEnteringSecondMatch = aliceRows[1].newTtr - aliceRows[1].ttrDelta;
    expect(aliceTtrEnteringSecondMatch).toBe(1108);
  });

  it("gives a u15 player K=24 (base 16 + the u15 bracket's own +8, not stacked with u21's +4)", () => {
    const players = [
      player({
        id: "a",
        name: "Cadet Player",
        startingTtr: 1100,
        ageCategory: "Cadet",
        careerMatchesBeforeSeason: 100, // experienced -> no newcomer bonus
        lastMatchIsoDateBeforeSeason: "2025-06-01", // recent -> no inactivity bonus
      }),
      player({ id: "b", name: "Bob", startingTtr: 1100 }),
    ];
    const matches = [match({ playerNameKey: "cadet player", opponentNameKey: "bob", won: true })];
    const { matchRows } = simulateSeason({
      players,
      staticTtrByNameKey: new Map(),
      matches,
      placements: [],
      youthGrowthPeriods: IRRELEVANT_GROWTH_PERIODS,
      seasonStartIsoDate: SEASON_START,
    });

    const cadet = matchRows.find((r) => r.playerId === "a")!;
    // Equal ratings -> win probability 0.5 -> delta = 0.5 * K. K=16+8=24 -> delta=12.
    expect(cadet.ttrDelta).toBe(12);
  });

  it("gives a u21-only player (Junior/Espoirs) K=20, distinct from the u15 bracket's K=24", () => {
    const players = [
      player({
        id: "a",
        name: "Junior Player",
        startingTtr: 1100,
        ageCategory: "Junior",
        careerMatchesBeforeSeason: 100,
        lastMatchIsoDateBeforeSeason: "2025-06-01",
      }),
      player({ id: "b", name: "Bob", startingTtr: 1100 }),
    ];
    const matches = [match({ playerNameKey: "junior player", opponentNameKey: "bob", won: true })];
    const { matchRows } = simulateSeason({
      players,
      staticTtrByNameKey: new Map(),
      matches,
      placements: [],
      youthGrowthPeriods: IRRELEVANT_GROWTH_PERIODS,
      seasonStartIsoDate: SEASON_START,
    });

    const junior = matchRows.find((r) => r.playerId === "a")!;
    // K=16+4=20 -> delta=10.
    expect(junior.ttrDelta).toBe(10);
  });

  it("stacks the newcomer and inactivity bonuses on top of the u15 bracket (K=32)", () => {
    const players = [
      player({
        id: "a",
        name: "Cadet Player",
        startingTtr: 1100,
        ageCategory: "Cadet",
        careerMatchesBeforeSeason: 5, // < 30 -> newcomer bonus
        lastMatchIsoDateBeforeSeason: "2023-01-01", // well over 12 months -> inactivity bonus
      }),
      player({ id: "b", name: "Bob", startingTtr: 1100 }),
    ];
    const matches = [match({ playerNameKey: "cadet player", opponentNameKey: "bob", won: true })];
    const { matchRows } = simulateSeason({
      players,
      staticTtrByNameKey: new Map(),
      matches,
      placements: [],
      youthGrowthPeriods: IRRELEVANT_GROWTH_PERIODS,
      seasonStartIsoDate: SEASON_START,
    });

    const cadet = matchRows.find((r) => r.playerId === "a")!;
    // K=16+8+4+4=32 -> delta=16.
    expect(cadet.ttrDelta).toBe(16);
  });

  it("gives a brand-new adult player K=20 (base + newcomer only, not inactivity too)", () => {
    const players = [
      player({
        id: "a",
        name: "New Adult",
        startingTtr: 1100,
        careerMatchesBeforeSeason: 0, // never played -> newcomer bonus
        lastMatchIsoDateBeforeSeason: null, // never played -> not "inactive", just new
      }),
      player({ id: "b", name: "Bob", startingTtr: 1100 }),
    ];
    const matches = [match({ playerNameKey: "new adult", opponentNameKey: "bob", won: true })];
    const { matchRows } = simulateSeason({
      players,
      staticTtrByNameKey: new Map(),
      matches,
      placements: [],
      youthGrowthPeriods: IRRELEVANT_GROWTH_PERIODS,
      seasonStartIsoDate: SEASON_START,
    });

    const row = matchRows.find((r) => r.playerId === "a")!;
    // K=16+4=20 (not 24) -> delta=10.
    expect(row.ttrDelta).toBe(10);
  });

  it("still gives the inactivity bonus to an experienced player with a real, stale last match", () => {
    const players = [
      player({
        id: "a",
        name: "Rusty Veteran",
        startingTtr: 1100,
        careerMatchesBeforeSeason: 100, // experienced -> no newcomer bonus
        lastMatchIsoDateBeforeSeason: "2023-01-01", // real date, well over 12 months -> inactivity bonus
      }),
      player({ id: "b", name: "Bob", startingTtr: 1100 }),
    ];
    const matches = [match({ playerNameKey: "rusty veteran", opponentNameKey: "bob", won: true })];
    const { matchRows } = simulateSeason({
      players,
      staticTtrByNameKey: new Map(),
      matches,
      placements: [],
      youthGrowthPeriods: IRRELEVANT_GROWTH_PERIODS,
      seasonStartIsoDate: SEASON_START,
    });

    const row = matchRows.find((r) => r.playerId === "a")!;
    // K=16+4=20 -> delta=10.
    expect(row.ttrDelta).toBe(10);
  });

  it("excludes TOU tournament games from per-game scoring but applies a flat placement bonus", () => {
    const players = [player({ id: "a", name: "Alice", startingTtr: 1000 })];
    const matches: RawSeasonMatch[] = [
      match({
        playerNameKey: "alice",
        opponentNameKey: "unknown-opponent",
        opponentName: "TOU Opponent",
        competition: "TOU Rued",
        won: true,
      }),
    ];
    const placements: RawSeasonPlacement[] = [
      {
        sortKey: "p1",
        isoDate: "2025-11-16",
        competition: "TOU Rued",
        playerNameKey: "alice",
        place: 3,
      },
    ];
    const { matchRows, summary } = simulateSeason({
      players,
      staticTtrByNameKey: new Map(),
      matches,
      placements,
      youthGrowthPeriods: IRRELEVANT_GROWTH_PERIODS,
      seasonStartIsoDate: SEASON_START,
    });

    expect(summary.tournamentGamesExcluded).toBe(1);
    expect(summary.matchesGraded).toBe(0);
    expect(matchRows).toHaveLength(1);
    expect(matchRows[0].ttrDelta).toBe(5);
    expect(matchRows[0].newTtr).toBe(1005);
  });

  it("excludes COU FELTEN matches entirely, with no placement bonus substitute", () => {
    const players = [
      player({ id: "a", name: "Alice", startingTtr: 1000 }),
      player({ id: "b", name: "Bob", startingTtr: 1000 }),
    ];
    const matches: RawSeasonMatch[] = [
      match({
        playerNameKey: "alice",
        opponentNameKey: "bob",
        competition: "COU FELTEN (Q)",
        won: true,
      }),
      match({
        sortKey: "2",
        playerNameKey: "alice",
        opponentNameKey: "bob",
        competition: "COU FELTEN (TF)",
        won: true,
      }),
    ];
    const { matchRows, summary } = simulateSeason({
      players,
      staticTtrByNameKey: new Map(),
      matches,
      placements: [],
      youthGrowthPeriods: IRRELEVANT_GROWTH_PERIODS,
      seasonStartIsoDate: SEASON_START,
    });

    expect(summary.nonRatedGamesExcluded).toBe(2);
    expect(summary.matchesGraded).toBe(0);
    expect(matchRows).toHaveLength(0);
  });

  it("falls back to a static rating for an untracked opponent, and drops the match if none is available", () => {
    const players = [player({ id: "a", name: "Alice", startingTtr: 1100 })];
    const matches = [
      match({
        playerNameKey: "alice",
        opponentNameKey: "stranger",
        opponentName: "Stranger",
        won: true,
      }),
    ];

    const withFallback = simulateSeason({
      players,
      staticTtrByNameKey: new Map([["stranger", 1000]]),
      matches,
      placements: [],
      youthGrowthPeriods: IRRELEVANT_GROWTH_PERIODS,
      seasonStartIsoDate: SEASON_START,
    });
    expect(withFallback.summary.matchesGraded).toBe(1);
    expect(withFallback.matchRows).toHaveLength(1);

    const withoutFallback = simulateSeason({
      players,
      staticTtrByNameKey: new Map(),
      matches,
      placements: [],
      youthGrowthPeriods: IRRELEVANT_GROWTH_PERIODS,
      seasonStartIsoDate: SEASON_START,
    });
    expect(withoutFallback.summary.droppedNoOpponentRating).toBe(1);
    expect(withoutFallback.matchRows).toHaveLength(0);
  });

  it("applies the U17 youth growth bonus once at the season's Jan 1, only to eligible categories", () => {
    const players = [
      player({ id: "a", name: "Cadet Player", startingTtr: 1000, ageCategory: "Cadet" }),
      player({ id: "b", name: "Espoirs Player", startingTtr: 1000, ageCategory: "Espoirs" }),
      player({ id: "c", name: "Adult Player", startingTtr: 1000, ageCategory: null }),
      player({ id: "d", name: "Filler", startingTtr: 1000 }),
    ];
    // One match before the boundary, one after, both against a fixed-strength filler
    // so we can read the pre/post-growth TTR directly off the match rows.
    const matches = [
      match({
        sortKey: "1",
        isoDate: "2025-09-01",
        playerNameKey: "cadet player",
        opponentNameKey: "filler",
        won: false,
      }),
      match({
        sortKey: "2",
        isoDate: "2025-09-01",
        playerNameKey: "espoirs player",
        opponentNameKey: "filler",
        won: false,
      }),
      match({
        sortKey: "3",
        isoDate: "2025-09-01",
        playerNameKey: "adult player",
        opponentNameKey: "filler",
        won: false,
      }),
      match({
        sortKey: "4",
        isoDate: "2026-02-01",
        playerNameKey: "cadet player",
        opponentNameKey: "filler",
        won: false,
      }),
      match({
        sortKey: "5",
        isoDate: "2026-02-01",
        playerNameKey: "espoirs player",
        opponentNameKey: "filler",
        won: false,
      }),
      match({
        sortKey: "6",
        isoDate: "2026-02-01",
        playerNameKey: "adult player",
        opponentNameKey: "filler",
        won: false,
      }),
    ];
    const { matchRows } = simulateSeason({
      players,
      staticTtrByNameKey: new Map(),
      matches,
      placements: [],
      // The one period under test: [season start, Jan 1) — the 2025-09-01
      // match falls inside it, so the bonus lands on Jan 1.
      youthGrowthPeriods: [{ start: SEASON_START, end: YOUTH_GROWTH_DATE }],
      seasonStartIsoDate: SEASON_START,
    });

    const rowsFor = (id: string) =>
      matchRows
        .filter((r) => r.playerId === id)
        .sort((x, y) => x.matchDate.localeCompare(y.matchDate));
    const growthRowFor = (id: string) =>
      matchRows.find((r) => r.playerId === id && r.competition === "Nachwuchs-Spielstärkezuwachs");

    const cadetGrowth = growthRowFor("a");
    expect(cadetGrowth).toBeDefined();
    expect(cadetGrowth!.matchDate).toBe("2026-01-01");
    expect(cadetGrowth!.ttrDelta).toBe(12);
    expect(cadetGrowth!.result).toBe("W");
    const cadetMatches = rowsFor("a").filter(
      (r) => r.competition !== "Nachwuchs-Spielstärkezuwachs",
    );
    // The second match's starting point reflects the growth bonus already applied.
    expect(cadetMatches[1].newTtr - cadetMatches[1].ttrDelta).toBe(cadetMatches[0].newTtr + 12);

    expect(growthRowFor("b")).toBeUndefined(); // Espoirs: no growth bonus
    expect(growthRowFor("c")).toBeUndefined(); // adult: no growth bonus
  });

  it("applies the youth growth bonus at both Teilrunde ends when the player played within each specific window", () => {
    const players = [
      player({ id: "a", name: "Cadet Player", startingTtr: 1000, ageCategory: "Cadet" }),
      player({ id: "d", name: "Filler", startingTtr: 1000 }),
    ];
    // One match in each Teilrunde window: Aug 1 - Jan 1, then Jan 1 - Aug 1.
    const matches = [
      match({
        sortKey: "1",
        isoDate: "2025-09-01",
        playerNameKey: "cadet player",
        opponentNameKey: "filler",
        won: false,
      }),
      match({
        sortKey: "2",
        isoDate: "2026-02-01",
        playerNameKey: "cadet player",
        opponentNameKey: "filler",
        won: false,
      }),
    ];
    const { matchRows, summary } = simulateSeason({
      players,
      staticTtrByNameKey: new Map(),
      matches,
      placements: [],
      youthGrowthPeriods: STANDARD_GROWTH_PERIODS,
      seasonStartIsoDate: SEASON_START,
    });

    const growthRows = matchRows.filter(
      (r) => r.playerId === "a" && r.competition === "Nachwuchs-Spielstärkezuwachs",
    );
    // Bonuses land on each period's END date (Jan 1, then Aug 1) — not Aug 1
    // and Jan 1, which would be the period *start* dates.
    expect(growthRows.map((r) => r.matchDate).sort()).toEqual(["2026-01-01", "2026-08-01"]);
    expect(summary.youthGrowthBonusesApplied).toBe(2);
  });

  it("only credits the Teilrunde a youth player actually played in, not both", () => {
    const players = [
      player({ id: "a", name: "Cadet Player", startingTtr: 1000, ageCategory: "Cadet" }),
      player({ id: "d", name: "Filler", startingTtr: 1000 }),
    ];
    // Cadet Player's only match falls in the second window (Jan 1 - Aug 1) —
    // they were inactive during the first (Aug 1 - Jan 1) and shouldn't be
    // credited for it just because they played *somewhere* this season.
    const matches = [
      match({
        isoDate: "2026-02-01",
        playerNameKey: "cadet player",
        opponentNameKey: "filler",
        won: false,
      }),
    ];
    const { matchRows, summary } = simulateSeason({
      players,
      staticTtrByNameKey: new Map(),
      matches,
      placements: [],
      youthGrowthPeriods: STANDARD_GROWTH_PERIODS,
      seasonStartIsoDate: SEASON_START,
    });

    const growthRows = matchRows.filter(
      (r) => r.playerId === "a" && r.competition === "Nachwuchs-Spielstärkezuwachs",
    );
    expect(growthRows.map((r) => r.matchDate)).toEqual(["2026-08-01"]);
    expect(summary.youthGrowthBonusesApplied).toBe(1);
  });

  it("does not apply the youth growth bonus to an age-eligible player who never played this season", () => {
    const players = [
      player({ id: "a", name: "Cadet Player", startingTtr: 1000, ageCategory: "Cadet" }),
      player({ id: "d", name: "Filler", startingTtr: 1000 }),
      player({ id: "e", name: "Other", startingTtr: 1000 }),
    ];
    // Cadet Player never appears in any match; someone else's match still
    // pushes the timeline past both growth boundaries.
    const matches = [
      match({
        isoDate: "2026-08-01",
        playerNameKey: "filler",
        opponentNameKey: "other",
        won: true,
      }),
    ];
    const { matchRows } = simulateSeason({
      players,
      staticTtrByNameKey: new Map(),
      matches,
      placements: [],
      youthGrowthPeriods: STANDARD_GROWTH_PERIODS,
      seasonStartIsoDate: SEASON_START,
    });

    expect(matchRows.some((r) => r.playerId === "a")).toBe(false);
  });

  it("uses the Ersteinstufung default when a player has no existing rating", () => {
    const players = [
      player({
        id: "a",
        name: "Brand New Cadet",
        startingTtr: null,
        ageCategory: "Cadet",
        careerMatchesBeforeSeason: 0,
        lastMatchIsoDateBeforeSeason: null,
      }),
      player({ id: "b", name: "Bob", startingTtr: 900 }),
    ];
    const matches = [
      match({ playerNameKey: "brand new cadet", opponentNameKey: "bob", won: false }),
    ];
    const { matchRows } = simulateSeason({
      players,
      staticTtrByNameKey: new Map(),
      matches,
      placements: [],
      youthGrowthPeriods: IRRELEVANT_GROWTH_PERIODS,
      seasonStartIsoDate: SEASON_START,
    });

    const row = matchRows.find((r) => r.playerId === "a")!;
    // Cadet Ersteinstufung is 900, same as Bob -> 50% win prob.
    expect(row.opponentTtr).toBe(900);
  });
});
