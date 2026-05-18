import { describe, expect, it } from "vitest";
import { nameKey } from "./name-key";

describe("nameKey", () => {
  it("strips accents and lowercases", () => {
    expect(nameKey("Cédric Merchez")).toBe("cedric merchez");
    expect(nameKey("Hervé Reiland")).toBe("herve reiland");
  });

  it("collapses whitespace", () => {
    expect(nameKey("  Eric   GLOD ")).toBe("eric glod");
  });

  it("ignores casing and diacritics across formats", () => {
    expect(nameKey("Joannës, Olivier")).toBe(nameKey("Joannes, Olivier"));
    expect(nameKey("THOMAS KEINATH")).toBe(nameKey("Thomas Keinath"));
  });

  it("collides on the same key regardless of word order", () => {
    // FLTT match exports use "LASTNAME Firstname"; the Verbandsrangliste uses
    // "Firstname Lastname". Both should resolve to the same player.
    expect(nameKey("LAMA Jaime")).toBe(nameKey("Jaime Lama"));
    expect(nameKey("JOANNËS Olivier")).toBe(nameKey("Olivier Joannes"));
  });
});
