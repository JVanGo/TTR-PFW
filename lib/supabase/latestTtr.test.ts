import { describe, expect, it } from "vitest";
import { pickLatestTtr, pickTtrAsOf, type LatestTtrRow } from "./latestTtr";

const row = (
  player_id: string,
  match_date: string,
  ttr_delta: number,
  new_ttr: number,
): LatestTtrRow => ({ player_id, match_date, ttr_delta, new_ttr });

describe("pickLatestTtr", () => {
  it("takes the last day's rating regardless of row order", () => {
    const rows = [
      row("a", "2026-04-25", 6, 1608),
      row("a", "2026-04-18", 2, 1598),
      row("a", "2026-04-25", 4, 1608),
      row("a", "2026-04-18", 0, 1598),
    ];
    expect(pickLatestTtr(rows).get("a")).toBe(1608);
    expect(pickLatestTtr([...rows].reverse()).get("a")).toBe(1608);
  });

  it("follows a same-day floor-then-growth chain to its end", () => {
    const rows = [
      row("y", "2026-08-01", 12, 862), // growth bonus, starts from 850
      row("y", "2026-08-01", 139, 850), // Ersteinstufung floor, 711 -> 850
      row("y", "2026-05-02", -5, 711),
    ];
    expect(pickLatestTtr(rows).get("y")).toBe(862);
  });

  it("handles a zero-change game on a shared matchday rating", () => {
    const rows = [row("z", "2026-04-25", 0, 1500), row("z", "2026-04-25", 3, 1500)];
    expect(pickLatestTtr(rows).get("z")).toBe(1500);
  });

  it("keeps players separate", () => {
    const rows = [row("a", "2026-04-25", 1, 1200), row("b", "2026-01-10", -3, 900)];
    const latest = pickLatestTtr(rows);
    expect(latest.get("a")).toBe(1200);
    expect(latest.get("b")).toBe(900);
  });
});

describe("pickTtrAsOf", () => {
  const match = (
    player_id: string,
    match_date: string,
    ttr_delta: number,
    new_ttr: number,
    competition = "CH",
  ) => ({
    ...row(player_id, match_date, ttr_delta, new_ttr),
    competition,
  });

  it("counts rows on the date itself, not after it", () => {
    const rows = [
      match("a", "2026-12-20", 10, 1510),
      match("a", "2027-01-01", 12, 1522, "Nachwuchs-Spielstärkezuwachs"),
      match("a", "2027-01-10", -8, 1514),
    ];
    expect(pickTtrAsOf(rows, "2027-01-01").get("a")).toBe(1522);
  });

  it("uses the season-starting rating when every row comes after the date", () => {
    // First day: two matches settle 1500 -> 1515.
    const rows = [
      match("b", "2026-09-20", 10, 1515),
      match("b", "2026-09-20", 5, 1515),
      match("b", "2026-10-01", -5, 1510),
    ];
    expect(pickTtrAsOf(rows, "2026-08-01").get("b")).toBe(1500);
  });

  it("leaves out players with no rows", () => {
    expect(pickTtrAsOf([], "2026-08-01").size).toBe(0);
  });
});
