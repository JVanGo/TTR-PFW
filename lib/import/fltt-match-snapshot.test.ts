import { describe, expect, it } from "vitest";
import { parseFlttMatchSnapshot } from "./fltt-match-snapshot";

describe("parseFlttMatchSnapshot", () => {
  it("extracts ranking, performance, and points from the embedded JSON blob", () => {
    const raw =
      '{"score":1,"licence1":{"name":"DOS SANTOS COSTA Justin","licenceNumber":"28044"},"licence2":null,"performance":"110.00","points":0.5,"ranking":"D2","pointsTemp":0.5}';
    expect(parseFlttMatchSnapshot(raw, "28044")).toEqual({
      ranking: "D2",
      performance: 110,
      points: 0.5,
    });
  });

  it("returns performance/points as null when the blob omits them (individual/tournament rows)", () => {
    const raw =
      '{"score":3,"licence1":{"licenceNumber":"28306"},"licence2":null,"performance":"163.00","ranking":"C2","points":null,"pointsTemp":null}';
    expect(parseFlttMatchSnapshot(raw, "28306")).toEqual({
      ranking: "C2",
      performance: 163,
      points: null,
    });
  });

  it("returns null without a ranking field", () => {
    expect(parseFlttMatchSnapshot('{"performance":"110.00"}', "28044")).toBeNull();
  });

  it("returns null for blank, plain, or malformed cells", () => {
    expect(parseFlttMatchSnapshot("", "28044")).toBeNull();
    expect(parseFlttMatchSnapshot(null, "28044")).toBeNull();
    expect(parseFlttMatchSnapshot("3 - 1", "28044")).toBeNull();
    expect(parseFlttMatchSnapshot("{not json", "28044")).toBeNull();
  });

  it("returns null when the blob belongs to a different player", () => {
    const raw = '{"ranking":"D2","performance":"110.00","licence1":{"licenceNumber":"99999"}}';
    expect(parseFlttMatchSnapshot(raw, "28044")).toBeNull();
  });

  it("drops an out-of-range points value but keeps ranking/performance", () => {
    const raw = '{"ranking":"D2","performance":"110.00","points":99}';
    expect(parseFlttMatchSnapshot(raw, "28044")).toEqual({
      ranking: "D2",
      performance: 110,
      points: null,
    });
  });
});
