export const PLAYER_CLASSES = [
  "A1",
  "A2",
  "A3",
  "B1",
  "B2",
  "B3",
  "C1",
  "C2",
  "C3",
  "D1",
  "D2",
  "D3",
] as const;

export type PlayerClass = (typeof PLAYER_CLASSES)[number];

export function isPlayerClass(value: unknown): value is PlayerClass {
  return typeof value === "string" && (PLAYER_CLASSES as readonly string[]).includes(value);
}

// Regression PFW ≈ 0.596 × TTR − 587.68, fit to 41 matched players (all TTR ≳ 1200).
const REGRESSION_SLOPE = 0.596;
const REGRESSION_OFFSET = 587.68;

// Below this PFW the regression has no real data to back it up.
const BREAKPOINT_TTR = 1200;
const BREAKPOINT_PFW = REGRESSION_SLOPE * BREAKPOINT_TTR - REGRESSION_OFFSET;

// Anchor: the lowest-ranked D3 player is treated as TTR 700, a sensible floor
// for an actively-playing club member.
const FLOOR_PFW = 62.78;
const FLOOR_TTR = 700;

// Slope of the low-end segment, chosen so it meets the regression line exactly
// at BREAKPOINT_PFW instead of jumping to it — no more cliff at the class boundary.
const LOW_SLOPE = (BREAKPOINT_TTR - FLOOR_TTR) / (BREAKPOINT_PFW - FLOOR_PFW);

/**
 * Convert a Luxembourg FLTT PFW score to an estimated German TTR rating.
 *
 * Above BREAKPOINT_PFW (≈ TTR 1200) this is the regression fit directly.
 * Below it, a second line continues from the same point down to the TTR 700
 * floor at the lowest observed PFW — continuous, no jump, regardless of class.
 */
export function estimateTtr(pfw: number): number {
  if (pfw >= BREAKPOINT_PFW) {
    return Math.round((pfw + REGRESSION_OFFSET) / REGRESSION_SLOPE);
  }
  return Math.round(FLOOR_TTR + (pfw - FLOOR_PFW) * LOW_SLOPE);
}
