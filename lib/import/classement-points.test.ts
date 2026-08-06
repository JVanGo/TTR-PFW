import { describe, expect, it } from "vitest";
import { parseClassementPoints } from "./classement-points";

describe("parseClassementPoints", () => {
  it("extracts points from the embedded JSON blob", () => {
    const raw =
      '{"score":1,"licence1":{"name":"DOS SANTOS COSTA Justin","licenceNumber":"28044"},"licence2":null,"performance":"110.00","points":0.5,"ranking":"D2","pointsTemp":0.5}';
    expect(parseClassementPoints(raw, "28044")).toBe(0.5);
  });

  it("strips a trailing human-readable delta before parsing", () => {
    const raw = '{"points":0.5,"licence1":{"licenceNumber":"28044"}} (+0.5)';
    expect(parseClassementPoints(raw, "28044")).toBe(0.5);
  });

  it("returns null for blank or plain (non-JSON) cells", () => {
    expect(parseClassementPoints("", "28044")).toBeNull();
    expect(parseClassementPoints(null, "28044")).toBeNull();
    expect(parseClassementPoints("3 - 1", "28044")).toBeNull();
  });

  it("returns null when the blob belongs to a different player", () => {
    const raw = '{"points":1,"licence1":{"licenceNumber":"99999"}}';
    expect(parseClassementPoints(raw, "28044")).toBeNull();
  });

  it("returns null for a value outside the -5.5..11.5 classement range", () => {
    expect(parseClassementPoints('{"points":12}', "28044")).toBeNull();
    expect(parseClassementPoints('{"points":-6}', "28044")).toBeNull();
  });

  it("accepts the range boundaries", () => {
    expect(parseClassementPoints('{"points":11.5}', "28044")).toBe(11.5);
    expect(parseClassementPoints('{"points":-5.5}', "28044")).toBe(-5.5);
  });
});
