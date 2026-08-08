import { describe, expect, it } from "vitest";
import { buildTeams, canSwap, toleranceTierFor, type LineupPlayer } from "./lineup";

function player(id: string, dtr: number, opts: Partial<LineupPlayer> = {}): LineupPlayer {
  return { id, name: id, dtr, isYouth: false, isKader: false, ...opts };
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

describe("canSwap", () => {
  it("allows a swap exactly at the base tolerance boundary, blocks one point over", () => {
    const a = player("a", 1500);
    expect(canSwap(a, player("b", 1465), true)).toBe(true); // gap 35, team
    expect(canSwap(a, player("b", 1464), true)).toBe(false); // gap 36, team
    expect(canSwap(a, player("b", 1450), false)).toBe(true); // gap 50, club
    expect(canSwap(a, player("b", 1449), false)).toBe(false); // gap 51, club
  });

  it("widens tolerance to 70/85 when either player is youth", () => {
    const a = player("a", 1500, { isYouth: true });
    expect(canSwap(a, player("b", 1430), true)).toBe(true); // gap 70, team
    expect(canSwap(a, player("b", 1429), true)).toBe(false); // gap 71, team
    expect(canSwap(a, player("b", 1415), false)).toBe(true); // gap 85, club
    expect(canSwap(a, player("b", 1414), false)).toBe(false); // gap 86, club
  });

  it("widens tolerance to 105/120 when either player is Kader", () => {
    const a = player("a", 1500, { isKader: true });
    expect(canSwap(a, player("b", 1395), true)).toBe(true); // gap 105, team
    expect(canSwap(a, player("b", 1394), true)).toBe(false); // gap 106, team
    expect(canSwap(a, player("b", 1380), false)).toBe(true); // gap 120, club
    expect(canSwap(a, player("b", 1379), false)).toBe(false); // gap 121, club
  });

  it("is symmetric — order of the two players passed in doesn't matter", () => {
    const a = player("a", 1500);
    const b = player("b", 1464);
    expect(canSwap(a, b, true)).toBe(canSwap(b, a, true));
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
    const teams = buildTeams(players, 2);
    expect(teams).toHaveLength(2);
    expect(teams[0].players.map((p) => p.id)).toEqual(["b", "d", "e", "c"]);
    expect(teams[1].players.map((p) => p.id)).toEqual(["g", "f", "a", "h"]);
  });

  it("breaks DTR ties by name for a deterministic order", () => {
    const teams = buildTeams([player("Zed", 1500), player("Anna", 1500)], 1);
    expect(teams[0].players.map((p) => p.id)).toEqual(["Anna", "Zed"]);
  });
});
