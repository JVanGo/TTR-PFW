import { describe, expect, it } from "vitest";
import { diffRangliste, type ExistingPlayer, type RanglistEntry } from "./verbandsrangliste";

function entry(
  name: string,
  cls: RanglistEntry["class"],
  pfw: number,
  club: string | null = null,
): RanglistEntry {
  return {
    name,
    class: cls,
    pfw,
    club,
    nameKey: name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " "),
  };
}

function existingPlayer(
  id: string,
  nameKey: string,
  club: string | null = null,
  isActive = true,
): ExistingPlayer {
  return { id, name_key: nameKey, club, is_active: isActive };
}

describe("diffRangliste", () => {
  it("classifies rows as insert, update, or deactivate", () => {
    const parsed = [entry("Alice", "A1", 800), entry("Carol", "B2", 500)];
    const existing = [existingPlayer("id-alice", "alice"), existingPlayer("id-bob", "bob")];
    const diff = diffRangliste(parsed, existing);
    expect(diff.toUpdate.map((u) => u.id)).toEqual(["id-alice"]);
    expect(diff.toInsert.map((e) => e.name)).toEqual(["Carol"]);
    expect(diff.toDeactivate).toEqual(["id-bob"]);
  });

  it("leaves already-inactive players alone when they're still missing", () => {
    const parsed = [entry("Alice", "A1", 800)];
    const existing = [
      existingPlayer("id-alice", "alice"),
      existingPlayer("id-old", "old player", null, false),
    ];
    const diff = diffRangliste(parsed, existing);
    expect(diff.toDeactivate).toEqual([]);
  });

  it("matches case- and accent-insensitively", () => {
    const parsed = [entry("Hervé Reiland", "A2", 669)];
    const existing = [existingPlayer("id-h", "herve reiland")];
    const diff = diffRangliste(parsed, existing);
    expect(diff.toUpdate).toHaveLength(1);
    expect(diff.toInsert).toHaveLength(0);
  });

  it("disambiguates two different people sharing a name by club", () => {
    const parsed = [
      entry("Tom Schmit", "B2", 220, "Sandweiler"),
      entry("Tom Schmit", "B3", 227, "Altwis-Gaasp."),
    ];
    const existing = [existingPlayer("id-sandweiler", "tom schmit", "Sandweiler")];
    const diff = diffRangliste(parsed, existing);

    // The Sandweiler one updates the existing row; the Altwis-Gaasp. one is a
    // different, previously-unseen person and must be inserted, not merged.
    expect(diff.toUpdate.map((u) => u.id)).toEqual(["id-sandweiler"]);
    expect(diff.toInsert.map((e) => e.club)).toEqual(["Altwis-Gaasp."]);
  });

  it("matches a name with only one existing candidate even if the club doesn't match (e.g. a transfer)", () => {
    const parsed = [entry("Alice", "A1", 800, "New Club")];
    const existing = [existingPlayer("id-alice", "alice", "Old Club")];
    const diff = diffRangliste(parsed, existing);

    expect(diff.toUpdate.map((u) => u.id)).toEqual(["id-alice"]);
    expect(diff.toInsert).toHaveLength(0);
  });

  it("deactivates only the specific same-name player who actually dropped off, not their namesake", () => {
    const parsed = [entry("Tom Schmit", "B2", 220, "Sandweiler")];
    const existing = [
      existingPlayer("id-sandweiler", "tom schmit", "Sandweiler"),
      existingPlayer("id-altwis", "tom schmit", "Altwis-Gaasp."),
    ];
    const diff = diffRangliste(parsed, existing);

    expect(diff.toUpdate.map((u) => u.id)).toEqual(["id-sandweiler"]);
    expect(diff.toDeactivate).toEqual(["id-altwis"]);
  });
});
