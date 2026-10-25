import { describe, expect, it } from "vitest";
import {
  buildTeams,
  isValidArrangement,
  legalTargetIndices,
  movePlayer,
  startingOrder,
  toleranceTierFor,
  type LineupPlayer,
} from "./lineup";

function player(id: string, dtr: number, opts: Partial<LineupPlayer> = {}): LineupPlayer {
  return { id, name: id, dtr, isYouth: false, ageCategory: null, ...opts };
}

describe("toleranceTierFor", () => {
  it("is base when neither player is youth", () => {
    expect(toleranceTierFor(player("a", 1500), player("b", 1500))).toBe("base");
  });

  it("is youth if either player is youth", () => {
    expect(toleranceTierFor(player("a", 1500, { isYouth: true }), player("b", 1500))).toBe("youth");
    expect(toleranceTierFor(player("a", 1500), player("b", 1500, { isYouth: true }))).toBe("youth");
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

  it("widens tolerance to 70/85 when either player is youth", () => {
    expect(
      isValidArrangement([player("weak", 1430, { isYouth: true }), player("strong", 1500)], [4]),
    ).toBe(true); // gap 70
    expect(
      isValidArrangement([player("weak", 1429, { isYouth: true }), player("strong", 1500)], [4]),
    ).toBe(false); // gap 71
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

  it("doesn't let a youth player's tolerance stretch an adult's own range after a move", () => {
    // Beetebuerg-P, 2026-10-20: Radoslaw may only drop to 2nd in Team 1.
    const sorted = [
      player("REKAWEK Radoslaw", 1736),
      player("CLOOS Steve", 1705),
      player("SUNNEN Jean-Paul", 1697),
      player("HAMROUNI Slim", 1694),
      player("WALDBILLIG Francis", 1681),
      player("REKAWEK Jan", 1675, { isYouth: true }),
      player("ZUANG Max", 1674),
      player("VAN GOIDSENOVEN Jeff", 1655),
    ];
    expect(legalTargetIndices(sorted, 0, [4, 4])).toEqual([1]);
    // Jan may still move to the top, pushing Radoslaw to 2nd...
    expect(legalTargetIndices(sorted, 5, [4, 4])).toContain(0);
    // ...but from there Radoslaw can only go back up, not further down.
    const janFirst = movePlayer(sorted, 5, 0);
    expect(legalTargetIndices(janFirst, 1, [4, 4])).toEqual([0]);
  });

  describe("with adjacent-only (NL1–NL3) teams", () => {
    // Gaps far beyond any tolerance, so only the adjacency rule can allow a move.
    const lineup = [
      player("a", 2000),
      player("b", 1900),
      player("c", 1800),
      player("d", 1700),
      player("e", 1600),
      player("f", 1500),
      player("g", 1490),
      player("h", 1480),
      player("i", 1470),
      player("j", 1460),
      player("k", 1450),
      player("l", 1440),
    ];

    it("lets #1 swap only with #2, and a middle spot only with its neighbors, ignoring DTR gaps", () => {
      expect(legalTargetIndices(lineup, 0, [4, 4, 4], 1)).toEqual([1]);
      expect(legalTargetIndices(lineup, 1, [4, 4, 4], 1)).toEqual([0, 2]);
    });

    it("swaps across a boundary between two adjacent-only teams", () => {
      expect(legalTargetIndices(lineup, 3, [4, 4, 4], 2)).toEqual([2, 4]);
      expect(legalTargetIndices(lineup, 4, [4, 4, 4], 2)).toEqual([3, 5]);
    });

    it("never lets anyone drift more than one spot from their DTR-sorted position", () => {
      const swapped = movePlayer(lineup, 0, 1); // b, a, c, ...
      // a (now 2nd) can only go back up; c can't jump above a.
      expect(legalTargetIndices(swapped, 1, [4, 4, 4], 1)).toEqual([0]);
      expect(legalTargetIndices(swapped, 2, [4, 4, 4], 1)).toEqual([3]);
    });

    it("keeps the tolerance rule for the teams below, but no jumps into the adjacent-only teams", () => {
      // f (1500) still moves within tolerance among the lower teams (not
      // above e, 100 stronger), and has no route up into Team 1 at all.
      expect(legalTargetIndices(lineup, 5, [4, 4, 4], 1)).toEqual([6, 7, 8]);
      // e, right below Team 1, only gets the single adjacent swap upward.
      expect(legalTargetIndices(lineup, 4, [4, 4, 4], 1)).toEqual([3]);
    });

    describe("ordered by the frozen Verbandsrangliste", () => {
      // x was strongest on the snapshot but has dropped below y since.
      const roster = [
        player("w", 1900, { snapshotDtr: 1900 }),
        player("x", 1550, { snapshotDtr: 1850 }),
        player("u", 1800, { snapshotDtr: 1800 }),
        player("v", 1750, { snapshotDtr: 1700 }),
        player("y", 1700, { snapshotDtr: 1600 }),
        player("z", 1650, { snapshotDtr: 1500 }),
      ];

      it("fills and orders the NL spots by snapshot, the teams below by current DTR", () => {
        const order = startingOrder(roster, [4, 2], 1).map((p) => p.id);
        expect(order).toEqual(["w", "x", "u", "v", "y", "z"]);
        expect(buildTeams(roster, [4, 2], 1).map((t) => t.players.map((p) => p.id))).toEqual([
          ["w", "x", "u", "v"],
          ["y", "z"],
        ]);
      });

      it("ignores the snapshot without NL teams", () => {
        expect(startingOrder(roster, [4, 2]).map((p) => p.id)).toEqual([
          "w",
          "u",
          "v",
          "y",
          "z",
          "x",
        ]);
      });

      it("uses current DTR for a player not on the snapshot", () => {
        const newcomer = player("n", 1820, { snapshotDtr: null });
        expect(startingOrder([...roster, newcomer], [4, 3], 1).map((p) => p.id)).toEqual([
          "w",
          "x",
          "n",
          "u",
          "v",
          "y",
          "z",
        ]);
      });

      it("measures the one-spot limit against the snapshot order", () => {
        const order = startingOrder(roster, [4, 2], 1);
        expect(legalTargetIndices(order, 1, [4, 2], 1)).toEqual([0, 2]);
      });

      it("blocks the last NL player from swapping down if the team below would break tolerance", () => {
        // x's snapshot puts it last in the NL; swapped below y, its current
        // DTR 1550 in front of z (1650) breaks the 35-point team limit.
        const withX = (dtr: number) => [
          player("w", 1900, { snapshotDtr: 1900 }),
          player("u", 1850, { snapshotDtr: 1850 }),
          player("v", 1800, { snapshotDtr: 1800 }),
          player("x", dtr, { snapshotDtr: 1750 }),
          player("y", 1700, { snapshotDtr: 1600 }),
          player("z", 1650, { snapshotDtr: 1500 }),
        ];
        const dropped = startingOrder(withX(1550), [4, 2], 1);
        expect(dropped.map((p) => p.id)).toEqual(["w", "u", "v", "x", "y", "z"]);
        expect(legalTargetIndices(dropped, 3, [4, 2], 1)).toEqual([2]);
        // With a small enough drop, the same swap is allowed.
        expect(legalTargetIndices(startingOrder(withX(1680), [4, 2], 1), 3, [4, 2], 1)).toEqual([
          2, 4,
        ]);
      });
    });
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
