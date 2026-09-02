import { describe, expect, it } from "vitest";
import { levenshtein, newPlayerChecks, type PlayerRow } from "./new-player-checks";

function player(overrides: Partial<PlayerRow> & { id: string; name: string }): PlayerRow {
  return {
    nameKey: overrides.name.toLowerCase(),
    club: "Club A",
    class: null,
    ageCategory: null,
    ...overrides,
  };
}

describe("levenshtein", () => {
  it("is 0 for identical strings", () => {
    expect(levenshtein("alice smith", "alice smith")).toBe(0);
  });

  it("counts single-character edits", () => {
    expect(levenshtein("alice", "alicf")).toBe(1);
    expect(levenshtein("alice", "alic")).toBe(1);
  });
});

describe("newPlayerChecks", () => {
  it("finds nothing for a genuine new beginner with the expected class", () => {
    const players = new Map([
      ["new-adult", player({ id: "new-adult", name: "New Adult", class: "D2" })],
      [
        "new-youth",
        player({
          id: "new-youth",
          name: "New Youth",
          class: "D3",
          ageCategory: "Cadet",
        }),
      ],
    ]);
    const findings = newPlayerChecks(
      players,
      new Set(["new-adult", "new-youth"]),
      new Set(), // nobody carried a prior-season DTR
    );
    expect(findings).toEqual([]);
  });

  it("flags a new player with the exact same name+club as a departed player", () => {
    const players = new Map([
      ["old-id", player({ id: "old-id", name: "Jean Dupont", nameKey: "jean dupont" })],
      [
        "new-id",
        player({ id: "new-id", name: "Jean Dupont", nameKey: "jean dupont", class: "D2" }),
      ],
    ]);
    const findings = newPlayerChecks(players, new Set(["new-id"]), new Set(["old-id"]));
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe(
      "New player has the exact same name+club as a player missing this season",
    );
  });

  it("flags a new player whose name closely resembles a departed player at the same club", () => {
    const players = new Map([
      ["old-id", player({ id: "old-id", name: "Jean Dupont", nameKey: "jean dupont" })],
      [
        "new-id",
        player({ id: "new-id", name: "Jean Dupond", nameKey: "jean dupond", class: "D2" }),
      ],
    ]);
    const findings = newPlayerChecks(players, new Set(["new-id"]), new Set(["old-id"]));
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe(
      "New player's name closely resembles a departed player at the same club",
    );
  });

  it("does not flag a name resemblance across different clubs", () => {
    const players = new Map([
      [
        "old-id",
        player({ id: "old-id", name: "Jean Dupont", nameKey: "jean dupont", club: "Club A" }),
      ],
      [
        "new-id",
        player({
          id: "new-id",
          name: "Jean Dupond",
          nameKey: "jean dupond",
          club: "Club B",
          class: "D2",
        }),
      ],
    ]);
    const findings = newPlayerChecks(players, new Set(["new-id"]), new Set(["old-id"]));
    expect(findings).toEqual([]);
  });

  it("flags a new adult whose class isn't D2", () => {
    const players = new Map([["new-id", player({ id: "new-id", name: "New Adult", class: "C3" })]]);
    const findings = newPlayerChecks(players, new Set(["new-id"]), new Set());
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe("New player's class isn't the expected beginner default");
    expect(findings[0].detail).toContain("expected D2");
  });

  it("flags a new youth whose class isn't D3", () => {
    const players = new Map([
      ["new-id", player({ id: "new-id", name: "New Youth", class: "D2", ageCategory: "Poussin" })],
    ]);
    const findings = newPlayerChecks(players, new Set(["new-id"]), new Set());
    expect(findings).toHaveLength(1);
    expect(findings[0].detail).toContain("expected D3");
  });

  it("skips the class check when the class is unknown", () => {
    const players = new Map([["new-id", player({ id: "new-id", name: "New Adult", class: null })]]);
    const findings = newPlayerChecks(players, new Set(["new-id"]), new Set());
    expect(findings).toEqual([]);
  });

  it("ignores players who aren't new this season", () => {
    const players = new Map([
      ["returning-id", player({ id: "returning-id", name: "Returning Player", class: "B2" })],
    ]);
    const findings = newPlayerChecks(players, new Set(["returning-id"]), new Set(["returning-id"]));
    expect(findings).toEqual([]);
  });
});
