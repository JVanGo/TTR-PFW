import { describe, expect, it } from "vitest";
import { currentTeilrunde, snapshotDateFor } from "./verbandsrangliste";

describe("snapshotDateFor", () => {
  it("is 1 Aug of the start year and 1 Jan of the end year", () => {
    expect(snapshotDateFor("2026-2027", 1)).toBe("2026-08-01");
    expect(snapshotDateFor("2026-2027", 2)).toBe("2027-01-01");
  });
});

describe("currentTeilrunde", () => {
  it("switches on the snapshot dates themselves", () => {
    expect(currentTeilrunde("2026-2027", "2026-07-31")).toBeNull();
    expect(currentTeilrunde("2026-2027", "2026-08-01")).toBe(1);
    expect(currentTeilrunde("2026-2027", "2026-12-31")).toBe(1);
    expect(currentTeilrunde("2026-2027", "2027-01-01")).toBe(2);
  });
});
