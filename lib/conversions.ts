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
// Only used for A1-B3 — the regression has no real data below that.
const REGRESSION_SLOPE = 0.596;
const REGRESSION_OFFSET = 587.68;

// Confirmed with Jeff (2026-08-07): the classement recalibration below raised
// C1's ceiling well past where the regression naturally put B3's floor,
// which would have let some C1 players outrank some B3 players. Shifting the
// whole regression up by a flat amount puts B3's floor exactly on C1's new
// ceiling instead — continuous, no overlap, no cliff.
// Dropped 175 -> 165 on 2026-08-08 to track the D2 anchor correction below
// (1000 -> 1025) — that raised every classement value including C1's
// ceiling, so the regression shift had to come down by the same 10 points
// to keep B3's floor lined up with it.
const REGRESSION_SHIFT = 165;

// A ceiling on the *estimate* only — a real player's TTR can still climb past
// this during the season simulation via actual match results, same as any
// other player. Confirmed with Jeff (2026-08-07).
const MAX_ESTIMATE = 2600;

// C1-D3 are estimated from classement points instead (see estimateTtrFromClassement).
const CLASSEMENT_LEVEL: Partial<Record<PlayerClass, number>> = {
  D3: 0,
  D2: 1,
  D1: 2,
  C3: 3,
  C2: 4,
  C1: 5,
};

// Each classement spans 17 points: -5,5 (about to drop a classement) to +11,5
// (about to be promoted). Stacking all six levels end to end gives one
// continuous scale (no cliffs between classes), anchored on two points:
// D2's 0 points is 1025 TTR (corrected 2026-08-08 — Jeff's original spec
// said 1000, which was a mistake), and C2's +6 points is 1325 TTR
// (confirmed with Jeff 2026-08-07).
const CLASSEMENT_SPAN = 17;
const ANCHOR_A_SCORE = 0 + CLASSEMENT_SPAN * CLASSEMENT_LEVEL.D2!; // D2, 0 points
const ANCHOR_A_TTR = 1025;
const ANCHOR_B_SCORE = 6 + CLASSEMENT_SPAN * CLASSEMENT_LEVEL.C2!; // C2, +6 points
const ANCHOR_B_TTR = 1325;
const CLASSEMENT_SCALE = (ANCHOR_B_TTR - ANCHOR_A_TTR) / (ANCHOR_B_SCORE - ANCHOR_A_SCORE);
// TTR at score 0 (D3's own 0 points), derived from the two anchors above.
const CLASSEMENT_ZERO_TTR = ANCHOR_A_TTR - ANCHOR_A_SCORE * CLASSEMENT_SCALE;

function estimateTtrFromClassement(kl: PlayerClass, points: number): number {
  const level = CLASSEMENT_LEVEL[kl]!;
  const score = points + CLASSEMENT_SPAN * level;
  return Math.round(CLASSEMENT_ZERO_TTR + score * CLASSEMENT_SCALE);
}

/** Whether estimateTtr() uses classement points (C1-D3) for this class, rather than PFW. */
export function usesClassementPoints(kl: PlayerClass): boolean {
  return kl in CLASSEMENT_LEVEL;
}

/**
 * Convert a Luxembourg FLTT player's rating to an estimated German TTR rating.
 *
 * A1-B3 use the PFW regression fit to 41 matched players (shifted up and
 * capped, see REGRESSION_SHIFT/MAX_ESTIMATE). C1-D3 use the player's
 * classement points instead (see estimateTtrFromClassement) — the regression
 * has no real data down there, and PFW-based estimates weren't reliable.
 * Returns null for C1-D3 players whose classement points haven't been
 * entered yet.
 */
export function estimateTtr(
  pfw: number,
  kl: PlayerClass,
  classementPoints: number | null,
): number | null {
  if (kl in CLASSEMENT_LEVEL) {
    return classementPoints == null ? null : estimateTtrFromClassement(kl, classementPoints);
  }
  const regressed = Math.round((pfw + REGRESSION_OFFSET) / REGRESSION_SLOPE) + REGRESSION_SHIFT;
  return Math.min(MAX_ESTIMATE, regressed);
}
