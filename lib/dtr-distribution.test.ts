import { describe, expect, it } from "vitest";
import { bucketizeDtr } from "./dtr-distribution";

describe("bucketizeDtr", () => {
  it("returns an empty array for no values", () => {
    expect(bucketizeDtr([])).toEqual([]);
  });

  it("groups values into 100-point bins by their floor", () => {
    const buckets = bucketizeDtr([1000, 1050, 1099, 1100]);
    expect(buckets).toEqual([
      { start: 1000, end: 1100, count: 3 },
      { start: 1100, end: 1200, count: 1 },
    ]);
  });

  it("fills in an empty bin between two populated ones", () => {
    const buckets = bucketizeDtr([1000, 1250]);
    expect(buckets).toEqual([
      { start: 1000, end: 1100, count: 1 },
      { start: 1100, end: 1200, count: 0 },
      { start: 1200, end: 1300, count: 1 },
    ]);
  });

  it("handles a single value", () => {
    expect(bucketizeDtr([1234])).toEqual([{ start: 1200, end: 1300, count: 1 }]);
  });
});
