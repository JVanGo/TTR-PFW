import { describe, expect, it } from "vitest";
import { buildAgeCategoryUpdates, type AgeCategoryEntry } from "./age-categories";

function entry(name: string, ageCategory: AgeCategoryEntry["ageCategory"]): AgeCategoryEntry {
  return { name, nameKey: name.toLowerCase(), ageCategory };
}

function player(id: string, nameKey: string, ageCategory: string | null = null) {
  return { id, name_key: nameKey, age_category: ageCategory };
}

describe("buildAgeCategoryUpdates", () => {
  it("matches an export row to a player and sets their category", () => {
    const result = buildAgeCategoryUpdates(
      [entry("Alice", "Cadet")],
      [player("id-alice", "alice")],
    );
    expect(result.updates).toEqual([{ id: "id-alice", ageCategory: "Cadet" }]);
    expect(result.cleared).toEqual([]);
  });

  it("clears a player's category when they age out and drop off the export", () => {
    const result = buildAgeCategoryUpdates(
      [entry("Alice", "Cadet")],
      [player("id-alice", "alice"), player("id-bob", "bob", "Junior")],
    );
    expect(result.updates).toEqual([{ id: "id-alice", ageCategory: "Cadet" }]);
    expect(result.cleared).toEqual(["id-bob"]);
  });

  it("leaves already-adult players alone when they're still missing", () => {
    const result = buildAgeCategoryUpdates(
      [entry("Alice", "Cadet")],
      [player("id-alice", "alice"), player("id-carol", "carol", null)],
    );
    expect(result.cleared).toEqual([]);
  });

  it("moves a returning player between two youth categories without clearing them", () => {
    const result = buildAgeCategoryUpdates(
      [entry("Alice", "Junior")],
      [player("id-alice", "alice", "Cadet")],
    );
    expect(result.updates).toEqual([{ id: "id-alice", ageCategory: "Junior" }]);
    expect(result.cleared).toEqual([]);
  });
});
