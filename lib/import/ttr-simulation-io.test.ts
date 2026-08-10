import { describe, expect, it } from "vitest";
import { previousSeasonLabel } from "./ttr-simulation-io";

describe("previousSeasonLabel", () => {
  it("steps a SEASON_LABEL back by one year on both sides", () => {
    expect(previousSeasonLabel("2026-2027")).toBe("2025-2026");
    expect(previousSeasonLabel("2025-2026")).toBe("2024-2025");
  });
});
