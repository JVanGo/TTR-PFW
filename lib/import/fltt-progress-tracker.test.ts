import { describe, expect, it } from "vitest";
import { sanitizeFlttName } from "./fltt-progress-tracker";

describe("sanitizeFlttName", () => {
  it("replaces the corrupted ¬ character with a regular hyphen", () => {
    expect(sanitizeFlttName("MATEI¬GUZU Petrut")).toBe("MATEI-GUZU Petrut");
  });

  it("replaces every occurrence, not just the first", () => {
    expect(sanitizeFlttName("A¬B¬C")).toBe("A-B-C");
  });

  it("leaves already-clean names untouched", () => {
    expect(sanitizeFlttName("CALLANGAN Ioannis")).toBe("CALLANGAN Ioannis");
  });
});
