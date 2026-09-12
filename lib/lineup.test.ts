import { describe, expect, it } from "vitest";
import {
  buildTeams,
  isValidArrangement,
  legalTargetIndices,
  movePlayer,
  toleranceTierFor,
  type LineupPlayer,
} from "./lineup";

function player(id: string, dtr: number, opts: Partial<LineupPlayer> = {}): LineupPlayer {
  return { id, name: id, dtr, isYouth: false, isKader: false, ageCategory: null, ...opts };
}

describe("toleranceTierFor", () => {
  it("is base when neither player is youth or Kader", () => {
    expect(toleranceTierFor(player("a", 1500), player("b", 1500))).toBe("base");
  });

  it("is youth if either player is youth", () => {
    expect(toleranceTierFor(player("a", 1500, { isYouth: true }), player("b", 1500))).toBe("youth");
    expect(toleranceTierFor(player("a", 1500), player("b", 1500, { isYouth: true }))).toBe("youth");
  });

  it("prefers Kader over youth when a player is both, or the pair is mixed", () => {
    expect(toleranceTierFor(player("a", 1500, { isKader: true }), player("b", 1500))).toBe("kader");
    expect(
      toleranceTierFor(
        player("a", 1500, { isKader: true, isYouth: true }),
        player("b", 1500, { isYouth: true }),
      ),
    ).toBe("kader");
  });
});

describe("isValidArrangement", () => {
  it("allows a later player up to the tolerance stronger than an earlier one, blocks one point over", () => {
    const weaker = player("weak", 1465);
    expect(isValidArrangement([weaker, player("strong", 1500)], [4])).toBe(true); // gap 35, team
    expect(isValidArrangement([weaker, player("strong", 1501)], [4])).toBe(false); // gap 36, team
  });

  it("never violates when the later player is weaker or equal, regardless of gap size", () => {
    expect(isValidArrangement([player("strong", 5000), player("weak", 1)], [4])).toBe(true);
  });

  it("uses the club-wide tolerance across a team boundary", () => {
    const team0 = [player("a1", 1500), player("a2", 1490), player("a3", 1480), player("a4", 1470)];
    // a4 (weakest in team0) vs a newcomer in team1 is the tightest constraint.
    expect(isValidArrangement([...team0, player("b1", 1520)], [4, 1])).toBe(true); // gap to a4 = 50
    expect(isValidArrangement([...team0, player("b1", 1521)], [4, 1])).toBe(false); // gap to a4 = 51
  });

  it("widens tolerance to 70/85 when either player is youth, 105/120 for Kader", () => {
    expect(
      isValidArrangement([player("weak", 1430, { isYouth: true }), player("strong", 1500)], [4]),
    ).toBe(true); // gap 70
    expect(
      isValidArrangement([player("weak", 1429, { isYouth: true }), player("strong", 1500)], [4]),
    ).toBe(false); // gap 71
    expect(
      isValidArrangement([player("weak", 1395, { isKader: true }), player("strong", 1500)], [4]),
    ).toBe(true); // gap 105
    expect(
      isValidArrangement([player("weak", 1394, { isKader: true }), player("strong", 1500)], [4]),
    ).toBe(false); // gap 106
  });

  it("catches a violation between non-adjacent players even when every adjacent gap is within tolerance", () => {
    // 1500 -> 1470 (adjacent gap -30, fine) -> 1500 (adjacent gap 30, fine)
    // -> 1525 (adjacent gap 25, fine) but position 2 (1470) vs position 4
    // (1525) is a 55-point gap, over the 35-point team tolerance.
    const arrangement = [
      player("a", 1500),
      player("b", 1470),
      player("c", 1500),
      player("d", 1525),
    ];
    expect(isValidArrangement(arrangement, [4])).toBe(false);
  });

  it("groups by teams of 3 when teamSizes says so, instead of 4", () => {
    // a, b, c gaps to each other are all small (fine under either tolerance).
    // d is 40 points above c: over the 35-point *team* tolerance, but within
    // the 50-point *club* tolerance.
    const players = [player("a", 1500), player("b", 1490), player("c", 1480), player("d", 1520)];
    // [4]: all one team, so c-d's 40-point gap violates the team tolerance.
    expect(isValidArrangement(players, [4])).toBe(false);
    // [3, 1]: d is alone in its own team, so c-d is judged by the wider club tolerance instead.
    expect(isValidArrangement(players, [3, 1])).toBe(true);
  });

  it("supports mixed team sizes in one arrangement (a smaller trailing team)", () => {
    // Two 4-man teams, then a 3-man team. The 3-man team's weakest (g) vs the
    // 4-man team before it (team1, ending at d) is a club-boundary gap.
    const team0 = [player("a", 1600), player("b", 1590), player("c", 1580), player("d", 1570)];
    const team1 = [player("e", 1560), player("f", 1550), player("g", 1540), player("h", 1530)];
    const team2 = [player("i", 1520), player("j", 1510), player("k", 1500)];
    const teamSizes = [4, 4, 3];
    expect(isValidArrangement([...team0, ...team1, ...team2], teamSizes)).toBe(true);
    // Move k (weakest overall) to be much stronger: within its own 3-man
    // team it's now 90 points above i (over the 35-point team tolerance),
    // and 80 points above h (last of team1, over the 50-point club tolerance).
    const withStrongK = [
      ...team0,
      ...team1,
      player("i", 1520),
      player("j", 1510),
      player("k", 1610),
    ];
    expect(isValidArrangement(withStrongK, teamSizes)).toBe(false);
  });
});

describe("movePlayer", () => {
  it("moves an item to a new index, shifting the rest", () => {
    expect(movePlayer(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
    expect(movePlayer(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("doesn't mutate the input array", () => {
    const input = ["a", "b", "c"];
    movePlayer(input, 0, 2);
    expect(input).toEqual(["a", "b", "c"]);
  });
});

describe("legalTargetIndices", () => {
  const players = [player("a", 1500), player("b", 1470), player("c", 1440), player("d", 1410)];

  it("finds the only legal slot for the weakest player to move up to", () => {
    // Moving d (1410) to index 0 or 1 creates a >35 gap; index 2 (ahead of
    // the near-equal 1440) stays within tolerance.
    expect(legalTargetIndices(players, 3, [4])).toEqual([2]);
  });

  it("finds the only legal slot for the strongest player to move down to", () => {
    // Moving a (1500) past b (1470, gap 30) is fine; past c or d creates a
    // >35 gap against whoever it lands next to.
    expect(legalTargetIndices(players, 0, [4])).toEqual([1]);
  });
});

describe("buildTeams", () => {
  it("sorts by DTR descending and chunks into teams of 4", () => {
    const players = [
      player("a", 1200),
      player("b", 1800),
      player("c", 1500),
      player("d", 1700),
      player("e", 1600),
      player("f", 1300),
      player("g", 1400),
      player("h", 1100),
    ];
    const teams = buildTeams(players, [4, 4]);
    expect(teams).toHaveLength(2);
    expect(teams[0].players.map((p) => p.id)).toEqual(["b", "d", "e", "c"]);
    expect(teams[1].players.map((p) => p.id)).toEqual(["g", "f", "a", "h"]);
  });

  it("breaks DTR ties by name for a deterministic order", () => {
    const teams = buildTeams([player("Zed", 1500), player("Anna", 1500)], [4]);
    expect(teams[0].players.map((p) => p.id)).toEqual(["Anna", "Zed"]);
  });

  it("chunks into teams of 3 when teamSizes says so", () => {
    const players = [
      player("a", 1600),
      player("b", 1500),
      player("c", 1400),
      player("d", 1300),
      player("e", 1200),
      player("f", 1100),
    ];
    const teams = buildTeams(players, [3, 3]);
    expect(teams).toHaveLength(2);
    expect(teams[0].players.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(teams[1].players.map((p) => p.id)).toEqual(["d", "e", "f"]);
  });

  it("supports a mixed-size trailing team (e.g. one smaller Division 6 team)", () => {
    const players = [
      player("a", 1700),
      player("b", 1600),
      player("c", 1500),
      player("d", 1400),
      player("e", 1300),
      player("f", 1200),
      player("g", 1100),
      player("h", 1000),
      player("i", 900),
      player("j", 800),
      player("k", 700),
    ];
    const teams = buildTeams(players, [4, 4, 3]);
    expect(teams).toHaveLength(3);
    expect(teams[0].players.map((p) => p.id)).toEqual(["a", "b", "c", "d"]);
    expect(teams[1].players.map((p) => p.id)).toEqual(["e", "f", "g", "h"]);
    expect(teams[2].players.map((p) => p.id)).toEqual(["i", "j", "k"]);
  });
});
