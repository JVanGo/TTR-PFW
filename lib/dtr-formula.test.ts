import { describe, expect, it } from "vitest";
import { calculateMatchday, kFactorFor, winProbability } from "./dtr-formula";

describe("kFactorFor", () => {
  const adult = { ageCategory: null, careerMatches: 100, returningGamesLeft: 0 };

  it("is 16 for an experienced adult", () => {
    expect(kFactorFor(adult).k).toBe(16);
  });

  it("adds the age bonus without stacking brackets", () => {
    expect(kFactorFor({ ...adult, ageCategory: "Cadet" }).k).toBe(24);
    expect(kFactorFor({ ...adult, ageCategory: "Espoirs" }).k).toBe(20);
  });

  it("adds +4 below 30 career games and +4 while returning games remain", () => {
    expect(kFactorFor({ ...adult, careerMatches: 29 }).k).toBe(20);
    expect(kFactorFor({ ...adult, careerMatches: 30 }).k).toBe(16);
    expect(kFactorFor({ ...adult, careerMatches: 20, returningGamesLeft: 15 })).toEqual({
      k: 24,
      ageBonus: 0,
      isNewcomerBonus: true,
      isReturningBonus: true,
    });
  });
});

describe("calculateMatchday", () => {
  it("gives an even game half of K either way", () => {
    expect(winProbability(1500, 1500)).toBe(0.5);
    const { games, newDtr } = calculateMatchday({ dtr: 1500, k: 16 }, [
      { opponent: { dtr: 1500, k: 20 }, won: true },
    ]);
    expect(games[0].delta).toBe(8);
    expect(games[0].opponentDelta).toBe(-10);
    expect(games[0].opponentNewDtr).toBe(1490);
    expect(newDtr).toBe(1508);
  });

  it("matches a real stored matchday: ZEQIRI Linda, 19 Sep 2026", () => {
    // K 24, start 1461: lost to 1720 (0), beat 1618 (+22), settled at 1483.
    const day = calculateMatchday({ dtr: 1461, k: 24 }, [
      { opponent: { dtr: 1720, k: 16 }, won: false },
      { opponent: { dtr: 1618, k: 16 }, won: true },
    ]);
    expect(day.games.map((g) => g.delta + 0)).toEqual([0, 22]);
    expect(day.newDtr).toBe(1483);
  });

  it("scores every game against the start-of-day rating and rounds each game on its own", () => {
    const day = calculateMatchday({ dtr: 1500, k: 16 }, [
      { opponent: { dtr: 1500, k: 16 }, won: true },
      { opponent: { dtr: 1500, k: 16 }, won: true },
    ]);
    // Both games use 1500, not 1508 for the second one.
    expect(day.games.map((g) => g.delta)).toEqual([8, 8]);
    expect(day.totalDelta).toBe(16);
  });
});
