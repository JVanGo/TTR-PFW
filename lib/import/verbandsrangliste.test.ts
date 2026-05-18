import { describe, expect, it } from "vitest";
import { diffRangliste, type RanglistEntry } from "./verbandsrangliste";

function entry(name: string, cls: RanglistEntry["class"], pfw: number): RanglistEntry {
  return {
    name,
    class: cls,
    pfw,
    club: null,
    nameKey: name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/\s+/g, " "),
  };
}

describe("diffRangliste", () => {
  it("classifies rows as insert, update, or deactivate", () => {
    const parsed = [entry("Alice", "A1", 800), entry("Carol", "B2", 500)];
    const existing = [
      { id: "id-alice", name_key: "alice", is_active: true },
      { id: "id-bob", name_key: "bob", is_active: true },
    ];
    const diff = diffRangliste(parsed, existing);
    expect(diff.toUpdate.map((u) => u.id)).toEqual(["id-alice"]);
    expect(diff.toInsert.map((e) => e.name)).toEqual(["Carol"]);
    expect(diff.toDeactivate).toEqual(["id-bob"]);
  });

  it("leaves already-inactive players alone when they're still missing", () => {
    const parsed = [entry("Alice", "A1", 800)];
    const existing = [
      { id: "id-alice", name_key: "alice", is_active: true },
      { id: "id-old", name_key: "old player", is_active: false },
    ];
    const diff = diffRangliste(parsed, existing);
    expect(diff.toDeactivate).toEqual([]);
  });

  it("matches case- and accent-insensitively", () => {
    const parsed = [entry("Hervé Reiland", "A2", 669)];
    const existing = [{ id: "id-h", name_key: "herve reiland", is_active: true }];
    const diff = diffRangliste(parsed, existing);
    expect(diff.toUpdate).toHaveLength(1);
    expect(diff.toInsert).toHaveLength(0);
  });
});
